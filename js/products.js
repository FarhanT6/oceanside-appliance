// ── Product Catalog ──
// All products come from Admin Panel → stored in localStorage as 'oa_inventory'
let PRODUCTS = [];

function loadProductsFromStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem('oa_inventory') || '[]');
    PRODUCTS = Array.isArray(saved) ? saved : [];
  } catch(e) {
    PRODUCTS = [];
  }
  if (document.getElementById('productsGrid')) applyFilters();
}

// ── FILTER STATE ──
let currentFilters = { type: '', brand: '', price: '', sort: 'default', condition: '' };

function applyFilters() {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;
  let list = [...PRODUCTS];
  if (currentFilters.type)  list = list.filter(p => p.category === currentFilters.type);
  if (currentFilters.brand) list = list.filter(p => p.brand === currentFilters.brand);
  if (currentFilters.condition === 'new')  list = list.filter(p => (p.condition||'').startsWith('New'));
  if (currentFilters.condition === 'used') list = list.filter(p => !(p.condition||'').startsWith('New'));
  if (currentFilters.price) {
    const [min, max] = currentFilters.price.split('-').map(Number);
    list = list.filter(p => (p.price || 0) >= min && (p.price || 0) <= max);
  }
  if (currentFilters.sort === 'price-asc')  list.sort((a,b) => (a.price||0) - (b.price||0));
  if (currentFilters.sort === 'price-desc') list.sort((a,b) => (b.price||0) - (a.price||0));
  if (currentFilters.sort === 'name-asc')   list.sort((a,b) => (a.name||'').localeCompare(b.name||''));
  list.sort((a,b) => ((a.stock||0) <= 0 ? 1 : 0) - ((b.stock||0) <= 0 ? 1 : 0));
  renderProducts(list);
}

function renderProducts(list) {
  const grid    = document.getElementById('productsGrid');
  const countEl = document.getElementById('resultsCount');
  if (!grid) return;
  grid.innerHTML = '';
  if (countEl) countEl.textContent = `Showing ${list.length} product${list.length !== 1 ? 's' : ''}`;

  if (list.length === 0) {
    grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--gray-mid);padding:3rem">
      No products match your filters.
      <button onclick="resetFilters()" style="background:none;border:none;color:var(--ocean);cursor:pointer;font-weight:600">Clear filters →</button></p>`;
    return;
  }

  list.forEach((p, i) => {
    const stock     = p.stock || 0;
    const price     = p.price || 0;
    const name      = p.name || 'Unnamed Product';
    const brand     = p.brand || '';
    const cat       = p.category || '';
    const catLabel  = cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : 'Appliance';
    const desc      = p.desc || '';
    const icon      = p.icon || '📦';
    const images    = p.imageUrl ? p.imageUrl.split(',').map(u=>u.trim()).filter(Boolean) : [];
    const hasImage  = images.length > 0;
    const stockDot  = stock > 0 ? '' : ' out';
    const stockText = stock > 0 ? 'In Stock' : 'Out of Stock';
    const oldPrice  = p.oldPrice ? `<span class="old-price">$${p.oldPrice.toLocaleString()}</span>` : '';
    const badge     = p.badge ? `<div class="product-badge ${p.badge}">${p.badgeText || ''}</div>` : '';

    const card = document.createElement('div');
    card.className = 'product-card reveal';
    card.style.transitionDelay = `${(i % 4) * 0.07}s`;
    card.innerHTML = `
      ${badge}
      <div class="product-image-wrap" style="${hasImage ? 'padding:0;overflow:hidden;' : ''}">
        ${hasImage
          ? `<img src="${images[0]}" alt="${name}" style="width:100%;height:100%;object-fit:cover;transition:.3s ease" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><span style="display:none;font-size:5rem;width:100%;height:100%;align-items:center;justify-content:center">${icon}</span>`
          : icon}
      </div>
      <div class="product-info">
        <div class="product-category">${brand} · ${catLabel}</div>
        ${p.condition ? `<div style="display:inline-block;margin-bottom:.2rem;padding:.15rem .5rem;border-radius:4px;font-size:.65rem;font-weight:700;letter-spacing:.04em;background:${(p.condition).startsWith('New')?'rgba(39,174,96,.12)':'rgba(52,152,219,.1)'};color:${(p.condition).startsWith('New')?'#27ae60':'#2980b9'}">${p.condition}</div>` : ''}
        <div class="product-name">${name}</div>
        <div class="product-desc">${desc}</div>
        ${!(p.condition||'').startsWith('New') ? `
        <div style="margin-top:.3rem">
          <button onclick="openViewModal('${p.id}',event)" style="padding:.3rem .75rem;background:none;border:1px solid var(--ocean);border-radius:6px;color:var(--ocean);font-family:var(--font-body);font-size:.68rem;font-weight:600;cursor:pointer;transition:all .15s" onmouseover="this.style.background='var(--ocean)';this.style.color='#fff'" onmouseout="this.style.background='none';this.style.color='var(--ocean)'">👀 View In Person</button>
        </div>` : ''}
        <div class="product-footer" style="margin-top:.5rem">
          <div>
            <div class="product-price">$${price.toLocaleString()}
              ${p.msrp && p.msrp > price ? `<span style="font-size:.72rem;color:var(--gray-mid);text-decoration:line-through;margin-left:.35rem">MSRP $${p.msrp.toLocaleString()}</span>` : ''}
            </div>
            ${p.msrp && p.msrp > price ? `<div style="font-size:.68rem;color:#27ae60;font-weight:700">You save $${(p.msrp-price).toLocaleString()}</div>` : ''}
            ${p.refPrice && p.refPrice > price ? `<div style="font-size:.68rem;color:#2980b9;font-weight:700">Beats ${p.refPrice>price?'competitor':'retail'} by $${(p.refPrice-price).toLocaleString()}</div>` : ''}
          </div>
          <button class="btn-add-cart" onclick="addToCart('${p.id}',event)"
            ${stock === 0 ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''}>🛒 Add</button>
        </div>
        <div class="stock-bar" style="margin-top:.4rem">
          <span class="stock-dot${stockDot}"></span>
          <span>${stockText}</span>
        </div>
      </div>`;
    card.addEventListener('click', e => { if (!e.target.closest('.btn-add-cart')) openModal(p.id); });
    grid.appendChild(card);
  });

  setTimeout(() => {
    document.querySelectorAll('.product-card.reveal').forEach(el => {
      if (isInViewport(el)) el.classList.add('visible');
    });
  }, 50);
}

function resetFilters() {
  currentFilters = { type: '', brand: '', price: '', sort: 'default', condition: '' };
  ['filterType','filterBrand','filterPrice','filterSort','filterCondition'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = id === 'filterSort' ? 'default' : '';
  });
  applyFilters();
}

function getProduct(id) { return PRODUCTS.find(p => p.id === id); }

// ── MODAL ──
function openModal(id) {
  const p = getProduct(id); if (!p) return;
  const price    = p.price || 0;
  const name     = p.name || 'Unnamed Product';
  const brand    = p.brand || '';
  const desc     = p.desc || '';
  const icon     = p.icon || '📦';
  const images   = p.imageUrl ? p.imageUrl.split(',').map(u=>u.trim()).filter(Boolean) : [];
  const hasImage = images.length > 0;
  const specs    = Object.entries(p.specs || {}).map(([k,v]) =>
    `<div class="spec-item"><strong>${k}</strong>${v}</div>`).join('');
  const oldPriceHtml = p.oldPrice
    ? `<span style="font-size:1rem;color:var(--gray-mid);text-decoration:line-through;margin-left:.5rem">$${p.oldPrice.toLocaleString()}</span>` : '';

  document.getElementById('modalBody').innerHTML = `
    ${hasImage ? `
    <div style="position:relative;height:220px;border-radius:var(--radius);overflow:hidden;margin-bottom:1.5rem;background:var(--sky)">
      <img id="modal-main-img" src="${images[0]}" alt="${name}" style="width:100%;height:100%;object-fit:cover" onerror="this.src=''"/>
      ${images.length > 1 ? `<div style="display:flex;gap:.35rem;position:absolute;bottom:.5rem;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.4);padding:.3rem .5rem;border-radius:20px">
        ${images.map((img,i)=>`<div onclick="document.getElementById('modal-main-img').src='${img}'" style="width:8px;height:8px;border-radius:50%;background:${i===0?'#fff':'rgba(255,255,255,.4)'};cursor:pointer"></div>`).join('')}
      </div>` : ''}
    </div>
    ${images.length > 1 ? `<div style="display:flex;gap:.5rem;margin-bottom:1rem;overflow-x:auto">
      ${images.map(img=>`<img src="${img}" onclick="document.getElementById('modal-main-img').src='${img}'" style="width:60px;height:60px;object-fit:cover;border-radius:6px;cursor:pointer;border:2px solid var(--gray-light);flex-shrink:0" />`).join('')}
    </div>` : ''}` :
    `<div class="modal-image">${icon}</div>`}
    <div style="color:var(--ocean);font-size:.75rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;margin-bottom:.4rem">${brand} · Model: ${p.model || '—'}</div>
    <div class="modal-name">${name}</div>
    <div class="modal-price">$${price.toLocaleString()}${oldPriceHtml}</div>
    ${p.msrp && p.msrp > price ? `<div style="font-size:.82rem;color:#27ae60;font-weight:600;margin-top:-.5rem;margin-bottom:.5rem">✓ Save $${(p.msrp-price).toLocaleString()} off MSRP ($${p.msrp.toLocaleString()})</div>` : ''}
    ${p.refPrice && p.refPrice > price ? `<div style="font-size:.82rem;color:#2980b9;font-weight:600;margin-top:-.25rem;margin-bottom:.5rem">✓ Beats competitor price of $${p.refPrice.toLocaleString()}</div>` : ''}
    <p class="modal-desc">${desc}</p>
    <div class="modal-specs">${specs}</div>
    <div class="modal-actions">
      <button class="btn-primary" style="flex:1" onclick="addToCart('${p.id}',event);closeModalDirect();"
        ${(p.stock||0)===0?'disabled style="opacity:.5"':''}>🛒 ${(p.stock||0)===0?'Out of Stock':'Add to Cart'}</button>
      ${!(p.condition||'').startsWith('New') ? `<button class="btn-outline" style="flex:1;font-size:.85rem" onclick="closeModalDirect();openViewModal('${p.id}')">👀 View In Person</button>` : `<button class="btn-outline" style="flex:1" onclick="closeModalDirect()">Close</button>`}
    </div>
    <div style="margin-top:1rem;padding:.75rem;background:var(--gray-bg);border-radius:8px;font-size:.78rem;color:var(--gray-mid);text-align:center">
      📍 By appointment only · 1016 S Tremont St, Oceanside
    </div>`;
  document.getElementById('modalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(e)   { if (e.target === document.getElementById('modalOverlay')) closeModalDirect(); }
function closeModalDirect() { document.getElementById('modalOverlay').classList.remove('open'); document.body.style.overflow = ''; }


// ── VIEW IN PERSON ──
function openViewModal(productId, event) {
  if (event) event.stopPropagation();
  const p = getProduct(productId);
  const label = p ? `👀 ${p.name}${p.brand ? ' · ' + p.brand : ''}` : 'Selected Appliance';
  document.getElementById('viewInPersonAppliance').textContent = label;
  document.getElementById('viewInPersonAppliance').dataset.product = productId;
  ['vip-name','vip-phone','vip-email','vip-time'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('vip-error').style.display = 'none';
  document.getElementById('viewInPersonOverlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeViewModal() {
  document.getElementById('viewInPersonOverlay').style.display = 'none';
  document.body.style.overflow = '';
}

function closeViewSuccess() {
  document.getElementById('viewInPersonSuccess').style.display = 'none';
  document.body.style.overflow = '';
}

async function submitViewRequest() {
  const name  = document.getElementById('vip-name').value.trim();
  const phone = document.getElementById('vip-phone').value.trim();
  const email = document.getElementById('vip-email').value.trim();
  const time  = document.getElementById('vip-time').value.trim();
  const productId = document.getElementById('viewInPersonAppliance').dataset.product;
  const p = getProduct(productId);

  const errEl = document.getElementById('vip-error');
  if (!name || !phone) {
    errEl.textContent = 'Name and phone are required.';
    errEl.style.display = 'block';
    return;
  }

  const data = {
    type: 'view_request',
    name, phone, email,
    preferredTime: time,
    appliance: p ? p.name : productId,
    brand: p ? p.brand : '',
    price: p ? p.price : '',
    timestamp: new Date().toISOString()
  };

  // Save to localStorage so admin can see it
  try {
    const existing = JSON.parse(localStorage.getItem('oa_view_requests') || '[]');
    existing.unshift(data);
    localStorage.setItem('oa_view_requests', JSON.stringify(existing));
  } catch(e) {}

  // Fire-and-forget to Sheets
  logToSheets('view_request', data);

  closeViewModal();
  document.getElementById('viewInPersonSuccess').style.display = 'flex';
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  loadProductsFromStorage();
  document.getElementById('filterType')?.addEventListener('change',  e => { currentFilters.type  = e.target.value; applyFilters(); });
  document.getElementById('filterBrand')?.addEventListener('change', e => { currentFilters.brand = e.target.value; applyFilters(); });
  document.getElementById('filterPrice')?.addEventListener('change', e => { currentFilters.price = e.target.value; applyFilters(); });
  document.getElementById('filterSort')?.addEventListener('change',  e => { currentFilters.sort  = e.target.value; applyFilters(); });
  document.getElementById('filterResetBtn')?.addEventListener('click', resetFilters);
  document.getElementById('filterCondition')?.addEventListener('change', e => { currentFilters.condition = e.target.value; applyFilters(); });

  // Auto-refresh if admin updates inventory in another tab
  window.addEventListener('storage', e => {
    if (e.key === 'oa_inventory') loadProductsFromStorage();
  });
});

function scrollToProducts(filter) {
  document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
  setTimeout(() => {
    const el = document.getElementById('filterType');
    if (el) { el.value = filter; currentFilters.type = filter; applyFilters(); }
  }, 600);
}
