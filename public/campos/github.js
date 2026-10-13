// Guardado de los campos en un repositorio PRIVADO de GitHub.
//
// - data/campos.json: lista de campos (nombre, cultivo, campaña, hectáreas, notas y contorno).
// - data/campos/archivos/: copia de cada KML/KMZ que subís.
//
// Como el repositorio es privado, para ver y para guardar hace falta un token de GitHub
// (fine-grained, con permiso "Contents: Read and write" solo sobre ese repositorio).
// El token queda guardado únicamente en este navegador. La página pública nunca
// contiene los datos de los campos.
(function () {
  'use strict';

  const CFG = Object.assign(
    { repo: '', rama: 'main', ruta: 'data/campos.json', carpeta: 'data/campos/archivos' },
    window.CAMPOS_CONFIG || {}
  );

  const API = 'https://api.github.com';
  const CLAVE_TOKEN = 'campos-github-token';
  const leerLS = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const guardarLS = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} };

  const token = () => leerLS(CLAVE_TOKEN);

  async function gh(ruta, opciones = {}) {
    const headers = Object.assign({ Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, opciones.headers || {});
    if (token()) headers.Authorization = 'Bearer ' + token();
    const res = await fetch(API + ruta, Object.assign({}, opciones, { headers }));
    if (!res.ok) {
      let detalle = '';
      try { detalle = (await res.json()).message || ''; } catch (e) {}
      const err = new Error(mensajeError(res.status, detalle));
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  function mensajeError(status, detalle) {
    if (status === 401) return 'El token de GitHub no es válido o venció. Cargá uno nuevo con el botón "GitHub".';
    if (status === 403) return 'El token no tiene permiso para escribir en el repositorio (necesita "Contents: Read and write"). ' + detalle;
    if (status === 404) return 'No se encontró el repositorio privado ' + CFG.repo + ', o el token no tiene acceso a él. Revisá que exista y que el token lo tenga elegido en "Repository access".';
    if (status === 409 || status === 422) return 'Alguien guardó cambios al mismo tiempo. Probá de nuevo.';
    return 'GitHub respondió HTTP ' + status + (detalle ? ': ' + detalle : '');
  }

  // Base64 de texto UTF-8 o de bytes
  function aBase64(datos) {
    const bytes = typeof datos === 'string' ? new TextEncoder().encode(datos) : new Uint8Array(datos);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function deBase64(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  const vacio = () => ({ actualizado: null, campos: [] });

  // Lee campos.json en una referencia (rama o commit). Los archivos de más de 1 MB
  // no traen el contenido en la API de contents: en ese caso se pide el blob.
  async function leerJSON(ref, extra) {
    const r = await gh(`/repos/${CFG.repo}/contents/${CFG.ruta}?ref=${encodeURIComponent(ref)}`, extra);
    const b64 = r.content || (await gh(`/repos/${CFG.repo}/git/blobs/${r.sha}`)).content;
    return JSON.parse(deBase64(b64));
  }

  const sinToken = () => Object.assign(new Error('Tus campos están en un repositorio privado: conectá tu cuenta de GitHub para verlos.'), { sinToken: true });

  /** Lee data/campos.json del repositorio privado. Sin token no se puede leer. */
  async function leer() {
    if (!CFG.repo) throw new Error('Falta configurar el repositorio privado de los campos (campos.repo en config.json).');
    if (!token()) throw sinToken();
    try {
      return await leerJSON(CFG.rama, { cache: 'no-store' });
    } catch (e) {
      // Repositorio vacío o todavía sin campos guardados
      if (e.status === 404 || e.status === 409) {
        await gh(`/repos/${CFG.repo}`); // si el repositorio no existe o no hay acceso, esto da el error correcto
        return vacio();
      }
      throw e;
    }
  }

  // Un repositorio recién creado sin archivos no tiene rama: se crea con el primer campos.json
  async function inicializar() {
    await gh(`/repos/${CFG.repo}/contents/${CFG.ruta}`, {
      method: 'PUT',
      body: JSON.stringify({ message: 'Campos: crear data/campos.json', content: aBase64(JSON.stringify(vacio(), null, 1) + '\n'), branch: CFG.rama })
    });
  }

  /**
   * Guarda en un solo commit: aplica `cambiar(datosActuales)` a campos.json y sube los
   * archivos extra (copias de KML/KMZ). Si alguien guardó al mismo tiempo, reintenta.
   */
  async function guardar(cambiar, mensaje, archivos = [], borrar = []) {
    if (!CFG.repo) throw new Error('No se sabe en qué repositorio guardar (falta campos.repo en config.json).');
    if (!token()) throw sinToken();

    for (let intento = 0; intento < 3; intento++) {
      let ref;
      try {
        ref = await gh(`/repos/${CFG.repo}/git/ref/heads/${encodeURIComponent(CFG.rama)}`, { cache: 'no-store' });
      } catch (e) {
        if (e.status !== 404 && e.status !== 409) throw e;
        await inicializar();
        ref = await gh(`/repos/${CFG.repo}/git/ref/heads/${encodeURIComponent(CFG.rama)}`, { cache: 'no-store' });
      }
      const base = await gh(`/repos/${CFG.repo}/git/commits/${ref.object.sha}`);

      // Datos actuales del commit más reciente
      let actual = vacio();
      try {
        actual = await leerJSON(ref.object.sha);
      } catch (e) { if (e.status !== 404) throw e; }

      const nuevo = cambiar(actual);
      nuevo.actualizado = new Date().toISOString();

      const blobs = [{ path: CFG.ruta, contenido: JSON.stringify(nuevo, null, 1) + '\n' }].concat(
        archivos.map((a) => ({ path: `${CFG.carpeta}/${a.nombre}`, contenido: a.datos }))
      );
      const tree = [];
      for (const b of blobs) {
        const blob = await gh(`/repos/${CFG.repo}/git/blobs`, {
          method: 'POST', body: JSON.stringify({ content: aBase64(b.contenido), encoding: 'base64' })
        });
        tree.push({ path: b.path, mode: '100644', type: 'blob', sha: blob.sha });
      }
      // Archivos a eliminar (sha null en el árbol nuevo)
      for (const ruta of borrar) tree.push({ path: ruta, mode: '100644', type: 'blob', sha: null });
      const arbol = await gh(`/repos/${CFG.repo}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: base.tree.sha, tree }) });
      const commit = await gh(`/repos/${CFG.repo}/git/commits`, {
        method: 'POST', body: JSON.stringify({ message: mensaje, tree: arbol.sha, parents: [ref.object.sha] })
      });
      try {
        await gh(`/repos/${CFG.repo}/git/refs/heads/${encodeURIComponent(CFG.rama)}`, {
          method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false })
        });
        return nuevo;
      } catch (e) {
        // Otro commit entró en el medio (por ejemplo, el workflow del tablero): se reintenta
        if (e.status !== 422 && e.status !== 409) throw e;
      }
    }
    throw new Error('No se pudo guardar porque el repositorio cambió varias veces seguidas. Probá de nuevo.');
  }

  /** Comprueba el token: que sea válido y que pueda escribir en el repositorio. */
  async function probarToken(nuevo) {
    const anterior = token();
    guardarLS(CLAVE_TOKEN, nuevo);
    try {
      const r = await gh(`/repos/${CFG.repo}`);
      if (!r.private) {
        throw new Error('El repositorio ' + CFG.repo + ' es público. Para que solo vos veas tus campos, cambialo a privado (Settings → General → Danger Zone → Change visibility).');
      }
      if (r.permissions && r.permissions.push === false) throw new Error('El token no tiene permiso de escritura en ' + CFG.repo + '.');
      return true;
    } catch (e) {
      guardarLS(CLAVE_TOKEN, anterior);
      throw e;
    }
  }

  /** Lista las copias de KML/KMZ guardadas (rutas completas). */
  async function listarArchivos() {
    if (!CFG.repo || !token()) return [];
    try {
      const r = await gh(`/repos/${CFG.repo}/contents/${CFG.carpeta}?ref=${encodeURIComponent(CFG.rama)}`, { cache: 'no-store' });
      return Array.isArray(r) ? r.filter((x) => x.type === 'file').map((x) => x.path) : [];
    } catch (e) {
      if (e.status === 404) return [];
      throw e;
    }
  }

  /** Lee cualquier JSON del repositorio privado (null si no existe). */
  async function leerRuta(ruta) {
    if (!CFG.repo || !token()) return null;
    const res = await fetch(`${API}/repos/${CFG.repo}/contents/${ruta}?ref=${encodeURIComponent(CFG.rama)}`, {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github.raw', 'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + token() }
    });
    if (res.status === 404) return null;
    if (!res.ok) throw Object.assign(new Error(mensajeError(res.status, '')), { status: res.status });
    return res.json();
  }

  /** Lee un archivo binario (imágenes NDVI) y devuelve una URL local para mostrarlo, o null. */
  async function leerBinario(ruta) {
    if (!CFG.repo || !token()) return null;
    const res = await fetch(`${API}/repos/${CFG.repo}/contents/${ruta}?ref=${encodeURIComponent(CFG.rama)}`, {
      headers: { Accept: 'application/vnd.github.raw', 'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + token() }
    });
    if (!res.ok) return null;
    return URL.createObjectURL(await res.blob());
  }

  /** Guarda un JSON suelto (por ejemplo config/alertas.json) en un commit. */
  async function guardarRuta(ruta, datos, mensaje) {
    if (!token()) throw sinToken();
    let sha;
    try { sha = (await gh(`/repos/${CFG.repo}/contents/${ruta}?ref=${encodeURIComponent(CFG.rama)}`, { cache: 'no-store' })).sha; }
    catch (e) { if (e.status !== 404) throw e; }
    await gh(`/repos/${CFG.repo}/contents/${ruta}`, {
      method: 'PUT',
      body: JSON.stringify({ message: mensaje, content: aBase64(JSON.stringify(datos, null, 1) + '\n'), branch: CFG.rama, sha })
    });
  }

  window.Repo = {
    leerRuta,
    leerBinario,
    guardarRuta,
    listarArchivos,
    config: CFG,
    tieneToken: () => !!token(),
    probarToken,
    olvidarToken: () => guardarLS(CLAVE_TOKEN, ''),
    leer,
    guardar
  };
})();
