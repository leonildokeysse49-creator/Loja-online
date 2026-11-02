/* =========================================
   Loja MZ — Configurações da loja
   ========================================= */

let currentSettingsId = null;

document.addEventListener("DOMContentLoaded", () => {
  const checkAdminLoaded = setInterval(() => {
    if (window.currentAdmin) {
      clearInterval(checkAdminLoaded);
      loadSettings();
    }
  }, 200);

  document.getElementById("settings-form").addEventListener("submit", event => {
    event.preventDefault();
    saveSettings();
  });
});

async function loadSettings() {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      await createDefaultSettings();
      return;
    }

    currentSettingsId = data.id;

    document.getElementById("store-name").value = data.store_name || "";
    document.getElementById("store-email").value = data.store_email || "";
    document.getElementById("store-phone").value = data.store_phone || "";
    document.getElementById("whatsapp-number").value = data.whatsapp_number || "";

    document.getElementById("currency").value = data.currency || "MZN";
    document.getElementById("currency-symbol").value = data.currency_symbol || "MT";
    document.getElementById("default-language").value = data.default_language || "pt";

    document.getElementById("delivery-fee-maputo").value = data.delivery_fee_maputo || 0;
    document.getElementById("maintenance-mode").checked = Boolean(data.is_maintenance_mode);

    document.getElementById("settings-loading").classList.add("d-none");
    document.getElementById("settings-form").classList.remove("d-none");

  } catch (error) {
    console.error("Erro ao carregar configurações:", error);

    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível carregar as configurações."
    });
  }
}

async function createDefaultSettings() {
  try {
    const { data, error } = await supabase
      .from("settings")
      .insert({
        store_name: "Loja MZ",
        store_email: "leonildokeysse49@gmail.com",
        store_phone: "+258 85 321 7149",
        whatsapp_number: "258853217149",
        currency: "MZN",
        currency_symbol: "MT",
        default_language: "pt",
        delivery_fee_maputo: 150,
        is_maintenance_mode: false
      })
      .select()
      .single();

    if (error) throw error;

    currentSettingsId = data.id;

    document.getElementById("store-name").value = data.store_name;
    document.getElementById("store-email").value = data.store_email;
    document.getElementById("store-phone").value = data.store_phone;
    document.getElementById("whatsapp-number").value = data.whatsapp_number;
    document.getElementById("currency").value = data.currency;
    document.getElementById("currency-symbol").value = data.currency_symbol;
    document.getElementById("default-language").value = data.default_language;
    document.getElementById("delivery-fee-maputo").value = data.delivery_fee_maputo;
    document.getElementById("maintenance-mode").checked = data.is_maintenance_mode;

    document.getElementById("settings-loading").classList.add("d-none");
    document.getElementById("settings-form").classList.remove("d-none");

  } catch (error) {
    console.error("Erro ao criar configurações padrão:", error);

    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível criar as configurações padrão."
    });
  }
}

function validateSettingsForm() {
  const storeName = document.getElementById("store-name").value.trim();
  const storeEmail = document.getElementById("store-email").value.trim();
  const storePhone = document.getElementById("store-phone").value.trim();

  if (!storeName || !storeEmail || !storePhone) {
    Swal.fire({
      icon: "warning",
      title: "Dados incompletos",
      text: "Preencha o nome, e-mail e telefone da loja."
    });

    return false;
  }

  return true;
}

async function saveSettings() {
  if (!validateSettingsForm()) return;

  if (!currentSettingsId) {
    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Nenhuma configuração foi carregada."
    });

    return;
  }

  const settingsData = {
    store_name: document.getElementById("store-name").value.trim(),
    store_email: document.getElementById("store-email").value.trim(),
    store_phone: document.getElementById("store-phone").value.trim(),
    whatsapp_number: document.getElementById("whatsapp-number").value.trim() || null,
    currency: document.getElementById("currency").value,
    currency_symbol: document.getElementById("currency-symbol").value.trim() || "MT",
    default_language: document.getElementById("default-language").value,
    delivery_fee_maputo: Number(document.getElementById("delivery-fee-maputo").value || 0),
    is_maintenance_mode: document.getElementById("maintenance-mode").checked
  };

  const button = document.getElementById("save-settings-button");
  const originalText = button.innerHTML;

  button.disabled = true;
  button.innerHTML = `
    <span class="spinner-border spinner-border-sm me-2"></span>
    A guardar...
  `;

  try {
    const { error } = await supabase
      .from("settings")
      .update(settingsData)
      .eq("id", currentSettingsId);

    if (error) throw error;

    APP_CONFIG.storeName = settingsData.store_name;
    APP_CONFIG.supportEmail = settingsData.store_email;
    APP_CONFIG.supportPhone = settingsData.store_phone;
    APP_CONFIG.whatsappNumber = settingsData.whatsapp_number;
    APP_CONFIG.currency = settingsData.currency;
    APP_CONFIG.currencySymbol = settingsData.currency_symbol;
    APP_CONFIG.defaultLanguage = settingsData.default_language;

    Swal.fire({
      icon: "success",
      title: "Configurações guardadas",
      text: "As alterações foram aplicadas com sucesso.",
      timer: 1800,
      showConfirmButton: false
    });

  } catch (error) {
    console.error("Erro ao guardar configurações:", error);

    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível guardar as configurações."
    });

  } finally {
    button.disabled = false;
    button.innerHTML = originalText;
  }
}