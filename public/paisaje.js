// =====================================================
// SAMMARTINO · paisaje animado de fondo
// Capa fija detrás del contenido: cielo con sol (o luna y estrellas en modo oscuro),
// nubes y pájaros que cruzan, lomas con surcos, un molino que gira y espigas que se mecen.
// Todo es SVG + CSS (transformaciones), liviano. Con "reducir movimiento" queda quieto.
// Se usa en el tablero, los reportes y el stock: <script src="paisaje.js" defer></script>
// =====================================================
(function () {
  'use strict';
  if (document.getElementById('paisaje')) return;

  // Números pseudoaleatorios fijos (el paisaje es siempre el mismo)
  let semilla = 7;
  const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);

  const W = 1600, H = 900;

  // Espigas de primer plano
  function espiga(x, base, alto, escala) {
    const g = [];
    const tope = base - alto;
    for (let k = 0; k < 6; k++) {
      const y = tope + 6 + k * 7.5 * escala;
      g.push(`<ellipse cx="${(x - 3.2 * escala).toFixed(1)}" cy="${y.toFixed(1)}" rx="${(2.3 * escala).toFixed(1)}" ry="${(4.6 * escala).toFixed(1)}" transform="rotate(-28 ${(x - 3.2 * escala).toFixed(1)} ${y.toFixed(1)})"/>`);
      g.push(`<ellipse cx="${(x + 3.2 * escala).toFixed(1)}" cy="${(y + 2).toFixed(1)}" rx="${(2.3 * escala).toFixed(1)}" ry="${(4.6 * escala).toFixed(1)}" transform="rotate(28 ${(x + 3.2 * escala).toFixed(1)} ${(y + 2).toFixed(1)})"/>`);
    }
    g.push(`<ellipse cx="${x}" cy="${(tope - 1).toFixed(1)}" rx="${(2 * escala).toFixed(1)}" ry="${(4.4 * escala).toFixed(1)}"/>`);
    const dur = (3.6 + azar() * 2.4).toFixed(2);
    const ret = (-azar() * 5).toFixed(2);
    return `<g class="pz-espiga" style="transform-origin:${x}px ${base}px;animation-duration:${dur}s;animation-delay:${ret}s">
      <path d="M${x} ${base} Q${x + 2} ${base - alto / 2} ${x} ${tope + 4}" class="pz-tallo"/>${g.join('')}</g>`;
  }
  const espigas = [];
  for (let i = 0; i < 46; i++) {
    const x = Math.round(i * (W / 45) + (azar() - 0.5) * 22);
    const escala = 0.8 + azar() * 0.6;
    espigas.push(espiga(x, H + 6, 70 + azar() * 70, escala));
  }

  // Surcos sobre la loma cercana (líneas que convergen hacia el horizonte)
  const surcos = [];
  for (let i = -14; i <= 30; i++) {
    const xb = 800 + i * 70;
    surcos.push(`<path d="M${xb} ${H} Q${(xb + 1050) / 2} ${H - 90} ${1050 + i * 9} 668"/>`);
  }

  // Estrellas (modo oscuro)
  const estrellas = [];
  for (let i = 0; i < 70; i++) {
    estrellas.push(`<circle cx="${(azar() * W).toFixed(0)}" cy="${(azar() * 430).toFixed(0)}" r="${(0.6 + azar() * 1.4).toFixed(1)}" style="animation-delay:${(-azar() * 4).toFixed(2)}s"/>`);
  }

  const nube = (cls, x, y, s) => `<g class="pz-nube ${cls}" transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="0" cy="0" rx="70" ry="26"/><ellipse cx="-42" cy="8" rx="44" ry="20"/><ellipse cx="46" cy="6" rx="52" ry="22"/><ellipse cx="6" cy="-18" rx="44" ry="28"/></g>`;

  const pajaro = (x, y) => `<path d="M${x - 10} ${y} q5 -6 10 0 q5 -6 10 0"/>`;

  // Molino australiano: torre de reticulado, rueda de aspas y veleta
  const molino = `<g class="pz-molino" transform="translate(1235 520)">
    <path class="pz-torre" d="M-26 150 L-6 0 M26 150 L6 0 M-21 112 L21 112 M-16 74 L16 74 M-11 38 L11 38 M-21 112 L16 74 M21 112 L-16 74 M-16 74 L11 38 M16 74 L-11 38"/>
    <g class="pz-rueda">${Array.from({ length: 18 }, (_, k) => `<path d="M0 0 L0 -40" transform="rotate(${k * 20})"/><path class="pz-aspa" d="M-4 -40 L4 -40 L3 -20 L-3 -20 Z" transform="rotate(${k * 20})"/>`).join('')}<circle r="5"/></g>
    <path class="pz-veleta" d="M2 -2 L44 -6 L52 -18 L52 6 L44 -2 Z"/>
    <path class="pz-tanque" d="M44 150 h70 v-22 h-70 Z"/></g>`;

  const svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
    <defs>
      <mask id="pz-luna"><rect x="1200" y="80" width="200" height="200" fill="#fff"/><circle cx="1314" cy="154" r="50" fill="#000"/></mask>
      <radialGradient id="pz-brillo"><stop offset="0" class="pz-sol-c"/><stop offset="1" class="pz-sol-c" stop-opacity="0"/></radialGradient>
      <linearGradient id="pz-loma1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="pz-l1a"/><stop offset="1" class="pz-l1b"/></linearGradient>
      <linearGradient id="pz-loma2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="pz-l2a"/><stop offset="1" class="pz-l2b"/></linearGradient>
      <linearGradient id="pz-loma3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="pz-l3a"/><stop offset="1" class="pz-l3b"/></linearGradient>
    </defs>
    <g class="pz-estrellas">${estrellas.join('')}</g>
    <g class="pz-astro"><circle class="pz-halo" cx="1290" cy="170" r="190" fill="url(#pz-brillo)"/><circle class="pz-disco" cx="1290" cy="170" r="54"/></g>
    <g class="pz-nubes">${nube('n1', 0, 150, 1.2)}${nube('n2', 0, 250, 0.8)}${nube('n3', 0, 95, 0.65)}${nube('n4', 0, 320, 1)}</g>
    <g class="pz-pajaros"><g class="pz-bandada">${pajaro(0, 0)}${pajaro(26, -12)}${pajaro(50, 4)}${pajaro(18, 16)}</g></g>
    <g class="pz-capa" data-prof="0.04"><path class="pz-loma1" d="M0 600 C200 540 380 560 560 590 S900 520 1100 560 S1420 600 1600 540 V${H} H0 Z"/></g>
    <g class="pz-capa" data-prof="0.08">${molino}<path class="pz-loma2" d="M0 660 C260 610 470 640 700 668 S1150 610 1350 640 S1520 660 1600 640 V${H} H0 Z"/>
      <g class="pz-arboles">${[180, 215, 240, 1480, 1510].map((x, k) => `<g transform="translate(${x} ${652 - (k % 2) * 6})"><path d="M0 0 V-26"/><ellipse cx="0" cy="-34" rx="${14 + (k % 3) * 3}" ry="${18 + (k % 2) * 4}"/></g>`).join('')}</g></g>
    <g class="pz-capa" data-prof="0.14"><path class="pz-loma3" d="M0 735 C300 690 520 720 800 745 S1300 700 1600 728 V${H} H0 Z"/><g class="pz-surcos">${surcos.join('')}</g></g>
    <g class="pz-trigal">${espigas.join('')}</g>
  </svg>`;

  const css = `
  #paisaje { position: fixed; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; opacity: var(--pz-opacidad, .62); }
  #paisaje svg { width: 100%; height: 100%; display: block; }
  :root { --pz-l1a: #cfe0a4; --pz-l1b: #e9efc9; --pz-l2a: #e8cf7c; --pz-l2b: #f3e3ac; --pz-l3a: #a9c76a; --pz-l3b: #c8dc93;
    --pz-surco: rgba(90, 110, 30, .22); --pz-espiga: #d9a520; --pz-tallo: #b8902a; --pz-nube: #ffffff; --pz-sol: #ffd54f; --pz-pajaro: #6e6253;
    --pz-molino: #7a6a55; --pz-arbol: #8fae4c; --pz-estrella: transparent; }
  ${['@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {', ':root[data-theme="dark"] {'].map((s) => `${s}
    --pz-l1a: #1f2a17; --pz-l1b: #19200f; --pz-l2a: #2b2615; --pz-l2b: #221e10; --pz-l3a: #233019; --pz-l3b: #1b2513;
    --pz-surco: rgba(181, 216, 74, .10); --pz-espiga: #8a6d1f; --pz-tallo: #6b5620; --pz-nube: #3a4150; --pz-sol: #f3ecd2; --pz-pajaro: #8b8577;
    --pz-molino: #4e4536; --pz-arbol: #2f3f20; --pz-estrella: #f4eee2; --pz-mascara: url(#pz-luna); --pz-halo: .3; --pz-opacidad: .75; }${s.startsWith('@media') ? ' }' : ''}`).join('\n')}
  #paisaje .pz-l1a { stop-color: var(--pz-l1a); } #paisaje .pz-l1b { stop-color: var(--pz-l1b); }
  #paisaje .pz-l2a { stop-color: var(--pz-l2a); } #paisaje .pz-l2b { stop-color: var(--pz-l2b); }
  #paisaje .pz-l3a { stop-color: var(--pz-l3a); } #paisaje .pz-l3b { stop-color: var(--pz-l3b); }
  #paisaje .pz-loma1 { fill: url(#pz-loma1); } #paisaje .pz-loma2 { fill: url(#pz-loma2); } #paisaje .pz-loma3 { fill: url(#pz-loma3); }
  #paisaje .pz-surcos path { fill: none; stroke: var(--pz-surco); stroke-width: 2.2; }
  #paisaje .pz-espiga { fill: var(--pz-espiga); animation: pz-mecer 4s ease-in-out infinite alternate; }
  #paisaje .pz-tallo { fill: none; stroke: var(--pz-tallo); stroke-width: 2; stroke-linecap: round; }
  #paisaje .pz-nube { fill: var(--pz-nube); opacity: .8; }
  #paisaje .pz-nubes .n1 { animation: pz-nube1 150s linear infinite; } #paisaje .pz-nubes .n2 { animation: pz-nube2 110s linear infinite; animation-delay: -40s; }
  #paisaje .pz-nubes .n3 { animation: pz-nube3 190s linear infinite; animation-delay: -120s; } #paisaje .pz-nubes .n4 { animation: pz-nube4 135s linear infinite; animation-delay: -80s; }
  #paisaje .pz-sol-c { stop-color: var(--pz-sol); } #paisaje .pz-disco { fill: var(--pz-sol); }
  #paisaje .pz-halo { transform-origin: 1290px 170px; animation: pz-latido 7s ease-in-out infinite; }
  #paisaje .pz-disco { mask: var(--pz-mascara, none); } #paisaje .pz-halo { opacity: var(--pz-halo, .55); }
  #paisaje .pz-estrellas circle { fill: var(--pz-estrella); animation: pz-titilar 3.5s ease-in-out infinite; }
  #paisaje .pz-pajaros path { fill: none; stroke: var(--pz-pajaro); stroke-width: 2; stroke-linecap: round; }
  #paisaje .pz-bandada { animation: pz-volar 55s linear infinite; animation-delay: -20s; }
  #paisaje .pz-bandada path { animation: pz-aletear .9s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: center; }
  #paisaje .pz-molino { stroke: var(--pz-molino); fill: none; stroke-width: 3; stroke-linecap: round; }
  #paisaje .pz-rueda { animation: pz-girar 9s linear infinite; } #paisaje .pz-rueda path { stroke-width: 2; } #paisaje .pz-rueda .pz-aspa, #paisaje .pz-rueda circle { fill: var(--pz-molino); }
  #paisaje .pz-veleta, #paisaje .pz-tanque { fill: var(--pz-molino); stroke: none; }
  #paisaje .pz-arboles path { stroke: var(--pz-molino); stroke-width: 3; } #paisaje .pz-arboles ellipse { fill: var(--pz-arbol); }
  #paisaje .pz-capa { will-change: transform; }
  @keyframes pz-mecer { from { transform: rotate(-3.5deg); } to { transform: rotate(4deg); } }
  @keyframes pz-nube1 { from { transform: translate(-260px, 150px) scale(1.2); } to { transform: translate(1900px, 150px) scale(1.2); } }
  @keyframes pz-nube2 { from { transform: translate(-200px, 250px) scale(.8); } to { transform: translate(1850px, 250px) scale(.8); } }
  @keyframes pz-nube3 { from { transform: translate(-180px, 95px) scale(.65); } to { transform: translate(1820px, 95px) scale(.65); } }
  @keyframes pz-nube4 { from { transform: translate(-240px, 320px) scale(1); } to { transform: translate(1880px, 320px) scale(1); } }
  @keyframes pz-volar { from { transform: translate(-120px, 260px); } 50% { transform: translate(800px, 200px); } to { transform: translate(1750px, 240px); } }
  @keyframes pz-aletear { from { transform: scaleY(1); } to { transform: scaleY(.45); } }
  @keyframes pz-girar { to { transform: rotate(360deg); } }
  @keyframes pz-latido { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
  @keyframes pz-titilar { 0%, 100% { opacity: .9; } 50% { opacity: .25; } }
  @media (prefers-reduced-motion: reduce) { #paisaje * { animation: none !important; } }
  @media print { #paisaje { display: none; } }`;

  const estilo = document.createElement('style');
  estilo.textContent = css;
  document.head.appendChild(estilo);
  const capa = document.createElement('div');
  capa.id = 'paisaje';
  capa.innerHTML = svg;
  document.body.prepend(capa);

  // Paralaje suave al desplazarse (las lomas cercanas se mueven más que las lejanas)
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const capas = Array.from(capa.querySelectorAll('.pz-capa'));
    let pendiente = false;
    addEventListener('scroll', () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => {
        const y = Math.min(scrollY, 2000);
        capas.forEach((c) => { c.style.transform = `translateY(${(y * Number(c.dataset.prof)).toFixed(1)}px)`; });
        pendiente = false;
      });
    }, { passive: true });
  }
})();
