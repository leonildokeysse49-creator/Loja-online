/* =========================================
   Loja MZ — Checkout e criação de pedido
   ========================================= */

const DELIVERY_FEES = {
  "Maputo Cidade": 150,
  "Maputo Província": 250,
  "Gaza": 400,
  "Inhambane": 500,
  "Sofala": 650,
  "Manica": 700,
  "Tete": 750,
  "Zambézia": 800,
  "Nampula": 900,
  "Cabo Delgado": 1000,
  "Niassa": 1000
};

let checkoutCart = [];

document.addEventListener("DOMContentLoaded", () => {
  checkoutCart = getCart();

  if (!checkoutCart || checkoutCart.length === 0) {
    document.getElementById("checkout-empty").classList.remove("d-none");
    document.getElementById("checkout-content").classList.add("d-none");
    return;
  }

  document.getElementById("checkout-empty").classList.add("d-none");
  document.getElementById("checkout-content").classList.remove("d-none");

  prefillCustomerData();
  renderCheckoutItems();
  updateCheckoutSummary();

  document.getElementById("customer-province").addEventListener("change", () => {
    updateCheckoutSummary();
  });

  document.getElementById("place-order-button").addEventListener("click", () => {
    placeOrder();
  });
});

/* =========================================
   Dados do cliente
   ========================================= */

async function prefillCustomerData() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) return;

    document.getElementById("customer-email").value = user.email || "";

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name, phone, phone_alt")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (profile) {
      document.getElementById("customer-name").value = profile.full_name || "";
      document.getElementById("customer-phone").value = profile.phone || "";
      document.getElementById("customer-phone-alt").value = profile.phone_alt || "";
    }

  } catch (error) {
    console.error("Erro ao carregar dados do cliente:", error);
  }
}

/* =========================================
   Resumo do checkout
   ========================================= */

function renderCheckoutItems() {
  const container = document.getElementById("checkout-items");

  container.innerHTML = checkoutCart.map(item => {
    const itemTotal = Number(item.price) * Number(item.quantity);

    return `
      <div class="checkout-item">
        <div class="checkout-item-image">
          <img src="${getProductImage(item.image)}" alt="${item.name}">
        </div>

        <div class="checkout-item-info">
          <h6>${item.name}</h6>

          ${item.variant_name ? `
            <small>${item.variant_name}</small>
          ` : ""}

          <small class="d-block">
            ${item.quantity} x ${formatMZN(item.price)}
          </small>
        </div>

        <div class="checkout-item-price">
          ${formatMZN(itemTotal)}
        </div>
      </div>
    `;
  }).join("");
}

function getDeliveryFee() {
  const province = document.getElementById("customer-province").value;

  return DELIVERY_FEES[province] || 0;
}

function updateCheckoutSummary() {
  const subtotal = getCartTotal();
  const deliveryFee = getDeliveryFee();
  const total = subtotal + deliveryFee;

  document.getElementById("checkout-subtotal").textContent = formatMZN(subtotal);
  document.getElementById("checkout-delivery").textContent = formatMZN(deliveryFee);
  document.getElementById("checkout-total").textContent = formatMZN(total);
}

/* =========================================
   Validação
   ========================================= */

function validateCheckoutForm() {
  const requiredFields = [
    "customer-name",
    "customer-email",
    "customer-phone",
    "customer-province",
    "customer-city",
    "customer-neighborhood",
    "customer-street"
  ];

  for (const fieldId of requiredFields) {
    const field = document.getElementById(fieldId);

    if (!field.value.trim()) {
      field.focus();
      field.classList.add("is-invalid");

      Swal.fire({
        icon: "warning",
        title: getTranslation("fill_required_fields"),
        text: getTranslation("check_form_data")
      });

      return false;
    }

    field.classList.remove("is-invalid");
  }

  return true;
}

/* =========================================
   Criar pedido
   ========================================= */

async function placeOrder() {
  if (!checkoutCart || checkoutCart.length === 0) {
    window.location.href = "carrinho.html";
    return;
  }

  if (!validateCheckoutForm()) {
    return;
  }

  const button = document.getElementById("place-order-button");
  const originalButtonText = button.innerHTML;

  button.disabled = true;
  button.innerHTML = `
    <span class="spinner-border spinner-border-sm me-2"></span>
    ${getTranslation("processing_order")}
  `;

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError) throw userError;

    const subtotal = getCartTotal();
    const deliveryFee = getDeliveryFee();
    const total = subtotal + deliveryFee;

    const paymentMethod = document.querySelector(
      'input[name="payment_method"]:checked'
    ).value;

    const orderData = {
      user_id: user ? user.id : null,
      customer_name: document.getElementById("customer-name").value.trim(),
      customer_email: document.getElementById("customer-email").value.trim(),
      customer_phone: document.getElementById("customer-phone").value.trim(),
      customer_phone_alt: document.getElementById("customer-phone-alt").value.trim() || null,
      province: document.getElementById("customer-province").value,
      city: document.getElementById("customer-city").value.trim(),
      neighborhood: document.getElementById("customer-neighborhood").value.trim(),
      street: document.getElementById("customer-street").value.trim(),
      reference: document.getElementById("customer-reference").value.trim() || null,
      notes: document.getElementById("order-notes").value.trim() || null,
      payment_method: paymentMethod,
      subtotal: subtotal,
      delivery_fee: deliveryFee,
      total: total,
      status: "pending"
    };

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert(orderData)
      .select()
      .single();

    if (orderError) throw orderError;

    const orderItems = checkoutCart.map(item => ({
      order_id: order.id,
      product_id: item.product_id,
      variant_id: item.variant_id || null,
      product_name: item.name,
      variant_name: item.variant_name || null,
      price: item.price,
      quantity: item.quantity,
      total: Number(item.price) * Number(item.quantity)
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems);

    if (itemsError) throw itemsError;

    const { error: paymentError } = await supabase
      .from("payments")
      .insert({
        order_id: order.id,
        method: paymentMethod,
        amount: total,
        status: paymentMethod === "cash_on_delivery" ? "pending" : "awaiting_confirmation"
      });

    if (paymentError) throw paymentError;

    clearCart();

    Swal.fire({
      icon: "success",
      title: getTranslation("order_created"),
      text: `${getTranslation("order_number")}: ${order.order_number || order.id}`,
      confirmButtonText: getTranslation("view_order")
    }).then(() => {
      window.location.href = `pedido.html?id=${order.id}`;
    });

  } catch (error) {
    console.error("Erro ao criar pedido:", error);

    Swal.fire({
      icon: "error",
      title: getTranslation("order_error"),
      text: getTranslation("order_error_text")
    });

  } finally {
    button.disabled = false;
    button.innerHTML = originalButtonText;
  }
}