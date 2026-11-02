/* =========================================
   Loja MZ — Dashboard administrativo

   Requer:
   • config.js
   • supabase.js
   • admin-auth.js
   • Chart.js apenas para o gráfico

   Compatível com os IDs de admin/index.html.
   ========================================= */

(function adminDashboard() {
  "use strict";

  let dashboardStarted = false;
  let salesChart = null;

  const TIME_ZONE = "Africa/Maputo";

  const STATUS_LABELS = {
    pending: "Pendente",
    processing: "Em preparação",
    shipped: "Enviado",
    delivered: "Entregue",
    cancelled: "Cancelado"
  };

  const STATUS_CLASSES = {
    pending: "bg-warning text-dark",
    processing: "bg-primary",
    shipped: "bg-info text-dark",
    delivered: "bg-success",
    cancelled: "bg-danger"
  };

  function getElement(id) {
    return document.getElementById(id);
  }

  function getClient() {
    const client = window.lojaMzSupabaseClient;

    if (!client || typeof client.from !== "function") {
      throw new Error(
        "O cliente Supabase não foi inicializado."
      );
    }

    return client;
  }

  function money(value) {
    return new Intl.NumberFormat("pt-MZ", {
      style: "currency",
      currency: "MZN"
    }).format(Number(value) || 0);
  }

  function setText(id, value) {
    const element = getElement(id);

    if (element) {
      element.textContent = String(value);
    }
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
      element.className = className;
    }

    if (text !== undefined && text !== null) {
      element.textContent = String(text);
    }

    return element;
  }

  function formatDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return new Intl.DateTimeFormat("pt-MZ", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: TIME_ZONE
    }).format(date);
  }

  function startDashboard() {
    if (dashboardStarted || !window.currentAdmin) {
      return;
    }

    // Evita inicializar este módulo noutras páginas.
    if (!getElement("total-orders")) {
      return;
    }

    dashboardStarted = true;

    labelSalesMetric();
    loadDashboard();
  }

  function labelSalesMetric() {
    const salesValue = getElement("total-sales");

    const label = salesValue
      ?.parentElement
      ?.querySelector("small");

    if (label) {
      label.textContent = "Pagamentos confirmados";
    }

    if (salesValue) {
      salesValue.title =
        "Soma dos registos de pagamento com estado " +
        "Confirmado ou Pago, excluindo pedidos cancelados.";
    }
  }

  async function loadDashboard() {
    showLoadingStates();

    const tasks = [
      {
        name: "Indicadores",
        run: loadCounters,
        onError: showCounterError
      },
      {
        name: "Pedidos recentes",
        run: loadRecentOrders,
        onError: showRecentOrdersError
      },
      {
        name: "Stock baixo",
        run: loadLowStock,
        onError: showLowStockError
      },
      {
        name: "Gráfico",
        run: loadSalesChart,
        onError: showChartError
      }
    ];

    const results = await Promise.allSettled(
      tasks.map(task => task.run())
    );

    results.forEach((result, index) => {
      if (result.status !== "rejected") {
        return;
      }

      const task = tasks[index];

      console.error(
        `[Loja MZ] Dashboard — ${task.name}:`,
        result.reason
      );

      task.onError();
    });
  }

  function showLoadingStates() {
    [
      "total-sales",
      "total-orders",
      "total-customers",
      "total-products"
    ].forEach(id => {
      setText(id, "...");
    });

    const recent = getElement("recent-orders");

    if (recent) {
      recent.replaceChildren(
        createElement(
          "p",
          "text-muted mb-0",
          "A carregar pedidos..."
        )
      );
    }

    renderStockMessage("A carregar produtos...");
  }

  async function getExactCount(table, filter = null) {
    let query = getClient()
      .from(table)
      .select("id", {
        count: "exact",
        head: true
      });

    if (filter) {
      query = query.eq(filter.column, filter.value);
    }

    const { count, error } = await query;

    if (error) {
      throw error;
    }

    return count || 0;
  }

  /*
   * Busca pagamentos em lotes, respeitando uma ordem
   * estável. O total não depende apenas do primeiro
   * lote devolvido pela API.
   */
  async function fetchConfirmedPayments(startDate = null) {
    const rows = [];
    const pageSize = 500;

    let offset = 0;
    let expectedCount = null;

    while (true) {
      let query = getClient()
        .from("payments")
        .select(
          `
            id,
            order_id,
            amount,
            status,
            created_at,
            orders!inner (
              status
            )
          `,
          { count: "exact" }
        )
        .in("status", ["confirmed", "paid"])
        .neq("orders.status", "cancelled");

      if (startDate) {
        query = query.gte("created_at", startDate);
      }

      const { data, error, count } = await query
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) {
        throw error;
      }

      if (expectedCount === null) {
        expectedCount = count || 0;
      }

      const batch = data || [];

      rows.push(...batch);
      offset += batch.length;

      if (
        batch.length === 0 ||
        offset >= expectedCount
      ) {
        break;
      }
    }

    return rows;
  }

  async function loadCounters() {
    const [
      ordersCount,
      productsCount,
      customersCount,
      payments
    ] = await Promise.all([
      getExactCount("orders"),
      getExactCount("products"),
      getExactCount("profiles", {
        column: "role",
        value: "customer"
      }),
      fetchConfirmedPayments()
    ]);

    const confirmedAmount = payments.reduce(
      (sum, payment) => {
        return sum + Number(payment.amount || 0);
      },
      0
    );

    setText("total-sales", money(confirmedAmount));
    setText("total-orders", ordersCount);
    setText("total-customers", customersCount);
    setText("total-products", productsCount);
  }

  async function loadRecentOrders() {
    const container = getElement("recent-orders");

    if (!container) {
      return;
    }

    const { data, error } = await getClient()
      .from("orders")
      .select(
        `
          id,
          order_number,
          customer_name,
          total,
          status,
          created_at
        `
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(6);

    if (error) {
      throw error;
    }

    container.replaceChildren();

    if (!data || data.length === 0) {
      container.append(
        createElement(
          "p",
          "text-muted mb-0",
          "Ainda não existem pedidos."
        )
      );

      return;
    }

    data.forEach(order => {
      const link = createElement(
        "a",
        "d-flex justify-content-between align-items-start " +
        "gap-3 py-3 border-bottom text-body"
      );

      link.href =
        `pedido-detalhe.html?id=${encodeURIComponent(order.id)}`;

      const left = createElement("div");
      const right = createElement("div", "text-end");

      left.append(
        createElement(
          "strong",
          "d-block",
          order.order_number || order.id
        ),
        createElement(
          "small",
          "d-block text-muted",
          order.customer_name || "Cliente"
        ),
        createElement(
          "small",
          "d-block text-muted",
          formatDate(order.created_at)
        )
      );

      const badge = createElement(
        "span",
        `badge ${STATUS_CLASSES[order.status] || "bg-secondary"}`,
        STATUS_LABELS[order.status] || order.status
      );

      right.append(
        createElement(
          "strong",
          "d-block mb-1",
          money(order.total)
        ),
        badge
      );

      link.append(left, right);
      container.append(link);
    });
  }

  function renderStockMessage(message, isError = false) {
    const table = getElement("low-stock-products");

    if (!table) {
      return;
    }

    const row = document.createElement("tr");

    const cell = createElement(
      "td",
      `text-center py-4 ${
        isError ? "text-danger" : "text-muted"
      }`,
      message
    );

    cell.colSpan = 5;

    row.append(cell);
    table.replaceChildren(row);
  }

  async function loadLowStock() {
    const table = getElement("low-stock-products");

    if (!table) {
      return;
    }

    const { data, error } = await getClient()
      .from("products")
      .select(
        `
          id,
          name_pt,
          price,
          promotional_price,
          stock,
          categories (
            name_pt
          )
        `
      )
      .eq("is_active", true)
      .lte("stock", 5)
      .order("stock", { ascending: true })
      .order("id", { ascending: true })
      .limit(10);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      renderStockMessage(
        "Nenhum produto ativo com stock igual ou inferior a 5."
      );

      return;
    }

    table.replaceChildren();

    data.forEach(product => {
      const row = document.createElement("tr");
      const nameCell = document.createElement("td");

      const link = createElement(
        "a",
        "fw-semibold",
        product.name_pt
      );

      link.href =
        `produto-form.html?id=${encodeURIComponent(product.id)}`;

      nameCell.append(link);

      const finalPrice =
        product.promotional_price ?? product.price;

      const stockStatusCell = document.createElement("td");

      stockStatusCell.append(
        createElement(
          "span",
          `badge ${
            product.stock === 0
              ? "badge-stock-out"
              : "badge-stock-low"
          }`,
          product.stock === 0 ? "Esgotado" : "Stock baixo"
        )
      );

      row.append(
        nameCell,
        createElement(
          "td",
          "",
          product.categories?.name_pt || "-"
        ),
        createElement("td", "", money(finalPrice)),
        createElement("td", "", product.stock),
        stockStatusCell
      );

      table.append(row);
    });
  }

  function getMaputoYearMonth(date) {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit"
    }).formatToParts(date);

    return {
      year: Number(
        parts.find(part => part.type === "year").value
      ),
      month: Number(
        parts.find(part => part.type === "month").value
      )
    };
  }

  function getMonthKey(date) {
    const { year, month } = getMaputoYearMonth(date);

    return `${year}-${String(month).padStart(2, "0")}`;
  }

  function getChartMessageElement() {
    let message = getElement("dashboard-chart-message");

    if (message) {
      return message;
    }

    const canvas = getElement("sales-chart");

    if (!canvas) {
      return null;
    }

    message = createElement(
      "p",
      "small text-muted mt-3 mb-0"
    );

    message.id = "dashboard-chart-message";
    message.setAttribute("role", "status");

    canvas.insertAdjacentElement("afterend", message);

    return message;
  }

  function setChartMessage(text, isError = false) {
    const message = getChartMessageElement();

    if (!message) {
      return;
    }

    message.className = isError
      ? "small text-danger mt-3 mb-0"
      : "small text-muted mt-3 mb-0";

    message.textContent = text;
  }

  async function loadSalesChart() {
    const canvas = getElement("sales-chart");

    if (!canvas) {
      return;
    }

    if (typeof window.Chart !== "function") {
      canvas.hidden = true;

      setChartMessage(
        "O Chart.js não foi carregado. " +
        "Os restantes dados do dashboard continuam disponíveis.",
        true
      );

      return;
    }

    const heading = canvas
      .closest(".admin-card")
      ?.querySelector("h5");

    if (heading) {
      heading.textContent =
        "Pagamentos confirmados por mês";
    }

    const current = getMaputoYearMonth(new Date());

    const months = Array.from(
      { length: 6 },
      (_, index) => {
        const date = new Date(
          Date.UTC(
            current.year,
            current.month - 1 - 5 + index,
            1
          )
        );

        return {
          key: getMonthKey(date),
          label: new Intl.DateTimeFormat("pt-MZ", {
            month: "short",
            year: "numeric",
            timeZone: TIME_ZONE
          }).format(date),
          total: 0,
          year: date.getUTCFullYear(),
          month: date.getUTCMonth() + 1
        };
      }
    );

    const firstMonth = months[0];

    const startDate =
      `${firstMonth.year}-` +
      `${String(firstMonth.month).padStart(2, "0")}-` +
      "01T00:00:00+02:00";

    const payments = await fetchConfirmedPayments(startDate);

    const monthlyTotals = new Map(
      months.map(month => [month.key, 0])
    );

    payments.forEach(payment => {
      const date = new Date(payment.created_at);

      if (Number.isNaN(date.getTime())) {
        return;
      }

      const key = getMonthKey(date);

      if (monthlyTotals.has(key)) {
        monthlyTotals.set(
          key,
          monthlyTotals.get(key) +
            Number(payment.amount || 0)
        );
      }
    });

    if (salesChart) {
      salesChart.destroy();
    }

    canvas.hidden = false;

    salesChart = new window.Chart(canvas, {
      type: "line",

      data: {
        labels: months.map(month => month.label),

        datasets: [{
          label: "Valor confirmado (MZN)",
          data: months.map(
            month => monthlyTotals.get(month.key)
          ),
          borderColor: "#0d6efd",
          backgroundColor: "rgba(13, 110, 253, 0.12)",
          pointBackgroundColor: "#0d6efd",
          borderWidth: 3,
          pointRadius: 4,
          fill: true,
          tension: 0.3
        }]
      },

      options: {
        responsive: true,

        plugins: {
          legend: {
            display: false
          },

          tooltip: {
            callbacks: {
              label(context) {
                return money(context.parsed.y);
              }
            }
          }
        },

        scales: {
          y: {
            beginAtZero: true,

            ticks: {
              callback(value) {
                return new Intl.NumberFormat(
                  "pt-MZ",
                  {
                    notation: "compact",
                    maximumFractionDigits: 1
                  }
                ).format(value);
              }
            }
          }
        }
      }
    });

    canvas.setAttribute("role", "img");

    canvas.setAttribute(
      "aria-label",
      "Pagamentos confirmados por mês nos últimos seis meses"
    );

    setChartMessage(
      "Últimos seis meses. Valores agrupados pela data de " +
      "criação do registo de pagamento; pedidos cancelados " +
      "não são incluídos."
    );
  }

  function showCounterError() {
    [
      "total-sales",
      "total-orders",
      "total-customers",
      "total-products"
    ].forEach(id => setText(id, "—"));
  }

  function showRecentOrdersError() {
    const container = getElement("recent-orders");

    if (container) {
      container.replaceChildren(
        createElement(
          "p",
          "text-danger mb-0",
          "Não foi possível carregar os pedidos recentes."
        )
      );
    }
  }

  function showLowStockError() {
    renderStockMessage(
      "Não foi possível carregar os produtos com stock baixo.",
      true
    );
  }

  function showChartError() {
    const canvas = getElement("sales-chart");

    if (canvas) {
      canvas.hidden = true;
    }

    setChartMessage(
      "Não foi possível carregar os dados do gráfico.",
      true
    );
  }

  document.addEventListener(
    "admin:ready",
    startDashboard
  );

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      startDashboard,
      { once: true }
    );
  } else {
    startDashboard();
  }
})();