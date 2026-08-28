/**
 * Configuración general del sitio.
 * Editá estos valores para actualizar datos de contacto sin tocar el resto del código.
 */
const SITE_CONFIG = {
  nombre: "San Pugliese Bar",
  // Número de WhatsApp en formato internacional, sin "+" ni espacios (54 9 + código de área + número).
  whatsappNumber: "5493518753053",
  whatsappDisplay: "3518 753 053",
  direccion: "Ayacucho 429",
  // TODO: reemplazar por el link de Google Maps exacto del local cuando lo tengan.
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("Ayacucho 429"),
  horarios: [
    { franja: "Mediodía", horas: "11:30 a 15:00 hs" },
    { franja: "Noche", horas: "19:30 a 00:00 hs" }
  ],
  // TODO: completar con las redes sociales reales del local.
  instagram: "",
  facebook: "",
  moneda: "$"
};
