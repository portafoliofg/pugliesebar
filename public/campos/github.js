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

  // ---------- Caché local (IndexedDB, solo en este navegador) ----------
  // Los archivos del repositorio se muestran al instante desde la última copia y se revisan
  // en segundo plano con ETag (si no cambiaron, GitHub responde 304 sin mandar nada).
  // Si cambiaron, se avisa con el evento "repo:cambio" para que la página se redibuje.
  const Cache = (() => {
    let db = null;
    const abrir = () => db || (db = new Promise((ok) => {
      try {
        const r = indexedDB.open('sammartino-campos', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('archivos');
        r.onsuccess = () => ok(r.result);
        r.onerror = r.onblocked = () => ok(null);
      } catch (e) { ok(null); }
    }));
    const usar = async (modo, f) => {
      const d = await abrir();
      if (!d) return null;
      return new Promise((ok) => {
        try {
          const t = d.transaction('archivos', modo);
          const req = f(t.objectStore('archivos'));
          t.oncomplete = () => ok(req ? req.result : null);
          t.onerror = t.onabort = () => ok(null);
        } catch (e) { ok(null); }
      });
    };
    return {
      get: (k) => usar('readonly', (s) => s.get(k)),
      set: (k, v) => usar('readwrite', (s) => s.put(v, k)),
      borrar: (k) => usar('readwrite', (s) => s.delete(k)),
      limpiar: () => usar('readwrite', (s) => s.clear())
    };
  })();
  const claveCache = (ruta) => `${CFG.repo}@${CFG.rama}:${ruta}`;
  const enMemoria = new Map();   // ruta → datos ya revisados en esta carga de página
  const enVuelo = new Map();     // ruta → pedido en curso (no se repite el mismo pedido)
  const copia = (x) => (x == null ? x : structuredClone(x));

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
  async function leer(opciones) {
    if (!CFG.repo) throw new Error('Falta configurar el repositorio privado de los campos (campos.repo en config.json).');
    if (!token()) throw sinToken();
    try {
      const d = await leerRuta(CFG.ruta, opciones);
      if (d) return d;
      await gh(`/repos/${CFG.repo}`); // si el repositorio no existe o no hay acceso, esto da el error correcto
      return vacio();
    } catch (e) {
      // Repositorio vacío o todavía sin campos guardados
      if (e.status === 409) return vacio();
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
        recordar(CFG.ruta, nuevo);
        return nuevo;
      } catch (e) {
        // Otro commit entró en el medio (por ejemplo, el workflow del tablero): se reintenta
        if (e.status !== 422 && e.status !== 409) throw e;
      }
    }
    throw new Error('No se pudo guardar porque el repositorio cambió varias veces seguidas. Probá de nuevo.');
  }

  /** Comprueba el token: que sea válido y que pueda escribir en el repositorio. */
  async function probarToken(nuevo, { guardar = true } = {}) {
    const anterior = token();
    guardarLS(CLAVE_TOKEN, nuevo);
    try {
      const r = await gh(`/repos/${CFG.repo}`);
      if (!r.private) {
        throw new Error('El repositorio ' + CFG.repo + ' es público. Para que solo vos veas tus campos, cambialo a privado (Settings → General → Danger Zone → Change visibility).');
      }
      // Un token de solo lectura también es válido (acceso "solo lectura" del equipo). Para saber qué
      // permiso tiene de verdad se prueba crear un blob vacío: no toca ningún archivo y GitHub lo descarta.
      let escritura = true;
      try {
        await gh(`/repos/${CFG.repo}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: '', encoding: 'utf-8' }) });
      } catch (e) {
        if (e.status === 403 || e.status === 404) escritura = false; else throw e;
      }
      if (!guardar) guardarLS(CLAVE_TOKEN, anterior);   // solo se quería comprobarlo (invitaciones)
      return { escritura };
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

  // Pide el archivo a GitHub; con la ETag de la copia local, si no cambió responde 304 (rápido y sin gastar cupo)
  async function traer(ruta, previo) {
    const headers = { Accept: 'application/vnd.github.raw', 'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + token() };
    if (previo && previo.etag) headers['If-None-Match'] = previo.etag;
    const res = await fetch(`${API}/repos/${CFG.repo}/contents/${ruta}?ref=${encodeURIComponent(CFG.rama)}`, { cache: 'no-store', headers });
    if (res.status === 304 && previo) return { datos: previo.datos, cambio: false };
    let datos = null;
    if (res.status !== 404) {
      if (!res.ok) throw Object.assign(new Error(mensajeError(res.status, '')), { status: res.status });
      datos = await res.json();
    }
    const etag = res.status === 404 ? null : res.headers.get('ETag');
    const cambio = !previo || JSON.stringify(previo.datos) !== JSON.stringify(datos);
    Cache.set(claveCache(ruta), { etag, datos, t: Date.now() });
    enMemoria.set(ruta, datos);
    return { datos, cambio };
  }

  function revisar(ruta, previo) {
    if (!enVuelo.has(ruta)) {
      enVuelo.set(ruta, traer(ruta, previo).finally(() => enVuelo.delete(ruta)));
    }
    return enVuelo.get(ruta);
  }

  /** Lo que se acaba de guardar queda como copia local (así no se muestra una versión vieja). */
  function recordar(ruta, datos) {
    enMemoria.set(ruta, copia(datos));
    Cache.set(claveCache(ruta), { etag: null, datos: copia(datos), t: Date.now() });
  }

  /**
   * Lee cualquier JSON del repositorio privado (null si no existe).
   * Por defecto devuelve al instante la copia local y la revisa en segundo plano;
   * { fresco: true } espera la versión de GitHub (para leer-modificar-guardar).
   */
  async function leerRuta(ruta, { fresco = false } = {}) {
    if (!CFG.repo || !token()) return null;
    if (!fresco && enMemoria.has(ruta)) return copia(enMemoria.get(ruta));
    const previo = await Cache.get(claveCache(ruta));
    if (fresco || !previo) return copia((await revisar(ruta, previo)).datos);
    // Copia local al instante + revisión en segundo plano
    revisar(ruta, previo).then((r) => {
      if (r.cambio) window.dispatchEvent(new CustomEvent('repo:cambio', { detail: { ruta, datos: copia(r.datos) } }));
    }).catch((e) => window.dispatchEvent(new CustomEvent('repo:error', { detail: { ruta, error: e } })));
    return copia(previo.datos);
  }

  /** Lee un archivo binario (imágenes NDVI) y devuelve una URL local para mostrarlo, o null. */
  async function leerBinario(ruta) {
    if (!CFG.repo || !token()) return null;
    // Las imágenes no cambian (cada fecha es un archivo nuevo): se guardan en la caché local
    const k = claveCache('bin:' + ruta);
    const guardado = await Cache.get(k);
    if (guardado && guardado.blob) return URL.createObjectURL(guardado.blob);
    const res = await fetch(`${API}/repos/${CFG.repo}/contents/${ruta}?ref=${encodeURIComponent(CFG.rama)}`, {
      headers: { Accept: 'application/vnd.github.raw', 'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + token() }
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    Cache.set(k, { blob, t: Date.now() });
    return URL.createObjectURL(blob);
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
    recordar(ruta, datos);
  }

  /**
   * JSON de una API pública (pronósticos, etc.) guardado un rato en este navegador.
   * Dentro de `minutos` se usa la copia; si la API falla, también se usa la copia vieja.
   */
  async function web(url, minutos = 30) {
    const k = 'web:' + url;
    const c = await Cache.get(k);
    if (c && Date.now() - c.t < minutos * 6e4) return copia(c.datos);
    try {
      const r = await fetch(url);
      if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
      const datos = await r.json();
      Cache.set(k, { datos, t: Date.now() });
      return datos;
    } catch (e) {
      if (c) return copia(c.datos);
      throw e;
    }
  }

  window.Repo = {
    leerRuta,
    leerBinario,
    guardarRuta,
    listarArchivos,
    config: CFG,
    tieneToken: () => !!token(),
    probarToken,
    olvidarToken: () => { guardarLS(CLAVE_TOKEN, ''); enMemoria.clear(); Cache.limpiar(); },
    token,
    web,
    recordar,
    leer,
    guardar
  };
})();
