// Exploración temporal: qué fuentes dan historia diaria de precios de granos
import * as cheerio from 'cheerio';
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const get = async (u, o = {}) => { try { const r = await fetch(u, { headers: { 'User-Agent': ua, ...(o.h || {}) }, signal: AbortSignal.timeout(30000) }); const t = await r.text(); return { s: r.status, t }; } catch (e) { return { s: 'ERR ' + e.message, t: '' }; } };
const cuerpo = (t) => cheerio.load(t)('body').text().replace(/\s+/g, ' ');
console.log('== Yahoo ZS=F 3mo');
let r = await get('https://query1.finance.yahoo.com/v8/finance/chart/ZS=F?range=3mo&interval=1d');
console.log(r.s, r.t.slice(0, 300));
console.log('== Matba 60 días');
const hoy = new Date().toISOString().slice(0, 10); const desde = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
r = await get(`https://apicem.matbarofex.com.ar/api/v2/closing-prices?product=&segment=Agropecuario&type=FUT&excludeEmptyVol=false&from=${desde}&to=${hoy}&page=1&pageSize=500&sortDir=DESC&market=ROFX`);
try { const j = JSON.parse(r.t); const d = j.data || j; console.log(r.s, 'items', d.length, 'fechas', [...new Set(d.map((x) => (x.dateTime || x.date || '').slice(0, 10)))].slice(0, 70).join(','), JSON.stringify(d[0]).slice(0, 300)); } catch (e) { console.log(r.s, r.t.slice(0, 300)); }
console.log('== Pizarra página actual');
r = await get('https://www.cac.bcr.com.ar/es/precios-de-pizarra');
const $ = cheerio.load(r.t);
console.log(r.s, cuerpo(r.t).slice(0, 600));
$('a').each((_, a) => { const h = $(a).attr('href') || ''; const tx = $(a).text().trim(); if (/hist|consult|fecha|anterior|serie|descarg|xls|csv/i.test(h + tx)) console.log('  link:', tx.slice(0, 60), '→', h); });
$('form, input, select').each((_, e) => console.log('  form:', e.tagName, $(e).attr('name'), $(e).attr('action') || '', $(e).attr('type') || ''));
for (const u of [
  'https://www.cac.bcr.com.ar/es/precios-de-pizarra?fecha=2026-10-01',
  'https://www.cac.bcr.com.ar/es/precios-de-pizarra/consultas',
  'https://www.cac.bcr.com.ar/es/precios-de-pizarra/consultas?fecha_desde=01%2F09%2F2026&fecha_hasta=13%2F10%2F2026&producto=1',
  'https://www.bcr.com.ar/es/mercados/mercado-de-granos/cotizaciones/cotizaciones-locales-0',
  'https://www.bcr.com.ar/es/mercados/mercado-de-granos/cotizaciones/cotizaciones-locales-0?fecha=01%2F10%2F2026',
]) { r = await get(u); const c = cuerpo(r.t); const i = c.search(/soja/i); console.log('==', u, r.s, c.length, '|', c.slice(Math.max(0, i - 200), i + 400)); const $$ = cheerio.load(r.t); $$('form').each((_, f) => console.log('  form action', $$(f).attr('action'), $$(f).find('input,select').map((__, x) => $$(x).attr('name')).get().join(','))); }
