// ============================================
//   OCEANSIDE APPLIANCE — PRODUCT CATALOG
//   Inventory lives in Google Sheets (managed from the staff panel).
//   We show a cached copy instantly, then refresh from Sheets.
// ============================================

let PRODUCTS = [];
let productsState = 'loading'; // loading | ready | error
const PRODUCTS_CACHE_KEY = 'oa_products_cache';
const PRODUCTS_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

let currentFilters = { type: '', brand: '', price: '', sort: 'default', condition: '', q: '' };

function getProduct(id) { return PRODUCTS.find(p => p.id === id); }
function isNew(p) { return String(p.condition || '').toLowerCase().startsWith('new'); }

function normalizeProduct(p) {
  return {
    ...p,
    id: String(p.id || ''),
    name: String(p.name || 'Appliance'),
    brand: String(p.brand || ''),
    category: String(p.category || 'other').toLowerCase(),
    price: Number(p.price) || 0,
    msrp: Number(p.msrp) || 0,
    refPrice: Number(p.refPrice) || 0,
    stock: Math.max(0, parseInt(p.stock, 10) || 0),
  };
}

function setProducts(list, state) {
  PRODUCTS = (Array.isArray(list) ? list : []).filter(p => p && !p.draft).map(normalizeProduct).filter(p => p.id);
  productsState = state;
  buildBrandOptions();
  renderCategoryChips();
  updateHeroPrices();
  applyFilters();
  if (typeof updateCartUI === 'function') updateCartUI();
  if (state === 'ready') handleDeepLinks();
}

// Links like index.html?product=ID, ?view=ID or #cart (from product & service pages)
let deepLinksHandled = false;
function handleDeepLinks() {
  if (deepLinksHandled) return;
  deepLinksHandled = true;
  const params = new URLSearchParams(location.search);
  const view = params.get('view'), product = params.get('product');
  if (view && getProduct(view)) openViewModal(view);
  else if (product && getProduct(product)) openModal(product);
  else if (location.hash === '#cart' && typeof openCart === 'function') openCart();
  if (view || product || location.hash === '#cart') history.replaceState(null, '', location.pathname + (location.hash === '#cart' ? '' : location.hash));
}

function shareProduct(id) {
  const p = getProduct(id); if (!p) return;
  const url = new URL(`product.html?id=${encodeURIComponent(id)}`, location.href).href;
  if (navigator.share) { navigator.share({ title: p.name, text: `${p.name} — ${money(p.price)}`, url }).catch(() => {}); return; }
  navigator.clipboard?.writeText(url).then(() => showToast('Link copied'), () => prompt('Copy this link:', url));
}

function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(PRODUCTS_CACHE_KEY) || 'null');
    if (c && Array.isArray(c.products) && Date.now() - c.at < PRODUCTS_CACHE_MAX_AGE) return c.products;
  } catch {}
  return null;
}

async function loadProducts() {
  const cached = readCache();
  if (cached && cached.length) setProducts(cached, 'ready');
  else renderSkeletons();

  try {
    const data = await apiGet('products');
    if (!data || !Array.isArray(data.products)) throw new Error('Unexpected response');
    try { localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify({ at: Date.now(), products: data.products })); } catch {}
    setProducts(data.products, 'ready');
  } catch (err) {
    console.warn('Could not load inventory from Google Sheets', err);
    if (!cached || !cached.length) { productsState = 'error'; applyFilters(); }
  }
}

// ── FILTERING ──
function applyFilters() {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;
  if (productsState === 'loading' && !PRODUCTS.length) return renderSkeletons();
  if (productsState === 'error' && !PRODUCTS.length) return renderMessage('error');

  const f = currentFilters;
  const q = f.q.toLowerCase();
  let list = PRODUCTS.filter(p =>
    (!f.type || p.category === f.type) &&
    (!f.brand || p.brand === f.brand) &&
    (f.condition !== 'new' || isNew(p)) &&
    (f.condition !== 'used' || !isNew(p)) &&
    (!q || `${p.name} ${p.brand} ${p.model || ''} ${p.category} ${p.condition || ''}`.toLowerCase().includes(q))
  );
  if (f.price) {
    const [min, max] = f.price.split('-').map(Number);
    list = list.filter(p => p.price >= min && p.price <= max);
  }
  if (f.sort === 'price-asc')  list.sort((a,b) => a.price - b.price);
  if (f.sort === 'price-desc') list.sort((a,b) => b.price - a.price);
  if (f.sort === 'name-asc')   list.sort((a,b) => a.name.localeCompare(b.name));
  // Sold-out items always go last
  list.sort((a,b) => (a.stock <= 0) - (b.stock <= 0));

  updateFilterBadge();
  renderProducts(list);
}

function activeFilterCount() {
  const f = currentFilters;
  return [f.brand, f.price, f.condition, f.sort !== 'default' ? 'x' : ''].filter(Boolean).length;
}
function updateFilterBadge() {
  const b = document.getElementById('filterBadge');
  if (!b) return;
  const n = activeFilterCount();
  b.hidden = !n;
  b.textContent = n;
}

function resetFilters() {
  currentFilters = { type: '', brand: '', price: '', sort: 'default', condition: '', q: '' };
  ['filterBrand','filterPrice','filterCondition'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const sort = document.getElementById('filterSort'); if (sort) sort.value = 'default';
  const search = document.getElementById('searchInput'); if (search) search.value = '';
  renderCategoryChips();
  applyFilters();
}

function setCategory(cat) {
  currentFilters.type = cat;
  renderCategoryChips();
  applyFilters();
}

function renderCategoryChips() {
  const wrap = document.getElementById('categoryChips');
  if (!wrap) return;
  const counts = {};
  PRODUCTS.forEach(p => { if (p.stock > 0) counts[p.category] = (counts[p.category] || 0) + 1; });
  const total = PRODUCTS.filter(p => p.stock > 0).length;
  const cats = CATEGORIES.filter(c => c.id !== 'other' || counts.other);
  const chip = (id, label, count, ic) => `
    <button type="button" class="chip${PRODUCTS.length && !count ? ' empty' : ''}" role="tab" data-cat="${id}" aria-selected="${currentFilters.type === id}">
      ${icon(ic)}${esc(label)}${PRODUCTS.length ? `<span class="count">${count || 0}</span>` : ''}
    </button>`;
  wrap.innerHTML = chip('', 'All', total, 'all') + cats.map(c => chip(c.id, c.label, counts[c.id], c.id)).join('');
}

function buildBrandOptions() {
  const sel = document.getElementById('filterBrand');
  if (!sel) return;
  const brands = [...new Set(PRODUCTS.map(p => p.brand).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  const current = sel.value;
  sel.innerHTML = '<option value="">All brands</option>' + brands.map(b => `<option>${esc(b)}</option>`).join('');
  sel.value = brands.includes(current) ? current : '';
  if (!brands.includes(current)) currentFilters.brand = '';
}

function updateHeroPrices() {
  document.querySelectorAll('[data-from]').forEach(el => {
    const prices = PRODUCTS.filter(p => p.category === el.dataset.from && p.stock > 0 && p.price > 0).map(p => p.price);
    el.textContent = prices.length ? `From ${money(Math.min(...prices))}` : 'Browse';
  });
}

// ── RENDERING ──
function renderSkeletons() {
  const grid = document.getElementById('productsGrid');
  const count = document.getElementById('resultsCount');
  if (count) count.textContent = 'Loading inventory…';
  grid.setAttribute('aria-busy', 'true');
  grid.innerHTML = Array.from({ length: 6 }, () => `
    <div class="product-card skeleton" aria-hidden="true">
      <div class="product-media"></div>
      <div class="product-info">
        <div class="sk" style="width:40%"></div>
        <div class="sk" style="width:80%;height:20px;margin-top:.4rem"></div>
        <div class="sk" style="width:95%;margin-top:.4rem"></div>
        <div class="sk" style="width:30%;height:24px;margin-top:1rem"></div>
      </div>
    </div>`).join('');
}

function renderMessage(kind) {
  const grid = document.getElementById('productsGrid');
  const count = document.getElementById('resultsCount');
  grid.removeAttribute('aria-busy');
  const tel = `<a class="btn-outline" href="tel:+17607548200">${icon('phone')}Call ${BUSINESS_PHONE}</a>`;
  let html;
  if (kind === 'error') {
    if (count) count.textContent = '';
    html = `${icon('refresh')}<h3>We couldn't load our inventory</h3>
      <p>This is usually a temporary connection issue. Try again, or give us a call — we always have more in the store than we can list online.</p>
      <div class="actions"><button type="button" class="btn-primary" id="retryProducts">${icon('refresh')}Try again</button>${tel}</div>`;
  } else if (kind === 'none') {
    html = `${icon('store')}<h3>New inventory coming soon</h3>
      <p>We're updating our online listings. Call or stop by — we have appliances in the store every day.</p>
      <div class="actions">${tel}</div>`;
  } else {
    html = `${icon('search')}<h3>No matches</h3>
      <p>Nothing matches those filters right now. Try clearing them, or call us — we can often find exactly what you need.</p>
      <div class="actions"><button type="button" class="btn-primary" data-reset>Clear filters</button>${tel}</div>`;
  }
  grid.innerHTML = `<div class="grid-message">${html}</div>`;
}

function renderProducts(list) {
  const grid    = document.getElementById('productsGrid');
  const countEl = document.getElementById('resultsCount');
  grid.removeAttribute('aria-busy');

  if (!PRODUCTS.length) { if (countEl) countEl.textContent = ''; return renderMessage('none'); }
  if (countEl) {
    const inStock = list.filter(p => p.stock > 0).length;
    countEl.textContent = `${list.length} appliance${list.length !== 1 ? 's' : ''}${inStock !== list.length ? ` · ${inStock} in stock` : ''}`;
  }
  if (!list.length) return renderMessage('filtered');

  const inCart = id => (typeof cart !== 'undefined' ? cart.find(i => i.id === id)?.qty : 0) || 0;
  grid.innerHTML = list.map((p, i) => {
    const imgs = productImages(p);
    const out = p.stock <= 0;
    const compare = Math.max(p.msrp, p.refPrice, Number(p.oldPrice) || 0);
    const save = compare > p.price ? compare - p.price : 0;
    const catLabel = CATEGORY_SINGULAR[p.category] || 'Appliance';
    const stockClass = out ? ' out' : p.stock <= 2 ? ' low' : '';
    const stockText = out ? 'Sold out' : p.stock <= 2 ? `Only ${p.stock} left` : 'In stock';
    const soldAll = !out && inCart(p.id) >= p.stock;
    return `
    <article class="product-card${out ? ' sold-out' : ''}" data-id="${esc(p.id)}" tabindex="0" style="animation-delay:${Math.min(i, 8) * 40}ms" aria-label="${esc(p.name)}, ${money(p.price)}">
      <div class="product-media">
        ${imgs.length
          ? `<img src="${esc(imgs[0])}" alt="${esc(p.name)}" loading="lazy" decoding="async" data-fallback="${categoryIcon(p.category)}" />`
          : icon(categoryIcon(p.category), 'placeholder-ic')}
        <div class="product-tags">
          ${out ? '<span class="tag out">Sold out</span>' : ''}
          ${p.condition ? `<span class="tag ${isNew(p) ? 'new' : 'used'}">${esc(p.condition)}</span>` : ''}
          ${save && !out ? `<span class="tag save">Save ${money(save)}</span>` : ''}
        </div>
        ${p.stockPhotos && imgs.length ? '<span class="stock-photo-tag">Stock photo</span>' : ''}
      </div>
      <div class="product-info">
        <div class="product-category">${esc([p.brand, catLabel].filter(Boolean).join(' · '))}</div>
        <h3 class="product-name">${esc(p.name)}</h3>
        ${p.desc ? `<p class="product-desc">${esc(p.desc)}</p>` : ''}
        <div class="product-footer">
          <div>
            <div class="product-price">${money(p.price)}${compare > p.price ? `<span class="was">${money(compare)}</span>` : ''}</div>
          </div>
          <div class="product-actions">
            ${!isNew(p) && !out ? `<button type="button" class="btn-view" data-view="${esc(p.id)}" aria-label="Schedule a viewing of ${esc(p.name)}" title="See it in person">${icon('eye')}</button>` : ''}
            <button type="button" class="btn-add-cart" data-add="${esc(p.id)}" ${out || soldAll ? 'disabled' : ''}>${out ? 'Sold out' : soldAll ? 'In cart' : `${icon('plus')}Add`}</button>
          </div>
        </div>
        <div class="stock-bar"><span class="stock-dot${stockClass}"></span><span>${stockText}</span></div>
      </div>
    </article>`;
  }).join('');
}

// ── PRODUCT DETAIL MODAL ──
function openModal(id) {
  const p = getProduct(id); if (!p) return;
  const imgs = productImages(p);
  const out = p.stock <= 0;
  const compare = Math.max(p.msrp, p.refPrice, Number(p.oldPrice) || 0);
  const specs = Object.entries(p.specs && typeof p.specs === 'object' ? p.specs : {});
  if (p.model) specs.unshift(['Model', p.model]);
  if (p.condition) specs.unshift(['Condition', p.condition]);

  document.getElementById('modalBody').innerHTML = `
    <div class="pm-gallery">
      <div class="pm-main">${imgs.length ? `<img id="pmMainImg" src="${esc(imgs[0])}" alt="${esc(p.name)}" data-fallback="${categoryIcon(p.category)}" />` : icon(categoryIcon(p.category), 'placeholder-ic')}</div>
      ${p.stockPhotos && imgs.length ? `<div class="stock-photo-note">${icon('alert')}Stock photo of this model${isNew(p) ? '' : ' — the actual unit is ' + esc(p.condition || 'used') + '. Ask to see it in person.'}</div>` : ''}
      ${imgs.length > 1 ? `<div class="pm-thumbs">${imgs.map((src, i) => `<button type="button" data-src="${esc(src)}" aria-label="Photo ${i + 1}" aria-current="${i === 0}"><img src="${esc(src)}" alt="" loading="lazy" /></button>`).join('')}</div>` : ''}
    </div>
    <div class="pm-info">
      <div class="pm-meta">${esc([p.brand, CATEGORY_SINGULAR[p.category]].filter(Boolean).join(' · '))}</div>
      <h2 class="modal-name" id="modalTitle">${esc(p.name)}</h2>
      <div class="modal-price">${money(p.price)}${compare > p.price ? `<span class="was">${money(compare)}</span>` : ''}</div>
      ${p.msrp > p.price ? `<div class="product-savings">${icon('check')} Save ${money(p.msrp - p.price)} off MSRP</div>` : ''}
      ${p.refPrice > p.price ? `<div class="product-savings">${icon('check')} Beats competitor price of ${money(p.refPrice)}</div>` : ''}
      <div class="stock-bar"><span class="stock-dot${out ? ' out' : p.stock <= 2 ? ' low' : ''}"></span><span>${out ? 'Sold out' : p.stock <= 2 ? `Only ${p.stock} left` : 'In stock and ready'}</span></div>
      ${p.desc ? `<p class="modal-desc">${esc(p.desc)}</p>` : ''}
      ${specs.length ? `<div class="modal-specs">${specs.map(([k, v]) => `<div class="spec-item"><strong>${esc(k)}</strong>${esc(v)}</div>`).join('')}</div>` : ''}
      <div class="modal-actions">
        <button type="button" class="btn-primary" data-add="${esc(p.id)}" data-close-after ${out ? 'disabled' : ''}>${out ? 'Sold out' : `${icon('cart')}Add to cart`}</button>
        ${!isNew(p) && !out ? `<button type="button" class="btn-outline" data-view="${esc(p.id)}">${icon('eye')}See it in person</button>` : ''}
      </div>
      <div class="pp-secondary">
        <a href="product.html?id=${encodeURIComponent(p.id)}">${icon('external')}Full page</a>
        <button type="button" data-share="${esc(p.id)}">${icon('share')}Share</button>
        <a href="tel:+17607548200">${icon('phone')}${BUSINESS_PHONE}</a>
      </div>
      <div class="pm-note">${icon('pin')}1016 S Tremont St, Oceanside</div>
    </div>`;
  Modal.open(document.getElementById('modalOverlay'));
}

function closeModalDirect() { Modal.close(document.getElementById('modalOverlay')); }

// ── VIEW IN PERSON ──
let viewProductId = null;
let viewClientRef = null;

function openViewModal(productId) {
  const p = getProduct(productId);
  viewProductId = productId;
  viewClientRef = newClientRef();
  const imgs = p ? productImages(p) : [];
  document.getElementById('viewProduct').innerHTML = p ? `
    <span class="thumb">${imgs.length ? `<img src="${esc(imgs[0])}" alt="" />` : icon(categoryIcon(p.category))}</span>
    <span><strong>${esc(p.name)}</strong><span>${esc([p.brand, p.condition, money(p.price)].filter(Boolean).join(' · '))}</span></span>` : '';
  const form = document.getElementById('viewForm');
  form.reset();
  form.querySelectorAll('.field-error').forEach(e => e.remove());
  form.querySelectorAll('.invalid').forEach(e => e.classList.remove('invalid'));
  showFormError(document.getElementById('viewError'), '');
  document.getElementById('viewFormContent').hidden = false;
  document.getElementById('viewSuccess').classList.remove('show');
  Modal.open(document.getElementById('viewOverlay'));
}

async function submitViewRequest(e) {
  e.preventDefault();
  const form = e.target;
  const ok = validateFields([
    { el: form.name,  test: required, msg: 'Please enter your name.' },
    { el: form.phone, test: isValidPhone, msg: 'Please enter a 10-digit phone number.' },
    { el: form.email, test: v => !v || isValidEmail(v), msg: 'That email doesn’t look right.' },
  ]);
  if (!ok) return;
  const btn = document.getElementById('viewSubmitBtn');
  const errEl = document.getElementById('viewError');
  showFormError(errEl, '');
  setBusy(btn, true, 'Sending…');
  const p = getProduct(viewProductId);
  const res = await apiPost('view_request', {
    clientRef: viewClientRef,
    productId: viewProductId,
    appliance: p ? p.name : '',
    name: form.name.value.trim(),
    phone: form.phone.value.trim(),
    email: form.email.value.trim(),
    preferredTime: form.preferredTime.value.trim(),
    website: form.website.value,
  });
  setBusy(btn, false);
  if (!res.success) return showFormError(errEl, res.error || 'Something went wrong. Please try again.');
  document.getElementById('viewFormContent').hidden = true;
  const s = document.getElementById('viewSuccess');
  s.classList.add('show');
  s.focus();
}

// ── EVENTS ──
document.addEventListener('DOMContentLoaded', () => {
  loadProducts();

  const bind = (id, key) => document.getElementById(id)?.addEventListener('change', e => { currentFilters[key] = e.target.value; applyFilters(); });
  bind('filterBrand', 'brand');
  bind('filterPrice', 'price');
  bind('filterSort', 'sort');
  bind('filterCondition', 'condition');
  document.getElementById('filterResetBtn')?.addEventListener('click', resetFilters);

  let searchTimer;
  document.getElementById('searchInput')?.addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { currentFilters.q = e.target.value.trim(); applyFilters(); }, 150);
  });

  const toggle = document.getElementById('filterToggle');
  toggle?.addEventListener('click', () => {
    const panel = document.getElementById('filterPanel');
    const open = !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open);
  });

  document.getElementById('categoryChips')?.addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (c) setCategory(c.dataset.cat);
  });

  const grid = document.getElementById('productsGrid');
  grid.addEventListener('click', e => {
    if (e.target.closest('#retryProducts')) { productsState = 'loading'; renderSkeletons(); loadProducts(); return; }
    if (e.target.closest('[data-reset]')) { resetFilters(); return; }
    if (e.target.closest('[data-add], [data-view]')) return; // handled globally below
    const card = e.target.closest('.product-card[data-id]');
    if (card) openModal(card.dataset.id);
  });
  grid.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.product-card[data-id]')) { e.preventDefault(); openModal(e.target.dataset.id); }
  });

  // Add-to-cart / view buttons anywhere (grid + modal)
  document.addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (add && !add.disabled) {
      addToCart(add.dataset.add);
      if (add.hasAttribute('data-close-after')) closeModalDirect();
      return;
    }
    const view = e.target.closest('[data-view]');
    if (view) {
      if (Modal.top()?.id === 'modalOverlay') closeModalDirect();
      openViewModal(view.dataset.view);
    }
    const share = e.target.closest('[data-share]');
    if (share) { shareProduct(share.dataset.share); return; }
    const thumb = e.target.closest('.pm-thumbs button');
    if (thumb) {
      document.getElementById('pmMainImg').src = thumb.dataset.src;
      thumb.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-current', b === thumb));
    }
  });

  document.getElementById('viewForm')?.addEventListener('submit', submitViewRequest);

  // Broken image link in the sheet → show the category icon instead
  document.addEventListener('error', e => {
    const img = e.target;
    if (img.tagName !== 'IMG' || !img.dataset.fallback) return;
    const holder = document.createElement('span');
    holder.innerHTML = icon(img.dataset.fallback, 'placeholder-ic');
    img.replaceWith(holder.firstChild);
  }, true);

  document.querySelectorAll('.hero-cat[data-cat]').forEach(btn => btn.addEventListener('click', () => {
    setCategory(btn.dataset.cat);
    document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
  }));

  // Keep in sync when the staff panel updates inventory in another tab
  window.addEventListener('storage', e => {
    if (e.key === PRODUCTS_CACHE_KEY) { const c = readCache(); if (c) setProducts(c, 'ready'); }
  });
});
