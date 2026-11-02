/* =========================================
   Loja MZ — Gestão de banners
   ========================================= */

let editingBannerId = null;
let bannerModal = null;

document.addEventListener("DOMContentLoaded", () => {
  const checkAdminLoaded = setInterval(() => {
    if (window.currentAdmin) {
      clearInterval(checkAdminLoaded);
      loadAdminBanners();
    }
  }, 200);

  const modalElement = document.getElementById("banner-modal");

  if (modalElement) {
    bannerModal = new bootstrap.Modal(modalElement);
  }

  document.getElementById("banner-image").addEventListener("input", event => {
    updateBannerPreview(event.target.value);
  });

  document.getElementById("save-banner-button").addEventListener("click", () => {
    saveBanner();
  });
});

function updateBannerPreview(imageUrl) {
  const preview = document.getElementById("banner-preview-image");

  preview.src = imageUrl || "../assets/img/placeholders/hero.svg";
}

async function loadAdminBanners() {
  const table = document.getElementById("banners-table");

  table.innerHTML = `
    <tr>
      <td colspan="6" class="text-center text-muted py-4">
        A carregar banners...
      </td>
    </tr>
  `;

  const { data, error } = await supabase
    .from("banners")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error(error);

    table.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-danger py-4">
          Erro ao carregar banners.
        </td>
      </tr>
    `;
    return;
  }

  if (!data || data.length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted py-4">
          Nenhum banner registado.
        </td>
      </tr>
    `;
    return;
  }

  table.innerHTML = data.map(banner => `
    <tr>
      <td>
        <img src="${banner.image_url}"
          alt="${banner.title_pt || "Banner"}"
          style="width: 110px; height: 60px; object-fit: cover; border-radius: 8px;">
      </td>

      <td>
        <strong>${banner.title_pt || "Sem título"}</strong>
        <small class="d-block text-muted">
          ${banner.title_en || ""}
        </small>
      </td>

      <td>${banner.link_url || "-"}</td>

      <td>${banner.sort_order}</td>

      <td>
        <span class="badge ${banner.is_active ? "bg-success" : "bg-secondary"}">
          ${banner.is_active ? "Ativo" : "Inativo"}
        </span>
      </td>

      <td class="text-end">
        <div class="d-flex justify-content-end gap-2">
          <button class="btn btn-sm btn-outline-primary"
            onclick="openEditBannerModal('${banner.id}')">
            <i class="bi bi-pencil-square"></i>
          </button>

          <button class="btn btn-sm btn-outline-warning"
            onclick="toggleBannerStatus('${banner.id}', ${banner.is_active})">
            <i class="bi ${banner.is_active ? "bi-eye-slash" : "bi-eye"}"></i>
          </button>

          <button class="btn btn-sm btn-outline-danger"
            onclick="deleteBanner('${banner.id}', '${banner.title_pt || "Banner"}')">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join("");
}

function openCreateBannerModal() {
  editingBannerId = null;

  document.getElementById("banner-modal-title").textContent = "Novo banner";

  document.getElementById("banner-title-pt").value = "";
  document.getElementById("banner-title-en").value = "";
  document.getElementById("banner-subtitle-pt").value = "";
  document.getElementById("banner-subtitle-en").value = "";
  document.getElementById("banner-image").value = "";
  document.getElementById("banner-link").value = "";
  document.getElementById("banner-sort-order").value = 0;
  document.getElementById("banner-active").checked = true;

  updateBannerPreview("");
}

async function openEditBannerModal(bannerId) {
  editingBannerId = bannerId;

  document.getElementById("banner-modal-title").textContent = "Editar banner";

  const { data, error } = await supabase
    .from("banners")
    .select("*")
    .eq("id", bannerId)
    .maybeSingle();

  if (error || !data) {
    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível carregar o banner."
    });

    return;
  }

  document.getElementById("banner-title-pt").value = data.title_pt || "";
  document.getElementById("banner-title-en").value = data.title_en || "";
  document.getElementById("banner-subtitle-pt").value = data.subtitle_pt || "";
  document.getElementById("banner-subtitle-en").value = data.subtitle_en || "";
  document.getElementById("banner-image").value = data.image_url || "";
  document.getElementById("banner-link").value = data.link_url || "";
  document.getElementById("banner-sort-order").value = data.sort_order || 0;
  document.getElementById("banner-active").checked = Boolean(data.is_active);

  updateBannerPreview(data.image_url);

  bannerModal.show();
}

function validateBannerForm() {
  const imageUrl = document.getElementById("banner-image").value.trim();

  if (!imageUrl) {
    Swal.fire({
      icon: "warning",
      title: "Imagem obrigatória",
      text: "Insira o URL da imagem do banner."
    });

    return false;
  }

  return true;
}

async function saveBanner() {
  if (!validateBannerForm()) return;

  const bannerData = {
    title_pt: document.getElementById("banner-title-pt").value.trim() || null,
    title_en: document.getElementById("banner-title-en").value.trim() || null,
    subtitle_pt: document.getElementById("banner-subtitle-pt").value.trim() || null,
    subtitle_en: document.getElementById("banner-subtitle-en").value.trim() || null,
    image_url: document.getElementById("banner-image").value.trim(),
    link_url: document.getElementById("banner-link").value.trim() || null,
    sort_order: Number(document.getElementById("banner-sort-order").value || 0),
    is_active: document.getElementById("banner-active").checked
  };

  const button = document.getElementById("save-banner-button");
  const originalText = button.innerHTML;

  button.disabled = true;
  button.innerHTML = `
    <span class="spinner-border spinner-border-sm me-2"></span>
    A guardar...
  `;

  try {
    if (editingBannerId) {
      const { error } = await supabase
        .from("banners")
        .update(bannerData)
        .eq("id", editingBannerId);

      if (error) throw error;

    } else {
      const { error } = await supabase
        .from("banners")
        .insert(bannerData);

      if (error) throw error;
    }

    bannerModal.hide();

    Swal.fire({
      icon: "success",
      title: editingBannerId ? "Banner atualizado" : "Banner criado",
      timer: 1600,
      showConfirmButton: false
    });

    loadAdminBanners();

  } catch (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Erro ao guardar",
      text: "Não foi possível guardar o banner."
    });

  } finally {
    button.disabled = false;
    button.innerHTML = originalText;
  }
}

async function toggleBannerStatus(bannerId, currentStatus) {
  const { error } = await supabase
    .from("banners")
    .update({ is_active: !currentStatus })
    .eq("id", bannerId);

  if (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível atualizar o estado do banner."
    });

    return;
  }

  Swal.fire({
    icon: "success",
    title: "Estado atualizado",
    timer: 1400,
    showConfirmButton: false
  });

  loadAdminBanners();
}

async function deleteBanner(bannerId, bannerTitle) {
  const result = await Swal.fire({
    title: "Apagar banner",
    text: `Tem certeza de que deseja apagar "${bannerTitle}"?`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sim, apagar",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#dc3545"
  });

  if (!result.isConfirmed) return;

  const { error } = await supabase
    .from("banners")
    .delete()
    .eq("id", bannerId);

  if (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível apagar o banner."
    });

    return;
  }

  Swal.fire({
    icon: "success",
    title: "Banner apagado",
    timer: 1500,
    showConfirmButton: false
  });

  loadAdminBanners();
}