
/* =========================================
   Loja MZ — Gestão de categorias
   ========================================= */

(function categoriesAdminPage() {
  "use strict";

  let categories = [];
  let editingCategoryId = null;
  let categoriesLoaded = false;

  const el = id => document.getElementById(id);

  function getClient() {
    const client = window.lojaMzSupabaseClient;

    if (!client || typeof client.from !== "function") {
      throw new Error(
        "O cliente Supabase não está disponível."
      );
    }

    return client;
  }

  async function showMessage(icon, title, text = "") {
    if (window.Swal) {
      return window.Swal.fire({
        icon,
        title,
        text,
        confirmButtonText: "Entendido"
      });
    }

    window.alert(`${title}\n${text}`);
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

  function setButtonLoading(loading) {
    const button = el("save-category-button");

    if (!button) return;

    button.disabled = loading;

    if (loading) {
      button.innerHTML = `
        <span class="spinner-border spinner-border-sm me-1"></span>
        A guardar...
      `;
    } else {
      button.innerHTML = `
        <i class="bi bi-check2 me-1"></i>
        Guardar
      `;
    }
  }

  function resetForm() {
    editingCategoryId = null;

    el("category-modal-title").textContent = "Nova categoria";

    el("category-name-pt").value = "";
    el("category-name-en").value = "";
    el("category-slug").value = "";
    el("category-parent").value = "";
    el("category-sort-order").value = "0";
    el("category-image").value = "";
    el("category-description-pt").value = "";
    el("category-description-en").value = "";
    el("category-active").checked = true;
  }

  function fillParentOptions(selectedParentId = "") {
    const select = el("category-parent");

    select.replaceChildren(
      new Option("Nenhuma", "")
    );

    categories
      .filter(category => !category.parent_id)
      .forEach(category => {
        select.add(
          new Option(
            category.name_pt,
            category.id
          )
        );
      });

    select.value = selectedParentId || "";
  }

  function renderCategories() {
    const tbody = el("categories-table");

    if (!tbody) return;

    tbody.replaceChildren();

    if (!categories.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");

      cell.colSpan = 6;
      cell.className = "text-center text-muted py-4";
      cell.textContent = "Nenhuma categoria encontrada.";

      row.append(cell);
      tbody.append(row);

      return;
    }

    const mainCategories = categories.filter(
      category => !category.parent_id
    );

    mainCategories.forEach(category => {
      const children = categories.filter(
        item => item.parent_id === category.id
      );

      tbody.append(createCategoryRow(category, false));
      children.forEach(child => {
        tbody.append(createCategoryRow(child, true));
      });
    });
  }

  function createCategoryRow(category, isChild) {
    const row = document.createElement("tr");

    if (isChild) {
      row.classList.add("table-light");
    }

    const nameCell = document.createElement("td");

    if (isChild) {
      nameCell.innerHTML = `
        <i class="bi bi-arrow-return-right me-2 text-muted"></i>
        ${escapeHtml(category.name_pt)}
      `;
    } else {
      nameCell.innerHTML = `
        <strong>${escapeHtml(category.name_pt)}</strong>
      `;
    }

    const slugCell = document.createElement("td");
    slugCell.className = "text-muted small";
    slugCell.textContent = category.slug || "";

    const parentCell = document.createElement("td");
    parentCell.className = "text-muted small";

    const parent = categories.find(
      item => item.id === category.parent_id
    );

    parentCell.textContent = parent?.name_pt || "—";

    const orderCell = document.createElement("td");
    orderCell.textContent = category.sort_order ?? 0;

    const statusCell = document.createElement("td");

    const badge = document.createElement("span");
    badge.className = category.is_active
      ? "badge bg-success"
      : "badge bg-secondary";

    badge.textContent = category.is_active
      ? "Ativa"
      : "Inativa";

    statusCell.append(badge);

    const actionsCell = document.createElement("td");
    actionsCell.className = "text-end";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "btn btn-sm btn-outline-primary me-1";
    editButton.innerHTML = `<i class="bi bi-pencil"></i>`;
    editButton.title = "Editar";

    editButton.addEventListener("click", () => {
      openEditCategoryModal(category);
    });

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = `btn btn-sm ${
      category.is_active
        ? "btn-outline-warning"
        : "btn-outline-success"
    } me-1`;

    toggleButton.innerHTML = category.is_active
      ? `<i class="bi bi-pause"></i>`
      : `<i class="bi bi-play"></i>`;

    toggleButton.title = category.is_active
      ? "Desativar"
      : "Ativar";

    toggleButton.addEventListener("click", () => {
      toggleCategory(category);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "btn btn-sm btn-outline-danger";
    deleteButton.innerHTML = `<i class="bi bi-trash"></i>`;
    deleteButton.title = "Apagar";

    deleteButton.addEventListener("click", () => {
      deleteCategory(category);
    });

    actionsCell.append(
      editButton,
      toggleButton,
      deleteButton
    );

    row.append(
      nameCell,
      slugCell,
      parentCell,
      orderCell,
      statusCell,
      actionsCell
    );

    return row;
  }

  async function loadCategories() {
    const tbody = el("categories-table");

    if (!tbody) return;

    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted py-4">
          A carregar categorias...
        </td>
      </tr>
    `;

    try {
      const { data, error } = await getClient()
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
          is_active
        `)
        .order("sort_order", { ascending: true })
        .order("name_pt", { ascending: true });

      if (error) throw error;

      categories = data || [];
      categoriesLoaded = true;

      fillParentOptions();
      renderCategories();
    } catch (error) {
      console.error(
        "[Loja MZ] Erro ao carregar categorias:",
        error
      );

      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-danger py-4">
            Não foi possível carregar as categorias.
          </td>
        </tr>
      `;

      await showMessage(
        "error",
        "Erro ao carregar categorias",
        error.message || "Tenta novamente."
      );
    }
  }

  function openCreateCategoryModal() {
    resetForm();

    const modal = bootstrap.Modal.getOrCreateInstance(
      el("category-modal")
    );

    modal.show();
  }

  function openEditCategoryModal(category) {
    editingCategoryId = category.id;

    el("category-modal-title").textContent =
      "Editar categoria";

    el("category-name-pt").value =
      category.name_pt || "";

    el("category-name-en").value =
      category.name_en || "";

    el("category-slug").value =
      category.slug || "";

    fillParentOptions(category.parent_id || "");

    el("category-sort-order").value =
      category.sort_order ?? 0;

    el("category-image").value =
      category.image_url || "";

    el("category-description-pt").value =
      category.description_pt || "";

    el("category-description-en").value =
      category.description_en || "";

    el("category-active").checked =
      Boolean(category.is_active);

    const modal = bootstrap.Modal.getOrCreateInstance(
      el("category-modal")
    );

    modal.show();
  }

  async function saveCategory() {
    if (!categoriesLoaded) {
      await showMessage(
        "warning",
        "Aguarda",
        "As categorias ainda estão a carregar."
      );

      return;
    }

    const namePt = el("category-name-pt").value.trim();
    const nameEn = el("category-name-en").value.trim();
    const slugInput = el("category-slug").value.trim();
    const parentId = el("category-parent").value || null;
    const sortOrder = Number(
      el("category-sort-order").value || 0
    );
    const imageUrl = el("category-image").value.trim();
    const descriptionPt =
      el("category-description-pt").value.trim();
    const descriptionEn =
      el("category-description-en").value.trim();
    const isActive = el("category-active").checked;

    if (!namePt) {
      await showMessage(
        "warning",
        "Dados incompletos",
        "Escreve o nome da categoria em português."
      );

      return;
    }

    const slug = slugify(
      slugInput || namePt
    );

    if (!slug) {
      await showMessage(
        "warning",
        "Slug inválido",
        "Escreve um slug válido."
      );

      return;
    }

    const categoryData = {
      name_pt: namePt,
      name_en: nameEn || null,
      slug,
      parent_id: parentId,
      sort_order: Number.isFinite(sortOrder)
        ? sortOrder
        : 0,
      image_url: imageUrl || null,
      description_pt: descriptionPt || null,
      description_en: descriptionEn || null,
      is_active: isActive
    };

    setButtonLoading(true);

    try {
      let response;

      if (editingCategoryId) {
        response = await getClient()
          .from("categories")
          .update(categoryData)
          .eq("id", editingCategoryId)
          .select("id")
          .single();
      } else {
        response = await getClient()
          .from("categories")
          .insert(categoryData)
          .select("id")
          .single();
      }

      if (response.error) throw response.error;

      bootstrap.Modal.getOrCreateInstance(
        el("category-modal")
      ).hide();

      await showMessage(
        "success",
        editingCategoryId
          ? "Categoria atualizada"
          : "Categoria criada",
        "As alterações foram guardadas."
      );

      editingCategoryId = null;
      await loadCategories();
    } catch (error) {
      console.error(
        "[Loja MZ] Erro ao guardar categoria:",
        error
      );

      await showMessage(
        "error",
        "Erro ao guardar",
        error.message || "Tenta novamente."
      );
    } finally {
      setButtonLoading(false);
    }
  }

  async function toggleCategory(category) {
    const newState = !category.is_active;

    const confirm = await showMessage(
      "question",
      newState
        ? "Ativar categoria?"
        : "Desativar categoria?",
      `Pretendes ${
        newState ? "ativar" : "desativar"
      } "${category.name_pt}"?`
    );

    if (confirm?.isConfirmed === false) return;

    try {
      const { error } = await getClient()
        .from("categories")
        .update({ is_active: newState })
        .eq("id", category.id);

      if (error) throw error;

      await loadCategories();
    } catch (error) {
      console.error(
        "[Loja MZ] Erro ao alterar estado:",
        error
      );

      await showMessage(
        "error",
        "Erro ao alterar estado",
        error.message || "Tenta novamente."
      );
    }
  }

  async function deleteCategory(category) {
    const confirm = await showMessage(
      "warning",
      "Apagar categoria?",
      `Pretendes apagar "${category.name_pt}"? Esta ação não pode ser revertida.`
    );

    if (confirm?.isConfirmed === false) return;

    try {
      const { error } = await getClient()
        .from("categories")
        .delete()
        .eq("id", category.id);

      if (error) throw error;

      await showMessage(
        "success",
        "Categoria apagada",
        "A categoria foi removida."
      );

      await loadCategories();
    } catch (error) {
      console.error(
        "[Loja MZ] Erro ao apagar categoria:",
        error
      );

      await showMessage(
        "error",
        "Erro ao apagar",
        error.message || "Tenta novamente."
      );
    }
  }

  function initializeCategoriesAdmin() {
    if (!el("categories-table")) return;

    el("category-slug")?.addEventListener(
      "input",
      () => {
        const value = el("category-slug").value;

        el("category-slug").value = slugify(value);
      }
    );

    el("save-category-button")?.addEventListener(
      "click",
      saveCategory
    );

    el("category-form")?.addEventListener(
      "submit",
      event => {
        event.preventDefault();
        saveCategory();
      }
    );

    loadCategories();
  }

  window.openCreateCategoryModal =
    openCreateCategoryModal;

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initializeCategoriesAdmin,
      { once: true }
    );
  } else {
    initializeCategoriesAdmin();
  }
})();
