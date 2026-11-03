/* =========================================
   Loja MZ — Detalhe do produto
   ========================================= */

const CART_KEY = "loja_mz_cart";

let currentProduct = null;
let selectedVariant = null;
let selectedQuantity = 1;

/* =========================================
   Carrinho partilhado
   ========================================= */

function getCartItems() {
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

function saveCartItems(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartCount(cart);
}

function updateCartCount(cart = getCartItems()) {
  const badge = document.getElementById("cart-count");

  if (!badge) return;

  const total = cart.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0
  );

  badge.textContent = String(total);
}

function addToCart(product, quantity = 1) {
  if (!product || !product.id) return;

  const cart = getCartItems();

  const variantId = product.variant_id || null;

  const existing = cart.find(item =>
    String(item.id) === String(product.id) &&
    String(item.variant_id || "") === String(variantId || "")
  );

  if (existing) {
    existing.quantity =
      (Number(existing.quantity) || 0) + (Number(quantity) || 1);
  } else {
    cart.push({
      id: product.id,
      variant_id: variantId,
      name: product.name || product.name_pt || "Produto",
      variant_name: product.variant_name || null,
      price: Number(product.price) || 0,
      image: product.image || product.main_image || null,
      quantity: Math.max(1, Number(quantity) || 1)
    });
  }

  saveCartItems(cart);

  Swal.fire({
    icon: "success",
    title: getTranslation("added_to_cart"),
    timer: 1600,
    showConfirmButton: false
  });
}

/* =========================================
   Inicialização
   ========================================= */

document.addEventListener("DOMContentLoaded", () => {
  const slug = new URLSearchParams(window.location.search).get("slug");

  if (!slug) {
    showProductError();
    return;
  }

  loadProduct(slug);

  document
    .getElementById("quantity-decrease")
    ?.addEventListener("click", () => changeQuantity(-1));

  document
    .getElementById("quantity-increase")
    ?.addEventListener("click", () => changeQuantity(1));

  document
    .getElementById("product-quantity")
    ?.addEventListener("change", event => {
      setQuantity(Number(event.target.value));
    });

  document
    .getElementById("add-to-cart-button")
    ?.addEventListener("click", () => {
      addCurrentProductToCart();
    });

  document
    .getElementById("buy-now-button")
    ?.addEventListener("click", () => {
      addCurrentProductToCart(true);
    });
});

/* =========================================
   Carregar produto
   ========================================= */

async function loadProduct(slug) {
  const loading = document.getElementById("product-loading");
  const errorBox = document.getElementById("product-error");
  const content = document.getElementById("product-content");

  try {
    const { data, error } = await supabase
      .from("products")
      .select(`
        id,
        name_pt,
        name_en,
        slug,
        sku,
        description_pt,
        description_en,
        long_description_pt,
        long_description_en,
        price,
        promotional_price,
        stock,
        is_active,
        category_id,
        brand_id,
        categories (
          id,
          name_pt,
          name_en,
          slug
        ),
        brands (
          id,
          name_pt,
          name_en,
          slug
        ),
        product_images (
          id,
          image_url,
          sort_order
        ),
        product_variants (
          id,
          name_pt,
          name_en,
          price,
          stock,
          is_active
        )
      `)
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      showProductError();
      return;
    }

    currentProduct = data;

    renderProduct(data);
    renderProductImages(data.product_images || []);
    renderProductVariants(data.product_variants || []);
    loadRelatedProducts(data);

    loading.classList.add("d-none");
    content.classList.remove("d-none");
  } catch (error) {
    console.error("Erro ao carregar produto:", error);
    showProductError();
  }
}

function showProductError() {
  document.getElementById("product-loading").classList.add("d-none");
  document.getElementById("product-content").classList.add("d-none");
  document.getElementById("product-error").classList.remove("d-none");
}

/* =========================================
   Renderizar produto
   ========================================= */

function renderProduct(product) {
  const language = getCurrentLanguage();

  const name = language === "en" && product.name_en
    ? product.name_en
    : product.name_pt;

  const description = language === "en" && product.description_en
    ? product.description_en
    : product.description_pt;

  const longDescription = language === "en" && product.long_description_en
    ? product.long_description_en
    : product.long_description_pt;

  const categoryName = language === "en" && product.categories?.name_en
    ? product.categories.name_en
    : product.categories?.name_pt;

  const hasPromotion = Boolean(product.promotional_price);
  const finalPrice = hasPromotion
    ? product.promotional_price
    : product.price;

  const outOfStock = product.stock <= 0;

  document.title = `${name} — Loja MZ`;

  document.getElementById("breadcrumb-product").textContent = name;
  document.getElementById("product-category").textContent =
    categoryName || "";
  document.getElementById("product-name").textContent = name;
  document.getElementById("product-description").textContent =
    description || "";

  document.getElementById("product-sku").textContent = product.sku
    ? `SKU: ${product.sku}`
    : "";

  const stockElement = document.getElementById("product-stock");

  if (outOfStock) {
    stockElement.textContent = getTranslation("out_of_stock");
    stockElement.classList.add("out-of-stock");
    stockElement.classList.remove("in-stock");
  } else {
    stockElement.textContent =
      `${getTranslation("in_stock")}: ${product.stock}`;
    stockElement.classList.add("in-stock");
    stockElement.classList.remove("out-of-stock");
  }

  document.getElementById("product-price").textContent =
    formatMZN(finalPrice);

  const oldPrice = document.getElementById("product-old-price");
  const discountBadge = document.getElementById("product-discount");

  if (hasPromotion) {
    oldPrice.textContent = formatMZN(product.price);
    oldPrice.classList.remove("d-none");

    const discount = Math.round(
      ((product.price - product.promotional_price) / product.price) * 100
    );

    discountBadge.textContent = `-${discount}%`;
    discountBadge.classList.remove("d-none");
  } else {
    oldPrice.classList.add("d-none");
    discountBadge.classList.add("d-none");
  }

  const longDescriptionContainer = document.getElementById(
    "product-long-description"
  );

  if (longDescription) {
    longDescriptionContainer.innerHTML = longDescription;
  } else {
    longDescriptionContainer.innerHTML =
      `<p>${description || ""}</p>`;
  }

  const addButton = document.getElementById("add-to-cart-button");
  const buyButton = document.getElementById("buy-now-button");

  if (outOfStock) {
    addButton.disabled = true;
    buyButton.disabled = true;
  }
}

/* =========================================
   Galeria
   ========================================= */

function renderProductImages(images) {
  const mainImage = document.getElementById("main-product-image");
  const thumbnails = document.getElementById("product-thumbnails");

  if (!images || images.length === 0) {
    mainImage.src = "assets/img/placeholders/product.svg";
    thumbnails.innerHTML = "";
    return;
  }

  const sortedImages = [...images].sort((a, b) =>
    (a.sort_order || 0) - (b.sort_order || 0)
  );

  mainImage.src = sortedImages[0].image_url;
  mainImage.alt = currentProduct.name_pt;

  thumbnails.innerHTML = sortedImages.map((image, index) => `
    <button
      class="thumbnail ${index === 0 ? "active" : ""}"
      type="button"
      data-image="${image.image_url}"
    >
      <img src="${image.image_url}" alt="${currentProduct.name_pt}">
    </button>
  `).join("");

  thumbnails.querySelectorAll(".thumbnail").forEach(button => {
    button.addEventListener("click", () => {
      thumbnails.querySelectorAll(".thumbnail").forEach(item => {
        item.classList.remove("active");
      });

      button.classList.add("active");
      mainImage.src = button.dataset.image;
    });
  });
}

/* =========================================
   Variações
   ========================================= */

function renderProductVariants(variants) {
  const section = document.getElementById("variants-section");
  const container = document.getElementById("product-variants");

  const activeVariants = (variants || []).filter(
    variant => variant.is_active
  );

  if (!activeVariants.length) {
    section.classList.add("d-none");
    return;
  }

  section.classList.remove("d-none");

  const language = getCurrentLanguage();

  container.innerHTML = activeVariants.map((variant, index) => {
    const label = language === "en" && variant.name_en
      ? variant.name_en
      : variant.name_pt;

    const disabled = variant.stock <= 0;

    return `
      <button
        class="variant-button ${
          index === 0 && !disabled ? "active" : ""
        }"
        type="button"
        data-variant-id="${variant.id}"
        ${disabled ? "disabled" : ""}
      >
        ${label}
      </button>
    `;
  }).join("");

  const firstAvailable = activeVariants.find(
    variant => variant.stock > 0
  );

  if (firstAvailable) {
    selectedVariant = firstAvailable;
  }

  container.querySelectorAll(".variant-button").forEach(button => {
    button.addEventListener("click", () => {
      if (button.disabled) return;

      container.querySelectorAll(".variant-button").forEach(item => {
        item.classList.remove("active");
      });

      button.classList.add("active");

      const variantId = button.dataset.variantId;

      selectedVariant = activeVariants.find(variant =>
        String(variant.id) === String(variantId)
      );

      updateProductPrice();
      updateQuantityLimit();
    });
  });

  updateProductPrice();
  updateQuantityLimit();
}

function updateProductPrice() {
  const priceElement = document.getElementById("product-price");

  if (!currentProduct) return;

  const hasPromotion = Boolean(currentProduct.promotional_price);

  let finalPrice = hasPromotion
    ? currentProduct.promotional_price
    : currentProduct.price;

  if (selectedVariant && selectedVariant.price) {
    finalPrice = selectedVariant.price;
  }

  priceElement.textContent = formatMZN(finalPrice);
}

function getAvailableStock() {
  if (selectedVariant) {
    return selectedVariant.stock;
  }

  return currentProduct?.stock || 0;
}

function updateQuantityLimit() {
  const input = document.getElementById("product-quantity");
  const stock = getAvailableStock();

  input.max = stock > 0 ? stock : 1;

  if (selectedQuantity > stock) {
    selectedQuantity = stock > 0 ? stock : 1;
    input.value = selectedQuantity;
  }
}

/* =========================================
   Quantidade
   ========================================= */

function changeQuantity(value) {
  const input = document.getElementById("product-quantity");
  const stock = getAvailableStock();

  let newQuantity = selectedQuantity + value;

  if (newQuantity < 1) {
    newQuantity = 1;
  }

  if (stock > 0 && newQuantity > stock) {
    newQuantity = stock;
  }

  selectedQuantity = newQuantity;
  input.value = selectedQuantity;
}

function setQuantity(value) {
  const stock = getAvailableStock();

  if (!value || value < 1) {
    value = 1;
  }

  if (stock > 0 && value > stock) {
    value = stock;
  }

  selectedQuantity = value;

  document.getElementById("product-quantity").value = selectedQuantity;
}

/* =========================================
   Adicionar ao carrinho
   ========================================= */

function addCurrentProductToCart(goToCheckout = false) {
  if (!currentProduct) return;

  const stock = getAvailableStock();

  if (stock <= 0) {
    Swal.fire({
      icon: "error",
      title: getTranslation("out_of_stock"),
      text: getTranslation("product_unavailable")
    });

    return;
  }

  const language = getCurrentLanguage();

  const name = language === "en" && currentProduct.name_en
    ? currentProduct.name_en
    : currentProduct.name_pt;

  const hasPromotion = Boolean(currentProduct.promotional_price);

  let finalPrice = hasPromotion
    ? currentProduct.promotional_price
    : currentProduct.price;

  if (selectedVariant && selectedVariant.price) {
    finalPrice = selectedVariant.price;
  }

  const mainImage = document.getElementById("main-product-image").src;

  addToCart(
    {
      id: currentProduct.id,
      variant_id: selectedVariant ? selectedVariant.id : null,
      name,
      variant_name: selectedVariant
        ? (language === "en" && selectedVariant.name_en
            ? selectedVariant.name_en
            : selectedVariant.name_pt)
        : null,
      price: finalPrice,
      image: mainImage
    },
    selectedQuantity
  );

  if (goToCheckout) {
    window.location.href = "carrinho.html";
  }
}

/* =========================================
   Produtos relacionados
   ========================================= */

async function loadRelatedProducts(product) {
  const container = document.getElementById("related-products");

  try {
    const { data, error } = await supabase
      .from("products")
      .select(`
        id,
        name_pt,
        name_en,
        slug,
        price,
        promotional_price,
        stock,
        is_active,
        categories (
          id,
          name_pt,
          name_en,
          slug
        ),
        product_images (
          id,
          image_url,
          sort_order
        )
      `)
      .eq("is_active", true)
      .eq("category_id", product.category_id)
      .neq("id", product.id)
      .order("created_at", { ascending: false })
      .limit(4);

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div class="col-12 text-center text-muted">
          ${getTranslation("no_related_products")}
        </div>
      `;
      return;
    }

    container.innerHTML = data.map(relatedProduct => {
      const image = relatedProduct.product_images?.[0]?.image_url;
      const hasPromotion = Boolean(relatedProduct.promotional_price);
      const finalPrice = hasPromotion
        ? relatedProduct.promotional_price
        : relatedProduct.price;

      const outOfStock = relatedProduct.stock <= 0;

      return `
        <div class="col-6 col-md-4 col-lg-3">
          <div class="product-card">
            ${
              hasPromotion
                ? `<span class="product-badge">
                    ${getTranslation("promotion")}
                  </span>`
                : ""
            }

            <a href="produto.html?slug=${relatedProduct.slug}">
              <img
                src="${getProductImage(image)}"
                alt="${relatedProduct.name_pt}"
              >
            </a>

            <div class="product-body">
              <h6>${relatedProduct.name_pt}</h6>

              <div class="product-price">
                ${formatMZN(finalPrice)}
              </div>

              ${
                hasPromotion
                  ? `<div class="product-old-price">
                      ${formatMZN(relatedProduct.price)}
                    </div>`
                  : ""
              }

              <button
                class="btn btn-primary w-100 mt-2"
                type="button"
                data-add-to-cart
                data-product='${JSON.stringify({
                  id: relatedProduct.id,
                  name: relatedProduct.name_pt,
                  price: finalPrice,
                  image
                }).replace(/'/g, "&#39;")}'
                ${outOfStock ? "disabled" : ""}
              >
                ${
                  outOfStock
                    ? getTranslation("out_of_stock")
                    : `<i class="bi bi-cart-plus me-1"></i> ${
                        getTranslation("add_to_cart")
                      }`
                }
              </button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    container.querySelectorAll("[data-add-to-cart]").forEach(button => {
      button.addEventListener("click", () => {
        try {
          addToCart(JSON.parse(button.dataset.product), 1);
        } catch (error) {
          console.error("[Loja MZ] Produto relacionado:", error);
        }
      });
    });
  } catch (error) {
    console.error("Erro ao carregar produtos relacionados:", error);

    container.innerHTML = `
      <div class="col-12 text-center text-muted">
        ${getTranslation("no_related_products")}
      </div>
    `;
  }
}
