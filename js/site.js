// ============================================
//   OCEANSIDE APPLIANCE — SHARED PAGE BEHAVIOR (product & service pages)
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  const now = new Date().getFullYear();
  document.querySelectorAll('[data-years]').forEach(el => { el.textContent = now - 1996; });
  document.querySelectorAll('[data-year]').forEach(el => { el.textContent = now; });

  const nav = document.getElementById('navbar');
  const onScroll = () => nav?.classList.toggle('scrolled', window.scrollY > 20);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const burger = document.getElementById('hamburger');
  const links = document.getElementById('navLinks');
  const setMenu = open => {
    links?.classList.toggle('open', open);
    burger?.setAttribute('aria-expanded', open);
  };
  burger?.addEventListener('click', () => setMenu(!links.classList.contains('open')));
  document.addEventListener('click', e => { if (!e.target.closest('#navbar')) setMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

  updateCartCount();
  window.addEventListener('storage', e => { if (e.key === 'oa_cart') updateCartCount(); });

  document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
});

function readCart() {
  try { return JSON.parse(localStorage.getItem('oa_cart') || '[]').filter(i => i && i.id && i.qty > 0); } catch { return []; }
}
function writeCart(cart) {
  try { localStorage.setItem('oa_cart', JSON.stringify(cart)); } catch {}
  updateCartCount(true);
}
function updateCartCount(bump) {
  const n = readCart().reduce((s, i) => s + i.qty, 0);
  document.querySelectorAll('#cartCountNav, #cartCountMobile').forEach(el => {
    el.textContent = n;
    if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  });
}
