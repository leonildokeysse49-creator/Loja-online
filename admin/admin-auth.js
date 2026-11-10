
/* =========================================
   Loja MZ — Autenticação dos painéis

   ADMINISTRADOR:
   - Acesso ao painel administrativo.

   VENDEDOR:
   - Início próprio.
   - Produtos.
   - Formulário de produtos.
   - Categorias.
   - Marcas.
   - Banners.
   - Pedidos.

   Estrutura esperada:
   /admin/
   /vendedor/
   /assets/js/admin/admin-auth.js

   IMPORTANTE:
   Este script controla a interface.
   As permissões dos dados dependem das
   políticas RLS e do backend.

   A propriedade dos registos só pode ser
   verificada quando existir um campo de
   autoria e a respetiva proteção no Supabase.
   ========================================= */

(function adminAuthentication() {
  "use strict";

  if (window.lojaMzAdminAuthInitialized) return;

  window.lojaMzAdminAuthInitialized = true;
  window.currentAdmin = null;

  const PANEL_ROLES = ["admin", "vendedor"];

  /* =========================================
     Menus apresentados ao vendedor
     ========================================= */

  const VENDOR_MENUS = [
    {
      label: "Início do vendedor",
      path: "vendedor/index.html",
      icon: "bi-speedometer2"
    },
    {
      label: "Produtos",
      path: "admin/produtos.html",
      icon: "bi-box-seam"
    },
    {
      label: "Categorias",
      path: "admin/categorias.html",
      icon: "bi-tags"
    },
    {
      label: "Marcas",
      path: "admin/marcas.html",
      icon: "bi-award"
    },
    {
      label: "Banners",
      path: "admin/banners.html",
      icon: "bi-image"
    },
    {
      label: "Pedidos",
      path: "admin/pedidos.html",
      icon: "bi-receipt"
    }
  ];

  /*
   * O formulário é uma página permitida,
   * mas não precisa de ser um menu separado.
   *
   * Também permite parâmetros na mesma página:
   * produto-form.html?id=...
   */
  const VENDOR_ALLOWED_PAGES = [
    ...VENDOR_MENUS.map(item => item.path),
    "admin/produto-form.html"
  ];

  const el = id => document.getElementById(id);

  /*
   * Resolver a raiz da loja a partir deste script.
   * Mantém a subpasta do projeto no GitHub Pages.
   *
   * Este ficheiro deve estar em:
   * assets/js/admin/admin-auth.js
   */
  const currentScript = document.currentScript;

  const siteRoot = currentScript?.src
    ? new URL("../../../", currentScript.src)
    : new URL("../", window.location.href);

  let validating = false;
  let loggingOut = false;
  let redirecting = false;

  let adminReadyDispatched = false;
  let initializedIdentity = null;
  let authSubscription = null;

  let sidebarInitialized = false;
  let storeBrandLoaded = false;

  /* =========================================
     Ocultar conteúdo durante a validação
     ========================================= */

  const accessStyle = document.createElement("style");
  accessStyle.id = "loja-mz-panel-access-style";

  accessStyle.textContent = `
    html.loja-mz-panel-pending .admin-content,
    html.loja-mz-panel-pending .admin-topbar,
    html.loja-mz-panel-pending .sidebar-nav,
    html.loja-mz-panel-pending .sidebar-footer,
    html.loja-mz-panel-pending .modal {
      display: none !important;
    }

    .panel-user-identity {
      min-width: 0;
      margin-left: auto;
      text-align: right;
      overflow-wrap: anywhere;
    }

    .panel-user-identity #admin-name {
      font-weight: 600;
    }

    .panel-user-identity #admin-role {
      display: block;
      font-size: .72rem;
      line-height: 1.3;
      margin-top: 2px;
    }

    .admin-topbar .admin-title {
      min-width: 0;
      overflow-wrap: anywhere;
    }
  `;

  document.head.append(accessStyle);

  document.documentElement.classList.add(
    "loja-mz-panel-pending"
  );

  /* =========================================
     Cliente Supabase
     ========================================= */

  function getClient() {
    const client = window.lojaMzSupabaseClient;

    if (
      !client ||
      typeof client.from !== "function" ||
      !client.auth
    ) {
      throw new Error(
        "O Supabase não foi inicializado. " +
        "Verifica config.js e supabase.js."
      );
    }

    return client;
  }

  /* =========================================
     Endereços
     ========================================= */

  function siteUrl(path) {
    return new URL(path, siteRoot);
  }

  function publicUrl(filename) {
    return siteUrl(filename).href;
  }

  function vendorHomeUrl() {
    return siteUrl("vendedor/index.html").href;
  }

  function adminHomeUrl() {
    return siteUrl("admin/index.html").href;
  }

  function samePage(first, second) {
    return (
      first.origin === second.origin &&
      first.pathname === second.pathname
    );
  }

  function isWithinPanel(url, folder) {
    return (
      url.origin === siteRoot.origin &&
      url.pathname.startsWith(siteUrl(folder).pathname)
    );
  }

  function redirectTo(url) {
    if (redirecting) return;

    redirecting = true;
    window.currentAdmin = null;

    hideAdminArea();

    window.location.replace(url);
  }

  /* =========================================
     Mensagens
     ========================================= */

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
     Papéis e permissões da interface
     ========================================= */

  window.isAdmin = function isAdmin() {
    return window.currentAdmin?.profile?.role === "admin";
  };

  window.isVendor = function isVendor() {
    return window.currentAdmin?.profile?.role === "vendedor";
  };

  window.canAccessAdminPanel = function canAccessAdminPanel() {
    return PANEL_ROLES.includes(
      window.currentAdmin?.profile?.role
    );
  };

  /*
   * Compatibilidade com páginas existentes.
   *
   * Esta função verifica propriedade do registo.
   * Não controla a abertura do formulário de criação.
   *
   * Sem created_by, o vendedor não é considerado
   * proprietário por esta função.
   */
  window.canManageItem = function canManageItem(item) {
    if (!window.currentAdmin || !item) return false;

    if (window.isAdmin()) return true;

    if (!window.isVendor()) return false;

    if (!item.created_by) return false;

    return (
      String(item.created_by) ===
      String(window.currentAdmin.id)
    );
  };

  function canVendorOpenUrl(value) {
    try {
      const target = new URL(value, window.location.href);

      return VENDOR_ALLOWED_PAGES.some(path => {
        return samePage(target, siteUrl(path));
      });
    } catch (error) {
      return false;
    }
  }

  window.canAccessPanelPage = function canAccessPanelPage(value) {
    if (!window.currentAdmin) return false;

    let target;

    try {
      target = new URL(value, window.location.href);
    } catch (error) {
      return false;
    }

    if (window.isAdmin()) {
      return isWithinPanel(target, "admin/");
    }

    if (window.isVendor()) {
      return canVendorOpenUrl(target.href);
    }

    return false;
  };

  function validatePageAccess(profile) {
    const current = new URL(window.location.href);

    if (profile.role === "admin") {
      if (!isWithinPanel(current, "admin/")) {
        redirectTo(adminHomeUrl());
        return false;
      }

      return true;
    }

    if (profile.role === "vendedor") {
      if (!canVendorOpenUrl(current.href)) {
        redirectTo(vendorHomeUrl());
        return false;
      }

      return true;
    }

    redirectTo(publicUrl("conta.html"));
    return false;
  }

  /* =========================================
     Sidebar do vendedor
     ========================================= */

  function closeSidebar() {
    el("admin-sidebar")?.classList.remove("open");

    el("sidebar-toggle")?.setAttribute(
      "aria-expanded",
      "false"
    );
  }

  function renderVendorSidebar() {
    const navigation = document.querySelector(".sidebar-nav");

    if (!navigation) return;

    navigation.setAttribute(
      "aria-label",
      "Navegação do vendedor"
    );

    const fragment = document.createDocumentFragment();

    VENDOR_MENUS.forEach(menu => {
      const link = document.createElement("a");
      link.className = "sidebar-link";
      link.href = siteUrl(menu.path).href;

      const icon = document.createElement("i");
      icon.className = `bi ${menu.icon}`;
      icon.setAttribute("aria-hidden", "true");

      const label = document.createElement("span");
      label.textContent = menu.label;

      link.append(icon, label);
      fragment.append(link);
    });

    navigation.replaceChildren(fragment);
  }

  function updateActiveSidebarLink() {
    const current = new URL(window.location.href);

    const productForm = siteUrl("admin/produto-form.html");
    const productsPage = siteUrl("admin/produtos.html");

    document.querySelectorAll(
      ".sidebar-nav a.sidebar-link"
    ).forEach(link => {
      try {
        const target = new URL(
          link.href,
          window.location.href
        );

        /*
         * Ao criar ou editar um produto no formulário,
         * manter o menu Produtos selecionado.
         */
        const isProductForm =
          samePage(current, productForm) &&
          samePage(target, productsPage);

        const active =
          samePage(current, target) || isProductForm;

        link.classList.toggle("active", active);

        if (active) {
          link.setAttribute("aria-current", "page");
        } else {
          link.removeAttribute("aria-current");
        }
      } catch (error) {
        link.classList.remove("active");
        link.removeAttribute("aria-current");
      }
    });
  }

  function applyRoleVisibility() {
    const admin = window.isAdmin();
    const vendor = window.isVendor();

    document.querySelectorAll(".admin-only").forEach(node => {
      node.classList.toggle("d-none", !admin);
    });

    document.querySelectorAll(".vendor-only").forEach(node => {
      node.classList.toggle("d-none", !vendor);
    });

    if (vendor) {
      renderVendorSidebar();
    }

    updateActiveSidebarLink();
  }

  function initializeSidebar() {
    if (sidebarInitialized) return;

    const sidebar = el("admin-sidebar");
    const toggle = el("sidebar-toggle");

    if (!sidebar) return;

    sidebarInitialized = true;

    if (toggle) {
      toggle.type = "button";
      toggle.setAttribute("aria-controls", "admin-sidebar");
      toggle.setAttribute("aria-expanded", "false");

      toggle.addEventListener("click", () => {
        const open = sidebar.classList.toggle("open");

        toggle.setAttribute(
          "aria-expanded",
          String(open)
        );
      });
    }

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeSidebar();
      }
    });

    document.addEventListener("click", event => {
      if (!(event.target instanceof Node)) return;

      if (
        window.matchMedia("(max-width: 991.98px)").matches &&
        !sidebar.contains(event.target) &&
        (!toggle || !toggle.contains(event.target))
      ) {
        closeSidebar();
      }
    });

    /*
     * Delegação: funciona também depois de substituir
     * os links da sidebar pela navegação do vendedor.
     */
    sidebar.addEventListener("click", event => {
      if (!(event.target instanceof Element)) return;

      if (event.target.closest("a[href]")) {
        closeSidebar();
      }
    });
  }

  /* =========================================
     Estado visual do acesso
     ========================================= */

  function hideAdminArea() {
    document.documentElement.classList.add(
      "loja-mz-panel-pending"
    );

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

    const vendorLoading = el("vendor-loading");
    const vendorPanel = el("vendor-panel");

    if (vendorLoading) {
      vendorLoading.hidden = true;
    }

    if (vendorPanel) {
      vendorPanel.hidden = false;
    }

    document.documentElement.classList.remove(
      "loja-mz-panel-pending"
    );
  }

  function clearAccessMessage() {
    el("admin-access-message")?.remove();
  }

  function closeOpenModals() {
    if (!window.bootstrap?.Modal) return;

    document.querySelectorAll(".modal.show").forEach(modal => {
      window.bootstrap.Modal.getInstance(modal)?.hide();
    });
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
    alert.setAttribute("role", "alert");

    const paragraph = document.createElement("p");
    paragraph.className = retry ? "mb-3" : "mb-0";
    paragraph.textContent = message;

    alert.append(paragraph);

    if (retry) {
      const retryButton = document.createElement("button");
      retryButton.type = "button";
      retryButton.className = "btn btn-outline-primary btn-sm";
      retryButton.textContent = "Tentar novamente";

      retryButton.addEventListener("click", () => {
        validateAdmin();
      });

      alert.append(retryButton);
    }

    container.append(alert);

    const header = main.querySelector(".admin-topbar");

    if (header) {
      header.insertAdjacentElement("afterend", container);
    } else {
      main.prepend(container);
    }

    /*
     * Mostrar o invólucro para apresentar o erro.
     * Menus e conteúdo continuam ocultos pelo estado pending.
     */
    const vendorPanel = el("vendor-panel");
    const vendorLoading = el("vendor-loading");

    if (vendorPanel) {
      vendorPanel.hidden = false;
    }

    if (vendorLoading) {
      vendorLoading.hidden = true;
    }
  }

  /* =========================================
     Identidade e nome da pessoa
     ========================================= */

  function getProfileName(profile) {
    return typeof profile.full_name === "string"
      ? profile.full_name.trim()
      : "";
  }

  function renderAdminIdentity(profile) {
    const fullName = getProfileName(profile);

    const roleLabels = {
      admin: "Administrador",
      vendedor: "Vendedor"
    };

    const roleLabel =
      roleLabels[profile.role] || "Utilizador";

    let name = el("admin-name");

    /*
     * Criar o espaço de identidade nas páginas
     * que ainda não tenham admin-name.
     */
    if (!name) {
      const topbar = document.querySelector(".admin-topbar");

      if (topbar) {
        const identity = document.createElement("div");
        identity.id = "panel-user-identity";
        identity.className = "panel-user-identity";

        name = document.createElement("span");
        name.id = "admin-name";
        name.className = "fw-semibold";

        const role = document.createElement("small");
        role.id = "admin-role";
        role.className = "d-block text-muted";

        identity.append(name, role);
        topbar.append(identity);
      }
    }

    if (name) {
      name.textContent = fullName || "Nome não definido";
    }

    let role = el("admin-role");

    if (!role && name) {
      role = document.createElement("small");
      role.id = "admin-role";
      role.className = "d-block text-muted";

      name.insertAdjacentElement("afterend", role);
    }

    if (role) {
      role.textContent = roleLabel;
      role.style.fontSize = "0.72rem";
      role.style.lineHeight = "1.3";
      role.style.marginTop = "2px";
    }

    const dropdownButton = name?.closest("button");

    if (dropdownButton) {
      dropdownButton.type = "button";

      dropdownButton.setAttribute(
        "aria-label",
        fullName
          ? `Conta de ${fullName}`
          : "Conta do utilizador"
      );
    }

    /*
     * O nome entra no título apenas no início do vendedor.
     * Nas páginas internas, manter Produtos, Categorias, etc.
     */
    const current = new URL(window.location.href);
    const vendorHome = siteUrl("vendedor/index.html");

    if (
      profile.role === "vendedor" &&
      samePage(current, vendorHome)
    ) {
      const heading = fullName
        ? `Painel do vendedor — ${fullName}`
        : "Painel do vendedor";

      const title = document.querySelector(".admin-title");

      if (title) {
        title.textContent = heading;
      }
    }

    updateDocumentTitle();
  }

  function updateDocumentTitle() {
    const title =
      document.querySelector(".admin-title")
        ?.textContent.trim() || "Painel";

    const storeName = window.lojaMzStoreName || "Loja MZ";

    document.title = `${title} — ${storeName}`;
  }

  /* =========================================
     Links para a loja pública
     ========================================= */

  function initializeStoreLinks() {
    const storeUrl = siteUrl("index.html");

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
          pointsToStore || samePage(target, storeUrl);
      } catch (error) {
        return;
      }

      if (!pointsToStore) return;

      link.href = storeUrl.href;
      link.setAttribute("data-view-store", "");

      link.setAttribute(
        "title",
        "Abrir a loja sem terminar a sessão"
      );
    });
  }

  /* =========================================
     Nome configurado da loja
     ========================================= */

  async function loadStoreBrand() {
    /*
     * Não consultar settings como vendedor sem
     * confirmar as permissões dessa tabela.
     */
    if (!window.isAdmin() || storeBrandLoaded) return;

    const expectedUserId = window.currentAdmin.id;

    try {
      const { data, error } = await getClient()
        .from("settings")
        .select("store_name")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (
        !window.isAdmin() ||
        window.currentAdmin.id !== expectedUserId
      ) {
        return;
      }

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
            "[Painel] Não foi possível atualizar APP_CONFIG:",
            error
          );
        }
      }

      window.lojaMzStoreName = name;
      storeBrandLoaded = true;

      updateDocumentTitle();
    } catch (error) {
      console.warn(
        "[Painel] Não foi possível carregar o nome da loja:",
        error
      );
    }
  }

  /* =========================================
     Validar sessão, papel e página
     ========================================= */

  async function validateAdmin() {
    if (validating || loggingOut || redirecting) {
      return false;
    }

    validating = true;
    window.currentAdmin = null;

    clearAccessMessage();
    hideAdminArea();
    closeOpenModals();

    try {
      const client = getClient();

      const {
        data: { user },
        error: userError
      } = await client.auth.getUser();

      if (redirecting || loggingOut) return false;

      if (userError) {
        const missingSession =
          userError.name === "AuthSessionMissingError" ||
          userError.status === 401;

        if (missingSession) {
          redirectTo(publicUrl("login.html"));
          return false;
        }

        throw userError;
      }

      if (!user) {
        redirectTo(publicUrl("login.html"));
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

      if (redirecting || loggingOut) return false;

      if (profileError) throw profileError;

      if (!profile) {
        showAccessMessage(
          "A conta está autenticada, mas o perfil não foi encontrado. " +
          "Verifica o registo em profiles e as permissões de leitura.",
          true
        );

        return false;
      }

      if (!PANEL_ROLES.includes(profile.role)) {
        await showError(
          "Acesso restrito",
          "Esta conta não tem autorização para aceder ao painel."
        );

        redirectTo(publicUrl("conta.html"));
        return false;
      }

      /*
       * Se a identidade mudar numa página já inicializada,
       * recarregar para não reutilizar dados da conta anterior.
       */
      if (
        initializedIdentity &&
        (
          initializedIdentity.id !== user.id ||
          initializedIdentity.role !== profile.role
        )
      ) {
        redirecting = true;
        window.location.reload();
        return false;
      }

      if (!validatePageAccess(profile)) {
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
        initializedIdentity = {
          id: user.id,
          role: profile.role
        };

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
      if (redirecting || loggingOut) return false;

      console.error(
        "[Painel] Falha ao validar acesso:",
        error
      );

      window.currentAdmin = null;
      hideAdminArea();

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

    if (loggingOut || redirecting) return;

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

      redirectTo(publicUrl("login.html"));
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
     Acompanhar a sessão
     ========================================= */

  function initializeAuthListener() {
    try {
      const { data } = getClient().auth.onAuthStateChange(
        (event, session) => {
          if (redirecting) return;

          if (event === "SIGNED_OUT") {
            window.currentAdmin = null;
            hideAdminArea();

            if (!loggingOut) {
              redirectTo(publicUrl("login.html"));
            }

            return;
          }

          /*
           * Se outra conta iniciar sessão noutra aba,
           * não manter o painel da identidade anterior.
           */
          if (
            event === "SIGNED_IN" &&
            initializedIdentity &&
            session?.user?.id &&
            session.user.id !== initializedIdentity.id
          ) {
            window.currentAdmin = null;
            hideAdminArea();

            redirecting = true;
            window.location.reload();
          }
        }
      );

      authSubscription = data?.subscription || null;
    } catch (error) {
      console.warn(
        "[Painel] Não foi possível acompanhar a sessão:",
        error
      );
    }
  }

  /* =========================================
     Inicialização
     ========================================= */

  function initializeAdminPage() {
    hideAdminArea();

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

    initializeAuthListener();
    validateAdmin();
  }

  window.addEventListener("pageshow", event => {
    if (event.persisted) {
      validateAdmin();
    }
  });

  window.addEventListener("pagehide", event => {
    if (!event.persisted) {
      authSubscription?.unsubscribe();
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
