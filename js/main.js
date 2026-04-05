
// ── Paste your deployed Apps Script URL here ──
const SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwTvfY5mJPha_m8HO5lN944sGKcC9Xobl0YlhiUw2vf2LGON4nO8gHOE-hYTP7hB3qm/exec';

async function logToSheets(type, data) {
  if (!SHEETS_WEBHOOK_URL || SHEETS_WEBHOOK_URL === 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE') {
    console.log('[Sheets Mock]', type, data); return;
  }
  try {
    // Must use text/plain with no-cors — JSON content-type triggers preflight which Google blocks
    await fetch(SHEETS_WEBHOOK_URL, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ type, ...data })
    });
  } catch (e) { console.error('Sheets error:', e); }
}

// ── Scroll reveal ──
function isInViewport(el) {
  const r = el.getBoundingClientRect();
  return r.top < window.innerHeight - 80 && r.bottom > 0;
}
function handleReveal() {
  document.querySelectorAll('.reveal').forEach(el => {
    if (isInViewport(el)) el.classList.add('visible');
  });
}
window.addEventListener('scroll', handleReveal, { passive: true });
window.addEventListener('resize', handleReveal, { passive: true });
document.addEventListener('DOMContentLoaded', () => setTimeout(handleReveal, 100));

// ── Navbar shrink on scroll ──
window.addEventListener('scroll', () => {
  const nav = document.getElementById('navbar');
  if (!nav) return;
  nav.style.height     = window.scrollY > 60 ? '60px' : '72px';
  nav.style.boxShadow  = window.scrollY > 60 ? '0 4px 20px rgba(26,111,193,0.1)' : '';
}, { passive: true });

// ── Mobile hamburger ──
document.addEventListener('DOMContentLoaded', () => {
  // Load products from admin-managed inventory
  if (typeof loadProductsFromStorage === 'function') loadProductsFromStorage();
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.querySelector('.nav-links');
  if (!hamburger) return;
  hamburger.addEventListener('click', () => {
    const open = navLinks.style.display === 'flex';
    Object.assign(navLinks.style, {
      display:     open ? 'none' : 'flex',
      position:    'absolute', top: '72px', left: '0', right: '0',
      background:  'rgba(255,255,255,0.98)', flexDirection: 'column',
      padding:     '1rem 2rem 2rem', gap: '1rem',
      borderBottom:'1px solid var(--gray-light)', boxShadow: 'var(--shadow-md)'
    });
  });
});

// ── Toast ──
let toastTimer;
function showToast(msg, duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = msg; toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ── Repair form — saves to localStorage AND Google Sheets ──
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('repairForm');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn    = document.getElementById('repairSubmitBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Submitting…';

    const data = Object.fromEntries(new FormData(form).entries());
    data.timestamp = new Date().toISOString();
    data.ticketId  = 'TKT-' + Date.now();
    data.status    = 'New';

    // ── SAVE TO LOCALSTORAGE so admin panel sees it immediately ──
    const repairs = getStore('repairs');
    repairs.unshift(data);
    setStore('repairs', repairs);

    // ── SYNC TO GOOGLE SHEETS ──
    logToSheets('repair_request', data); // fire-and-forget — don't block form reset

    setTimeout(() => {
      document.getElementById('repairFormContent').style.display = 'none';
      document.getElementById('repairSuccess').classList.add('show');
    }, 600);
  });
});

function resetRepairForm() {
  document.getElementById('repairForm').reset();
  document.getElementById('repairFormContent').style.display = '';
  document.getElementById('repairSuccess').classList.remove('show');
  const btn = document.getElementById('repairSubmitBtn');
  btn.disabled = false;
  btn.textContent = '📩 Submit Repair Request';
}

// ── Smooth scroll for anchor links ──
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target && a.getAttribute('href') !== '#') {
        e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
});

// ── Try to load products from Google Sheets (two-way sync) ──
// If sheets URL is set, fetch the product catalog from sheets on page load.
// Falls back to hardcoded products.js if unavailable.
async function tryLoadProductsFromSheets() {
  if (!SHEETS_WEBHOOK_URL || SHEETS_WEBHOOK_URL === 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE') return;
  try {
    const res  = await fetch(SHEETS_WEBHOOK_URL + '?action=getProducts');
    const data = await res.json();
    if (data && Array.isArray(data.products) && data.products.length > 0) {
      // Merge sheet products with hardcoded — sheet takes priority for stock
      data.products.forEach(sheetProduct => {
        const local = PRODUCTS.find(p => p.id === sheetProduct.id);
        if (local) {
          local.stock       = sheetProduct.stock;
          local.stockStatus = sheetProduct.stock <= 0 ? 'out' : 'in-stock';
          local.price       = sheetProduct.price || local.price;
        } else if (sheetProduct.id) {
          // New product added via sheets or admin
          PRODUCTS.push(sheetProduct);
        }
      });
      applyFilters();
    }
  } catch (e) {
    console.log('Sheets product sync skipped (offline or not configured)');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(tryLoadProductsFromSheets, 500);
});
