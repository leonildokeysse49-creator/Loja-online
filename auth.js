/* =========================================
   Loja MZ — Autenticação
   ========================================= */

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");

  if (loginForm) {
    loginForm.addEventListener("submit", event => {
      event.preventDefault();
      loginUser();
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", event => {
      event.preventDefault();
      registerUser();
    });
  }
});

async function loginUser() {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const button = document.getElementById("login-button");

  if (!email || !password) {
    Swal.fire({
      icon: "warning",
      title: "Dados incompletos",
      text: "Preencha o e-mail e a palavra-passe."
    });

    return;
  }

  button.disabled = true;
  button.innerHTML = `
    <span class="spinner-border spinner-border-sm me-2"></span>
    A entrar...
  `;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    Swal.fire({
      icon: "success",
      title: "Bem-vindo",
      text: "Sessão iniciada com sucesso.",
      timer: 1500,
      showConfirmButton: false
    }).then(() => {
      if (profile?.role === "admin") {
        window.location.href = "admin/index.html";
      } else {
        window.location.href = "conta.html";
      }
    });

  } catch (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Erro ao entrar",
      text: "Verifique o e-mail e a palavra-passe."
    });

  } finally {
    button.disabled = false;
    button.innerHTML = `
      <i class="bi bi-box-arrow-in-right me-2"></i>
      Entrar
    `;
  }
}

async function registerUser() {
  const fullName = document.getElementById("register-name").value.trim();
  const email = document.getElementById("register-email").value.trim();
  const phone = document.getElementById("register-phone").value.trim();
  const password = document.getElementById("register-password").value;
  const confirmPassword = document.getElementById("register-confirm-password").value;
  const button = document.getElementById("register-button");

  if (!fullName || !email || !phone || !password) {
    Swal.fire({
      icon: "warning",
      title: "Dados incompletos",
      text: "Preencha todos os campos obrigatórios."
    });

    return;
  }

  if (password !== confirmPassword) {
    Swal.fire({
      icon: "warning",
      title: "Palavras-passe diferentes",
      text: "As palavras-passe não coincidem."
    });

    return;
  }

  button.disabled = true;
  button.innerHTML = `
    <span class="spinner-border spinner-border-sm me-2"></span>
    A criar conta...
  `;

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone: phone
        }
      }
    });

    if (error) throw error;

    if (data.session) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          phone: phone
        })
        .eq("id", data.user.id);

      if (profileError) throw profileError;
    }

    Swal.fire({
      icon: "success",
      title: "Conta criada",
      text: data.session
        ? "A sua conta foi criada com sucesso."
        : "Verifique o seu e-mail para confirmar a conta.",
      timer: 2500,
      showConfirmButton: false
    }).then(() => {
      if (data.session) {
        window.location.href = "conta.html";
      } else {
        window.location.href = "login.html";
      }
    });

  } catch (error) {
    console.error(error);

    let message = "Não foi possível criar a conta.";

    if (error.message?.includes("already registered")) {
      message = "Este e-mail já está registado.";
    }

    Swal.fire({
      icon: "error",
      title: "Erro ao registar",
      text: message
    });

  } finally {
    button.disabled = false;
    button.innerHTML = `
      <i class="bi bi-person-plus me-2"></i>
      Criar conta
    `;
  }
}

async function logoutUser() {
  await supabase.auth.signOut();

  window.location.href = "index.html";
}