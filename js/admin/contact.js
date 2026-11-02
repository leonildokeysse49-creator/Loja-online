/* =========================================
   Loja MZ — Contacto
   ========================================= */

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("contact-form").addEventListener("submit", event => {
    event.preventDefault();
    sendContactMessage();
  });
});

async function sendContactMessage() {
  const name = document.getElementById("contact-name").value.trim();
  const email = document.getElementById("contact-email").value.trim();
  const message = document.getElementById("contact-message").value.trim();

  if (!name || !email || !message) {
    Swal.fire({
      icon: "warning",
      title: "Dados incompletos",
      text: "Preencha todos os campos."
    });

    return;
  }

  const whatsappNumber = APP_CONFIG.whatsappNumber;

  const whatsappText = encodeURIComponent(
    `Olá, sou ${name}.\nE-mail: ${email}\n\n${message}`
  );

  window.open(`https://wa.me/${whatsappNumber}?text=${whatsappText}`, "_blank");

  Swal.fire({
    icon: "success",
    title: "Mensagem preparada",
    text: "Estamos a abrir o WhatsApp para enviar a sua mensagem."
  });
}