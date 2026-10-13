// Guardado de los campos en el repositorio de GitHub.
//
// - data/campos.json: lista de campos (nombre, cultivo, campaña, hectáreas, notas y contorno).
// - data/campos/archivos/: copia de cada KML/KMZ que subís.
//
// Para leer no hace falta nada. Para guardar se usa un token de GitHub (fine-grained,
// con permiso "Contents: Read and write" solo sobre este repositorio), que queda
// guardado únicamente en este navegador.
(function () {
  'use strict';

  const CFG = Object.assign(
    { repo: '', rama: 'main', ruta: 'data/campos.json', carpeta: 'data/campos/archivos' },
    window.CAMPOS_CONFIG || {}
  );
  // Si no vino en la configuración, se deduce de la URL de GitHub Pages (usuario.github.io/repo)
  if (!CFG.repo && /\.github\.io$/.test(location.hostname)) {
    CFG.repo = location.hostname.split('.')[0] + '/' + location.pathname.split('/')[1];
  }

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
    if (status === 404) return 'No se encontró el repositorio o el archivo. Revisá que el token tenga acceso a ' + CFG.repo + '.';
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

  /** Lee data/campos.json. Prueba la API de GitHub (al día) y, si falla, la copia publicada. */
  async function leer() {
    if (CFG.repo) {
      try {
        return await leerJSON(CFG.rama, { cache: 'no-store' });
      } catch (e) {
        if (e.status === 404) return vacio(); // todavía no hay campos guardados
        if (e.status === 401) throw e;
      }
    }
    // Copia que publica el workflow junto con la página (puede tener unas horas de atraso)
    try {
      const r = await fetch('campos.json?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch (e) {}
    return vacio();
  }

  /**
   * Guarda en un solo commit: aplica `cambiar(datosActuales)` a campos.json y sube los
   * archivos extra (copias de KML/KMZ). Si alguien guardó al mismo tiempo, reintenta.
   */
  async function guardar(cambiar, mensaje, archivos = []) {
    if (!CFG.repo) throw new Error('No se sabe en qué repositorio guardar (falta campos.repo en config.json).');
    if (!token()) throw Object.assign(new Error('Para guardar, conectá tu cuenta de GitHub.'), { sinToken: true });

    for (let intento = 0; intento < 3; intento++) {
      const ref = await gh(`/repos/${CFG.repo}/git/ref/heads/${encodeURIComponent(CFG.rama)}`, { cache: 'no-store' });
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
      if (!r.permissions || !r.permissions.push) throw new Error('El token no tiene permiso de escritura en ' + CFG.repo + '.');
      return true;
    } catch (e) {
      guardarLS(CLAVE_TOKEN, anterior);
      throw e;
    }
  }

  window.Repo = {
    config: CFG,
    tieneToken: () => !!token(),
    probarToken,
    olvidarToken: () => guardarLS(CLAVE_TOKEN, ''),
    leer,
    guardar
  };
})();
