/* =========================================
   Loja MZ — Interface partilhada
   ========================================= */

(function initializeSharedUI() {
  "use strict";

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

    if (!input || !button) {
      return;
    }

    function submitSearch() {
      const query = input.value.trim();

      const url = new URL(
        "produtos.html",
        window.location.href
      );

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

  function refreshCartCount() {
    if (typeof updateCartCount !== "function") {
      return;
    }

    try {
      updateCartCount();
    } catch (error) {
      console.warn(
        "[Loja MZ] Não foi possível atualizar o contador do carrinho:",
        error
      );
    }
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
    refreshCartCount();
    initializeAnimations();
    initializeSearch();
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
    if (
      event.key === "loja_mz_cart" ||
      event.key === null
    ) {
      refreshCartCount();
    }
  });

  window.addEventListener("pageshow", refreshCartCount);
})();