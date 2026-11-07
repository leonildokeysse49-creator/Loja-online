
/* =========================================
   Loja MZ — Categorias
   Homepage e página de todas as categorias
   ========================================= */

(function categoryPages() {
  "use strict";

  function init() {
    const container = document.getElementById("home-categories");

    if (!container) return;

    const featuredMode =
      container.dataset.categoryMode === "featured";

    const counter = document.getElementById("categories-total");

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

    function getClient() {
      const client = window.lojaMzSupabaseClient;

      if (!client || typeof client.from !== "function") {
        throw new Error("O cliente Supabase não está disponível.");
      }

      return client;
    }

    function productLink(category, subcategory) {
      const params = new URLSearchParams();
      params.set("categoria", category.slug);

      if (subcategory) {
        params.set("subcategoria", subcategory.slug);
      }

      return `produtos.html?${params.toString()}`;
    }

    function createIcon(name) {
      const icon = document.createElement("i");
      icon.setAttribute("data-lucide", name || "package");
      icon.setAttribute("aria-hidden", "true");
      return icon;
    }

    function refreshIcons() {
      try {
        window.lucide?.createIcons();
      } catch (error) {
        console.warn("[Loja MZ] Não foi possível criar os ícones:", error);
      }
    }

    function showLoading() {
      container.setAttribute("aria-busy", "true");

      container.innerHTML = Array.from({ length: 6 }, () => `
        <div class="col-12 col-md-6 col-lg-4" aria-hidden="true">
          <div class="category-skeleton placeholder-glow">
            <span class="placeholder col-3 mb-4" style="height:52px"></span>
            <div><span class="placeholder col-9 mb-3"></span></div>
            <div><span class="placeholder col-12 mb-2"></span></div>
            <div><span class="placeholder col-8 mb-4"></span></div>
            <div><span class="placeholder col-7"></span></div>
          </div>
        </div>
      `).join("");

      if (counter) {
        counter.textContent = "A carregar categorias...";
      }
    }

    function showError() {
      container.replaceChildren();

      const column = document.createElement("div");
      column.className = "col-12";

      const alert = document.createElement("div");
      alert.className = "alert alert-warning text-center";
      alert.setAttribute("role", "alert");

      const message = document.createElement("p");
      message.className = "mb-3";
      message.textContent = "Não foi possível carregar as categorias.";

      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "btn btn-outline-primary btn-sm";
      retry.textContent = "Tentar novamente";
      retry.addEventListener("click", loadCategories);

      alert.append(message, retry);
      column.append(alert);
      container.append(column);

      if (counter) {
        counter.textContent = "Categorias temporariamente indisponíveis.";
      }
    }

    async function fetchCategories(client) {
      let query = client
        .from("categories")
        .select(`
          id,
          name_pt,
          description_pt,
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
          .order("sort_order", { ascending: true })
          .order("id", { ascending: true })
          .limit(6);
      } else {
        query = query
          .order("sort_order", { ascending: true })
          .order("name_pt", { ascending: true });
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    }

    async function fetchSubcategories(client, categoryIds) {
      if (!categoryIds.length) return [];

      const { data, error } = await client
        .from("subcategories")
        .select("id,category_id,name,slug,icon,sort_order")
        .eq("is_active", true)
        .in("category_id", categoryIds)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;

      return data || [];
    }

    async function fetchPopulatedSubcategoryIds(client, categories) {
      const populatedIds = new Set();
      const pageSize = 500;
      const categoryIds = categories.map(category => category.id);
      let offset = 0;

      try {
        while (true) {
          const { data, error } = await client
            .from("products")
            .select("id,subcategory_id")
            .eq("is_active", true)
            .in("category_id", categoryIds)
            .not("subcategory_id", "is", null)
            .order("id", { ascending: true })
            .range(offset, offset + pageSize - 1);

          if (error) throw error;

          const products = data || [];

          products.forEach(product => {
            populatedIds.add(String(product.subcategory_id));
          });

          if (!products.length) break;

          offset += products.length;
        }

        return populatedIds;
      } catch (error) {
        console.warn(
          "[Loja MZ] Verificação de produtos indisponível. " +
          "Serão mostradas as subcategorias ativas.",
          error
        );

        return null;
      }
    }

    function renderCategories(categories, subcategories, populatedIds) {
      const fragment = document.createDocumentFragment();

      if (!categories.length) {
        const empty = document.createElement("div");
        empty.className = "col-12 text-center text-muted py-5";
        empty.textContent = featuredMode
          ? "Ainda não existem categorias em destaque."
          : "Nenhuma categoria disponível.";

        container.replaceChildren(empty);

        if (counter) counter.textContent = "0 categorias disponíveis.";

        return;
      }

      categories.forEach(category => {
        const items = subcategories.filter(
          item => String(item.category_id) === String(category.id)
        );

        const availableItems =
          featuredMode && populatedIds !== null
            ? items.filter(item => populatedIds.has(String(item.id)))
            : items;

        const visibleItems = featuredMode
          ? availableItems.slice(0, 4)
          : availableItems;

        const column = document.createElement("div");
        column.className = "col-12 col-md-6 col-lg-4";

        const card = document.createElement("article");
        card.className = "category-card";

        const iconBox = document.createElement("div");
        iconBox.className = "category-icon";
        iconBox.append(
          createIcon(
            defaultIcons[category.slug] ||
            category.icon ||
            "package"
          )
        );

        const title = document.createElement("h3");
        title.className = "category-title";
        title.textContent = category.name_pt;

        const description = document.createElement("p");
        description.className = "category-description";
        description.textContent =
          category.description_pt ||
          "Descobre os produtos desta categoria.";

        const links = document.createElement("div");
        links.className = "category-links";

        visibleItems.forEach(subcategory => {
          const link = document.createElement("a");
          link.className = "category-link";
          link.href = productLink(category, subcategory);

          link.append(
            createIcon(subcategory.icon || "tag"),
            document.createTextNode(subcategory.name || "Subcategoria")
          );

          links.append(link);
        });

        if (!visibleItems.length) {
          const message = document.createElement("p");
          message.className = "small text-muted mb-0";

          message.textContent =
            featuredMode && populatedIds !== null
              ? "Novidades em breve."
              : "Consulta os produtos desta categoria.";

          links.append(message);
        }

        const viewAll = document.createElement("a");
        viewAll.className = "category-view-all";
        viewAll.href = productLink(category);
        viewAll.setAttribute(
          "aria-label",
          `Ver categoria: ${category.name_pt}`
        );

        const arrow = document.createElement("i");
        arrow.className = "bi bi-arrow-right";
        arrow.setAttribute("aria-hidden", "true");

        viewAll.append(
          document.createTextNode("Ver categoria "),
          arrow
        );

        card.append(iconBox, title, description, links, viewAll);
        column.append(card);
        fragment.append(column);
      });

      container.replaceChildren(fragment);

      if (counter) {
        counter.textContent =
          `${categories.length} categorias disponíveis.`;
      }

      refreshIcons();
    }

    async function loadCategories() {
      showLoading();

      try {
        const client = getClient();
        const categories = await fetchCategories(client);

        const [subcategories, populatedIds] = await Promise.all([
          fetchSubcategories(
            client,
            categories.map(category => category.id)
          ),
          featuredMode && categories.length
            ? fetchPopulatedSubcategoryIds(client, categories)
            : Promise.resolve(null)
        ]);

        renderCategories(categories, subcategories, populatedIds);
      } catch (error) {
        console.error("[Loja online] Erro ao carregar categorias:", error);
        showError();
      } finally {
        container.setAttribute("aria-busy", "false");
      }
    }

    loadCategories();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
