// Equipo: quién usa la página en este navegador y con qué permisos.
//
// Roles:
//   dueño   → todo (cargar campos, editar, borrar, alertas, accesos).
//   carga   → ve todo y puede registrar labores, lluvias y análisis (no edita ni borra campos).
//   lectura → solo mira. Usa un token de GitHub de SOLO LECTURA: aunque quisiera, GitHub no le deja escribir.
//
// Las invitaciones son links con el token adentro (después de "#", que nunca viaja a ningún servidor).
// El registro de accesos (sin los tokens) queda en data/accesos.json del repositorio privado.
(function () {
  'use strict';

  const CLAVE = 'campos-equipo';
  const leerLS = () => { try { return JSON.parse(localStorage.getItem(CLAVE) || '{}'); } catch (e) { return {}; } };
  const guardarLS = (v) => { try { localStorage.setItem(CLAVE, JSON.stringify(v)); } catch (e) {} };

  const ROLES = {
    'dueño': { nombre: 'Dueño', icono: '🔑', texto: 'Acceso completo' },
    carga: { nombre: 'Carga de labores', icono: '📒', texto: 'Puede registrar labores, lluvias y análisis' },
    lectura: { nombre: 'Solo lectura', icono: '👁', texto: 'Puede ver todo, no puede cambiar nada' }
  };

  const yo = () => Object.assign({ rol: 'dueño', nombre: '' }, leerLS());
  const rol = () => yo().rol;
  const puede = (accion) => {
    const r = rol();
    if (r === 'dueño') return true;
    if (r === 'carga') return ['labores', 'lluvias', 'analisis'].includes(accion);
    return false;
  };
  function fijar(datos) { guardarLS(Object.assign(yo(), datos)); }
  function olvidar() { try { localStorage.removeItem(CLAVE); } catch (e) {} }

  // base64 que sirve en una URL
  const aB64 = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const deB64 = (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));

  function link(token, nombre, r) {
    const base = location.origin + location.pathname.replace(/[^/]*$/, '');
    return `${base}#acceso=${aB64({ t: token, n: nombre, r, repo: Repo.config.repo })}`;
  }

  /** Si la página se abrió con un link de invitación, lo devuelve (y lo borra de la barra de direcciones). */
  function leerInvitacion() {
    const m = location.hash.match(/acceso=([\w-]+)/);
    if (!m) return null;
    history.replaceState(null, '', location.pathname + location.search);
    try { return deB64(m[1]); } catch (e) { return { error: 'El link de invitación está incompleto o dañado.' }; }
  }

  // Registro de accesos (sin tokens): para que el dueño sepa a quién invitó
  async function accesos() { return ((await Repo.leerRuta('data/accesos.json').catch(() => null)) || {}).accesos || []; }
  async function modificarAccesos(cambiar, mensaje) {
    const actual = (await Repo.leerRuta('data/accesos.json').catch(() => null)) || { accesos: [] };
    actual.accesos = cambiar(actual.accesos || []);
    await Repo.guardarRuta('data/accesos.json', actual, mensaje);
    return actual.accesos;
  }

  window.Equipo = { ROLES, yo, rol, puede, fijar, olvidar, link, leerInvitacion, accesos, modificarAccesos };
})();
