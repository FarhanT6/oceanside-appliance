// Oceanside Appliance — site behavior
const SHOP_EMAIL = 'oceansideappliance96@gmail.com';
const SHOP_PHONE = '(760) 754-8200';

document.getElementById('year').textContent = new Date().getFullYear();

// ── Inventory ──
// Edit inventory.json to change what shows on the site. See README.md for the format.
const grid = document.getElementById('inventoryGrid');
let inventory = [];
let activeFilter = 'all';

const PLACEHOLDER_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M5 9.5h14M8 5.5v2M8 12.5v4"/></svg>';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function isNew(item) {
  return String(item.condition || '').toLowerCase().startsWith('new');
}

function renderInventory() {
  const list = inventory.filter(item => {
    if (item.sold) return false;
    if (activeFilter === 'new') return isNew(item);
    if (activeFilter === 'used') return !isNew(item);
    return true;
  });

  if (!list.length) {
    const what = activeFilter === 'all' ? 'appliances' : `${activeFilter} appliances`;
    grid.innerHTML = `
      <div class="empty">
        <h3>Call for today's ${what}</h3>
        <p>Our floor changes every day and the newest arrivals don't always make it online first. Give us a call and we'll tell you what we have.</p>
        <a class="btn btn-primary" href="tel:+17607548200">Call ${SHOP_PHONE}</a>
      </div>`;
    return;
  }

  grid.innerHTML = list.map(item => {
    const conditionTag = isNew(item)
      ? '<span class="tag tag-new">New</span>'
      : `<span class="tag tag-used">${escapeHtml(item.condition || 'Used')}</span>`;
    const img = item.image
      ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" />`
      : PLACEHOLDER_ICON;
    const price = typeof item.price === 'number'
      ? `<strong>$${item.price.toLocaleString()}</strong>`
      : '<span class="call-price">Call for price</span>';
    const subject = encodeURIComponent(`Question about: ${item.name}`);
    return `
      <article class="item">
        <div class="item-img">${img}</div>
        <div class="item-body">
          <div class="item-meta">
            ${conditionTag}
            ${item.category ? `<span class="tag">${escapeHtml(item.category)}</span>` : ''}
          </div>
          <h3>${escapeHtml(item.name)}</h3>
          <div class="item-price">
            ${price}
            <a href="mailto:${SHOP_EMAIL}?subject=${subject}">Ask about it</a>
          </div>
        </div>
      </article>`;
  }).join('');
}

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('is-active'));
    chip.classList.add('is-active');
    activeFilter = chip.dataset.filter;
    renderInventory();
  });
});

fetch('inventory.json', { cache: 'no-cache' })
  .then(res => (res.ok ? res.json() : []))
  .then(data => { inventory = Array.isArray(data) ? data : []; })
  .catch(() => { inventory = []; })
  .finally(renderInventory);

// ── Repair request ──
// No server needed: builds a pre-filled email to the shop in the customer's mail app.
const form = document.getElementById('repairForm');
const status = document.getElementById('formStatus');

form.addEventListener('submit', event => {
  event.preventDefault();
  let firstInvalid = null;
  form.querySelectorAll('[required]').forEach(field => {
    const bad = !field.value.trim();
    field.setAttribute('aria-invalid', bad ? 'true' : 'false');
    if (bad && !firstInvalid) firstInvalid = field;
  });
  if (firstInvalid) {
    status.textContent = 'Please fill in the highlighted fields.';
    status.className = 'form-status is-error';
    firstInvalid.focus();
    return;
  }

  const data = Object.fromEntries(new FormData(form));
  const subject = `Repair request: ${data.appliance}${data.brand ? ` (${data.brand})` : ''}`;
  const body = [
    `Name: ${data.name}`,
    `Phone: ${data.phone}`,
    `Appliance: ${data.appliance}`,
    `Brand: ${data.brand || '-'}`,
    `Address: ${data.address}`,
    '',
    'Problem:',
    data.issue,
  ].join('\n');

  window.location.href =
    `mailto:${SHOP_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  status.textContent = `Your email app should open with the request ready to send. If it doesn't, call us at ${SHOP_PHONE}.`;
  status.className = 'form-status is-ok';
});
