/* =========================================
   Loja MZ — Categorias públicas
   Página inicial e todas as categorias
   ========================================= */

(function categoryPages() {
  "use strict";

  function initialize() {
    const container = document.getElementById("home-categories");

    if (!container) return;

    const featuredMode =
      container.dataset.categoryMode === "featured";

    const counter = document.getElementById("categories-total");

    let requestVersion = 0;
    let cachedCategories = [];
    let cachedSubcategories = [];
    let cachedPopulatedIds = null;
    let hasLoaded = false;

    const defaultIcons = {
      "roupas-e-moda": "shirt",
      "calcados": "footprints",
      "telemoveis-e-smartphones": "smartphone",
      "beleza-e-cuidados-pessoais": "sparkles",
      "electronica": "cpu",
      "acessorios-para-telemoveis": "cable",
      "informatica-e-computadores": "laptop",
      "perifericos": "keyboard",
      "audio-e-som": "headphones",
      "televisores-e-entretenimento": "tv",
      "relogios-e-joalharia": "watch",
      "casa-e-eletrodomesticos": "house",
      "bolsas-malas-e-mochilas": "backpack",
      "desporto-e-fitness": "dumbbell",
      "fotografia-e-video": "camera",
      "material-escolar-e-escritorio": "notebook-pen",
      "pelucias": "heart",
      "acessorios": "shopping-bag"
    };

    function client() {
      const instance = window.lojaMzSupabaseClient;

      if (!instance || typeof instance.from !== "function") {
        throw new Error("O cliente Supabase não está disponível.");
      }

      return instance;
    }

    function english() {
      return (
        typeof getCurrentLanguage === "function" &&
        getCurrentLanguage() === "en"
      );
    }

    function text(pt, en) {
      return english() ? en : pt;
    }

    function categoryName(category) {
      return english()
        ? category.name_en || category.name_pt
        : category.name_pt;
    }

    function categoryDescription(category) {
      return english()
        ? category.description_en ||
          category.description_pt ||
          "Discover products in this category."
        : category.description_pt ||
          "Descobre os produtos desta categoria.";
    }

    function productLink(category, subcategory = null) {
      const params = new URLSearchParams();

      params.set("categoria", category.slug);

      if (subcategory) {
        params.set("subcategoria", subcategory.slug);
      }

      return `produtos.html?${params.toString()}`;
    }

    function createIcon(name) {
      const value = String(name || "package").trim();

      const safeName = /^[a-z0-9-]+$/.test(value)
        ? value
        : "package";

      const icon = document.createElement("i");

      icon.setAttribute("data-lucide", safeName);
      icon.setAttribute("aria-hidden", "true");

      return icon;
    }

    function refreshIcons() {
      try {
        window.lucide?.createIcons();
      } catch (error) {
        console.warn(
          "[Loja MZ] Não foi possível criar os ícones:",
          error
        );
      }
    }

    function safeImageUrl(value) {
      if (!value) return null;

      try {
        const url = new URL(value, window.location.href);

        return ["http:", "https:"].includes(url.protocol)
          ? url.href
          : null;
      } catch {
        return null;
      }
    }

    function createCategoryVisual(category) {
      const box = document.createElement("div");
      box.className = "category-icon";

      const iconName =
        category.icon ||
        defaultIcons[category.slug] ||
        "package";

      const imageUrl = safeImageUrl(category.image_url);

      if (!imageUrl) {
        box.append(createIcon(iconName));
        return box;
      }

      box.classList.add("category-icon-with-image");

      const image = document.createElement("img");

      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      image.width = 64;
      image.height = 64;

      // Mantém a imagem utilizável na página de todas
      // as categorias, mesmo sem os estilos da homepage.
      image.style.width = "100%";
      image.style.height = "100%";
      image.style.objectFit = "cover";
      image.style.borderRadius = "inherit";

      image.addEventListener("error", () => {
        box.classList.remove("category-icon-with-image");
        box.replaceChildren(createIcon(iconName));
        refreshIcons();
      }, { once: true });

      image.src = imageUrl;
      box.append(image);

      return box;
    }

    function showLoading() {
      container.setAttribute("aria-busy", "true");

      container.innerHTML = Array.from({ length: 6 }, () => `
        <div class="col-12 col-md-6 col-lg-4" aria-hidden="true">
          <div class="category-skeleton placeholder-glow">
            <span
              class="placeholder col-3 mb-4"
              style="height:52px"
            ></span>
            <div>
              <span class="placeholder col-9 mb-3"></span>
            </div>
            <div>
              <span class="placeholder col-12 mb-2"></span>
            </div>
            <div>
              <span class="placeholder col-8 mb-4"></span>
            </div>
            <div>
              <span class="placeholder col-7"></span>
            </div>
          </div>
        </div>
      `).join("");

      if (counter) {
        counter.textContent = text(
          "A carregar categorias...",
          "Loading categories..."
        );
      }
    }

    function showError() {
      const column = document.createElement("div");
      column.className = "col-12";

      const alert = document.createElement("div");
      alert.className = "alert alert-warning text-center";
      alert.setAttribute("role", "alert");

      const message = document.createElement("p");
      message.className = "mb-3";
      message.textContent = text(
        "Não foi possível carregar as categorias.",
        "Could not load categories."
      );

      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "btn btn-outline-primary btn-sm";
      retry.textContent = text(
        "Tentar novamente",
        "Try again"
      );

      retry.addEventListener("click", loadCategories);

      alert.append(message, retry);
      column.append(alert);
      container.replaceChildren(column);

      if (counter) {
        counter.textContent = text(
          "Categorias temporariamente indisponíveis.",
          "Categories are temporarily unavailable."
        );
      }
    }

    async function fetchCategories(instance) {
      let query = instance
        .from("categories")
        .select(`
          id,
          name_pt,
          name_en,
          description_pt,
          description_en,
          image_url,
          slug,
          icon,
          sort_order,
          show_on_home,
          home_order
        `)
        .eq("is_active", true)
        .is("parent_id", null);

      if (featuredMode) {
        query = query
          .eq("show_on_home", true)
          .order("home_order", { ascending: true })
          .order("name_pt", { ascending: true })
          .order("id", { ascending: true });
      } else {
        query = query
          .order("sort_order", { ascending: true })
          .order("name_pt", { ascending: true })
          .order("id", { ascending: true });
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    }

    async function fetchSubcategories(instance, categoryIds) {
      if (!categoryIds.length) return [];

      try {
        const { data, error } = await instance
          .from("subcategories")
          .select("id,category_id,name,slug,icon,sort_order")
          .eq("is_active", true)
          .in("category_id", categoryIds)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });

        if (error) throw error;

        return data || [];
      } catch (error) {
        console.warn(
          "[Loja MZ] Subcategorias indisponíveis. " +
          "As categorias principais continuarão visíveis.",
          error
        );

        return [];
      }
    }

    async function fetchPopulatedSubcategoryIds(
      instance,
      categories
    ) {
      if (!categories.length) return new Set();

      const populatedIds = new Set();
      const categoryIds = categories.map(item => item.id);
      const pageSize = 500;

      let offset = 0;

      try {
        while (true) {
          const { data, error } = await instance
            .from("products")
            .select("id,subcategory_id")
            .eq("is_active", true)
            .in("category_id", categoryIds)
            .not("subcategory_id", "is", null)
            .order("id", { ascending: true })
            .range(offset, offset + pageSize - 1);

          if (error) throw error;

          const items = data || [];

          items.forEach(item => {
            populatedIds.add(String(item.subcategory_id));
          });

          if (!items.length) break;

          offset += items.length;
        }

        return populatedIds;
      } catch (error) {
        console.warn(
          "[Loja MZ] Não foi possível verificar os produtos " +
          "das subcategorias. Serão mostradas as subcategorias ativas.",
          error
        );

        return null;
      }
    }

    function renderCategories(
      categories,
      subcategories,
      populatedIds
    ) {
      if (!categories.length) {
        const empty = document.createElement("div");

        empty.className = "col-12 text-center text-muted py-5";
        empty.textContent = featuredMode
          ? text(
              "Ainda não existem categorias em destaque.",
              "There are no featured categories yet."
            )
          : text(
              "Nenhuma categoria disponível.",
              "No categories available."
            );

        container.replaceChildren(empty);

        if (counter) {
          counter.textContent = text(
            "0 categorias disponíveis.",
            "0 categories available."
          );
        }

        return;
      }

      const fragment = document.createDocumentFragment();
      const subcategoriesByCategory = new Map();

      subcategories.forEach(item => {
        const key = String(item.category_id);

        if (!subcategoriesByCategory.has(key)) {
          subcategoriesByCategory.set(key, []);
        }

        subcategoriesByCategory.get(key).push(item);
      });

      categories.forEach(category => {
        const items =
          subcategoriesByCategory.get(String(category.id)) || [];

        const availableItems =
          featuredMode && populatedIds !== null
            ? items.filter(item =>
                populatedIds.has(String(item.id))
              )
            : items;

        const visibleItems = featuredMode
          ? availableItems.slice(0, 4)
          : availableItems;

        const name = categoryName(category);

        const column = document.createElement("div");
        column.className = "col-12 col-md-6 col-lg-4";

        const card = document.createElement("article");
        card.className = "category-card";

        const visual = createCategoryVisual(category);

        const title = document.createElement("h3");
        title.className = "category-title";
        title.textContent = name;

        const description = document.createElement("p");
        description.className = "category-description";
        description.textContent = categoryDescription(category);

        const links = document.createElement("div");
        links.className = "category-links";

        visibleItems.forEach(subcategory => {
          const link = document.createElement("a");
          link.className = "category-link";
          link.href = productLink(category, subcategory);

          link.append(
            createIcon(subcategory.icon || "tag"),
            document.createTextNode(
              subcategory.name ||
              text("Subcategoria", "Subcategory")
            )
          );

          links.append(link);
        });

        if (!visibleItems.length) {
          const message = document.createElement("p");
          message.className = "small text-muted mb-0";
          message.textContent = text(
            "Consulta os produtos desta categoria.",
            "Browse products in this category."
          );

          links.append(message);
        }

        const viewAll = document.createElement("a");
        viewAll.className = "category-view-all";
        viewAll.href = productLink(category);

        viewAll.setAttribute(
          "aria-label",
          text(
            `Ver categoria: ${name}`,
            `View category: ${name}`
          )
        );

        const arrow = document.createElement("i");
        arrow.className = "bi bi-arrow-right";
        arrow.setAttribute("aria-hidden", "true");

        viewAll.append(
          document.createTextNode(
            text("Ver categoria ", "View category ")
          ),
          arrow
        );

        card.append(
          visual,
          title,
          description,
          links,
          viewAll
        );

        column.append(card);
        fragment.append(column);
      });

      container.replaceChildren(fragment);

      if (counter) {
        counter.textContent = text(
          `${categories.length} categorias disponíveis.`,
          `${categories.length} categories available.`
        );
      }

      refreshIcons();
    }

    async function loadCategories() {
      const version = ++requestVersion;

      showLoading();

      try {
        const instance = client();
        const categories = await fetchCategories(instance);

        if (version !== requestVersion) return;

        const [subcategories, populatedIds] = await Promise.all([
          fetchSubcategories(
            instance,
            categories.map(category => category.id)
          ),
          featuredMode && categories.length
            ? fetchPopulatedSubcategoryIds(instance, categories)
            : Promise.resolve(null)
        ]);

        if (version !== requestVersion) return;

        cachedCategories = categories;
        cachedSubcategories = subcategories;
        cachedPopulatedIds = populatedIds;
        hasLoaded = true;

        renderCategories(
          categories,
          subcategories,
          populatedIds
        );
      } catch (error) {
        if (version !== requestVersion) return;

        console.error(
          "[Loja MZ] Erro ao carregar categorias:",
          error
        );

        showError();
      } finally {
        if (version === requestVersion) {
          container.setAttribute("aria-busy", "false");
        }
      }
    }

    // Atualiza os textos dos cartões após a seleção do idioma.
    document.addEventListener("click", event => {
      if (!(event.target instanceof Element)) return;

      if (!event.target.closest("[data-language]")) return;

      window.setTimeout(() => {
        if (!hasLoaded) return;

        renderCategories(
          cachedCategories,
          cachedSubcategories,
          cachedPopulatedIds
        );
      }, 0);
    });

    loadCategories();
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
