
/* =========================================
   Loja MZ — Categorias na homepage
   ========================================= */

(function homeCategories() {
  "use strict";

  const container = document.getElementById("home-categories");

  if (!container) return;

  function getClient() {
    const client = window.lojaMzSupabaseClient;

    if (!client || typeof client.from !== "function") {
      throw new Error(
        "O cliente Supabase não está disponível."
      );
    }

    return client;
  }

  function categoryLink(category) {
    return `produtos.html?categoria=${encodeURIComponent(category.slug)}`;
  }

  function subcategoryLink(category, subcategory) {
    return `produtos.html?categoria=${encodeURIComponent(category.slug)}&subcategoria=${encodeURIComponent(subcategory.slug)}`;
  }

  function createIcon(name) {
    const icon = document.createElement("i");

    icon.setAttribute("data-lucide", name || "package");

    return icon;
  }

  function renderCategories(categories, subcategories) {
    container.replaceChildren();

    if (!categories.length) {
      container.innerHTML = `
        <div class="col-12 text-center text-muted py-5">
          Nenhuma categoria disponível.
        </div>
      `;

      return;
    }

    categories.forEach(category => {
      const items = subcategories.filter(
        item => item.category_id === category.id
      );

      const column = document.createElement("div");
      column.className = "col-12 col-md-6 col-lg-4";

      const card = document.createElement("article");
      card.className = "category-card";

      const iconBox = document.createElement("div");
      iconBox.className = "category-icon";
      iconBox.append(createIcon(category.icon || "package"));

      const title = document.createElement("h3");
      title.className = "category-title";
      title.textContent = category.name_pt;

      const description = document.createElement("p");
      description.className = "category-description";
      description.textContent =
        category.description_pt ||
        "Explora os produtos desta categoria.";

      const links = document.createElement("div");
      links.className = "category-links";

      const visibleItems = items.filter(
        item => item.product_count === null ||
        Number(item.product_count) > 0
      );

      visibleItems.slice(0, 6).forEach(subcategory => {
        const link = document.createElement("a");
        link.className = "category-link";
        link.href = subcategoryLink(category, subcategory);

        link.append(
          createIcon(subcategory.icon || "tag"),
          document.createTextNode(subcategory.name)
        );

        links.append(link);
      });

      if (visibleItems.length > 6) {
        const more = document.createElement("a");
        more.className = "category-link";
        more.href = categoryLink(category);

        more.append(
          createIcon("more-horizontal"),
          document.createTextNode(
            `Ver mais ${visibleItems.length - 6} subcategorias`
          )
        );

        links.append(more);
      }

      if (!visibleItems.length) {
        const empty = document.createElement("p");
        empty.className = "text-muted small mb-0";
        empty.textContent =
          "Produtos desta categoria serão publicados em breve.";

        links.append(empty);
      }

      const viewAll = document.createElement("a");
      viewAll.className = "category-view-all";
      viewAll.href = categoryLink(category);
      viewAll.innerHTML = `
        Ver todos
        <i class="bi bi-arrow-right"></i>
      `;

      card.append(
        iconBox,
        title,
        description,
        links,
        viewAll
      );

      column.append(card);
      container.append(column);
    });

    if (window.lucide?.createIcons) {
      window.lucide.createIcons();
    }
  }

  async function loadCategoriesAndSubcategories() {
    const client = getClient();

    const [
      categoriesResponse,
      subcategoriesResponse
    ] = await Promise.all([
      client
        .from("categories")
        .select(`
          id,
          name_pt,
          description_pt,
          slug,
          icon,
          sort_order
        `)
        .eq("is_active", true)
        .is("parent_id", null)
        .order("sort_order", { ascending: true }),

      client
        .from("subcategories")
        .select(`
          id,
          category_id,
          name,
          slug,
          icon,
          sort_order
        `)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
    ]);

    if (categoriesResponse.error) {
      throw categoriesResponse.error;
    }

    if (subcategoriesResponse.error) {
      throw subcategoriesResponse.error;
    }

    return {
      categories: categoriesResponse.data || [],
      subcategories: (subcategoriesResponse.data || []).map(
        subcategory => ({
          ...subcategory,
          product_count: null
        })
      )
    };
  }

  async function loadProductCounts() {
    const client = getClient();

    const { data, error } = await client
      .from("products")
      .select("subcategory_id")
      .eq("is_active", true);

    if (error) {
      console.warn(
        "[Loja MZ] Não foi possível contar produtos por subcategoria:",
        error
      );

      return null;
    }

    const productCounts = new Map();

    (data || []).forEach(product => {
      if (!product.subcategory_id) return;

      const current =
        productCounts.get(product.subcategory_id) || 0;

      productCounts.set(
        product.subcategory_id,
        current + 1
      );
    });

    return productCounts;
  }

  async function loadHomeCategories() {
    try {
      const result = await loadCategoriesAndSubcategories();

      const productCounts = await loadProductCounts();

      if (productCounts) {
        result.subcategories = result.subcategories.map(
          subcategory => ({
            ...subcategory,
            product_count:
              productCounts.get(subcategory.id) || 0
          })
        );
      }

      renderCategories(
        result.categories,
        result.subcategories
      );
    } catch (error) {
      console.error(
        "[Loja MZ] Erro ao carregar categorias:",
        error
      );

      container.innerHTML = `
        <div class="col-12 text-center text-danger py-5">
          Não foi possível carregar as categorias.
        </div>
      `;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      loadHomeCategories,
      { once: true }
    );
  } else {
    loadHomeCategories();
  }
})();
