/* =========================================
   Loja MZ — Administração de cupões
   Datas apresentadas em Africa/Maputo.
   Hora de referência obtida no Supabase.
   ========================================= */

(function couponsAdmin() {
  "use strict";

  const el = id => document.getElementById(id);

  let initialized = false;
  let editingCouponId = null;
  let couponModal = null;
  let busy = false;
  let coupons = [];
  let serverNow = null;
  let loadVersion = 0;

  function client() {
    const instance = window.lojaMzSupabaseClient;

    if (instance && typeof instance.from === "function") {
      return instance;
    }

    if (
      typeof supabase !== "undefined" &&
      typeof supabase.from === "function"
    ) {
      return supabase;
    }

    throw new Error("O cliente Supabase não está disponível.");
  }

  function isAdmin() {
    return (
      typeof window.isAdmin === "function" &&
      window.isAdmin() === true
    );
  }

  function requireAdmin() {
    if (!isAdmin()) {
      throw new Error("Apenas administradores podem gerir cupões.");
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

  function money(value) {
    return new Intl.NumberFormat("pt-MZ", {
      style: "currency",
      currency: "MZN"
    }).format(Number(value) || 0);
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (!Number.isFinite(date.getTime())) return "Data inválida";

    return new Intl.DateTimeFormat("pt-MZ", {
      timeZone: "Africa/Maputo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(date);
  }

  function toDateTimeLocal(value) {
    if (!value) return "";

    const date = new Date(value);

    if (!Number.isFinite(date.getTime())) return "";

    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Maputo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date);

    const values = Object.fromEntries(
      parts.map(part => [part.type, part.value])
    );

    return (
      `${values.year}-${values.month}-${values.day}` +
      `T${values.hour}:${values.minute}`
    );
  }

  function maputoInputToISO(value) {
    if (!value) return null;

    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
      throw new Error("Preenche uma data e hora válidas.");
    }

    const date = new Date(`${value}:00+02:00`);

    if (
      !Number.isFinite(date.getTime()) ||
      toDateTimeLocal(date.toISOString()) !== value
    ) {
      throw new Error("Preenche uma data e hora válidas.");
    }

    return date.toISOString();
  }

  function showError(error, title = "Não foi possível concluir") {
    console.error("[Loja MZ] Cupões:", error);

    return Swal.fire({
      icon: "error",
      title,
      text: error.message || "Tenta novamente."
    });
  }

  function setBusy(value) {
    busy = value;

    document.querySelectorAll(
      "#coupon-form input, #coupon-form select, " +
      "#coupon-form button, #coupon-modal [data-bs-dismiss], " +
      "#coupons-table button, #new-coupon-button"
    ).forEach(item => {
      item.disabled = value;
    });

    el("save-coupon-button").textContent = value
      ? "A processar..."
      : "Guardar";
  }

  async function refreshServerTime() {
    if (!window.LojaMZCoupons) {
      throw new Error("O ficheiro assets/js/coupons.js não foi carregado.");
    }

    const value = await window.LojaMZCoupons.serverTime();
    const date = new Date(value);

    if (!Number.isFinite(date.getTime())) {
      throw new Error("O servidor devolveu uma hora inválida.");
    }

    serverNow = date;

    el("coupon-server-time").textContent =
      `Hora do servidor em Moçambique: ${formatDate(value)}. ` +
      "Última consulta; usa Atualizar para consultar novamente.";

    el("coupon-server-time").className = "small text-muted mb-3";

    return date;
  }

  function couponStatus(coupon) {
    if (!coupon.is_active) {
      return { label: "Inativo", className: "bg-secondary" };
    }

    if (!serverNow) {
      return { label: "Ativo — verificar datas", className: "bg-secondary" };
    }

    if (
      coupon.starts_at &&
      new Date(coupon.starts_at) > serverNow
    ) {
      return { label: "Agendado", className: "bg-info text-dark" };
    }

    if (
      coupon.expires_at &&
      new Date(coupon.expires_at) <= serverNow
    ) {
      return { label: "Expirado", className: "bg-danger" };
    }

    if (
      coupon.max_uses !== null &&
      Number(coupon.used_count) >= Number(coupon.max_uses)
    ) {
      return { label: "Esgotado", className: "bg-warning text-dark" };
    }

    return { label: "Disponível", className: "bg-success" };
  }

  function renderCoupons() {
    const table = el("coupons-table");

    if (!coupons.length) {
      table.innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-muted py-4">
            Nenhum cupão registado.
          </td>
        </tr>
      `;
      return;
    }

    table.innerHTML = coupons.map(coupon => {
      const status = couponStatus(coupon);

      const discount = coupon.discount_type === "percentage"
        ? `${Number(coupon.discount_value)}%`
        : money(coupon.discount_value);

      const uses = coupon.max_uses === null
        ? `${Number(coupon.used_count) || 0} / Ilimitado`
        : `${Number(coupon.used_count) || 0} / ${coupon.max_uses}`;

      return `
        <tr>
          <td><strong>${escapeHtml(coupon.code)}</strong></td>
          <td>${escapeHtml(discount)}</td>
          <td>${escapeHtml(money(coupon.min_order_value))}</td>
          <td>${escapeHtml(uses)}</td>
          <td>
            <small class="d-block">
              Início: ${
                coupon.starts_at
                  ? escapeHtml(formatDate(coupon.starts_at))
                  : "Sem restrição"
              }
            </small>
            <small class="d-block">
              Fim: ${
                coupon.expires_at
                  ? escapeHtml(formatDate(coupon.expires_at))
                  : "Sem expiração"
              }
            </small>
          </td>
          <td>
            <span class="badge ${status.className}">
              ${escapeHtml(status.label)}
            </span>
          </td>
          <td class="text-end">
            <div class="d-flex justify-content-end gap-2">
              <button
                type="button"
                class="btn btn-sm btn-outline-primary"
                data-action="edit"
                data-id="${escapeHtml(coupon.id)}"
                aria-label="Editar cupão"
                title="Editar"
                ${busy ? "disabled" : ""}
              >
                <i class="bi bi-pencil-square" aria-hidden="true"></i>
              </button>
              <button
                type="button"
                class="btn btn-sm btn-outline-warning"
                data-action="toggle"
                data-id="${escapeHtml(coupon.id)}"
                aria-label="${coupon.is_active ? "Desativar" : "Ativar"} cupão"
                title="${coupon.is_active ? "Desativar" : "Ativar"}"
                ${busy ? "disabled" : ""}
              >
                <i
                  class="bi ${coupon.is_active ? "bi-eye-slash" : "bi-eye"}"
                  aria-hidden="true"
                ></i>
              </button>
              <button
                type="button"
                class="btn btn-sm btn-outline-danger"
                data-action="delete"
                data-id="${escapeHtml(coupon.id)}"
                aria-label="Apagar cupão"
                title="Apagar"
                ${busy ? "disabled" : ""}
              >
                <i class="bi bi-trash" aria-hidden="true"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  async function loadAdminCoupons() {
    const version = ++loadVersion;

    el("coupons-table").innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4">
          A carregar cupões...
        </td>
      </tr>
    `;

    try {
      requireAdmin();

      try {
        await refreshServerTime();
      } catch (error) {
        serverNow = null;

        el("coupon-server-time").textContent =
          "Não foi possível consultar a hora do servidor. " +
          "Verifica o SQL e o ficheiro coupons.js.";

        el("coupon-server-time").className =
          "small text-danger mb-3";

        console.error("[Loja MZ] Hora do servidor:", error);
      }

      const { data, error } = await client()
        .from("coupons")
        .select("*")
        .order("created_at", { ascending: false });

      if (version !== loadVersion) return;
      if (error) throw error;

      coupons = data || [];
      renderCoupons();
    } catch (error) {
      if (version !== loadVersion) return;

      console.error("[Loja MZ] Carregar cupões:", error);

      el("coupons-table").innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-danger py-4">
            ${escapeHtml(error.message || "Erro ao carregar cupões.")}
          </td>
        </tr>
      `;
    }
  }

  function openCreateCouponModal() {
    if (busy) return;

    try {
      requireAdmin();

      editingCouponId = null;

      el("coupon-form").reset();
      el("coupon-modal-title").textContent = "Novo cupão";
      el("coupon-discount-type").value = "percentage";
      el("coupon-min-order").value = "0";
      el("coupon-active").checked = true;

      couponModal.show();
    } catch (error) {
      showError(error);
    }
  }

  async function openEditCouponModal(id) {
    if (busy) return;

    setBusy(true);

    try {
      requireAdmin();

      const { data, error } = await client()
        .from("coupons")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      editingCouponId = data.id;

      el("coupon-modal-title").textContent = "Editar cupão";
      el("coupon-code").value = data.code || "";
      el("coupon-discount-type").value = data.discount_type;
      el("coupon-discount-value").value = data.discount_value;
      el("coupon-min-order").value = data.min_order_value ?? 0;
      el("coupon-max-uses").value = data.max_uses ?? "";
      el("coupon-starts-at").value = toDateTimeLocal(data.starts_at);
      el("coupon-expires-at").value = toDateTimeLocal(data.expires_at);
      el("coupon-active").checked = Boolean(data.is_active);

      couponModal.show();
    } catch (error) {
      await showError(error, "Erro ao abrir o cupão");
    } finally {
      setBusy(false);
    }
  }

  function readCouponForm() {
    const code = el("coupon-code").value
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");

    const type = el("coupon-discount-type").value;
    const discount = Number(el("coupon-discount-value").value);
    const minimum = Number(el("coupon-min-order").value || 0);
    const limitInput = el("coupon-max-uses").value.trim();
    const limit = limitInput === "" ? null : Number(limitInput);

    const startsAt = maputoInputToISO(el("coupon-starts-at").value);
    const expiresAt = maputoInputToISO(el("coupon-expires-at").value);

    if (!code || code.length > 64) {
      throw new Error("O código deve ter entre 1 e 64 caracteres.");
    }

    if (!["percentage", "fixed"].includes(type)) {
      throw new Error("Seleciona um tipo de desconto válido.");
    }

    if (!Number.isFinite(discount) || discount <= 0) {
      throw new Error("O desconto deve ser maior que zero.");
    }

    if (type === "percentage" && discount > 100) {
      throw new Error("A percentagem não pode ser superior a 100%.");
    }

    if (!Number.isFinite(minimum) || minimum < 0) {
      throw new Error("O valor mínimo não pode ser negativo.");
    }

    if (
      limit !== null &&
      (!Number.isSafeInteger(limit) || limit < 1)
    ) {
      throw new Error(
        "O limite deve ser um inteiro maior que zero, " +
        "ou ficar vazio para ilimitado."
      );
    }

    if (
      startsAt &&
      expiresAt &&
      new Date(expiresAt) <= new Date(startsAt)
    ) {
      throw new Error("A expiração deve ser posterior ao início.");
    }

    return {
      code,
      discount_type: type,
      discount_value: discount,
      min_order_value: minimum,
      max_uses: limit,
      starts_at: startsAt,
      expires_at: expiresAt,
      is_active: el("coupon-active").checked
    };
  }

  async function saveCoupon(event) {
    event?.preventDefault();

    if (busy) return;
    if (!el("coupon-form").reportValidity()) return;

    let payload;

    try {
      requireAdmin();
      payload = readCouponForm();
    } catch (error) {
      await showError(error, "Verifica o formulário");
      return;
    }

    const wasEditing = Boolean(editingCouponId);

    setBusy(true);

    try {
      let query = client().from("coupons");

      query = wasEditing
        ? query.update(payload).eq("id", editingCouponId)
        : query.insert(payload);

      const { error } = await query.select("id").single();

      if (error) throw error;

      // Liberta os controlos antes de fechar o modal.
      setBusy(false);
      couponModal.hide();

      await loadAdminCoupons();

      await Swal.fire({
        icon: "success",
        title: wasEditing ? "Cupão atualizado" : "Cupão criado",
        timer: 1500,
        showConfirmButton: false
      });
    } catch (error) {
      if (error.code === "23505") {
        error = new Error("Já existe um cupão com este código.");
      }

      await showError(error, "Erro ao guardar");
    } finally {
      setBusy(false);
    }
  }

  async function mutateCoupon(coupon, action) {
    if (busy) return;

    const deleting = action === "delete";

    const result = await Swal.fire({
      icon: deleting ? "warning" : "question",
      title: deleting
        ? "Apagar cupão?"
        : `${coupon.is_active ? "Desativar" : "Ativar"} cupão?`,
      text: deleting
        ? `Pretendes apagar "${coupon.code}"? ` +
          "Se já foi utilizado, prefere desativá-lo."
        : `Alterar o estado de "${coupon.code}"?`,
      showCancelButton: true,
      confirmButtonText: deleting ? "Apagar" : "Confirmar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: deleting ? "#dc3545" : "#0d6efd"
    });

    if (!result.isConfirmed || busy) return;

    setBusy(true);

    try {
      requireAdmin();

      const query = deleting
        ? client().from("coupons").delete()
        : client().from("coupons").update({
            is_active: !coupon.is_active
          });

      const { error } = await query
        .eq("id", coupon.id)
        .select("id")
        .single();

      if (error) throw error;

      await loadAdminCoupons();

      await Swal.fire({
        icon: "success",
        title: deleting ? "Cupão apagado" : "Estado atualizado",
        timer: 1400,
        showConfirmButton: false
      });
    } catch (error) {
      if (error.code === "23503") {
        error = new Error(
          "Este cupão está associado a outros registos. " +
          "Desativa-o em vez de o apagar."
        );
      }

      await showError(error);
    } finally {
      setBusy(false);
    }
  }

  function initialize() {
    if (
      initialized ||
      !window.currentAdmin ||
      !el("coupons-table")
    ) {
      return;
    }

    initialized = true;

    if (!isAdmin()) {
      el("new-coupon-button").disabled = true;
      el("coupons-table").innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-danger py-4">
            Apenas administradores podem gerir cupões.
          </td>
        </tr>
      `;
      return;
    }

    couponModal = bootstrap.Modal.getOrCreateInstance(
      el("coupon-modal")
    );

    el("coupon-modal").addEventListener("hide.bs.modal", event => {
      if (busy) event.preventDefault();
    });

    el("new-coupon-button").addEventListener(
      "click",
      openCreateCouponModal
    );

    el("refresh-coupons-button").addEventListener("click", () => {
      if (!busy) loadAdminCoupons();
    });

    el("coupon-form").addEventListener("submit", saveCoupon);

    el("coupon-code").addEventListener("input", event => {
      event.target.value = event.target.value
        .toUpperCase()
        .replace(/\s+/g, "");
    });

    el("coupon-start-now-button").addEventListener("click", () => {
      // Sem data de início: não depende do relógio do navegador.
      el("coupon-starts-at").value = "";
    });

    el("coupons-table").addEventListener("click", event => {
      const button = event.target.closest("button[data-action]");

      if (!button || busy) return;

      const coupon = coupons.find(
        item => String(item.id) === button.dataset.id
      );

      if (!coupon) return;

      const action = button.dataset.action;

      if (action === "edit") {
        openEditCouponModal(coupon.id);
      } else if (["toggle", "delete"].includes(action)) {
        mutateCoupon(coupon, action);
      }
    });

    loadAdminCoupons();
  }

  document.addEventListener("admin:ready", initialize);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, {
      once: true
    });
  } else {
    initialize();
  }
})();
