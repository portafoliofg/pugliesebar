// Valida la sintaxis de todos los .js del proyecto con `node --check`
// y que config.json sea JSON válido. Uso: npm run check

import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

async function listarJS(dir) {
  const salida = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) salida.push(...(await listarJS(ruta)));
    else if (e.name.endsWith('.js')) salida.push(ruta);
  }
  return salida;
}

let errores = 0;
for (const archivo of [...(await listarJS(join(RAIZ, 'src'))), ...(await listarJS(join(RAIZ, 'scripts'))), join(RAIZ, 'public', 'stock', 'api.js'), join(RAIZ, 'public', 'campos', 'kml.js'), join(RAIZ, 'public', 'campos', 'github.js'), join(RAIZ, 'public', 'campos', 'campos.js'), join(RAIZ, 'public', 'campos', 'pronostico.js'), join(RAIZ, 'public', 'campos', 'reporte.js'), join(RAIZ, 'public', 'campos', 'ndvi.js'), join(RAIZ, 'public', 'campos', 'general.js'), join(RAIZ, 'public', 'campos', 'agua.js'), join(RAIZ, 'public', 'campos', 'ensamble.js'), join(RAIZ, 'public', 'paisaje.js'), join(RAIZ, 'public', 'perspectiva.js'), join(RAIZ, 'public', 'campos', 'equipo.js'), join(RAIZ, 'public', 'campos', 'economia.js'), join(RAIZ, 'public', 'campos', 'margen.js'), join(RAIZ, 'public', 'campos', 'cuaderno.js'), join(RAIZ, 'public', 'campos', 'planilla.js'), join(RAIZ, 'public', 'campos', 'comercial.js')]) {
  try {
    execFileSync(process.execPath, ['--check', archivo], { stdio: 'pipe' });
    console.log(`ok  ${archivo.replace(RAIZ + '/', '')}`);
  } catch (err) {
    errores++;
    console.error(`ERR ${archivo}\n${err.stderr}`);
  }
}
try {
  JSON.parse(await readFile(join(RAIZ, 'config.json'), 'utf8'));
  console.log('ok  config.json');
} catch (err) {
  errores++;
  console.error(`ERR config.json: ${err.message}`);
}
process.exitCode = errores ? 1 : 0;
