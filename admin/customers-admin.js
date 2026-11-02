/* =========================================
   Loja MZ — Gestão de clientes
   ========================================= */

const CUSTOMERS_PER_PAGE_ADMIN = 10;

let customersCurrentPage = 1;

document.addEventListener("DOMContentLoaded", () => {
  const checkAdminLoaded = setInterval(() => {
    if (window.currentAdmin) {
      clearInterval(checkAdminLoaded);
      loadAdminCustomers();
    }
  }, 200);

  document.getElementById("customer-search").addEventListener("input", () => {
    customersCurrentPage = 1;
    loadAdminCustomers();
  });

  document.getElementById("customer-role-filter").addEventListener("change", () => {
    customersCurrentPage = 1;
    loadAdminCustomers();
  });

  document.getElementById("customer-sort").addEventListener("change", () => {
    customersCurrentPage = 1;
    loadAdminCustomers();
  });
});

async function loadAdminCustomers() {
  const table = document.getElementById("customers-table");
  const pagination = document.getElementById("customers-pagination");

  table.innerHTML = `
    <tr>
      <td colspan="5" class="text-center text-muted py-4">
        A carregar clientes...
      </td>
    </tr>
  `;

  pagination.innerHTML = "";

  const search = document.getElementById("customer-search").value.trim();
  const roleFilter = document.getElementById("customer-role-filter").value;
  const sort = document.getElementById("customer-sort").value;

  let query = supabase
    .from("profiles")
    .select(`
      id,
      full_name,
      phone,
      phone_alt,
      role,
      created_at,
      email
    `, { count: "exact" });

  if (search) {
    const term = `%${search}%`;

    query = query.or(
      `full_name.ilike.${term},phone.ilike.${term},phone_alt.ilike.${term}`
    );
  }

  if (roleFilter) {
    query = query.eq("role", roleFilter);
  }

  if (sort === "name") {
    query = query.order("full_name", { ascending: true });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const from = (customersCurrentPage - 1) * CUSTOMERS_PER_PAGE_ADMIN;
  const to = from + CUSTOMERS_PER_PAGE_ADMIN - 1;

  const { data, error, count } = await query.range(from, to);

  if (error) {
    console.error(error);

    table.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-danger py-4">
          Erro ao carregar clientes.
        </td>
      </tr>
    `;
    return;
  }

  if (!data || data.length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-muted py-4">
          Nenhum cliente encontrado.
        </td>
      </tr>
    `;
    return;
  }

  table.innerHTML = data.map(customer => `
    <tr>
      <td>
        <div class="d-flex align-items-center gap-3">
          <div class="customer-avatar">
            ${getInitials(customer.full_name || "Cliente")}
          </div>

          <div>
            <strong>${customer.full_name || "Sem nome"}</strong>
            <small class="d-block text-muted">
              ${customer.email || "Sem e-mail"}
            </small>
          </div>
        </div>
      </td>

      <td>
        ${customer.phone || "-"}
        <small class="d-block text-muted">
          ${customer.phone_alt || ""}
        </small>
      </td>

      <td>
        <span class="badge ${customer.role === "admin" ? "bg-primary" : "bg-secondary"}">
          ${customer.role === "admin" ? "Administrador" : "Cliente"}
        </span>
      </td>

      <td>
        ${new Date(customer.created_at).toLocaleDateString("pt-MZ")}
      </td>

      <td class="text-end">
        <div class="d-flex justify-content-end gap-2">
          <button class="btn btn-sm btn-outline-primary"
            onclick="viewCustomerOrders('${customer.id}', '${customer.full_name || "Cliente"}')">
            <i class="bi bi-receipt"></i>
          </button>

          <button class="btn btn-sm btn-outline-warning"
            onclick="toggleCustomerRole('${customer.id}', '${customer.role}')"
            ${customer.id === window.currentAdmin.id ? "disabled" : ""}>
            <i class="bi bi-person-gear"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join("");

  renderCustomersPagination(count || 0);
}

function getInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join("");
}

function renderCustomersPagination(total) {
  const pagination = document.getElementById("customers-pagination");
  const totalPages = Math.ceil(total / CUSTOMERS_PER_PAGE_ADMIN);

  if (totalPages <= 1) return;

  let html = `
    <li class="page-item ${customersCurrentPage === 1 ? "disabled" : ""}">
      <button class="page-link" data-page="${customersCurrentPage - 1}">
        <i class="bi bi-chevron-left"></i>
      </button>
    </li>
  `;

  for (let page = 1; page <= totalPages; page++) {
    html += `
      <li class="page-item ${page === customersCurrentPage ? "active" : ""}">
        <button class="page-link" data-page="${page}">
          ${page}
        </button>
      </li>
    `;
  }

  html += `
    <li class="page-item ${customersCurrentPage === totalPages ? "disabled" : ""}">
      <button class="page-link" data-page="${customersCurrentPage + 1}">
        <i class="bi bi-chevron-right"></i>
      </button>
    </li>
  `;

  pagination.innerHTML = html;

  pagination.querySelectorAll("button[data-page]").forEach(button => {
    button.addEventListener("click", () => {
      const page = Number(button.dataset.page);

      if (page >= 1 && page <= totalPages) {
        customersCurrentPage = page;
        loadAdminCustomers();
      }
    });
  });
}

async function toggleCustomerRole(customerId, currentRole) {
  const newRole = currentRole === "admin" ? "customer" : "admin";

  const result = await Swal.fire({
    title: "Alterar papel",
    text: newRole === "admin"
      ? "Pretende promover este utilizador a administrador?"
      : "Pretende remover o acesso de administrador deste utilizador?",
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Sim, alterar",
    cancelButtonText: "Cancelar"
  });

  if (!result.isConfirmed) return;

  const { error } = await supabase
    .from("profiles")
    .update({ role: newRole })
    .eq("id", customerId);

  if (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível alterar o papel do utilizador."
    });

    return;
  }

  Swal.fire({
    icon: "success",
    title: "Papel atualizado",
    timer: 1500,
    showConfirmButton: false
  });

  loadAdminCustomers();
}

async function viewCustomerOrders(customerId, customerName) {
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, total, status, created_at")
    .eq("user_id", customerId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível carregar os pedidos do cliente."
    });

    return;
  }

  if (!data || data.length === 0) {
    Swal.fire({
      icon: "info",
      title: customerName,
      text: "Este cliente ainda não realizou pedidos."
    });

    return;
  }

  const ordersHtml = data.map(order => `
    <div class="customer-order">
      <div>
        <strong>${order.order_number || order.id}</strong>
        <small class="d-block text-muted">
          ${new Date(order.created_at).toLocaleDateString("pt-MZ")}
        </small>
      </div>

      <div class="text-end">
        <strong>${formatMZN(order.total)}</strong>
        <small class="d-block text-muted">
          ${getOrderStatusText(order.status)}
        </small>
      </div>
    </div>
  `).join("");

  Swal.fire({
    title: `Pedidos de ${customerName}`,
    html: `
      <div class="text-start">
        ${ordersHtml}
      </div>
    `,
    width: 650,
    confirmButtonText: "Fechar"
  });
}

function getOrderStatusText(status) {
  const texts = {
    pending: "Pendente",
    processing: "Em preparação",
    shipped: "Enviado",
    delivered: "Entregue",
    cancelled: "Cancelado"
  };

  return texts[status] || status;
}