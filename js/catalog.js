/* =========================================
   Loja MZ — Catálogo de produtos
   ========================================= */

const PRODUCTS_PER_PAGE = 12;

let currentPage = 1;

let currentFilters = {
  search: "",
  category: "",
  sort: "newest",
  minPrice: null,
  maxPrice: null,
  inStock: false
};

document.addEventListener("DOMContentLoaded", () => {
  readUrlFilters();
  loadFilterCategories();
  loadProducts();

  document.getElementById("apply-filters").addEventListener("click", () => {
    currentPage = 1;
    readFormFilters();
    loadProducts();
  });

  document.getElementById("clear-filters").addEventListener("click", () => {
    clearFilters();
  });

  document.getElementById("filter-sort").addEventListener("change", () => {
    currentPage = 1;
    readFormFilters();
    loadProducts();
  });
});

/* =========================================
   Filtros
   ========================================= */

function readUrlFilters() {
  const params = new URLSearchParams(window.location.search);

  currentFilters.search = params.get("pesquisa") || "";
  currentFilters.category = params.get("categoria") || "";

  const searchInput = document.getElementById("search-input");

  if (searchInput && currentFilters.search) {
    searchInput.value = currentFilters.search;
  }
}

function readFormFilters() {
  currentFilters.category = document.getElementById("filter-category").value;
  currentFilters.sort = document.getElementById("filter-sort").value;

  const minPrice = document.getElementById("filter-min-price").value;
  const maxPrice = document.getElementById("filter-max-price").value;

  currentFilters.minPrice = minPrice ? Number(minPrice) : null;
  currentFilters.maxPrice = maxPrice ? Number(maxPrice) : null;

  currentFilters.inStock = document.getElementById("filter-in-stock").checked;

  const searchInput = document.getElementById("search-input").value.trim();

  if (searchInput) {
    currentFilters.search = searchInput;
  }
}

function clearFilters() {
  document.getElementById("filter-category").value = "";
  document.getElementById("filter-sort").value = "newest";
  document.getElementById("filter-min-price").value = "";
  document.getElementById("filter-max-price").value = "";
  document.getElementById("filter-in-stock").checked = false;
  document.getElementById("search-input").value = "";

  currentFilters = {
    search: "",
    category: "",
    sort: "newest",
    minPrice: null,
    maxPrice: null,
    inStock: false
  };

  currentPage = 1;
  loadProducts();
}

/* =========================================
   Categorias dos filtros
   ========================================= */

async function loadFilterCategories() {
  const select = document.getElementById("filter-category");
  const menu = document.getElementById("categories-menu");

  try {
    const { data, error } = await supabase
      .from("categories")
      .select("id, name_pt, name_en, slug, is_active")
      .eq("is_active", true)
      .order("name_pt", { ascending: true });

    if (error) throw error;

    select.innerHTML = `
      <option value="">
        ${getTranslation("all_categories")}
      </option>

      ${data.map(category => `
        <option value="${category.slug}"
          ${category.slug === currentFilters.category ? "selected" : ""}>
          ${category.name_pt}
        </option>
      `).join("")}
    `;

    menu.innerHTML = data.map(category => `
      <li>
        <a class="dropdown-item" href="produtos.html?categoria=${category.slug}">
          ${category.name_pt}
        </a>
      </li>
    `).join("");

  } catch (error) {
    console.error("Erro ao carregar categorias dos filtros:", error);
  }
}

/* =========================================
   Consulta de produtos
   ========================================= */

function buildProductsQuery() {
  let query = supabase
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
      created_at,
      categories!inner (
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
    `, { count: "exact" })
    .eq("is_active", true);

  if (currentFilters.category) {
    query = query.eq("categories.slug", currentFilters.category);
  }

  if (currentFilters.search) {
    const term = `%${currentFilters.search}%`;

    query = query.or(
      `name_pt.ilike.${term},name_en.ilike.${term},description_pt.ilike.${term}`
    );
  }

  if (currentFilters.minPrice !== null) {
    query = query.gte("price", currentFilters.minPrice);
  }

  if (currentFilters.maxPrice !== null) {
    query = query.lte("price", currentFilters.maxPrice);
  }

  if (currentFilters.inStock) {
    query = query.gt("stock", 0);
  }

  if (currentFilters.sort === "price_asc") {
    query = query.order("price", { ascending: true });
  } else if (currentFilters.sort === "price_desc") {
    query = query.order("price", { ascending: false });
  } else if (currentFilters.sort === "name_asc") {
    query = query.order("name_pt", { ascending: true });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const from = (currentPage - 1) * PRODUCTS_PER_PAGE;
  const to = from + PRODUCTS_PER_PAGE - 1;

  return query.range(from, to);
}

/* =========================================
   Carregar produtos
   ========================================= */

async function loadProducts() {
  const grid = document.getElementById("products-grid");
  const pagination = document.getElementById("pagination");
  const resultsCount = document.getElementById("results-count");
  const subtitle = document.getElementById("page-subtitle");

  grid.innerHTML = `
    <div class="col-12 text-center text-muted">
      ${getTranslation("loading_products")}
    </div>
  `;

  pagination.innerHTML = "";

  try {
    const { data, error, count } = await buildProductsQuery();

    if (error) throw error;

    const total = count || 0;

    resultsCount.textContent = `${total} ${getTranslation("results_found")}`;

    if (currentFilters.category && data && data.length > 0) {
      const categoryName = data[0].categories?.name_pt;

      subtitle.textContent = `${getTranslation("category_label")} ${categoryName}`;
    } else {
      subtitle.textContent = getTranslation("all_products");
    }

    if (!data || data.length === 0) {
      grid.innerHTML = `
        <div class="col-12 text-center products-grid-empty">
          <i class="bi bi-box display-4 text-muted"></i>

          <h5 class="mt-3">
            ${getTranslation("no_products_found")}
          </h5>

          <p class="text-muted">
            ${getTranslation("no_products_found_text")}
          </p>
        </div>
      `;

      return;
    }

    grid.innerHTML = data.map(product => {
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
        <div class="col-6 col-md-4 col-xl-3">
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

    renderPagination(total);

  } catch (error) {
    console.error("Erro ao carregar produtos:", error);

    grid.innerHTML = `
      <div class="col-12 text-center text-danger">
        ${getTranslation("error_loading_products")}
      </div>
    `;
  }
}

/* =========================================
   Paginação
   ========================================= */

function renderPagination(total) {
  const pagination = document.getElementById("pagination");
  const totalPages = Math.ceil(total / PRODUCTS_PER_PAGE);

  if (totalPages <= 1) {
    return;
  }

  let html = `
    <li class="page-item ${currentPage === 1 ? "disabled" : ""}">
      <button class="page-link" data-page="${currentPage - 1}">
        <i class="bi bi-chevron-left"></i>
      </button>
    </li>
  `;

  for (let page = 1; page <= totalPages; page++) {
    html += `
      <li class="page-item ${page === currentPage ? "active" : ""}">
        <button class="page-link" data-page="${page}">
          ${page}
        </button>
      </li>
    `;
  }

  html += `
    <li class="page-item ${currentPage === totalPages ? "disabled" : ""}">
      <button class="page-link" data-page="${currentPage + 1}">
        <i class="bi bi-chevron-right"></i>
      </button>
    </li>
  `;

  pagination.innerHTML = html;

  pagination.querySelectorAll("button[data-page]").forEach(button => {
    button.addEventListener("click", () => {
      const page = Number(button.dataset.page);

      if (page >= 1 && page <= totalPages) {
        currentPage = page;
        loadProducts();
        window.scrollTo({
          top: 300,
          behavior: "smooth"
        });
      }
    });
  });
}