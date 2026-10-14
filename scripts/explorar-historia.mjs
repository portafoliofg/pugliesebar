import * as cheerio from 'cheerio';
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const get = async (u) => { try { const r = await fetch(u, { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(40000) }); return { s: r.status, t: await r.text() }; } catch (e) { return { s: 'ERR ' + e.message, t: '' }; } };
let r = await get('https://www.cac.bcr.com.ar/es/precios-de-pizarra/consultas');
let $ = cheerio.load(r.t);
$('input[name=period]').each((_, e) => console.log('period', $(e).attr('value'), $(e).attr('id'), $(`label[for="${$(e).attr('id')}"]`).text().trim()));
for (const q of ['product=13&type=pizarra&period=date&date_start=2026-09-01&date_end=2026-10-13',
                 'product=13&type=pizarra&date_start=2026-09-01&date_end=2026-10-13',
                 'product=13&type=pizarra&period=range&date_start=2026-09-01&date_end=2026-10-13']) {
  r = await get('https://www.cac.bcr.com.ar/es/precios-de-pizarra/consultas?' + q);
  $ = cheerio.load(r.t);
  const err = $('.messages, .alert').text().replace(/\s+/g, ' ').slice(0, 200);
  console.log('==', q, r.s, $('table').length, 'tablas', $('table tr').length, 'filas | err:', err);
  $('table tr').slice(0, 6).each((_, tr) => console.log('   ', $(tr).text().replace(/\s+/g, ' ').trim()));
  console.log('   … última:', $('table tr').last().text().replace(/\s+/g, ' ').trim());
}
const hoy = new Date().toISOString().slice(0, 10); const desde = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
r = await get(`https://apicem.matbarofex.com.ar/api/v2/closing-prices?product=&segment=Agropecuario&type=FUT&excludeEmptyVol=false&from=${desde}&to=${hoy}&page=1&pageSize=500&sortDir=DESC&market=ROFX`);
const j = JSON.parse(r.t); console.log('matba total', j.totalEntries, 'pageSize', j.pageSize);
