(function () {
  "use strict";

  /* ---------------------------------------------------------------------
   * Helpers
   * ------------------------------------------------------------------- */
  const fmt = (n) => SITE_CONFIG.moneda + n.toLocaleString("es-AR");
  const waBaseUrl = () => `https://wa.me/${SITE_CONFIG.whatsappNumber}`;

  function setWhatsappLinks() {
    const greeting = encodeURIComponent(`¡Hola ${SITE_CONFIG.nombre}! Quería hacer una consulta.`);
    const links = ["navWhatsapp", "heroWhatsapp", "contactWhatsapp", "footerWhatsapp", "floatWhatsapp"];
    links.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.href = `${waBaseUrl()}?text=${greeting}`;
    });
    const maps = document.getElementById("mapsLink");
    if (maps) maps.href = SITE_CONFIG.mapsUrl;
    const ig = document.getElementById("footerInstagram");
    if (ig) {
      if (SITE_CONFIG.instagram) {
        ig.href = SITE_CONFIG.instagram;
      } else {
        ig.style.display = "none";
      }
    }
  }

  /* ---------------------------------------------------------------------
   * Nav móvil
   * ------------------------------------------------------------------- */
  function initNav() {
    const toggle = document.getElementById("navToggle");
    const links = document.getElementById("navLinks");
    if (!toggle || !links) return;
    toggle.addEventListener("click", () => {
      const open = links.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    links.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => {
        links.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      })
    );
  }

  /* ---------------------------------------------------------------------
   * Carrito (persistido en localStorage)
   * ------------------------------------------------------------------- */
  const CART_KEY = "sanPugliese.cart";
  let cart = loadCart();

  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (e) {
      /* almacenamiento no disponible: el pedido sigue funcionando en memoria */
    }
  }

  function cartKey(catId, name) {
    return `${catId}::${name}`;
  }

  function addToCart(catId, item) {
    const key = cartKey(catId, item.name);
    const existing = cart.find((c) => c.key === key);
    if (existing) {
      existing.qty += 1;
    } else {
      cart.push({
        key,
        catId,
        name: item.name,
        price: item.price,
        unit: item.unit || "",
        promo: item.promo || "",
        qty: 1
      });
    }
    saveCart();
    renderCart();
    renderMenu();
    showToast(`${item.name} agregado al pedido`);
  }

  function changeQty(key, delta) {
    const line = cart.find((c) => c.key === key);
    if (!line) return;
    line.qty += delta;
    if (line.qty <= 0) cart = cart.filter((c) => c.key !== key);
    saveCart();
    renderCart();
    renderMenu();
  }

  function removeFromCart(key) {
    cart = cart.filter((c) => c.key !== key);
    saveCart();
    renderCart();
    renderMenu();
  }

  function cartQtyFor(catId, name) {
    const line = cart.find((c) => c.key === cartKey(catId, name));
    return line ? line.qty : 0;
  }

  function cartTotal() {
    return cart.reduce((sum, c) => sum + c.price * c.qty, 0);
  }

  function cartItemCount() {
    return cart.reduce((sum, c) => sum + c.qty, 0);
  }

  function renderCart() {
    const fab = document.getElementById("cartFab");
    const count = document.getElementById("cartFabCount");
    const itemsWrap = document.getElementById("cartItems");
    const summary = document.getElementById("cartSummary");
    const total = document.getElementById("cartTotal");
    const submitBtn = document.getElementById("submitOrder");

    const n = cartItemCount();
    count.textContent = String(n);
    fab.hidden = n === 0;

    if (cart.length === 0) {
      itemsWrap.innerHTML = `<p class="cart-empty">Todavía no agregaste nada. Elegí algo de la carta 🍕</p>`;
      summary.hidden = true;
      submitBtn.disabled = true;
    } else {
      itemsWrap.innerHTML = cart
        .map(
          (c) => `
        <div class="cart-item">
          <div>
            <div class="cart-item__name">${c.name}</div>
            ${c.unit ? `<div class="cart-item__unit">${c.unit}</div>` : ""}
            ${c.promo ? `<div class="cart-item__unit">${c.promo}</div>` : ""}
            <div class="cart-item__controls">
              <button type="button" class="qty-btn" data-action="dec" data-key="${c.key}" aria-label="Quitar uno">−</button>
              <span class="qty-badge">${c.qty}</span>
              <button type="button" class="qty-btn" data-action="inc" data-key="${c.key}" aria-label="Sumar uno">+</button>
              <button type="button" class="cart-item__remove" data-action="remove" data-key="${c.key}">quitar</button>
            </div>
          </div>
          <div class="cart-item__price">${fmt(c.price * c.qty)}</div>
        </div>`
        )
        .join("");
      summary.hidden = false;
      total.textContent = fmt(cartTotal());
      submitBtn.disabled = false;
    }
  }

  function initCartControls() {
    document.getElementById("cartItems").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const key = btn.dataset.key;
      if (btn.dataset.action === "inc") changeQty(key, 1);
      if (btn.dataset.action === "dec") changeQty(key, -1);
      if (btn.dataset.action === "remove") removeFromCart(key);
    });

    const overlay = document.getElementById("cartOverlay");
    document.getElementById("cartFab").addEventListener("click", () => {
      overlay.hidden = false;
      document.body.style.overflow = "hidden";
    });
    document.getElementById("cartClose").addEventListener("click", closeCart);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeCart();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) closeCart();
    });

    function closeCart() {
      overlay.hidden = true;
      document.body.style.overflow = "";
    }

    document.querySelectorAll('input[name="entrega"]').forEach((r) =>
      r.addEventListener("change", toggleDireccionField)
    );
    toggleDireccionField();

    document.getElementById("orderForm").addEventListener("submit", handleOrderSubmit);
  }

  function toggleDireccionField() {
    const isDelivery = document.getElementById("entregaDelivery").checked;
    document.getElementById("direccionField").classList.toggle("field--hidden", !isDelivery);
    document.getElementById("direccionInput").required = isDelivery;
  }

  function handleOrderSubmit(e) {
    e.preventDefault();
    if (cart.length === 0) return;

    const entrega = document.querySelector('input[name="entrega"]:checked').value;
    const direccion = document.getElementById("direccionInput").value.trim();
    const nombre = document.getElementById("nombreInput").value.trim();
    const pago = document.getElementById("pagoInput").value;
    const notas = document.getElementById("notasInput").value.trim();

    if (entrega === "Delivery" && !direccion) {
      document.getElementById("direccionInput").focus();
      return;
    }
    if (!nombre) {
      document.getElementById("nombreInput").focus();
      return;
    }

    const lines = [];
    lines.push(`¡Hola ${SITE_CONFIG.nombre}! 👋 Quiero hacer este pedido:`);
    lines.push("");
    cart.forEach((c) => {
      const extra = c.promo ? ` (${c.promo})` : c.unit ? ` (${c.unit})` : "";
      lines.push(`• ${c.qty} x ${c.name}${extra} — ${fmt(c.price * c.qty)}`);
    });
    lines.push("");
    lines.push(`Total: ${fmt(cartTotal())}`);
    lines.push("");
    lines.push(`Entrega: ${entrega}`);
    if (entrega === "Delivery") lines.push(`Dirección: ${direccion}`);
    lines.push(`Nombre: ${nombre}`);
    lines.push(`Pago: ${pago}`);
    if (notas) lines.push(`Aclaraciones: ${notas}`);

    const text = encodeURIComponent(lines.join("\n"));
    window.open(`${waBaseUrl()}?text=${text}`, "_blank", "noopener");

    cart = [];
    saveCart();
    renderCart();
    renderMenu();
    document.getElementById("cartOverlay").hidden = true;
    document.body.style.overflow = "";
    showToast("¡Pedido enviado por WhatsApp!");
  }

  /* ---------------------------------------------------------------------
   * Carta / tabs
   * ------------------------------------------------------------------- */
  function renderMenuTabs() {
    const tabsWrap = document.getElementById("menuTabs");
    tabsWrap.innerHTML = MENU_DATA.map(
      (cat, i) => `<button class="tab${i === 0 ? " is-active" : ""}" data-cat="${cat.id}">${cat.title}</button>`
    ).join("");

    tabsWrap.addEventListener("click", (e) => {
      const btn = e.target.closest(".tab");
      if (!btn) return;
      tabsWrap.querySelectorAll(".tab").forEach((t) => t.classList.remove("is-active"));
      btn.classList.add("is-active");
      document.querySelectorAll(".menu-panel").forEach((p) => p.classList.remove("is-active"));
      document.getElementById(`panel-${btn.dataset.cat}`).classList.add("is-active");
    });
  }

  function menuCardHtml(cat, item) {
    const qty = cartQtyFor(cat.id, item.name);
    const unitLabel = item.unit ? `<small> / ${item.unit}</small>` : "";
    return `
      <article class="menu-card">
        <div class="menu-card__top">
          <h4>${item.name}</h4>
          <div class="menu-card__price">${fmt(item.price)}${unitLabel}</div>
        </div>
        ${item.desc ? `<p class="desc">${item.desc}</p>` : ""}
        ${item.promo ? `<span class="menu-card__promo">${item.promo}</span>` : ""}
        <div class="menu-card__bottom">
          ${qty > 0 ? `<span class="qty-badge">x${qty}</span>` : ""}
          <button type="button" class="btn btn--gold btn--sm" data-add data-cat="${cat.id}" data-name="${item.name}">
            Agregar
          </button>
        </div>
      </article>`;
  }

  function comingSoonHtml() {
    return `
      <div class="coming-soon">
        <h4>Carta en preparación</h4>
        <p>Todavía estamos cargando esta sección. Escribinos por WhatsApp y te contamos las opciones y precios del día.</p>
        <a href="${waBaseUrl()}?text=${encodeURIComponent("¡Hola! Quería consultar por esta parte de la carta.")}" class="btn btn--whatsapp btn--sm" target="_blank" rel="noopener">Consultar por WhatsApp</a>
      </div>`;
  }

  function renderMenuPanels() {
    const panelsWrap = document.getElementById("menuPanels");
    panelsWrap.innerHTML = MENU_DATA.map(
      (cat, i) => `
      <div class="menu-panel${i === 0 ? " is-active" : ""}" id="panel-${cat.id}">
        <div class="menu-panel__head">
          <h3>${cat.title}</h3>
          ${cat.subtitle ? `<p>${cat.subtitle}</p>` : ""}
        </div>
        <div class="menu-grid">
          ${cat.comingSoon || cat.items.length === 0 ? comingSoonHtml() : cat.items.map((it) => menuCardHtml(cat, it)).join("")}
        </div>
      </div>`
    ).join("");

    panelsWrap.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-add]");
      if (!btn) return;
      const cat = MENU_DATA.find((c) => c.id === btn.dataset.cat);
      const item = cat.items.find((it) => it.name === btn.dataset.name);
      addToCart(cat.id, item);
    });
  }

  function renderMenu() {
    renderMenuPanels();
  }

  /* ---------------------------------------------------------------------
   * Toast
   * ------------------------------------------------------------------- */
  let toastTimer = null;
  function showToast(msg) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
  }

  /* ---------------------------------------------------------------------
   * Init
   * ------------------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", () => {
    setWhatsappLinks();
    initNav();
    renderMenuTabs();
    renderMenuPanels();
    initCartControls();
    renderCart();
  });
})();
