/* =========================================
   Loja MZ — Gestão de categorias
   Administradores e vendedores
   ========================================= */

(function categoriesAdminPage() {
  "use strict";

  const el = id => document.getElementById(id);

  let initialized = false;
  let loaded = false;
  let busy = false;
  let categories = [];
  let editingCategoryId = null;
  let modal = null;

  function client() {
    const instance = window.lojaMzSupabaseClient;

    if (!instance || typeof instance.from !== "function") {
      throw new Error("O cliente Supabase não está disponível.");
    }

    return instance;
  }

  function requireCategoryManager() {
    const canManage =
      typeof window.isAdmin === "function" &&
      typeof window.isVendor === "function" &&
      (window.isAdmin() || window.isVendor());

    if (!canManage) {
      throw new Error(
        "Apenas administradores e vendedores podem gerir categorias."
      );
    }
  }

  function canManageCategory(category) {
    if (!category) return false;

    if (window.isAdmin()) return true;

    return (
      window.isVendor() &&
      String(category.created_by || "") ===
      String(window.currentAdmin?.id || "")
    );
  }

  function requireCategoryOwnership(category) {
    if (!canManageCategory(category)) {
      throw new Error(
        "Só podes alterar categorias que criaste."
      );
    }
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

  function slugify(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function message(icon, title, text = "") {
    return Swal.fire({
      icon,
      title,
      text,
      confirmButtonText: "Entendido"
    });
  }

  async function showError(error) {
    console.error("[Loja online] Categorias:", error);

    let text = error.message || "Tenta novamente.";

    if (error.code === "23505") {
      text =
        "Já existe uma categoria com esses dados. " +
        "Verifica o slug.";
    }

    if (error.code === "23503") {
      text =
        "A categoria está associada a outros registos. " +
        "Desativa-a ou retira-a da página inicial.";
    }

    if (
      error.code === "42501" ||
      /permission denied|row-level security/i.test(
        error.message || ""
      )
    ) {
      text =
        "A tua conta não tem permissão para esta ação. " +
        "Só podes alterar categorias que criaste.";
    }

    await message("error", "Não foi possível concluir", text);
  }

  function setBusy(value) {
    busy = value;

    document.querySelectorAll(
      "#category-form input, #category-form select, " +
      "#category-form textarea, #save-category-button, " +
      "#new-category-button, #categories-table button, " +
      "#category-modal [data-bs-dismiss]"
    ).forEach(node => {
      node.disabled = value;
    });

    el("save-category-button").textContent = value
      ? "A processar..."
      : "Guardar";

    if (!value) updateHomeControl();
  }

  function updateHomeControl() {
    const isChild = Boolean(el("category-parent").value);

    el("category-show-home").disabled = busy || isChild;

    if (isChild) {
      el("category-show-home").checked = false;
    }
  }

  function fillParentOptions(selectedId = "") {
    const select = el("category-parent");

    select.replaceChildren(new Option("Nenhuma", ""));

    categories
      .filter(category =>
        !category.parent_id &&
        category.id !== editingCategoryId
      )
      .forEach(category => {
        select.add(
          new Option(category.name_pt, category.id)
        );
      });

    select.value = selectedId || "";
  }

  function formValue(id) {
    return el(id).value.trim();
  }

  function readOrder(id) {
    const value = Number(el(id).value || 0);

    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value > 2147483647
    ) {
      throw new Error(
        "As ordens devem ser números inteiros positivos ou zero."
      );
    }

    return value;
  }

  function readForm() {
    const name = formValue("category-name-pt");
    const slug = slugify(formValue("category-slug") || name);
    const parentId = el("category-parent").value || null;
    const icon = formValue("category-icon");
    const image = formValue("category-image");

    if (!name || !slug) {
      throw new Error(
        "Preenche o nome em português e um slug válido."
      );
    }

    if (icon && !/^[a-z0-9-]+$/.test(icon)) {
      throw new Error(
        "O ícone deve conter apenas letras minúsculas, " +
        "números e hífen."
      );
    }

    let imageUrl = null;

    if (image) {
      try {
        const url = new URL(image);

        if (!["http:", "https:"].includes(url.protocol)) {
          throw new Error();
        }

        imageUrl = url.href;
      } catch {
        throw new Error(
          "Escreve uma URL de imagem válida."
        );
      }
    }

    if (parentId) {
      const parent = categories.find(
        item => item.id === parentId
      );

      if (
        !parent ||
        parent.parent_id ||
        parentId === editingCategoryId
      ) {
        throw new Error(
          "Seleciona uma categoria pai válida."
        );
      }

      const hasChildren = categories.some(
        item => item.parent_id === editingCategoryId
      );

      if (editingCategoryId && hasChildren) {
        throw new Error(
          "Esta categoria tem categorias filhas. " +
          "Reorganiza-as antes de alterar a categoria pai."
        );
      }
    }

    return {
      name_pt: name,
      name_en: formValue("category-name-en") || null,
      slug,
      parent_id: parentId,
      sort_order: readOrder("category-sort-order"),
      home_order: readOrder("category-home-order"),
      image_url: imageUrl,
      icon: icon || null,
      description_pt:
        formValue("category-description-pt") || null,
      description_en:
        formValue("category-description-en") || null,
      is_active: el("category-active").checked,
      show_on_home:
        !parentId && el("category-show-home").checked,
      created_by: window.currentAdmin?.id || null
    };
  }

  function renderCategories() {
    const tbody = el("categories-table");

    if (!categories.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-muted py-4">
            Nenhuma categoria encontrada.
          </td>
        </tr>
      `;

      return;
    }

    const ordered = [];
    const added = new Set();

    function appendCategory(category, child = false) {
      if (added.has(category.id)) return;

      added.add(category.id);
      ordered.push({ category, child });

      categories
        .filter(item => item.parent_id === category.id)
        .forEach(item => appendCategory(item, true));
    }

    categories
      .filter(item => !item.parent_id)
      .forEach(item => appendCategory(item));

    categories.forEach(item => {
      appendCategory(item, Boolean(item.parent_id));
    });

    tbody.innerHTML = ordered.map(({ category, child }) => {
      const parent = categories.find(
        item => item.id === category.parent_id
      );

      const canManage = canManageCategory(category);

      let homeStatus = "Não aparece";

      if (category.show_on_home) {
        homeStatus = category.parent_id
          ? "Não aparece: categoria filha"
          : category.is_active
            ? `Visível · ordem ${category.home_order}`
            : "Selecionada, mas inativa";
      }

      return `
        <tr class="${child ? "table-light" : ""}">
          <td>
            ${
              child
                ? '<i class="bi bi-arrow-return-right me-2" aria-hidden="true"></i>'
                : ""
            }
            <strong>${escapeHtml(category.name_pt)}</strong>
            ${
              category.icon
                ? `<small class="d-block text-muted">
                    Ícone: ${escapeHtml(category.icon)}
                  </small>`
                : ""
            }
          </td>

          <td class="small text-muted">
            ${escapeHtml(category.slug)}
          </td>

          <td class="small">
            ${escapeHtml(parent?.name_pt || "—")}
          </td>

          <td>${Number(category.sort_order) || 0}</td>

          <td>
            <span class="badge ${
              category.show_on_home &&
              category.is_active &&
              !category.parent_id
                ? "bg-primary"
                : "bg-secondary"
            }">
              ${escapeHtml(homeStatus)}
            </span>
          </td>

          <td>
            <span class="badge ${
              category.is_active ? "bg-success" : "bg-secondary"
            }">
              ${category.is_active ? "Ativa" : "Inativa"}
            </span>
          </td>

          <td class="text-end">
            <div class="d-flex flex-wrap justify-content-end gap-1">
              ${
                canManage
                  ? `
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-primary"
                      data-action="edit"
                      data-id="${escapeHtml(category.id)}"
                      title="Editar"
                      aria-label="Editar categoria"
                    >
                      <i class="bi bi-pencil" aria-hidden="true"></i>
                    </button>

                    ${
                      !category.parent_id
                        ? `
                          <button
                            type="button"
                            class="btn btn-sm btn-outline-info"
                            data-action="home"
                            data-id="${escapeHtml(category.id)}"
                            title="${
                              category.show_on_home
                                ? "Retirar do início"
                                : "Mostrar no início"
                            }"
                            aria-label="${
                              category.show_on_home
                                ? "Retirar do início"
                                : "Mostrar no início"
                            }"
                          >
                            <i class="bi ${
                              category.show_on_home
                                ? "bi-house-dash"
                                : "bi-house-add"
                            }" aria-hidden="true"></i>
                          </button>
                        `
                        : ""
                    }

                    <button
                      type="button"
                      class="btn btn-sm btn-outline-warning"
                      data-action="active"
                      data-id="${escapeHtml(category.id)}"
                      title="${
                        category.is_active
                          ? "Desativar"
                          : "Ativar"
                      }"
                      aria-label="${
                        category.is_active
                          ? "Desativar"
                          : "Ativar"
                      } categoria"
                    >
                      <i class="bi ${
                        category.is_active
                          ? "bi-pause"
                          : "bi-play"
                      }" aria-hidden="true"></i>
                    </button>

                    <button
                      type="button"
                      class="btn btn-sm btn-outline-danger"
                      data-action="delete"
                      data-id="${escapeHtml(category.id)}"
                      title="Apagar categoria"
                      aria-label="Apagar categoria"
                    >
                      <i class="bi bi-trash" aria-hidden="true"></i>
                    </button>
                  `
                  : `
                    <span class="badge bg-secondary">
                      Criada por outro utilizador
                    </span>
                  `
              }
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  async function loadCategories() {
    loaded = false;

    el("categories-table").innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4">
          A carregar categorias...
        </td>
      </tr>
    `;

    try {
      requireCategoryManager();

      const { data, error } = await client()
        .from("categories")
        .select(`
          id,
          name_pt,
          name_en,
          slug,
          description_pt,
          description_en,
          image_url,
          parent_id,
          sort_order,
          is_active,
          icon,
          show_on_home,
          home_order,
          created_by
        `)
        .order("sort_order", { ascending: true })
        .order("name_pt", { ascending: true });

      if (error) throw error;

      categories = data || [];
      loaded = true;

      renderCategories();
    } catch (error) {
      el("categories-table").innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-danger py-4">
            ${escapeHtml(
              error.message || "Erro ao carregar categorias."
            )}
          </td>
        </tr>
      `;

      console.error("[Loja online] Categorias:", error);
    }
  }

  function openModal(category = null) {
    if (busy || !loaded) return;

    try {
      requireCategoryManager();

      if (category) {
        requireCategoryOwnership(category);
      }

      editingCategoryId = category?.id || null;

      el("category-form").reset();

      el("category-modal-title").textContent = category
        ? "Editar categoria"
        : "Nova categoria";

      fillParentOptions(category?.parent_id);

      const values = {
        "category-name-pt": category?.name_pt || "",
        "category-name-en": category?.name_en || "",
        "category-slug": category?.slug || "",
        "category-sort-order": category?.sort_order ?? 0,
        "category-home-order": category?.home_order ?? 0,
        "category-image": category?.image_url || "",
        "category-icon": category?.icon || "",
        "category-description-pt": category?.description_pt || "",
        "category-description-en": category?.description_en || ""
      };

      Object.entries(values).forEach(([id, value]) => {
        el(id).value = value;
      });

      el("category-active").checked = category
        ? Boolean(category.is_active)
        : true;

      el("category-show-home").checked =
        Boolean(category?.show_on_home);

      updateHomeControl();
      modal.show();
    } catch (error) {
      showError(error);
    }
  }

  async function saveCategory(event) {
    event?.preventDefault();

    if (busy || !loaded) return;

    if (!formValue("category-slug")) {
      el("category-slug").value = slugify(
        formValue("category-name-pt")
      );
    }

    if (!el("category-form").reportValidity()) return;

    let payload;

    try {
      requireCategoryManager();
      payload = readForm();
    } catch (error) {
      await showError(error);
      return;
    }

    const id = editingCategoryId;

    setBusy(true);

    try {
      let query = client().from("categories");

      query = id
        ? query.update(payload).eq("id", id)
        : query.insert(payload);

      const { error } = await query
        .select("id")
        .single();

      if (error) throw error;

      setBusy(false);
      modal.hide();

      await loadCategories();

      await message(
        "success",
        id ? "Categoria atualizada" : "Categoria criada",
        "As alterações foram guardadas. " +
        "Recarrega o início para as consultar."
      );
    } catch (error) {
      await showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function mutateCategory(category, action) {
    if (busy) return;

    const home = action === "home";
    const deleting = action === "delete";

    const title = deleting
      ? "Apagar categoria?"
      : home
        ? category.show_on_home
          ? "Retirar da página inicial?"
          : "Mostrar na página inicial?"
        : category.is_active
          ? "Desativar categoria?"
          : "Ativar categoria?";

    const confirmation = await Swal.fire({
      icon: deleting ? "warning" : "question",
      title,
      text: deleting
        ? `"${category.name_pt}". Se só queres ocultar o cartão, ` +
          "usa “Retirar do início”."
        : home
          ? `"${category.name_pt}". Esta ação não apaga produtos.`
          : `"${category.name_pt}".`,
      showCancelButton: true,
      confirmButtonText: deleting ? "Apagar" : "Confirmar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: deleting ? "#dc3545" : "#0d6efd"
    });

    if (!confirmation.isConfirmed || busy) return;

    setBusy(true);

    try {
      requireCategoryManager();
      requireCategoryOwnership(category);

      if (deleting) {
        const checks = await Promise.all([
          client()
            .from("categories")
            .select("id", { count: "exact", head: true })
            .eq("parent_id", category.id),

          client()
            .from("subcategories")
            .select("id", { count: "exact", head: true })
            .eq("category_id", category.id),

          client()
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("category_id", category.id)
        ]);

        for (const check of checks) {
          if (check.error) throw check.error;
        }

        if (checks.some(check => Number(check.count) > 0)) {
          throw new Error(
            "A categoria tem produtos ou subcategorias associados. " +
            "Retira-a do início ou desativa-a."
          );
        }
      }

      const query = deleting
        ? client().from("categories").delete()
        : client().from("categories").update(
            home
              ? { show_on_home: !category.show_on_home }
              : { is_active: !category.is_active }
          );

      const { error } = await query
        .eq("id", category.id)
        .select("id")
        .single();

      if (error) throw error;

      await loadCategories();
    } catch (error) {
      await showError(error);
    } finally {
      setBusy(false);
    }
  }

  function initialize() {
    if (
      initialized ||
      !window.currentAdmin ||
      !el("categories-table")
    ) {
      return;
    }

    initialized = true;

    try {
      requireCategoryManager();
    } catch (error) {
      el("new-category-button").disabled = true;

      el("categories-table").innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-danger py-4">
            ${escapeHtml(error.message)}
          </td>
        </tr>
      `;

      return;
    }

    modal = bootstrap.Modal.getOrCreateInstance(
      el("category-modal")
    );

    el("category-modal").addEventListener(
      "hide.bs.modal",
      event => {
        if (busy) event.preventDefault();
      }
    );

    el("new-category-button").addEventListener(
      "click",
      () => openModal()
    );

    el("save-category-button").addEventListener(
      "click",
      saveCategory
    );

    el("category-form").addEventListener(
      "submit",
      saveCategory
    );

    el("category-parent").addEventListener(
      "change",
      updateHomeControl
    );

    el("category-slug").addEventListener("change", () => {
      el("category-slug").value = slugify(
        el("category-slug").value
      );
    });

    el("categories-table").addEventListener("click", event => {
      const button = event.target.closest("button[data-action]");

      if (!button || busy) return;

      const category = categories.find(
        item => String(item.id) === button.dataset.id
      );

      if (!category) return;

      const action = button.dataset.action;

      if (action === "edit") {
        openModal(category);
      } else if (
        ["home", "active", "delete"].includes(action)
      ) {
        mutateCategory(category, action);
      }
    });

    loadCategories();
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
