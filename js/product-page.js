// ============================================
//   OCEANSIDE APPLIANCE — PRODUCT PAGE + FEATURED GRIDS
//   product.html?id=PROD-123  → full, shareable page for one appliance
//   #featuredGrid              → small grid of in-stock appliances
// ============================================

const BASE = (document.currentScript?.getAttribute('src') || '').replace(/js\/product-page\.js.*$/, '');
let ALL = [];

function isNewCond(p) { return String(p.condition || '').toLowerCase().startsWith('new'); }
function normalize(p) {
  return { ...p, id: String(p.id || ''), name: String(p.name || 'Appliance'), brand: String(p.brand || ''),
    category: String(p.category || 'other').toLowerCase(), price: Number(p.price) || 0,
    msrp: Number(p.msrp) || 0, refPrice: Number(p.refPrice) || 0, stock: Math.max(0, parseInt(p.stock, 10) || 0) };
}
function pageLink(p) { return `${BASE}product.html?id=${encodeURIComponent(p.id)}`; }

async function loadAll() {
  try {
    const c = JSON.parse(localStorage.getItem('oa_products_cache') || 'null');
    if (c && Array.isArray(c.products) && c.products.length) { ALL = c.products.map(normalize); render(); }
  } catch {}
  try {
    const data = await apiGet('products');
    if (!Array.isArray(data?.products)) throw new Error('bad response');
    try { localStorage.setItem('oa_products_cache', JSON.stringify({ at: Date.now(), products: data.products })); } catch {}
    ALL = data.products.map(normalize);
    render();
  } catch (err) {
    console.warn('Could not load inventory', err);
    if (!ALL.length) render(true);
  }
}

function render(failed = false) {
  if (document.getElementById('ppContent')) renderProduct(failed);
  renderFeatured();
}

// ── Cards ──
function cardHtml(p) {
  const img = productImages(p)[0];
  const compare = Math.max(p.msrp, p.refPrice);
  return `<a class="product-card" href="${pageLink(p)}">
    <div class="product-media">
      ${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy" data-fallback="${categoryIcon(p.category)}" />` : icon(categoryIcon(p.category), 'placeholder-ic')}
      <div class="product-tags">${p.condition ? `<span class="tag ${isNewCond(p) ? 'new' : 'used'}">${esc(p.condition)}</span>` : ''}</div>
    </div>
    <div class="product-info">
      <div class="product-category">${esc([p.brand, CATEGORY_SINGULAR[p.category]].filter(Boolean).join(' · '))}</div>
      <h3 class="product-name">${esc(p.name)}</h3>
      <div class="product-footer"><div class="product-price">${money(p.price)}${compare > p.price ? `<span class="was">${money(compare)}</span>` : ''}</div>
      <span class="card-more">View ${icon('arrow-right')}</span></div>
    </div>
  </a>`;
}

function renderFeatured() {
  const grid = document.getElementById('featuredGrid');
  if (!grid) return;
  const limit = Number(grid.dataset.limit) || 8;
  const currentId = new URLSearchParams(location.search).get('id');
  const current = ALL.find(p => p.id === currentId);
  let list = ALL.filter(p => p.stock > 0 && p.id !== currentId);
  if (current) list.sort((a, b) => (b.category === current.category) - (a.category === current.category));
  list = list.slice(0, limit);
  const section = document.getElementById('relatedSection');
  if (section) section.hidden = !list.length;
  grid.innerHTML = list.length ? list.map(cardHtml).join('')
    : `<div class="grid-message">${icon('store')}<h3>New inventory coming soon</h3><p>Call us — we have more in the store than we list online.</p><div class="actions"><a class="btn-outline" href="tel:+17607548200">${icon('phone')}Call ${BUSINESS_PHONE}</a></div></div>`;
}

// ── Product page ──
function setMeta(p) {
  const imgs = productImages(p);
  document.title = `${p.name} — ${money(p.price)} | Oceanside Appliance`;
  const desc = `${p.condition ? p.condition + ' ' : ''}${p.name}${p.brand ? ' by ' + p.brand : ''} for ${money(p.price)} at Oceanside Appliance in Oceanside, CA.${p.desc ? ' ' + p.desc : ''}`.slice(0, 300);
  document.querySelector('meta[name="description"]')?.setAttribute('content', desc);
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', document.title);
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', desc);
  if (imgs[0]) document.querySelector('meta[property="og:image"]')?.setAttribute('content', imgs[0]);
  const canon = document.createElement('link');
  canon.rel = 'canonical'; canon.href = location.href.split('#')[0];
  document.head.appendChild(canon);
  const ld = document.createElement('script');
  ld.type = 'application/ld+json';
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Product', name: p.name,
    ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
    ...(p.model ? { mpn: p.model } : {}),
    ...(imgs.length ? { image: imgs } : {}),
    ...(p.desc ? { description: p.desc } : {}),
    offers: {
      '@type': 'Offer', price: p.price, priceCurrency: 'USD', url: location.href.split('#')[0],
      availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
      itemCondition: isNewCond(p) ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
      seller: { '@type': 'LocalBusiness', name: 'Oceanside Appliance' },
    },
  });
  document.head.appendChild(ld);
}

let metaSet = false;
function renderProduct(failed) {
  const wrap = document.getElementById('ppContent');
  const id = new URLSearchParams(location.search).get('id');
  const p = ALL.find(x => x.id === id);
  if (!p) {
    if (!ALL.length && !failed) return; // still loading
    document.getElementById('crumbName').textContent = 'Not found';
    wrap.innerHTML = `<div class="grid-message">${icon('search')}<h3>${failed ? "We couldn't load this listing" : 'This appliance is no longer listed'}</h3>
      <p>${failed ? 'Please check your connection and try again.' : 'It may have sold. Take a look at what’s in stock now, or give us a call.'}</p>
      <div class="actions"><a class="btn-primary" href="${BASE}index.html#products">Shop appliances</a><a class="btn-outline" href="tel:+17607548200">${icon('phone')}Call ${BUSINESS_PHONE}</a></div></div>`;
    return;
  }
  if (!metaSet) { setMeta(p); metaSet = true; }
  document.getElementById('crumbName').textContent = p.name;
  const imgs = productImages(p);
  const out = p.stock <= 0;
  const compare = Math.max(p.msrp, p.refPrice);
  const specs = Object.entries(p.specs && typeof p.specs === 'object' ? p.specs : {});
  if (p.model) specs.unshift(['Model', p.model]);
  if (p.condition) specs.unshift(['Condition', p.condition]);
  const inCart = readCart().find(i => i.id === p.id)?.qty || 0;

  wrap.innerHTML = `
    <div class="pp-gallery">
      <div class="pp-main">${imgs.length ? `<img id="ppMainImg" src="${esc(imgs[0])}" alt="${esc(p.name)}" data-fallback="${categoryIcon(p.category)}" />` : icon(categoryIcon(p.category), 'placeholder-ic')}
        ${out ? '<span class="tag out pp-sold">Sold</span>' : ''}</div>
      ${imgs.length > 1 ? `<div class="pm-thumbs">${imgs.map((src, i) => `<button type="button" data-src="${esc(src)}" aria-label="Photo ${i + 1}" aria-current="${i === 0}"><img src="${esc(src)}" alt="" loading="lazy" /></button>`).join('')}</div>` : ''}
    </div>
    <div class="pp-info">
      <div class="pm-meta">${esc([p.brand, CATEGORY_SINGULAR[p.category]].filter(Boolean).join(' · '))}</div>
      <h1 class="pp-title">${esc(p.name)}</h1>
      <div class="modal-price">${money(p.price)}${compare > p.price ? `<span class="was">${money(compare)}</span>` : ''}</div>
      ${p.msrp > p.price ? `<div class="product-savings">${icon('check')} Save ${money(p.msrp - p.price)} off MSRP</div>` : ''}
      <div class="stock-bar"><span class="stock-dot${out ? ' out' : p.stock <= 2 ? ' low' : ''}"></span><span>${out ? 'This one has sold' : p.stock <= 2 ? `Only ${p.stock} left` : 'In stock and ready'}</span></div>
      ${p.desc ? `<p class="modal-desc">${esc(p.desc)}</p>` : ''}
      ${specs.length ? `<div class="modal-specs">${specs.map(([k, v]) => `<div class="spec-item"><strong>${esc(k)}</strong>${esc(v)}</div>`).join('')}</div>` : ''}
      <div class="modal-actions">
        ${out ? `<a class="btn-primary" href="${BASE}index.html#products">See what's in stock</a>`
              : inCart ? `<a class="btn-primary" href="${BASE}index.html#cart">${icon('cart')}In your cart — check out</a>`
              : `<button type="button" class="btn-primary" id="ppAdd">${icon('cart')}Reserve — no payment now</button>`}
        ${!out && !isNewCond(p) ? `<a class="btn-outline" href="${BASE}index.html?view=${encodeURIComponent(p.id)}#products">${icon('eye')}See it in person</a>` : ''}
      </div>
      <div class="pp-secondary">
        <a href="tel:+17607548200">${icon('phone')}${BUSINESS_PHONE}</a>
        <button type="button" id="ppShare">${icon('share')}Share</button>
      </div>
      <div class="pm-note">${icon('pin')}1016 S Tremont St, Oceanside · Pickup, or delivery &amp; install available</div>
    </div>`;

  document.getElementById('ppAdd')?.addEventListener('click', () => {
    const cart = readCart();
    const item = cart.find(i => i.id === p.id);
    if (item) { if (item.qty < p.stock) item.qty++; } else cart.push({ id: p.id, qty: 1 });
    writeCart(cart);
    showToast(`${p.name} added to cart`, { type: 'cart' });
    renderProduct();
  });
  document.getElementById('ppShare')?.addEventListener('click', async () => {
    const url = location.href.split('#')[0];
    if (navigator.share) { try { await navigator.share({ title: p.name, text: `${p.name} — ${money(p.price)}`, url }); return; } catch { /* cancelled */ } }
    try { await navigator.clipboard.writeText(url); showToast('Link copied'); } catch { prompt('Copy this link:', url); }
  });
  wrap.querySelectorAll('.pm-thumbs button').forEach(b => b.addEventListener('click', () => {
    document.getElementById('ppMainImg').src = b.dataset.src;
    wrap.querySelectorAll('.pm-thumbs button').forEach(x => x.setAttribute('aria-current', x === b));
  }));
}

document.addEventListener('error', e => {
  const img = e.target;
  if (img.tagName !== 'IMG' || !img.dataset.fallback) return;
  const holder = document.createElement('span');
  holder.innerHTML = icon(img.dataset.fallback, 'placeholder-ic');
  img.replaceWith(holder.firstChild);
}, true);

document.addEventListener('DOMContentLoaded', loadAll);
