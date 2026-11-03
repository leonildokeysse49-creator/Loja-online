
/* =========================================
   Loja MZ — Configurações e entrega
   ========================================= */

(function settingsAdmin() {
  "use strict";

  const PROVINCES = [
    "Maputo Cidade",
    "Maputo Província",
    "Gaza",
    "Inhambane",
    "Sofala",
    "Manica",
    "Tete",
    "Zambézia",
    "Nampula",
    "Cabo Delgado",
    "Niassa"
  ];

  const el = id => document.getElementById(id);

  let initialized = false;
  let saving = false;
  let settingsId = null;

  function client() {
    if (
      window.lojaMzSupabaseClient &&
      typeof window.lojaMzSupabaseClient.from === "function"
    ) {
      return window.lojaMzSupabaseClient;
    }

    if (
      typeof supabase !== "undefined" &&
      typeof supabase.from === "function"
    ) {
      return supabase;
    }

    throw new Error("O cliente Supabase não está disponível.");
  }

  function message(icon, title, text) {
    if (window.Swal) {
      return window.Swal.fire({ icon, title, text });
    }

    window.alert(`${title}\n${text}`);
    return Promise.resolve();
  }

  function feeInput(index) {
    return index === 0
      ? el("delivery-fee-maputo")
      : el(`delivery-fee-province-${index}`);
  }

  function prepareDeliveryFields() {
    const maputoInput = el("delivery-fee-maputo");

    if (!maputoInput) {
      throw new Error("O campo da taxa de Maputo não foi encontrado.");
    }

    const card = maputoInput.closest(".admin-card");

    if (!card) {
      throw new Error("A secção de entrega não foi encontrada.");
    }

    const label = maputoInput
      .closest(".col-md-6")
      ?.querySelector("label");

    if (label) {
      label.textContent = "Maputo Cidade (MT)";
      label.htmlFor = maputoInput.id;
    }

    maputoInput.placeholder = "Vazio = entrega não configurada";
    maputoInput.required = false;

    if (el("delivery-province-fields")) return;

    const note = document.createElement("p");
    note.className = "small text-muted mt-3";
    note.textContent =
      "Define a taxa de cada província. " +
      "0 significa entrega gratuita. " +
      "Deixa vazio para não aceitar entregas nessa província.";

    const row = document.createElement("div");
    row.className = "row g-3";
    row.id = "delivery-province-fields";

    PROVINCES.slice(1).forEach((province, offset) => {
      const index = offset + 1;
      const column = document.createElement("div");
      column.className = "col-md-6";

      const fieldLabel = document.createElement("label");
      fieldLabel.className = "form-label";
      fieldLabel.htmlFor = `delivery-fee-province-${index}`;
      fieldLabel.textContent = `${province} (MT)`;

      const input = document.createElement("input");
      input.type = "number";
      input.className = "form-control";
      input.id = fieldLabel.htmlFor;
      input.min = "0";
      input.step = "0.01";
      input.placeholder = "Não configurada";

      column.append(fieldLabel, input);
      row.append(column);
    });

    card.append(note, row);
  }

  function fillForm(data) {
    settingsId = data.id;

    const mapping = {
      "store-name": "store_name",
      "store-email": "store_email",
      "store-phone": "store_phone",
      "whatsapp-number": "whatsapp_number",
      "currency": "currency",
      "currency-symbol": "currency_symbol",
      "default-language": "default_language"
    };

    Object.entries(mapping).forEach(([id, column]) => {
      el(id).value = data[column] ?? "";
    });

    el("currency").value = data.currency || "MZN";
    el("currency-symbol").value = data.currency_symbol || "MT";
    el("default-language").value = data.default_language || "pt";

    el("maintenance-mode").checked =
      Boolean(data.is_maintenance_mode);

    const fees = data.delivery_fees;

    PROVINCES.forEach((province, index) => {
      let value = null;

      if (
        fees &&
        typeof fees === "object" &&
        !Array.isArray(fees)
      ) {
        value = fees[province];
      } else if (index === 0) {
        // Compatibilidade com a configuração antiga.
        value = data.delivery_fee_maputo;
      }

      feeInput(index).value =
        value === null || value === undefined
          ? ""
          : value;
    });

    el("settings-loading").classList.add("d-none");
    el("settings-form").classList.remove("d-none");
  }

  async function loadSettings() {
    const { data, error } = await client()
      .from("settings")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      if (!Object.prototype.hasOwnProperty.call(data, "delivery_fees")) {
        throw new Error(
          "Falta a coluna delivery_fees. " +
          "Executa primeiro o SQL indicado."
        );
      }

      fillForm(data);
      return;
    }

    // Sem valores de entrega assumidos automaticamente.
    const { data: created, error: createError } = await client()
      .from("settings")
      .insert({
        store_name: "Loja MZ",
        store_email: "leonildokeysse49@gmail.com",
        store_phone: "+258 85 321 7149",
        whatsapp_number: "258853217149",
        currency: "MZN",
        currency_symbol: "MT",
        default_language: "pt",
        delivery_fee_maputo: 0,
        delivery_fees: {},
        is_maintenance_mode: false
      })
      .select("*")
      .single();

    if (createError) throw createError;

    fillForm(created);
  }

  function readFees() {
    const fees = {};

    PROVINCES.forEach((province, index) => {
      const input = feeInput(index);
      const raw = input.value.trim();

      if (raw === "") {
        fees[province] = null;
        return;
      }

      const value = Number(raw);

      if (!Number.isFinite(value) || value < 0) {
        input.focus();
        throw new Error(`A taxa de ${province} é inválida.`);
      }

      fees[province] = Math.round(value * 100) / 100;
    });

    return fees;
  }

  async function saveSettings() {
    if (saving || !settingsId) return;

    const form = el("settings-form");

    if (!form.reportValidity()) return;

    let fees;

    try {
      fees = readFees();
    } catch (error) {
      await message("warning", "Verifica a entrega", error.message);
      return;
    }

    const data = {
      store_name: el("store-name").value.trim(),
      store_email: el("store-email").value.trim(),
      store_phone: el("store-phone").value.trim(),
      whatsapp_number: el("whatsapp-number").value.trim() || null,
      currency: el("currency").value,
      currency_symbol: el("currency-symbol").value.trim() || "MT",
      default_language: el("default-language").value,
      delivery_fee_maputo: fees["Maputo Cidade"] ?? 0,
      delivery_fees: fees,
      is_maintenance_mode: el("maintenance-mode").checked
    };

    if (!data.store_name || !data.store_email || !data.store_phone) {
      await message(
        "warning",
        "Dados incompletos",
        "Preenche o nome, e-mail e telefone da loja."
      );
      return;
    }

    saving = true;

    const button = el("save-settings-button");
    const original = button.innerHTML;

    button.disabled = true;
    button.textContent = "A guardar...";

    try {
      const { error } = await client()
        .from("settings")
        .update(data)
        .eq("id", settingsId)
        .select("id")
        .single();

      if (error) throw error;

      if (typeof APP_CONFIG !== "undefined") {
        try {
          Object.assign(APP_CONFIG, {
            storeName: data.store_name,
            supportEmail: data.store_email,
            supportPhone: data.store_phone,
            whatsappNumber: data.whatsapp_number,
            currency: data.currency,
            currencySymbol: data.currency_symbol,
            defaultLanguage: data.default_language
          });
        } catch (configError) {
          console.warn(
            "[Loja MZ] Configuração local:",
            configError
          );
        }
      }

      await message(
        "success",
        "Configurações guardadas",
        "As taxas de entrega foram guardadas na base de dados."
      );
    } catch (error) {
      console.error("[Loja MZ] Configurações:", error);

      await message(
        "error",
        "Não foi possível guardar",
        error.message || "Verifica as permissões da tabela settings."
      );
    } finally {
      saving = false;
      button.disabled = false;
      button.innerHTML = original;
    }
  }

  async function initialize() {
    if (initialized || !window.currentAdmin) return;
    if (!el("settings-form")) return;

    initialized = true;

    try {
      prepareDeliveryFields();

      el("settings-form").addEventListener("submit", event => {
        event.preventDefault();
        saveSettings();
      });

      await loadSettings();
    } catch (error) {
      console.error("[Loja MZ] Preparação:", error);

      el("settings-loading").classList.remove("d-none");
      el("settings-loading").textContent =
        `Não foi possível carregar: ${error.message}`;
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

  // Compatibilidade com versões do admin-auth.js sem admin:ready.
  let attempts = 0;

  const timer = window.setInterval(() => {
    attempts++;

    if (window.currentAdmin) {
      window.clearInterval(timer);
      initialize();
    } else if (attempts >= 150) {
      window.clearInterval(timer);
    }
  }, 200);
})();
