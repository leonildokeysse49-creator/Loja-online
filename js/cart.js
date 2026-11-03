/* =========================================
   Loja MZ — Página do carrinho
   ========================================= */

(function cartPage() {
  "use strict";

  const CART_KEY = "loja_mz_cart";

  const el = id => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
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
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartCount(cart);
  }

  function updateCartCount(cart = getCart()) {
    const badge = el("cart-count");

    if (!badge) return;

    const total = cart.reduce(
      (sum, item) => sum + (Number(item.quantity) || 0),
      0
    );

    badge.textContent = String(total);
  }

  function money(value) {
    return new Intl.NumberFormat("pt-MZ", {
      style: "currency",
      currency: "MZN"
    }).format(Number(value) || 0);
  }

  function productImage(item) {
    return item.image || "assets/img/placeholders/product.svg";
  }

  function renderCart() {
    const cart = getCart();
    const empty = el("cart-empty");
    const content = el("cart-content");
    const items = el("cart-items");
    const subtitle = el("cart-subtitle");

    updateCartCount(cart);

    if (!cart.length) {
      empty.classList.remove("d-none");
      content.classList.add("d-none");
      items.innerHTML = "";
      subtitle.textContent = "";
      return;
    }

    empty.classList.add("d-none");
    content.classList.remove("d-none");

    const totalItems = cart.reduce(
      (sum, item) => sum + (Number(item.quantity) || 0),
      0
    );

    subtitle.textContent =
      totalItems === 1
        ? "1 artigo no carrinho"
        : `${totalItems} artigos no carrinho`;

    items.innerHTML = cart.map(item => {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const price = Number(item.price) || 0;
      const lineTotal = price * quantity;

      return `
        <div
          class="cart-item"
          data-id="${escapeHtml(item.id)}"
          data-variant="${escapeHtml(item.variant_id || "")}"
        >
          <div class="d-flex gap-3">
            <img
              src="${escapeHtml(productImage(item))}"
              alt="${escapeHtml(item.name || "Produto")}"
              class="cart-item-image"
              loading="lazy"
            >

            <div class="flex-grow-1 min-width-0">
              <h6 class="cart-item-name">
                ${escapeHtml(item.name || "Produto")}
              </h6>

              ${
                item.variant_name
                  ? `<p class="cart-item-variant">
                      ${escapeHtml(item.variant_name)}
                    </p>`
                  : ""
              }

              <p class="cart-item-price">
                ${escapeHtml(money(price))}
              </p>

              <div class="d-flex flex-wrap align-items-center gap-2">
                <div class="d-flex align-items-center gap-1">
                  <button
                    type="button"
                    class="btn btn-outline-secondary btn-sm"
                    data-action="decrease"
                    aria-label="Diminuir quantidade"
                  >
                    <i class="bi bi-dash" aria-hidden="true"></i>
                  </button>

                  <input
                    type="number"
                    class="form-control cart-quantity"
                    value="${quantity}"
                    min="1"
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
                ${escapeHtml(money(lineTotal))}
              </strong>
            </div>
          </div>
        </div>
      `;
    }).join("");

    updateTotals(cart);
  }

  function updateTotals(cart = getCart()) {
    const subtotal = cart.reduce((sum, item) => {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      return sum + (Number(item.price) || 0) * quantity;
    }, 0);

    el("cart-subtotal").textContent = money(subtotal);
    el("cart-total").textContent = money(subtotal);
  }

  function changeQuantity(productId, variantId, quantity) {
    const cart = getCart();

    const item = cart.find(current =>
      String(current.id) === String(productId) &&
      String(current.variant_id || "") === String(variantId || "")
    );

    if (!item) return;

    item.quantity = Math.max(1, Number(quantity) || 1);

    saveCart(cart);
    renderCart();
  }

  function removeItem(productId, variantId) {
    const cart = getCart().filter(item =>
      !(
        String(item.id) === String(productId) &&
        String(item.variant_id || "") === String(variantId || "")
      )
    );

    saveCart(cart);
    renderCart();
  }

  function clearCart() {
    saveCart([]);
    renderCart();
  }

  function handleClick(event) {
    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const row = button.closest(".cart-item");

    if (!row) return;

    const productId = row.dataset.id;
    const variantId = row.dataset.variant || "";
    const action = button.dataset.action;
    const input = row.querySelector(".cart-quantity");
    const currentQuantity = Number(input?.value) || 1;

    if (action === "increase") {
      changeQuantity(productId, variantId, currentQuantity + 1);
    }

    if (action === "decrease") {
      changeQuantity(productId, variantId, currentQuantity - 1);
    }

    if (action === "remove") {
      removeItem(productId, variantId);
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

    el("clear-cart-button")?.addEventListener("click", () => {
      Swal.fire({
        icon: "warning",
        title: "Limpar carrinho?",
        text: "Todos os produtos serão removidos.",
        showCancelButton: true,
        confirmButtonText: "Limpar",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#dc3545"
      }).then(result => {
        if (result.isConfirmed) clearCart();
      });
    });

    renderCart();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      { once: true }
    );
  } else {
    initialize();
  }
})();
