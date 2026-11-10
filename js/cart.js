/* =========================================
   Loja MZ — Carrinho com cupões
   Validação de disponibilidade no Supabase.
   ========================================= */

(function cartPage() {
  "use strict";

  const CART_KEY = "loja_mz_cart";
  const el = id => document.getElementById(id);

  let validatedCoupon = null;
  let couponVersion = 0;
  let couponBusy = false;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function couponsApi() {
    if (!window.LojaMZCoupons) {
      throw new Error(
        "O ficheiro assets/js/coupons.js não foi carregado."
      );
    }

    return window.LojaMZCoupons;
  }

  function getCart() {
    try {
      const value = JSON.parse(
        localStorage.getItem(CART_KEY) || "[]"
      );

      return Array.isArray(value) ? value : [];
    } catch (error) {
      console.warn("[Loja MZ] Carrinho inválido:", error);
      return [];
    }
  }

  function saveCart(cart) {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
      updateCartCount(cart);
      return true;
    } catch (error) {
      console.error("[Loja MZ] Guardar carrinho:", error);

      Swal.fire({
        icon: "error",
        title: "Não foi possível guardar",
        text: "Verifica se o navegador permite armazenamento local."
      });

      return false;
    }
  }

  function quantity(value) {
    const number = Number(value);

    return Number.isSafeInteger(number) && number > 0
      ? number
      : 1;
  }

  function priceCents(value) {
    const number = Number(value);

    return Number.isFinite(number) && number >= 0
      ? Math.round(number * 100)
      : 0;
  }

  function money(value) {
    return new Intl.NumberFormat("pt-MZ", {
      style: "currency",
      currency: "MZN"
    }).format(Number(value) || 0);
  }

  function productId(item) {
    return item.id || item.product_id || "";
  }

  function subtotalCents(cart = getCart()) {
    return cart.reduce(
      (sum, item) =>
        sum + priceCents(item.price) * quantity(item.quantity),
      0
    );
  }

  function cartSignature(cart = getCart()) {
    return JSON.stringify(cart);
  }

  function productImage(item) {
    const fallback = new URL(
      "assets/img/placeholders/product.svg",
      window.location.href
    ).href;

    if (!item.image) return fallback;

    try {
      const url = new URL(item.image, window.location.href);

      return ["https:", "http:"].includes(url.protocol)
        ? url.href
        : fallback;
    } catch {
      return fallback;
    }
  }

  function updateCartCount(cart = getCart()) {
    const badge = el("cart-count");

    if (!badge) return;

    badge.textContent = String(
      cart.reduce(
        (sum, item) => sum + quantity(item.quantity),
        0
      )
    );
  }

  function setCouponMessage(message, error = false) {
    const node = el("coupon-message");

    if (!node) return;

    node.textContent = message;
    node.className =
      `small mt-2 mb-0 ${error ? "text-danger" : "text-success"}`;
  }

  function setCouponBusy(value) {
    couponBusy = value;

    const button = el("apply-coupon-button");

    if (button) {
      button.disabled = value;
      button.textContent = value ? "A verificar..." : "Aplicar";
    }

    el("coupon-message")?.setAttribute(
      "aria-busy",
      String(value)
    );
  }

  function updateTotals(cart = getCart()) {
    const subtotal = subtotalCents(cart);

    const discount = validatedCoupon
      ? Math.min(
          subtotal,
          Math.max(
            0,
            Math.round(validatedCoupon.discount_amount * 100)
          )
        )
      : 0;

    el("cart-subtotal").textContent = money(subtotal / 100);
    el("cart-total").textContent = money(
      (subtotal - discount) / 100
    );

    el("coupon-discount-row")?.classList.toggle(
      "d-none",
      discount <= 0
    );

    if (el("cart-discount")) {
      el("cart-discount").textContent =
        `- ${money(discount / 100)}`;
    }
  }

  function invalidateCoupon() {
    couponVersion++;
    validatedCoupon = null;
    setCouponBusy(false);
  }

  function removeCoupon(clearInput = true) {
    invalidateCoupon();

    if (window.LojaMZCoupons) {
      window.LojaMZCoupons.saveCode("");
    }

    if (clearInput && el("coupon-code")) {
      el("coupon-code").value = "";
    }

    setCouponMessage("");
    updateTotals();
  }

  function renderCart() {
    const cart = getCart();

    updateCartCount(cart);

    if (!cart.length) {
      el("cart-empty").classList.remove("d-none");
      el("cart-content").classList.add("d-none");
      el("cart-items").innerHTML = "";
      el("cart-subtitle").textContent = "";

      removeCoupon();
      return;
    }

    el("cart-empty").classList.add("d-none");
    el("cart-content").classList.remove("d-none");

    const totalItems = cart.reduce(
      (sum, item) => sum + quantity(item.quantity),
      0
    );

    el("cart-subtitle").textContent = totalItems === 1
      ? "1 artigo no carrinho"
      : `${totalItems} artigos no carrinho`;

    el("cart-items").innerHTML = cart.map(item => {
      const count = quantity(item.quantity);
      const price = priceCents(item.price);
      const name = item.name || item.name_pt || "Produto";

      return `
        <div
          class="cart-item"
          data-id="${escapeHtml(productId(item))}"
          data-variant="${escapeHtml(item.variant_id || "")}"
        >
          <div class="d-flex gap-3">
            <img
              src="${escapeHtml(productImage(item))}"
              alt="${escapeHtml(name)}"
              class="cart-item-image"
              loading="lazy"
            >

            <div class="flex-grow-1 min-width-0">
              <h6 class="cart-item-name">
                ${escapeHtml(name)}
              </h6>

              ${
                item.variant_name
                  ? `<p class="cart-item-variant">
                      ${escapeHtml(item.variant_name)}
                    </p>`
                  : ""
              }

              <p class="cart-item-price">
                ${escapeHtml(money(price / 100))}
              </p>

              <div class="d-flex flex-wrap align-items-center gap-2">
                <div class="d-flex align-items-center gap-1">
                  <button
                    type="button"
                    class="btn btn-outline-secondary btn-sm"
                    data-action="decrease"
                    aria-label="Diminuir quantidade"
                    ${count <= 1 ? "disabled" : ""}
                  >
                    <i class="bi bi-dash" aria-hidden="true"></i>
                  </button>

                  <input
                    type="number"
                    class="form-control cart-quantity"
                    value="${count}"
                    min="1"
                    step="1"
                    aria-label="Quantidade"
                  >

                  <button
                    type="button"
                    class="btn btn-outline-secondary btn-sm"
                    data-action="increase"
                    aria-label="Aumentar quantidade"
                  >
                    <i class="bi bi-plus" aria-hidden="true"></i>
                  </button>
                </div>

                <button
                  type="button"
                  class="btn btn-outline-danger btn-sm"
                  data-action="remove"
                >
                  <i class="bi bi-trash me-1" aria-hidden="true"></i>
                  Remover
                </button>
              </div>
            </div>

            <div class="text-end">
              <strong class="cart-line-total">
                ${escapeHtml(money(price * count / 100))}
              </strong>
            </div>
          </div>
        </div>
      `;
    }).join("");

    updateTotals(cart);
  }

  async function applyCoupon(explicitCode) {
    const input = el("coupon-code");

    if (!input) return;

    const code = (
      typeof explicitCode === "string"
        ? explicitCode
        : input.value
    ).trim().toUpperCase();

    const version = ++couponVersion;
    const cart = getCart();
    const signature = cartSignature(cart);
    const subtotal = subtotalCents(cart) / 100;

    validatedCoupon = null;
    updateTotals(cart);

    if (!code) {
      window.LojaMZCoupons?.saveCode("");
      setCouponMessage("Escreve o código do cupom.", true);
      setCouponBusy(false);
      return;
    }

    if (!cart.length || subtotal <= 0) {
      setCouponMessage(
        "Adiciona produtos com valor superior a zero.",
        true
      );
      setCouponBusy(false);
      return;
    }

    input.value = code;

    setCouponBusy(true);
    setCouponMessage("A consultar o Supabase...");

    try {
      const api = couponsApi();
      const coupon = await api.validate(code, subtotal);

      if (version !== couponVersion) return;

      if (cartSignature() !== signature) {
        throw new Error(
          "O carrinho mudou. Aplica novamente o cupom."
        );
      }

      validatedCoupon = coupon;
      api.saveCode(coupon.code);

      setCouponMessage(
        `Cupom ${coupon.code} aplicado: ` +
        `${money(coupon.discount_amount)} de desconto.`
      );

      updateTotals();
    } catch (error) {
      if (version !== couponVersion) return;

      validatedCoupon = null;
      window.LojaMZCoupons?.saveCode("");

      setCouponMessage(
        error.message || "Não foi possível validar o cupom.",
        true
      );

      updateTotals();
    } finally {
      if (version === couponVersion) {
        setCouponBusy(false);
      }
    }
  }

  function restoreCoupon() {
    if (!getCart().length) return;

    const code = window.LojaMZCoupons?.getSavedCode();

    if (!code || !el("coupon-code")) return;

    el("coupon-code").value = code;
    applyCoupon(code);
  }

  function refreshAfterCartChange() {
    // Revalida o cupom confirmado ou uma validação em curso.
    const code = validatedCoupon?.code ||
      window.LojaMZCoupons?.getSavedCode() ||
      (couponBusy ? el("coupon-code")?.value : "");

    invalidateCoupon();
    renderCart();

    if (code && getCart().length) {
      applyCoupon(code);
    } else {
      setCouponMessage("");
    }
  }

  function matches(item, id, variantId) {
    return (
      String(productId(item)) === String(id) &&
      String(item.variant_id || "") === String(variantId || "")
    );
  }

  function changeQuantity(id, variantId, value) {
    const cart = getCart();
    const item = cart.find(current =>
      matches(current, id, variantId)
    );

    if (!item) return;

    const nextQuantity = Number(value);

    if (
      !Number.isSafeInteger(nextQuantity) ||
      nextQuantity < 1
    ) {
      renderCart();
      return;
    }

    item.quantity = nextQuantity;

    if (saveCart(cart)) {
      refreshAfterCartChange();
    }
  }

  function removeItem(id, variantId) {
    const cart = getCart().filter(
      item => !matches(item, id, variantId)
    );

    if (saveCart(cart)) {
      refreshAfterCartChange();
    }
  }

  function clearCart() {
    if (!saveCart([])) return;

    removeCoupon();
    renderCart();
  }

  function handleClick(event) {
    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const row = button.closest(".cart-item");

    if (!row) return;

    const id = row.dataset.id;
    const variantId = row.dataset.variant || "";
    const currentQuantity = quantity(
      row.querySelector(".cart-quantity")?.value
    );

    switch (button.dataset.action) {
      case "increase":
        changeQuantity(id, variantId, currentQuantity + 1);
        break;

      case "decrease":
        changeQuantity(id, variantId, Math.max(1, currentQuantity - 1));
        break;

      case "remove":
        removeItem(id, variantId);
        break;
    }
  }

  function handleQuantityChange(event) {
    const input = event.target.closest(".cart-quantity");

    if (!input) return;

    const row = input.closest(".cart-item");

    if (!row) return;

    changeQuantity(
      row.dataset.id,
      row.dataset.variant || "",
      input.value
    );
  }

  function initialize() {
    if (!el("cart-items")) return;

    el("cart-items").addEventListener("click", handleClick);
    el("cart-items").addEventListener("change", handleQuantityChange);

    el("coupon-message")?.setAttribute("role", "status");
    el("coupon-message")?.setAttribute("aria-live", "polite");

    el("apply-coupon-button")?.addEventListener("click", () => {
      applyCoupon();
    });

    el("coupon-code")?.addEventListener("input", event => {
      event.target.value = event.target.value.toUpperCase();

      removeCoupon(false);
    });

    el("coupon-code")?.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyCoupon();
      }
    });

    // Funciona caso adiciones um botão com este ID.
    el("remove-coupon-button")?.addEventListener(
      "click",
      () => removeCoupon()
    );

    el("clear-cart-button")?.addEventListener("click", async () => {
      const result = await Swal.fire({
        icon: "warning",
        title: "Limpar carrinho?",
        text: "Todos os produtos serão removidos.",
        showCancelButton: true,
        confirmButtonText: "Limpar",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#dc3545"
      });

      if (result.isConfirmed) clearCart();
    });

    window.addEventListener("storage", event => {
      if (
        event.key === CART_KEY ||
        event.key === "loja_mz_coupon" ||
        event.key === null
      ) {
        invalidateCoupon();
        renderCart();
        restoreCoupon();
      }
    });

    renderCart();
    restoreCoupon();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, {
      once: true
    });
  } else {
    initialize();
  }
})();
