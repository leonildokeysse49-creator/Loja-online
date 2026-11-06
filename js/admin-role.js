/* =========================================
   Loja MZ — Permissões do painel
   ========================================= */

(function adminRolePage() {
  "use strict";

  function getClient() {
    const client = window.lojaMzSupabaseClient;

    if (!client || typeof client.from !== "function") {
      throw new Error(
        "O cliente Supabase não está disponível."
      );
    }

    return client;
  }

  async function applyRolePermissions() {
    try {
      const client = getClient();

      const {
        data: { user },
        error
      } = await client.auth.getUser();

      if (error) throw error;

      if (!user) {
        window.location.replace("../login.html");
        return;
      }

      const { data: profile, error: profileError } =
        await client
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

      if (profileError) throw profileError;

      const role = profile?.role;

      if (role !== "admin" && role !== "vendedor") {
        window.location.replace("../conta.html");
        return;
      }

      if (role === "vendedor") {
        document
          .querySelectorAll(".admin-only")
          .forEach(item => {
            item.classList.add("d-none");
          });
      }
    } catch (error) {
      console.error(
        "[Loja MZ] Erro nas permissões do painel:",
        error
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      applyRolePermissions,
      { once: true }
    );
  } else {
    applyRolePermissions();
  }
})();
