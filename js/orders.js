/* =========================================
   Loja MZ — Página de detalhes do pedido
   ========================================= */

const ORDER_STEPS = [
  "pending",
  "processing",
  "shipped",
  "delivered"
];

document.addEventListener("DOMContentLoaded", () => {
  const orderId = new URLSearchParams(window.location.search).get("id");

  if (!orderId) {
    showOrderError();
    return;
  }

  loadOrder(orderId);
});

async function loadOrder(orderId) {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select(`
        *,
        order_items (
          id,
          product_id,
          variant_id,
          product_name,
          variant_name,
          price,
          quantity,
          total
        ),
        payments (
          id,
          method,
          amount,
          status
        )
      `)
      .eq("id", orderId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      showOrderError();
      return;
    }

    renderOrder(data);

    document.getElementById("order-loading").classList.add("d-none");
    document.getElementById("order-content").classList.remove("d-none");

  } catch (error) {
    console.error("Erro ao carregar pedido:", error);
    showOrderError();
  }
}

function showOrderError() {
  document.getElementById("order-loading").classList.add("d-none");
  document.getElementById("order-content").classList.add("d-none");
  document.getElementById("order-error").classList.remove("d-none");
}

function renderOrder(order) {
  const language = getCurrentLanguage();

  document.title = `${getTranslation("order_details")} — Loja MZ`;

  document.getElementById("order-subtitle").textContent = `${getTranslation("order_number")}: ${order.order_number || order.id}`;

  document.getElementById("order-number").textContent = `${getTranslation("order_number")}: ${order.order_number || order.id}`;

  renderOrderStatus(order.status);
  renderOrderItems(order.order_items || []);
  renderDeliveryInformation(order);
  renderPaymentInformation(order);
}

function renderOrderStatus(status) {
  const statusElement = document.getElementById("order-status");
  const progressBar = document.getElementById("order-progress-bar");
  const steps = document.querySelectorAll(".order-step");

  const statusTranslations = {
    pending: getTranslation("pending"),
    processing: getTranslation("processing"),
    shipped: getTranslation("shipped"),
    delivered: getTranslation("delivered"),
    cancelled: getTranslation("cancelled")
  };

  statusElement.textContent = statusTranslations[status] || status;

  statusElement.classList.remove(
    "status-pending",
    "status-processing",
    "status-shipped",
    "status-delivered",
    "status-cancelled"
  );

  statusElement.classList.add(`status-${status}`);

  const currentIndex = ORDER_STEPS.indexOf(status);

  if (status === "cancelled") {
    progressBar.style.width = "100%";
    progressBar.classList.add("bg-danger");

    steps.forEach(step => step.classList.remove("active", "completed"));
    return;
  }

  if (currentIndex === -1) {
    progressBar.style.width = "0%";
    return;
  }

  const progress = ((currentIndex + 1) / ORDER_STEPS.length) * 100;

  progressBar.style.width = `${progress}%`;

  steps.forEach((step, index) => {
    step.classList.remove("active", "completed");

    if (index < currentIndex) {
      step.classList.add("completed");
    } else if (index === currentIndex) {
      step.classList.add("active");
    }
  });
}

function renderOrderItems(items) {
  const container = document.getElementById("order-items");

  if (!items || items.length === 0) {
    container.innerHTML = `
      <p class="text-muted mb-0">
        ${getTranslation("no_products")}
      </p>
    `;
    return;
  }

  container.innerHTML = items.map(item => {
    const itemTotal = Number(item.price) * Number(item.quantity);

    return `
      <div class="order-item">
        <div class="order-item-info">
          <h6>${item.product_name}</h6>

          ${item.variant_name ? `
            <small class="text-muted d-block">
              ${item.variant_name}
            </small>
          ` : ""}

          <small class="text-muted">
            ${item.quantity} x ${formatMZN(item.price)}
          </small>
        </div>

        <div class="order-item-total">
          ${formatMZN(itemTotal)}
        </div>
      </div>
    `;
  }).join("");
}

function renderDeliveryInformation(order) {
  document.getElementById("delivery-name").textContent = order.customer_name || "-";
  document.getElementById("delivery-phone").textContent = order.customer_phone || "-";
  document.getElementById("delivery-province").textContent = order.province || "-";
  document.getElementById("delivery-city").textContent = order.city || "-";
  document.getElementById("delivery-neighborhood").textContent = order.neighborhood || "-";
  document.getElementById("delivery-street").textContent = order.street || "-";
  document.getElementById("delivery-reference").textContent = order.reference || "-";

  const notesWrapper = document.getElementById("notes-wrapper");

  if (order.notes) {
    notesWrapper.classList.remove("d-none");
    document.getElementById("delivery-notes").textContent = order.notes;
  } else {
    notesWrapper.classList.add("d-none");
  }
}

function renderPaymentInformation(order) {
  const payment = order.payments?.[0];

  const paymentStatusElement = document.getElementById("payment-status");
  const paymentMethodElement = document.getElementById("payment-method");

  const paymentStatusTranslations = {
    pending: getTranslation("pending"),
    awaiting_confirmation: getTranslation("awaiting_confirmation"),
    confirmed: getTranslation("confirmed"),
    paid: getTranslation("paid"),
    failed: getTranslation("failed"),
    refunded: getTranslation("refunded")
  };

  const paymentMethodTranslations = {
    multicaixa_express: getTranslation("multicaixa_express"),
    bank_transfer: getTranslation("bank_transfer"),
    cash_on_delivery: getTranslation("cash_on_delivery")
  };

  paymentStatusElement.textContent = payment
    ? paymentStatusTranslations[payment.status] || payment.status
    : getTranslation("pending");

  paymentMethodElement.textContent = payment
    ? paymentMethodTranslations[payment.method] || payment.method
    : "-";

  document.getElementById("order-subtotal").textContent = formatMZN(order.subtotal);
  document.getElementById("order-delivery").textContent = formatMZN(order.delivery_fee);
  document.getElementById("order-total").textContent = formatMZN(order.total);
}