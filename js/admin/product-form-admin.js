
/* ==========================================================
   Loja MZ — Gestão administrativa de produtos

   Administrador: gere todos os produtos.
   Vendedor: cria produtos e gere apenas os que criou.
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

  function canManage(product) {
    const currentUserId = window.currentAdmin?.id;

    if (!currentUserId) return false;

    if (window.isAdmin()) return true;

    return product.created_by === currentUserId;
  }

  function actions(product, mobile = false) {
    if (!canManage(product)) {
      return `
        <div class="product-actions text-muted small">
          Sem permissão para editar
        </div>
      `;
    }

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

        <td>${escapeHtml(product.category_name || "Sem categoria")}</td>

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
              ${escapeHtml(product.category_name || "Sem categoria")}
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

  function buildBaseQuery() {
    return client()
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
        created_by,
        category_id,
        product_images (
          image_url,
          sort_order
        )
      `, { count: "exact" });
  }

  function buildFullQuery() {
    return client()
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
        created_by,
        category_id,
        categories (
          name_pt
        ),
        product_images (
          image_url,
          sort_order
        )
      `, { count: "exact" });
  }

  function applyFilters(query) {
    const search = el("product-search").value.trim();
    const categoryId = el("product-category-filter").value;
    const status = el("product-status-filter").value;

    if (search) {
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

    return query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
  }

  async function loadProducts() {
    const version = ++requestVersion;

    showMessage("A carregar produtos...");
    el("products-pagination").replaceChildren();
    el("products-results").textContent = "A carregar...";

    try {
      let response = await applyFilters(buildFullQuery());

      if (response.error) {
        console.warn(
          "[Loja MZ] Consulta completa falhou:",
          response.error
        );

        console.warn(
          "[Loja MZ] A usar consulta básica..."
        );

        response = await applyFilters(buildBaseQuery());
      }

      if (version !== requestVersion) return;

      const { data, error, count } = response;

      if (error) throw error;

      const total = count || 0;
      const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

      if (currentPage > lastPage) {
        currentPage = lastPage;
        await loadProducts();
        return;
      }

      products = (data || []).map(product => ({
        ...product,
        category_name:
          product.categories?.name_pt || null
      }));

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
      console.error("Mensagem:", error.message);
      console.error("Detalhes:", error.details);
      console.error("Sugestão:", error.hint);
      console.error("Código:", error.code);

      products = [];

      showMessage(
        "Não foi possível carregar os produtos: " +
        (error.message || "erro desconhecido."),
        true
      );

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

    if (!canManage(product)) {
      await Swal.fire({
        icon: "warning",
        title: "Ação não permitida",
        text: "Só podes gerir produtos que criaste."
      });

      return;
    }

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

/* =========================================
   Loja MZ — Formulário de produtos

   Administrador: cria e edita qualquer produto.
   Vendedor: cria produtos e edita apenas os seus.
   ========================================= */

(function productFormAdmin() {
  "use strict";

  const BUCKET = "product-images";
  const MAX_IMAGES = 10;
  const MAX_SIZE = 5 * 1024 * 1024;

  const MIME_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  };

  let initialized = false;
  let saving = false;
  let slugWasEdited = false;

  let productId =
    new URLSearchParams(window.location.search).get("id");

  let images = [];
  let originalImageIds = [];

  const element = id => document.getElementById(id);

  function client() {
    const instance = window.lojaMzSupabaseClient;

    if (!instance || typeof instance.from !== "function") {
      throw new Error("O cliente Supabase não está disponível.");
    }

    return instance;
  }

  function showMessage(icon, title, text) {
    return window.Swal.fire({
      icon,
      title,
      text
    });
  }

  function setStatus(message, error = false) {
    const status = element("product-form-status");

    status.textContent = message;
    status.className = error
      ? "alert alert-danger"
      : "alert alert-info";

    status.hidden = !message;
  }

  function slugify(value) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function validImageUrl(value) {
    const url = new URL(value);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Usa um URL HTTP ou HTTPS.");
    }

    if (url.username || url.password) {
      throw new Error("Não uses URLs com credenciais.");
    }

    return url.href;
  }

  function canEditThisProduct(product) {
    const currentUserId = window.currentAdmin?.id;

    if (!currentUserId) return false;

    if (window.isAdmin()) return true;

    return product.created_by === currentUserId;
  }

  async function initialize() {
    if (initialized || !window.currentAdmin) return;

    initialized = true;

    bindEvents();

    try {
      await Promise.all([
        loadOptions("categories", "category", "Seleciona"),
        loadOptions("brands", "brand", "Sem marca")
      ]);

      if (productId) {
        await loadProduct();
      }

      renderImages();

      element("product-fields").disabled = false;
      setStatus("");
    } catch (error) {
      console.error("[Loja MZ] Formulário:", error);
      setStatus(
        error.message || "Não foi possível preparar o formulário.",
        true
      );
    }
  }

  function bindEvents() {
    element("name-pt").addEventListener("input", event => {
      if (!productId && !slugWasEdited) {
        element("slug").value = slugify(event.target.value);
      }
    });

    element("slug").addEventListener("input", () => {
      slugWasEdited = true;
    });

    element("add-image-button").addEventListener(
      "click",
      addImageByUrl
    );

    element("main-image").addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        addImageByUrl();
      }
    });

    element("image-files").addEventListener(
      "change",
      addLocalFiles
    );

    element("product-form").addEventListener("submit", event => {
      event.preventDefault();
      saveProduct();
    });

    window.addEventListener("beforeunload", () => {
      images.forEach(revokePreview);
    });
  }

  async function loadOptions(table, selectId, placeholder) {
    const { data, error } = await client()
      .from(table)
      .select("id, name_pt")
      .order("name_pt", { ascending: true });

    if (error) throw error;

    const select = element(selectId);

    select.replaceChildren(new Option(placeholder, ""));

    (data || []).forEach(row => {
      select.add(new Option(row.name_pt, row.id));
    });
  }

  async function loadProduct() {
    const { data, error } = await client()
      .from("products")
      .select(`
        *,
        product_images (
          id,
          image_url,
          sort_order
        )
      `)
      .eq("id", productId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error("Produto não encontrado.");
    }

    if (!canEditThisProduct(data)) {
      element("product-fields").disabled = true;

      setStatus(
        "Este produto não foi criado por ti. " +
        "Como vendedor, não podes editá-lo.",
        true
      );

      await showMessage(
        "warning",
        "Ação não permitida",
        "Só podes editar produtos que criaste."
      );

      setTimeout(() => {
        window.location.assign("produtos.html");
      }, 2200);

      return;
    }

    element("form-title").textContent = "Editar produto";
    document.title = `Editar ${data.name_pt} — Loja MZ`;

    const mapping = {
      "name-pt": "name_pt",
      "name-en": "name_en",
      "slug": "slug",
      "sku": "sku",
      "description-pt": "description_pt",
      "description-en": "description_en",
      "long-description-pt": "long_description_pt",
      "long-description-en": "long_description_en",
      "price": "price",
      "promotional-price": "promotional_price",
      "stock": "stock",
      "category": "category_id",
      "brand": "brand_id"
    };

    Object.entries(mapping).forEach(([id, column]) => {
      element(id).value = data[column] ?? "";
    });

    element("is-active").checked = data.is_active;
    element("is-featured").checked = data.is_featured;

    images = (data.product_images || [])
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(image => ({
        key: crypto.randomUUID(),
        id: image.id,
        url: image.image_url,
        file: null,
        preview: null,
        storagePath: null,
        label: "Imagem guardada"
      }));

    originalImageIds = images.map(image => image.id);
  }

  function addImageByUrl() {
    const input = element("main-image");
    const value = input.value.trim();

    if (!value) return;

    try {
      if (images.length >= MAX_IMAGES) {
        throw new Error(`O limite é de ${MAX_IMAGES} imagens.`);
      }

      const url = validImageUrl(value);

      if (images.some(image => image.url === url)) {
        throw new Error("Esta imagem já foi adicionada.");
      }

      images.push({
        key: crypto.randomUUID(),
        id: null,
        url,
        file: null,
        preview: null,
        storagePath: null,
        label: "URL externo"
      });

      input.value = "";
      renderImages();
    } catch (error) {
      showMessage("warning", "Imagem não adicionada", error.message);
    }
  }

  function addLocalFiles(event) {
    const files = Array.from(event.target.files || []);
    const rejected = [];

    files.forEach(file => {
      if (images.length >= MAX_IMAGES) {
        rejected.push(`${file.name}: limite de imagens atingido.`);
        return;
      }

      if (!MIME_EXTENSIONS[file.type]) {
        rejected.push(`${file.name}: formato não permitido.`);
        return;
      }

      if (file.size === 0 || file.size > MAX_SIZE) {
        rejected.push(
          `${file.name}: usa um ficheiro entre 1 byte e 5 MB.`
        );
        return;
      }

      const duplicate = images.some(image =>
        image.file &&
        image.file.name === file.name &&
        image.file.size === file.size &&
        image.file.lastModified === file.lastModified
      );

      if (duplicate) {
        rejected.push(`${file.name}: já selecionado.`);
        return;
      }

      images.push({
        key: crypto.randomUUID(),
        id: null,
        url: null,
        file,
        preview: URL.createObjectURL(file),
        storagePath: null,
        label: file.name
      });
    });

    event.target.value = "";
    renderImages();

    if (rejected.length) {
      showMessage(
        "warning",
        "Alguns ficheiros não foram adicionados",
        rejected.join("\n")
      );
    }
  }

  function revokePreview(image) {
    if (image.preview) {
      URL.revokeObjectURL(image.preview);
      image.preview = null;
    }
  }

  function makeButton(text, className, handler) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", handler);

    return button;
  }

  function renderImages() {
    const container = element("images-preview");

    container.replaceChildren();

    element("images-count").textContent =
      `${images.length} de ${MAX_IMAGES} imagens`;

    if (!images.length) {
      const message = document.createElement("p");
      message.className = "text-muted mb-0";
      message.textContent = "Ainda não adicionaste imagens.";

      container.append(message);
      return;
    }

    images.forEach((image, index) => {
      const column = document.createElement("div");
      column.className = "col-6 col-md-4";

      const card = document.createElement("div");
      card.className = "border rounded p-2 h-100";

      const preview = document.createElement("img");
      preview.src = image.preview || image.url;
      preview.alt = `Imagem ${index + 1} do produto`;
      preview.className = "w-100 rounded bg-light";
      preview.style.height = "150px";
      preview.style.objectFit = "contain";

      const label = document.createElement("p");
      label.className = "small text-muted text-break mt-2 mb-2";
      label.textContent = image.label;

      const state = document.createElement("span");
      state.className = index === 0
        ? "badge bg-primary mb-2"
        : "badge bg-secondary mb-2";
      state.textContent = index === 0
        ? "Principal"
        : `Imagem ${index + 1}`;

      const actions = document.createElement("div");
      actions.className = "d-grid gap-2";

      if (index !== 0) {
        actions.append(
          makeButton(
            "Tornar principal",
            "btn btn-sm btn-outline-primary",
            () => {
              images.splice(index, 1);
              images.unshift(image);
              renderImages();
            }
          )
        );
      }

      actions.append(
        makeButton(
          "Remover",
          "btn btn-sm btn-outline-danger",
          () => {
            revokePreview(image);
            images.splice(index, 1);
            renderImages();
          }
        )
      );

      preview.addEventListener("error", () => {
        label.textContent =
          `${image.label} — não foi possível mostrar a pré-visualização.`;
        label.classList.add("text-danger");
      }, { once: true });

      card.append(preview, label, state, actions);
      column.append(card);
      container.append(column);
    });
  }

  function readProductData() {
    const price = Number(element("price").value);
    const stock = Number(element("stock").value);
    const promotionalInput =
      element("promotional-price").value.trim();

    const promotionalPrice = promotionalInput === ""
      ? null
      : Number(promotionalInput);

    if (!Number.isFinite(price) || price < 0) {
      throw new Error(
        "O preço deve ser um número igual ou superior a zero."
      );
    }

    if (!Number.isInteger(stock) || stock < 0) {
      throw new Error(
        "O stock deve ser um número inteiro não negativo."
      );
    }

    if (
      promotionalPrice !== null &&
      (
        !Number.isFinite(promotionalPrice) ||
        promotionalPrice < 0 ||
        promotionalPrice >= price
      )
    ) {
      throw new Error(
        "O preço promocional deve ser não negativo e menor que o preço normal."
      );
    }

    return {
      name_pt: element("name-pt").value.trim(),
      name_en: element("name-en").value.trim() || null,
      slug: element("slug").value.trim(),
      sku: element("sku").value.trim() || null,
      description_pt:
        element("description-pt").value.trim() || null,
      description_en:
        element("description-en").value.trim() || null,
      long_description_pt:
        element("long-description-pt").value.trim() || null,
      long_description_en:
        element("long-description-en").value.trim() || null,
      price,
      promotional_price: promotionalPrice,
      stock,
      category_id: element("category").value,
      brand_id: element("brand").value || null,
      is_active: element("is-active").checked,
      is_featured: element("is-featured").checked
    };
  }

  async function uploadPendingImages() {
    const pending = images.filter(image => image.file && !image.url);

    for (let index = 0; index < pending.length; index++) {
      const image = pending[index];

      element("upload-status").textContent =
        `A enviar imagem ${index + 1} de ${pending.length}...`;

      const extension = MIME_EXTENSIONS[image.file.type];

      const path =
        `${productId}/${crypto.randomUUID()}.${extension}`;

      const { error } = await client()
        .storage
        .from(BUCKET)
        .upload(path, image.file, {
          contentType: image.file.type,
          cacheControl: "3600",
          upsert: false
        });

      if (error) throw error;

      const { data } = client()
        .storage
        .from(BUCKET)
        .getPublicUrl(path);

      image.url = data.publicUrl;
      image.storagePath = path;
      image.label = "Upload enviado";
    }
  }

  async function saveImages() {
    const { data: existingImages, error: loadError } = await client()
      .from("product_images")
      .select("id, image_url, sort_order")
      .eq("product_id", productId);

    if (loadError) throw loadError;

    const existingByUrl = new Map(
      (existingImages || []).map(image => [image.image_url, image])
    );

    for (let index = 0; index < images.length; index++) {
      const image = images[index];

      if (!image.url) {
        throw new Error(
          "Uma imagem ainda não foi enviada. Tenta guardar novamente."
        );
      }

      const existing = existingByUrl.get(image.url);

      if (existing) {
        image.id = existing.id;
        continue;
      }

      const { data, error } = await client()
        .from("product_images")
        .insert({
          product_id: productId,
          image_url: image.url,
          sort_order: index
        })
        .select("id")
        .single();

      if (error) throw error;

      image.id = data.id;
      existingByUrl.set(image.url, {
        id: data.id,
        image_url: image.url
      });
    }

    for (let index = 0; index < images.length; index++) {
      const image = images[index];

      const { error } = await client()
        .from("product_images")
        .update({ sort_order: index })
        .eq("id", image.id)
        .eq("product_id", productId);

      if (error) throw error;
    }

    const retainedIds = new Set(images.map(image => image.id));

    const removedIds = (existingImages || [])
      .map(image => image.id)
      .filter(id => !retainedIds.has(id));

    if (removedIds.length) {
      const { error } = await client()
        .from("product_images")
        .delete()
        .eq("product_id", productId)
        .in("id", removedIds);

      if (error) throw error;
    }

    originalImageIds = images.map(image => image.id);
  }

  async function saveProduct() {
    if (saving) return;

    const form = element("product-form");

    if (!form.reportValidity()) return;

    if (element("main-image").value.trim()) {
      await showMessage(
        "info",
        "Imagem por adicionar",
        "Clica em Adicionar para incluir o URL, ou limpa esse campo."
      );

      return;
    }

    let productData;

    try {
      productData = readProductData();
    } catch (error) {
      await showMessage("warning", "Verifica os dados", error.message);
      return;
    }

    saving = true;
    element("product-fields").disabled = true;
    element("upload-status").textContent = "A guardar produto...";

    try {
      if (productId) {
        const { error } = await client()
          .from("products")
          .update(productData)
          .eq("id", productId)
          .select("id")
          .single();

        if (error) throw error;
      } else {
        productData.created_by = window.currentAdmin.id;

        const { data, error } = await client()
          .from("products")
          .insert(productData)
          .select("id")
          .single();

        if (error) throw error;

        productId = data.id;

        const url = new URL(window.location.href);
        url.searchParams.set("id", productId);
        window.history.replaceState({}, "", url);

        element("form-title").textContent = "Editar produto";
      }

      await uploadPendingImages();
      await saveImages();

      element("upload-status").textContent =
        "Produto e imagens guardados.";

      await showMessage(
        "success",
        "Produto guardado",
        "Os dados e as imagens foram guardados com sucesso."
      );

      window.location.assign("produtos.html");
    } catch (error) {
      console.error("[Loja MZ] Erro ao guardar produto:", error);

      const message = error.code === "23505"
        ? "Já existe um registo com este slug ou SKU."
        : error.message || "Não foi possível concluir a gravação.";

      element("upload-status").textContent =
        "A gravação não foi concluída. Os dados do produto " +
        "e algumas imagens podem já ter sido guardados. " +
        "Podes tentar novamente nesta página.";

      await showMessage("error", "Gravação incompleta", message);
    } finally {
      saving = false;
      element("product-fields").disabled = false;
      renderImages();
    }
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
