/* =========================================
   Loja MZ — Inicialização do Supabase

   Ordem necessária no HTML:
   1. Biblioteca Supabase JS por CDN
   2. assets/js/config.js
   3. assets/js/supabase.js
   4. Restantes scripts da aplicação
   ========================================= */

(function initializeSupabase() {
  "use strict";

  // Evita criar outro cliente se este ficheiro
  // for carregado novamente na mesma página.
  if (
    window.lojaMzSupabaseClient &&
    typeof window.lojaMzSupabaseClient.from === "function"
  ) {
    window.supabase = window.lojaMzSupabaseClient;
    return;
  }

  // Preserva a biblioteca original antes de colocar
  // o cliente em window.supabase.
  const sdk = window.lojaMzSupabaseSDK || window.supabase;

  if (!sdk || typeof sdk.createClient !== "function") {
    console.error(
      "[Loja MZ] Biblioteca Supabase indisponível. " +
      "Verifica se o script CDN é carregado antes deste ficheiro."
    );

    return;
  }

  window.lojaMzSupabaseSDK = sdk;

  if (
    typeof SUPABASE_URL === "undefined" ||
    typeof SUPABASE_ANON_KEY === "undefined"
  ) {
    console.error(
      "[Loja MZ] Configuração não encontrada. " +
      "Carrega assets/js/config.js antes de assets/js/supabase.js."
    );

    return;
  }

  const projectUrl = String(SUPABASE_URL).trim();
  const publicKey = String(SUPABASE_ANON_KEY).trim();

  if (
    !projectUrl ||
    !publicKey ||
    projectUrl.includes("SEU-PROJETO") ||
    publicKey.startsWith("SUA_CHAVE")
  ) {
    console.error(
      "[Loja MZ] Preenche a URL e a chave pública " +
      "do Supabase em assets/js/config.js."
    );

    return;
  }

  if (publicKey.startsWith("sb_secret_")) {
    console.error(
      "[Loja MZ] Foi detetada uma chave secreta. " +
      "Remove-a do frontend e usa a Publishable key."
    );

    return;
  }

  try {
    const url = new URL(projectUrl);

    if (!["https:", "http:"].includes(url.protocol)) {
      throw new Error("A URL deve usar HTTP ou HTTPS.");
    }

    const client = sdk.createClient(projectUrl, publicKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });

    window.lojaMzSupabaseClient = client;

    // Compatibilidade com os ficheiros existentes:
    // supabase.from(...)
    // supabase.auth.getUser(...)
    window.supabase = client;

    console.info(
      "[Loja MZ] Cliente Supabase inicializado. " +
      "A ligação aos dados será verificada nas consultas."
    );
  } catch (error) {
    console.error(
      "[Loja MZ] Não foi possível inicializar o Supabase:",
      error
    );
  }
})();