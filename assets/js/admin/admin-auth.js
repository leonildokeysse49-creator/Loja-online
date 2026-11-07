
/* =========================================
   Loja MZ — Autenticação administrativa

   Papéis suportados:
   - admin: acesso total ao painel
   - vendedor: produtos, categorias e pedidos

   Esta validação controla a interface.
   As permissões dos dados continuam dependentes de RLS.
   ========================================= */

(function adminAuthentication() {
  "use strict";

  if (window.lojaMzAdminAuthInitialized) return;

  window.lojaMzAdminAuthInitialized = true;
  window.currentAdmin = null;

  const ADMIN_PANEL_ROLES = ["admin", "vendedor"];

  let validating = false;
  let loggingOut = false;
  let adminReadyDispatched = false;

  const el = id => document.getElementById(id);

  function getClient() {
    const client = window.lojaMzSupabaseClient;

    if (!client || typeof client.from !== "function") {
      throw new Error(
        "O Supabase não foi inicializado. " +
        "Verifica config.js e supabase.js."
      );
    }

    return client;
  }

  function publicUrl(filename) {
    return new URL(
      `../${filename}`,
      window.location.href
    ).href;
  }

  async function showError(title, text) {
    if (window.Swal) {
      await window.Swal.fire({
        icon: "error",
        title,
        text,
        confirmButtonText: "Entendido"
      });

      return;
    }

    window.alert(`${title}\n${text}`);
  }

  /* =========================================
      Papéis e permissões
      ========================================= */

  window.isAdmin = () => {
    return window.currentAdmin?.profile?.role === "admin";
  };

  window.isVendor = () => {
    return window.currentAdmin?.profile?.role === "vendedor";
  };

  window.canAccessAdminPanel = () => {
    return ADMIN_PANEL_ROLES.includes(
      window.currentAdmin?.profile?.role
    );
  };

  window.canManageItem = item => {
    if (!window.currentAdmin || !item) return false;

    if (window.isAdmin()) return true;

    return (
      window.isVendor() &&
      item.created_by === window.currentAdmin.id
    );
  };

  function applyRoleVisibility() {
    const isAdmin = window.isAdmin();
    const isVendor = window.isVendor();

    console.log(
      "[Admin] Papel detetado:",
      window.currentAdmin?.profile?.role
    );

    document.querySelectorAll(".admin-only").forEach(node => {
      node.classList.toggle("d-none", !isAdmin);
    });

    document.querySelectorAll(".vendor-only").forEach(node => {
      node.classList.toggle("d-none", !isVendor);
    });
  }

  /* =========================================
      Estado do acesso
      ========================================= */

  function hideAdminArea() {
    document.querySelectorAll(".admin-content").forEach(node => {
      node.hidden = true;
    });
  }

  function showAdminArea() {
    document.querySelectorAll(".admin-content").forEach(node => {
      node.hidden = false;
    });

    el("admin-loading")?.classList.add("d-none");
    el("admin-content")?.classList.remove("d-none");
  }

  function clearAccessMessage() {
    el("admin-access-message")?.remove();
  }

  function showAccessMessage(message, retry = false) {
    clearAccessMessage();

    const main = document.querySelector(".admin-main");

    if (!main) return;

    const container = document.createElement("div");
    container.id = "admin-access-message";
    container.className = "p-3";

    const alert = document.createElement("div");
    alert.className = "alert alert-warning";

    const paragraph = document.createElement("p");
    paragraph.className = retry ? "mb-3" : "mb-0";
    paragraph.textContent = message;

    alert.append(paragraph);

    if (retry) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-outline-primary btn-sm";
      button.textContent = "Tentar novamente";

      button.addEventListener("click", () => {
        validateAdmin();
      });

      alert.append(button);
    }

    container.append(alert);

    const header = main.querySelector(".admin-topbar");

    if (header) {
      header.insertAdjacentElement("afterend", container);
    } else {
      main.prepend(container);
    }
  }

  /* =========================================
      Sidebar
      ========================================= */

  function initializeSidebar() {
    const sidebar = el("admin-sidebar");
    const toggle = el("sidebar-toggle");

    if (!sidebar || !toggle) return;

    toggle.type = "button";
    toggle.setAttribute("aria-controls", "admin-sidebar");
    toggle.setAttribute("aria-expanded", "false");

    function closeSidebar() {
      sidebar.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }

    toggle.addEventListener("click", () => {
      const open = sidebar.classList.toggle("open");

      toggle.setAttribute("aria-expanded", String(open));
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeSidebar();
      }
    });

    document.addEventListener("click", event => {
      if (
        window.matchMedia("(max-width: 991.98px)").matches &&
        event.target instanceof Node &&
        !sidebar.contains(event.target) &&
        !toggle.contains(event.target)
      ) {
        closeSidebar();
      }
    });
  }

  /* =========================================
      Ver loja
      ========================================= */

  function initializeStoreLinks() {
    const storeUrl = publicUrl("index.html");

    document.querySelectorAll(
      ".admin-topbar a[href], " +
      ".sidebar-footer a[href], " +
      "[data-view-store]"
    ).forEach(link => {
      if (!(link instanceof HTMLAnchorElement)) return;

      let pointsToStore = link.hasAttribute("data-view-store");

      try {
        const target = new URL(
          link.getAttribute("href") || "",
          window.location.href
        );

        pointsToStore =
          pointsToStore ||
          target.href === storeUrl;
      } catch (error) {
        return;
      }

      if (!pointsToStore) return;

      link.href = storeUrl;
      link.setAttribute("data-view-store", "");
      link.setAttribute(
        "title",
        "Abrir a loja sem terminar a sessão"
      );
    });
  }

  /* =========================================
      Nome e função do utilizador
      ========================================= */

  function renderAdminIdentity(profile) {
    const fullName =
      typeof profile.full_name === "string"
        ? profile.full_name.trim()
        : "";

    const roleLabels = {
      admin: "Administrador",
      vendedor: "Vendedor"
    };

    const roleLabel =
      roleLabels[profile.role] || "Utilizador";

    const name = el("admin-name");

    if (name) {
      name.textContent = fullName || roleLabel;
    }

    let role = el("admin-role");

    if (!role && name) {
      role = document.createElement("small");
      role.id = "admin-role";
      role.className = "d-block text-muted";
      role.style.fontSize = "0.72rem";
      role.style.lineHeight = "1.3";
      role.style.marginTop = "2px";

      name.insertAdjacentElement("afterend", role);
    }

    if (role) {
      role.textContent = roleLabel;
    }

    const dropdownButton = name?.closest("button");

    if (dropdownButton) {
      dropdownButton.type = "button";

      dropdownButton.setAttribute(
        "aria-label",
        fullName
          ? `Conta de ${fullName}, ${roleLabel.toLowerCase()}`
          : `Conta de ${roleLabel.toLowerCase()}`
      );
    }
  }

  /* =========================================
      Nome configurado da loja
      ========================================= */

  async function loadStoreBrand() {
    try {
      const { data, error } = await getClient()
        .from("settings")
        .select("store_name")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      const name =
        typeof data?.store_name === "string"
          ? data.store_name.trim()
          : "";

      if (!name) return;

      document.querySelectorAll(
        ".sidebar-brand span, [data-store-name]"
      ).forEach(node => {
        node.textContent = name;
      });

      if (typeof APP_CONFIG !== "undefined") {
        try {
          APP_CONFIG.storeName = name;
        } catch (error) {
          console.warn(
            "[Admin] Não foi possível atualizar APP_CONFIG:",
            error
          );
        }
      }

      window.lojaMzStoreName = name;

      const pageTitle =
        document.querySelector(".admin-title")
          ?.textContent.trim() || "Painel Administrativo";

      document.title = `${pageTitle} — ${name}`;
    } catch (error) {
      console.warn(
        "[Admin] Não foi possível carregar o nome da loja:",
        error
      );
    }
  }

  /* =========================================
      Validar acesso ao painel
      ========================================= */

  async function validateAdmin() {
    if (validating || loggingOut) return false;

    validating = true;
    clearAccessMessage();
    hideAdminArea();

    try {
      const client = getClient();

      const {
        data: { user },
        error: userError
      } = await client.auth.getUser();

      if (userError) {
        const missingSession =
          userError.name === "AuthSessionMissingError" ||
          userError.status === 401;

        if (missingSession) {
          window.currentAdmin = null;

          await showError(
            "Inicia sessão",
            "Não foi possível confirmar uma sessão válida."
          );

          window.location.replace(
            publicUrl("login.html")
          );

          return false;
        }

        throw userError;
      }

      if (!user) {
        window.currentAdmin = null;

        window.location.replace(
          publicUrl("login.html")
        );

        return false;
      }

      const {
        data: profile,
        error: profileError
      } = await client
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profile) {
        window.currentAdmin = null;

        showAccessMessage(
          "A conta está autenticada, mas o perfil não foi encontrado. " +
          "Verifica o registo em profiles e as permissões de leitura.",
          true
        );

        return false;
      }

      if (!ADMIN_PANEL_ROLES.includes(profile.role)) {
        window.currentAdmin = null;

        await showError(
          "Acesso restrito",
          "Esta conta não tem autorização para aceder ao painel."
        );

        window.location.replace(
          publicUrl("conta.html")
        );

        return false;
      }

      window.currentAdmin = {
        id: user.id,
        email: user.email,
        profile
      };

      renderAdminIdentity(profile);
      applyRoleVisibility();
      showAdminArea();

      if (!adminReadyDispatched) {
        adminReadyDispatched = true;

        document.dispatchEvent(
          new CustomEvent("admin:ready", {
            detail: window.currentAdmin
          })
        );
      }

      loadStoreBrand();

      return true;
    } catch (error) {
      console.error(
        "[Admin] Falha ao validar acesso:",
        error
      );

      window.currentAdmin = null;

      showAccessMessage(
        "Não foi possível validar o acesso. " +
        "A sessão não foi terminada por este script. " +
        "Verifica a ligação e tenta novamente.",
        true
      );

      await showError(
        "Não foi possível validar o acesso",
        error.message || "Verifica a ligação e as permissões."
      );

      return false;
    } finally {
      validating = false;
    }
  }

  /* =========================================
      Terminar sessão
      ========================================= */

  async function logoutAdmin(event) {
    event?.preventDefault();

    if (loggingOut) return;

    loggingOut = true;

    let buttons = [];

    try {
      let confirmed;

      if (window.Swal) {
        const result = await window.Swal.fire({
          icon: "question",
          title: "Terminar sessão?",
          text: "Pretendes desligar esta conta?",
          showCancelButton: true,
          confirmButtonText: "Terminar sessão",
          cancelButtonText: "Cancelar"
        });

        confirmed = result.isConfirmed;
      } else {
        confirmed = window.confirm(
          "Pretendes terminar a sessão?"
        );
      }

      if (!confirmed) return;

      buttons = [
        el("admin-logout-button"),
        el("dropdown-logout-button")
      ].filter(Boolean);

      buttons.forEach(button => {
        button.disabled = true;
      });

      const { error } = await getClient().auth.signOut();

      if (error) throw error;

      window.currentAdmin = null;

      window.location.replace(
        publicUrl("login.html")
      );
    } catch (error) {
      await showError(
        "Erro ao terminar sessão",
        error.message || "Tenta novamente."
      );
    } finally {
      loggingOut = false;

      buttons.forEach(button => {
        button.disabled = false;
      });
    }
  }

  /* =========================================
      Inicialização
      ========================================= */

  function initializeAdminPage() {
    initializeSidebar();
    initializeStoreLinks();

    [
      "admin-logout-button",
      "dropdown-logout-button"
    ].forEach(id => {
      const button = el(id);

      if (!button) return;

      button.type = "button";
      button.addEventListener("click", logoutAdmin);
    });

    validateAdmin();
  }

  window.addEventListener("pageshow", event => {
    if (event.persisted) {
      validateAdmin();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initializeAdminPage,
      { once: true }
    );
  } else {
    initializeAdminPage();
  }
})();
