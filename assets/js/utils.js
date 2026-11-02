function formatMZN(value) {
  const number = Number(value || 0);

  return `${APP_CONFIG.currencySymbol} ${number.toLocaleString("pt-MZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function getCart() {
  return JSON.parse(localStorage.getItem("loja_mz_cart")) || [];
}

function saveCart(cart) {
  localStorage.setItem("loja_mz_cart", JSON.stringify(cart));
  updateCartCount();
}

function addToCart(product, quantity = 1) {
  const cart = getCart();
  const existing = cart.find(item => item.id === product.id);

  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({
      id: product.id,
      name: product.name_pt,
      price: product.price,
      image: product.main_image,
      quantity
    });
  }

  saveCart(cart);

  Swal.fire({
    icon: "success",
    title: "Produto adicionado",
    text: product.name_pt,
    timer: 1800,
    showConfirmButton: false
  });
}

function updateCartCount() {
  const cart = getCart();
  const total = cart.reduce((sum, item) => sum + item.quantity, 0);
  const element = document.getElementById("cart-count");

  if (element) {
    element.textContent = total;
  }
}

function getProductImage(image) {
  return image || "assets/img/placeholders/product.svg";
}