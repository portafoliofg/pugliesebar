# Sammartino · Tablero Agro

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

- **Capas** (botón sobre el mapa): mapa base satelital, calles o relieve; colorear los campos por cultivo, campaña, provincia o NDVI; mostrar u ocultar cada grupo; nombres de los lotes, límites y localidades, y radar de lluvia (RainViewer).
- **Filtros** por provincia, cultivo y campaña, y buscador. La provincia, el departamento y la localidad se detectan solos con la [API Georef](https://datosgobar.github.io/georef-ar-api/) del Gobierno argentino.
- **Selección múltiple**: con las casillas de la lista, con Ctrl + clic en el mapa, o con el botón "Seleccionar" en el celular. A los seleccionados les podés asignar cultivo y campaña de una vez, verlos en el mapa o eliminarlos.
- **Eliminar todos**: pide escribir ELIMINAR para confirmar y opcionalmente borra también las copias de los KML/KMZ.
- **Pronóstico por campo** (Open-Meteo): resumen con lluvia de los últimos 7 y 30 días, próximos 7 y 16 días, balance hídrico (lluvia − evapotranspiración) y ventanas para pulverizar; detalle de 48 horas; tabla de 16 días con viento, ráfagas, ET0 y UV; humedad y temperatura del suelo.

- **Reporte completo del campo** (botón 📊 en la ficha): se abre en una pestaña nueva y se puede imprimir o guardar en PDF, o descargar los datos en CSV. Incluye mapa satelital del lote, indicadores, análisis escrito automático y gráficos de lluvia mensual contra el promedio 1991–2020, lluvia acumulada desde la siembra, lluvia diaria, balance hídrico, anomalías, temperaturas máximas y mínimas, heladas y días de calor, grados-día, radiación y heliofanía, humedad del suelo por profundidad, propiedades del suelo (SoilGrids: textura, pH, materia orgánica, nitrógeno, CIC, densidad), rosa de los vientos, viento y ráfagas, pronóstico de 48 horas y tabla de 16 días. La fecha de siembra se elige en el reporte y queda guardada en el navegador. Fuentes: Open-Meteo (pronóstico, reanálisis ERA5 y altitud) e ISRIC SoilGrids, todas gratuitas y sin clave.
- **NDVI satelital** (vigor del cultivo): en la ficha de cada lote, valor actual, cambio en 30 días, porcentaje del lote con vigor bajo/medio/alto, gráfico de la serie y botón para ver la imagen NDVI sobre el mapa; también en la lista, en las capas y en el reporte del campo. Lo calcula todos los días a las 6:15 el workflow **NDVI de los campos** del repositorio privado, con imágenes Sentinel-2 (10 m, cada ~5 días si no hay nubes) de Microsoft Planetary Computer, gratis y sin clave.
- **Reporte general** (botón 📋): todos los campos juntos, filtrable por provincia. Indicadores, análisis escrito, mapa coloreado por NDVI, lluvia de 30 días, lluvia prevista, mínima prevista o humedad del suelo; hectáreas por provincia, cultivo y campaña; distribución del NDVI; lluvia por departamento; mínimas previstas por provincia; rankings (más y menos lluvia, heladas, NDVI más alto/más bajo, mayor caída) y tabla ordenable de todos los lotes. Se imprime en PDF o se descarga en CSV.
- **Agua útil del suelo** (primer metro): porcentaje y milímetros, estado (seco, escaso, adecuado, óptimo, perfil lleno), proyección a 7 y 16 días y gráfico con la lluvia de cada fuente. Lo calcula todos los días a las 6:40 el workflow **Agua útil de los campos** del repositorio privado, y también cada vez que cargás una lluvia.
- **Registro de lluvias** (botón 🌧️): fecha, milímetros y lotes (por zona o uno por uno). Reemplaza al satélite en el balance.
- **Fecha de siembra** (en "Editar" o en el reporte): el consumo de agua sigue la etapa del cultivo.
- **Suelo** (🧪 en la ficha): carta de suelos del INTA y tus análisis de laboratorio (pH, MO, P, N, S, CE).
- **Escenarios** (pestaña del pronóstico): probabilidad de lluvia y de helada día por día y rango de milímetros, con 51 escenarios del modelo europeo.
- **Satélite GOES** (en Capas): nubes y tormentas en infrarrojo o color natural, de hace ~40 minutos.
- **Labores** (botón 📒 y en la ficha de cada lote): siembra (cultivo, variedad, densidad), pulverización, fertilización, cosecha (rinde), labranza; producto, dosis, superficie, contratista y notas. La siembra registrada pasa sola al balance de agua. Cada labor puede llevar su costo (US$/ha). Se guardan en `data/labores.json` del repositorio privado.
- **Importar labores desde Excel o CSV** (⚙️ Más → 📥 Importar labores, o desde la ventana de Labores y el cuaderno): lee `.xlsx` y `.csv` en el navegador, sin librerías (`campos/planilla.js`). Reconoce las columnas por nombre en cualquier orden (fecha, labor, lote, cultivo, variedad, producto, dosis, unidad, superficie, costo, rinde, contratista, notas), fechas como 13/10/2026 o de Excel, decimales con coma y varios lotes por fila separados con `|`. Antes de guardar muestra una revisión: lotes que no reconoce (para elegir a cuál corresponden), filas con problemas y labores ya cargadas. Todo se guarda en un solo cambio. Tiene plantilla para descargar.
- **Comercialización** (pestaña **Ventas** del tablero, o 📊 Reportes → 🤝 Comercialización, `campos/comercial.html`; solo el dueño y el socio de lectura): ventas por campaña con precio hecho (en US$ o en pesos con tipo de cambio), a fijar con sus fijaciones y canjes. Las cruza con la producción esperada (rinde esperado del margen bruto × hectáreas y cosechas del cuaderno, o un valor cargado a mano) y con el mercado de hoy (Matba-Rofex a cosecha y pizarra). Muestra % vendido, toneladas con precio / a fijar / sin vender, precio promedio logrado contra el de hoy, lo asegurado en US$, el riesgo de lo que no tiene precio, avisos de sobreventa y los próximos vencimientos de fijación y entregas. Se guarda en `data/ventas.json` del repositorio privado.
- **Cuaderno de campo** (📊 Reportes → 📚 Cuaderno de campo, `campos/cuaderno.html`): historial de cada lote por campaña, rindes por cultivo y campaña (ponderados por superficie) con su gráfico, insumos aplicados (dosis × superficie), costos cargados y tabla completa con exportación a CSV e impresión.
- **Margen bruto** (📊 Reportes → 💵 Margen bruto, `campos/margen.html`, solo el dueño y el socio de lectura): plantilla de costos por cultivo (semilla, fertilizantes, fitosanitarios, labores, seguro, cosecha, flete, comisión, alquiler en US$ o quintales) cruzada con el rinde esperado y el precio a cosecha de Matba-Rofex del tablero (`public/precios.json`). Muestra margen por hectárea y por lote, rinde y precio de indiferencia, sensibilidad ±10 % de precio y rinde, y el margen real con el rinde y los costos del cuaderno. Los presupuestos se guardan en `data/margenes.json` del repositorio privado.
- **Accesos** (⚙️ Más → 👥 Accesos): invitá a tu socio (solo lectura) o a un contratista (carga labores, lluvias y análisis, sin editar ni borrar campos). Creás una llave de GitHub para cada uno (Contents "Read-only" o "Read and write", solo para el repositorio privado) y la página arma un link de invitación para mandar por WhatsApp. Para anularlo, borrás esa llave en GitHub. La solo lectura la impone GitHub; la carga es un permiso de la página (la llave puede escribir en el repositorio).
- **Perspectiva de la campaña** (en el reporte general): estado de El Niño / La Niña y, para cada provincia de tus lotes, cuánto llovió de octubre a marzo en las campañas con la misma fase desde 1981 y el pronóstico estacional de los próximos 3 meses.
- **Alertas por WhatsApp** (⚙️ Más → 🔔): ver más abajo.

Uso: botón **＋ Cargar KML/KMZ**, o arrastrá los archivos sobre el mapa. Cada polígono del archivo se convierte en un campo **con el nombre del archivo** (si el archivo trae varios polígonos se numeran, y si alguno tiene un nombre propio en Google Earth se agrega al final). Los nombres genéricos como "Polígono sin título" se ignoran. Los puntos y las líneas no se cargan. Si el repositorio de campos llegara a ser público, la página se niega a usarlo.

## Alertas por WhatsApp

Las manda el workflow **Alertas por WhatsApp** del repositorio privado (usa tus campos, por eso no corre acá), con [CallMeBot](https://www.callmebot.com/blog/free-api-whatsapp-messages/), que es gratis:

- **7:30**: resumen del día con pizarra Rosario, Chicago, dólar, clima de tus campos por provincia, alertas y lotes con NDVI en baja.
- **19:00**: solo si hay alertas (si no, no manda nada).
- Alertas: helada (mínima menor al umbral en los próximos días), lluvia fuerte, ráfagas, caída de NDVI, lotes que bajan del umbral de agua útil, normas nuevas del Boletín Oficial sobre retenciones y **precios objetivo** (avisa una sola vez cuando el precio cruza el valor).

Activarlo (una sola vez):

1. Agendá el número de CallMeBot que figura en su página y mandale por WhatsApp `I allow callmebot to send me messages`. Te responde con tu **apikey**.
2. En el repositorio privado: **Settings → Secrets and variables → Actions → New repository secret**, nombre `WHATSAPP_DESTINOS`, valor `+549XXXXXXXXXX:APIKEY` (varios números separados por coma).
3. **Actions → Alertas por WhatsApp → Run workflow** con modo "prueba".

Qué se avisa y los umbrales se cambian con el botón **🔔 Alertas** de la pestaña Campos (se guarda en `config/alertas.json` del repositorio privado).

## Perspectiva de la campaña (pestaña Clima)

Estado de El Niño / La Niña según la NOAA (ONI, Niño 3.4 semanal y probabilidad), lo que suele significar para la región y, para cada localidad de `config.json → clima.localidades`, la lluvia de octubre a marzo en las campañas con la misma fase desde 1981 (reanálisis ERA5) y el pronóstico estacional de los próximos 3 meses (Open-Meteo, por escenarios) comparado con lo normal 1991–2020. Se calcula en el navegador y queda guardado un mes.

## Fondo animado

`public/paisaje.js` dibuja un paisaje de campo en SVG detrás del contenido (lomas con surcos, molino, espigas que se mecen, nubes, pájaros, sol o luna con estrellas en modo oscuro). Con "reducir movimiento" del sistema queda quieto y no se imprime.

## Retenciones

Los valores están en `config.json → retenciones` (Decreto 423/2026: trigo y cebada 5,5 %; soja 24 %, maíz y sorgo 8,5 %, girasol 4,5 % durante 2026). El cronograma de baja de la soja (2027–2028) está cargado y se aplica solo el día que corresponde. Cada actualización revisa la primera sección del **Boletín Oficial** del día: si aparece una norma sobre derechos de exportación de granos, el tablero muestra un aviso con el link (y llega por WhatsApp). Después de revisarla, actualizá los valores y la fecha `verificado` en `config.json` (o agregá el id de la norma a `normasRevisadas`).

## Pestaña Stock (planilla de Google)

La pestaña Stock es la misma app de control de stock de Apps Script, con todas sus funciones (existencias, catálogo, movimientos, anulaciones, productos nuevos, descripciones, historial, semillas, Campo Agro, stocks anteriores, acuerdo fiduciario y exportación a Excel/CSV). Los datos siguen en la planilla de Google: la página se conecta a Apps Script mediante una API protegida con clave.

Pasos (una sola vez):

1. En la planilla: **Extensiones → Apps Script**. Dejá tu código como está y agregá un archivo nuevo `Api.gs` con el contenido de [`apps-script/Api.gs`](apps-script/Api.gs). En `apps-script/Codigo.gs` está la copia del código actual de referencia.
2. **Configuración del proyecto (⚙) → Propiedades de la secuencia de comandos → Agregar propiedad**: nombre `API_KEY`, valor una clave larga (por ejemplo 24 caracteres al azar).
3. **Implementar → Nueva implementación → Tipo: Aplicación web**. Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier usuario**. Autorizá los permisos y copiá la URL que termina en `/exec`.
4. Abrí la pestaña Stock del tablero, pegá la URL y la clave, y tocá **Conectar**. Quedan guardadas en ese navegador. Para cambiarlas está el botón **🔑 Conexión**.

Si preferís no pegar la URL en cada navegador, ponela en `config.json → stock.apiUrl`. La clave nunca se guarda en el repositorio.

> La URL de la aplicación web es pública, pero sin la clave no se puede leer ni modificar nada. Usá una clave larga y no la compartas. La app original de Apps Script (`doGet`) sigue funcionando igual que antes.

## Menú lateral

En computadora (más de 900 px de ancho) las secciones van en un menú lateral que se puede achicar a solo íconos (botón abajo a la izquierda; se recuerda en el navegador). Campos y Stock ocupan toda la pantalla, y las acciones de Mis campos (reportes, labores, lluvia, cargar KML/KMZ, GitHub, alertas, accesos) aparecen en el menú debajo de **Campos**, según el rol de quien entra. En el celular se mantiene la barra de arriba, y la de Mis campos queda compacta en una fila deslizable.

## Velocidad

- **Campos y reportes:** los archivos del repositorio privado se guardan en este navegador (IndexedDB). La página se muestra al instante con esa copia y la revisa en segundo plano con ETag: si nada cambió, GitHub responde 304 sin mandar datos; si cambió, la página se redibuja sola. Las imágenes NDVI quedan guardadas y los pronósticos de Open-Meteo se reutilizan 30 minutos (el histórico 12 h, las normales 1991–2020, la altura y el suelo 30 días). Al tocar **Desconectar** se borra todo.
- **Stock:** la última lectura de la planilla se muestra al instante y se actualiza cuando responde Apps Script; cualquier movimiento borra la copia.
- **En el token de GitHub** (⚙️ Más → 🔗 GitHub) hay un botón para ver y copiar el token y usarlo en otro dispositivo.
- Las tipografías no frenan el primer dibujo y los pedidos independientes se hacen en paralelo.

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
| El Niño / La Niña | [NOAA CPC](https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml): ONI, Niño 3.4 semanal y estado de alerta → `public/enso.json` | Texto / HTML |
| Retenciones | `config.json` (Decreto 423/2026 y su cronograma) + monitor diario del [Boletín Oficial](https://www.boletinoficial.gob.ar) | HTML (cheerio) |

**Campos (repositorio privado):**

| Dato | Fuente |
|---|---|
| Lluvia registrada | 1) Tus registros de pluviómetro · 2) [CHIRPS v3](https://www.chc.ucsb.edu/data/chirps3) diario (satélite + estaciones, ~5 km, UC Santa Barbara) · 3) Open-Meteo solo para los últimos días que CHIRPS todavía no publicó |
| Agua útil del suelo | Balance hídrico diario propio: lluvia − ET0 × coeficiente de cultivo FAO-56, sobre el agua útil del suelo según el INTA |
| Suelo | [Carta de Suelos INTA 1:500.000](https://geo-backend.inta.gob.ar/geoserver) (índice de productividad, textura, drenaje, limitantes) + tus análisis de laboratorio; SoilGrids queda como referencia |
| Pronóstico | Open-Meteo (pronóstico) + [pronóstico por conjuntos](https://open-meteo.com/en/docs/ensemble-api) ECMWF IFS de 51 escenarios (probabilidades y rangos) |
| Satélite meteorológico | GOES-East (NOAA) vía [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/): infrarrojo y color natural, cada 10 minutos |
| NDVI | Sentinel-2 (ESA) vía Microsoft Planetary Computer |
| Radar | RainViewer |

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
public/campos/              mapa de campos (pestaña Campos): kml.js, github.js, ndvi.js, agua.js, ensamble.js, campos.js,
                            pronostico.js, reporte.* (por campo) y general.* (todos)
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
