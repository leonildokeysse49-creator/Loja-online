/* =========================================
   Loja MZ — Gestão de pedidos
   ========================================= */

const ORDERS_PER_PAGE_ADMIN = 10;

let adminOrdersPage = 1;

document.addEventListener("DOMContentLoaded", () => {
  const checkAdminLoaded = setInterval(() => {
    if (window.currentAdmin) {
      clearInterval(checkAdminLoaded);
      loadAdminOrders();
    }
  }, 200);

  document.getElementById("order-search").addEventListener("input", () => {
    adminOrdersPage = 1;
    loadAdminOrders();
  });

  document.getElementById("order-status-filter").addEventListener("change", () => {
    adminOrdersPage = 1;
    loadAdminOrders();
  });

  document.getElementById("order-payment-filter").addEventListener("change", () => {
    adminOrdersPage = 1;
    loadAdminOrders();
  });
});

function getOrderStatusBadge(status) {
  const badges = {
    pending: "bg-warning text-dark",
    processing: "bg-primary",
    shipped: "bg-info text-dark",
    delivered: "bg-success",
    cancelled: "bg-danger"
  };

  return badges[status] || "bg-secondary";
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

function getPaymentMethodText(method) {
  const texts = {
    multicaixa_express: "Multicaixa Express",
    bank_transfer: "Transferência bancária",
    cash_on_delivery: "Pagamento na entrega"
  };

  return texts[method] || method;
}

async function loadAdminOrders() {
  const table = document.getElementById("orders-table");
  const pagination = document.getElementById("orders-pagination");

  table.innerHTML = `
    <tr>
      <td colspan="7" class="text-center text-muted py-4">
        A carregar pedidos...
      </td>
    </tr>
  `;

  pagination.innerHTML = "";

  const search = document.getElementById("order-search").value.trim();
  const status = document.getElementById("order-status-filter").value;
  const paymentMethod = document.getElementById("order-payment-filter").value;

  let query = supabase
    .from("orders")
    .select(`
      id,
      order_number,
      customer_name,
      customer_phone,
      total,
      status,
      payment_method,
      created_at
    `, { count: "exact" })
    .order("created_at", { ascending: false });

  if (search) {
    const term = `%${search}%`;

    query = query.or(
      `order_number.ilike.${term},customer_name.ilike.${term},customer_phone.ilike.${term}`
    );
  }

  if (status) {
    query = query.eq("status", status);
  }

  if (paymentMethod) {
    query = query.eq("payment_method", paymentMethod);
  }

  const from = (adminOrdersPage - 1) * ORDERS_PER_PAGE_ADMIN;
  const to = from + ORDERS_PER_PAGE_ADMIN - 1;

  const { data, error, count } = await query.range(from, to);

  if (error) {
    console.error(error);

    table.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-danger py-4">
          Erro ao carregar pedidos.
        </td>
      </tr>
    `;
    return;
  }

  if (!data || data.length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4">
          Nenhum pedido encontrado.
        </td>
      </tr>
    `;
    return;
  }

  table.innerHTML = data.map(order => `
    <tr>
      <td>
        <strong>${order.order_number || order.id}</strong>
      </td>

      <td>
        ${order.customer_name}
        <small class="d-block text-muted">
          ${order.customer_phone}
        </small>
      </td>

      <td>${formatMZN(order.total)}</td>

      <td>${getPaymentMethodText(order.payment_method)}</td>

      <td>
        <span class="badge ${getOrderStatusBadge(order.status)}">
          ${getOrderStatusText(order.status)}
        </span>
      </td>

      <td>
        ${new Date(order.created_at).toLocaleString("pt-MZ")}
      </td>

      <td class="text-end">
        <a href="pedido-detalhe.html?id=${order.id}" class="btn btn-sm btn-outline-primary">
          <i class="bi bi-eye"></i>
        </a>
      </td>
    </tr>
  `).join("");

  renderOrdersPagination(count || 0);
}

function renderOrdersPagination(total) {
  const pagination = document.getElementById("orders-pagination");
  const totalPages = Math.ceil(total / ORDERS_PER_PAGE_ADMIN);

  if (totalPages <= 1) return;

  let html = `
    <li class="page-item ${adminOrdersPage === 1 ? "disabled" : ""}">
      <button class="page-link" data-page="${adminOrdersPage - 1}">
        <i class="bi bi-chevron-left"></i>
      </button>
    </li>
  `;

  for (let page = 1; page <= totalPages; page++) {
    html += `
      <li class="page-item ${page === adminOrdersPage ? "active" : ""}">
        <button class="page-link" data-page="${page}">
          ${page}
        </button>
      </li>
    `;
  }

  html += `
    <li class="page-item ${adminOrdersPage === totalPages ? "disabled" : ""}">
      <button class="page-link" data-page="${adminOrdersPage + 1}">
        <i class="bi bi-chevron-right"></i>
      </button>
    </li>
  `;

  pagination.innerHTML = html;

  pagination.querySelectorAll("button[data-page]").forEach(button => {
    button.addEventListener("click", () => {
      const page = Number(button.dataset.page);

      if (page >= 1 && page <= totalPages) {
        adminOrdersPage = page;
        loadAdminOrders();
      }
    });
  });
}