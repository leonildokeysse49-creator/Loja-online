/* =========================================
   Loja MZ — Validação do administrador

   Esta validação controla a interface.
   As permissões reais dos dados são aplicadas por RLS.
   ========================================= */

(function adminAuthentication() {
  "use strict";

  window.currentAdmin = null;

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

  function initializeSidebar() {
    const sidebar = document.getElementById("admin-sidebar");
    const toggle = document.getElementById("sidebar-toggle");

    if (!sidebar || !toggle) return;

    toggle.setAttribute("aria-controls", "admin-sidebar");
    toggle.setAttribute("aria-expanded", "false");

    toggle.addEventListener("click", () => {
      const isOpen = sidebar.classList.toggle("open");

      toggle.setAttribute(
        "aria-expanded",
        String(isOpen)
      );
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        sidebar.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  async function showError(title, text) {
    if (window.Swal) {
      await window.Swal.fire({
        icon: "error",
        title,
        text,
        confirmButtonText: "Entendido"
      });
    } else {
      window.alert(`${title}\n${text}`);
    }
  }

  function hideAdminArea() {
    document.querySelectorAll(".admin-content").forEach(element => {
      element.hidden = true;
    });
  }

  function showAdminArea() {
    document.querySelectorAll(".admin-content").forEach(element => {
      element.hidden = false;
    });

    document.getElementById("admin-loading")
      ?.classList.add("d-none");

    document.getElementById("admin-content")
      ?.classList.remove("d-none");
  }

  async function validateAdmin() {
    hideAdminArea();

    try {
      const client = getClient();

      const {
        data: { user },
        error: userError
      } = await client.auth.getUser();

      if (userError) {
        console.error(
          "[Loja MZ] Erro ao validar sessão:",
          userError
        );

        if (
          userError.name === "AuthSessionMissingError" ||
          userError.status === 401 ||
          userError.status === 403
        ) {
          await showError(
            "Inicia sessão",
            "A sessão não está disponível ou expirou."
          );

          window.location.replace("../login.html");
          return false;
        }

        throw userError;
      }

      if (!user) {
        window.location.replace("../login.html");
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

      if (profileError) {
        throw profileError;
      }

      if (!profile) {
        await showError(
          "Perfil não encontrado",
          "A conta está autenticada, mas o perfil não foi encontrado. " +
          "Verifica o registo na tabela profiles."
        );

        return false;
      }

      if (profile.role !== "admin") {
        await showError(
          "Acesso restrito",
          "Esta conta não tem o papel de administrador. " +
          "Confirma se promoveste o mesmo e-mail usado no login."
        );

        window.location.replace("../conta.html");
        return false;
      }

      window.currentAdmin = {
        id: user.id,
        email: user.email,
        profile
      };

      const name = document.getElementById("admin-name");

      if (name) {
        name.textContent =
          profile.full_name || user.email || "Administrador";
      }

      showAdminArea();

      document.dispatchEvent(
        new CustomEvent("admin:ready", {
          detail: window.currentAdmin
        })
      );

      console.info(
        "[Loja MZ] Acesso administrativo validado."
      );

      return true;
    } catch (error) {
      console.error(
        "[Loja MZ] Falha na validação administrativa:",
        error
      );

      await showError(
        "Não foi possível validar o acesso",
        error.message ||
          "Verifica a ligação, as permissões e a configuração."
      );

      return false;
    }
  }

  async function logoutAdmin() {
    let confirmed = true;

    if (window.Swal) {
      const result = await window.Swal.fire({
        icon: "question",
        title: "Terminar sessão?",
        text: "Pretendes sair do painel?",
        showCancelButton: true,
        confirmButtonText: "Sair",
        cancelButtonText: "Cancelar"
      });

      confirmed = result.isConfirmed;
    } else {
      confirmed = window.confirm("Pretendes terminar a sessão?");
    }

    if (!confirmed) return;

    try {
      const { error } = await getClient().auth.signOut();

      if (error) throw error;

      window.currentAdmin = null;
      window.location.replace("../login.html");
    } catch (error) {
      await showError(
        "Erro ao terminar sessão",
        error.message || "Tenta novamente."
      );
    }
  }

  function initializeAdminPage() {
    initializeSidebar();

    [
      "admin-logout-button",
      "dropdown-logout-button"
    ].forEach(id => {
      document.getElementById(id)?.addEventListener(
        "click",
        logoutAdmin
      );
    });

    validateAdmin();
  }

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