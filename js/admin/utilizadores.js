
/* =========================================
   Loja MZ — Gestão de utilizadores

   Administrador: gere clientes, vendedores e administradores.
   A ligação real ao Supabase será ativada na fase final.
   ========================================= */

(function usersAdmin() {
  "use strict";

  let initialized = false;
  let users = [];
  let editingUserId = null;

  const el = id => document.getElementById(id);

  const roleLabels = {
    cliente: "Cliente",
    vendedor: "Vendedor",
    admin: "Administrador"
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function showAlert(message, type = "info") {
    if (window.Swal) {
      window.Swal.fire({
        icon: type,
        title:
          type === "success"
            ? "Sucesso"
            : type === "error"
              ? "Erro"
              : "Atenção",
        text: message,
        timer: 2800,
        showConfirmButton: false
      });

      return;
    }

    window.alert(message);
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function renderUsers() {
    const table = el("users-table-body");
    const search = (el("user-search")?.value || "")
      .trim()
      .toLowerCase();

    const filtered = users.filter(user => {
      const name = (user.full_name || "")
        .toLowerCase();

      const email = (user.email || "")
        .toLowerCase();

      return (
        name.includes(search) ||
        email.includes(search)
      );
    });

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

    table.innerHTML = filtered.map(user => {
      const id = escapeHtml(user.id);
      const name = escapeHtml(user.full_name || "Sem nome");
      const email = escapeHtml(user.email || "Sem e-mail");
      const role = roleLabels[user.role] || "Cliente";
      const active = user.is_active !== false;

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
            <span class="badge ${active ? "bg-success" : "bg-danger"}">
              ${active ? "Ativo" : "Inativo"}
            </span>
          </td>

          <td class="text-end">
            <button
              type="button"
              class="btn btn-sm btn-outline-primary me-1"
              data-edit-user="${id}"
              aria-label="Editar utilizador"
            >
              <i class="bi bi-pencil"></i>
            </button>

            <button
              type="button"
              class="btn btn-sm btn-outline-danger"
              data-delete-user="${id}"
              aria-label="Apagar utilizador"
            >
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  function openCreateModal() {
    editingUserId = null;

    el("user-form").reset();
    el("user-id").value = "";
    el("user-role").value = "vendedor";
    el("user-active").checked = true;
    el("user-password").required = true;

    el("user-modal-title").textContent = "Novo utilizador";

    const modal = bootstrap.Modal.getOrCreateInstance(
      el("user-modal")
    );

    modal.show();
  }

  function openEditModal(user) {
    editingUserId = user.id;

    el("user-id").value = user.id;
    el("user-name").value = user.full_name || "";
    el("user-email").value = user.email || "";
    el("user-role").value = user.role || "cliente";
    el("user-active").checked = user.is_active !== false;

    el("user-password").value = "";
    el("user-password").required = false;

    el("user-modal-title").textContent = "Editar utilizador";

    const modal = bootstrap.Modal.getOrCreateInstance(
      el("user-modal")
    );

    modal.show();
  }

  function closeModal() {
    const modal = bootstrap.Modal.getOrCreateInstance(
      el("user-modal")
    );

    modal.hide();
  }

  async function handleTableClick(event) {
    const editButton = event.target.closest("[data-edit-user]");
    const deleteButton = event.target.closest("[data-delete-user]");

    if (editButton) {
      const user = users.find(
        item => item.id === editButton.dataset.editUser
      );

      if (user) {
        openEditModal(user);
      }

      return;
    }

    if (deleteButton) {
      const user = users.find(
        item => item.id === deleteButton.dataset.deleteUser
      );

      if (!user) return;

      const result = await Swal.fire({
        icon: "warning",
        title: "Remover utilizador?",
        text: `Pretendes remover "${user.full_name || user.email}"?`,
        showCancelButton: true,
        confirmButtonText: "Remover",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#dc3545"
      });

      if (!result.isConfirmed) return;

      users = users.filter(
        item => item.id !== user.id
      );

      renderUsers();

      showAlert(
        "Utilizador removido apenas nesta página. A base de dados ainda não foi alterada."
      );
    }
  }

  async function handleFormSubmit(event) {
    event.preventDefault();

    const id = el("user-id").value.trim();
    const name = el("user-name").value.trim();
    const email = el("user-email").value.trim().toLowerCase();
    const password = el("user-password").value;
    const role = el("user-role").value;
    const active = el("user-active").checked;

    if (!name) {
      showAlert("Escreve o nome completo do utilizador.", "warning");
      return;
    }

    if (!isValidEmail(email)) {
      showAlert("Escreve um e-mail válido.", "warning");
      return;
    }

    if (!editingUserId && password.length < 6) {
      showAlert(
        "A palavra-passe deve ter pelo menos 6 caracteres.",
        "warning"
      );

      return;
    }

    if (!roleLabels[role]) {
      showAlert("Escolhe um papel válido.", "warning");
      return;
    }

    const emailAlreadyUsed = users.some(
      user =>
        user.email.toLowerCase() === email &&
        user.id !== editingUserId
    );

    if (emailAlreadyUsed) {
      showAlert(
        "Já existe um utilizador com este e-mail.",
        "warning"
      );

      return;
    }

    if (editingUserId) {
      const user = users.find(
        item => item.id === editingUserId
      );

      if (user) {
        user.full_name = name;
        user.email = email;
        user.role = role;
        user.is_active = active;
      }

      renderUsers();
      closeModal();

      showAlert(
        "Alterações guardadas apenas nesta página. A base de dados ainda não foi alterada.",
        "success"
      );

      return;
    }

    const newUser = {
      id: `temp-${Date.now()}`,
      full_name: name,
      email: email,
      role: role,
      is_active: active
    };

    users.push(newUser);

    renderUsers();
    closeModal();

    showAlert(
      `Utilizador "${name}" preparado como ${roleLabels[role]}. A criação real será feita na fase do Supabase.`,
      "success"
    );
  }

  function initialize() {
    if (initialized || !window.currentAdmin) return;

    if (!window.isAdmin()) {
      showAlert(
        "Apenas o administrador pode gerir utilizadores.",
        "error"
      );

      window.location.replace("../conta.html");
      return;
    }

    initialized = true;

    el("user-search")?.addEventListener(
      "input",
      renderUsers
    );

    el("users-table-body")?.addEventListener(
      "click",
      handleTableClick
    );

    el("user-form")?.addEventListener(
      "submit",
      handleFormSubmit
    );

    el("new-user-button")?.addEventListener(
      "click",
      openCreateModal
    );

    renderUsers();
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
})();
