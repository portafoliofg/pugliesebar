// Pedidos HTTP con timeout y un reintento.
// Usa el fetch nativo de Node (no hace falta ninguna dependencia).

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 TableroAgro/1.0';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Decodifica respetando el charset (algunos sitios viejos, como el del Mercado
 * Agroganadero, responden en ISO-8859-1 / windows-1252 y no en UTF-8).
 */
function decodificar(buffer, contentType) {
  const bytes = new Uint8Array(buffer);
  let charset = (contentType || '').match(/charset=([^;]+)/i)?.[1]?.trim().toLowerCase();
  if (!charset) {
    // Buscamos <meta charset> en los primeros bytes del HTML
    const cabecera = new TextDecoder('latin1').decode(bytes.slice(0, 2048));
    charset = cabecera.match(/charset=["']?([\w-]+)/i)?.[1]?.toLowerCase();
  }
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/**
 * Hace un GET y devuelve el texto de la respuesta.
 * Reintenta una vez si falla (timeout, error de red o HTTP no 2xx).
 */
export async function obtenerTexto(url, { timeoutMs = 15000, headers = {}, reintentos = 1 } = {}) {
  let ultimoError;
  for (let intento = 0; intento <= reintentos; intento++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es-AR,es;q=0.9', ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
      return decodificar(await res.arrayBuffer(), res.headers.get('content-type'));
    } catch (err) {
      ultimoError = err;
      if (intento < reintentos) await esperar(2000);
    }
  }
  throw ultimoError;
}

/** Igual que obtenerTexto, pero parsea la respuesta como JSON. */
export async function obtenerJSON(url, opciones = {}) {
  const texto = await obtenerTexto(url, {
    ...opciones,
    headers: { Accept: 'application/json', ...(opciones.headers || {}) }
  });
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error(`Respuesta no es JSON válido en ${url}`);
  }
}
