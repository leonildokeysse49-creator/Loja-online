/* =========================================
   Loja MZ — Gestão de produtos
   ========================================= */

const PRODUCTS_PER_PAGE_ADMIN = 10;

let adminCurrentPage = 1;
let adminProducts = [];

document.addEventListener("DOMContentLoaded", () => {
  const checkAdminLoaded = setInterval(() => {
    if (window.currentAdmin) {
      clearInterval(checkAdminLoaded);
      loadAdminCategories();
      loadAdminProducts();
    }
  }, 200);

  document.getElementById("product-search").addEventListener("input", () => {
    adminCurrentPage = 1;
    loadAdminProducts();
  });

  document.getElementById("product-category-filter").addEventListener("change", () => {
    adminCurrentPage = 1;
    loadAdminProducts();
  });

  document.getElementById("product-status-filter").addEventListener("change", () => {
    adminCurrentPage = 1;
    loadAdminProducts();
  });
});

async function loadAdminCategories() {
  const select = document.getElementById("product-category-filter");

  const { data, error } = await supabase
    .from("categories")
    .select("id, name_pt")
    .order("name_pt", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  select.innerHTML = `
    <option value="">Todas as categorias</option>
    ${data.map(category => `
      <option value="${category.id}">
        ${category.name_pt}
      </option>
    `).join("")}
  `;
}

async function loadAdminProducts() {
  const table = document.getElementById("products-table");
  const pagination = document.getElementById("products-pagination");

  table.innerHTML = `
    <tr>
      <td colspan="6" class="text-center text-muted py-4">
        A carregar produtos...
      </td>
    </tr>
  `;

  pagination.innerHTML = "";

  const search = document.getElementById("product-search").value.trim();
  const categoryId = document.getElementById("product-category-filter").value;
  const statusFilter = document.getElementById("product-status-filter").value;

  let query = supabase
    .from("products")
    .select(`
      id,
      name_pt,
      slug,
      sku,
      price,
      promotional_price,
      stock,
      is_active,
      is_featured,
      categories (
        id,
        name_pt
      ),
      product_images (
        image_url
      )
    `, { count: "exact" })
    .order("created_at", { ascending: false });

  if (search) {
    const term = `%${search}%`;

    query = query.or(`name_pt.ilike.${term},sku.ilike.${term}`);
  }

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  if (statusFilter === "active") {
    query = query.eq("is_active", true);
  }

  if (statusFilter === "inactive") {
    query = query.eq("is_active", false);
  }

  const from = (adminCurrentPage - 1) * PRODUCTS_PER_PAGE_ADMIN;
  const to = from + PRODUCTS_PER_PAGE_ADMIN - 1;

  const { data, error, count } = await query.range(from, to);

  if (error) {
    console.error(error);

    table.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-danger py-4">
          Erro ao carregar produtos.
        </td>
      </tr>
    `;
    return;
  }

  adminProducts = data || [];

  if (adminProducts.length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted py-4">
          Nenhum produto encontrado.
        </td>
      </tr>
    `;
    return;
  }

  table.innerHTML = adminProducts.map(product => {
    const image = product.product_images?.[0]?.image_url;
    const hasPromotion = Boolean(product.promotional_price);
    const finalPrice = hasPromotion ? product.promotional_price : product.price;

    let stockBadge = "badge-stock-ok";
    let stockText = "Disponível";

    if (product.stock === 0) {
      stockBadge = "badge-stock-out";
      stockText = "Esgotado";
    } else if (product.stock <= 5) {
      stockBadge = "badge-stock-low";
      stockText = "Stock baixo";
    }

    return `
      <tr>
        <td>
          <div class="d-flex align-items-center gap-3">
            <img src="${getProductImage(image)}"
              alt="${product.name_pt}"
              class="rounded"
              style="width: 52px; height: 52px; object-fit: cover;">

            <div>
              <strong>${product.name_pt}</strong>
              <small class="d-block text-muted">
                ${product.sku || "Sem SKU"}
              </small>
            </div>
          </div>
        </td>

        <td>${product.categories?.name_pt || "-"}</td>

        <td>
          ${formatMZN(finalPrice)}

          ${hasPromotion ? `
            <small class="d-block text-muted text-decoration-line-through">
              ${formatMZN(product.price)}
            </small>
          ` : ""}
        </td>

        <td>${product.stock}</td>

        <td>
          <span class="badge ${product.is_active ? "bg-success" : "bg-secondary"}">
            ${product.is_active ? "Ativo" : "Inativo"}
          </span>

          <span class="badge ${stockBadge} d-block mt-1">
            ${stockText}
          </span>
        </td>

        <td class="text-end">
          <div class="d-flex justify-content-end gap-2">
            <a href="produto-form.html?id=${product.id}"
              class="btn btn-sm btn-outline-primary"
              title="Editar">
              <i class="bi bi-pencil-square"></i>
            </a>

            <button class="btn btn-sm btn-outline-warning"
              onclick="toggleProductStatus('${product.id}', ${product.is_active})"
              title="${product.is_active ? "Desativar" : "Ativar"}">
              <i class="bi ${product.is_active ? "bi-eye-slash" : "bi-eye"}"></i>
            </button>

            <button class="btn btn-sm btn-outline-danger"
              onclick="deleteProduct('${product.id}', '${product.name_pt}')"
              title="Apagar">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  renderAdminPagination(count || 0);
}

function renderAdminPagination(total) {
  const pagination = document.getElementById("products-pagination");
  const totalPages = Math.ceil(total / PRODUCTS_PER_PAGE_ADMIN);

  if (totalPages <= 1) return;

  let html = `
    <li class="page-item ${adminCurrentPage === 1 ? "disabled" : ""}">
      <button class="page-link" data-page="${adminCurrentPage - 1}">
        <i class="bi bi-chevron-left"></i>
      </button>
    </li>
  `;

  for (let page = 1; page <= totalPages; page++) {
    html += `
      <li class="page-item ${page === adminCurrentPage ? "active" : ""}">
        <button class="page-link" data-page="${page}">
          ${page}
        </button>
      </li>
    `;
  }

  html += `
    <li class="page-item ${adminCurrentPage === totalPages ? "disabled" : ""}">
      <button class="page-link" data-page="${adminCurrentPage + 1}">
        <i class="bi bi-chevron-right"></i>
      </button>
    </li>
  `;

  pagination.innerHTML = html;

  pagination.querySelectorAll("button[data-page]").forEach(button => {
    button.addEventListener("click", () => {
      const page = Number(button.dataset.page);

      if (page >= 1 && page <= totalPages) {
        adminCurrentPage = page;
        loadAdminProducts();
      }
    });
  });
}

async function toggleProductStatus(productId, currentStatus) {
  const { error } = await supabase
    .from("products")
    .update({ is_active: !currentStatus })
    .eq("id", productId);

  if (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível atualizar o estado do produto."
    });

    return;
  }

  Swal.fire({
    icon: "success",
    title: "Estado atualizado",
    timer: 1400,
    showConfirmButton: false
  });

  loadAdminProducts();
}

async function deleteProduct(productId, productName) {
  const result = await Swal.fire({
    title: "Apagar produto",
    text: `Tem certeza de que deseja apagar "${productName}"?`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sim, apagar",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#dc3545"
  });

  if (!result.isConfirmed) return;

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId);

  if (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível apagar o produto."
    });

    return;
  }

  Swal.fire({
    icon: "success",
    title: "Produto apagado",
    timer: 1500,
    showConfirmButton: false
  });

  loadAdminProducts();
}