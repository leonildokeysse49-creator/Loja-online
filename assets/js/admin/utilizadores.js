
/* =========================================
   Loja MZ — Gestão de utilizadores

   Implementado:
   - Listar perfis reais.
   - Pesquisar por nome ou e-mail.
   - Criar contas pela Edge Function.
   - Papéis: customer, vendedor e admin.
   - Contas administrativas criadas com
     e-mail confirmado pelo administrador.

   Ainda não implementado:
   - Editar contas.
   - Eliminar contas.
   - Ativar/desativar contas.
   ========================================= */

(function usersAdmin() {
  "use strict";

  let initialized = false;
  let saving = false;
  let users = [];

  const el = id => document.getElementById(id);

  const roleLabels = {
    customer: "Cliente",
    vendedor: "Vendedor",
    admin: "Administrador"
  };

  function getClient() {
    const client = window.lojaMzSupabaseClient;

    if (
      !client ||
      typeof client.from !== "function" ||
      !client.functions ||
      !client.auth
    ) {
      throw new Error(
        "O cliente Supabase não está disponível."
      );
    }

    return client;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[character]
    );
  }

  async function showAlert(message, type = "info") {
    if (window.Swal) {
      await window.Swal.fire({
        icon: type,
        title:
          type === "success"
            ? "Sucesso"
            : type === "error"
              ? "Erro"
              : "Atenção",
        text: message,
        confirmButtonText: "Entendido"
      });

      return;
    }

    window.alert(message);
  }

  /* =========================================
     Apresentar os utilizadores
     ========================================= */

  function renderUsers() {
    const table = el("users-table-body");

    if (!table) return;

    const search = (
      el("user-search")?.value || ""
    ).trim().toLowerCase();

    const filtered = users.filter(user => {
      const name = String(
        user.full_name || ""
      ).toLowerCase();

      const email = String(
        user.email || ""
      ).toLowerCase();

      return (
        name.includes(search) ||
        email.includes(search)
      );
    });

    if (!filtered.length) {
      table.innerHTML = `
        <tr>
          <td
            colspan="5"
            class="text-center text-muted py-4"
          >
            Nenhum utilizador encontrado.
          </td>
        </tr>
      `;

      return;
    }

    table.innerHTML = filtered.map(user => {
      const name = escapeHtml(
        user.full_name || "Sem nome"
      );

      const email = escapeHtml(
        user.email || "Sem e-mail"
      );

      const role = escapeHtml(
        roleLabels[user.role] ||
        user.role ||
        "Sem papel"
      );

      return `
        <tr>
          <td>${name}</td>

          <td>${email}</td>

          <td>
            <span class="badge bg-secondary">
              ${role}
            </span>
          </td>

          <td>
            <span
              class="text-muted small"
              title="Esta lista não consulta o estado de autenticação da conta."
            >
              Não consultado
            </span>
          </td>

          <td class="text-end">
            <span class="text-muted small">
              Edição indisponível
            </span>
          </td>
        </tr>
      `;
    }).join("");
  }

  /* =========================================
     Carregar perfis da base de dados
     ========================================= */

  async function loadUsers() {
    const table = el("users-table-body");

    if (table) {
      table.innerHTML = `
        <tr>
          <td
            colspan="5"
            class="text-center text-muted py-4"
          >
            A carregar utilizadores...
          </td>
        </tr>
      `;
    }

    try {
      const client = getClient();

      const pageSize = 500;
      const records = [];

      let offset = 0;

      while (true) {
        const { data, error } = await client
          .from("profiles")
          .select(
            "id,full_name,email,role,created_at"
          )
          .order("id", { ascending: true })
          .range(
            offset,
            offset + pageSize - 1
          );

        if (error) throw error;

        const page = data || [];

        if (!page.length) break;

        records.push(...page);
        offset += page.length;
      }

      records.sort((first, second) => {
        return String(
          second.created_at || ""
        ).localeCompare(
          String(first.created_at || "")
        );
      });

      users = records;

      renderUsers();
    } catch (error) {
      console.error(
        "[Utilizadores] Erro ao listar:",
        error
      );

      if (table) {
        table.innerHTML = `
          <tr>
            <td
              colspan="5"
              class="text-center text-danger py-4"
            >
              Não foi possível carregar os utilizadores.
            </td>
          </tr>
        `;
      }

      await showAlert(
        error.message ||
        "Não foi possível carregar os utilizadores.",
        "error"
      );
    }
  }

  /* =========================================
     Configurar o formulário existente
     ========================================= */

  function configureForm() {
    const roleSelect = el("user-role");

    roleSelect.replaceChildren();

    Object.entries(roleLabels).forEach(
      ([value, label]) => {
        const option = document.createElement("option");

        option.value = value;
        option.textContent = label;

        roleSelect.append(option);
      }
    );

    const name = el("user-name");
    name.maxLength = 150;

    const email = el("user-email");
    email.maxLength = 254;
    email.autocomplete = "off";

    const password = el("user-password");

    password.minLength = 8;
    password.maxLength = 128;
    password.required = true;
    password.autocomplete = "new-password";

    const passwordHelp =
      password.parentElement.querySelector(
        ".form-text"
      );

    if (passwordHelp) {
      passwordHelp.textContent =
        "Obrigatória. Usa entre 8 e 128 caracteres. " +
        "O projeto pode exigir requisitos adicionais.";
    }

    /*
     * A tabela profiles não tem is_active.
     * Ocultar o controlo até existir um fluxo real.
     */
    const active = el("user-active");

    if (active) {
      active.disabled = true;

      const wrapper = active.closest(
        ".form-check"
      );

      if (wrapper) {
        wrapper.hidden = true;
      }
    }

    const formBody = document.querySelector(
      "#user-form .modal-body"
    );

    if (
      formBody &&
      !el("user-creation-note")
    ) {
      const note = document.createElement("p");

      note.id = "user-creation-note";
      note.className =
        "small text-muted mb-0";

      note.textContent =
        "A conta será criada com o e-mail confirmado pelo administrador. " +
        "Confirma que o endereço pertence à pessoa antes de guardar. " +
        "Este formulário não envia um convite por e-mail.";

      formBody.append(note);
    }
  }

  /* =========================================
     Abrir o formulário
     ========================================= */

  function openCreateModal() {
    if (
      !window.isAdmin?.() ||
      saving
    ) {
      return;
    }

    el("user-form").reset();

    el("user-id").value = "";
    el("user-role").value = "vendedor";
    el("user-password").required = true;

    el("user-modal-title").textContent =
      "Novo utilizador";

    window.bootstrap.Modal.getOrCreateInstance(
      el("user-modal")
    ).show();
  }

  /* =========================================
     Mensagens devolvidas pela função
     ========================================= */

  async function getFunctionErrorMessage(error) {
    if (error?.context instanceof Response) {
      try {
        const body = await error.context
          .clone()
          .json();

        if (
          typeof body?.error === "string"
        ) {
          return body.error;
        }

        if (
          typeof body?.message === "string"
        ) {
          return body.message;
        }
      } catch {
        // Usar a mensagem original.
      }
    }

    return (
      error?.message ||
      "Não foi possível criar o utilizador."
    );
  }

  /* =========================================
     Criar utilizador no servidor
     ========================================= */

  async function handleFormSubmit(event) {
    event.preventDefault();

    if (saving) return;

    if (!window.isAdmin?.()) {
      await showAlert(
        "Apenas o administrador pode criar utilizadores.",
        "error"
      );

      return;
    }

    const form = el("user-form");

    if (!form.reportValidity()) return;

    const fullName =
      el("user-name").value.trim();

    const email =
      el("user-email").value
        .trim()
        .toLowerCase();

    const password =
      el("user-password").value;

    const role =
      el("user-role").value;

    if (!fullName) {
      await showAlert(
        "Escreve o nome completo.",
        "warning"
      );

      return;
    }

    if (
      !Object.prototype.hasOwnProperty.call(
        roleLabels,
        role
      )
    ) {
      await showAlert(
        "Escolhe um papel válido.",
        "warning"
      );

      return;
    }

    const submit = form.querySelector(
      '[type="submit"]'
    );

    const originalText =
      submit.textContent;

    let createdProfile = null;

    saving = true;
    submit.disabled = true;
    submit.textContent = "A criar...";

    try {
      const client = getClient();

      const {
        data: { session },
        error: sessionError
      } = await client.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!session?.access_token) {
        throw new Error(
          "A sessão expirou. Inicia sessão novamente."
        );
      }

      const { data, error } =
        await client.functions.invoke(
          "admin-create-user",
          {
            headers: {
              Authorization:
                `Bearer ${session.access_token}`
            },
            body: {
              full_name: fullName,
              email,
              password,
              role
            }
          }
        );

      if (error) {
        throw new Error(
          await getFunctionErrorMessage(error)
        );
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (!data?.user?.id) {
        throw new Error(
          "O servidor não confirmou a criação. " +
          "Verifica Authentication antes de tentar novamente."
        );
      }

      createdProfile = data.user;
    } catch (error) {
      console.error(
        "[Utilizadores] Erro ao criar:",
        error
      );

      await showAlert(
        error.message ||
        "Não foi possível criar o utilizador.",
        "error"
      );
    } finally {
      saving = false;
      submit.disabled = false;
      submit.textContent = originalText;
    }

    if (!createdProfile) return;

    /*
     * O pedido já terminou.
     * Agora o modal pode fechar normalmente.
     */
    window.bootstrap.Modal.getOrCreateInstance(
      el("user-modal")
    ).hide();

    form.reset();

    users = [
      createdProfile,
      ...users.filter(
        user => user.id !== createdProfile.id
      )
    ];

    renderUsers();

    await showAlert(
      "Conta criada no servidor com o e-mail confirmado pelo administrador.",
      "success"
    );
  }

  /* =========================================
     Inicialização
     ========================================= */

  function initialize() {
    if (
      initialized ||
      !window.currentAdmin
    ) {
      return;
    }

    if (!window.isAdmin?.()) return;

    const requiredElements = [
      "users-table-body",
      "user-form",
      "user-name",
      "user-email",
      "user-password",
      "user-role",
      "user-id",
      "user-modal",
      "user-modal-title",
      "new-user-button"
    ];

    const missingElements =
      requiredElements.filter(id => !el(id));

    if (missingElements.length) {
      console.error(
        "[Utilizadores] Elementos em falta no HTML:",
        missingElements
      );

      return;
    }

    initialized = true;

    configureForm();

    el("user-search")?.addEventListener(
      "input",
      renderUsers
    );

    el("new-user-button").addEventListener(
      "click",
      openCreateModal
    );

    el("user-form").addEventListener(
      "submit",
      handleFormSubmit
    );

    el("user-modal").addEventListener(
      "hide.bs.modal",
      event => {
        if (saving) {
          event.preventDefault();
        }
      }
    );

    el("user-modal").addEventListener(
      "hidden.bs.modal",
      () => {
        el("user-password").value = "";
      }
    );

    loadUsers();
  }

  document.addEventListener(
    "admin:ready",
    initialize
  );

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