/* =========================================
   Loja MZ — Conta do cliente
   ========================================= */

(function accountPage() {
  "use strict";

  let currentUser = null;
  let currentAddressId = null;

  const getElement = id => document.getElementById(id);

  function getClient() {
    const client = window.lojaMzSupabaseClient;

    if (!client || typeof client.from !== "function") {
      throw new Error(
        "O cliente Supabase não está disponível. " +
        "Verifica config.js e supabase.js."
      );
    }

    return client;
  }

  async function showMessage(icon, title, text = "") {
    if (window.Swal) {
      return window.Swal.fire({
        icon,
        title,
        text
      });
    }

    window.alert(`${title}\n${text}`);
  }

  function setButtonLoading(id, loading) {
    const button = getElement(id);

    if (!button) return;

    if (loading) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    } else {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }

  async function initializeAccount() {
    if (!getElement("account-content")) return;

    try {
      const client = getClient();

      const {
        data: { user },
        error
      } = await client.auth.getUser();

      if (error) throw error;

      if (!user) {
        window.location.replace("login.html");
        return;
      }

      currentUser = user;

      getElement("account-email").value = user.email || "";

      getElement("logout-button")?.addEventListener(
        "click",
        signOut
      );

      getElement("update-profile-button")?.addEventListener(
        "click",
        updateProfile
      );

      getElement("save-address-button")?.addEventListener(
        "click",
        saveAddress
      );

      await loadProfile();

      const results = await Promise.allSettled([
        loadAddress(),
        loadOrders()
      ]);

      results.forEach(result => {
        if (result.status === "rejected") {
          console.error(
            "[Loja MZ] Erro numa secção da conta:",
            result.reason
          );
        }
      });

      getElement("account-loading")?.classList.add("d-none");
      getElement("account-content").classList.remove("d-none");
    } catch (error) {
      console.error("[Loja MZ] Erro ao abrir a conta:", error);

      const loading = getElement("account-loading");

      if (loading) {
        loading.replaceChildren();

        const message = document.createElement("p");
        message.className = "text-danger";
        message.textContent =
          "Não foi possível carregar a conta. " +
          "Verifica a ligação e tenta novamente.";

        loading.append(message);
      }

      await showMessage(
        "error",
        "Não foi possível abrir a conta",
        error.message || "Ocorreu um erro inesperado."
      );
    }
  }

  async function loadProfile() {
    const { data, error } = await getClient()
      .from("profiles")
      .select("full_name, phone, phone_alt")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error(
        "O perfil desta conta não foi encontrado na base de dados."
      );
    }

    getElement("account-name").value = data.full_name || "";
    getElement("account-phone").value = data.phone || "";
    getElement("account-phone-alt").value = data.phone_alt || "";
  }

  async function updateProfile() {
    if (!currentUser) return;

    const fullName = getElement("account-name").value.trim();
    const phone = getElement("account-phone").value.trim();
    const phoneAlt = getElement("account-phone-alt").value.trim();

    if (!fullName || !phone) {
      await showMessage(
        "warning",
        "Dados incompletos",
        "Preenche o nome e o telefone."
      );

      return;
    }

    setButtonLoading("update-profile-button", true);

    try {
      const { data, error } = await getClient()
        .from("profiles")
        .update({
          full_name: fullName,
          phone,
          phone_alt: phoneAlt || null
        })
        .eq("id", currentUser.id)
        .select("id")
        .single();

      if (error) throw error;

      if (!data) {
        throw new Error("Nenhum perfil foi atualizado.");
      }

      await showMessage(
        "success",
        "Dados atualizados",
        "Os teus dados foram guardados."
      );
    } catch (error) {
      console.error("[Loja MZ] Erro ao atualizar perfil:", error);

      await showMessage(
        "error",
        "Erro ao atualizar",
        error.message || "Não foi possível guardar os dados."
      );
    } finally {
      setButtonLoading("update-profile-button", false);
    }
  }

  async function loadAddress() {
    const { data, error } = await getClient()
      .from("addresses")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      currentAddressId = null;
      return;
    }

    currentAddressId = data.id;

    getElement("address-province").value = data.province || "";
    getElement("address-city").value = data.city || "";
    getElement("address-neighborhood").value =
      data.neighborhood || "";
    getElement("address-street").value = data.street || "";
    getElement("address-reference").value = data.reference || "";
  }

  async function saveAddress() {
    if (!currentUser) return;

    const address = {
      user_id: currentUser.id,
      full_name: getElement("account-name").value.trim(),
      phone: getElement("account-phone").value.trim(),
      province: getElement("address-province").value,
      city: getElement("address-city").value.trim(),
      neighborhood: getElement("address-neighborhood").value.trim(),
      street: getElement("address-street").value.trim(),
      reference:
        getElement("address-reference").value.trim() || null,
      is_default: true
    };

    if (
      !address.full_name ||
      !address.phone ||
      !address.province ||
      !address.city ||
      !address.neighborhood ||
      !address.street
    ) {
      await showMessage(
        "warning",
        "Dados incompletos",
        "Preenche o nome, telefone e os campos obrigatórios da morada."
      );

      return;
    }

    setButtonLoading("save-address-button", true);

    try {
      let response;

      if (currentAddressId) {
        response = await getClient()
          .from("addresses")
          .update(address)
          .eq("id", currentAddressId)
          .eq("user_id", currentUser.id)
          .select("id")
          .single();
      } else {
        response = await getClient()
          .from("addresses")
          .insert(address)
          .select("id")
          .single();
      }

      if (response.error) throw response.error;

      currentAddressId = response.data.id;

      await showMessage(
        "success",
        "Morada guardada",
        "A morada foi guardada com sucesso."
      );
    } catch (error) {
      console.error("[Loja MZ] Erro ao guardar morada:", error);

      await showMessage(
        "error",
        "Erro ao guardar morada",
        error.message || "Tenta novamente."
      );
    } finally {
      setButtonLoading("save-address-button", false);
    }
  }

  async function loadOrders() {
    const container = getElement("account-orders");

    if (!container) return;

    container.textContent = "A carregar pedidos...";

    try {
      const { data, error } = await getClient()
        .from("orders")
        .select("id, order_number, total, status, created_at")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      container.replaceChildren();

      if (!data || data.length === 0) {
        const message = document.createElement("p");
        message.className = "text-muted text-center py-4";
        message.textContent = "Ainda não realizaste nenhum pedido.";

        container.append(message);
        return;
      }

      const statuses = {
        pending: "Pendente",
        processing: "Em preparação",
        shipped: "Enviado",
        delivered: "Entregue",
        cancelled: "Cancelado"
      };

      data.forEach(order => {
        const link = document.createElement("a");
        link.className = "account-order";
        link.href = `pedido.html?id=${encodeURIComponent(order.id)}`;

        const left = document.createElement("div");
        const right = document.createElement("div");
        right.className = "text-end";

        const number = document.createElement("strong");
        number.textContent = order.order_number || order.id;

        const date = document.createElement("small");
        date.className = "d-block text-muted";
        date.textContent = new Date(
          order.created_at
        ).toLocaleDateString("pt-MZ");

        const total = document.createElement("strong");
        total.textContent = formatMZN(order.total);

        const status = document.createElement("small");
        status.className = "d-block text-muted";
        status.textContent = statuses[order.status] || order.status;

        left.append(number, date);
        right.append(total, status);
        link.append(left, right);

        container.append(link);
      });
    } catch (error) {
      container.textContent = "Não foi possível carregar os pedidos.";
      container.classList.add("text-danger");

      throw error;
    }
  }

  async function signOut() {
    try {
      const { error } = await getClient().auth.signOut();

      if (error) throw error;

      window.location.replace("login.html");
    } catch (error) {
      await showMessage(
        "error",
        "Erro ao terminar sessão",
        error.message || "Tenta novamente."
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initializeAccount,
      { once: true }
    );
  } else {
    initializeAccount();
  }
})();