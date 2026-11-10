/* =========================================
   Loja MZ — Módulo partilhado de cupões
   ========================================= */

(function couponsModule() {
  "use strict";

  const STORAGE_KEY = "loja_mz_coupon";

  function client() {
    const instance = window.lojaMzSupabaseClient;

    if (instance && typeof instance.rpc === "function") {
      return instance;
    }

    if (
      typeof supabase !== "undefined" &&
      typeof supabase.rpc === "function"
    ) {
      return supabase;
    }

    throw new Error("O cliente Supabase não está disponível.");
  }

  function getSavedCode() {
    try {
      const saved = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || "null"
      );

      return typeof saved?.code === "string"
        ? saved.code.trim().toUpperCase()
        : "";
    } catch (error) {
      console.warn("[Loja MZ] Código de cupom inválido:", error);
      return "";
    }
  }

  function saveCode(code) {
    try {
      const normalizedCode = String(code || "")
        .trim()
        .toUpperCase();

      if (!normalizedCode) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }

      // Guarda apenas o código, nunca as regras do desconto.
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          code: normalizedCode
        })
      );
    } catch (error) {
      console.warn(
        "[Loja online] Não foi possível guardar o código do cupom:",
        error
      );
    }
  }

  async function validate(code, subtotal) {
    const normalizedCode = String(code || "")
      .trim()
      .toUpperCase();

    const amount = Number(subtotal);

    if (!normalizedCode) {
      throw new Error("Escreve o código do cupom.");
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("O subtotal do carrinho é inválido.");
    }

    const { data, error } = await client().rpc(
      "loja_mz_validate_coupon",
      {
        p_code: normalizedCode,
        p_subtotal: amount
      }
    );

    if (error) {
      throw new Error(
        error.message || "Não foi possível validar o cupom."
      );
    }

    const discount = Number(data?.discount_amount);

    if (
      !data?.id ||
      !data?.code ||
      !Number.isFinite(discount) ||
      discount < 0 ||
      discount > amount
    ) {
      throw new Error(
        "O servidor devolveu uma resposta de cupom inválida."
      );
    }

    return {
      ...data,
      discount_amount: discount
    };
  }

  async function serverTime() {
    const { data, error } = await client().rpc(
      "loja_mz_server_time"
    );

    if (error) {
      throw new Error(
        error.message ||
        "Não foi possível consultar a hora do servidor."
      );
    }

    if (
      typeof data !== "string" ||
      !Number.isFinite(new Date(data).getTime())
    ) {
      throw new Error("O servidor devolveu uma data inválida.");
    }

    return data;
  }

  window.LojaMZCoupons = Object.freeze({
    getSavedCode,
    saveCode,
    validate,
    serverTime
  });
})();
