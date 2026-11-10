/* =========================================
   Loja MZ — Checkout e entrega configurada
   ========================================= */

(function checkoutPage() {
  "use strict";

  const COUPON_KEY = "loja_mz_coupon";

  const el = id => document.getElementById(id);

  let cart = [];
  let settings = null;
  let submitting = false;
  let orderWriteStarted = false;
  let createdOrderId = null;
  let deliveryError = "";

  function client() {
    if (
      window.lojaMzSupabaseClient &&
      typeof window.lojaMzSupabaseClient.from === "function"
    ) {
      return window.lojaMzSupabaseClient;
    }

    if (
      typeof supabase !== "undefined" &&
      typeof supabase.from === "function"
    ) {
      return supabase;
    }

    throw new Error("O cliente Supabase não está disponível.");
  }

  function english() {
    return typeof getCurrentLanguage === "function" &&
      getCurrentLanguage() === "en";
  }

  function text(pt, en) {
    return english() ? en : pt;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function money(value) {
    return new Intl.NumberFormat(
      english() ? "en-MZ" : "pt-MZ",
      {
        style: "currency",
        currency: "MZN"
      }
    ).format(value);
  }

  function cents(value) {
    return Math.round(Number(value) * 100);
  }

  function getCoupon() {
    try {
      const value = JSON.parse(
        localStorage.getItem(COUPON_KEY) || "null"
      );

      return value && typeof value === "object" ? value : null;
    } catch (error) {
      return null;
    }
  }

  function saveCoupon(coupon) {
    if (!coupon) {
      localStorage.removeItem(COUPON_KEY);
      return;
    }

    localStorage.setItem(COUPON_KEY, JSON.stringify(coupon));
  }

  function calculateDiscount(coupon, subtotalValue) {
    if (!coupon) return 0;

    if (Number(coupon.min_order_value) > subtotalValue) {
      return 0;
    }

    if (coupon.discount_type === "percentage") {
      return subtotalValue * (Number(coupon.discount_value) / 100);
    }

    if (coupon.discount_type === "fixed") {
      return Math.min(
        Number(coupon.discount_value),
        subtotalValue
      );
    }

    return 0;
  }

  function validateCart(items) {
    if (!Array.isArray(items) || !items.length) {
      throw new Error(text("O carrinho está vazio.", "Your cart is empty."));
    }

    items.forEach(item => {
      if (
        !(item.id || item.product_id) ||
        !Number.isFinite(Number(item.price)) ||
        Number(item.price) < 0 ||
        !Number.isInteger(Number(item.quantity)) ||
        Number(item.quantity) < 1
      ) {
        throw new Error(
          text(
            "Há um artigo inválido no carrinho.",
            "Your cart contains an invalid item."
          )
        );
      }
    });
  }

  function subtotalCents() {
    return cart.reduce(
      (sum, item) =>
        sum + cents(item.price) * Number(item.quantity),
      0
    );
  }

  async function loadDeliverySettings() {
    const { data, error } = await client()
      .from("settings")
      .select(
        "delivery_fees, delivery_fee_maputo, is_maintenance_mode"
      )
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error(
        text(
          "As taxas de entrega ainda não foram configuradas.",
          "Delivery rates have not been configured."
        )
      );
    }

    settings = data;
    deliveryError = "";
  }

  function deliveryState() {
    if (deliveryError) {
      return { valid: false, message: deliveryError };
    }

    if (!settings) {
      return {
        valid: false,
        message: text("A carregar entrega...", "Loading delivery...")
      };
    }

    if (settings.is_maintenance_mode) {
      return {
        valid: false,
        message: text(
          "A loja está temporariamente em manutenção.",
          "The store is temporarily under maintenance."
        )
      };
    }

    const province = el("customer-province").value;

    if (!province) {
      return {
        valid: false,
        message: text(
          "Selecione a província",
          "Select a province"
        )
      };
    }

    const fees = settings.delivery_fees;
    let raw = null;

    if (
      fees &&
      typeof fees === "object" &&
      !Array.isArray(fees)
    ) {
      raw = fees[province];
    } else if (province === "Maputo Cidade") {
      raw = settings.delivery_fee_maputo;
    }

    if (
      raw === null ||
      raw === undefined ||
      raw === "" ||
      typeof raw === "boolean" ||
      !Number.isFinite(Number(raw)) ||
      Number(raw) < 0
    ) {
      return {
        valid: false,
        message: text(
          "Entrega não configurada para esta província",
          "Delivery is not configured for this province"
        )
      };
    }

    return {
      valid: true,
      feeCents: cents(raw)
    };
  }

  function updateSummary() {
    const subtotalValue = subtotalCents() / 100;
    const coupon = getCoupon();
    const discount = calculateDiscount(coupon, subtotalValue);
    const delivery = deliveryState();

    const total = delivery.valid
      ? Math.max(0, subtotalValue - discount + delivery.feeCents / 100)
      : 0;

    el("checkout-subtotal").textContent = money(subtotalValue);

    const discountRow = el("coupon-discount-row");

    if (discountRow) {
      discountRow.classList.toggle("d-none", discount <= 0);
      el("checkout-discount").textContent = `- ${money(discount)}`;
    }

    el("checkout-delivery").textContent = delivery.valid
      ? delivery.feeCents === 0
        ? text("Grátis", "Free")
        : money(delivery.feeCents / 100)
      : delivery.message;

    el("checkout-total").textContent = delivery.valid
      ? money(total)
      : "—";

    el("place-order-button").disabled =
      submitting || orderWriteStarted || !delivery.valid;
  }

  function renderItems() {
    el("checkout-items").innerHTML = cart.map(item => {
      const price = Number(item.price);
      const quantity = Number(item.quantity);

      return `
        <div class="checkout-item">
          <div class="checkout-item-image">
            <img
              src="${escapeHtml(getProductImage(item.image))}"
              alt="${escapeHtml(item.name || item.name_pt || "Produto")}"
            >
          </div>

          <div class="checkout-item-info">
            <h6>
              ${escapeHtml(item.name || item.name_pt || "Produto")}
            </h6>

            ${
              item.variant_name
                ? `<small>${escapeHtml(item.variant_name)}</small>`
                : ""
            }

            <small class="d-block">
              ${quantity} × ${escapeHtml(money(price))}
            </small>
          </div>

          <div class="checkout-item-price">
            ${escapeHtml(money(cents(price) * quantity / 100))}
          </div>
        </div>
      `;
    }).join("");
  }

  async function prefillCustomer() {
    try {
      const { data, error } = await client().auth.getUser();

      if (error || !data.user) return;

      const user = data.user;

      if (!el("customer-email").value) {
        el("customer-email").value = user.email || "";
      }

      const { data: profile, error: profileError } = await client()
        .from("profiles")
        .select("full_name, phone, phone_alt")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile) return;

      const values = {
        "customer-name": profile.full_name,
        "customer-phone": profile.phone,
        "customer-phone-alt": profile.phone_alt
      };

      Object.entries(values).forEach(([id, value]) => {
        if (!el(id).value) {
          el(id).value = value || "";
        }
      });
    } catch (error) {
      console.warn("[Loja MZ] Dados do cliente:", error);
    }
  }

  async function applyCoupon() {
    const code = el("coupon-code").value.trim().toUpperCase();
    const message = el("coupon-message");
    const button = el("apply-coupon-button");

    if (!code) {
      message.className = "small mt-2 mb-0 text-danger";
      message.textContent = text(
        "Escreve o código do cupom.",
        "Enter the coupon code."
      );
      return;
    }

    button.disabled = true;
    button.textContent = text("A verificar...", "Checking...");

    try {
      const { data: coupon, error } = await client()
        .from("coupons")
        .select("*")
        .eq("code", code)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;

      if (!coupon) {
        throw new Error(
          text("Cupom inválido.", "Invalid coupon.")
        );
      }

      const now = new Date();

      if (coupon.starts_at && new Date(coupon.starts_at) > now) {
        throw new Error(
          text(
            "Este cupom ainda não está disponível.",
            "This coupon is not available yet."
          )
        );
      }

      if (coupon.expires_at && new Date(coupon.expires_at) < now) {
        throw new Error(
          text("Este cupom expirou.", "This coupon has expired.")
        );
      }

      if (
        coupon.max_uses !== null &&
        coupon.used_count >= coupon.max_uses
      ) {
        throw new Error(
          text(
            "Limite de utilizações atingido.",
            "Usage limit reached."
          )
        );
      }

      const subtotalValue = subtotalCents() / 100;

      if (subtotalValue < Number(coupon.min_order_value)) {
        throw new Error(
          text(
            `Compra mínima de ${money(coupon.min_order_value)}.`,
            `Minimum order is ${money(coupon.min_order_value)}.`
          )
        );
      }

      saveCoupon(coupon);

      message.className = "small mt-2 mb-0 text-success";
      message.textContent =
        coupon.discount_type === "percentage"
          ? text(
              `Cupom aplicado: ${coupon.discount_value}% de desconto.`,
              `Coupon applied: ${coupon.discount_value}% discount.`
            )
          : text(
              `Cupom aplicado: ${money(coupon.discount_value)} de desconto.`,
              `Coupon applied: ${money(coupon.discount_value)} discount.`
            );

      updateSummary();

    } catch (error) {
      saveCoupon(null);

      message.className = "small mt-2 mb-0 text-danger";
      message.textContent = error.message;

      updateSummary();

    } finally {
      button.disabled = false;
      button.textContent = text("Aplicar", "Apply");
    }
  }

  async function placeOrder() {
    if (submitting || orderWriteStarted) return;

    if (!el("checkout-form").reportValidity()) return;

    const originalCart = JSON.stringify(cart);
    const previousDelivery = deliveryState();

    if (!previousDelivery.valid) return;

    submitting = true;
    updateSummary();

    const button = el("place-order-button");
    const originalText = button.innerHTML;
    button.textContent = text("A processar...", "Processing...");

    try {
      const latestCart = getCart();
      validateCart(latestCart);

      if (JSON.stringify(latestCart) !== originalCart) {
        cart = latestCart;
        renderItems();

        throw new Error(
          text(
            "O carrinho mudou. Confirma os valores e tenta novamente.",
            "Your cart changed. Review the values and try again."
          )
        );
      }

      try {
        await loadDeliverySettings();
      } catch (error) {
        settings = null;
        deliveryError = text(
          "Não foi possível confirmar a taxa de entrega.",
          "Could not confirm the delivery fee."
        );
        throw error;
      }

      const delivery = deliveryState();

      if (!delivery.valid) {
        throw new Error(delivery.message);
      }

      if (delivery.feeCents !== previousDelivery.feeCents) {
        throw new Error(
          text(
            "A taxa de entrega foi atualizada. Confirma o novo total.",
            "The delivery fee changed. Review the new total."
          )
        );
      }

      const paymentMethod = document.querySelector(
        'input[name="payment_method"]:checked'
      )?.value;

      if (![
        "multicaixa_express",
        "bank_transfer",
        "cash_on_delivery"
      ].includes(paymentMethod)) {
        throw new Error(
          text("Escolhe o pagamento.", "Choose a payment method.")
        );
      }

      const { data: sessionData, error: sessionError } =
        await client().auth.getSession();

      if (sessionError) throw sessionError;

      const user = sessionData.session?.user || null;

      const coupon = getCoupon();
      const subtotal = subtotalCents() / 100;
      const fee = delivery.feeCents / 100;
      const discount = calculateDiscount(coupon, subtotal);
      const total = Math.max(0, subtotal - discount + fee);

      const value = id => el(id).value.trim();

      const orderData = {
        user_id: user?.id || null,
        customer_name: value("customer-name"),
        customer_email: value("customer-email"),
        customer_phone: value("customer-phone"),
        customer_phone_alt: value("customer-phone-alt") || null,
        province: value("customer-province"),
        city: value("customer-city"),
        neighborhood: value("customer-neighborhood"),
        street: value("customer-street"),
        reference: value("customer-reference") || null,
        notes: value("order-notes") || null,
        payment_method: paymentMethod,
        coupon_id: coupon?.id || null,
        coupon_code: coupon?.code || null,
        coupon_discount: discount,
        subtotal,
        delivery_fee: fee,
        total,
        status: "pending"
      };

      orderWriteStarted = true;

      const { data: order, error: orderError } = await client()
        .from("orders")
        .insert(orderData)
        .select()
        .single();

      if (orderError) throw orderError;

      createdOrderId = order.id;

      const orderItems = cart.map(item => ({
        order_id: order.id,
        product_id: item.id || item.product_id,
        variant_id: item.variant_id || null,
        product_name: item.name || item.name_pt || "Produto",
        variant_name: item.variant_name || null,
        price: Number(item.price),
        quantity: Number(item.quantity),
        total: cents(item.price) * Number(item.quantity) / 100
      }));

      const { error: itemsError } = await client()
        .from("order_items")
        .insert(orderItems);

      if (itemsError) throw itemsError;

      const { error: paymentError } = await client()
        .from("payments")
        .insert({
          order_id: order.id,
          method: paymentMethod,
          amount: total,
          status: paymentMethod === "cash_on_delivery"
            ? "pending"
            : "awaiting_confirmation"
        });

      if (paymentError) throw paymentError;

      if (coupon) {
        await client()
          .from("coupons")
          .update({
            used_count: (Number(coupon.used_count) || 0) + 1
          })
          .eq("id", coupon.id);
      }

      try {
        if (JSON.stringify(getCart()) === originalCart) {
          localStorage.removeItem("loja_mz_cart");
          localStorage.removeItem(COUPON_KEY);
        }
      } catch (storageError) {
        console.warn(
          "[Loja MZ] Pedido guardado; carrinho não foi limpo:",
          storageError
        );
      }

      await window.Swal.fire({
        icon: "success",
        title: text("Pedido criado", "Order created"),
        text: `${text("Pedido", "Order")}: ${
          order.order_number || order.id
        }`,
        confirmButtonText: text("Ver pedido", "View order")
      });

      window.location.assign(
        `pedido.html?id=${encodeURIComponent(order.id)}`
      );

    } catch (error) {
      console.error("[Loja MZ] Checkout:", error);

      const warning = orderWriteStarted
        ? text(
            "A gravação pode ter ficado incompleta. " +
            "Não repitas a compra antes de verificar o pedido com a loja.",
            "Saving may be incomplete. " +
            "Do not repeat the purchase before checking with the store."
          )
        : error.message;

      await window.Swal.fire({
        icon: "error",
        title: text(
          "Não foi possível concluir",
          "Could not complete checkout"
        ),
        text: [
          warning,
          createdOrderId ? `ID: ${createdOrderId}` : "",
          orderWriteStarted ? error.message : ""
        ].filter(Boolean).join("\n")
      });

    } finally {
      submitting = false;
      button.innerHTML = originalText;
      updateSummary();
    }
  }

  async function initialize() {
    if (!el("checkout-form")) return;

    el("place-order-button").disabled = true;

    try {
      cart = getCart();

      if (!cart.length) {
        el("checkout-empty").classList.remove("d-none");
        el("checkout-content").classList.add("d-none");
        return;
      }

      validateCart(cart);

      el("checkout-empty").classList.add("d-none");
      el("checkout-content").classList.remove("d-none");

      renderItems();
      updateSummary();

      el("customer-province").addEventListener(
        "change",
        updateSummary
      );

      el("apply-coupon-button")?.addEventListener(
        "click",
        applyCoupon
      );

      el("coupon-code").addEventListener("input", () => {
        saveCoupon(null);
        el("coupon-message").textContent = "";
        updateSummary();
      });

      el("place-order-button").addEventListener(
        "click",
        placeOrder
      );

      el("checkout-form").addEventListener("submit", event => {
        event.preventDefault();
        placeOrder();
      });

      prefillCustomer();

      try {
        await loadDeliverySettings();
      } catch (error) {
        console.error("[Loja MZ] Entrega:", error);

        deliveryError = text(
          "Não foi possível carregar a entrega. Contacta a loja.",
          "Could not load delivery rates. Contact the store."
        );
      }

      updateSummary();

    } catch (error) {
      console.error("[Loja MZ] Preparação do checkout:", error);

      await window.Swal.fire({
        icon: "error",
        title: text("Erro no carrinho", "Cart error"),
        text: error.message
      });
    }
  }

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
