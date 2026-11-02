/* =========================================
   Loja MZ — Gestão de marcas
   ========================================= */

let editingBrandId = null;
let brandModal = null;

document.addEventListener("DOMContentLoaded", () => {
  const checkAdminLoaded = setInterval(() => {
    if (window.currentAdmin) {
      clearInterval(checkAdminLoaded);
      loadAdminBrands();
    }
  }, 200);

  const modalElement = document.getElementById("brand-modal");

  if (modalElement) {
    brandModal = new bootstrap.Modal(modalElement);
  }

  document.getElementById("brand-name-pt").addEventListener("input", event => {
    if (!editingBrandId) {
      document.getElementById("brand-slug").value = generateSlug(event.target.value);
    }
  });

  document.getElementById("save-brand-button").addEventListener("click", () => {
    saveBrand();
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

async function loadAdminBrands() {
  const table = document.getElementById("brands-table");

  table.innerHTML = `
    <tr>
      <td colspan="5" class="text-center text-muted py-4">
        A carregar marcas...
      </td>
    </tr>
  `;

  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .order("name_pt", { ascending: true });

  if (error) {
    console.error(error);

    table.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-danger py-4">
          Erro ao carregar marcas.
        </td>
      </tr>
    `;
    return;
  }

  if (!data || data.length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-muted py-4">
          Nenhuma marca registada.
        </td>
      </tr>
    `;
    return;
  }

  table.innerHTML = data.map(brand => `
    <tr>
      <td>
        <div class="d-flex align-items-center gap-3">
          <img src="${brand.logo_url || "../assets/img/placeholders/product.svg"}"
            alt="${brand.name_pt}"
            style="width: 45px; height: 45px; object-fit: contain; border-radius: 8px; background: #f8fafc;">

          <div>
            <strong>${brand.name_pt}</strong>
            <small class="d-block text-muted">
              ${brand.name_en || ""}
            </small>
          </div>
        </div>
      </td>

      <td>${brand.slug}</td>

      <td>
        ${brand.logo_url ? `
          <span class="badge bg-success">Sim</span>
        ` : `
          <span class="badge bg-secondary">Não</span>
        `}
      </td>

      <td>
        <span class="badge ${brand.is_active ? "bg-success" : "bg-secondary"}">
          ${brand.is_active ? "Ativa" : "Inativa"}
        </span>
      </td>

      <td class="text-end">
        <div class="d-flex justify-content-end gap-2">
          <button class="btn btn-sm btn-outline-primary"
            onclick="openEditBrandModal('${brand.id}')">
            <i class="bi bi-pencil-square"></i>
          </button>

          <button class="btn btn-sm btn-outline-warning"
            onclick="toggleBrandStatus('${brand.id}', ${brand.is_active})">
            <i class="bi ${brand.is_active ? "bi-eye-slash" : "bi-eye"}"></i>
          </button>

          <button class="btn btn-sm btn-outline-danger"
            onclick="deleteBrand('${brand.id}', '${brand.name_pt}')">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join("");
}

function openCreateBrandModal() {
  editingBrandId = null;

  document.getElementById("brand-modal-title").textContent = "Nova marca";

  document.getElementById("brand-name-pt").value = "";
  document.getElementById("brand-name-en").value = "";
  document.getElementById("brand-slug").value = "";
  document.getElementById("brand-logo").value = "";
  document.getElementById("brand-active").checked = true;
}

async function openEditBrandModal(brandId) {
  editingBrandId = brandId;

  document.getElementById("brand-modal-title").textContent = "Editar marca";

  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .eq("id", brandId)
    .maybeSingle();

  if (error || !data) {
    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível carregar a marca."
    });

    return;
  }

  document.getElementById("brand-name-pt").value = data.name_pt || "";
  document.getElementById("brand-name-en").value = data.name_en || "";
  document.getElementById("brand-slug").value = data.slug || "";
  document.getElementById("brand-logo").value = data.logo_url || "";
  document.getElementById("brand-active").checked = Boolean(data.is_active);

  brandModal.show();
}

async function saveBrand() {
  const namePt = document.getElementById("brand-name-pt").value.trim();
  const slug = document.getElementById("brand-slug").value.trim();

  if (!namePt || !slug) {
    Swal.fire({
      icon: "warning",
      title: "Dados incompletos",
      text: "Preencha o nome e o slug da marca."
    });

    return;
  }

  const brandData = {
    name_pt: namePt,
    name_en: document.getElementById("brand-name-en").value.trim() || null,
    slug: slug,
    logo_url: document.getElementById("brand-logo").value.trim() || null,
    is_active: document.getElementById("brand-active").checked
  };

  const button = document.getElementById("save-brand-button");
  const originalText = button.innerHTML;

  button.disabled = true;
  button.innerHTML = `
    <span class="spinner-border spinner-border-sm me-2"></span>
    A guardar...
  `;

  try {
    if (editingBrandId) {
      const { error } = await supabase
        .from("brands")
        .update(brandData)
        .eq("id", editingBrandId);

      if (error) throw error;

    } else {
      const { error } = await supabase
        .from("brands")
        .insert(brandData);

      if (error) throw error;
    }

    brandModal.hide();

    Swal.fire({
      icon: "success",
      title: editingBrandId ? "Marca atualizada" : "Marca criada",
      timer: 1600,
      showConfirmButton: false
    });

    loadAdminBrands();

  } catch (error) {
    console.error(error);

    let message = "Não foi possível guardar a marca.";

    if (error.code === "23505") {
      message = "Já existe uma marca com este slug.";
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

async function toggleBrandStatus(brandId, currentStatus) {
  const { error } = await supabase
    .from("brands")
    .update({ is_active: !currentStatus })
    .eq("id", brandId);

  if (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível atualizar o estado da marca."
    });

    return;
  }

  Swal.fire({
    icon: "success",
    title: "Estado atualizado",
    timer: 1400,
    showConfirmButton: false
  });

  loadAdminBrands();
}

async function deleteBrand(brandId, brandName) {
  const result = await Swal.fire({
    title: "Apagar marca",
    text: `Tem certeza de que deseja apagar "${brandName}"?`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sim, apagar",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#dc3545"
  });

  if (!result.isConfirmed) return;

  const { error } = await supabase
    .from("brands")
    .delete()
    .eq("id", brandId);

  if (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível apagar a marca. Verifique se existem produtos associados."
    });

    return;
  }

  Swal.fire({
    icon: "success",
    title: "Marca apagada",
    timer: 1500,
    showConfirmButton: false
  });

  loadAdminBrands();
}