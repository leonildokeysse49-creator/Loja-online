
/* =========================================
   Loja MZ — Gestão de utilizadores
   ========================================= */

(function usersAdmin() {
  "use strict";

  let initialized = false;
  let busy = false;
  let users = [];
  let editingId = null;
  let editingAccount = null;

  const el = id => document.getElementById(id);

  const roles = {
    customer: "Cliente",
    vendedor: "Vendedor",
    admin: "Administrador"
  };

  const validRoles = Object.keys(roles);

  function client() {
    const value = window.lojaMzSupabaseClient;

    if (
      !value?.auth ||
      !value?.functions ||
      !value.supabaseUrl ||
      !value.supabaseKey
    ) {
      throw new Error(
        "O cliente Supabase não está disponível."
      );
    }

    return value;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]
    );
  }

  async function alertMessage(message, type = "info") {
    if (window.Swal) {
      await window.Swal.fire({
        icon: type,
        title:
          type === "error"
            ? "Erro"
            : type === "success"
              ? "Sucesso"
              : "Atenção",
        text: message,
        confirmButtonText: "Entendido"
      });

      return;
    }

    window.alert(message);
  }

  async function confirmMessage(message) {
    if (window.Swal) {
      const result = await window.Swal.fire({
        icon: "warning",
        title: "Confirmar operação",
        text: message,
        showCancelButton: true,
        confirmButtonText: "Confirmar",
        cancelButtonText: "Cancelar"
      });

      return result.isConfirmed;
    }

    return window.confirm(message);
  }

  async function invoke(name, body) {
    const supabase = client();

    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError) throw sessionError;

    if (!session?.access_token) {
      throw new Error(
        "A sessão expirou. Inicia sessão novamente."
      );
    }

    const endpoint = `${supabase.supabaseUrl}/functions/v1/${name}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": supabase.supabaseKey
      },
      body: JSON.stringify(body)
    });

    let result = null;

    try {
      result = await response.json();
    } catch {
      result = null;
    }

    if (!response.ok) {
      const details = [
        result?.error,
        result?.message,
        result?.details,
        result?.hint
      ]
        .filter(Boolean)
        .join(" | ");

      throw new Error(
        details ||
        `A operação falhou (HTTP ${response.status}).`
      );
    }

    if (result?.error) {
      throw new Error(result.error);
    }

    return result;
  }

  function setBusy(value) {
    busy = value;

    document.querySelectorAll(
      '#user-form [type="submit"], ' +
      "#user-block-button, #user-delete-button, " +
      "#new-user-button, #users-table-body button"
    ).forEach(button => {
      button.disabled = value;
    });
  }

  function renderUsers() {
    const table = el("users-table-body");

    const search = (
      el("user-search")?.value || ""
    ).trim().toLowerCase();

    const filtered = users.filter(user =>
      String(user.full_name || "")
        .toLowerCase()
        .includes(search) ||
      String(user.email || "")
        .toLowerCase()
        .includes(search)
    );

    if (!filtered.length) {
      table.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-muted py-4">
            Nenhum utilizador encontrado.
          </td>
        </tr>
      `;

      return;
    }

    table.innerHTML = filtered.map(user => `
      <tr>
        <td>${escapeHtml(user.full_name || "Sem nome")}</td>
        <td>${escapeHtml(user.email || "Sem e-mail")}</td>
        <td>
          <span class="badge bg-secondary">
            ${escapeHtml(roles[user.role] || user.role)}
          </span>
        </td>
        <td class="small text-muted">
          Consultar na edição
        </td>
        <td class="text-end">
          <button
            type="button"
            class="btn btn-sm btn-outline-primary"
            data-edit-user="${escapeHtml(user.id)}"
            ${busy ? "disabled" : ""}
          >
            Editar
          </button>
        </td>
      </tr>
    `).join("");
  }

  async function loadUsers() {
    const table = el("users-table-body");

    table.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-4">
          A carregar utilizadores...
        </td>
      </tr>
    `;

    try {
      const records = [];
      let offset = 0;

      while (true) {
        const { data, error } = await client()
          .from("profiles")
          .select("id,full_name,email,role,created_at")
          .order("id", { ascending: true })
          .range(offset, offset + 499);

        if (error) throw error;

        if (!data?.length) break;

        records.push(...data);
        offset += data.length;
      }

      users = records.sort((a, b) =>
        String(b.created_at || "").localeCompare(
          String(a.created_at || "")
        )
      );

      renderUsers();
    } catch (error) {
      table.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-danger py-4">
            Não foi possível carregar os utilizadores.
          </td>
        </tr>
      `;

      await alertMessage(error.message, "error");
    }
  }

  function updateLocalUser(user) {
    users = [
      user,
      ...users.filter(item => item.id !== user.id)
    ];

    renderUsers();
  }

  function updateModalState() {
    const editing = Boolean(editingId);

    el("user-modal-title").textContent = editing
      ? "Editar utilizador"
      : "Novo utilizador";

    el("user-password").required = !editing;

    el("user-password-help").textContent = editing
      ? "Deixa vazio para manter a palavra-passe atual."
      : "Obrigatória. Usa entre 8 e 128 caracteres.";

    el("user-creation-note").textContent =
      "A conta será criada com o e-mail confirmado pelo administrador.";

    const blockButton = el("user-block-button");
    const deleteButton = el("user-delete-button");
    const status = el("user-account-status");

    blockButton.hidden = !editing;
    deleteButton.hidden = !editing;
    status.hidden = !editing;

    if (!editing) return;

    const blocked = Boolean(editingAccount?.blocked);

    status.textContent = blocked
      ? "Conta bloqueada."
      : "Conta sem bloqueio administrativo.";

    blockButton.textContent = blocked
      ? "Desbloquear conta"
      : "Bloquear conta";

    blockButton.className = blocked
      ? "btn btn-outline-success me-auto"
      : "btn btn-outline-danger me-auto";
  }

  function showModal() {
    window.bootstrap.Modal
      .getOrCreateInstance(el("user-modal"))
      .show();
  }

  function openCreate() {
    if (busy || !window.isAdmin?.()) return;

    editingId = null;
    editingAccount = null;

    el("user-form").reset();
    el("user-id").value = "";
    el("user-role").value = "vendedor";

    updateModalState();
    showModal();
  }

  async function openEdit(id) {
    if (busy || !window.isAdmin?.()) return;

    setBusy(true);

    try {
      const data = await invoke("admin-manage-user", {
        action: "inspect",
        user_id: id
      });

      if (!data?.user?.id) {
        throw new Error(
          "O servidor não devolveu o utilizador."
        );
      }

      editingId = data.user.id;
      editingAccount = data.account;

      el("user-form").reset();
      el("user-id").value = editingId;
      el("user-name").value = data.user.full_name || "";
      el("user-email").value = data.user.email || "";
      el("user-role").value = data.user.role;
      el("user-password").value = "";

      updateModalState();
      showModal();
    } catch (error) {
      await alertMessage(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveUser(event) {
    event.preventDefault();

    if (busy) return;

    if (!window.isAdmin?.()) {
      await alertMessage(
        "Acesso reservado a administradores.",
        "error"
      );
      return;
    }

    const form = el("user-form");

    if (!form.reportValidity()) return;

    const fullName = el("user-name").value.trim();
    const email = el("user-email")
      .value
      .trim()
      .toLowerCase();
    const password = el("user-password").value;
    const role = el("user-role").value;

    if (!fullName) {
      await alertMessage(
        "Escreve o nome completo.",
        "warning"
      );
      return;
    }

    if (fullName.length > 150) {
      await alertMessage(
        "O nome deve ter até 150 caracteres.",
        "warning"
      );
      return;
    }

    const emailPattern =
      /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    if (!emailPattern.test(email) || email.length > 254) {
      await alertMessage(
        "Escreve um endereço de e-mail válido, " +
        "por exemplo: nome@dominio.com",
        "warning"
      );
      return;
    }

    if (!validRoles.includes(role)) {
      await alertMessage(
        "Seleciona um papel válido.",
        "warning"
      );
      return;
    }

    const wasEditing = Boolean(editingId);

    if (!wasEditing && password.length < 8) {
      await alertMessage(
        "A palavra-passe deve ter pelo menos 8 caracteres.",
        "warning"
      );
      return;
    }

    if (password && password.length > 128) {
      await alertMessage(
        "A palavra-passe deve ter no máximo 128 caracteres.",
        "warning"
      );
      return;
    }

    const payload = {
      full_name: fullName,
      email,
      password,
      role
    };

    if (wasEditing) {
      payload.action = "update";
      payload.user_id = editingId;
    }

    const submit = form.querySelector('[type="submit"]');
    const oldText = submit.textContent;
    let savedUser = null;

    setBusy(true);
    submit.textContent = "A guardar...";

    try {
      const data = await invoke(
        wasEditing
          ? "admin-manage-user"
          : "admin-create-user",
        payload
      );

      if (!data?.user?.id) {
        throw new Error(
          "O servidor não confirmou a operação. " +
          "Verifica a conta antes de repetir."
        );
      }

      savedUser = data.user;
    } catch (error) {
      console.error("[Utilizadores] Guardar:", error);
      await alertMessage(error.message, "error");
    } finally {
      setBusy(false);
      submit.textContent = oldText;
    }

    if (!savedUser) return;

    window.bootstrap.Modal
      .getOrCreateInstance(el("user-modal"))
      .hide();

    el("user-password").value = "";

    updateLocalUser(savedUser);

    await alertMessage(
      wasEditing
        ? "Utilizador atualizado."
        : "Conta criada com o e-mail confirmado pelo administrador.",
      "success"
    );
  }

  async function toggleBlock() {
    if (busy || !editingId || !editingAccount) return;

    const unblock = editingAccount.blocked;

    const original = users.find(
      user => user.id === editingId
    );

    if (!original) return;

    const accepted = await confirmMessage(
      `${unblock ? "Desbloquear" : "Bloquear"} ` +
      `${original.full_name || "esta conta"}?`
    );

    if (!accepted) return;

    setBusy(true);

    try {
      const data = await invoke("admin-manage-user", {
        action: unblock ? "unblock" : "block",
        user_id: editingId
      });

      if (!data?.account) {
        throw new Error(
          "O servidor não confirmou o estado da conta."
        );
      }

      editingAccount = data.account;
      updateModalState();

      await alertMessage(
        unblock
          ? "Conta desbloqueada."
          : "Conta bloqueada.",
        "success"
      );
    } catch (error) {
      await alertMessage(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (busy || !editingId) return;

    const original = users.find(
      user => user.id === editingId
    );

    if (!original) return;

    const isSelf =
      original.id === window.currentAdmin?.id;

    const isAdmin = original.role === "admin";

    let warning =
      `Eliminar permanentemente ${original.full_name || "esta conta"}? ` +
      "Isto remove o perfil, endereços, carrinhos e avaliações. " +
      "Não pode ser desfeito.";

    if (isSelf) {
      warning =
        "Estás a eliminar a tua própria conta. " +
        "Vais perder o acesso a esta sessão e ao painel. " +
        warning;
    }

    if (isAdmin) {
      warning =
        "Esta é uma conta de administrador. " +
        "A eliminação pode remover o último administrador " +
        "e impedir o acesso ao painel. " +
        warning;
    }

    const accepted = await confirmMessage(warning);

    if (!accepted) return;

    setBusy(true);

    try {
      const data = await invoke("admin-manage-user", {
        action: "delete",
        user_id: editingId
      });

      if (!data?.deleted) {
        throw new Error(
          "O servidor não confirmou a eliminação."
        );
      }

      window.bootstrap.Modal
        .getOrCreateInstance(el("user-modal"))
        .hide();

      users = users.filter(
        user => user.id !== editingId
      );

      editingId = null;
      editingAccount = null;

      renderUsers();

      await alertMessage(
        "Conta eliminada permanentemente.",
        "success"
      );

      if (isSelf) {
        await client().auth.signOut();
        window.location.href = "/index.html";
      }
    } catch (error) {
      await alertMessage(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  function configureForm() {
    const roleSelect = el("user-role");

    roleSelect.replaceChildren();

    Object.entries(roles).forEach(([value, label]) => {
      const option = document.createElement("option");

      option.value = value;
      option.textContent = label;

      roleSelect.append(option);
    });

    el("user-name").maxLength = 150;
    el("user-email").maxLength = 254;

    const password = el("user-password");

    password.minLength = 8;
    password.maxLength = 128;
    password.autocomplete = "new-password";

    let help = password.parentElement.querySelector(
      ".form-text"
    );

    if (!help) {
      help = document.createElement("div");
      help.className = "form-text";
      password.insertAdjacentElement("afterend", help);
    }

    help.id = "user-password-help";

    const active = el("user-active");

    if (active) {
      active.disabled = true;

      const wrapper = active.closest(".form-check");

      if (wrapper) wrapper.hidden = true;
    }

    const body = document.querySelector(
      "#user-form .modal-body"
    );

    let note = el("user-creation-note");

    if (!note) {
      note = document.createElement("p");
      note.id = "user-creation-note";
      note.className = "small text-muted mb-2";
      body.append(note);
    }

    if (!el("user-account-status")) {
      const status = document.createElement("p");
      status.id = "user-account-status";
      status.className = "small mt-3 mb-0";
      body.append(status);
    }

    const footer = document.querySelector(
      "#user-form .modal-footer"
    );

    if (!el("user-block-button")) {
      const button = document.createElement("button");
      button.id = "user-block-button";
      button.type = "button";
      button.hidden = true;

      footer.prepend(button);
    }

    if (!el("user-delete-button")) {
      const button = document.createElement("button");
      button.id = "user-delete-button";
      button.type = "button";
      button.className = "btn btn-outline-danger";
      button.textContent = "Eliminar conta";
      button.hidden = true;

      footer.append(button);
    }
  }

  function initialize() {
    if (
      initialized ||
      !window.currentAdmin ||
      !window.isAdmin?.()
    ) return;

    const required = [
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

    const missing = required.filter(id => !el(id));

    if (
      missing.length ||
      !document.querySelector("#user-form .modal-body") ||
      !document.querySelector("#user-form .modal-footer") ||
      !document.querySelector(
        '#user-form [type="submit"]'
      ) ||
      !window.bootstrap?.Modal
    ) {
      console.error(
        "[Utilizadores] HTML ou Bootstrap indisponível:",
        missing
      );

      return;
    }

    initialized = true;

    configureForm();

    el("new-user-button").addEventListener(
      "click",
      openCreate
    );

    el("user-search")?.addEventListener(
      "input",
      renderUsers
    );

    el("users-table-body").addEventListener(
      "click",
      event => {
        const button = event.target.closest(
          "[data-edit-user]"
        );

        if (button) openEdit(button.dataset.editUser);
      }
    );

    el("user-form").addEventListener(
      "submit",
      saveUser
    );

    el("user-block-button").addEventListener(
      "click",
      toggleBlock
    );

    el("user-delete-button").addEventListener(
      "click",
      deleteAccount
    );

    el("user-modal").addEventListener(
      "hide.bs.modal",
      event => {
        if (busy) event.preventDefault();
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
