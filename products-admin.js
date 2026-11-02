/* ==========================================================
   Loja MZ — Gestão administrativa de produtos
   Tabela desktop + cartões mobile
   ========================================================== */

(function productsAdmin() {
  "use strict";

  const PAGE_SIZE = 10;

  let initialized = false;
  let currentPage = 1;
  let products = [];
  let requestVersion = 0;
  let searchTimer = null;
  let mutationBusy = false;

  const el = id => document.getElementById(id);

  function client() {
    const instance = window.lojaMzSupabaseClient;

    if (!instance || typeof instance.from !== "function") {
      throw new Error("O cliente Supabase não está disponível.");
    }

    return instance;
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

  function money(value) {
    return new Intl.NumberFormat("pt-MZ", {
      style: "currency",
      currency: "MZN"
    }).format(Number(value) || 0);
  }

  function productImage(product) {
    const images = [...(product.product_images || [])].sort(
      (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
    );

    const value = images[0]?.image_url;

    if (value) {
      try {
        // URLs relativas são resolvidas a partir da raiz da loja,
        // não da pasta admin.
        const storeRoot = new URL("../", window.location.href);
        const url = new URL(value, storeRoot);

        if (["http:", "https:"].includes(url.protocol)) {
          return url.href;
        }
      } catch (error) {
        console.warn("[Loja MZ] URL de imagem inválido:", value);
      }
    }

    return new URL(
      "../assets/img/placeholders/product.svg",
      window.location.href
    ).href;
  }

  function stockInfo(product) {
    const stock = Number(product.stock) || 0;

    if (stock <= 0) {
      return {
        className: "badge-stock-out",
        text: "Esgotado"
      };
    }

    if (stock <= 5) {
      return {
        className: "badge-stock-low",
        text: "Stock baixo"
      };
    }

    return {
      className: "badge-stock-ok",
      text: "Disponível"
    };
  }

  function badges(product) {
    const stock = stockInfo(product);

    return `
      <span class="badge ${
        product.is_active ? "bg-success" : "bg-secondary"
      }">
        ${product.is_active ? "Ativo" : "Inativo"}
      </span>
      <span class="badge ${stock.className}">
        ${stock.text}
      </span>
    `;
  }

  function actions(product, mobile = false) {
    const id = escapeHtml(product.id);
    const editUrl =
      `produto-form.html?id=${encodeURIComponent(product.id)}`;

    return `
      <div class="product-actions">
        <a
          href="${escapeHtml(editUrl)}"
          class="btn btn-sm btn-outline-primary"
          aria-label="Editar produto"
          title="Editar produto"
        >
          <i class="bi bi-pencil-square" aria-hidden="true"></i>
          ${mobile ? "<span>Editar</span>" : ""}
        </a>

        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          data-action="toggle"
          data-id="${id}"
          aria-label="${product.is_active ? "Desativar" : "Ativar"} produto"
          title="${product.is_active ? "Desativar" : "Ativar"}"
        >
          <i
            class="bi ${
              product.is_active ? "bi-eye-slash" : "bi-eye"
            }"
            aria-hidden="true"
          ></i>
          ${
            mobile
              ? `<span>${product.is_active ? "Ocultar" : "Ativar"}</span>`
              : ""
          }
        </button>

        <button
          type="button"
          class="btn btn-sm btn-outline-danger"
          data-action="delete"
          data-id="${id}"
          aria-label="Apagar produto"
          title="Apagar produto"
        >
          <i class="bi bi-trash" aria-hidden="true"></i>
          ${mobile ? "<span>Apagar</span>" : ""}
        </button>
      </div>
    `;
  }

  function priceMarkup(product) {
    const hasPromotion = product.promotional_price !== null &&
      product.promotional_price !== undefined;

    const finalPrice = hasPromotion
      ? product.promotional_price
      : product.price;

    return `
      ${escapeHtml(money(finalPrice))}
      ${
        hasPromotion
          ? `<small class="product-old-value">${
              escapeHtml(money(product.price))
            }</small>`
          : ""
      }
    `;
  }

  function renderProducts() {
    el("products-table").innerHTML = products.map(product => `
      <tr>
        <td>
          <div class="d-flex align-items-center gap-3">
            <img
              src="${escapeHtml(productImage(product))}"
              alt=""
              class="product-table-image"
              loading="lazy"
            >

            <div class="product-table-name">
              <strong>${escapeHtml(product.name_pt)}</strong>
              <small class="d-block text-muted">
                ${escapeHtml(product.sku || "Sem SKU")}
              </small>
            </div>
          </div>
        </td>

        <td>${escapeHtml(product.categories?.name_pt || "Sem categoria")}</td>

        <td class="product-table-price">
          ${priceMarkup(product)}
        </td>

        <td>${Number(product.stock) || 0}</td>

        <td>
          <div class="d-flex flex-column align-items-start gap-1">
            ${badges(product)}
          </div>
        </td>

        <td class="text-end">${actions(product)}</td>
      </tr>
    `).join("");

    el("products-mobile").innerHTML = products.map(product => `
      <article class="product-mobile-card">
        <div class="product-mobile-header">
          <img
            src="${escapeHtml(productImage(product))}"
            alt=""
            class="product-mobile-image"
            loading="lazy"
          >

          <div class="product-mobile-info">
            <h2 class="product-mobile-name">
              ${escapeHtml(product.name_pt)}
            </h2>

            <p class="product-mobile-meta">
              ${escapeHtml(product.categories?.name_pt || "Sem categoria")}
              · ${escapeHtml(product.sku || "Sem SKU")}
            </p>

            <div class="product-mobile-badges">
              ${badges(product)}
            </div>
          </div>
        </div>

        <dl class="product-mobile-values">
          <div>
            <dt>Preço</dt>
            <dd class="product-price-value">
              ${priceMarkup(product)}
            </dd>
          </div>

          <div>
            <dt>Stock</dt>
            <dd>${Number(product.stock) || 0} un.</dd>
          </div>
        </dl>

        ${actions(product, true)}
      </article>
    `).join("");
  }

  function showMessage(message, error = false) {
    el("products-table").innerHTML = `
      <tr>
        <td
          colspan="6"
          class="text-center py-4 ${error ? "text-danger" : "text-muted"}"
        >
          ${escapeHtml(message)}
        </td>
      </tr>
    `;

    el("products-mobile").innerHTML = `
      <p class="products-message ${error ? "text-danger" : "text-muted"}">
        ${escapeHtml(message)}
      </p>
    `;
  }

  async function loadCategories() {
    try {
      const { data, error } = await client()
        .from("categories")
        .select("id, name_pt")
        .order("name_pt", { ascending: true });

      if (error) throw error;

      const select = el("product-category-filter");

      select.replaceChildren(
        new Option("Todas as categorias", "")
      );

      (data || []).forEach(category => {
        select.add(new Option(category.name_pt, category.id));
      });
    } catch (error) {
      console.error("[Loja MZ] Categorias:", error);

      el("products-filter-warning").textContent =
        "Não foi possível carregar as categorias.";
    }
  }

  async function loadProducts() {
    const version = ++requestVersion;

    showMessage("A carregar produtos...");
    el("products-pagination").replaceChildren();
    el("products-results").textContent = "A carregar...";

    try {
      const search = el("product-search").value.trim();
      const categoryId = el("product-category-filter").value;
      const status = el("product-status-filter").value;

      let query = client()
        .from("products")
        .select(`
          id,
          name_pt,
          slug,
          sku,
          price,
          promotional_price,
          stock,
          is_active,
          created_at,
          categories (
            name_pt
          ),
          product_images (
            image_url,
            sort_order
          )
        `, { count: "exact" });

      if (search) {
        // A expressão OR usa sintaxe PostgREST.
        // Escapa os caracteres especiais da expressão.
        const term = `%${search
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')}%`;

        query = query.or(
          `name_pt.ilike."${term}",sku.ilike."${term}"`
        );
      }

      if (categoryId) {
        query = query.eq("category_id", categoryId);
      }

      if (status) {
        query = query.eq("is_active", status === "active");
      }

      const from = (currentPage - 1) * PAGE_SIZE;

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      // Ignora respostas antigas de pesquisas anteriores.
      if (version !== requestVersion) return;

      if (error) throw error;

      const total = count || 0;
      const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

      if (currentPage > lastPage) {
        currentPage = lastPage;
        await loadProducts();
        return;
      }

      products = data || [];

      el("products-results").textContent =
        `${total} produto(s) encontrado(s)`;

      if (!products.length) {
        showMessage("Nenhum produto encontrado.");
        return;
      }

      renderProducts();
      renderPagination(total);
    } catch (error) {
      if (version !== requestVersion) return;

      console.error("[Loja MZ] Produtos:", error);

      products = [];

      showMessage("Não foi possível carregar os produtos.", true);

      el("products-results").textContent =
        "Falha no carregamento. Atualiza a página para tentar novamente.";
    }
  }

  function renderPagination(total) {
    const container = el("products-pagination");
    const totalPages = Math.ceil(total / PAGE_SIZE);

    container.replaceChildren();

    if (totalPages <= 1) return;

    function addButton(label, page, disabled, active = false) {
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
      });

      li.append(button);
      container.append(li);
    }

    addButton("Anterior", currentPage - 1, currentPage === 1);

    const first = Math.max(1, currentPage - 2);
    const last = Math.min(totalPages, currentPage + 2);

    for (let page = first; page <= last; page++) {
      addButton(String(page), page, false, page === currentPage);
    }

    addButton(
      "Seguinte",
      currentPage + 1,
      currentPage === totalPages
    );
  }

  async function handleAction(event) {
    const button = event.target.closest("button[data-action]");

    if (!button || mutationBusy) return;

    const product = products.find(
      item => item.id === button.dataset.id
    );

    if (!product) return;

    const action = button.dataset.action;

    const result = await Swal.fire({
      icon: action === "delete" ? "warning" : "question",
      title: action === "delete"
        ? "Apagar produto?"
        : `${product.is_active ? "Desativar" : "Ativar"} produto?`,
      text: action === "delete"
        ? `Pretendes apagar "${product.name_pt}"?`
        : `Alterar a publicação de "${product.name_pt}"?`,
      showCancelButton: true,
      confirmButtonText: action === "delete"
        ? "Apagar"
        : "Confirmar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: action === "delete"
        ? "#dc3545"
        : "#0d6efd"
    });

    if (!result.isConfirmed || mutationBusy) return;

    mutationBusy = true;

    document.querySelectorAll(
      "#admin-products-page button[data-action]"
    ).forEach(item => {
      item.disabled = true;
    });

    try {
      let response;

      if (action === "delete") {
        response = await client()
          .from("products")
          .delete()
          .eq("id", product.id)
          .select("id")
          .single();
      } else {
        response = await client()
          .from("products")
          .update({ is_active: !product.is_active })
          .eq("id", product.id)
          .select("id")
          .single();
      }

      if (response.error) throw response.error;

      await loadProducts();

      await Swal.fire({
        icon: "success",
        title: action === "delete"
          ? "Produto apagado"
          : "Estado atualizado",
        timer: 1300,
        showConfirmButton: false
      });
    } catch (error) {
      console.error("[Loja MZ] Operação de produto:", error);

      await Swal.fire({
        icon: "error",
        title: "Não foi possível concluir",
        text: error.message || "Verifica as permissões e tenta novamente."
      });
    } finally {
      mutationBusy = false;

      document.querySelectorAll(
        "#admin-products-page button[data-action]"
      ).forEach(item => {
        item.disabled = false;
      });
    }
  }

  function initialize() {
    if (initialized || !window.currentAdmin) return;

    if (!el("admin-products-page")) return;

    initialized = true;

    el("product-search").addEventListener("input", () => {
      clearTimeout(searchTimer);

      // Invalida qualquer consulta anterior.
      requestVersion++;

      searchTimer = setTimeout(() => {
        currentPage = 1;
        loadProducts();
      }, 300);
    });

    [
      "product-category-filter",
      "product-status-filter"
    ].forEach(id => {
      el(id).addEventListener("change", () => {
        clearTimeout(searchTimer);
        currentPage = 1;
        loadProducts();
      });
    });

    el("admin-products-page").addEventListener(
      "click",
      handleAction
    );

    loadCategories();
    loadProducts();
  }

  document.addEventListener("admin:ready", initialize);

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