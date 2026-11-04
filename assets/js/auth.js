/* =========================================
   Loja — Login, registo e sessão existente
   ========================================= */

(function authenticationPage() {
  "use strict";

  let loginBusy = false;
  let registerBusy = false;
  let checkingSession = false;

  const el = id => document.getElementById(id);

  const scriptElement = document.currentScript;

  const storeRoot = scriptElement?.src
    ? new URL("../../", scriptElement.src)
    : new URL("./", window.location.href);

  function pageUrl(path) {
    return new URL(path, storeRoot).href;
  }

  function client() {
    const db = window.lojaMzSupabaseClient;

    if (!db || typeof db.from !== "function") {
      throw new Error("O cliente Supabase não está disponível.");
    }

    return db;
  }

  function missingSession(error) {
    return (
      error?.name === "AuthSessionMissingError" ||
      error?.status === 401
    );
  }

  async function message(icon, title, text) {
    if (window.Swal) {
      await window.Swal.fire({
        icon,
        title,
        text,
        confirmButtonText: "Entendido"
      });
    } else {
      window.alert(`${title}\n${text}`);
    }
  }

  function setLoginStatus(text, error = false) {
    const status = el("login-session-status");
    if (!status) return;

    status.textContent = text;
    status.className = error
      ? "alert alert-warning small"
      : "alert alert-info small";

    status.hidden = !text;
  }

  function disableLogin(disabled) {
    const fields = el("login-fields");

    if (fields) {
      fields.disabled = disabled;
    } else {
      el("login-form")?.querySelectorAll(
        "input, button"
      ).forEach(node => {
        node.disabled = disabled;
      });
    }
  }

  async function destinationFor(user) {
    const { data: profile, error } = await client()
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (error) throw error;

    if (!profile) {
      throw new Error(
        "A conta está autenticada, mas o perfil não foi encontrado. " +
        "Verifica o registo em profiles e as permissões."
      );
    }

    return profile.role === "admin"
      ? "admin/index.html"
      : "conta.html";
  }

  async function checkExistingSession() {
    if (checkingSession || !el("login-form")) return;

    checkingSession = true;
    disableLogin(true);

    setLoginStatus("A verificar se já tens sessão iniciada...");

    try {
      const {
        data: { user },
        error
      } = await client().auth.getUser();

      if (error && !missingSession(error)) {
        throw error;
      }

      if (!user || missingSession(error)) {
        setLoginStatus("");
        return;
      }

      const destination = await destinationFor(user);

      setLoginStatus(
        "Sessão reconhecida. A abrir a tua área..."
      );

      window.location.replace(pageUrl(destination));
    } catch (error) {
      console.error("[Loja] Verificação da sessão:", error);

      setLoginStatus(
        "Não foi possível confirmar o acesso: " +
        error.message +
        " Nenhum logout foi executado.",
        true
      );
    } finally {
      checkingSession = false;
      disableLogin(false);
    }
  }

  async function loginUser() {
    if (loginBusy || checkingSession) return;

    const form = el("login-form");

    if (!form || !form.reportValidity()) return;

    const email = el("login-email").value.trim();
    const password = el("login-password").value;
    const button = el("login-button");
    const original = button.innerHTML;

    loginBusy = true;
    disableLogin(true);
    button.textContent = "A entrar...";

    try {
      const { data, error } = await client()
        .auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;

      if (!data.user) {
        throw new Error("Não foi possível identificar a conta.");
      }

      const destination = await destinationFor(data.user);

      window.location.replace(pageUrl(destination));
    } catch (error) {
      console.error("[Loja] Login:", error);

      await message(
        "error",
        "Não foi possível entrar",
        error.message || "Verifica os dados e tenta novamente."
      );
    } finally {
      loginBusy = false;
      disableLogin(false);
      button.innerHTML = original;
    }
  }

  async function registerUser() {
    if (registerBusy) return;

    const form = el("register-form");

    if (!form || !form.reportValidity()) return;

    const fullName = el("register-name").value.trim();
    const email = el("register-email").value.trim();
    const phone = el("register-phone").value.trim();
    const password = el("register-password").value;
    const confirmation = el("register-confirm-password").value;
    const button = el("register-button");

    if (!fullName || !email || !phone || !password) {
      await message(
        "warning",
        "Dados incompletos",
        "Preenche todos os campos obrigatórios."
      );
      return;
    }

    if (password !== confirmation) {
      await message(
        "warning",
        "Palavras-passe diferentes",
        "As palavras-passe não coincidem."
      );
      return;
    }

    const original = button.innerHTML;

    registerBusy = true;
    button.disabled = true;
    button.textContent = "A criar conta...";

    try {
      const { data, error } = await client().auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone
          }
        }
      });

      if (error) throw error;

      // Mantém a lógica existente: a criação do perfil
      // deve continuar assegurada pela base de dados.
      if (data.session && data.user) {
        const { error: profileError } = await client()
          .from("profiles")
          .update({
            full_name: fullName,
            phone
          })
          .eq("id", data.user.id);

        if (profileError) {
          console.warn(
            "[Loja] Conta criada; atualização do perfil:",
            profileError
          );
        }
      }

      await message(
        "success",
        "Verifica a tua conta",
        data.session
          ? "A tua conta foi criada com sucesso."
          : "Se o registo estiver disponível, receberás as instruções de confirmação por e-mail."
      );

      window.location.replace(
        pageUrl(data.session ? "conta.html" : "login.html")
      );
    } catch (error) {
      console.error("[Loja] Registo:", error);

      await message(
        "error",
        "Não foi possível criar a conta",
        error.message || "Tenta novamente."
      );
    } finally {
      registerBusy = false;
      button.disabled = false;
      button.innerHTML = original;
    }
  }

  async function logoutUser() {
    try {
      const { error } = await client().auth.signOut();

      if (error) throw error;

      window.location.replace(pageUrl("index.html"));
    } catch (error) {
      await message(
        "error",
        "Não foi possível terminar a sessão",
        error.message || "Tenta novamente."
      );
    }
  }

  // Compatibilidade com chamadas existentes.
  window.loginUser = loginUser;
  window.registerUser = registerUser;
  window.logoutUser = logoutUser;

  function initialize() {
    el("login-form")?.addEventListener("submit", event => {
      event.preventDefault();
      loginUser();
    });

    el("register-form")?.addEventListener("submit", event => {
      event.preventDefault();
      registerUser();
    });

    if (el("login-form")) {
      checkExistingSession();
    }
  }

  window.addEventListener("pageshow", event => {
    if (event.persisted && el("login-form")) {
      checkExistingSession();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      { once: true }
    );
  } else {
    initialize();
  }
})();
