// =====================================================
// API PARA EL TABLERO WEB (GitHub Pages)
// -----------------------------------------------------
// Permite que la pestaña "Stock" del tablero use las mismas funciones
// que la app de Apps Script (getAppData, saveMovement, etc.).
//
// Configuración (una sola vez):
//   1. Extensiones → Apps Script → Configuración del proyecto →
//      Propiedades de la secuencia de comandos → Agregar propiedad:
//        API_KEY = una clave larga (ej.: 24 caracteres al azar)
//   2. Implementar → Nueva implementación → Aplicación web
//        Ejecutar como: Yo
//        Quién tiene acceso: Cualquier usuario
//   3. Copiá la URL que termina en /exec y pegala en la pestaña Stock
//      del tablero, junto con la clave.
//
// Sin la clave correcta no se puede leer ni modificar nada.
// =====================================================

function doPost(e) {
  let out;

  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const expected = PropertiesService.getScriptProperties().getProperty('API_KEY');

    if (!expected) {
      throw new Error('Falta configurar la propiedad API_KEY en el proyecto de Apps Script.');
    }

    if (String(req.key || '') !== expected) {
      out = { ok: false, auth: false, error: 'Clave incorrecta.' };
    } else {
      // Solo estas funciones se pueden llamar desde el tablero
      const permitidas = {
        getAppData: getAppData,
        getExtraData: getExtraData,
        getMovements: getMovements,
        saveMovement: saveMovement,
        saveDescription: saveDescription,
        cancelMovement: cancelMovement,
        addProduct: addProduct,
        deleteProduct: deleteProduct
      };

      const fn = permitidas[req.fn];
      if (!fn) throw new Error('Función no permitida: ' + req.fn);

      const args = Array.isArray(req.args) ? req.args : [];
      out = { ok: true, data: fn.apply(null, args) };
    }
  } catch (err) {
    out = { ok: false, error: err && err.message ? err.message : String(err) };
  }

  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}
