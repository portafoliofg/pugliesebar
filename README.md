# San Pugliese Bar

Sitio web de San Pugliese Bar (rotisería & bar): inicio con historia, carta completa por categorías, pedidos que se arman como carrito y se envían directo por WhatsApp, e info de delivery / take away.

Es un sitio estático (HTML + CSS + JS, sin frameworks ni build), pensado para poder editarse fácil y publicarse en cualquier hosting estático (GitHub Pages, Netlify, Vercel, etc.).

## Estructura

```
index.html          página principal (todas las secciones)
css/styles.css       estilos (colores, tipografías, layout)
js/config.js         datos de contacto (WhatsApp, dirección, horarios, redes)
js/menu-data.js      la carta: categorías, platos, precios
js/app.js            lógica: navegación, carta, carrito y armado del mensaje de WhatsApp
assets/logo.svg       logo (emblema circular)
assets/favicon.svg    ícono de pestaña
```

## Cómo editar lo más común

- **Precios, platos o categorías nuevas** → `js/menu-data.js`. Cada categoría es un objeto con `items: [{ name, desc, price, unit, promo }]`.
- **Número de WhatsApp, dirección, horarios, Instagram** → `js/config.js`.
- **Colores** → variables al inicio de `css/styles.css` (`:root { --maroon-700, --gold, --coral, ... }`).
- **Texto de "Nuestra historia"** → directamente en `index.html`, sección `id="historia"`.

## Pendiente de completar (no se inventaron datos)

Con la info que me pasaste arme el menú del día y las ofertas tal cual la foto. Estas secciones quedaron con la estructura lista pero mostrando "consultar por WhatsApp" porque no tengo los precios/variedades reales:

- **Pizzas** (`js/menu-data.js`, categoría `pizzas`)
- **Entrepanes / sándwiches** además de milanesa y burger (categoría `entrepanes`)
- **Bebidas** con y sin alcohol (categoría `bebidas`)
- **Instagram / Facebook** (`js/config.js`, quedaron vacíos)
- **Link exacto de Google Maps** del local (`js/config.js`, `mapsUrl`)
- **Logo real**: se recreó un emblema en SVG inspirado en el que mandaste (mismos colores y estilo). Si me pasás el archivo de imagen original lo reemplazo por el logo real en `assets/`.

Apenas me pases esos datos los cargo y esas secciones muestran los platos con precio y botón de "Agregar" como el resto.

## Cómo probarlo local

No necesita instalación. Con Python:

```bash
python3 -m http.server 8000
```

y abrís `http://localhost:8000`.

## Cómo funciona el pedido por WhatsApp

El visitante agrega platos desde la carta, revisa el carrito (botón flotante), completa si es delivery o take away, su nombre, medio de pago y aclaraciones. Al confirmar, se abre WhatsApp (`wa.me`) con el pedido ya redactado, listo para enviar al número configurado en `js/config.js`.
