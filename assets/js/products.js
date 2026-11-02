/* =========================================
   Loja MZ — Produtos da homepage
   ========================================= */

async function loadCategories() {
  const menu = document.getElementById("categories-menu");
  const grid = document.getElementById("categories-grid");

  try {
    const { data, error } = await supabase
      .from("categories")
      .select("id, name_pt, name_en, slug, image_url, is_active, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      grid.innerHTML = `
        <div class="col-12 text-center text-muted">
          ${getTranslation("no_categories")}
        </div>
      `;
      return;
    }

    menu.innerHTML = data.map(category => `
      <li>
        <a class="dropdown-item" href="produtos.html?categoria=${category.slug}">
          ${category.name_pt}
        </a>
      </li>
    `).join("");

    grid.innerHTML = data.slice(0, 8).map(category => `
      <div class="col-6 col-md-3">
        <a href="produtos.html?categoria=${category.slug}" class="category-card">
          <img src="${getProductImage(category.image_url)}" alt="${category.name_pt}">
          <h6>${category.name_pt}</h6>
        </a>
      </div>
    `).join("");

  } catch (error) {
    console.error("Erro ao carregar categorias:", error);

    grid.innerHTML = `
      <div class="col-12 text-center text-danger">
        ${getTranslation("error_loading_categories")}
      </div>
    `;
  }
}

async function loadFeaturedProducts() {
  const container = document.getElementById("featured-products");

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
        is_featured,
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
      .eq("is_featured", true)
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div class="col-12 text-center text-muted">
          ${getTranslation("no_products")}
        </div>
      `;
      return;
    }

    container.innerHTML = data.map(product => {
      const image = product.product_images?.[0]?.image_url;
      const hasPromotion = Boolean(product.promotional_price);
      const finalPrice = hasPromotion ? product.promotional_price : product.price;
      const outOfStock = product.stock <= 0;

      const productForCart = {
        id: product.id,
        name_pt: product.name_pt,
        price: finalPrice,
        main_image: image
      };

      return `
        <div class="col-6 col-md-4 col-lg-3">
          <div class="product-card">
            ${hasPromotion ? `
              <span class="product-badge">
                ${getTranslation("promotion")}
              </span>
            ` : ""}

            <a href="produto.html?slug=${product.slug}">
              <img src="${getProductImage(image)}" alt="${product.name_pt}">
            </a>

            <div class="product-body">
              <small class="text-muted">
                ${product.categories?.name_pt || ""}
              </small>

              <h6 class="mt-1">
                ${product.name_pt}
              </h6>

              <div class="product-price">
                ${formatMZN(finalPrice)}
              </div>

              ${hasPromotion ? `
                <div class="product-old-price">
                  ${formatMZN(product.price)}
                </div>
              ` : ""}

              <button class="btn btn-primary w-100 mt-2"
                ${outOfStock ? "disabled" : ""}
                onclick='addToCart(${JSON.stringify(productForCart)})'>
                ${outOfStock
                  ? getTranslation("out_of_stock")
                  : `<i class="bi bi-cart-plus me-1"></i> ${getTranslation("add_to_cart")}`}
              </button>
            </div>
          </div>
        </div>
      `;
    }).join("");

  } catch (error) {
    console.error("Erro ao carregar produtos destacados:", error);

    container.innerHTML = `
      <div class="col-12 text-center text-danger">
        ${getTranslation("error_loading_products")}
      </div>
    `;
  }
}