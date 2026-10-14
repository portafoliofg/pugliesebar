import * as cheerio from 'cheerio';
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const get = async (u) => { try { const r = await fetch(u, { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(40000) }); return { s: r.status, t: await r.text() }; } catch (e) { return { s: 'ERR ' + e.message, t: '' }; } };
let r = await get('https://www.cac.bcr.com.ar/es/precios-de-pizarra/consultas');
let $ = cheerio.load(r.t);
$('form[action*="consultas"]').first().find('select, input').each((_, e) => console.log('campo', e.tagName, $(e).attr('name'), $(e).attr('type') || '', $(e).find('option').map((__, o) => $(o).attr('value') + '=' + $(o).text().trim()).get().slice(0, 12).join(' | ')));
console.log('method', $('form[action*="consultas"]').first().attr('method'));
for (const q of ['product=21&type=prices&date_start=01/09/2026&date_end=13/10/2026&period=day',
                 'product=21&type=1&date_start=2026-09-01&date_end=2026-10-13']) {
  r = await get('https://www.cac.bcr.com.ar/es/precios-de-pizarra/consultas?' + q);
  $ = cheerio.load(r.t);
  const c = $('body').text().replace(/\s+/g, ' ');
  console.log('== ', q, r.s, c.length, $('table').length, 'tablas |', c.slice(c.search(/Fecha|Precio/), c.search(/Fecha|Precio/) + 700));
}
// Matba paginado
const hoy = new Date().toISOString().slice(0, 10); const desde = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
for (const prod of ['', 'SOJ.ROS', 'SOJ']) {
  r = await get(`https://apicem.matbarofex.com.ar/api/v2/closing-prices?product=${prod}&segment=Agropecuario&type=FUT&excludeEmptyVol=false&from=${desde}&to=${hoy}&page=1&pageSize=500&sortDir=DESC&market=ROFX`);
  try { const j = JSON.parse(r.t); const d = j.data || j; console.log('matba', prod, d.length, JSON.stringify(Object.keys(j)), JSON.stringify(j.pagination || j.meta || {}).slice(0, 200), [...new Set(d.map((x) => x.symbol.split('/')[0]))].join(',')); } catch (e) { console.log('matba', prod, r.s, r.t.slice(0, 200)); }
}
