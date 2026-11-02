/* =========================================
   Loja MZ — Gestão de avaliações
   ========================================= */

const REVIEWS_PER_PAGE_ADMIN = 10;

let reviewsCurrentPage = 1;
let editingReviewId = null;
let reviewModal = null;

document.addEventListener("DOMContentLoaded", () => {
  const checkAdminLoaded = setInterval(() => {
    if (window.currentAdmin) {
      clearInterval(checkAdminLoaded);
      loadAdminReviews();
    }
  }, 200);

  const modalElement = document.getElementById("review-modal");

  if (modalElement) {
    reviewModal = new bootstrap.Modal(modalElement);
  }

  document.getElementById("review-search").addEventListener("input", () => {
    reviewsCurrentPage = 1;
    loadAdminReviews();
  });

  document.getElementById("review-status-filter").addEventListener("change", () => {
    reviewsCurrentPage = 1;
    loadAdminReviews();
  });

  document.getElementById("review-rating-filter").addEventListener("change", () => {
    reviewsCurrentPage = 1;
    loadAdminReviews();
  });

  document.getElementById("review-sort").addEventListener("change", () => {
    reviewsCurrentPage = 1;
    loadAdminReviews();
  });

  document.getElementById("save-review-button").addEventListener("click", () => {
    saveReview();
  });
});

function getStars(rating) {
  let stars = "";

  for (let index = 1; index <= 5; index++) {
    stars += index <= rating
      ? `<i class="bi bi-star-fill text-warning"></i>`
      : `<i class="bi bi-star text-muted"></i>`;
  }

  return stars;
}

async function loadAdminReviews() {
  const table = document.getElementById("reviews-table");
  const pagination = document.getElementById("reviews-pagination");

  table.innerHTML = `
    <tr>
      <td colspan="7" class="text-center text-muted py-4">
        A carregar avaliações...
      </td>
    </tr>
  `;

  pagination.innerHTML = "";

  const search = document.getElementById("review-search").value.trim();
  const statusFilter = document.getElementById("review-status-filter").value;
  const ratingFilter = document.getElementById("review-rating-filter").value;
  const sort = document.getElementById("review-sort").value;

  let query = supabase
    .from("reviews")
    .select(`
      id,
      rating,
      comment,
      is_approved,
      created_at,
      products (
        id,
        name_pt
      ),
      profiles (
        id,
        full_name
      )
    `, { count: "exact" });

  if (search) {
    const term = `%${search}%`;

    query = query.or(
      `comment.ilike.${term},products.name_pt.ilike.${term}`
    );
  }

  if (statusFilter === "approved") {
    query = query.eq("is_approved", true);
  }

  if (statusFilter === "pending") {
    query = query.eq("is_approved", false);
  }

  if (ratingFilter) {
    query = query.eq("rating", Number(ratingFilter));
  }

  if (sort === "rating_desc") {
    query = query.order("rating", { ascending: false });
  } else if (sort === "rating_asc") {
    query = query.order("rating", { ascending: true });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const from = (reviewsCurrentPage - 1) * REVIEWS_PER_PAGE_ADMIN;
  const to = from + REVIEWS_PER_PAGE_ADMIN - 1;

  const { data, error, count } = await query.range(from, to);

  if (error) {
    console.error(error);

    table.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-danger py-4">
          Erro ao carregar avaliações.
        </td>
      </tr>
    `;
    return;
  }

  if (!data || data.length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4">
          Nenhuma avaliação encontrada.
        </td>
      </tr>
    `;
    return;
  }

  table.innerHTML = data.map(review => `
    <tr>
      <td>${review.products?.name_pt || "-"}</td>

      <td>${review.profiles?.full_name || "Cliente"}</td>

      <td>${getStars(review.rating)}</td>

      <td>
        <span class="d-inline-block text-truncate review-comment">
          ${review.comment || "Sem comentário"}
        </span>
      </td>

      <td>
        <span class="badge ${review.is_approved ? "bg-success" : "bg-warning text-dark"}">
          ${review.is_approved ? "Aprovada" : "Pendente"}
        </span>
      </td>

      <td>
        ${new Date(review.created_at).toLocaleDateString("pt-MZ")}
      </td>

      <td class="text-end">
        <div class="d-flex justify-content-end gap-2">
          <button class="btn btn-sm btn-outline-primary"
            onclick="openEditReviewModal('${review.id}')">
            <i class="bi bi-pencil-square"></i>
          </button>

          <button class="btn btn-sm btn-outline-success"
            onclick="approveReview('${review.id}')"
            ${review.is_approved ? "disabled" : ""}>
            <i class="bi bi-check2"></i>
          </button>

          <button class="btn btn-sm btn-outline-danger"
            onclick="deleteReview('${review.id}')">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join("");

  renderReviewsPagination(count || 0);
}

function renderReviewsPagination(total) {
  const pagination = document.getElementById("reviews-pagination");
  const totalPages = Math.ceil(total / REVIEWS_PER_PAGE_ADMIN);

  if (totalPages <= 1) return;

  let html = `
    <li class="page-item ${reviewsCurrentPage === 1 ? "disabled" : ""}">
      <button class="page-link" data-page="${reviewsCurrentPage - 1}">
        <i class="bi bi-chevron-left"></i>
      </button>
    </li>
  `;

  for (let page = 1; page <= totalPages; page++) {
    html += `
      <li class="page-item ${page === reviewsCurrentPage ? "active" : ""}">
        <button class="page-link" data-page="${page}">
          ${page}
        </button>
      </li>
    `;
  }

  html += `
    <li class="page-item ${reviewsCurrentPage === totalPages ? "disabled" : ""}">
      <button class="page-link" data-page="${reviewsCurrentPage + 1}">
        <i class="bi bi-chevron-right"></i>
      </button>
    </li>
  `;

  pagination.innerHTML = html;

  pagination.querySelectorAll("button[data-page]").forEach(button => {
    button.addEventListener("click", () => {
      const page = Number(button.dataset.page);

      if (page >= 1 && page <= totalPages) {
        reviewsCurrentPage = page;
        loadAdminReviews();
      }
    });
  });
}

async function openEditReviewModal(reviewId) {
  editingReviewId = reviewId;

  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("id", reviewId)
    .maybeSingle();

  if (error || !data) {
    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível carregar a avaliação."
    });

    return;
  }

  document.getElementById("review-rating-input").value = data.rating;
  document.getElementById("review-comment-input").value = data.comment || "";
  document.getElementById("review-approved-input").checked = Boolean(data.is_approved);

  reviewModal.show();
}

async function saveReview() {
  if (!editingReviewId) return;

  const reviewData = {
    rating: Number(document.getElementById("review-rating-input").value),
    comment: document.getElementById("review-comment-input").value.trim() || null,
    is_approved: document.getElementById("review-approved-input").checked
  };

  const button = document.getElementById("save-review-button");
  const originalText = button.innerHTML;

  button.disabled = true;
  button.innerHTML = `
    <span class="spinner-border spinner-border-sm me-2"></span>
    A guardar...
  `;

  try {
    const { error } = await supabase
      .from("reviews")
      .update(reviewData)
      .eq("id", editingReviewId);

    if (error) throw error;

    reviewModal.hide();

    Swal.fire({
      icon: "success",
      title: "Avaliação atualizada",
      timer: 1500,
      showConfirmButton: false
    });

    loadAdminReviews();

  } catch (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível atualizar a avaliação."
    });

  } finally {
    button.disabled = false;
    button.innerHTML = originalText;
  }
}

async function approveReview(reviewId) {
  const { error } = await supabase
    .from("reviews")
    .update({ is_approved: true })
    .eq("id", reviewId);

  if (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível aprovar a avaliação."
    });

    return;
  }

  Swal.fire({
    icon: "success",
    title: "Avaliação aprovada",
    timer: 1500,
    showConfirmButton: false
  });

  loadAdminReviews();
}

async function deleteReview(reviewId) {
  const result = await Swal.fire({
    title: "Apagar avaliação",
    text: "Tem certeza de que deseja apagar esta avaliação?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sim, apagar",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#dc3545"
  });

  if (!result.isConfirmed) return;

  const { error } = await supabase
    .from("reviews")
    .delete()
    .eq("id", reviewId);

  if (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Não foi possível apagar a avaliação."
    });

    return;
  }

  Swal.fire({
    icon: "success",
    title: "Avaliação apagada",
    timer: 1500,
    showConfirmButton: false
  });

  loadAdminReviews();
}