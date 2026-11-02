/* =========================================
   Loja MZ — Gestão de cupões
   ========================================= */

let editingCouponId = null;
let couponModal = null;

document.addEventListener("DOMContentLoaded", () => {
  const checkAdminLoaded = setInterval(() => {
    if (window.currentAdmin) {
      clearInterval(checkAdminLoaded);
      loadAdminCoupons();
    }
  }, 200);

  const modalElement = document.getElementById("coupon-modal");

  if (modalElement) {
    couponModal = new bootstrap.Modal(modalElement);
  }

  document.getElementById("coupon-code").addEventListener("input", event => {
    event.target.value = event.target.value.toUpperCase().replace(/\s+/g, "");
  });

  document.getElementById("save-coupon-button").addEventListener("click", () => {
    saveCoupon();
  });
});

async function loadAdminCoupons() {
  const table = document.getElementById("coupons-table");

  table.innerHTML = `
    <tr>
      <td colspan="7" class="text-center text-muted py-4">
        A carregar cupões...
      </td>
    </tr>
  `;

  const { data, error } = await supabase
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);

    table.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-danger py-4">
          Erro ao carregar cupões.
        </td>
      </tr>
    `;
    return;
  }

  if (!data || data.length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4">
          Nenhum cupão registado.
        </td>
      </tr>
    `;
    return;
  }

  table.innerHTML = data.map(coupon => {
    const discount = coupon.discount_type === "percentage"
      ? `${coupon.discount_value}%`
      : formatMZN(coupon.discount_value);

    const expiresAt = coupon.expires_at
      ? new Date(coupon.expires_at).toLocaleString("pt-MZ")
      : "Sem expiração";

    const uses = coupon.max_uses
      ? `${coupon.used_count} / ${coupon.max_uses}`
      : `${coupon.used_count} / Ilimitado`;

    return `
      <tr>
        <td>
          <strong>${coupon.code}</strong>
        </td>

        <td>${discount}</td>

        <td>${formatMZN(coupon.min_order_value)}</td>

        <td>${uses}</td>

        <td>${expiresAt}</td>

        <td>
          <span class="badge ${coupon.is_active ? "bg-success" : "bg-secondary"}">
            ${coupon.is_active ? "Ativo" : "Inativo"}
          </span>
        </td>

        <td class="text-end">
          <div class="d-flex justify-content-end gap-2">
            <button class="btn btn-sm btn-outline-primary"
              onclick="openEditCouponModal('${coupon.id}')">
              <i class="bi bi-pencil-square"></i>
            </button>

            <button class="btn btn-sm btn-outline-warning"
              onclick="toggleCouponStatus('${coupon.id}', ${coupon.is_active})">
              <i class="bi ${coupon.is_active ? "bi-eye-slash" : "bi-eye"}"></i>
            </button>

            <button class="btn btn-sm btn-outline-danger"
              onclick="deleteCoupon('${coupon.id}', '${coupon.code}')">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function openCreateCouponModal() {
  editingCouponId = null;

  document.getElementById("coupon-modal-title").textContent = "Novo cupão";

  document.getElementById("coupon-code").value = "";
  document.getElementById("coupon-discount-type").value = "percentage";
  document.getElementById("coupon-discount-value").value = "";
  document.getElementById("coupon-min-order").value = 0;
  document.getElementById("coupon-max-uses").value = "";
  document.getElementById("coupon-starts-at").value = "";
  document.getElementById("coupon-expires-at").value = "";
  document.getElementById("coupon-active").checked = true;
}

async function openEditCouponModal(couponId) {
  editingCouponId = couponId;

  document.getElementById("coupon-modal-title").textContent = "Editar cupão";

  const { data, error } = await supabase
    .from("coupons")
    .select("*")
    .eq("id", couponId)
    .maybeSingle();

  if (error || !data) {
    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível carregar o cupão."
    });

    return;
  }

  document.getElementById("coupon-code").value = data.code || "";
  document.getElementById("coupon-discount-type").value = data.discount_type || "percentage";
  document.getElementById("coupon-discount-value").value = data.discount_value || "";
  document.getElementById("coupon-min-order").value = data.min_order_value || 0;
  document.getElementById("coupon-max-uses").value = data.max_uses || "";
  document.getElementById("coupon-starts-at").value = toDateTimeLocal(data.starts_at);
  document.getElementById("coupon-expires-at").value = toDateTimeLocal(data.expires_at);
  document.getElementById("coupon-active").checked = Boolean(data.is_active);

  couponModal.show();
}

function toDateTimeLocal(value) {
  if (!value) return "";

  const date = new Date(value);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function validateCouponForm() {
  const code = document.getElementById("coupon-code").value.trim();
  const discountValue = Number(document.getElementById("coupon-discount-value").value);
  const discountType = document.getElementById("coupon-discount-type").value;

  if (!code) {
    Swal.fire({
      icon: "warning",
      title: "Código obrigatório",
      text: "Insira o código do cupão."
    });

    return false;
  }

  if (!discountValue || discountValue <= 0) {
    Swal.fire({
      icon: "warning",
      title: "Desconto inválido",
      text: "Insira um valor de desconto maior que zero."
    });

    return false;
  }

  if (discountType === "percentage" && discountValue > 100) {
    Swal.fire({
      icon: "warning",
      title: "Percentagem inválida",
      text: "O desconto percentual não pode ser maior que 100%."
    });

    return false;
  }

  return true;
}

async function saveCoupon() {
  if (!validateCouponForm()) return;

  const couponData = {
    code: document.getElementById("coupon-code").value.trim().toUpperCase(),
    discount_type: document.getElementById("coupon-discount-type").value,
    discount_value: Number(document.getElementById("coupon-discount-value").value),
    min_order_value: Number(document.getElementById("coupon-min-order").value || 0),
    max_uses: document.getElementById("coupon-max-uses").value
      ? Number(document.getElementById("coupon-max-uses").value)
      : null,
    starts_at: document.getElementById("coupon-starts-at").value || null,
    expires_at: document.getElementById("coupon-expires-at").value || null,
    is_active: document.getElementById("coupon-active").checked
  };

  const button = document.getElementById("save-coupon-button");
  const originalText = button.innerHTML;

  button.disabled = true;
  button.innerHTML = `
    <span class="spinner-border spinner-border-sm me-2"></span>
    A guardar...
  `;

  try {
    if (editingCouponId) {
      const { error } = await supabase
        .from("coupons")
        .update(couponData)
        .eq("id", editingCouponId);

      if (error) throw error;

    } else {
      const { error } = await supabase
        .from("coupons")
        .insert(couponData);

      if (error) throw error;
    }

    couponModal.hide();

    Swal.fire({
      icon: "success",
      title: editingCouponId ? "Cupão atualizado" : "Cupão criado",
      timer: 1600,
      showConfirmButton: false
    });

    loadAdminCoupons();

  } catch (error) {
    console.error(error);

    let message = "Não foi possível guardar o cupão.";

    if (error.code === "23505") {
      message = "Já existe um cupão com este código.";
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

async function toggleCouponStatus(couponId, currentStatus) {
  const { error } = await supabase
    .from("coupons")
    .update({ is_active: !currentStatus })
    .eq("id", couponId);

  if (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível atualizar o estado do cupão."
    });

    return;
  }

  Swal.fire({
    icon: "success",
    title: "Estado atualizado",
    timer: 1400,
    showConfirmButton: false
  });

  loadAdminCoupons();
}

async function deleteCoupon(couponId, couponCode) {
  const result = await Swal.fire({
    title: "Apagar cupão",
    text: `Tem certeza de que deseja apagar o cupão "${couponCode}"?`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sim, apagar",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#dc3545"
  });

  if (!result.isConfirmed) return;

  const { error } = await supabase
    .from("coupons")
    .delete()
    .eq("id", couponId);

  if (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível apagar o cupão."
    });

    return;
  }

  Swal.fire({
    icon: "success",
    title: "Cupão apagado",
    timer: 1500,
    showConfirmButton: false
  });

  loadAdminCoupons();
}