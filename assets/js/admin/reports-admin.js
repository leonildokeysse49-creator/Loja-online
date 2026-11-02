/* =========================================
   Loja MZ — Relatórios administrativos
   ========================================= */

let reportsSalesChart = null;
let reportsStatusChart = null;

document.addEventListener("DOMContentLoaded", () => {
  const checkAdminLoaded = setInterval(() => {
    if (window.currentAdmin) {
      clearInterval(checkAdminLoaded);
      setDefaultReportDates();
      loadReports();
    }
  }, 200);

  document.getElementById("apply-report-filters").addEventListener("click", () => {
    loadReports();
  });

  document.getElementById("refresh-reports-button").addEventListener("click", () => {
    loadReports();
  });
});

function setDefaultReportDates() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

  document.getElementById("report-start-date").value = formatDateInput(firstDay);
  document.getElementById("report-end-date").value = formatDateInput(today);
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

async function loadReports() {
  try {
    const startDate = document.getElementById("report-start-date").value;
    const endDate = document.getElementById("report-end-date").value;
    const statusFilter = document.getElementById("report-status-filter").value;

    let query = supabase
      .from("orders")
      .select(`
        id,
        user_id,
        customer_name,
        total,
        status,
        created_at,
        order_items (
          id,
          product_name,
          price,
          quantity,
          total
        )
      `)
      .order("created_at", { ascending: true });

    if (startDate) {
      query = query.gte("created_at", `${startDate}T00:00:00`);
    }

    if (endDate) {
      query = query.lte("created_at", `${endDate}T23:59:59`);
    }

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;

    if (error) throw error;

    const orders = data || [];

    renderReportCounters(orders);
    renderSalesChart(orders);
    renderStatusChart(orders);
    renderBestSellingProducts(orders);
    renderBestCustomers(orders);

  } catch (error) {
    console.error("Erro ao carregar relatórios:", error);

    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível carregar os relatórios."
    });
  }
}

function renderReportCounters(orders) {
  const validOrders = orders.filter(order =>
    ["processing", "shipped", "delivered"].includes(order.status)
  );

  const totalSales = validOrders.reduce((sum, order) => {
    return sum + Number(order.total || 0);
  }, 0);

  const averageOrder = validOrders.length > 0
    ? totalSales / validOrders.length
    : 0;

  const cancelledOrders = orders.filter(order => order.status === "cancelled").length;

  document.getElementById("report-total-sales").textContent = formatMZN(totalSales);
  document.getElementById("report-total-orders").textContent = orders.length;
  document.getElementById("report-average-order").textContent = formatMZN(averageOrder);
  document.getElementById("report-cancelled-orders").textContent = cancelledOrders;
}

function renderSalesChart(orders) {
  const validOrders = orders.filter(order =>
    ["processing", "shipped", "delivered"].includes(order.status)
  );

  const monthlySales = {};

  validOrders.forEach(order => {
    const date = new Date(order.created_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    monthlySales[monthKey] = (monthlySales[monthKey] || 0) + Number(order.total || 0);
  });

  const labels = Object.keys(monthlySales).sort();
  const values = labels.map(label => monthlySales[label]);

  const context = document.getElementById("reports-sales-chart");

  if (reportsSalesChart) {
    reportsSalesChart.destroy();
  }

  reportsSalesChart = new Chart(context, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Vendas (MT)",
        data: values,
        borderColor: "#0d6efd",
        backgroundColor: "rgba(13, 110, 253, .12)",
        fill: true,
        tension: .35,
        borderWidth: 3,
        pointBackgroundColor: "#0d6efd"
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

function renderStatusChart(orders) {
  const statusCount = {
    pending: 0,
    processing: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0
  };

  orders.forEach(order => {
    if (statusCount[order.status] !== undefined) {
      statusCount[order.status] += 1;
    }
  });

  const labels = [
    "Pendente",
    "Em preparação",
    "Enviado",
    "Entregue",
    "Cancelado"
  ];

  const values = [
    statusCount.pending,
    statusCount.processing,
    statusCount.shipped,
    statusCount.delivered,
    statusCount.cancelled
  ];

  const context = document.getElementById("reports-status-chart");

  if (reportsStatusChart) {
    reportsStatusChart.destroy();
  }

  reportsStatusChart = new Chart(context, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Pedidos",
        data: values,
        backgroundColor: [
          "#ffc107",
          "#0d6efd",
          "#0dcaf0",
          "#198754",
          "#dc3545"
        ],
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0
          }
        }
      }
    }
  });
}

function renderBestSellingProducts(orders) {
  const container = document.getElementById("best-selling-products");

  const productSales = {};

  orders.forEach(order => {
    (order.order_items || []).forEach(item => {
      const name = item.product_name;

      if (!productSales[name]) {
        productSales[name] = {
          quantity: 0,
          revenue: 0
        };
      }

      productSales[name].quantity += Number(item.quantity || 0);
      productSales[name].revenue += Number(item.total || 0);
    });
  });

  const products = Object.entries(productSales)
    .map(([name, data]) => ({
      name,
      quantity: data.quantity,
      revenue: data.revenue
    }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  if (products.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="3" class="text-center text-muted">
          Nenhum produto vendido no período selecionado.
        </td>
      </tr>
    `;
    return;
  }

  container.innerHTML = products.map(product => `
    <tr>
      <td>${product.name}</td>
      <td>${product.quantity}</td>
      <td>${formatMZN(product.revenue)}</td>
    </tr>
  `).join("");
}

function renderBestCustomers(orders) {
  const container = document.getElementById("best-customers");

  const customerSales = {};

  orders.forEach(order => {
    if (order.status === "cancelled") return;

    const key = order.user_id || order.customer_name;
    const name = order.customer_name || "Cliente";

    if (!customerSales[key]) {
      customerSales[key] = {
        name,
        orders: 0,
        total: 0
      };
    }

    customerSales[key].orders += 1;
    customerSales[key].total += Number(order.total || 0);
  });

  const customers = Object.values(customerSales)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  if (customers.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="3" class="text-center text-muted">
          Nenhum cliente com compras no período selecionado.
        </td>
      </tr>
    `;
    return;
  }

  container.innerHTML = customers.map(customer => `
    <tr>
      <td>${customer.name}</td>
      <td>${customer.orders}</td>
      <td>${formatMZN(customer.total)}</td>
    </tr>
  `).join("");
}