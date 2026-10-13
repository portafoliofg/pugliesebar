// Conexión entre la página de stock (GitHub Pages) y Apps Script.
//
// La app original usa google.script.run, que solo existe dentro de Apps Script.
// Este archivo crea un google.script.run equivalente que llama a la API (doPost
// de Api.gs) con fetch, así el resto del código de la app funciona sin cambios.
//
// La URL de la API y la clave se guardan solo en este navegador (localStorage).

(function () {
  const KEY_URL = 'stock-api-url';
  const KEY_CLAVE = 'stock-api-clave';

  const leer = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const guardar = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} };

  // URL por defecto desde config.json (la escribe el generador en config.js)
  const urlConfig = (window.STOCK_API_URL || '').trim();

  let esperando = null; // promesa que se resuelve cuando el usuario carga la clave

  function credenciales() {
    return { url: leer(KEY_URL) || urlConfig, clave: leer(KEY_CLAVE) };
  }

  /** Muestra el formulario de conexión y devuelve una promesa con las credenciales. */
  function pedirCredenciales(mensaje) {
    if (esperando) return esperando;
    esperando = new Promise((resolver) => {
      const actual = credenciales();
      const capa = document.createElement('div');
      capa.className = 'api-capa';
      capa.innerHTML =
        '<form class="api-card" autocomplete="off">' +
          '<div class="api-ico" aria-hidden="true">🌾</div>' +
          '<h2>Conectar con la planilla</h2>' +
          '<p>El stock se lee y se guarda en tu Google Sheets a través de Apps Script. ' +
          'Ingresá la URL de la aplicación web y la clave (<code>API_KEY</code>).</p>' +
          (mensaje ? '<div class="api-error" role="alert"></div>' : '') +
          '<label>URL de la API<input name="url" type="url" required placeholder="https://script.google.com/macros/s/…/exec"></label>' +
          '<label>Clave<input name="clave" type="password" required placeholder="API_KEY"></label>' +
          '<button type="submit">Conectar</button>' +
          '<small>Se guarda solo en este navegador.</small>' +
        '</form>';
      if (mensaje) capa.querySelector('.api-error').textContent = mensaje;
      const form = capa.querySelector('form');
      form.url.value = actual.url;
      form.clave.value = actual.clave;
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        guardar(KEY_URL, form.url.value.trim());
        guardar(KEY_CLAVE, form.clave.value.trim());
        capa.remove();
        esperando = null;
        resolver(credenciales());
      });
      // Mientras se pide la clave, la pantalla de carga no tiene que tapar el formulario
      const intro = document.getElementById('startupLoader');
      if (intro) intro.classList.add('hide');
      document.body.appendChild(capa);
      setTimeout(() => (actual.url ? form.clave : form.url).focus(), 50);
    });
    return esperando;
  }

  async function llamar(fn, args) {
    let { url, clave } = credenciales();
    if (!url || !clave) ({ url, clave } = await pedirCredenciales());

    const res = await fetch(url, {
      method: 'POST',
      // text/plain evita la consulta previa de CORS, que Apps Script no responde
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn, args, key: clave }),
      redirect: 'follow'
    });
    if (!res.ok) throw new Error('La API respondió HTTP ' + res.status);

    let json;
    try { json = await res.json(); } catch (e) {
      throw new Error('La API no respondió JSON. Revisá que la implementación tenga acceso "Cualquier usuario".');
    }

    if (json.auth === false) {
      guardar(KEY_CLAVE, '');
      await pedirCredenciales('Clave incorrecta. Probá de nuevo.');
      return llamar(fn, args);
    }
    if (!json.ok) throw new Error(json.error || 'Error desconocido en la API');
    return json.data;
  }

  /** Imita la cadena google.script.run.withSuccessHandler(...).withFailureHandler(...).funcion(...) */
  function ejecutor(alExito, alFallar) {
    return new Proxy({}, {
      get(_, prop) {
        if (prop === 'withSuccessHandler') return (h) => ejecutor(h, alFallar);
        if (prop === 'withFailureHandler') return (h) => ejecutor(alExito, h);
        if (prop === 'withUserObject') return () => ejecutor(alExito, alFallar);
        return (...args) => {
          llamar(String(prop), args)
            .then((data) => alExito && alExito(data))
            .catch((err) => (alFallar ? alFallar(err) : console.error(err)));
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = { run: ejecutor(null, null) };

  // Botón para cambiar la conexión (se agrega a la barra superior de la app)
  window.stockApi = {
    reconectar() {
      guardar(KEY_CLAVE, '');
      pedirCredenciales().then(() => {
        if (typeof loadData === 'function') loadData(false);
        if (typeof loadExtra === 'function') loadExtra();
      });
    }
  };
  document.addEventListener('DOMContentLoaded', () => {
    const barra = document.querySelector('.top-actions');
    if (!barra) return;
    const b = document.createElement('button');
    b.className = 'btn';
    b.type = 'button';
    b.title = 'Cambiar la URL o la clave de la planilla';
    b.textContent = '🔑 Conexión';
    b.addEventListener('click', () => window.stockApi.reconectar());
    barra.insertBefore(b, barra.firstChild);
  });

  // Dentro del tablero (iframe) se marca la página para ajustar el diseño
  if (window.self !== window.top) document.documentElement.classList.add('embebido');
})();
