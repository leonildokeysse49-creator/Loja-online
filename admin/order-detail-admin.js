/* =========================================
   Loja MZ — Detalhe administrativo do pedido
   ========================================= */

let currentAdminOrder = null;
let currentAdminPayment = null;
let currentAdminShipment = null;

document.addEventListener("DOMContentLoaded", () => {
  const checkAdminLoaded = setInterval(() => {
    if (window.currentAdmin) {
      clearInterval(checkAdminLoaded);

      const orderId = new URLSearchParams(window.location.search).get("id");

      if (orderId) {
        loadAdminOrder(orderId);
      } else {
        showOrderError();
      }
    }
  }, 200);

  document.getElementById("update-order-button").addEventListener("click", () => {
    updateOrderStatus();
  });

  document.getElementById("update-payment-button").addEventListener("click", () => {
    updatePayment();
  });

  document.getElementById("update-shipment-button").addEventListener("click", () => {
    updateShipment();
  });
});

function showOrderError() {
  document.getElementById("order-loading").classList.add("d-none");
  document.getElementById("order-content").classList.add("d-none");
  document.getElementById("order-error").classList.remove("d-none");
}

async function loadAdminOrder(orderId) {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select(`
        *,
        order_items (
          id,
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
          status,
          transaction_reference
        ),
        shipments (
          id,
          carrier,
          tracking_code,
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

    currentAdminOrder = data;
    currentAdminPayment = data.payments?.[0] || null;
    currentAdminShipment = data.shipments?.[0] || null;

    renderAdminOrder(data);

    document.getElementById("order-loading").classList.add("d-none");
    document.getElementById("order-content").classList.remove("d-none");

  } catch (error) {
    console.error("Erro ao carregar pedido:", error);
    showOrderError();
  }
}

function renderAdminOrder(order) {
  document.getElementById("order-number").textContent = `Pedido: ${order.order_number || order.id}`;

  const statusBadge = document.getElementById("order-status");

  statusBadge.textContent = getOrderStatusText(order.status);
  statusBadge.className = `badge ${getOrderStatusBadge(order.status)}`;

  document.getElementById("order-status-select").value = order.status;

  document.getElementById("customer-name").textContent = order.customer_name || "-";
  document.getElementById("customer-email").textContent = order.customer_email || "-";
  document.getElementById("customer-phone").textContent = order.customer_phone || "-";
  document.getElementById("customer-phone-alt").textContent = order.customer_phone_alt || "-";
  document.getElementById("customer-province").textContent = order.province || "-";
  document.getElementById("customer-city").textContent = order.city || "-";
  document.getElementById("customer-neighborhood").textContent = order.neighborhood || "-";
  document.getElementById("customer-street").textContent = order.street || "-";
  document.getElementById("customer-reference").textContent = order.reference || "-";

  const notesWrapper = document.getElementById("notes-wrapper");

  if (order.notes) {
    notesWrapper.classList.remove("d-none");
    document.getElementById("order-notes").textContent = order.notes;
  } else {
    notesWrapper.classList.add("d-none");
  }

  renderOrderItems(order.order_items || []);

  if (currentAdminPayment) {
    document.getElementById("payment-status-select").value = currentAdminPayment.status;
    document.getElementById("payment-reference").value = currentAdminPayment.transaction_reference || "";
  }

  if (currentAdminShipment) {
    document.getElementById("shipment-carrier").value = currentAdminShipment.carrier || "";
    document.getElementById("shipment-tracking").value = currentAdminShipment.tracking_code || "";
    document.getElementById("shipment-status-select").value = currentAdminShipment.status;
  }

  document.getElementById("order-subtotal").textContent = formatMZN(order.subtotal);
  document.getElementById("order-delivery").textContent = formatMZN(order.delivery_fee);
  document.getElementById("order-total").textContent = formatMZN(order.total);
}

function renderOrderItems(items) {
  const container = document.getElementById("order-items");

  if (!items || items.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-muted">
          Nenhum artigo no pedido.
        </td>
      </tr>
    `;
    return;
  }

  container.innerHTML = items.map(item => `
    <tr>
      <td>
        <strong>${item.product_name}</strong>

        ${item.variant_name ? `
          <small class="d-block text-muted">
            ${item.variant_name}
          </small>
        ` : ""}
      </td>

      <td>${formatMZN(item.price)}</td>
      <td>${item.quantity}</td>
      <td>${formatMZN(item.total)}</td>
    </tr>
  `).join("");
}

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

async function updateOrderStatus() {
  const status = document.getElementById("order-status-select").value;

  const { error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", currentAdminOrder.id);

  if (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível atualizar o pedido."
    });

    return;
  }

  Swal.fire({
    icon: "success",
    title: "Pedido atualizado",
    timer: 1500,
    showConfirmButton: false
  });

  loadAdminOrder(currentAdminOrder.id);
}

async function updatePayment() {
  if (!currentAdminPayment) {
    Swal.fire({
      icon: "warning",
      title: "Pagamento não encontrado",
      text: "Este pedido ainda não possui registo de pagamento."
    });

    return;
  }

  const status = document.getElementById("payment-status-select").value;
  const reference = document.getElementById("payment-reference").value.trim();

  const { error } = await supabase
    .from("payments")
    .update({
      status,
      transaction_reference: reference || null
    })
    .eq("id", currentAdminPayment.id);

  if (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível atualizar o pagamento."
    });

    return;
  }

  Swal.fire({
    icon: "success",
    title: "Pagamento atualizado",
    timer: 1500,
    showConfirmButton: false
  });

  loadAdminOrder(currentAdminOrder.id);
}

async function updateShipment() {
  const shipmentData = {
    order_id: currentAdminOrder.id,
    carrier: document.getElementById("shipment-carrier").value.trim() || null,
    tracking_code: document.getElementById("shipment-tracking").value.trim() || null,
    status: document.getElementById("shipment-status-select").value
  };

  try {
    if (currentAdminShipment) {
      const { error } = await supabase
        .from("shipments")
        .update(shipmentData)
        .eq("id", currentAdminShipment.id);

      if (error) throw error;

    } else {
      const { data, error } = await supabase
        .from("shipments")
        .insert(shipmentData)
        .select()
        .single();

      if (error) throw error;

      currentAdminShipment = data;
    }

    Swal.fire({
      icon: "success",
      title: "Envio atualizado",
      timer: 1500,
      showConfirmButton: false
    });

    loadAdminOrder(currentAdminOrder.id);

  } catch (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível atualizar o envio."
    });
  }
}