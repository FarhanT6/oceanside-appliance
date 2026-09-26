// ============================================
//   OCEANSIDE APPLIANCE — ADMIN TOOLS
//   Product editor + photo upload, marketplace listings, record sale,
//   order & repair detail views
// ============================================

const SITE_URL = new URL('../', location.href).href; // works on github.io and on a custom domain
const TAX_RATE = 0.0825;
const CONDITIONS = ['New', 'New (Open Box)', 'Used - Excellent', 'Used - Good', 'Used - Fair', 'For Parts'];
const CATEGORY_OPTIONS = [
  ['refrigerator', 'Refrigerator'], ['washer', 'Washer'], ['dryer', 'Dryer'], ['dishwasher', 'Dishwasher'],
  ['oven', 'Oven / Range'], ['microwave', 'Microwave'], ['freezer', 'Freezer'], ['vacuum', 'Vacuum'], ['other', 'Other'],
];
const SALE_CHANNELS = ['In store', 'OfferUp', 'Facebook Marketplace', 'Craigslist', 'Other'];

function productUrl(id) { return `${SITE_URL}product.html?id=${encodeURIComponent(id)}`; }
function imagesOf(p) { return String(p?.imageUrl || '').split(/[\s,]+/).filter(Boolean); }
function money2(n) { return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function todayInput() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d)) return '';
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
function options(list, current) {
  return list.map(o => {
    const [value, label] = Array.isArray(o) ? o : [o, o];
    return `<option value="${esc(value)}" ${String(current) === String(value) ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');
}

async function copyText(text, label = 'Copied') {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const t = document.createElement('textarea');
    t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
  }
  showAdminToast(`✅ ${label}`);
}

// ─── Generic modal ───
function openAdminModal({ title, body, footer = '', size = '', dismissable = true, onClose }) {
  const ov = document.createElement('div');
  ov.className = 'am-overlay';
  ov.innerHTML = `
    <div class="am-modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="am-head"><div class="am-title">${title}</div><button type="button" class="am-x" data-am-close aria-label="Close">${ic('x')}</button></div>
      <div class="am-body">${body}</div>
      ${footer ? `<div class="am-foot">${footer}</div>` : ''}
    </div>`;
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => ov.classList.add('open'));
  const onKey = e => { if (e.key === 'Escape' && [...document.querySelectorAll('.am-overlay')].pop() === ov) close(); };
  function close() {
    ov.remove();
    document.removeEventListener('keydown', onKey);
    if (!document.querySelector('.am-overlay')) document.body.style.overflow = '';
    onClose?.();
  }
  ov.addEventListener('click', e => {
    if (e.target.closest('[data-am-close]') || (dismissable && e.target === ov)) close();
  });
  document.addEventListener('keydown', onKey);
  ov.close = close;
  ov.$ = sel => ov.querySelector(sel);
  setTimeout(() => ov.querySelector('input:not([type=hidden]):not([type=file]), select, textarea')?.focus(), 50);
  return ov;
}

// ─── Photo upload (resized in the browser, stored in Google Drive) ───
async function resizeToJpegBase64(file, max = 1600, quality = 0.82) {
  let src, w, h;
  try {
    src = await createImageBitmap(file, { imageOrientation: 'from-image' });
    w = src.width; h = src.height;
  } catch {
    src = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('This photo format isn’t supported by your browser. Try a JPG or PNG.'));
      img.src = URL.createObjectURL(file);
    });
    w = src.naturalWidth; h = src.naturalHeight;
  }
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality).split(',')[1];
}

async function uploadPhoto(file) {
  const data = await resizeToJpegBase64(file);
  const res = await apiPost('admin_upload_image', {
    data, mimeType: 'image/jpeg',
    filename: (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg',
  });
  return res.url;
}

// ─── Product editor (add + edit) ───
function openProductEditor(id) {
  const existing = id ? getStore('inventory').find(p => p.id === id) : null;
  const p = existing || { condition: 'Used - Good', stock: 1, category: '' };
  let photos = imagesOf(p);
  let uploading = 0;
  const specsText = Object.entries(p.specs && typeof p.specs === 'object' ? p.specs : {}).map(([k, v]) => `${k}: ${v}`).join('\n');

  const m = openAdminModal({
    title: existing ? 'Edit product' : 'Add product',
    size: 'wide',
    dismissable: false,
    body: `
      <div class="pe-layout">
        <div class="pe-photos">
          <div class="af-label">Photos <span class="hint">First photo is the cover</span></div>
          <div class="photo-grid" id="peGrid"></div>
          <label class="upload-btn">
            ${ic('camera')}<span>Take or choose photos</span>
            <input type="file" id="peFiles" accept="image/*" multiple hidden />
          </label>
          <div class="upload-status" id="peStatus" hidden></div>
          <button type="button" class="ai-btn" id="peAI">${ic('sparkles')}<span>Fill in details from photos</span></button>
          <div class="ai-note" id="peAINote" hidden></div>
          <div class="link-add">
            <input type="url" id="peLink" placeholder="…or paste an image link" />
            <button type="button" class="card-btn small" id="peLinkAdd">Add</button>
          </div>
        </div>
        <div class="af-grid">
          <label class="af span2"><span class="af-label">Product name *</span><input id="pe-name" value="${esc(p.name)}" placeholder="e.g. Samsung 28 cu ft French Door Refrigerator" /></label>
          <label class="af"><span class="af-label">Brand *</span><input id="pe-brand" value="${esc(p.brand)}" placeholder="e.g. Samsung" /></label>
          <label class="af"><span class="af-label">Category *</span><select id="pe-category"><option value="">Select…</option>${options(CATEGORY_OPTIONS, p.category)}</select></label>
          <label class="af"><span class="af-label">Condition *</span><select id="pe-condition">${options(CONDITIONS, p.condition)}</select></label>
          <label class="af"><span class="af-label">Model #</span><input id="pe-model" value="${esc(p.model)}" /></label>
          <label class="af"><span class="af-label">Our price ($) *</span><input id="pe-price" type="number" min="0" step="1" value="${esc(p.price ?? '')}" /></label>
          <label class="af"><span class="af-label">Stock *</span><input id="pe-stock" type="number" min="0" step="1" value="${esc(p.stock ?? 1)}" /></label>
          <label class="af"><span class="af-label">MSRP / retail ($)</span><input id="pe-msrp" type="number" min="0" value="${esc(p.msrp || '')}" placeholder="Shows savings" /></label>
          <label class="af"><span class="af-label">Competitor price ($)</span><input id="pe-ref" type="number" min="0" value="${esc(p.refPrice || '')}" placeholder="e.g. Lowe's price" /></label>
          <label class="af span2"><span class="af-label">Storage location <span class="hint">staff only</span></span><input id="pe-location" value="${esc(p.storageLocation)}" placeholder="e.g. Unit A, back row" /></label>
          <label class="af span2"><span class="af-label">Description</span><textarea id="pe-desc" rows="4" placeholder="Size, color, features, any cosmetic marks…">${esc(p.desc)}</textarea></label>
          <label class="af span2"><span class="af-label">Specs <span class="hint">one per line, like “Capacity: 4.5 cu ft”</span></span><textarea id="pe-specs" rows="3" placeholder="Width: 30 in&#10;Color: Stainless">${esc(specsText)}</textarea></label>
        </div>
      </div>`,
    footer: `
      ${existing ? `<a class="card-btn" href="${esc(productUrl(p.id))}" target="_blank" rel="noopener">${ic('external')} View on site</a>` : ''}
      <span style="flex:1"></span>
      <button type="button" class="card-btn" data-am-close>Cancel</button>
      <button type="button" class="card-btn primary" id="peSave">${existing ? 'Save changes' : 'Add to inventory'}</button>`,
  });

  const grid = m.$('#peGrid');
  const status = m.$('#peStatus');
  function renderPhotos() {
    grid.innerHTML = photos.map((u, i) => `
      <div class="photo-tile">
        <img src="${esc(u)}" alt="" />
        ${i === 0 ? '<span class="cover">Cover</span>' : ''}
        <div class="tile-actions">
          <button type="button" data-move="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move left">${ic('chevron-left')}</button>
          <button type="button" data-remove="${i}" aria-label="Remove photo">${ic('x')}</button>
          <button type="button" data-move="${i}" data-dir="1" ${i === photos.length - 1 ? 'disabled' : ''} aria-label="Move right">${ic('chevron-right')}</button>
        </div>
      </div>`).join('') + (uploading ? Array.from({ length: uploading }, () => '<div class="photo-tile loading"><span class="spin"></span></div>').join('') : '')
      || '<div class="photo-empty">No photos yet — listings with photos sell much faster.</div>';
  }
  renderPhotos();

  grid.addEventListener('click', e => {
    const mv = e.target.closest('[data-move]');
    if (mv) {
      const i = +mv.dataset.move, j = i + +mv.dataset.dir;
      [photos[i], photos[j]] = [photos[j], photos[i]];
      return renderPhotos();
    }
    const rm = e.target.closest('[data-remove]');
    if (rm) { photos.splice(+rm.dataset.remove, 1); renderPhotos(); }
  });

  m.$('#peFiles').addEventListener('change', async e => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    uploading += files.length;
    status.hidden = false;
    status.textContent = `Uploading ${files.length} photo${files.length > 1 ? 's' : ''}…`;
    m.$('#peSave').disabled = true;
    renderPhotos();
    let failed = 0;
    for (const f of files) {
      try { photos.push(await uploadPhoto(f)); }
      catch (err) { failed++; console.error(err); if (err.code === 'unauthorized') handleApiError(err, 'Upload'); }
      uploading--;
      renderPhotos();
    }
    m.$('#peSave').disabled = false;
    status.textContent = failed ? `⚠️ ${failed} photo${failed > 1 ? 's' : ''} didn’t upload. Check your connection and try again.` : '✅ Photos uploaded';
    if (!failed) setTimeout(() => { status.hidden = true; }, 2500);
  });

  m.$('#peAI').addEventListener('click', async () => {
    if (!photos.length) return showAdminToast('⚠️ Add a photo first — include the model sticker if you can');
    const btn = m.$('#peAI'), note = m.$('#peAINote');
    btn.disabled = true; btn.classList.add('busy'); btn.querySelector('span').textContent = 'Looking at your photos…';
    try {
      const hints = { name: m.$('#pe-name').value, brand: m.$('#pe-brand').value, model: m.$('#pe-model').value, category: m.$('#pe-category').value };
      const { suggestion: s } = await apiPost('admin_ai_product', { images: photos.slice(0, 4), hints });
      const filled = [];
      const put = (sel, val) => {
        const el = m.$(sel);
        if (!val || String(el.value).trim()) return; // never overwrite what you typed
        el.value = val; el.classList.add('ai-filled'); filled.push(sel);
      };
      put('#pe-name', s.name); put('#pe-brand', s.brand); put('#pe-model', s.model);
      if (s.category && !m.$('#pe-category').value) { m.$('#pe-category').value = s.category; m.$('#pe-category').classList.add('ai-filled'); filled.push('category'); }
      if (s.conditionGuess && s.conditionGuess !== 'Unknown' && !existing) { m.$('#pe-condition').value = s.conditionGuess; m.$('#pe-condition').classList.add('ai-filled'); }
      put('#pe-desc', s.description);
      if (Array.isArray(s.specs) && s.specs.length) put('#pe-specs', s.specs.filter(x => x.label && x.value).map(x => `${x.label}: ${x.value}`).join('\n'));
      note.hidden = false;
      note.innerHTML = `${ic('sparkles')}<span><strong>${filled.length ? 'Filled in the highlighted fields.' : 'Nothing new to fill — your fields were already set.'}</strong> Double-check before saving${s.checkBeforeSaving ? ': ' + esc(s.checkBeforeSaving) : '.'}</span>`;
    } catch (err) {
      if (err.code === 'unauthorized') handleApiError(err, 'AI');
      else showAdminToast('⚠️ ' + err.message);
    } finally {
      btn.disabled = false; btn.classList.remove('busy'); btn.querySelector('span').textContent = 'Fill in details from photos';
    }
  });

  m.$('#peLinkAdd').addEventListener('click', () => {
    const v = m.$('#peLink').value.trim();
    if (!/^https?:\/\//i.test(v)) return showAdminToast('⚠️ Paste a full link starting with https://');
    photos.push(v); m.$('#peLink').value = ''; renderPhotos();
  });

  m.$('#peSave').addEventListener('click', () => {
    const val = sel => m.$(sel).value.trim();
    const name = val('#pe-name'), brand = val('#pe-brand'), category = val('#pe-category');
    const price = parseFloat(val('#pe-price')), stock = parseInt(val('#pe-stock'), 10);
    const missing = [!name && 'name', !brand && 'brand', !category && 'category', isNaN(price) && 'price', isNaN(stock) && 'stock'].filter(Boolean);
    if (missing.length) return showAdminToast(`⚠️ Please fill in: ${missing.join(', ')}`);

    const specs = {};
    val('#pe-specs').split('\n').forEach(line => {
      const i = line.indexOf(':');
      if (i > 0 && line.slice(i + 1).trim()) specs[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
    const inv = getStore('inventory');
    const record = existing ? inv.find(x => x.id === existing.id) : { id: 'PROD-' + Date.now(), _custom: true, badge: null, oldPrice: null };
    Object.assign(record, {
      name, brand, category, price, stock: Math.max(0, stock),
      condition: val('#pe-condition'), model: val('#pe-model'),
      msrp: parseFloat(val('#pe-msrp')) || 0, refPrice: parseFloat(val('#pe-ref')) || 0,
      storageLocation: val('#pe-location'), desc: val('#pe-desc'), specs,
      imageUrl: photos.join(', '),
      stockStatus: stock <= 0 ? 'out' : 'in-stock',
    });
    if (!existing) inv.push(record);
    setStore('inventory', inv);
    syncStorefront();
    renderInventory();
    renderDashboard();
    saveRemote('inventory', [record]);
    m.close();
    showAdminToast(existing ? `✅ ${name} saved` : `✅ ${name} added`);
  });
}

// ─── Marketplace listing (OfferUp / Facebook / Craigslist) ───
function listingText(p, { business, asIs }) {
  const compare = Math.max(Number(p.msrp) || 0, Number(p.refPrice) || 0);
  const specs = Object.entries(p.specs && typeof p.specs === 'object' ? p.specs : {});
  const name = String(p.name || '');
  const brand = String(p.brand || '');
  const withBrand = brand && !name.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${name}` : name;
  const title = `${String(p.condition || '').startsWith('New') ? 'New ' : ''}${withBrand}`.replace(/\s+/g, ' ').slice(0, 90);
  const lines = [
    `${p.name}`,
    [p.brand, p.model ? `Model ${p.model}` : ''].filter(Boolean).join(' · '),
    p.condition ? `Condition: ${p.condition}` : '',
    compare > p.price ? `Price: $${Number(p.price).toLocaleString()} (retail $${compare.toLocaleString()})` : `Price: $${Number(p.price).toLocaleString()}`,
    '',
    p.desc || '',
    specs.length ? '' : null,
    ...specs.map(([k, v]) => `• ${k}: ${v}`),
    '',
    business
      ? `Available at Oceanside Appliance — locally owned since 1996.\n📍 1016 S Tremont St, Oceanside\n📞 (760) 754-8200\nMore photos: ${productUrl(p.id)}`
      : 'Pickup in Oceanside. Message me with any questions.',
    'Delivery available — ask for a quote.',
    asIs ? 'Sold as-is.' : '',
  ].filter(l => l !== null);
  const body = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title, body };
}

function openListing(id) {
  const p = getStore('inventory').find(x => x.id === id);
  if (!p) return;
  const prefs = JSON.parse(localStorage.getItem('oa_listing_prefs') || '{"business":true,"asIs":true}');
  const photos = imagesOf(p);

  const m = openAdminModal({
    title: 'Marketplace listing',
    size: 'wide',
    body: `
      <p class="am-lead">Ready-to-paste text for OfferUp, Facebook Marketplace and Craigslist. Set the price to <strong>$${esc(Number(p.price).toLocaleString())}</strong> and category on the site itself.</p>
      <div class="toggle-row">
        <label class="toggle"><input type="checkbox" id="lsBiz" ${prefs.business ? 'checked' : ''} /><span></span>Include business name, address &amp; link</label>
        <label class="toggle"><input type="checkbox" id="lsAsIs" ${prefs.asIs ? 'checked' : ''} /><span></span>Add “Sold as-is”</label>
      </div>
      <div class="af-label">Title <button type="button" class="link-btn" data-copy="title">${ic('copy')} Copy</button></div>
      <input id="lsTitle" class="ls-field" />
      <div class="af-label">Description <button type="button" class="link-btn" data-copy="body">${ic('copy')} Copy</button></div>
      <textarea id="lsBody" class="ls-field" rows="12"></textarea>
      <div class="af-label">Photos ${photos.length ? '<span class="hint">tap a photo to open it, then save it to your phone</span>' : ''}</div>
      ${photos.length
        ? `<div class="photo-grid">${photos.map(u => `<a class="photo-tile" href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="" /></a>`).join('')}</div>`
        : `<div class="photo-empty">No photos yet. <button type="button" class="link-btn" id="lsAddPhotos">${ic('camera')} Add photos</button></div>`}
      <div class="tip">${ic('help')}<span>When it sells on a marketplace, click <strong>Record sale</strong> so it comes off the website right away.</span></div>`,
    footer: `
      <button type="button" class="card-btn" id="lsCopyLink">${ic('share')} Copy website link</button>
      <button type="button" class="card-btn ai" id="lsAI">${ic('sparkles')} <span>Polish with AI</span></button>
      <span style="flex:1"></span>
      <button type="button" class="card-btn primary" id="lsCopyAll">${ic('copy')} Copy title + description</button>`,
  });

  function refresh() {
    const t = listingText(p, { business: m.$('#lsBiz').checked, asIs: m.$('#lsAsIs').checked });
    m.$('#lsTitle').value = t.title;
    m.$('#lsBody').value = t.body;
    localStorage.setItem('oa_listing_prefs', JSON.stringify({ business: m.$('#lsBiz').checked, asIs: m.$('#lsAsIs').checked }));
  }
  refresh();
  m.$('#lsBiz').addEventListener('change', refresh);
  m.$('#lsAsIs').addEventListener('change', refresh);
  m.addEventListener('click', e => {
    const c = e.target.closest('[data-copy]');
    if (c) copyText(c.dataset.copy === 'title' ? m.$('#lsTitle').value : m.$('#lsBody').value, c.dataset.copy === 'title' ? 'Title copied' : 'Description copied');
  });
  m.$('#lsCopyAll').addEventListener('click', () => copyText(`${m.$('#lsTitle').value}\n\n${m.$('#lsBody').value}`, 'Listing copied'));
  m.$('#lsCopyLink').addEventListener('click', () => copyText(productUrl(p.id), 'Link copied'));
  m.$('#lsAddPhotos')?.addEventListener('click', () => { m.close(); openProductEditor(p.id); });
  m.$('#lsAI').addEventListener('click', async () => {
    const btn = m.$('#lsAI');
    btn.disabled = true; btn.querySelector('span').textContent = 'Writing…';
    try {
      const r = await apiPost('admin_ai_listing', { productId: p.id, business: m.$('#lsBiz').checked, asIs: m.$('#lsAsIs').checked, link: productUrl(p.id) });
      m.$('#lsTitle').value = r.title;
      m.$('#lsBody').value = r.body;
      showAdminToast('✨ Listing rewritten — read it over before posting');
    } catch (err) {
      if (err.code === 'unauthorized') handleApiError(err, 'AI'); else showAdminToast('⚠️ ' + err.message);
    } finally {
      btn.disabled = false; btn.querySelector('span').textContent = 'Polish with AI';
    }
  });
}

// ─── Record a sale (in store or on a marketplace) ───
function openRecordSale(id) {
  const inv = getStore('inventory');
  const inStock = inv.filter(p => (p.stock || 0) > 0).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (!inStock.length) return showAdminToast('⚠️ Nothing in stock to sell');
  const first = inStock.find(p => p.id === id) || inStock[0];

  const m = openAdminModal({
    title: 'Record a sale',
    body: `
      <p class="am-lead">For sales made in the store or on OfferUp, Facebook, Craigslist, etc. It updates stock on the website and shows up in Sales and the Ledger.</p>
      <div class="af-grid">
        <label class="af span2"><span class="af-label">Item *</span>
          <select id="rs-product">${inStock.map(p => `<option value="${esc(p.id)}" ${p.id === first.id ? 'selected' : ''}>${esc(p.name)} — $${esc(p.price)} (${p.stock} in stock)</option>`).join('')}</select></label>
        <label class="af"><span class="af-label">Sold on *</span><select id="rs-channel">${options(SALE_CHANNELS, 'In store')}</select></label>
        <label class="af"><span class="af-label">Date *</span><input id="rs-date" type="date" value="${todayInput()}" /></label>
        <label class="af"><span class="af-label">Quantity</span><input id="rs-qty" type="number" min="1" value="1" /></label>
        <label class="af"><span class="af-label">Sale price each ($) *</span><input id="rs-price" type="number" min="0" step="0.01" /></label>
        <label class="af span2 check"><input type="checkbox" id="rs-tax" checked /> Collected sales tax (8.25%)</label>
        <label class="af"><span class="af-label">Buyer name</span><input id="rs-name" placeholder="Optional" /></label>
        <label class="af"><span class="af-label">Buyer phone</span><input id="rs-phone" type="tel" placeholder="Optional" /></label>
        <label class="af span2"><span class="af-label">Notes</span><input id="rs-notes" placeholder="e.g. paid cash, picked up" /></label>
      </div>
      <div class="sum-box" id="rs-sum"></div>`,
    footer: `<span style="flex:1"></span><button type="button" class="card-btn" data-am-close>Cancel</button><button type="button" class="card-btn primary" id="rs-save">Record sale</button>`,
  });

  const prod = () => inv.find(p => p.id === m.$('#rs-product').value);
  function syncProduct() {
    const p = prod();
    m.$('#rs-price').value = p.price;
    m.$('#rs-qty').max = p.stock;
    m.$('#rs-qty').value = 1;
    update();
  }
  function calc() {
    const qty = Math.max(1, parseInt(m.$('#rs-qty').value, 10) || 1);
    const each = parseFloat(m.$('#rs-price').value) || 0;
    const subtotal = Math.round(qty * each * 100) / 100;
    const tax = m.$('#rs-tax').checked ? Math.round(subtotal * TAX_RATE * 100) / 100 : 0;
    return { qty, each, subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 };
  }
  function update() {
    const c = calc();
    m.$('#rs-sum').innerHTML = `<div><span>Subtotal</span><span>${money2(c.subtotal)}</span></div><div><span>Sales tax</span><span>${money2(c.tax)}</span></div><div class="total"><span>Total</span><span>${money2(c.total)}</span></div>`;
  }
  m.$('#rs-product').addEventListener('change', syncProduct);
  ['#rs-qty', '#rs-price', '#rs-tax'].forEach(s => m.$(s).addEventListener('input', update));
  syncProduct();

  m.$('#rs-save').addEventListener('click', () => {
    const p = prod(), c = calc();
    if (c.qty > p.stock) return showAdminToast(`⚠️ Only ${p.stock} in stock`);
    if (!c.each) return showAdminToast('⚠️ Enter the sale price');
    const date = m.$('#rs-date').value || todayInput();
    const sale = {
      orderId: 'SALE-' + Date.now(),
      timestamp: new Date(`${date}T12:00:00`).toISOString(),
      status: 'completed',
      channel: m.$('#rs-channel').value,
      firstName: m.$('#rs-name').value.trim(), lastName: '',
      phone: m.$('#rs-phone').value.trim(), email: '',
      items: `${p.name} x${c.qty} ($${c.subtotal.toFixed(2)})`,
      lineItems: [{ id: p.id, name: p.name, qty: c.qty, price: c.each }],
      itemCount: c.qty, subtotal: c.subtotal, tax: c.tax, deliveryFee: 0, total: c.total,
      fulfillment: 'pickup', internalNotes: m.$('#rs-notes').value.trim(),
    };
    p.stock = Math.max(0, (p.stock || 0) - c.qty);
    p.stockStatus = p.stock <= 0 ? 'out' : 'in-stock';
    setStore('inventory', inv);
    setStore('sales', [sale, ...getSales()]);
    syncStorefront();
    saveRemote('sales', [sale]);
    saveRemote('inventory', [p]);
    renderInventory(); renderSales(); renderDashboard();
    m.close();
    showAdminToast(`✅ Sale recorded — ${p.name}${p.stock <= 0 ? ' is now sold out on the website' : ''}`);
  });
}

// ─── Order detail ───
function detailRow(label, value) {
  return value ? `<div class="dl-row"><span>${label}</span><span>${value}</span></div>` : '';
}
function contactButtons(phone, email, address) {
  return `<div class="contact-btns">
    ${phone ? `<a class="card-btn" href="tel:${esc(phone)}">${ic('phone')} Call</a><a class="card-btn" href="sms:${esc(phone)}">${ic('mail')} Text</a>` : ''}
    ${email ? `<a class="card-btn" href="mailto:${esc(email)}">${ic('mail')} Email</a>` : ''}
    ${address ? `<a class="card-btn" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}" target="_blank" rel="noopener">${ic('pin')} Map</a>` : ''}
  </div>`;
}

function openOrderDetail(orderId) {
  const s = getSales().find(x => x.orderId === orderId);
  if (!s) return;
  const who = `${s.firstName || ''} ${s.lastName || ''}`.trim();
  const lines = Array.isArray(s.lineItems) && s.lineItems.length
    ? s.lineItems.map(l => `<div class="li-row"><span>${esc(l.name)} × ${esc(l.qty)}</span><span>${money2((l.price || 0) * (l.qty || 0))}</span></div>`).join('')
    : `<div class="li-row"><span>${esc(s.items)}</span><span></span></div>`;
  const m = openAdminModal({
    title: `Order ${esc(orderId)}`,
    body: `
      <div class="detail-head">
        <div><div class="detail-name">${esc(who) || 'Customer'}</div><div class="detail-sub">${formatDate(s.timestamp)} · ${esc(CHANNEL_LABEL[s.channel] || s.channel || 'Website')}</div></div>
        <select id="od-status" class="status-select">${options(['pending', 'completed', 'cancelled'], s.status)}</select>
      </div>
      ${contactButtons(s.phone, s.email, s.fulfillment === 'delivery' ? s.address : '')}
      <div class="dl">
        ${detailRow('Phone', esc(s.phone))}${detailRow('Email', esc(s.email))}
        ${detailRow('Fulfillment', s.fulfillment === 'delivery' ? 'Delivery & install' : 'Pickup')}
        ${detailRow('Address', esc(s.address))}${detailRow('Availability', esc(s.availability))}
        ${detailRow('Customer notes', esc(s.notes))}
      </div>
      <div class="li">${lines}
        <div class="li-row sub"><span>Subtotal</span><span>${money2(s.subtotal)}</span></div>
        <div class="li-row sub"><span>Tax</span><span>${money2(s.tax)}</span></div>
        <div class="li-row total"><span>Total</span><span>${money2(s.total)}</span></div>
      </div>
      <label class="af"><span class="af-label">Internal notes <span class="hint">staff only</span></span><textarea id="od-notes" rows="3" placeholder="e.g. Confirmed pickup Sat 10am">${esc(s.internalNotes)}</textarea></label>`,
    footer: `<button type="button" class="card-btn" id="od-invoice">${ic('file')} Invoice</button><span style="flex:1"></span><button type="button" class="card-btn" data-am-close>Close</button><button type="button" class="card-btn primary" id="od-save">Save</button>`,
  });
  m.$('#od-invoice').addEventListener('click', () => generateInvoice(orderId));
  m.$('#od-save').addEventListener('click', () => {
    const sales = getSales();
    const rec = sales.find(x => x.orderId === orderId);
    rec.internalNotes = m.$('#od-notes').value.trim();
    setStore('sales', sales);
    const newStatus = m.$('#od-status').value;
    if (newStatus !== rec.status) updateSaleStatus(orderId, newStatus); // also saves + handles restock
    else { saveRemote('sales', [rec]); renderSales(); }
    m.close();
    showAdminToast('✅ Order saved');
  });
}

// ─── Repair detail (schedule, notes, log payment) ───
function openRepairDetail(ticketId, { askPayment = false } = {}) {
  const r = getRepairs().find(x => x.ticketId === ticketId);
  if (!r) return;
  const logged = r.paymentLogged ? getRepairRevenue().find(x => x.id === r.paymentLogged) : null;
  const m = openAdminModal({
    title: `Repair ${esc(ticketId)}`,
    body: `
      <div class="detail-head">
        <div><div class="detail-name">${esc(r.firstName)} ${esc(r.lastName)}</div><div class="detail-sub">Requested ${formatDate(r.timestamp)}${r.requestType && r.requestType !== 'Repair' ? ' · ' + esc(r.requestType) : ''}</div></div>
        <select id="rd-status" class="status-select">${options(['New', 'Scheduled', 'In Progress', 'Completed', 'Cancelled'], r.status)}</select>
      </div>
      ${contactButtons(r.phone, r.email, r.address)}
      <div class="dl">
        ${detailRow('Appliance', `<span style="text-transform:capitalize">${esc(r.applianceType)}</span>${r.brand ? ' · ' + esc(r.brand) : ''}`)}
        ${detailRow('Address', esc(r.address))}${detailRow('Phone', esc(r.phone))}${detailRow('Email', esc(r.email))}
      </div>
      <div class="problem">${esc(r.description) || 'No description provided.'}</div>
      <div class="ai-panel" id="rd-ai">${aiTriageHtml(r)}</div>
      <div class="af-grid">
        <label class="af"><span class="af-label">Scheduled for</span><input id="rd-when" type="datetime-local" value="${toLocalInput(r.scheduledFor)}" /></label>
        <label class="af"><span class="af-label">Technician</span><input id="rd-tech" value="${esc(r.assignedTo)}" placeholder="Who's going" /></label>
        <label class="af span2"><span class="af-label">Internal notes <span class="hint">staff only</span></span><textarea id="rd-notes" rows="3" placeholder="Parts needed, diagnosis, follow-up…">${esc(r.internalNotes)}</textarea></label>
      </div>
      <div class="pay-box" id="rd-pay" ${r.status === 'Completed' || askPayment ? '' : 'hidden'}>
        ${logged
          ? `<div>${ic('check-circle')} Payment of <strong>${money2(logged.amount)}</strong> logged in the Ledger on ${esc(logged.date)}.</div>`
          : `<div class="af-label">Job done — log the payment in the Ledger?</div>
             <div class="pay-row"><span>$</span><input id="rd-amount" type="number" min="0" step="0.01" placeholder="Amount charged" /><span class="hint">Leave blank to skip</span></div>`}
      </div>`,
    footer: `<span style="flex:1"></span><button type="button" class="card-btn" data-am-close>Close</button><button type="button" class="card-btn primary" id="rd-save">Save</button>`,
  });
  m.$('#rd-status').addEventListener('change', e => { m.$('#rd-pay').hidden = e.target.value !== 'Completed'; });
  m.$('#rd-ai').addEventListener('click', async e => {
    const copy = e.target.closest('[data-copy-text]');
    if (copy) return copyText(copy.dataset.copyText, 'Text copied');
    const run = e.target.closest('[data-ai-run]');
    if (!run) return;
    run.disabled = true; run.innerHTML = `${ic('sparkles')} Thinking…`;
    try {
      const res = await apiPost('admin_ai_repair', { ticketId, force: run.dataset.aiRun === 'again' });
      const repairs = getRepairs();
      const rec = repairs.find(x => x.ticketId === ticketId);
      rec.aiTriage = res.triage; rec.aiAt = res.at; rec.aiTriageError = '';
      setStore('repairs', repairs);
      m.$('#rd-ai').innerHTML = aiTriageHtml(rec);
      renderRepairs();
    } catch (err) {
      if (err.code === 'unauthorized') handleApiError(err, 'AI'); else showAdminToast('⚠️ ' + err.message);
      run.disabled = false; run.innerHTML = `${ic('sparkles')} Try again`;
    }
  });
  if (askPayment) setTimeout(() => m.$('#rd-amount')?.focus(), 80);

  m.$('#rd-save').addEventListener('click', () => {
    const repairs = getRepairs();
    const rec = repairs.find(x => x.ticketId === ticketId);
    const when = m.$('#rd-when').value;
    rec.status = m.$('#rd-status').value;
    rec.scheduledFor = when ? new Date(when).toISOString() : '';
    if (rec.scheduledFor && rec.status === 'New') rec.status = 'Scheduled';
    rec.assignedTo = m.$('#rd-tech').value.trim();
    rec.internalNotes = m.$('#rd-notes').value.trim();

    const amount = parseFloat(m.$('#rd-amount')?.value);
    if (rec.status === 'Completed' && amount > 0 && !rec.paymentLogged) {
      const entry = {
        id: 'RR-' + Date.now(), date: todayInput(),
        desc: `${rec.ticketId} · ${rec.applianceType || 'appliance'} repair`,
        customer: `${rec.firstName || ''} ${rec.lastName || ''}`.trim(),
        amount, notes: rec.internalNotes, timestamp: new Date().toISOString(),
      };
      const rr = getRepairRevenue(); rr.unshift(entry); setRepairRevenue(rr);
      saveRemote('repairRevenue', [entry]);
      rec.paymentLogged = entry.id;
    }
    setStore('repairs', repairs);
    saveRemote('repairs', [rec]);
    renderRepairs(); renderDashboard();
    m.close();
    showAdminToast(rec.paymentLogged && amount > 0 ? '✅ Saved and payment logged' : '✅ Repair saved');
  });
}

// ─── AI repair diagnosis panel ───
const URGENCY = { safety: ['⚠️ Safety', '#c0392b'], high: ['High', '#e67e22'], normal: ['Normal', '#1a7fc1'], low: ['Low', '#7f8c8d'] };
function urgencyTag(u) {
  const [label, color] = URGENCY[u] || URGENCY.normal;
  return `<span class="urg-tag" style="color:${color};background:${color}1a">${label}</span>`;
}
function aiTriageHtml(r) {
  const t = r.aiTriage;
  if (!t) {
    return `<div class="ai-empty">
      <div>${ic('sparkles')}<strong>AI diagnosis</strong><span>Likely causes, parts to bring, questions to ask and a ready-to-send text.</span></div>
      ${r.aiTriageError ? `<div class="ai-err">Last attempt failed: ${esc(r.aiTriageError)}</div>` : ''}
      <button type="button" class="ai-btn" data-ai-run="first">${ic('sparkles')} Get AI diagnosis</button>
    </div>`;
  }
  const smsBody = encodeURIComponent(t.textMessageDraft || '');
  return `
    <div class="ai-head">${ic('sparkles')}<strong>AI diagnosis</strong>${urgencyTag(t.urgency)}<span class="hint">${r.aiAt ? formatDate(r.aiAt) : ''}</span>
      <button type="button" class="link-btn" data-ai-run="again" style="margin-left:auto">${ic('refresh')} Redo</button></div>
    <p class="ai-summary">${esc(t.summary)}</p>
    ${t.safetyNote ? `<div class="ai-safety">${ic('alert')}<span>${esc(t.safetyNote)}</span></div>` : ''}
    ${(t.likelyCauses || []).length ? `<div class="ai-sub">Likely causes</div><ul class="ai-list">${t.likelyCauses.map(c => `<li><span class="lk ${esc(c.likelihood)}">${esc(c.likelihood)}</span><div><strong>${esc(c.cause)}</strong>${c.check ? `<br><small>Check: ${esc(c.check)}</small>` : ''}</div></li>`).join('')}</ul>` : ''}
    ${(t.partsToBring || []).length ? `<div class="ai-sub">Parts worth bringing</div><div class="ai-chips">${t.partsToBring.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
    ${(t.questionsForCustomer || []).length ? `<div class="ai-sub">Ask the customer</div><ul class="ai-q">${t.questionsForCustomer.map(q => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}
    ${t.textMessageDraft ? `<div class="ai-sub">Text to send</div>
      <div class="ai-sms">${esc(t.textMessageDraft)}</div>
      <div class="contact-btns">
        <button type="button" class="card-btn small" data-copy-text="${esc(t.textMessageDraft)}">${ic('copy')} Copy</button>
        ${r.phone ? `<a class="card-btn small" href="sms:${esc(r.phone)}?&body=${smsBody}">${ic('mail')} Open in Messages</a>` : ''}
      </div>` : ''}
    <div class="hint">AI suggestions — always confirm on site.</div>`;
}
