// Oceanside Appliance logo mark — used by the staff panel sidebar.
// (The public site loads img/logo.svg directly.)
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-logo-icon').forEach(el => {
    const base = el.closest('.admin-body') ? '../' : '';
    el.innerHTML = `<img src="${base}img/logo.svg" alt="" width="40" height="40" />`;
  });
});
