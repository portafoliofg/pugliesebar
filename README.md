# Tablero Agro

Página con la información del día para el campo en Argentina (pizarra Rosario, Chicago, Matba-Rofex, dólar, clima, retenciones y noticias) el mapa de tus campos y el control de stock de la planilla de Google, organizados en pestañas.
GitHub Actions la genera sola de lunes a viernes y la publica en GitHub Pages.

## Cómo funciona

1. El workflow `.github/workflows/actualizar.yml` corre de lunes a viernes a las **08:55, 14:55, 20:55 y 02:55** (hora argentina).
2. Ejecuta `node src/index.js`, que consulta cada fuente por separado, actualiza `data/historico.json` y genera `public/index.html`.
3. Hace commit del histórico y de la página, y publica la carpeta `public/` en GitHub Pages.

El cron está en UTC: `55 5,11,17,23 * * 1-5`. Argentina es UTC-3 sin horario de verano, así que 08:55 → 11:55, 14:55 → 17:55, 20:55 → 23:55 y 02:55 → 05:55 UTC. Ninguna de las cuatro horas cruza la medianoche UTC, por eso los días (1-5, lunes a viernes) son los mismos en las dos zonas. GitHub puede atrasar unos minutos las ejecuciones programadas.

## Activar GitHub Pages (una sola vez)

1. En el repositorio, entrá a **Settings → Pages**.
2. En **Build and deployment → Source**, elegí **GitHub Actions**. No elijas "Deploy from a branch".
3. Andá a **Settings → Actions → General → Workflow permissions** y marcá **Read and write permissions**. El workflow necesita hacer commit del histórico.
4. Corré el workflow a mano una vez (ver abajo). Al terminar, la URL aparece en **Settings → Pages** y en el resumen de la ejecución. Suele ser `https://<tu-usuario>.github.io/<repositorio>/`.

## Ejecutar el workflow a mano

**Actions → Actualizar tablero → Run workflow** (rama `main`) → **Run workflow**.

## Abrir el tablero al iniciar Chrome

**Configuración → Al iniciar → Abrir una página o un conjunto de páginas específicas → Agregar una página nueva** y pegá la URL de GitHub Pages.
La página se recarga sola cada 30 minutos y le agrega `?t=...` a la URL para no quedarse con una copia vieja de la caché.

## Probar en local

Necesitás Node.js 22 o superior (el workflow usa Node 24 LTS).

```bash
npm ci            # instala dependencias (solo cheerio)
npm run check     # valida la sintaxis de todos los archivos con node --check
npm start         # busca los datos y genera public/index.html
```

Después abrí `public/index.html` en el navegador.
Ojo: la prueba local también actualiza `data/historico.json` y `data/ultimo.json`. Si no querés subir esos cambios, descartalos con `git checkout data public`.

## Pestaña Campos (KML/KMZ)

Mapa satelital con tus campos resaltados por cultivo. Para cada campo podés indicar nombre, cultivo, campaña, hectáreas declaradas y notas. La superficie del mapa se calcula sola a partir del polígono. El clima de la zona se trae de Open-Meteo: lluvia de los últimos 7 y 30 días, pronóstico de 7 días y alerta de helada.

**Los campos son privados.** No se guardan en este repositorio, que es público, sino en un repositorio **privado** aparte (gratis en GitHub), configurado en `config.json → campos.repo`. Allí van `data/campos.json` y una copia de cada KML/KMZ en `data/campos/archivos/`. La página publicada no contiene ningún dato de los campos: sin tu token, la pestaña muestra "Tus campos son privados".

Configuración (una sola vez):

1. Creá el repositorio en [github.com/new](https://github.com/new) con el nombre `campos-privados` y visibilidad **Private**. No hace falta agregarle archivos.
2. Creá un token en [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new):
   - **Repository access:** *Only select repositories* → `campos-privados`.
   - **Permissions → Repository permissions → Contents:** *Read and write*.
3. En la pestaña Campos tocá **Conectar GitHub** y pegá el token. Queda guardado solo en ese navegador; en otra compu o en el celular hay que pegarlo de nuevo.

Funciones:

- **Capas** (botón sobre el mapa): mapa base satelital, calles o relieve; colorear los campos por cultivo, campaña o provincia; mostrar u ocultar cada grupo; nombres de los lotes, límites y localidades, y radar de lluvia (RainViewer).
- **Filtros** por provincia, cultivo y campaña, y buscador. La provincia, el departamento y la localidad se detectan solos con la [API Georef](https://datosgobar.github.io/georef-ar-api/) del Gobierno argentino.
- **Selección múltiple**: con las casillas de la lista, con Ctrl + clic en el mapa, o con el botón "Seleccionar" en el celular. A los seleccionados les podés asignar cultivo y campaña de una vez, verlos en el mapa o eliminarlos.
- **Eliminar todos**: pide escribir ELIMINAR para confirmar y opcionalmente borra también las copias de los KML/KMZ.
- **Pronóstico por campo** (Open-Meteo): resumen con lluvia de los últimos 7 y 30 días, próximos 7 y 16 días, balance hídrico (lluvia − evapotranspiración) y ventanas para pulverizar; detalle de 48 horas; tabla de 16 días con viento, ráfagas, ET0 y UV; humedad y temperatura del suelo.

- **Reporte completo del campo** (botón 📊 en la ficha): se abre en una pestaña nueva y se puede imprimir o guardar en PDF, o descargar los datos en CSV. Incluye mapa satelital del lote, indicadores, análisis escrito automático y gráficos de lluvia mensual contra el promedio 1991–2020, lluvia acumulada desde la siembra, lluvia diaria, balance hídrico, anomalías, temperaturas máximas y mínimas, heladas y días de calor, grados-día, radiación y heliofanía, humedad del suelo por profundidad, propiedades del suelo (SoilGrids: textura, pH, materia orgánica, nitrógeno, CIC, densidad), rosa de los vientos, viento y ráfagas, pronóstico de 48 horas y tabla de 16 días. La fecha de siembra se elige en el reporte y queda guardada en el navegador. Fuentes: Open-Meteo (pronóstico, reanálisis ERA5 y altitud) e ISRIC SoilGrids, todas gratuitas y sin clave.

Uso: botón **＋ Cargar KML/KMZ**, o arrastrá los archivos sobre el mapa. Cada polígono del archivo se convierte en un campo **con el nombre del archivo** (si el archivo trae varios polígonos se numeran, y si alguno tiene un nombre propio en Google Earth se agrega al final). Los nombres genéricos como "Polígono sin título" se ignoran. Los puntos y las líneas no se cargan. Si el repositorio de campos llegara a ser público, la página se niega a usarlo.

## Pestaña Stock (planilla de Google)

La pestaña Stock es la misma app de control de stock de Apps Script, con todas sus funciones (existencias, catálogo, movimientos, anulaciones, productos nuevos, descripciones, historial, semillas, Campo Agro, stocks anteriores, acuerdo fiduciario y exportación a Excel/CSV). Los datos siguen en la planilla de Google: la página se conecta a Apps Script mediante una API protegida con clave.

Pasos (una sola vez):

1. En la planilla: **Extensiones → Apps Script**. Dejá tu código como está y agregá un archivo nuevo `Api.gs` con el contenido de [`apps-script/Api.gs`](apps-script/Api.gs). En `apps-script/Codigo.gs` está la copia del código actual de referencia.
2. **Configuración del proyecto (⚙) → Propiedades de la secuencia de comandos → Agregar propiedad**: nombre `API_KEY`, valor una clave larga (por ejemplo 24 caracteres al azar).
3. **Implementar → Nueva implementación → Tipo: Aplicación web**. Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier usuario**. Autorizá los permisos y copiá la URL que termina en `/exec`.
4. Abrí la pestaña Stock del tablero, pegá la URL y la clave, y tocá **Conectar**. Quedan guardadas en ese navegador. Para cambiarlas está el botón **🔑 Conexión**.

Si preferís no pegar la URL en cada navegador, ponela en `config.json → stock.apiUrl`. La clave nunca se guarda en el repositorio.

> La URL de la aplicación web es pública, pero sin la clave no se puede leer ni modificar nada. Usá una clave larga y no la compartas. La app original de Apps Script (`doGet`) sigue funcionando igual que antes.

## Configuración (`config.json`)

| Clave | Para qué sirve |
|---|---|
| `clima.localidades` | Localidades del pronóstico. Agregá objetos `{ "nombre", "provincia", "lat", "lon" }`. |
| `clima.umbralHeladaC` | Temperatura mínima (°C) por debajo de la cual se marca alerta de helada. Por defecto, 2. |
| `retenciones` | Alícuotas vigentes por grano, en %. Se editan a mano. Actualizá también `actualizado` y `fuente`. |
| `noticias.feeds` | Feeds RSS de medios agro: `{ "nombre", "url" }`. |
| `noticias.maxTitulares` / `maxPorFuente` | Cuántos titulares mostrar en total y como máximo por medio. |
| `feriados.lista` | Feriados nacionales de respaldo, por si la API no responde. Revisala cada año. |
| `matbaRofex.mesesCosecha` | Meses de vencimiento a mostrar por grano (posiciones de cosecha). Se descartan los contratos que vencen en el mes actual. |
| `pizarra`, `cbot`, `matbaRofex`, `dolar` | URL y parámetros de cada fuente. |
| `diseno.fotos` | Fotos del inicio (URL o ruta dentro de `public/`). Podés poner fotos propias. |
| `mapa.puntos` | Campos o depósitos que se marcan en el mapa del clima. |
| `campos.repo`, `campos.rama` | Repositorio **privado** y rama donde se guardan los campos. |
| `stock.apiUrl` | URL de la API de Apps Script para la pestaña Stock (opcional: si queda vacía, se pide en la página). |
| `recargaMinutos`, `diasGrafico`, `timeoutMs` | Recarga de la página, días de los gráficos y timeout por pedido. |

Ejemplo para agregar una localidad:

```json
{ "nombre": "Río Cuarto", "provincia": "Córdoba", "lat": -33.1232, "lon": -64.3493 }
```

> **Retenciones:** los valores cargados son los del anuncio de diciembre de 2025 (soja 24 %, maíz y sorgo 8,5 %, trigo y cebada 7,5 %, girasol 4,5 %). Confirmalos en el Boletín Oficial y actualizalos cuando cambien.

## Fuentes de datos

| Dato | Fuente | Tipo |
|---|---|---|
| Pizarra Rosario | [Cámara Arbitral de Cereales – BCR](https://www.cac.bcr.com.ar/es/precios-de-pizarra) | HTML (cheerio) |
| Chicago (CBOT) | Yahoo Finance, futuros continuos `ZS=F`, `ZC=F`, `ZW=F`. Si responde 429, se reintenta con cookie de sesión y después se prueban CME Group y Stooq | JSON / CSV |
| Matba-Rofex | Endpoint JSON que usa la web de Matba-Rofex (no documentado) | JSON |
| Dólar | [DolarApi](https://dolarapi.com) y [ArgentinaDatos](https://argentinadatos.com) para el histórico inicial | JSON |
| Clima | [Open-Meteo](https://open-meteo.com) | JSON, sin clave |
| Feriados | ArgentinaDatos, con la lista de `config.json` como respaldo | JSON |
| Noticias | RSS de Clarín Rural, La Nación Campo, Infocampo, Bichos de Campo, Agrofy News y TodoAgro | RSS |

Conversión de Chicago a USD por tonelada: soja y trigo × 36,7437 bushels/t; maíz × 39,3679 bushels/t.
Las noticias muestran solo el título, el medio y el link a la nota original.

## Robustez

- Cada fuente se consulta por separado, con timeout y un reintento.
- Si una fuente falla, se muestra su último dato correcto (`data/ultimo.json`) con la etiqueta **"Sin actualizar"** y su fecha. Si nunca hubo dato, aparece **"Dato no disponible"**.
- Al pie de la página hay una tabla con el estado de cada fuente en la última ejecución.
- Si fallan todas las fuentes, no se sobrescribe la página anterior.
- En feriados nacionales y fines de semana aparece un aviso arriba y se mantienen los últimos datos. Ese día no se registran valores de dólar en el histórico.

## Histórico y variaciones

`data/historico.json` guarda una serie por métrica, indexada por la **fecha propia del dato**: la fecha de la pizarra, la rueda de Chicago, etc.
La variación (↑ verde, ↓ rojo, = gris) compara con el último valor de una fecha anterior, o sea, con el día hábil anterior con dato.
Se conservan unos 400 días. Los gráficos muestran los últimos 30 puntos de la pizarra y del dólar oficial (Chart.js desde jsDelivr).

## Estructura

```
config.json                 configuración editable
src/index.js                orquestador
src/historico.js            histórico, variaciones y último dato válido
src/generar-html.js         genera public/index.html
src/plantilla/estilos.css   estilos de la página (se incluyen dentro del HTML)
src/plantilla/cliente.js    pestañas, animaciones, gráficos y mapa (se incluye dentro del HTML)
public/stock/               app de stock (pestaña Stock)
public/campos/              mapa de campos (pestaña Campos): kml.js, github.js, campos.js
apps-script/                código de Apps Script de la planilla de stock
src/lib/http.js             fetch con timeout, reintento y charset
src/lib/formato.js          formato argentino de números y fechas
src/fuentes/*.js            un archivo por fuente
scripts/check.js            valida todo con node --check
data/                       histórico (lo actualiza el workflow)
public/index.html           página publicada
```

## Si una fuente deja de andar

Los sitios cambian de formato sin aviso. Si en el pie una fuente aparece con error varios días seguidos, revisá su archivo en `src/fuentes/` y la URL en `config.json`.
El parser de la pizarra busca por texto (el nombre del grano y el precio) en lugar de clases CSS exactas, para aguantar cambios chicos de diseño.
