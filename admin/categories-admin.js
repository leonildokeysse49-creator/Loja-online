/* =========================================
   Loja MZ — Gestão de categorias
   ========================================= */

let editingCategoryId = null;
let categoryModal = null;

document.addEventListener("DOMContentLoaded", () => {
  const checkAdminLoaded = setInterval(() => {
    if (window.currentAdmin) {
      clearInterval(checkAdminLoaded);
      loadAdminCategories();
    }
  }, 200);

  const modalElement = document.getElementById("category-modal");

  if (modalElement) {
    categoryModal = new bootstrap.Modal(modalElement);
  }

  document.getElementById("category-name-pt").addEventListener("input", event => {
    if (!editingCategoryId) {
      document.getElementById("category-slug").value = generateSlug(event.target.value);
    }
  });

  document.getElementById("save-category-button").addEventListener("click", () => {
    saveCategory();
  });
});

function generateSlug(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

async function loadAdminCategories() {
  const table = document.getElementById("categories-table");

  table.innerHTML = `
    <tr>
      <td colspan="6" class="text-center text-muted py-4">
        A carregar categorias...
      </td>
    </tr>
  `;

  const { data, error } = await supabase
    .from("categories")
    .select(`
      id,
      name_pt,
      name_en,
      slug,
      parent_id,
      sort_order,
      is_active,
      parent:parent_id (
        id,
        name_pt
      )
    `)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error(error);

    table.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-danger py-4">
          Erro ao carregar categorias.
        </td>
      </tr>
    `;
    return;
  }

  if (!data || data.length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted py-4">
          Nenhuma categoria registada.
        </td>
      </tr>
    `;
    return;
  }

  table.innerHTML = data.map(category => `
    <tr>
      <td>
        <strong>${category.name_pt}</strong>
        <small class="d-block text-muted">
          ${category.name_en || ""}
        </small>
      </td>

      <td>${category.slug}</td>

      <td>${category.parent?.name_pt || "Nenhuma"}</td>

      <td>${category.sort_order}</td>

      <td>
        <span class="badge ${category.is_active ? "bg-success" : "bg-secondary"}">
          ${category.is_active ? "Ativa" : "Inativa"}
        </span>
      </td>

      <td class="text-end">
        <div class="d-flex justify-content-end gap-2">
          <button class="btn btn-sm btn-outline-primary"
            onclick="openEditCategoryModal('${category.id}')">
            <i class="bi bi-pencil-square"></i>
          </button>

          <button class="btn btn-sm btn-outline-warning"
            onclick="toggleCategoryStatus('${category.id}', ${category.is_active})">
            <i class="bi ${category.is_active ? "bi-eye-slash" : "bi-eye"}"></i>
          </button>

          <button class="btn btn-sm btn-outline-danger"
            onclick="deleteCategory('${category.id}', '${category.name_pt}')">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join("");
}

function openCreateCategoryModal() {
  editingCategoryId = null;

  document.getElementById("category-modal-title").textContent = "Nova categoria";

  document.getElementById("category-form").reset();
  document.getElementById("category-sort-order").value = 0;
  document.getElementById("category-active").checked = true;

  loadParentCategoryOptions(null);
}

async function openEditCategoryModal(categoryId) {
  editingCategoryId = categoryId;

  document.getElementById("category-modal-title").textContent = "Editar categoria";

  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("id", categoryId)
    .maybeSingle();

  if (error || !data) {
    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível carregar a categoria."
    });

    return;
  }

  await loadParentCategoryOptions(categoryId);

  document.getElementById("category-name-pt").value = data.name_pt || "";
  document.getElementById("category-name-en").value = data.name_en || "";
  document.getElementById("category-slug").value = data.slug || "";
  document.getElementById("category-parent").value = data.parent_id || "";
  document.getElementById("category-sort-order").value = data.sort_order || 0;
  document.getElementById("category-image").value = data.image_url || "";
  document.getElementById("category-description-pt").value = data.description_pt || "";
  document.getElementById("category-description-en").value = data.description_en || "";
  document.getElementById("category-active").checked = Boolean(data.is_active);

  categoryModal.show();
}

async function loadParentCategoryOptions(currentCategoryId) {
  const select = document.getElementById("category-parent");

  const { data, error } = await supabase
    .from("categories")
    .select("id, name_pt")
    .order("name_pt", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  select.innerHTML = `
    <option value="">Nenhuma</option>
    ${data
      .filter(category => category.id !== currentCategoryId)
      .map(category => `
        <option value="${category.id}">
          ${category.name_pt}
        </option>
      `).join("")}
  `;
}

async function saveCategory() {
  const namePt = document.getElementById("category-name-pt").value.trim();
  const slug = document.getElementById("category-slug").value.trim();

  if (!namePt || !slug) {
    Swal.fire({
      icon: "warning",
      title: "Dados incompletos",
      text: "Preencha o nome e o slug da categoria."
    });

    return;
  }

  const categoryData = {
    name_pt: namePt,
    name_en: document.getElementById("category-name-en").value.trim() || null,
    slug: slug,
    parent_id: document.getElementById("category-parent").value || null,
    sort_order: Number(document.getElementById("category-sort-order").value || 0),
    image_url: document.getElementById("category-image").value.trim() || null,
    description_pt: document.getElementById("category-description-pt").value.trim() || null,
    description_en: document.getElementById("category-description-en").value.trim() || null,
    is_active: document.getElementById("category-active").checked
  };

  const button = document.getElementById("save-category-button");
  const originalText = button.innerHTML;

  button.disabled = true;
  button.innerHTML = `
    <span class="spinner-border spinner-border-sm me-2"></span>
    A guardar...
  `;

  try {
    if (editingCategoryId) {
      const { error } = await supabase
        .from("categories")
        .update(categoryData)
        .eq("id", editingCategoryId);

      if (error) throw error;

    } else {
      const { error } = await supabase
        .from("categories")
        .insert(categoryData);

      if (error) throw error;
    }

    categoryModal.hide();

    Swal.fire({
      icon: "success",
      title: editingCategoryId ? "Categoria atualizada" : "Categoria criada",
      timer: 1600,
      showConfirmButton: false
    });

    loadAdminCategories();

  } catch (error) {
    console.error(error);

    let message = "Não foi possível guardar a categoria.";

    if (error.code === "23505") {
      message = "Já existe uma categoria com este slug.";
    }

    Swal.fire({
      icon: "error",
      title: "Erro ao guardar",
      text: message
    });

  } finally {
    button.disabled = false;
    button.innerHTML = originalText;
  }
}

async function toggleCategoryStatus(categoryId, currentStatus) {
  const { error } = await supabase
    .from("categories")
    .update({ is_active: !currentStatus })
    .eq("id", categoryId);

  if (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível atualizar o estado da categoria."
    });

    return;
  }

  Swal.fire({
    icon: "success",
    title: "Estado atualizado",
    timer: 1400,
    showConfirmButton: false
  });

  loadAdminCategories();
}

async function deleteCategory(categoryId, categoryName) {
  const result = await Swal.fire({
    title: "Apagar categoria",
    text: `Tem certeza de que deseja apagar "${categoryName}"?`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sim, apagar",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#dc3545"
  });

  if (!result.isConfirmed) return;

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId);

  if (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível apagar a categoria. Verifique se não existem produtos associados."
    });

    return;
  }

  Swal.fire({
    icon: "success",
    title: "Categoria apagada",
    timer: 1500,
    showConfirmButton: false
  });

  loadAdminCategories();
}