
/* =========================================
   Loja — Interface partilhada
   Marca, cartões, idioma e conta
   ========================================= */

(function initializeSharedUI() {
  "use strict";

  if (window.lojaMzUIInitialized) return;
  window.lojaMzUIInitialized = true;

  const CART_KEY = "loja_mz_cart";

  let initialized = false;
  let scheduled = false;
  let observer = null;
  let storeRequest = null;
  let accountRequest = null;

  let accountState = {
    checked: false,
    destination: "login.html"
  };

  let storeName =
    typeof APP_CONFIG !== "undefined"
      ? APP_CONFIG.storeName || "Loja MZ"
      : "Loja MZ";

  const knownStoreNames = new Set(["Loja MZ", storeName]);
  const brandTextNodes = new WeakMap();
  const titleSources = new WeakMap();

  const homeCopy = {
    pt: {
      hero_badge: "Descubra a nossa seleção",
      hero_title:
        "Malas, roupas, telemóveis e acessórios para o seu dia a dia",
      hero_text:
        "Explore as categorias, veja as imagens e escolha os seus " +
        "favoritos, com preços em meticais e entrega nas zonas disponíveis.",
      shop_by_category: "Encontre o que procura",
      home_categories_text:
        "Explore as nossas categorias e descubra os produtos disponíveis para si.",
      featured_products: "Destaques da loja",
      home_featured_text:
        "Veja os produtos em destaque, consulte as imagens e adicione " +
        "os seus favoritos ao carrinho.",
      view_images: "Ver imagens",
      view_products: "Ver produtos →"
    },
    en: {
      hero_badge: "Discover our selection",
      hero_title:
        "Bags, clothing, phones and accessories for everyday life",
      hero_text:
        "Explore our categories, view product images and choose your " +
        "favourites, with prices in meticais and delivery to available areas.",
      shop_by_category: "Find what you are looking for",
      home_categories_text:
        "Explore our categories and discover the products available to you.",
      featured_products: "Store highlights",
      home_featured_text:
        "Explore featured products, view their images and add your " +
        "favourites to the cart.",
      view_images: "View images",
      view_products: "View products →"
    }
  };

  function client() {
    const db = window.lojaMzSupabaseClient;

    if (!db || typeof db.from !== "function") {
      throw new Error("O cliente Supabase não está disponível.");
    }

    return db;
  }

  // As páginas públicas enviadas estão na raiz da loja.
  // Resolve também a raiz a partir do próprio caminho deste script.
  const scriptElement = document.currentScript;

  const storeRoot = scriptElement?.src
    ? new URL("../../", scriptElement.src)
    : new URL("./", window.location.href);

  function pageUrl(path) {
    return new URL(path, storeRoot).href;
  }

  function currentLanguage() {
    try {
      if (typeof getCurrentLanguage === "function") {
        return getCurrentLanguage() === "en" ? "en" : "pt";
      }
    } catch (error) {
      console.warn("[Loja] Idioma:", error);
    }

    return document.documentElement.lang === "en" ? "en" : "pt";
  }

  function setText(node, value) {
    if (node && node.textContent !== value) {
      node.textContent = value;
    }
  }

  function registerTranslations() {
    if (typeof translations === "undefined") return;

    Object.keys(homeCopy).forEach(language => {
      const dictionary = translations[language];
      if (!dictionary) return;

      [
        "home_categories_text",
        "home_featured_text",
        "view_images",
        "view_products"
      ].forEach(key => {
        dictionary[key] = homeCopy[language][key];
      });

      if (document.body.dataset.page === "home") {
        Object.assign(dictionary, homeCopy[language]);
      }
    });
  }

  function applyHomeCopy() {
    const dictionary = homeCopy[currentLanguage()];

    document.querySelectorAll("[data-home-copy]").forEach(node => {
      const value = dictionary[node.dataset.homeCopy];
      if (value) setText(node, value);
    });
  }

  /* =========================================
     Identidade da loja
     ========================================= */

  function applyPageTitle() {
    const title = document.querySelector("title");
    if (!title) return;

    if (document.body.dataset.page === "home") {
      const description = currentLanguage() === "en"
        ? "Bags, clothing, phones and accessories"
        : "Malas, roupas, telemóveis e acessórios";

      setText(title, `${storeName} — ${description}`);
      return;
    }

    const current = title.textContent;
    let record = titleSources.get(title);

    if (!record || current !== record.lastApplied) {
      const matched = Array.from(knownStoreNames).find(
        name => name && current.includes(name)
      );

      if (!matched) return;

      record = {
        original: current,
        matched,
        lastApplied: current
      };

      titleSources.set(title, record);
    }

    const desired = record.original
      .split(record.matched)
      .join(storeName);

    record.lastApplied = desired;
    setText(title, desired);
  }

  function applyStoreName() {
    document.querySelectorAll(
      "[data-store-name], .brand-name, .sidebar-brand span"
    ).forEach(node => setText(node, storeName));

    document.querySelectorAll(".footer-title").forEach(node => {
      if (knownStoreNames.has(node.textContent.trim())) {
        setText(node, storeName);
      }
    });

    document.querySelectorAll(
      ".footer .text-center.small"
    ).forEach(container => {
      Array.from(container.childNodes).forEach(node => {
        if (node.nodeType !== Node.TEXT_NODE) return;

        if (!brandTextNodes.has(node)) {
          const original = node.nodeValue;

          const matched = Array.from(knownStoreNames).find(
            name => name && original.includes(name)
          );

          if (matched) {
            brandTextNodes.set(node, { original, matched });
          }
        }

        const record = brandTextNodes.get(node);
        if (!record) return;

        const desired = record.original
          .split(record.matched)
          .join(storeName);

        if (node.nodeValue !== desired) {
          node.nodeValue = desired;
        }
      });
    });

    applyPageTitle();
  }

  async function loadStoreName() {
    if (storeRequest) return storeRequest;

    storeRequest = (async () => {
      try {
        const { data, error } = await client()
          .from("settings")
          .select("store_name")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (error) throw error;

        const name = typeof data?.store_name === "string"
          ? data.store_name.trim()
          : "";

        if (!name) return;

        knownStoreNames.add(storeName);
        knownStoreNames.add(name);
        storeName = name;

        if (typeof APP_CONFIG !== "undefined") {
          try {
            APP_CONFIG.storeName = name;
          } catch (error) {
            console.warn("[Loja] APP_CONFIG:", error);
          }
        }

        window.lojaMzStoreName = name;

        scheduleRefresh();

        window.dispatchEvent(
          new CustomEvent("store:updated", {
            detail: { storeName: name }
          })
        );
      } catch (error) {
        console.warn("[Loja] Nome da loja:", error);
      }
    })();

    try {
      await storeRequest;
    } finally {
      storeRequest = null;
    }
  }

  /* =========================================
     Conta e sessão
     ========================================= */

  function accountLinks() {
    const links = new Set(
      document.querySelectorAll(
        "a[data-account-link], " +
        'a[data-i18n="my_account"], ' +
        'a[data-i18n-title="my_account"], ' +
        'a[data-i18n-aria-label="my_account"]'
      )
    );

    document.querySelectorAll(
      ".main-navbar a.btn-icon"
    ).forEach(link => {
      if (link.querySelector(".bi-person-circle")) {
        links.add(link);
      }
    });

    return links;
  }

  function updateAccountLinks() {
    accountLinks().forEach(link => {
      link.setAttribute("data-account-link", "");

      const destination = accountState.checked
        ? accountState.destination
        : "login.html";

      const href = pageUrl(destination);

      if (link.href !== href) {
        link.href = href;
      }
    });
  }

  function missingSession(error) {
    return (
      error?.name === "AuthSessionMissingError" ||
      error?.status === 401
    );
  }

  async function resolveAccount() {
    if (accountRequest) return accountRequest;

    accountRequest = (async () => {
      const db = client();

      const {
        data: { user },
        error
      } = await db.auth.getUser();

      if (error && !missingSession(error)) {
        throw error;
      }

      if (!user || missingSession(error)) {
        accountState = {
          checked: true,
          destination: "login.html"
        };

        updateAccountLinks();
        return accountState.destination;
      }

      const {
        data: profile,
        error: profileError
      } = await db
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profile) {
        throw new Error(
          "A sessão existe, mas o perfil da conta não ficou disponível."
        );
      }

      accountState = {
        checked: true,
        destination: profile.role === "admin"
          ? "admin/index.html"
          : "conta.html"
      };

      updateAccountLinks();
      return accountState.destination;
    })();

    try {
      return await accountRequest;
    } finally {
      accountRequest = null;
    }
  }

  function refreshAccount() {
    resolveAccount().catch(error => {
      accountState.checked = false;

      console.warn(
        "[Loja] Não foi possível confirmar a conta. " +
        "Nenhum logout foi executado:",
        error
      );
    });
  }

  function initializeAccountLinks() {
    document.addEventListener("click", async event => {
      if (!(event.target instanceof Element)) return;

      const link = event.target.closest("a[data-account-link]");
      if (!link) return;

      // Mantém os comandos normais de abrir noutra aba.
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      ) {
        return;
      }

      event.preventDefault();

      if (link.dataset.accountBusy === "true") return;

      link.dataset.accountBusy = "true";
      link.setAttribute("aria-busy", "true");

      try {
        const destination = await resolveAccount();
        window.location.assign(pageUrl(destination));
      } catch (error) {
        console.error("[Loja] Acesso à conta:", error);

        const message = currentLanguage() === "en"
          ? "Could not verify your account. Check your connection and try again."
          : "Não foi possível verificar a conta. Verifica a ligação e tenta novamente.";

        if (window.Swal) {
          window.Swal.fire({
            icon: "error",
            title: currentLanguage() === "en"
              ? "Account unavailable"
              : "Não foi possível abrir a conta",
            text: message
          });
        } else {
          window.alert(message);
        }
      } finally {
        delete link.dataset.accountBusy;
        link.removeAttribute("aria-busy");
      }
    });

    try {
      // Não faz consultas async dentro do callback de autenticação.
      client().auth.onAuthStateChange(() => {
        accountState.checked = false;

        window.setTimeout(() => {
          refreshAccount();
        }, 0);
      });
    } catch (error) {
      console.warn("[Loja] Eventos de autenticação:", error);
    }

    updateAccountLinks();
    refreshAccount();
  }

  /* =========================================
     Categorias e produtos
     ========================================= */

  function isDestination(link, filename) {
    try {
      const href = link.getAttribute("href");
      if (!href) return false;

      const url = new URL(href, window.location.href);

      return (
        url.origin === window.location.origin &&
        url.pathname.endsWith("/" + filename)
      );
    } catch (error) {
      return false;
    }
  }

  function enhanceCategories() {
    const grid = document.getElementById("categories-grid");
    if (!grid) return;

    const dictionary = homeCopy[currentLanguage()];
    const cards = new Set();

    grid.querySelectorAll(".category-card").forEach(card => {
      cards.add(card);
    });

    grid.querySelectorAll("a[href]").forEach(link => {
      if (
        !link.matches("[data-home-category-action]") &&
        isDestination(link, "produtos.html")
      ) {
        cards.add(link.closest(".category-card") || link);
      }
    });

    cards.forEach(card => {
      const outer = card.closest("a[href]");

      const destination =
        outer && isDestination(outer, "produtos.html")
          ? outer
          : Array.from(card.querySelectorAll("a[href]")).find(
              link => isDestination(link, "produtos.html")
            );

      if (!destination) return;

      let action = card.querySelector(
        "[data-home-category-action]"
      );

      if (!action) {
        action = document.createElement(outer ? "span" : "a");

        if (!outer) action.href = destination.href;

        action.className = "home-category-action";
        action.setAttribute("data-home-category-action", "");
        card.append(action);
      }

      setText(action, dictionary.view_products);
    });
  }

  function enhanceProductCards() {
    const dictionary = homeCopy[currentLanguage()];

    document.querySelectorAll(
      "#featured-products .product-card, " +
      "#products-grid .product-card, " +
      "#related-products .product-card"
    ).forEach(card => {
      const destination = Array.from(
        card.querySelectorAll("a[href]")
      ).find(link => isDestination(link, "produto.html"));

      const body = card.querySelector(".product-body");
      if (!destination || !body) return;

      let action = body.querySelector(
        "[data-view-images], [data-home-details-link]"
      );

      if (!action) {
        action = Array.from(body.querySelectorAll("a[href]"))
          .find(link =>
            isDestination(link, "produto.html") &&
            /^(Ver detalhes|View details|Ver imagens|View images)$/i
              .test(link.textContent.trim())
          );
      }

      if (!action) {
        action = document.createElement("a");
        action.href = destination.href;

        action.className =
          "btn btn-outline-primary btn-sm w-100 store-images-link";

        const add = body.querySelector("button");

        if (add) {
          add.insertAdjacentElement("beforebegin", action);
        } else {
          body.append(action);
        }
      }

      action.setAttribute("data-view-images", "");
      action.setAttribute("data-i18n", "view_images");

      setText(action, dictionary.view_images);
    });
  }

  /* =========================================
     Atualização visual
     ========================================= */

  function observePage() {
    observer?.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function refreshPage() {
    scheduled = false;
    observer?.disconnect();

    try {
      applyHomeCopy();
      applyStoreName();
      enhanceCategories();
      enhanceProductCards();
      updateAccountLinks();
    } finally {
      observePage();
    }
  }

  function scheduleRefresh() {
    if (scheduled) return;

    scheduled = true;
    queueMicrotask(refreshPage);
  }

  function updateCartCount() {
    const badge = document.getElementById("cart-count");
    if (!badge) return;

    try {
      const cart = JSON.parse(
        localStorage.getItem(CART_KEY) || "[]"
      );

      if (!Array.isArray(cart)) return;

      const total = cart.reduce((sum, item) => {
        const value = Number(item?.quantity);

        return sum + (
          Number.isFinite(value)
            ? Math.max(0, Math.floor(value))
            : 0
        );
      }, 0);

      setText(badge, String(total));
    } catch (error) {
      console.warn("[Loja] Carrinho:", error);
    }
  }

  function initializeSearch() {
    const input = document.getElementById("search-input");
    const button = document.getElementById("search-button");

    if (!input || !button) return;

    function search(event) {
      event.preventDefault();

      const url = new URL("produtos.html", storeRoot);
      const query = input.value.trim();

      if (query) url.searchParams.set("pesquisa", query);

      window.location.assign(url.href);
    }

    button.addEventListener("click", search);
    input.closest("form")?.addEventListener("submit", search);
  }

  function initializeLanguageMenu() {
    document.addEventListener("click", event => {
      if (!(event.target instanceof Element)) return;

      const button = event.target.closest("[data-language]");
      if (!button) return;

      const language = button.dataset.language;

      if (
        ["pt", "en"].includes(language) &&
        typeof setLanguage === "function"
      ) {
        setLanguage(language);
      }
    });
  }

  function initializePage() {
    if (initialized) return;
    initialized = true;

    registerTranslations();

    if (typeof applyTranslations === "function") {
      try {
        applyTranslations();
      } catch (error) {
        console.warn("[Loja] Traduções:", error);
      }
    }

    setText(
      document.getElementById("year"),
      String(new Date().getFullYear())
    );

    updateCartCount();
    initializeSearch();
    initializeLanguageMenu();

    if (window.AOS?.init) {
      window.AOS.init({
        duration: 700,
        once: true,
        disable: window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches
      });
    }

    observer = new MutationObserver(scheduleRefresh);

    refreshPage();
    initializeAccountLinks();
    loadStoreName();
  }

  window.addEventListener("storage", event => {
    if (!event.key || event.key === CART_KEY) {
      updateCartCount();
    }
  });

  window.addEventListener("cart:updated", updateCartCount);

  window.addEventListener("pageshow", event => {
    updateCartCount();

    if (initialized && event.persisted) {
      loadStoreName();
      refreshAccount();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initializePage,
      { once: true }
    );
  } else {
    initializePage();
  }
})();
