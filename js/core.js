// ============================================
//   OCEANSIDE APPLIANCE — CORE HELPERS
//   Config, Google Sheets API, formatting, validation, modals, toast
// ============================================

// Deployed Google Apps Script web app (see google-apps-script.js)
const SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwTvfY5mJPha_m8HO5lN944sGKcC9Xobl0YlhiUw2vf2LGON4nO8gHOE-hYTP7hB3qm/exec';
const SALES_TAX_RATE = 0.0825; // Oceanside, CA
const BUSINESS_PHONE = '(760) 754-8200';

const CATEGORIES = [
  { id: 'refrigerator', label: 'Refrigerators' },
  { id: 'washer',       label: 'Washers' },
  { id: 'dryer',        label: 'Dryers' },
  { id: 'dishwasher',   label: 'Dishwashers' },
  { id: 'oven',         label: 'Ovens & Ranges' },
  { id: 'microwave',    label: 'Microwaves' },
  { id: 'freezer',      label: 'Freezers' },
  { id: 'vacuum',       label: 'Vacuums' },
  { id: 'other',        label: 'Other' },
];
const CATEGORY_SINGULAR = { refrigerator: 'Refrigerator', washer: 'Washer', dryer: 'Dryer', dishwasher: 'Dishwasher', oven: 'Oven / Range', microwave: 'Microwave', freezer: 'Freezer', vacuum: 'Vacuum', other: 'Appliance' };

// ── Formatting ──
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function money(n, cents = false) {
  return '$' + (Number(n) || 0).toLocaleString('en-US', cents
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { maximumFractionDigits: 2 });
}
function icon(name, cls = '') {
  return `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}
function categoryIcon(cat) {
  return CATEGORY_SINGULAR[cat] ? cat : 'other';
}
function safeUrl(u) {
  // Only allow http(s) image links from the inventory sheet
  try { const url = new URL(u, location.href); return /^https?:$/.test(url.protocol) ? url.href : ''; }
  catch { return ''; }
}
function productImages(p) {
  return String(p.imageUrl || '').split(/[\s,]+/).filter(Boolean).map(safeUrl).filter(Boolean);
}
function roundCents(n) { return Math.round(n * 100) / 100; }
function newClientRef() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

// ── Google Sheets API ──
async function apiGet(action, { timeout = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${SHEETS_WEBHOOK_URL}?action=${encodeURIComponent(action)}`, { signal: ctrl.signal });
    return await res.json();
  } finally { clearTimeout(t); }
}

// Sends a customer request. Returns the server's JSON when readable.
// If the response can't be read (network hiccup), retries once in no-cors mode —
// the server de-duplicates on clientRef, so this can never create a double order.
async function apiPost(type, payload) {
  const body = JSON.stringify({ type, ...payload });
  try {
    const res = await fetch(SHEETS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body
    });
    return await res.json();
  } catch (err) {
    console.warn('Retrying request without reading the response', err);
    try {
      await fetch(SHEETS_WEBHOOK_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body });
      return { success: true, unconfirmed: true };
    } catch (err2) {
      return { success: false, error: `We couldn't reach our system. Please check your connection or call us at ${BUSINESS_PHONE}.` };
    }
  }
}

// ── Validation ──
function digits(s) { return String(s || '').replace(/\D/g, ''); }
function isValidPhone(s) { const n = digits(s); return n.length === 10 || (n.length === 11 && n[0] === '1'); }
function isValidEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim()); }

function formatPhoneInput(input) {
  input.addEventListener('input', () => {
    const d = digits(input.value).replace(/^1(?=\d{10})/, '').slice(0, 10);
    const atEnd = input.selectionStart === input.value.length;
    let out = d;
    if (d.length > 6) out = `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    else if (d.length > 3) out = `(${d.slice(0,3)}) ${d.slice(3)}`;
    else if (d.length > 0) out = `(${d}`;
    if (atEnd) input.value = out;
  });
}

// rules: [{ el, test: value => bool, msg }]
function validateFields(rules) {
  let firstBad = null;
  rules.forEach(({ el, test, msg }) => {
    const group = el.closest('.form-group') || el.parentElement;
    group.querySelector('.field-error')?.remove();
    group.classList.remove('invalid');
    el.removeAttribute('aria-invalid');
    if (!test(el.value.trim())) {
      group.classList.add('invalid');
      el.setAttribute('aria-invalid', 'true');
      const m = document.createElement('span');
      m.className = 'field-error';
      m.id = (el.id || el.name) + '-err';
      m.textContent = msg;
      el.setAttribute('aria-describedby', m.id);
      group.appendChild(m);
      if (!firstBad) firstBad = el;
      el.addEventListener('input', function clear() {
        group.classList.remove('invalid'); el.removeAttribute('aria-invalid'); m.remove();
        el.removeEventListener('input', clear);
      });
    }
  });
  if (firstBad) firstBad.focus({ preventScroll: false });
  return !firstBad;
}
const required = v => v.length > 0;

function setBusy(btn, busy, label) {
  if (busy) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${esc(label || 'Sending…')}</span>`;
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

function showFormError(el, msg) {
  if (!msg) { el.hidden = true; el.innerHTML = ''; return; }
  el.innerHTML = `${icon('alert')}<span>${esc(msg)}</span>`;
  el.hidden = false;
}

// ── Modals: open/close, Escape key, focus trap, scroll lock ──
const Modal = {
  stack: [],
  open(el, { onClose } = {}) {
    if (this.stack.some(m => m.el === el)) return;
    this.stack.push({ el, onClose, returnFocus: document.activeElement });
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('locked');
    requestAnimationFrame(() => {
      const target = el.querySelector('[autofocus], input:not([type=hidden]):not([tabindex="-1"]), button, [href]');
      target?.focus({ preventScroll: true });
    });
  },
  close(el) {
    const i = this.stack.findIndex(m => m.el === el);
    if (i < 0) return;
    const [m] = this.stack.splice(i, 1);
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
    if (!this.stack.length) document.body.classList.remove('locked');
    m.onClose?.();
    if (m.returnFocus && document.contains(m.returnFocus)) m.returnFocus.focus({ preventScroll: true });
  },
  top() { return this.stack[this.stack.length - 1]?.el; }
};

document.addEventListener('keydown', e => {
  const top = Modal.top();
  if (!top) return;
  if (e.key === 'Escape') { e.preventDefault(); Modal.close(top); return; }
  if (e.key === 'Tab') {
    const f = [...top.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter(x => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

// Click on the dimmed backdrop, or on any [data-close] button, closes that modal
document.addEventListener('click', e => {
  const closeBtn = e.target.closest('[data-close]');
  if (closeBtn) { const m = closeBtn.closest('.modal-overlay, .cart-sidebar'); if (m) Modal.close(m); return; }
  if (e.target.classList?.contains('modal-overlay')) Modal.close(e.target);
});

// ── Toast ──
let toastTimer;
function showToast(msg, { type = 'check', duration = 3000 } = {}) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerHTML = `${icon(type)}<span>${esc(msg)}</span>`;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}
