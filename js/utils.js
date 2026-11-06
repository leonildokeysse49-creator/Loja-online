
/* =========================================
   Loja MZ — Utilitários partilhados
   ========================================= */

function formatMZN(value) {
  let symbol = "MT";

  if (
    typeof APP_CONFIG !== "undefined" &&
    APP_CONFIG.currencySymbol
  ) {
    symbol = APP_CONFIG.currencySymbol;
  }

  const number = Number(value);

  return `${symbol} ${
    (Number.isFinite(number) ? number : 0).toLocaleString(
      "pt-MZ",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )
  }`;
}

function getCart() {
  const raw = localStorage.getItem("loja_mz_cart");

  if (!raw) return [];

  const cart = JSON.parse(raw);

  if (
    !Array.isArray(cart) ||
    cart.some(item => !item || typeof item !== "object")
  ) {
    throw new Error("Os dados guardados no carrinho são inválidos.");
  }

  return cart;
}

function saveCart(cart) {
  if (!Array.isArray(cart)) {
    throw new Error("O carrinho deve ser uma lista.");
  }

  localStorage.setItem("loja_mz_cart", JSON.stringify(cart));

  updateCartCount();

  window.dispatchEvent(new CustomEvent("cart:updated"));
}

function getCartTotal() {
  return getCart().reduce((sum, item) => {
    const price = Number(item.price);
    const quantity = Number(item.quantity);

    if (
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      throw new Error("Há um produto com preço ou quantidade inválidos.");
    }

    return sum + price * quantity;
  }, 0);
}

function clearCart() {
  saveCart([]);
}

function addToCart(product, quantity = 1) {
  if (!product || !(product.id || product.product_id)) {
    throw new Error("Produto inválido.");
  }

  const amount = Number(quantity);
  const price = Number(product.price);

  if (
    !Number.isInteger(amount) ||
    amount < 1 ||
    !Number.isFinite(price) ||
    price < 0
  ) {
    throw new Error("Preço ou quantidade inválidos.");
  }

  const cart = getCart();
  const id = product.id || product.product_id;
  const variantId = product.variant_id || null;

  const existing = cart.find(item =>
    String(item.id || item.product_id) === String(id) &&
    String(item.variant_id || "") === String(variantId || "")
  );

  const itemData = {
    id,
    variant_id: variantId,
    name: product.name || product.name_pt || "Produto",
    variant_name: product.variant_name || null,
    price,
    image: product.image || product.main_image || null
  };

  if (existing) {
    const previous = Number(existing.quantity);

    if (!Number.isInteger(previous) || previous < 1) {
      throw new Error("Quantidade inválida no carrinho.");
    }

    Object.assign(existing, itemData, {
      quantity: previous + amount
    });
  } else {
    cart.push({
      ...itemData,
      quantity: amount
    });
  }

  saveCart(cart);

  if (window.Swal) {
    window.Swal.fire({
      icon: "success",
      title: typeof getTranslation === "function"
        ? getTranslation("added_to_cart")
        : "Produto adicionado ao carrinho",
      text: itemData.name,
      timer: 1600,
      showConfirmButton: false
    });
  }
}

function updateCartCount() {
  const badge = document.getElementById("cart-count");

  if (!badge) return;

  try {
    const total = getCart().reduce((sum, item) => {
      const quantity = Number(item.quantity);

      return sum + (
        Number.isInteger(quantity) && quantity > 0
          ? quantity
          : 0
      );
    }, 0);

    badge.textContent = String(total);
  } catch (error) {
    console.error("[Loja MZ] Carrinho:", error);
    badge.textContent = "!";
  }
}

function getProductImage(image) {
  if (image) {
    try {
      const url = new URL(image, window.location.href);

      if (["http:", "https:"].includes(url.protocol)) {
        return url.href;
      }
    } catch (error) {
      console.warn("[Loja MZ] Imagem inválida:", image);
    }
  }

  return "assets/img/placeholders/product.svg";
}
