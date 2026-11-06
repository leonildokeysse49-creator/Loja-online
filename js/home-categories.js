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

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function categoryLink(category) {
    return `produtos.html?categoria=${encodeURIComponent(category.slug)}`;
  }

  function subcategoryLink(category, subcategory) {
    return `produtos.html?categoria=${encodeURIComponent(category.slug)}&subcategoria=${encodeURIComponent(subcategory.slug)}`;
  }

  function createIcon(name, className = "") {
    const icon = document.createElement("i");

    icon.setAttribute("data-lucide", name || "package");
    icon.className = className;

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

      items.slice(0, 6).forEach(subcategory => {
        const link = document.createElement("a");
        link.className = "category-link";
        link.href = subcategoryLink(category, subcategory);

        link.append(
          createIcon(subcategory.icon || "tag"),
          document.createTextNode(subcategory.name)
        );

        links.append(link);
      });

      if (items.length > 6) {
        const more = document.createElement("a");
        more.className = "category-link";
        more.href = categoryLink(category);
        more.append(
          createIcon("more-horizontal"),
          document.createTextNode(
            `Ver mais ${items.length - 6} subcategorias`
          )
        );

        links.append(more);
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

  async function loadHomeCategories() {
    try {
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

      renderCategories(
        categoriesResponse.data || [],
        subcategoriesResponse.data || []
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
