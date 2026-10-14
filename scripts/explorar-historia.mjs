import { readFileSync } from 'node:fs';
import { historiaPizarra, historiaCbot, historiaMatba } from '../src/fuentes/historia.js';
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const t0 = Date.now();
const [pz, cb, mt] = await Promise.allSettled([historiaPizarra(['soja', 'maiz', 'girasol', 'trigo'], 60, config), historiaCbot(config), historiaMatba(config, 60)]);
const res = (r) => r.status === 'fulfilled' ? r.value : { error: r.reason?.message };
for (const [n, r] of [['pizarra', pz], ['cbot', cb]]) { const v = res(r); for (const [g, p] of Object.entries(v)) console.log(n, g, Array.isArray(p) ? `${p.length} días · ${p[0]?.fecha} ${p[0]?.valor} … ${p.at(-1)?.fecha} ${p.at(-1)?.valor}` : p); }
const m = res(mt); console.log('matba', m.error || Object.entries(m).map(([k, p]) => `${k}:${p.length}`).join(' '));
console.log('tardó', Date.now() - t0, 'ms');
// v5
