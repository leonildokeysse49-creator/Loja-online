
/* =========================================
   Loja MZ — Formulário de produtos
   URL + upload de imagens
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
