
/* =========================================
   Loja MZ — Interface partilhada
   ========================================= */

(function initializeSharedUI() {
  "use strict";

  const CART_KEY = "loja_mz_cart";

  function getCart() {
    try {
      const value = JSON.parse(
        localStorage.getItem(CART_KEY) || "[]"
      );

      return Array.isArray(value) ? value : [];
    } catch (error) {
      console.warn("[Loja MZ] Carrinho inválido:", error);
      return [];
    }
  }

  function updateCartCount() {
    const badge = document.getElementById("cart-count");

    if (!badge) return;

    const cart = getCart();

    const total = cart.reduce(
      (sum, item) => sum + (Number(item.quantity) || 0),
      0
    );

    badge.textContent = String(total);
  }

  function updateYear() {
    const year = document.getElementById("year");

    if (year) {
      year.textContent = String(new Date().getFullYear());
    }
  }

  function initializeAnimations() {
    if (
      window.AOS &&
      typeof window.AOS.init === "function"
    ) {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

      window.AOS.init({
        duration: 700,
        once: true,
        disable: reduceMotion
      });
    }
  }

  function initializeSearch() {
    const input = document.getElementById("search-input");
    const button = document.getElementById("search-button");

    if (!input || !button) return;

    function submitSearch() {
      const query = input.value.trim();
      const url = new URL("produtos.html", window.location.href);

      if (query) {
        url.searchParams.set("pesquisa", query);
      }

      window.location.assign(url.href);
    }

    button.addEventListener("click", event => {
      event.preventDefault();
      submitSearch();
    });

    const form = input.closest("form");

    if (form) {
      form.addEventListener("submit", event => {
        event.preventDefault();
        submitSearch();
      });
    }
  }

  function initializeLanguageMenu() {
    document.querySelectorAll("[data-language]").forEach(button => {
      button.addEventListener("click", () => {
        if (typeof setLanguage === "function") {
          setLanguage(button.dataset.language);
        }
      });
    });
  }

  function initializePage() {
    if (typeof applyTranslations === "function") {
      try {
        applyTranslations();
      } catch (error) {
        console.warn(
          "[Loja MZ] Não foi possível aplicar as traduções:",
          error
        );
      }
    }

    updateYear();
    updateCartCount();
    initializeAnimations();
    initializeSearch();
    initializeLanguageMenu();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initializePage,
      { once: true }
    );
  } else {
    initializePage();
  }

  window.addEventListener("storage", event => {
    if (event.key === CART_KEY || event.key === null) {
      updateCartCount();
    }
  });

  window.addEventListener("pageshow", updateCartCount);
})();