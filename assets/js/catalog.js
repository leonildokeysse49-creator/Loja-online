
/* =========================================
   Loja MZ — Catálogo de produtos
   Ver detalhes + Adicionar ao carrinho
   Categorias com Ver produtos
   ========================================= */

(function catalogPage() {
  "use strict";

  const PRODUCTS_PER_PAGE = 12;
  const CART_STORAGE_KEY = "loja_mz_cart";

  let initialized = false;
  let currentPage = 1;
  let requestVersion = 0;
  let categories = [];
  let displayedProducts = [];

  let currentFilters = {
    search: "",
    category: "",
    sort: "newest",
    minPrice: null,
    maxPrice: null,
    inStock: false
  };

  const el = id => document.getElementById(id);

  function language() {
    if (typeof getCurrentLanguage === "function") {
      return getCurrentLanguage() === "en" ? "en" : "pt";
    }

    return "pt";
  }

  function text(pt, en) {
    return language() === "en" ? en : pt;
  }

  function translate(key, fallback) {
    if (typeof getTranslation === "function") {
      const value = getTranslation(key);

      if (value && value !== key) {
        return value;
      }
    }

    return fallback;
  }

  function localizedName(item) {
    return language() === "en" && item?.name_en
      ? item.name_en
      : item?.name_pt || "";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function client() {
    if (
      window.lojaMzSupabaseClient &&
      typeof window.lojaMzSupabaseClient.from === "function"
    ) {
      return window.lojaMzSupabaseClient;
    }

    if (
      typeof supabase !== "undefined" &&
      typeof supabase.from === "function"
    ) {
      return supabase;
    }

    throw new Error(
      text(
        "O cliente Supabase não está disponível.",
        "The Supabase client is unavailable."
      )
    );
  }

  function money(value) {
    return new Intl.NumberFormat(
      language() === "en" ? "en-MZ" : "pt-MZ",
      {
        style: "currency",
        currency: "MZN"
      }
    ).format(Number(value) || 0);
  }

  function pricing(product) {
    const regular = Number(product.price) || 0;

    const hasPromotion =
      product.promotional_price !== null &&
      product.promotional_price !== undefined &&
      product.promotional_price !== "" &&
      Number.isFinite(Number(product.promotional_price)) &&
      Number(product.promotional_price) >= 0 &&
      Number(product.promotional_price) < regular;

    return {
      regular,
      hasPromotion,
      final: hasPromotion
        ? Number(product.promotional_price)
        : regular
    };
  }

  function imageUrl(product) {
    const images = [...(product.product_images || [])].sort(
      (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
    );

    const value = images[0]?.image_url;

    if (value) {
      try {
        const url = new URL(value, window.location.href);

        if (["http:", "https:"].includes(url.protocol)) {
          return url.href;
        }
      } catch (error) {
        console.warn("[Loja MZ] Imagem inválida:", value);
      }
    }

    return "assets/img/placeholders/product.svg";
  }

  function productLink(product) {
    return `produto.html?slug=${encodeURIComponent(product.slug)}`;
  }

  function categoryLink(slug) {
    return `produtos.html?categoria=${encodeURIComponent(slug)}`;
  }

  async function notify(icon, message) {
    if (window.Swal) {
      await window.Swal.fire({
        icon,
        title: message,
        timer: icon === "success" ? 1500 : undefined,
        showConfirmButton: icon !== "success"
      });

      return;
    }

    window.alert(message);
  }

  /* =========================================
     Inicialização
     ========================================= */

  function initialize() {
    if (initialized || !el("products-grid")) return;

    initialized = true;

    readUrlFilters();

    el("apply-filters")?.addEventListener("click", () => {
      applyFormFilters();
    });

    el("clear-filters")?.addEventListener("click", clearFilters);

    el("filter-sort")?.addEventListener("change", () => {
      applyFormFilters();
    });

    el("products-grid").addEventListener("click", event => {
      const button = event.target.closest(
        "button[data-catalog-add]"
      );

      if (!button || button.disabled) return;

      const product = displayedProducts.find(
        item => String(item.id) === button.dataset.catalogAdd
      );

      if (product) {
        addCatalogProduct(product);
      }
    });

    refreshCartBadge();

    loadFilterCategories();
    loadProducts();
  }

  /* =========================================
     Filtros
     ========================================= */

  function readUrlFilters() {
    const params = new URLSearchParams(window.location.search);

    currentFilters.search = params.get("pesquisa") || "";
    currentFilters.category = params.get("categoria") || "";

    if (el("search-input")) {
      el("search-input").value = currentFilters.search;
    }
  }

  function readFormFilters() {
    const minValue = el("filter-min-price").value.trim();
    const maxValue = el("filter-max-price").value.trim();

    const minPrice = minValue === "" ? null : Number(minValue);
    const maxPrice = maxValue === "" ? null : Number(maxValue);

    if (
      (minPrice !== null &&
        (!Number.isFinite(minPrice) || minPrice < 0)) ||
      (maxPrice !== null &&
        (!Number.isFinite(maxPrice) || maxPrice < 0))
    ) {
      throw new Error(
        text(
          "Indica preços iguais ou superiores a zero.",
          "Enter prices greater than or equal to zero."
        )
      );
    }

    if (
      minPrice !== null &&
      maxPrice !== null &&
      minPrice > maxPrice
    ) {
      throw new Error(
        text(
          "O preço mínimo não pode ser maior que o máximo.",
          "The minimum price cannot exceed the maximum."
        )
      );
    }

    currentFilters = {
      search: el("search-input")?.value.trim() || "",
      category: el("filter-category").value,
      sort: el("filter-sort").value,
      minPrice,
      maxPrice,
      inStock: el("filter-in-stock").checked
    };
  }

  function applyFormFilters() {
    try {
      readFormFilters();
      currentPage = 1;
      loadProducts();
    } catch (error) {
      notify("warning", error.message);
    }
  }

  function clearFilters() {
    el("filter-category").value = "";
    el("filter-sort").value = "newest";
    el("filter-min-price").value = "";
    el("filter-max-price").value = "";
    el("filter-in-stock").checked = false;

    if (el("search-input")) {
      el("search-input").value = "";
    }

    currentFilters = {
      search: "",
      category: "",
      sort: "newest",
      minPrice: null,
      maxPrice: null,
      inStock: false
    };

    const url = new URL(window.location.href);
    url.searchParams.delete("categoria");
    url.searchParams.delete("pesquisa");
    window.history.replaceState({}, "", url);

    currentPage = 1;
    loadProducts();
  }

  /* =========================================
     Categorias
     ========================================= */

  async function loadFilterCategories() {
    const select = el("filter-category");
    const menu = el("categories-menu");

    try {
      const { data, error } = await client()
        .from("categories")
        .select("id, name_pt, name_en, slug, is_active")
        .eq("is_active", true)
        .order("name_pt", { ascending: true });

      if (error) throw error;

      categories = data || [];

      select.replaceChildren(
        new Option(
          translate(
            "all_categories",
            text("Todas as categorias", "All categories")
          ),
          ""
        )
      );

      categories.forEach(category => {
        select.add(
          new Option(localizedName(category), category.slug)
        );
      });

      select.value = currentFilters.category;

      if (menu) {
        menu.replaceChildren();

        if (!categories.length) {
          const li = document.createElement("li");
          const message = document.createElement("span");

          message.className = "dropdown-item-text text-muted";
          message.textContent = translate(
            "no_categories",
            text(
              "Nenhuma categoria disponível.",
              "No categories available."
            )
          );

          li.append(message);
          menu.append(li);
        }

        categories.forEach(category => {
          const li = document.createElement("li");
          const link = document.createElement("a");

          link.className =
            "dropdown-item d-flex justify-content-between " +
            "align-items-center gap-3";

          link.href = categoryLink(category.slug);

          const name = document.createElement("span");
          name.textContent = localizedName(category);

          const action = document.createElement("small");
          action.className = "text-primary";
          action.textContent = text(
            "Ver produtos →",
            "View products →"
          );

          link.append(name, action);
          li.append(link);
          menu.append(li);
        });
      }

      updateSubtitle();
    } catch (error) {
      console.error("[Loja MZ] Categorias:", error);

      if (menu) {
        const li = document.createElement("li");
        const message = document.createElement("span");

        message.className = "dropdown-item-text text-danger";
        message.textContent = translate(
          "error_loading_categories",
          text(
            "Erro ao carregar categorias.",
            "Error loading categories."
          )
        );

        li.append(message);
        menu.replaceChildren(li);
      }
    }
  }

  function updateSubtitle() {
    const subtitle = el("page-subtitle");

    if (!subtitle) return;

    const category = categories.find(
      item => item.slug === currentFilters.category
    );

    if (category) {
      subtitle.removeAttribute("data-i18n");
      subtitle.textContent =
        `${translate("category_label", "Categoria:")} ` +
        localizedName(category);

      return;
    }

    subtitle.setAttribute("data-i18n", "all_products");
    subtitle.textContent = translate(
      "all_products",
      text("Todos os produtos disponíveis", "All available products")
    );
  }

  /* =========================================
     Consulta de produtos
     ========================================= */

  function buildProductsQuery() {
    let query = client()
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
      query = query.eq(
        "categories.slug",
        currentFilters.category
      );
    }

    if (currentFilters.search) {
      const escapedSearch = currentFilters.search
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');

      const term = `%${escapedSearch}%`;

      query = query.or(
        `name_pt.ilike."${term}",` +
        `name_en.ilike."${term}",` +
        `description_pt.ilike."${term}"`
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

    switch (currentFilters.sort) {
      case "price_asc":
        query = query.order("price", { ascending: true });
        break;

      case "price_desc":
        query = query.order("price", { ascending: false });
        break;

      case "name_asc":
        query = query.order(
          language() === "en" ? "name_en" : "name_pt",
          { ascending: true }
        );
        break;

      default:
        query = query.order(
          "created_at",
          { ascending: false }
        );
    }

    query = query.order("id", { ascending: true });

    const from = (currentPage - 1) * PRODUCTS_PER_PAGE;

    return query.range(
      from,
      from + PRODUCTS_PER_PAGE - 1
    );
  }

  /* =========================================
     Cartões de produtos
     ========================================= */

  function renderProductCard(product) {
    const name = localizedName(product);
    const categoryName = localizedName(product.categories);
    const price = pricing(product);
    const outOfStock = Number(product.stock) <= 0;
    const detailsUrl = productLink(product);

    const categoryMarkup = product.categories?.slug
      ? `
        <a
          href="${escapeHtml(categoryLink(product.categories.slug))}"
          class="small text-muted"
          title="${escapeHtml(text("Ver produtos", "View products"))}"
        >
          ${escapeHtml(categoryName)}
        </a>
      `
      : "";

    return `
      <div class="col-6 col-md-4 col-xl-3">
        <article class="product-card">
          ${
            price.hasPromotion
              ? `
                <span class="product-badge">
                  ${escapeHtml(translate("promotion", "Promoção"))}
                </span>
              `
              : ""
          }

          <a
            href="${escapeHtml(detailsUrl)}"
            aria-label="${escapeHtml(
              `${text("Ver detalhes de", "View details for")} ${name}`
            )}"
          >
            <img
              src="${escapeHtml(imageUrl(product))}"
              alt="${escapeHtml(name)}"
              loading="lazy"
            >
          </a>

          <div class="product-body">
            ${categoryMarkup}

            <h6 class="mt-1">
              <a
                href="${escapeHtml(detailsUrl)}"
                class="text-reset"
              >
                ${escapeHtml(name)}
              </a>
            </h6>

            <div class="product-price">
              ${escapeHtml(money(price.final))}
            </div>

            ${
              price.hasPromotion
                ? `
                  <div class="product-old-price">
                    ${escapeHtml(money(price.regular))}
                  </div>
                `
                : ""
            }

            <small class="${
              outOfStock ? "text-danger" : "text-success"
            } mt-1 mb-2">
              ${escapeHtml(
                outOfStock
                  ? translate("out_of_stock", "Esgotado")
                  : translate("in_stock", "Em stock")
              )}
            </small>

            <div class="d-grid gap-2 mt-auto pt-2">
              <a
                href="${escapeHtml(detailsUrl)}"
                class="btn btn-outline-primary btn-sm w-100"
              >
                <i class="bi bi-eye me-1" aria-hidden="true"></i>
                ${text("Ver detalhes", "View details")}
              </a>

              <button
                type="button"
                class="btn btn-primary btn-sm w-100"
                data-catalog-add="${escapeHtml(product.id)}"
                ${outOfStock ? "disabled" : ""}
              >
                ${
                  outOfStock
                    ? escapeHtml(
                        translate("out_of_stock", "Esgotado")
                      )
                    : `
                      <i
                        class="bi bi-cart-plus me-1"
                        aria-hidden="true"
                      ></i>
                      ${escapeHtml(
                        translate("add_to_cart", "Adicionar")
                      )}
                    `
                }
              </button>
            </div>
          </div>
        </article>
      </div>
    `;
  }

  async function loadProducts() {
    const version = ++requestVersion;
    const grid = el("products-grid");
    const pagination = el("pagination");

    displayedProducts = [];
    pagination.replaceChildren();

    grid.innerHTML = `
      <div class="col-12 text-center text-muted py-4">
        ${escapeHtml(
          translate("loading_products", "A carregar produtos...")
        )}
      </div>
    `;

    try {
      const { data, error, count } =
        await buildProductsQuery();

      if (version !== requestVersion) return;
      if (error) throw error;

      const total = count || 0;
      const totalPages = Math.max(
        1,
        Math.ceil(total / PRODUCTS_PER_PAGE)
      );

      if (currentPage > totalPages) {
        currentPage = totalPages;
        loadProducts();
        return;
      }

      el("results-count").textContent =
        `${total} ${translate(
          "results_found",
          text("produto(s) encontrado(s)", "product(s) found")
        )}`;

      updateSubtitle();

      displayedProducts = data || [];

      if (!displayedProducts.length) {
        grid.innerHTML = `
          <div class="col-12 text-center products-grid-empty">
            <i
              class="bi bi-box display-4 text-muted"
              aria-hidden="true"
            ></i>

            <h5 class="mt-3">
              ${escapeHtml(
                translate(
                  "no_products_found",
                  "Nenhum produto encontrado"
                )
              )}
            </h5>

            <p class="text-muted">
              ${escapeHtml(
                translate(
                  "no_products_found_text",
                  "Tenta alterar os filtros."
                )
              )}
            </p>
          </div>
        `;

        return;
      }

      grid.innerHTML = displayedProducts
        .map(renderProductCard)
        .join("");

      renderPagination(total);
    } catch (error) {
      if (version !== requestVersion) return;

      console.error("[Loja MZ] Produtos:", error);

      el("results-count").textContent = "";

      grid.innerHTML = `
        <div class="col-12 text-center text-danger py-4">
          ${escapeHtml(
            translate(
              "error_loading_products",
              "Erro ao carregar produtos."
            )
          )}
        </div>
      `;
    }
  }

  /* =========================================
     Carrinho do catálogo
     ========================================= */

  function readCart() {
    const raw = localStorage.getItem(CART_STORAGE_KEY);

    if (!raw) return [];

    const cart = JSON.parse(raw);

    if (
      !Array.isArray(cart) ||
      cart.some(item => !item || typeof item !== "object")
    ) {
      throw new Error(
        text(
          "Os dados do carrinho são inválidos.",
          "The cart data is invalid."
        )
      );
    }

    return cart;
  }

  function refreshCartBadge(cart) {
    const badge = el("cart-count");

    if (!badge) return;

    try {
      const items = cart || readCart();

      badge.textContent = String(
        items.reduce((sum, item) => {
          const quantity = Number(item.quantity);

          return sum + (
            Number.isFinite(quantity)
              ? Math.max(0, Math.floor(quantity))
              : 0
          );
        }, 0)
      );
    } catch (error) {
      console.warn("[Loja MZ] Contador do carrinho:", error);
    }
  }

  async function addCatalogProduct(product) {
    try {
      const stock = Math.max(
        0,
        Math.floor(Number(product.stock) || 0)
      );

      if (stock <= 0) {
        await notify(
          "warning",
          translate("out_of_stock", "Esgotado")
        );

        return;
      }

      const cart = readCart();

      const existing = cart.find(item =>
        String(item.id) === String(product.id) &&
        !item.variant_id
      );

      const existingQuantity = existing
        ? Math.max(0, Math.floor(Number(existing.quantity) || 0))
        : 0;

      if (existingQuantity + 1 > stock) {
        await notify(
          "warning",
          text(
            "Já adicionaste a quantidade disponível deste produto.",
            "You have already added the available quantity."
          )
        );

        return;
      }

      const price = pricing(product);

      const itemData = {
        id: product.id,
        variant_id: null,
        name: localizedName(product),
        variant_name: null,
        price: price.final,
        image: imageUrl(product),
        quantity: existingQuantity + 1
      };

      if (existing) {
        Object.assign(existing, itemData);
      } else {
        cart.push(itemData);
      }

      localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify(cart)
      );

      refreshCartBadge(cart);

      window.dispatchEvent(
        new CustomEvent("cart:updated")
      );

      await notify(
        "success",
        translate(
          "added_to_cart",
          "Produto adicionado ao carrinho"
        )
      );
    } catch (error) {
      console.error("[Loja MZ] Carrinho:", error);

      await notify(
        "error",
        text(
          "Não foi possível atualizar o carrinho. " +
          "Verifica se o navegador permite guardar dados.",
          "Could not update the cart. " +
          "Check whether your browser allows data storage."
        )
      );
    }
  }

  /* =========================================
     Paginação
     ========================================= */

  function renderPagination(total) {
    const container = el("pagination");
    const totalPages = Math.ceil(total / PRODUCTS_PER_PAGE);

    container.replaceChildren();

    if (totalPages <= 1) return;

    function addPage(label, page, disabled, active = false) {
      const li = document.createElement("li");
      li.className = "page-item";

      li.classList.toggle("disabled", disabled);
      li.classList.toggle("active", active);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "page-link";
      button.textContent = label;
      button.disabled = disabled;

      if (active) {
        button.setAttribute("aria-current", "page");
      }

      button.addEventListener("click", () => {
        currentPage = page;
        loadProducts();

        el("products-grid").scrollIntoView({
          behavior: window.matchMedia(
            "(prefers-reduced-motion: reduce)"
          ).matches ? "auto" : "smooth",
          block: "start"
        });
      });

      li.append(button);
      container.append(li);
    }

    addPage("‹", currentPage - 1, currentPage === 1);

    const firstPage = Math.max(1, currentPage - 2);
    const lastPage = Math.min(totalPages, currentPage + 2);

    for (let page = firstPage; page <= lastPage; page++) {
      addPage(
        String(page),
        page,
        false,
        page === currentPage
      );
    }

    addPage(
      "›",
      currentPage + 1,
      currentPage === totalPages
    );
  }

  window.addEventListener("storage", event => {
    if (
      event.key === CART_STORAGE_KEY ||
      event.key === null
    ) {
      refreshCartBadge();
    }
  });

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
