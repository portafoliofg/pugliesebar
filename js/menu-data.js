/**
 * Carta de San Pugliese Bar.
 *
 * Cada categoría puede tener:
 *  - items: [{ name, desc, price, promo, unit }]
 *  - comingSoon: true -> se muestra una tarjeta invitando a consultar por WhatsApp
 *    en lugar de precios inventados. Sumá los "items" reales ahí apenas los tengas
 *    y el "comingSoon" se puede borrar.
 */
const MENU_DATA = [
  {
    id: "menu-dia",
    title: "Menú del Día",
    subtitle: "Todos los platos incluyen guarnición a elección",
    items: [
      { name: "Suprema con guarnición", desc: "Pechuga de pollo rebozada en pan rayado, con guarnición a elección.", price: 7000 },
      { name: "Wok Chelsea", desc: "Colchón de arroz salteado con verdura y pollo.", price: 7000 },
      { name: "Ensalada Súper", desc: "Arroz, pollo, huevo, tomate, zanahoria, lechuga y jamón.", price: 7000 },
      { name: "Wrap con guarnición", desc: "Masa rellena de carne y verduras salteadas, con guarnición a elección.", price: 7000 },
      { name: "Pata muslo con guarnición", desc: "Pata muslo al horno con guarnición a elección.", price: 7000 },
      { name: "Milanesa de ternera", desc: "Carne de ternera rebozada, con guarnición a elección.", price: 7000 }
    ]
  },
  {
    id: "ofertas",
    title: "¡Ofertas Pugliese!",
    subtitle: "Las promos de la casa",
    items: [
      {
        name: "Docena de empanadas",
        desc: "Árabe, criolla salada, jamón y queso, verdura y pollo.",
        price: 15000,
        unit: "la docena"
      },
      { name: "Sandwich de milanesa + papas", desc: "", price: 9000, promo: "2 x $16000" },
      { name: "Burger + papas", desc: "", price: 7000, promo: "2 x $13000" }
    ]
  },
  {
    id: "empanadas",
    title: "Empanadas",
    subtitle: "Sabores de la casa · también se venden por unidad",
    items: [
      { name: "Empanada árabe", desc: "", price: 1500, unit: "unidad" },
      { name: "Empanada criolla salada", desc: "", price: 1500, unit: "unidad" },
      { name: "Empanada de jamón y queso", desc: "", price: 1500, unit: "unidad" },
      { name: "Empanada de verdura", desc: "", price: 1500, unit: "unidad" },
      { name: "Empanada de pollo", desc: "", price: 1500, unit: "unidad" }
    ]
  },
  {
    id: "pizzas",
    title: "Pizzas",
    subtitle: "A la piedra, para comer en el bar o pedir a domicilio",
    items: [],
    comingSoon: true
  },
  {
    id: "entrepanes",
    title: "Entrepanes y sándwiches",
    subtitle: "Además de las promos de milanesa y burger de arriba",
    items: [],
    comingSoon: true
  },
  {
    id: "bebidas",
    title: "Bebidas",
    subtitle: "Con y sin alcohol",
    items: [],
    comingSoon: true
  }
];
