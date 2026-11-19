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
  // On touch screens don't focus a field (it would pop the keyboard up over the form)
  if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => ov.querySelector('input:not([type=hidden]):not([type=file]), select, textarea')?.focus(), 50);
  else setTimeout(() => ov.querySelector('.am-x')?.focus({ preventScroll: true }), 50);
  return ov;
}

// ─── Photo upload (resized in the browser, stored in Google Drive) ───
// Phone photos are ~12 megapixels (~50 MB each once opened), so every decode is
// released straight away — otherwise Safari on iPhone runs out of memory.
async function resizeToJpegBase64(file, max = 1600, quality = 0.82) {
  let src, w, h, release;
  try {
    src = await createImageBitmap(file, { imageOrientation: 'from-image' });
    w = src.width; h = src.height;
    release = () => src.close && src.close();
  } catch {
    const url = URL.createObjectURL(file);
    src = await new Promise((res, rej) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => res(img);
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('This photo format isn’t supported by your browser. Try a JPG or PNG.')); };
      img.src = url;
    });
    w = src.naturalWidth; h = src.naturalHeight;
    release = () => { URL.revokeObjectURL(url); src.src = ''; };
  }
  const canvas = document.createElement('canvas');
  try {
    const scale = Math.min(1, max / Math.max(w, h));
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality).split(',')[1];
  } finally {
    release();
    canvas.width = canvas.height = 0; // frees the canvas memory on iOS
  }
}

// What a file really is, from its first bytes (a ".jpg" from an iPhone is sometimes really HEIC)
async function sniffImageType(file) {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const str = (from, to) => String.fromCharCode(...b.slice(from, to));
  if (!b.length) return 'empty';
  if (b[0] === 0xFF && b[1] === 0xD8) return 'jpeg';
  if (b[0] === 0x89 && str(1, 4) === 'PNG') return 'png';
  if (str(0, 4) === 'RIFF' && str(8, 12) === 'WEBP') return 'webp';
  if (str(0, 3) === 'GIF') return 'gif';
  if (str(4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|avif)/.test(str(8, 12))) return str(8, 12) === 'avif' ? 'avif' : 'heic';
  return 'unknown';
}
function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(new Error('Could not read that file.'));
    r.readAsDataURL(file);
  });
}
async function uploadPhoto(file) {
  const base = (file.name || 'photo').replace(/\.[^.]+$/, '');
  let data;
  try { data = await resizeToJpegBase64(file); }
  catch (err) {
    // This browser can't open it (Chrome can't open iPhone HEIC photos) — send the original and let Google Drive convert it
    const kind = await sniffImageType(file).catch(() => 'unknown');
    if (kind === 'empty') throw new Error(`“${file.name}” is empty — it may not have finished downloading. Save it again and retry.`);
    if (kind === 'unknown') throw new Error(`“${file.name}” isn’t a photo this can read (it may be damaged or only partly downloaded). Try opening it and exporting it as a JPG.`);
    if (file.size > 9 * 1024 * 1024) throw new Error(`“${file.name}” is too large to convert (over 9 MB). Open it and export it as a JPG.`);
    const res = await apiPost('admin_upload_image', { data: await fileToBase64(file), mimeType: 'image/' + kind, filename: `${base}.${kind}`, convert: true });
    return res.url;
  }
  const res = await apiPost('admin_upload_image', { data, mimeType: 'image/jpeg', filename: base + '.jpg' });
  return res.url;
}

// ─── Saved price research (staff only — never shown on the website) ───
// Everything the price research found is kept (shown again whenever the item is opened)
function priceResearchFrom(r, at) {
  return { suggested: Math.round(r.suggestedPrice) || 0, low: Math.round(r.rangeLow) || 0, high: Math.round(r.rangeHigh) || 0,
           msrp: Math.round(r.msrp) || 0, msrpNote: String(r.msrpNote || '').slice(0, 300), confidence: r.confidence || '',
           reasoning: String(r.reasoning || '').slice(0, 800),
           comparables: (Array.isArray(r.comparables) ? r.comparables : []).slice(0, 8)
             .map(c => ({ title: String(c.title || '').slice(0, 160), price: Number(c.price) || 0, kind: String(c.kind || ''), url: String(c.url || '') })),
           specs: (Array.isArray(r.specs) ? r.specs : []).slice(0, 12).map(x => ({ label: String(x.label || ''), value: String(x.value || '') })).filter(x => x.label && x.value),
           at: at || new Date().toISOString() };
}
// Specs text box ⇄ list. Adds found specs only where that label isn't there yet; returns how many were added.
function specsFromText(text) {
  return String(text || '').split('\n').map(line => { const i = line.indexOf(':'); return i > 0 ? [line.slice(0, i).trim(), line.slice(i + 1).trim()] : null; })
    .filter(x => x && x[0] && x[1]);
}
function addMissingSpecsText(textarea, found) {
  const rows = specsFromText(textarea.value);
  const have = new Set(rows.map(([k]) => k.toLowerCase()));
  let added = 0;
  (found || []).forEach(x => { if (x.label && x.value && !have.has(x.label.toLowerCase())) { rows.push([x.label, x.value]); have.add(x.label.toLowerCase()); added++; } });
  if (added) { textarea.value = rows.map(([k, v]) => `${k}: ${v}`).join('\n'); textarea.classList.add('ai-filled'); }
  return added;
}
// The full research card (suggested price, MSRP, reasoning, what we found) from saved research
function priceCardHtml(pr) {
  const $ = n => money2(n).replace('.00', '');
  const conf = { high: ['High confidence', '#1e8449'], medium: ['Medium confidence', '#1a6fa8'], low: ['Low confidence — little data found', '#b9770e'] }[pr.confidence] || ['', '#555'];
  const when = pr.at ? new Date(pr.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const comps = pr.comparables || [];
  return `
    <div class="price-card">
      <div class="price-top">
        <div><div class="hint">Suggested price</div><div class="price-big">${pr.suggested ? $(pr.suggested) : '—'}</div>
          ${pr.low && pr.high ? `<div class="hint">Typical range ${$(pr.low)}–${$(pr.high)}</div>` : ''}</div>
        <div><div class="hint">MSRP / new</div><div class="price-mid">${pr.msrp ? $(pr.msrp) : '—'}</div>${pr.msrpNote ? `<div class="hint">${esc(pr.msrpNote)}</div>` : ''}</div>
      </div>
      <div class="conf" style="color:${conf[1]}">${conf[0]}${when ? `<span class="hint"> · researched ${esc(when)}</span>` : ''}</div>
      ${pr.reasoning ? `<p class="price-why">${esc(pr.reasoning)}</p>` : ''}
      ${(pr.specs || []).length ? `<div class="af-label">Specs found online</div><ul class="comps specs-found">${pr.specs.map(x => `<li><span class="t"><strong>${esc(x.label)}</strong></span><span>${esc(x.value)}</span></li>`).join('')}</ul>` : ''}
      ${comps.length ? `<div class="af-label">What we found</div><ul class="comps">${comps.map(c => `<li><span class="kind">${esc(c.kind)}</span><span class="t">${/^https?:\/\//i.test(c.url) ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.title)}</a>` : esc(c.title)}</span><strong>${$(c.price)}</strong></li>`).join('')}</ul>` : ''}
      <div class="contact-btns">
        ${pr.suggested ? `<button type="button" class="card-btn small primary" data-use-price="${pr.suggested}">Use ${$(pr.suggested)} as our price</button>` : ''}
        ${pr.msrp ? `<button type="button" class="card-btn small" data-use-msrp="${pr.msrp}">Use ${$(pr.msrp)} as MSRP</button>` : ''}
        ${(pr.specs || []).length ? `<button type="button" class="card-btn small" data-use-specs>Add specs &amp; dimensions</button>` : ''}
      </div>
    </div>`;
}
function priceRangeBox(pr) {
  const $ = n => '$' + Number(n).toLocaleString('en-US');
  const when = pr.at ? new Date(pr.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  return `<div class="range-box">
    <div><span class="af-label">Market range</span><strong>${pr.low && pr.high ? `${$(pr.low)} – ${$(pr.high)}` : '—'}</strong></div>
    <div><span class="af-label">Suggested</span><strong>${pr.suggested ? $(pr.suggested) : '—'}</strong></div>
    <div><span class="af-label">MSRP / new</span><strong>${pr.msrp ? $(pr.msrp) : '—'}</strong></div>
    <div class="range-meta">Researched ${esc(when)}${pr.confidence ? ` · ${esc(pr.confidence)} confidence` : ''} · for your reference only</div>
  </div>`;
}

// ─── Product editor (add + edit) ───
function openProductEditor(id) {
  const existing = id ? getStore('inventory').find(p => p.id === id) : null;
  const p = existing || { condition: 'Used - Good', stock: 1, category: '' };
  let photos = String(p.internalPhotos || '').split(/[\s,]+/).filter(Boolean); // staff-only inventory photos
  let web = imagesOf(p);                                                       // images customers see
  let uploading = 0;
  let research = p.priceResearch || null;
  // What the form showed when it opened — saving sends only the fields that differ from this
  const opened = {
    name: p.name || '', brand: p.brand || '', category: p.category || '', price: Number(p.price) || 0, stock: Math.max(0, parseInt(p.stock, 10) || 0),
    condition: p.condition || '', model: p.model || '', msrp: Number(p.msrp) || 0, refPrice: Number(p.refPrice) || 0,
    storageLocation: p.storageLocation || '', desc: p.desc || '', specs: p.specs && typeof p.specs === 'object' ? p.specs : {},
    priceResearch: p.priceResearch || null, imageUrl: imagesOf(p).join(', '),
    internalPhotos: String(p.internalPhotos || '').split(/[\s,]+/).filter(Boolean).join(', '),
    stockPhotos: imagesOf(p).length > 0 && !!p.stockPhotos, draft: !!p.draft,
  };
  const specsText = Object.entries(p.specs && typeof p.specs === 'object' ? p.specs : {}).map(([k, v]) => `${k}: ${v}`).join('\n');

  const m = openAdminModal({
    title: existing ? 'Edit product' : 'Add product',
    size: 'wide',
    dismissable: false,
    body: `
      <div class="pe-layout">
        <div class="pe-photos">
          <div class="pe-sec" id="peWebSec">
            <div class="af-label">Website images <span class="hint">what customers see · first is the cover</span></div>
            ${p.imagesAutoPicked ? `<div class="ai-note">${ic('sparkles')}<span>These were picked automatically — check they match, then save.</span></div>` : ''}
            <div class="photo-grid" id="peWeb"></div>
            <button type="button" class="ai-btn" id="peFind">${ic('search')}<span>Find product images online</span></button>
            <div id="peFindOut"></div>
            <div class="web-manual">
              <button type="button" class="card-btn" id="peGoogle">${ic('external')} Search Google</button>
              <label class="card-btn upload-inline">${ic('camera')} Upload image<input type="file" id="peWebFiles" accept="image/*" multiple hidden /></label>
            </div>
            <div class="link-add">
              <input type="url" id="peLink" placeholder="…or paste an image link" />
              <button type="button" class="card-btn small" id="peLinkAdd">Add</button>
            </div>
            <p class="hint web-tip">On a computer you can also drag photos — or images straight from a store page in another tab — onto this section. “Search Google” looks up the model number in quotes — open Shopping or a store page, then copy the image address (long-press on a phone) and paste it here, or save it and use “Upload image”.</p>
            <label class="check-line"><input type="checkbox" id="pe-stocklabel" ${p.stockPhotos ? 'checked' : ''} /> Show a “Stock photo” label on the website</label>
          </div>
          <div class="pe-sec" id="pePhotoSec">
          <div class="af-label">Inventory photos <span class="hint">staff only · never shown on the website</span></div>
          <div class="photo-grid" id="peGrid"></div>
          <label class="upload-btn">
            ${ic('camera')}<span>Take or choose photos</span>
            <input type="file" id="peFiles" accept="image/*" multiple hidden />
          </label>
          <div class="upload-status" id="peStatus" hidden></div>
          <button type="button" class="ai-btn" id="peAI">${ic('sparkles')}<span>Fill in details from photos</span></button>
          <div class="ai-note" id="peAINote" hidden></div>
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
          <div class="af span2" id="peRange">${p.priceResearch ? priceRangeBox(p.priceResearch) : `<div class="range-box empty"><span>No price research yet${p.priceResearchNote ? ' — ' + esc(p.priceResearchNote) : ' — it runs automatically, or tap “Research the price online”.'}</span></div>`}</div>
          <div class="af span2 price-agent" id="peByModelBox">
            <button type="button" class="ai-btn" id="peByModel">${ic('refresh')}<span>Update details &amp; price from this model #</span></button>
            <span class="hint">Wrong model read from the photo? Type the right one above, then tap this — it looks the model up online and redoes the name, description, specs and price research</span>
            <div class="ai-note" id="peByModelOut" hidden></div>
          </div>
          <div class="af span2 price-agent" id="pePrice">
            <button type="button" class="ai-btn" id="pePriceBtn">${ic('search')}<span>Research the price online</span></button>
            <span class="hint">Searches the web for new &amp; used prices of this model (about 10–30¢)</span>
            <div id="pePriceOut"></div>
          </div>
          <label class="af span2 check show-toggle"><input type="checkbox" id="pe-live" ${p.draft ? '' : 'checked'} /> Show on the website <span class="hint">(unchecked = draft, only visible here)</span></label>
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
      <div class="photo-tile" draggable="true" data-tile="${i}">
        <button type="button" class="zoom" draggable="false" data-zoom="${i}" aria-label="View photo ${i + 1} larger"><img src="${esc(u)}" alt="" /></button>
        ${i === 0 ? '<span class="cover">Cover</span>' : ''}
        <div class="tile-actions">
          <button type="button" data-remove="${i}" aria-label="Remove photo">${ic('x')}</button>
          <button type="button" data-moveto="${i}" title="Move to another item" aria-label="Move to another item">${ic('arrow-right')}</button>
          <button type="button" data-toweb="${i}" title="Also use this photo on the website" aria-label="Use on website">${ic('store')}</button>
        </div>
      </div>`).join('') + (uploading ? Array.from({ length: uploading }, () => '<div class="photo-tile loading"><span class="spin"></span></div>').join('') : '')
      || '<div class="photo-empty">Add your own photos here — including the model sticker — for inventory and for reading the details.</div>';
  }
  const webGrid = m.$('#peWeb');
  function renderWeb() {
    webGrid.innerHTML = web.map((u, i) => `
      <div class="photo-tile" draggable="true" data-tile="${i}">
        <button type="button" class="zoom" draggable="false" data-zoom="${i}" aria-label="View photo ${i + 1} larger"><img src="${esc(u)}" alt="" /></button>
        ${i === 0 ? '<span class="cover">Cover</span>' : ''}
        <div class="tile-actions">
          <button type="button" data-move="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move left">${ic('chevron-left')}</button>
          <button type="button" data-remove="${i}" aria-label="Remove image">${ic('x')}</button>
          <button type="button" data-move="${i}" data-dir="1" ${i === web.length - 1 ? 'disabled' : ''} aria-label="Move right">${ic('chevron-right')}</button>
        </div>
      </div>`).join('') || '<div class="photo-empty">No website images yet — use “Find product images online” or “Search Google”.</div>';
  }
  renderPhotos();
  renderWeb();
  webGrid.addEventListener('click', e => {
    const big = e.target.closest('[data-zoom]');
    if (big) return openLightbox(web, +big.dataset.zoom);
    const mv = e.target.closest('[data-move]');
    if (mv) { const i = +mv.dataset.move, j = i + +mv.dataset.dir; [web[i], web[j]] = [web[j], web[i]]; return renderWeb(); }
    const rm = e.target.closest('[data-remove]');
    if (rm) { web.splice(+rm.dataset.remove, 1); renderWeb(); }
  });

  m.$('#peFind').addEventListener('click', async () => {
    const product = { name: m.$('#pe-name').value.trim(), brand: m.$('#pe-brand').value.trim(), model: m.$('#pe-model').value.trim(), desc: m.$('#pe-desc').value.trim() };
    if (!product.model && !product.name) return showAdminToast('⚠️ Enter the model number or name first (or use “Fill in details from photos”)');
    const btn = m.$('#peFind'), out = m.$('#peFindOut');
    btn.disabled = true; btn.classList.add('busy'); btn.querySelector('span').textContent = 'Searching product pages… (up to a minute)';
    out.innerHTML = '';
    try {
      const { candidates } = await apiPost('admin_ai_find_images', { product, refs: photos.slice(0, 2) });
      if (!candidates.length) { out.innerHTML = `<div class="ai-err">No matching product images found. Try adding the exact model number, or paste an image link.</div>`; return; }
      const picked = new Set(candidates.map((c, i) => i).filter(i => candidates[i].clean && candidates[i].sameModel !== 'unsure').slice(0, 3));
      const draw = () => {
        out.innerHTML = `
          <div class="find-grid">${candidates.map((c, i) => `
            <button type="button" class="find-tile${picked.has(i) ? ' on' : ''}" data-pick="${i}" title="${esc(c.note)}">
              <img src="${esc(c.imageUrl)}" alt="" referrerpolicy="no-referrer" />
              <span class="find-src">${c.maker ? '★ ' : ''}${esc(c.source)}</span>
              <span class="find-verdict ${esc(c.sameModel)}">${{ yes: 'Same model', likely: 'Likely match', unsure: 'Check' }[c.sameModel] || ''}${c.colorMatches === 'yes' ? ' · color ✓' : ''}</span>
              <span class="find-check">${ic('check')}</span>
            </button>`).join('')}</div>
          <div class="find-actions"><span class="hint">★ = manufacturer's site (preferred). Tap to select.</span>
            <button type="button" class="card-btn small primary" id="peUsePicked" ${picked.size ? '' : 'disabled'}>Use ${picked.size || ''} selected</button></div>`;
      };
      draw();
      out.onclick = async e => {
        const t = e.target.closest('[data-pick]');
        if (t) { const i = +t.dataset.pick; picked.has(i) ? picked.delete(i) : picked.add(i); return draw(); }
        if (e.target.closest('#peUsePicked')) {
          const use = [...picked].map(i => candidates[i]);
          const b2 = m.$('#peUsePicked'); b2.disabled = true; b2.textContent = 'Saving images…';
          let ok = 0;
          for (const c of use) {
            try { const r = await apiPost('admin_import_image', { url: c.imageUrl, name: product.model || product.name }); web.push(r.url); ok++; renderWeb(); }
            catch (err) { console.warn(err); }
          }
          if (ok) m.$('#pe-stocklabel').checked = true;
          out.innerHTML = ok ? `<div class="ai-note">${ic('check')}<span>Added ${ok} image${ok > 1 ? 's' : ''}. Save to keep them.</span></div>` : `<div class="ai-err">Couldn't download those images — the site may block it. Try others or paste a link.</div>`;
        }
      };
    } catch (err) {
      if (err.code === 'unauthorized') handleApiError(err, 'AI'); else out.innerHTML = `<div class="ai-err">⚠️ ${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false; btn.classList.remove('busy'); btn.querySelector('span').textContent = 'Find product images online';
    }
  });

  grid.addEventListener('click', e => {
    const big = e.target.closest('[data-zoom]');
    if (big) return openLightbox(photos, +big.dataset.zoom);
    const mt = e.target.closest('[data-moveto]');
    if (mt) {
      if (uploading) return showAdminToast('⚠️ Wait for the photos to finish uploading');
      return openMovePhotos({ photos, start: +mt.dataset.moveto, fromId: existing?.id, category: m.$('#pe-category').value, onMove: movePhotos });
    }
    const tw = e.target.closest('[data-toweb]');
    if (tw) { const u = photos[+tw.dataset.toweb]; if (!web.includes(u)) { web.push(u); renderWeb(); showAdminToast('✅ Added to website images'); } return; }
    const rm = e.target.closest('[data-remove]');
    if (rm) { photos.splice(+rm.dataset.remove, 1); renderPhotos(); }
  });

  // Move photos to another item (or split them off into a new draft). Saved straight away
  // for both items, so the photos are never in two places or lost if this window is cancelled.
  async function movePhotos(urls, targetId) {
    const inv = getStore('inventory');
    const movedWeb = web.filter(u => urls.includes(u));
    const records = [];
    let target, label;
    if (targetId) {
      target = inv.find(x => x.id === targetId);
      if (!target) return showAdminToast('⚠️ That item was removed — nothing moved');
      const tPhotos = String(target.internalPhotos || '').split(/[\s,]+/).filter(Boolean);
      const send = { id: target.id, internalPhotos: [...tPhotos, ...urls.filter(u => !tPhotos.includes(u))].join(', ') };
      if (movedWeb.length) {
        const tWeb = imagesOf(target);
        send.imageUrl = [...tWeb, ...movedWeb.filter(u => !tWeb.includes(u))].join(', ');
      }
      records.push(send);
      label = target.name || 'the other item';
    } else {
      target = {
        id: 'PROD-' + Date.now(), createdAt: new Date().toISOString(),
        name: 'Split-off item — needs details', brand: '', model: '', category: m.$('#pe-category').value || '',
        condition: m.$('#pe-condition').value || 'Used - Good', price: 0, msrp: 0, refPrice: 0, stock: 1, desc: '', specs: {},
        imageUrl: movedWeb.join(', '), internalPhotos: urls.join(', '), storageLocation: m.$('#pe-location').value.trim(), draft: true,
      };
      records.push(Object.assign({}, target));
      label = 'a new draft';
    }
    photos = photos.filter(u => !urls.includes(u));
    web = web.filter(u => !urls.includes(u));
    if (existing) {
      const cur = { id: existing.id, internalPhotos: photos.join(', ') };
      if (movedWeb.length) cur.imageUrl = web.join(', ');
      records.unshift(cur);
      // These are saved now, so Save changes shouldn't send them again
      opened.internalPhotos = cur.internalPhotos;
      if (movedWeb.length) opened.imageUrl = cur.imageUrl;
    }
    renderPhotos(); renderWeb();
    const ok = await saveRemote('inventory', records, 'Move photos');
    if (!ok) {
      // Put them back so nothing goes missing
      photos.push(...urls); web.push(...movedWeb);
      if (existing) { opened.internalPhotos = photos.join(', '); opened.imageUrl = web.join(', '); }
      renderPhotos(); renderWeb();
      return showAdminToast('⚠️ Not moved — check your connection and try again');
    }
    const inv2 = getStore('inventory');
    records.forEach(r => {
      const rec = inv2.find(x => x.id === r.id);
      if (rec) Object.assign(rec, r); else inv2.push(Object.assign({}, r));
    });
    setStore('inventory', inv2);
    syncStorefront(); renderInventory(); renderDashboard();
    const n = urls.length;
    showAdminToast(targetId ? `✅ Moved ${n} photo${n > 1 ? 's' : ''} to ${label}`
      : `✅ Moved ${n} photo${n > 1 ? 's' : ''} into a new draft — find “Split-off item” in Inventory to fill in its details`);
  }

  m.$('#peFiles').addEventListener('change', e => { const files = [...e.target.files]; e.target.value = ''; addInventoryFiles(files); });
  async function addInventoryFiles(files) {
    if (!files.length) return;
    uploading += files.length;
    status.hidden = false;
    status.textContent = `Uploading ${files.length} photo${files.length > 1 ? 's' : ''}…`;
    m.$('#peSave').disabled = true;
    renderPhotos();
    let failed = 0, lastErr = null;
    for (const f of files) {
      try { photos.push(await uploadPhoto(f)); }
      catch (err) { failed++; lastErr = err; console.error(err); if (err.code === 'unauthorized') handleApiError(err, 'Upload'); }
      uploading--;
      renderPhotos();
    }
    if (!webUploading) m.$('#peSave').disabled = false;
    const why = lastErr && lastErr.code !== 'unauthorized' && !/fetch|network|load failed/i.test(lastErr.message) ? lastErr.message : 'Check your connection and try again.';
    status.textContent = failed ? `⚠️ ${failed} photo${failed > 1 ? 's' : ''} didn’t upload. ${why}` : '✅ Photos uploaded';
    if (!failed) setTimeout(() => { status.hidden = true; }, 2500);
  }

  m.$('#peAI').addEventListener('click', async () => {
    if (!photos.length && !web.length) return showAdminToast('⚠️ Add a photo first — include the model sticker if you can');
    const btn = m.$('#peAI'), note = m.$('#peAINote');
    btn.disabled = true; btn.classList.add('busy'); btn.querySelector('span').textContent = 'Looking at your photos…';
    try {
      const hints = { name: m.$('#pe-name').value, brand: m.$('#pe-brand').value, model: m.$('#pe-model').value, category: m.$('#pe-category').value };
      const { suggestion: s } = await apiPost('admin_ai_product', { images: [...photos, ...web].slice(0, 4), hints });
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

  // Redo the details from a corrected model number (replaces what's there), then research the price again
  m.$('#peByModel').addEventListener('click', async () => {
    const model = m.$('#pe-model').value.trim();
    if (!model) { m.$('#pe-model').focus(); return showAdminToast('⚠️ Type the correct model number first'); }
    const hasText = ['#pe-name', '#pe-desc', '#pe-specs'].some(sel => m.$(sel).value.trim());
    if (hasText && !confirm(`Replace the name, brand, type, description and specs with the details for model ${model}? Nothing is saved until you tap Save.`)) return;
    const btn = m.$('#peByModel'), note = m.$('#peByModelOut');
    btn.disabled = true; btn.classList.add('busy'); btn.querySelector('span').textContent = `Looking up ${model}… (up to a minute)`;
    try {
      const hints = { brand: m.$('#pe-brand').value, model, name: m.$('#pe-name').value, category: m.$('#pe-category').value };
      const { suggestion: s } = await apiPost('admin_ai_product', { images: [...photos, ...web].slice(0, 4), hints, byModel: true });
      const set = (sel, val) => { if (!val) return; const el = m.$(sel); el.value = val; el.classList.add('ai-filled'); };
      set('#pe-name', s.name); set('#pe-brand', s.brand); set('#pe-desc', s.description);
      if (s.category) set('#pe-category', s.category);
      if (Array.isArray(s.specs) && s.specs.length) set('#pe-specs', s.specs.filter(x => x.label && x.value).map(x => `${x.label}: ${x.value}`).join('\n'));
      note.hidden = false;
      note.innerHTML = `${ic('sparkles')}<span><strong>Updated the highlighted fields for model ${esc(model)}.</strong> Double-check before saving${s.checkBeforeSaving ? ': ' + esc(s.checkBeforeSaving) : '.'}</span>`;
      note.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      m.$('#pePriceBtn').click(); // fresh price research for the right model
    } catch (err) {
      if (err.code === 'unauthorized') handleApiError(err, 'AI');
      else showAdminToast('⚠️ ' + err.message);
    } finally {
      btn.disabled = false; btn.classList.remove('busy'); btn.querySelector('span').textContent = 'Update details & price from this model #';
    }
  });

  m.$('#pePriceBtn').addEventListener('click', async () => {
    const product = {
      name: m.$('#pe-name').value.trim(), brand: m.$('#pe-brand').value.trim(), model: m.$('#pe-model').value.trim(),
      condition: m.$('#pe-condition').value, desc: m.$('#pe-desc').value.trim(),
    };
    if (!product.model && !product.name) return showAdminToast('⚠️ Enter the model number or name first (or use “Fill in details from photos”)');
    const btn = m.$('#pePriceBtn'), out = m.$('#pePriceOut');
    btn.disabled = true; btn.classList.add('busy');
    btn.querySelector('span').textContent = 'Searching prices… (up to a minute)';
    out.innerHTML = '';
    try {
      const { pricing: r, at } = await apiPost('admin_ai_price', { product });
      if (r.suggestedPrice || r.rangeLow) {
        research = priceResearchFrom(r, at);
        const n = addMissingSpecsText(m.$('#pe-specs'), research.specs);
        if (n) showAdminToast(`📐 Added ${n} spec${n > 1 ? 's' : ''} (dimensions etc.) — save to keep`);
        m.$('#peRange').innerHTML = priceRangeBox(research);
        if (existing) { // keep the research even if this window is closed without saving
          const all = getStore('inventory'); const rec = all.find(x => x.id === existing.id);
          if (rec) { rec.priceResearch = research; setStore('inventory', all); renderInventory(); }
          saveRemote('inventory', [{ id: existing.id, priceResearch: research }], 'price research');
        }
      }
      out.innerHTML = research && (r.suggestedPrice || r.rangeLow) ? priceCardHtml(research)
        : `<div class="ai-err">Not enough price data found online for this model.${r.reasoning ? ' ' + esc(r.reasoning) : ''}</div>`;
    } catch (err) {
      if (err.code === 'unauthorized') handleApiError(err, 'AI'); else out.innerHTML = `<div class="ai-err">⚠️ ${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false; btn.classList.remove('busy'); btn.querySelector('span').textContent = 'Research the price online';
    }
  });
  if (research && (research.reasoning || (research.comparables || []).length)) m.$('#pePriceOut').innerHTML = priceCardHtml(research);
  m.$('#pePriceOut').addEventListener('click', e => {
    const up = e.target.closest('[data-use-price]');
    if (up) { m.$('#pe-price').value = Math.round(+up.dataset.usePrice); m.$('#pe-price').classList.add('ai-filled'); showAdminToast('✅ Price filled in — save to keep it'); }
    const um = e.target.closest('[data-use-msrp]');
    if (e.target.closest('[data-use-specs]')) {
      const n = addMissingSpecsText(m.$('#pe-specs'), research?.specs);
      showAdminToast(n ? `📐 Added ${n} spec${n > 1 ? 's' : ''} — save to keep` : 'Those specs are already in the list');
    }
    if (um) { m.$('#pe-msrp').value = Math.round(+um.dataset.useMsrp); m.$('#pe-msrp').classList.add('ai-filled'); showAdminToast('✅ MSRP filled in — save to keep it'); }
  });

  // Same as googling "MODEL" Brand yourself — then pick an image from Shopping or a store page
  m.$('#peGoogle').addEventListener('click', () => {
    const model = m.$('#pe-model').value.trim(), brand = m.$('#pe-brand').value.trim(), name = m.$('#pe-name').value.trim();
    const q = model ? `"${model}"${brand ? ' ' + brand : ''}` : name;
    if (!q) return showAdminToast('⚠️ Enter the model number or name first');
    window.open('https://www.google.com/search?q=' + encodeURIComponent(q), '_blank', 'noopener');
  });
  // Upload images saved from the web (e.g. to the phone's photo library)
  m.$('#peWebFiles').addEventListener('change', e => { const files = [...e.target.files]; e.target.value = ''; addWebFiles(files); });
  let webUploading = 0;
  async function addWebFiles(files) {
    webUploading += files.length; m.$('#peSave').disabled = true;
    showAdminToast(`⏳ Uploading ${files.length} image${files.length > 1 ? 's' : ''}…`);
    for (const f of files) {
      try { web.push(await uploadPhoto(f)); m.$('#pe-stocklabel').checked = true; }
      catch (err) { showAdminToast('⚠️ ' + (err.message || 'Upload failed')); }
      webUploading--; renderWeb();
    }
    if (!uploading && !webUploading) m.$('#peSave').disabled = false;
  }
  // Links are copied into your Drive so they keep working if the store changes its page (or used as-is if the site blocks it)
  async function importLink(v, list) {
    try { const r = await apiPost('admin_import_image', { url: v, name: m.$('#pe-model').value.trim() || m.$('#pe-name').value.trim() }); list.push(r.url); }
    catch (err) { if (err.code === 'unauthorized') return handleApiError(err, 'Image'); list.push(v); }
  }
  m.$('#peLinkAdd').addEventListener('click', async () => {
    const v = m.$('#peLink').value.trim();
    if (!/^https?:\/\//i.test(v)) return showAdminToast('⚠️ Paste a full link starting with https://');
    const btn = m.$('#peLinkAdd'); btn.disabled = true; btn.textContent = 'Saving…';
    await importLink(v, web);
    m.$('#peLink').value = ''; btn.disabled = false; btn.textContent = 'Add';
    m.$('#pe-stocklabel').checked = true;
    renderWeb();
  });

  // Drag and drop
  const busyNote = text => { status.hidden = false; status.textContent = text; };
  makeTilesDraggable(webGrid, 'web');
  makeTilesDraggable(grid, 'photos');
  const reorder = (list, from, to) => { const [x] = list.splice(from, 1); list.splice(to, 0, x); };
  makeDropZone(m.$('#peWebSec'), {
    label: 'Drop to add to website images',
    onFiles: addWebFiles,
    onUrl: async url => { showAdminToast('⏳ Saving that image…'); await importLink(url, web); m.$('#pe-stocklabel').checked = true; renderWeb(); showAdminToast('✅ Image added — save to keep it'); },
    onTile: ({ from, i }, e) => {
      const target = e.target.closest('#peWeb [data-tile]');
      if (from === 'web') { if (target) { reorder(web, i, +target.dataset.tile); renderWeb(); } return; }
      const u = photos[i]; if (u && !web.includes(u)) { web.splice(target ? +target.dataset.tile : web.length, 0, u); renderWeb(); showAdminToast('✅ Added to website images'); }
    },
  });
  makeDropZone(m.$('#pePhotoSec'), {
    label: 'Drop to add inventory photos',
    onFiles: addInventoryFiles,
    onUrl: async url => { busyNote('Saving that image…'); await importLink(url, photos); renderPhotos(); busyNote('✅ Photo added'); setTimeout(() => { status.hidden = true; }, 2000); },
    onTile: ({ from, i }, e) => {
      const target = e.target.closest('#peGrid [data-tile]');
      if (from === 'photos' && target) { reorder(photos, i, +target.dataset.tile); renderPhotos(); }
    },
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
    const fields = {
      name, brand, category, price, stock: Math.max(0, stock),
      condition: val('#pe-condition'), model: val('#pe-model'),
      msrp: parseFloat(val('#pe-msrp')) || 0, refPrice: parseFloat(val('#pe-ref')) || 0,
      storageLocation: val('#pe-location'), desc: val('#pe-desc'), specs, priceResearch: research || null,
      imageUrl: web.join(', '),
      internalPhotos: photos.join(', '),
      stockPhotos: web.length > 0 && m.$('#pe-stocklabel').checked,
      draft: !m.$('#pe-live').checked,
    };
    const inv = getStore('inventory');
    let send;
    if (existing) {
      const record = inv.find(x => x.id === existing.id);
      if (!record) { m.close(); return showAdminToast('⚠️ This product was removed (maybe on another device) — nothing saved'); }
      // Only send what was changed in this window, so newer data saved elsewhere is never overwritten
      send = { id: existing.id };
      Object.keys(fields).forEach(k => { if (JSON.stringify(fields[k]) !== JSON.stringify(opened[k])) send[k] = fields[k]; });
      if (send.stock !== undefined) send._expectStock = opened.stock;
      if (existing.imagesAutoPicked) send.imagesAutoPicked = false; // you've now reviewed them
      if (Object.keys(send).length === 1) { m.close(); return showAdminToast('Nothing changed'); }
      Object.assign(record, send); delete record._expectStock;
    } else {
      send = Object.assign({ id: 'PROD-' + Date.now(), createdAt: new Date().toISOString() }, fields);
      inv.push(Object.assign({}, send));
    }
    setStore('inventory', inv);
    syncStorefront();
    renderInventory();
    renderDashboard();
    saveRemote('inventory', [send], 'Edit product');
    m.close();
    showAdminToast(existing ? `✅ ${name} saved` : `✅ ${name} added`);
  });
}

// ─── Drag and drop: photo files from the computer, or images dragged from another browser tab ───
const TILE_TYPE = 'application/x-oa-photo';
function droppedUrl(dt) {
  const html = dt.getData('text/html');
  const fromHtml = html && (html.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1];
  const list = (dt.getData('text/uri-list') || '').split('\n').map(x => x.trim()).find(x => x && !x.startsWith('#'));
  const url = fromHtml || list || dt.getData('text/plain').trim();
  return /^https?:\/\//i.test(url || '') ? url.replace(/&amp;/g, '&') : '';
}
function makeDropZone(el, { onFiles, onUrl, onTile, label = 'Drop photos here' }) {
  let depth = 0;
  el.classList.add('drop-zone');
  el.dataset.dropLabel = label;
  const accepts = dt => [...dt.types].some(t => t === 'Files' || t === 'text/uri-list' || t === 'text/html' || (t === TILE_TYPE && onTile));
  el.addEventListener('dragenter', e => { if (!accepts(e.dataTransfer)) return; e.preventDefault(); depth++; el.classList.add('drop-on'); });
  el.addEventListener('dragover', e => { if (!accepts(e.dataTransfer)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  el.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; el.classList.remove('drop-on'); } });
  el.addEventListener('drop', e => {
    depth = 0; el.classList.remove('drop-on');
    const dt = e.dataTransfer;
    const tile = dt.getData(TILE_TYPE);
    if (tile) { if (onTile) { e.preventDefault(); onTile(JSON.parse(tile), e); } return; }
    e.preventDefault();
    const files = [...dt.files].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(f.name));
    if (files.length) return onFiles?.(files);
    if (dt.files.length) return showAdminToast('⚠️ Only photos can be added here');
    const url = droppedUrl(dt);
    if (url && onUrl) onUrl(url);
    else showAdminToast('⚠️ Couldn’t read that — try saving the image and dropping the file instead');
  });
}
// Drag photo tiles to reorder them (or into another photo section)
function makeTilesDraggable(grid, from) {
  grid.addEventListener('dragstart', e => {
    const t = e.target.closest('[data-tile]');
    if (!t) return;
    e.dataTransfer.setData(TILE_TYPE, JSON.stringify({ from, i: +t.dataset.tile }));
    e.dataTransfer.effectAllowed = 'copyMove';
    t.classList.add('dragging');
  });
  grid.addEventListener('dragend', e => e.target.closest?.('[data-tile]')?.classList.remove('dragging'));
}
// Stop a stray drop outside a drop area from opening the photo in place of the staff panel
['dragover', 'drop'].forEach(ev => window.addEventListener(ev, e => {
  if (!e.target.closest?.('.drop-zone') && [...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault();
}));

// ─── Photo viewer: tap a photo to see it full size ───
function openLightbox(urls, start = 0) {
  if (!urls.length) return;
  let i = Math.max(0, Math.min(start, urls.length - 1));
  const lb = document.createElement('div');
  lb.className = 'lb';
  lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Photo');
  lb.innerHTML = `
    <img class="lb-img" alt="" />
    <button type="button" class="lb-btn lb-x" aria-label="Close">${ic('x')}</button>
    ${urls.length > 1 ? `<button type="button" class="lb-btn lb-prev" aria-label="Previous photo">${ic('chevron-left')}</button>
    <button type="button" class="lb-btn lb-next" aria-label="Next photo">${ic('chevron-right')}</button>
    <div class="lb-count"></div>` : ''}
    <a class="lb-open" target="_blank" rel="noopener">${ic('external')} Open original</a>`;
  const img = lb.querySelector('.lb-img');
  function show() {
    img.src = urls[i];
    lb.querySelector('.lb-open').href = urls[i];
    const c = lb.querySelector('.lb-count'); if (c) c.textContent = `${i + 1} / ${urls.length}`;
  }
  const go = d => { if (urls.length > 1) { i = (i + d + urls.length) % urls.length; show(); } };
  function close() { lb.remove(); window.removeEventListener('keydown', onKey, true); prevFocus?.focus({ preventScroll: true }); }
  // Capture phase, so Esc closes only the photo and not the editor underneath
  function onKey(e) {
    if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft') { e.stopImmediatePropagation(); go(-1); }
    else if (e.key === 'ArrowRight') { e.stopImmediatePropagation(); go(1); }
  }
  lb.addEventListener('click', e => {
    if (e.target.closest('.lb-prev')) return go(-1);
    if (e.target.closest('.lb-next')) return go(1);
    if (e.target.closest('.lb-open')) return;
    if (e.target.closest('.lb-x') || e.target === lb) close();
  });
  let x0 = null;
  lb.addEventListener('touchstart', e => { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  lb.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  });
  const prevFocus = document.activeElement;
  window.addEventListener('keydown', onKey, true);
  document.body.appendChild(lb);
  show();
  lb.querySelector('.lb-x').focus({ preventScroll: true });
}

// ─── Move photos picker: choose which photos, and which item they belong to ───
function openMovePhotos({ photos, start, fromId, onMove }) {
  const chosen = new Set([photos[start]]);
  let target = null; // item id, or '' for a new draft
  const others = getStore('inventory').filter(p => p.id !== fromId)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const cover = p => String(p.internalPhotos || '').split(/[\s,]+/).filter(Boolean)[0] || imagesOf(p)[0] || '';

  const m = openAdminModal({
    title: 'Move photos to another item',
    body: `
      <div class="af-label">Photos to move <span class="hint">tap to select</span></div>
      <div class="photo-grid mv-photos" id="mvPhotos"></div>
      <div class="af-label mv-to">Move to</div>
      <input type="search" id="mvSearch" class="mv-search" placeholder="Search name, brand, model # or location" />
      <div class="mv-list" id="mvList" role="listbox" aria-label="Items"></div>`,
    footer: `<span class="hint" id="mvSummary"></span><span style="flex:1"></span>
      <button type="button" class="card-btn" data-am-close>Cancel</button>
      <button type="button" class="card-btn primary" id="mvGo" disabled>Move</button>`,
  });

  function renderPhotos() {
    m.$('#mvPhotos').innerHTML = photos.map((u, i) => `
      <button type="button" class="photo-tile mv-pick ${chosen.has(u) ? 'on' : ''}" data-i="${i}" aria-pressed="${chosen.has(u)}">
        <img src="${esc(u)}" alt="" /><span class="mv-check">${ic('check')}</span>
      </button>`).join('');
    update();
  }
  function renderList() {
    const q = m.$('#mvSearch').value.trim();
    const list = q ? others.filter(p => matches(p, q, ['name', 'brand', 'model', 'storageLocation', 'category'])) : others;
    m.$('#mvList').innerHTML = `
      <button type="button" class="mv-item ${target === '' ? 'on' : ''}" data-id="" role="option" aria-selected="${target === ''}">
        <span class="mv-thumb new">${ic('plus')}</span>
        <span class="mv-text"><strong>A new item</strong><small>Split these photos off into their own draft</small></span>
      </button>` +
      list.slice(0, 60).map(p => `
      <button type="button" class="mv-item ${target === p.id ? 'on' : ''}" data-id="${esc(p.id)}" role="option" aria-selected="${target === p.id}">
        <span class="mv-thumb">${cover(p) ? `<img src="${esc(cover(p))}" alt="" loading="lazy" />` : ic('camera')}</span>
        <span class="mv-text"><strong>${esc(p.name || 'Untitled')}</strong>
          <small>${esc([p.brand, p.model && '#' + p.model, p.storageLocation, p.draft ? 'Draft' : ''].filter(Boolean).join(' · '))}</small></span>
      </button>`).join('') +
      (list.length > 60 ? `<p class="hint">Showing 60 of ${list.length} — search to narrow it down.</p>` : '') +
      (q && !list.length ? '<p class="hint">No items match that search.</p>' : '');
    update();
  }
  function update() {
    const n = chosen.size;
    m.$('#mvSummary').textContent = `${n} photo${n === 1 ? '' : 's'} selected`;
    m.$('#mvGo').disabled = !n || target === null;
  }
  m.$('#mvPhotos').addEventListener('click', e => {
    const t = e.target.closest('[data-i]'); if (!t) return;
    const u = photos[+t.dataset.i];
    chosen.has(u) ? chosen.delete(u) : chosen.add(u);
    renderPhotos();
  });
  m.$('#mvList').addEventListener('click', e => {
    const t = e.target.closest('[data-id]'); if (!t) return;
    target = t.dataset.id; renderList();
  });
  m.$('#mvSearch').addEventListener('input', renderList);
  m.$('#mvGo').addEventListener('click', () => {
    const urls = photos.filter(u => chosen.has(u));
    m.close();
    onMove(urls, target);
  });
  renderPhotos(); renderList();
}

// ─── LISTINGS: Facebook Marketplace / OfferUp / Craigslist queue ───
// Each item records where it's posted: p.listings = { facebook: { url, at, removedAt? }, offerup: …, craigslist: … }
const MARKET = {
  facebook: {
    name: 'Facebook Marketplace', short: 'Facebook', post: 'https://www.facebook.com/marketplace/create/item', publish: 'Publish',
    domain: /(^|\.)facebook\.com$|(^|\.)fb\.com$/, category: 'Appliances',
    tips: 'Choose "Item for sale". Location: Oceanside, CA.',
    condition: c => /^new/.test(c) && !/open/.test(c) ? 'New' : /open|excellent/.test(c) ? 'Used – Like New' : /good/.test(c) ? 'Used – Good' : 'Used – Fair',
  },
  offerup: {
    name: 'OfferUp', short: 'OfferUp', post: 'https://offerup.com/', publish: 'Post',
    domain: /(^|\.)offerup\.com$/, category: 'Home & garden › Appliances',
    tips: 'Use "Post an item" (or "Sell"). Choose local pickup only — no shipping. Location: Oceanside, CA 92054.',
    condition: c => /^new/.test(c) && !/open/.test(c) ? 'New' : /open/.test(c) ? 'Open box' : /part/.test(c) ? 'For parts' : 'Used (normal wear)',
  },
  craigslist: {
    name: 'Craigslist', short: 'Craigslist', post: 'https://post.craigslist.org/c/sdo', publish: 'Publish',
    domain: /(^|\.)craigslist\.org$/, category: 'for sale by dealer › appliances',
    tips: 'Area: San Diego; if it asks for a sub-area choose "north SD county". Type: "for sale by dealer" → "appliances". ZIP code 92054.',
    condition: c => /^new/.test(c) && !/open/.test(c) ? 'new' : /open/.test(c) ? 'like new' : /excellent/.test(c) ? 'excellent' : /good/.test(c) ? 'good' : /part/.test(c) ? 'salvage' : 'fair',
  },
};
let lqFilter = { platform: 'facebook', tab: 'topost' };
const lqOpen = new Set();          // items whose details are open (kept across refreshes)
const lqPhotoFiles = new Map();    // id → prepared photo files (for one-tap "Save all photos")
const activeListing = (p, k) => { const l = p.listings && p.listings[k]; return l && l.url && !l.removedAt ? l : null; };
const listingPhotos = p => [...String(p.internalPhotos || '').split(/[\s,]+/).filter(Boolean), ...imagesOf(p)].filter((u, i, a) => a.indexOf(u) === i).slice(0, 12);
const lqReady = p => Number(p.stock) > 0 && !p.draft && Number(p.price) > 0 && listingPhotos(p).length > 0;
function listingTakeDowns(inv) {
  const out = [];
  (inv || getInventory()).forEach(p => { if (Number(p.stock) <= 0) Object.keys(MARKET).forEach(k => { if (activeListing(p, k)) out.push({ p, platform: k }); }); });
  return out;
}
function listingPrefs() { try { return JSON.parse(localStorage.getItem('oa_listing_prefs') || '{"business":true,"asIs":true}'); } catch { return { business: true, asIs: true }; } }
function setListingPref(k, v) { const prefs = listingPrefs(); prefs[k] = v; try { localStorage.setItem('oa_listing_prefs', JSON.stringify(prefs)); } catch {} renderListings(); }
function openListingsTab(tab) { lqFilter.tab = tab; showTab('listings'); }
function setLq(k, v) { lqFilter[k] = v; lqOpen.clear(); renderListings(); }

function renderListingsSafely() {
  const typing = document.activeElement?.closest?.('#lqList') || [...document.querySelectorAll('#lqList .lq-url')].some(i => i.value.trim());
  if (typing) return; // don't wipe a link that's being pasted
  renderListings();
}

function renderListings() {
  const list = document.getElementById('lqList');
  if (!list) return;
  const k = lqFilter.platform, m = MARKET[k];
  const inv = getInventory();
  const prefs = listingPrefs();
  history.replaceState(null, '', `#listings/${k}/${lqFilter.tab}`);
  document.getElementById('lqBiz').checked = !!prefs.business || k === 'craigslist';
  document.getElementById('lqBiz').disabled = k === 'craigslist';
  document.getElementById('lqAsIs').checked = !!prefs.asIs;

  const groups = {
    topost: inv.filter(p => lqReady(p) && !activeListing(p, k)),
    posted: inv.filter(p => Number(p.stock) > 0 && activeListing(p, k)),
    takedown: inv.filter(p => Number(p.stock) <= 0 && activeListing(p, k)),
  };
  const notReady = inv.filter(p => Number(p.stock) > 0 && !lqReady(p) && !activeListing(p, k)).length;
  document.getElementById('lqPlatforms').innerHTML = Object.entries(MARKET).map(([key, mk]) => {
    const n = listingTakeDowns(inv).filter(t => t.platform === key).length;
    return `<button type="button" role="tab" class="lq-pf ${key === k ? 'on' : ''}" aria-selected="${key === k}" onclick="setLq('platform','${key}')">${esc(mk.name)}${n ? `<span class="lq-alert" title="${n} sold item${n > 1 ? 's' : ''} still posted">${n}</span>` : ''}</button>`;
  }).join('');
  document.getElementById('lqTabs').innerHTML = [['topost', 'To post'], ['posted', 'Posted'], ['takedown', 'Take down']].map(([t, label]) =>
    `<button type="button" role="tab" class="inv-tab ${t === lqFilter.tab ? 'on' : ''} ${t === 'takedown' && groups[t].length ? 'warn' : ''}" aria-selected="${t === lqFilter.tab}" onclick="setLq('tab','${t}')">${label}<span>${groups[t].length}</span></button>`).join('');
  document.getElementById('lqSummary').textContent =
    `${m.name}: ${groups.topost.length} to post · ${groups.posted.length} posted` + (groups.takedown.length ? ` · ${groups.takedown.length} sold but still posted` : '') +
    (notReady ? ` · ${notReady} not ready yet (draft, or no price/photos)` : '');

  const items = groups[lqFilter.tab].sort((a, b) => String(b.createdAt || b.id).localeCompare(String(a.createdAt || a.id)));
  if (!items.length) {
    list.innerHTML = `<div class="lq-empty">${lqFilter.tab === 'topost' ? `Everything that's ready is posted on ${esc(m.short)}.${notReady ? ` ${notReady} item${notReady > 1 ? 's aren’t' : ' isn’t'} ready yet — publish ${notReady > 1 ? 'them' : 'it'} and add a price and photos in Inventory.` : ''}`
      : lqFilter.tab === 'posted' ? `Nothing posted on ${esc(m.short)} yet.` : `Nothing to take down — no sold items are still posted on ${esc(m.short)}.`}</div>`;
    return;
  }
  if (lqFilter.tab === 'topost' && !lqOpen.size) lqOpen.add(items[0].id); // first one open, ready to go
  list.innerHTML = items.map(p => listingCard(p, k, prefs)).join('');
  list.querySelectorAll('details.lq-item[open]').forEach(d => prepareLqPhotos(d.dataset.id));
}

function listingCard(p, k, prefs) {
  const m = MARKET[k], id = esc(p.id);
  const t = listingText(p, { business: k === 'craigslist' ? true : !!prefs.business, asIs: !!prefs.asIs });
  const photos = listingPhotos(p);
  const live = p.listings && p.listings[k];
  const cond = m.condition(String(p.condition || '').toLowerCase());
  const field = (label, value, copy, cls = '') => `<div class="lq-f ${cls}"><dt>${label}</dt><dd><span class="lq-v">${value}</span>${copy ? `<button type="button" class="link-btn" data-copy-text="${esc(copy)}" data-copy-what="${label}">${ic('copy')} Copy</button>` : ''}</dd></div>`;
  const ready = lqPhotoFiles.get(p.id);
  let actions;
  if (lqFilter.tab === 'topost') {
    actions = `<a class="card-btn" href="${m.post}" target="_blank" rel="noopener">${ic('external')} Open ${esc(m.short)}</a>
      <label class="lq-urlbox"><span class="sr-only">Paste the ${esc(m.short)} listing link</span><input type="url" class="lq-url" id="lqurl_${id}" placeholder="Paste the ${esc(m.short)} listing link" /></label>
      <button type="button" class="card-btn primary" onclick="markListingPosted('${id}','${k}')">${ic('check')} Mark posted</button>`;
  } else if (lqFilter.tab === 'posted') {
    actions = `<a class="card-btn" href="${esc(live.url)}" target="_blank" rel="noopener">${ic('external')} Open post</a>
      <span class="hint">Posted ${formatDate(live.at)}</span><span style="flex:1"></span>
      <button type="button" class="card-btn" onclick="markListingRemoved('${id}','${k}')">Mark taken down</button>`;
  } else {
    actions = `<span class="hint">Sold — delete it or mark it sold on ${esc(m.short)}, then:</span>
      <a class="card-btn" href="${esc(live.url)}" target="_blank" rel="noopener">${ic('external')} Open post</a>
      <button type="button" class="card-btn primary" onclick="markListingRemoved('${id}','${k}')">${ic('check')} Mark taken down</button>`;
  }
  return `<details class="lq-item" data-id="${id}" ${lqOpen.has(p.id) ? 'open' : ''}>
    <summary>
      <span class="lq-thumb">${photos[0] ? `<img src="${esc(photos[0])}" alt="" loading="lazy" />` : ic('camera')}</span>
      <span class="lq-head"><strong>${esc(t.title)}</strong><small>$${esc(Number(p.price).toLocaleString())} · ${esc(cond)}${p.storageLocation ? ' · ' + esc(p.storageLocation) : ''} · ${photos.length} photo${photos.length === 1 ? '' : 's'}</small></span>
      <span class="lq-chev">${ic('chevron-right')}</span>
    </summary>
    <div class="lq-body">
      <dl class="lq-fields">
        ${field('Title', esc(t.title), t.title, 'wide')}
        ${field('Price', '$' + esc(Number(p.price).toLocaleString()), String(Math.round(Number(p.price))))}
        ${field('Category', esc(m.category))}
        ${field('Condition', esc(cond))}
        ${field('Location', 'Oceanside, CA 92054')}
        ${field('Description', `<pre class="lq-desc">${esc(t.body)}</pre>`, t.body, 'wide')}
        <div class="lq-f wide"><dt>Photos</dt><dd>
          <div class="lq-photos">${photos.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener" title="Photo ${i + 1}"><img src="${esc(u)}" alt="Photo ${i + 1}" loading="lazy" /></a>`).join('')}</div>
          <button type="button" class="card-btn" data-lq-save="${id}" ${ready ? '' : 'disabled'}>${ic('download')} <span>${ready ? saveLabel(ready.length) : 'Getting photos ready…'}</span></button>
        </dd></div>
      </dl>
      <div class="lq-actions">${actions}</div>
    </div>
  </details>`;
}

async function prepareLqPhotos(id) {
  if (lqPhotoFiles.has(id)) return;
  const p = getStore('inventory').find(x => x.id === id);
  const btn = () => document.querySelector(`[data-lq-save="${CSS.escape(id)}"]`);
  try {
    const files = await listingPhotoFiles(listingPhotos(p), p);
    if (!files.length) throw new Error('none');
    lqPhotoFiles.set(id, files);
    const b = btn(); if (b) { b.disabled = false; b.querySelector('span').textContent = saveLabel(files.length); }
  } catch (err) {
    const b = btn(); if (b) { b.disabled = false; b.querySelector('span').textContent = /Unknown request/i.test(err.message || '') ? 'Deploy the latest Apps Script first' : 'Try again'; }
  }
}
document.addEventListener('toggle', e => {
  const d = e.target;
  if (!d.matches || !d.matches('details.lq-item')) return;
  if (d.open) { lqOpen.add(d.dataset.id); prepareLqPhotos(d.dataset.id); } else lqOpen.delete(d.dataset.id);
}, true);
document.addEventListener('click', async e => {
  const c = e.target.closest('[data-copy-text]');
  if (c && c.closest('#lqList')) { copyText(c.dataset.copyText, `${c.dataset.copyWhat} copied`); return; }
  const b = e.target.closest('[data-lq-save]');
  if (!b) return;
  const files = lqPhotoFiles.get(b.dataset.lqSave);
  if (!files) { lqPhotoFiles.delete(b.dataset.lqSave); return prepareLqPhotos(b.dataset.lqSave); }
  if (navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ files }); } catch (err) { if (err.name !== 'AbortError') showAdminToast('⚠️ ' + err.message); }
    return;
  }
  for (const f of files) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    await new Promise(r => setTimeout(r, 350));
  }
  showAdminToast(`⬇️ Downloaded ${files.length} photo${files.length === 1 ? '' : 's'}`);
});
function saveLabel(n) { return n === 1 ? 'Save the photo' : `Save all ${n} photos`; }

function saveListings(id, mutate, reason) {
  const inv = getStore('inventory');
  const p = inv.find(x => x.id === id);
  if (!p) return showAdminToast('⚠️ That item was removed');
  const listings = JSON.parse(JSON.stringify(p.listings || {}));
  mutate(listings);
  p.listings = listings;
  setStore('inventory', inv);
  saveRemote('inventory', [{ id, listings }], reason);
  renderListings(); renderDashboard();
}
function markListingPosted(id, k) {
  const input = document.getElementById('lqurl_' + id);
  const url = (input?.value || '').trim();
  let host = '';
  try { host = new URL(url).hostname; } catch {}
  if (!/^https?:\/\//i.test(url) || !host) { input?.focus(); return showAdminToast(`⚠️ Paste the link to the ${MARKET[k].short} listing first`); }
  if (!MARKET[k].domain.test(host) && !confirm(`That link isn't a ${MARKET[k].short} link (${host}). Save it anyway?`)) return;
  input.value = '';
  lqOpen.delete(id);
  saveListings(id, l => { l[k] = { url, at: new Date().toISOString() }; }, `listed on ${MARKET[k].short}`);
  showAdminToast(`✅ Marked as posted on ${MARKET[k].short}`);
}
function markListingRemoved(id, k) {
  saveListings(id, l => { if (l[k]) l[k].removedAt = new Date().toISOString(); }, `taken down from ${MARKET[k].short}`);
  showAdminToast(`✅ Marked as taken down from ${MARKET[k].short}`);
}

// Ready-to-paste instructions for Claude in Chrome (it works in your own logged-in browser)
function copyAgentInstructions() {
  const k = lqFilter.platform, m = MARKET[k];
  const page = `${location.href.split('#')[0]}#listings/${k}/topost`;
  const text = `Please post my appliance listings on ${m.name} for Oceanside Appliance, using this Chrome window where I'm already signed in.

Where the listings are: ${page}
That page (my staff portal) shows every appliance still to post on ${m.short} under "To post". Click an item to open it — it shows the exact Title, Price, Category, Condition, Location, Description and Photos to use.

Post up to 5 items this time, starting from the top. For each item:
1. Open ${m.post} in a new tab.
2. Fill in the form with the item's details exactly as shown on the staff page. Don't change the price and don't add anything that isn't in the description. ${m.tips} If a dropdown doesn't have the exact wording, pick the closest option.
3. Photos: add the item's photos in the order shown ("Save all photos" on the item downloads them to this computer). If you can't attach the photos yourself, stop and ask me to add them, then carry on.
4. Before you click the final "${m.publish}" button, stop and show me the filled-in listing. Only publish after I reply "OK".
5. Once it's published, copy the new listing's link. Back on the staff page, paste it into "Paste the ${m.short} listing link" on that item and click "Mark posted".
6. Wait 2–3 minutes before starting the next item.

Rules: never message buyers, accept offers, change prices or enter payment or bank details. If a site shows a warning or a captcha, or asks for a verification code, stop and tell me.`;
  copyText(text, `Instructions copied — paste them into Claude in Chrome`);
}

function openListingsHelp() {
  openAdminModal({
    title: 'Posting listings with Claude',
    body: `<ol class="help-steps">
      <li><strong>Once:</strong> on your computer, install <strong>Claude in Chrome</strong> from the Chrome Web Store and sign in with your Claude account. Open this staff panel in that Chrome and sign in.</li>
      <li>Go to <strong>Listings</strong>, pick the site (Facebook Marketplace, OfferUp or Craigslist) and tap <strong>Copy instructions for Claude</strong>.</li>
      <li>Open the Claude side panel in Chrome and paste. Claude opens each item, fills in the site's form, adds the photos and <strong>stops before Publish</strong> so you can check it. Reply “OK” and it publishes, then records the link here.</li>
      <li>It does up to 5 items at a time, a few minutes apart. Do a batch a day rather than everything at once.</li>
      <li>When something sells, tap <strong>Record sale</strong> as usual. It shows up under <strong>Take down</strong> here (and on Today) for every site it's still posted on.</li>
    </ol>
    <p class="hint">Why it stops before Publish: Facebook, OfferUp and Craigslist don't allow fully automated posting, and accounts that post too fast get restricted. You stay the one who publishes. Want items to show up without posting at all? Use <a href="#" onclick="openProductFeed();return false">the Google &amp; Facebook product feed</a>.</p>`,
  });
}

// Google Merchant Center + Meta Commerce Manager feed
async function openProductFeed() {
  const m = openAdminModal({
    title: 'Google & Facebook product feed',
    size: 'wide',
    body: `<p class="am-lead">Your in-stock items, updated every hour, ready for <strong>Google</strong> (free listings on Google Shopping, Search and Maps) and <strong>Facebook &amp; Instagram</strong> (your Page's catalog). Nobody has to post anything — sold items drop off on their own.</p>
      <div id="feedOut"><div class="ai-note">${ic('refresh')}<span>Updating the feed…</span></div></div>`,
  });
  try {
    const r = await apiPost('admin_feed');
    const copyRow = (label, url) => `<div class="feed-link"><span class="af-label">${label}</span><input readonly value="${esc(url)}" onclick="this.select()" /><button type="button" class="card-btn small" data-copy-feed="${esc(url)}">${ic('copy')} Copy</button></div>`;
    m.$('#feedOut').innerHTML = `
      <div class="feed-count"><strong>${r.count}</strong> item${r.count === 1 ? '' : 's'} in the feed${r.skipped.length ? ` · ${r.skipped.length} left out` : ''}</div>
      ${r.skipped.length ? `<details class="feed-skipped"><summary>Left out (${r.skipped.length})</summary><ul>${r.skipped.map(x => `<li><strong>${esc(x.name || x.id)}</strong> — ${esc(x.reason)}</li>`).join('')}</ul></details>` : ''}
      ${copyRow('Feed spreadsheet (public, product info only)', r.sheetUrl)}
      ${r.feedUrl ? copyRow('Feed link (same data)', r.feedUrl) : ''}
      <div class="settings-h">Google — free listings</div>
      <ol class="help-steps">
        <li>Go to <strong>merchants.google.com</strong> and create a free Merchant Center account with your business details (1016 S Tremont St, (760) 754-8200).</li>
        <li>Add your website. Google asks you to verify it — send me the verification code and I'll add it (easiest once your own domain is connected).</li>
        <li><strong>Products → Add products → Google Sheets</strong> → use an existing sheet → paste the feed spreadsheet link above. Choose a daily update.</li>
        <li>In shipping settings, set up local pickup / delivery, then turn on <strong>free listings</strong>.</li>
      </ol>
      <div class="settings-h">Facebook &amp; Instagram — catalog</div>
      <ol class="help-steps">
        <li>Go to <strong>business.facebook.com → Commerce Manager</strong> and create a catalog (type: <em>Ecommerce</em>) for the Oceanside Appliance Page.</li>
        <li><strong>Data sources → Data feed → Scheduled feed</strong> → Google Sheets (or URL) → paste the feed spreadsheet link above → update daily.</li>
        <li>Connect the catalog to your Facebook Page and Instagram so the items show in your shop and can be tagged in posts.</li>
      </ol>
      <p class="hint">Left out on purpose: drafts, sold items, “For parts” items, and anything without a price or a website image. Open-box items are listed as “used” on Google, which is Google's rule for opened boxes.</p>`;
    m.$('#feedOut').addEventListener('click', e => { const b = e.target.closest('[data-copy-feed]'); if (b) copyText(b.dataset.copyFeed, 'Link copied'); });
  } catch (err) {
    m.$('#feedOut').innerHTML = `<div class="ai-err">${/Unknown request/i.test(err.message || '') ? 'Deploy the latest Apps Script (new version) first, then open this again.' : err.code === 'unauthorized' ? 'Staff key missing — open Settings.' : '⚠️ ' + esc(err.message)}</div>`;
  }
}

// Photos as File objects for sharing/saving, in listing order. Tries the browser first, then the backend.
async function listingPhotoFiles(urls, p) {
  const base = String(p.model || p.name || 'appliance').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'photo';
  const ext = t => (t.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/\+.*$/, '');
  const make = (blob, i) => new File([blob], `${base}-${i + 1}.${ext(blob.type)}`, { type: blob.type });
  const out = await Promise.all(urls.map(async (u, i) => {
    try {
      const r = await fetch(u, { mode: 'cors', credentials: 'omit' });
      if (!r.ok) return null;
      const b = await r.blob();
      return /^image\//.test(b.type) ? make(b, i) : null;
    } catch { return null; }
  }));
  const missing = urls.map((u, i) => (out[i] ? null : i)).filter(i => i !== null);
  if (missing.length) {
    const { files } = await apiPost('admin_photo_files', { urls: missing.map(i => urls[i]) });
    (files || []).forEach(f => {
      const i = missing[f.index];
      const bin = atob(f.data), bytes = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
      out[i] = make(new Blob([bytes], { type: f.type }), i);
    });
  }
  return out.filter(Boolean);
}

// ─── Marketplace listing (OfferUp / Facebook / Craigslist) ───
function listingText(p, { business, asIs }) {
  const compare = Math.max(Number(p.msrp) || 0, Number(p.refPrice) || 0);
  // Same clean specs as the website: no repeats, no box labels/dates, no "(per prefix)" notes
  const junk = /^(model|model ?(no|number|#)\.?|condition|packaging|package|box.*|carton.*|.*\bdate\b.*|serial.*|manufactur.*|mfg.*|.*\blabel\b.*|sticker.*|sku|upc|barcode)$/i;
  const specs = Object.entries(p.specs && typeof p.specs === 'object' ? p.specs : {})
    .map(([k, v]) => [String(k).trim(), String(v ?? '').trim().replace(/\s*\((?:per|based on|from|according to|inferred|likely|probably|see)\b[^)]*\)\s*$/i, '')])
    .filter(([k, v]) => k && v && !junk.test(k));
  const cond = String(p.condition || '').toLowerCase();
  const simpleCond = !cond ? '' : cond.startsWith('new') ? 'New' : cond.includes('part') ? 'For parts' : 'Used';
  const name = String(p.name || '');
  const brand = String(p.brand || '');
  const withBrand = brand && !name.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${name}` : name;
  const title = `${String(p.condition || '').startsWith('New') ? 'New ' : ''}${withBrand}`.replace(/\s+/g, ' ').slice(0, 90);
  const lines = [
    `${p.name}`,
    [p.brand, p.model ? `Model ${p.model}` : ''].filter(Boolean).join(' · '),
    simpleCond ? `Condition: ${simpleCond}` : '',
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
  // Marketplaces: real photos of the unit first, then website images
  const photos = [...String(p.internalPhotos || '').split(/[\s,]+/).filter(Boolean), ...imagesOf(p)];

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
      <div class="af-label">Photos ${photos.length ? `<span class="hint">${photos.length} photo${photos.length > 1 ? 's' : ''} · real photos of the unit first</span>` : ''}</div>
      ${photos.length ? `<div class="ls-save"><button type="button" class="card-btn primary" id="lsSavePhotos" disabled>${ic('download')} <span>Getting photos ready…</span></button>
        <span class="hint" id="lsSaveHint">On a phone this opens the share sheet — choose <strong>Save ${photos.length > 1 ? `${photos.length} Images` : 'Image'}</strong>, or send them straight to the Facebook or OfferUp app.</span></div>` : ''}
      ${photos.length
        ? `<div class="photo-grid" id="lsPhotos">${photos.map((u, i) => `<div class="photo-tile"><button type="button" class="zoom" data-zoom="${i}" aria-label="View photo ${i + 1} larger"><img src="${esc(u)}" alt="" /></button></div>`).join('')}</div>`
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
  m.$('#lsPhotos')?.addEventListener('click', e => { const z = e.target.closest('[data-zoom]'); if (z) openLightbox(photos, +z.dataset.zoom); });

  // "Save all photos": get the photos as files as soon as the window opens, so one tap shares them
  // (iPhone only allows the share sheet straight after a tap, not after a download)
  const saveBtn = m.$('#lsSavePhotos');
  let photoFilesReady = null;
  const setSave = (text, ready) => { if (!saveBtn) return; saveBtn.querySelector('span').textContent = text; saveBtn.disabled = !ready; };
  async function loadPhotoFiles() {
    setSave('Getting photos ready…', false);
    try {
      const files = await listingPhotoFiles(photos, p);
      if (!files.length) throw new Error('none');
      photoFilesReady = files;
      setSave(saveLabel(files.length), true);
      if (files.length < photos.length) m.$('#lsSaveHint').textContent = `${photos.length - files.length} photo${photos.length - files.length > 1 ? 's' : ''} couldn’t be prepared — save ${photos.length - files.length > 1 ? 'those' : 'that one'} from the item instead.`;
    } catch (err) {
      photoFilesReady = null;
      setSave('Try again', true);
      m.$('#lsSaveHint').textContent = err.code === 'unauthorized' ? 'Staff key missing — open Settings.'
        : /Unknown request/i.test(err.message || '') ? 'Deploy the latest Apps Script (new version) to turn this on.'
        : 'Couldn’t get the photos — check your connection and try again.';
    }
  }
  if (saveBtn) {
    loadPhotoFiles();
    saveBtn.addEventListener('click', async () => {
      if (!photoFilesReady) return loadPhotoFiles();
      const files = photoFilesReady;
      if (navigator.canShare && navigator.canShare({ files })) {
        try { await navigator.share({ files, title: p.name }); showAdminToast('✅ Photos shared'); }
        catch (err) { if (err.name !== 'AbortError') showAdminToast('⚠️ Couldn’t open the share sheet — ' + err.message); }
        return;
      }
      // Computer: download them one after another
      for (const f of files) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(f); a.download = f.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        await new Promise(r => setTimeout(r, 350));
      }
      showAdminToast(`⬇️ Downloaded ${files.length} photo${files.length > 1 ? 's' : ''}`);
    });
  }
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
    const before = p.stock || 0;
    p.stock = Math.max(0, before - c.qty);
    setStore('inventory', inv);
    setStore('sales', [sale, ...getSales()]);
    syncStorefront();
    saveRemote('sales', [sale], 'Record sale');
    saveRemote('inventory', [{ id: p.id, stock: p.stock, _expectStock: before }], 'Record sale');
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
    if (!rec) { m.close(); return showAdminToast('⚠️ This order was removed — nothing saved'); }
    rec.internalNotes = m.$('#od-notes').value.trim();
    setStore('sales', sales);
    const newStatus = m.$('#od-status').value;
    saveRemote('sales', [{ orderId, internalNotes: rec.internalNotes }], 'order notes');
    if (newStatus !== rec.status) updateSaleStatus(orderId, newStatus); // also saves + handles restock
    else renderSales();
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
      if (!rec) return;
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
    if (!rec) { m.close(); return showAdminToast('⚠️ This request was removed — nothing saved'); }
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
    saveRemote('repairs', [{ ticketId, status: rec.status, scheduledFor: rec.scheduledFor, assignedTo: rec.assignedTo,
      internalNotes: rec.internalNotes, paymentLogged: rec.paymentLogged || '' }], 'repair details');
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

// ─── Morning briefing ───
async function sendBriefingNow(btn) {
  btn.disabled = true;
  const label = btn.innerHTML;
  btn.innerHTML = `${ic('mail')} Sending…`;
  try {
    await apiPost('admin_briefing');
    showAdminToast('✅ Briefing sent — check oceansideappliance96@gmail.com');
  } catch (err) {
    if (err.code === 'unauthorized') handleApiError(err, 'Briefing'); else showAdminToast('⚠️ ' + err.message);
  } finally { btn.disabled = false; btn.innerHTML = label; }
}

// ─── FOLLOW-UPS (AI drafts, sent by you) ───
const followupDrafts = {}; // text you've edited but not sent yet, kept across refreshes
function renderFollowups() {
  const list = document.getElementById('followupsList');
  if (!list) return;
  list.querySelectorAll('.fu-msg').forEach(t => { if (t.value !== t.defaultValue) followupDrafts[t.id.slice(6)] = t.value; });
  const open = getStore('followups').filter(f => f.status === 'open')
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  document.getElementById('fuCount').textContent = open.length ? open.length : '';
  if (!open.length) {
    list.innerHTML = `<div class="fu-empty">${ic('check-circle')} Nothing to follow up on. Each morning the assistant drafts check-ins for finished repairs and sales, and reminders for reservations and viewing requests.</div>`;
    return;
  }
  list.innerHTML = open.map(f => {
    const id = esc(f.id);
    return `<div class="fu-item" data-id="${id}">
      <div class="fu-top">
        <strong>${esc(f.customer || 'Customer')}</strong>
        <span class="fu-kind">${esc(f.kindLabel || '')}</span>
        <span class="fu-about">${esc(f.about || '')}</span>
      </div>
      <textarea class="fu-msg" id="fumsg_${id}" rows="3" aria-label="Message to ${esc(f.customer)}">${esc(followupDrafts[f.id] ?? f.message)}</textarea>
      <div class="fu-actions">
        ${f.phone ? `<button class="card-btn primary" onclick="sendFollowup('${id}','sms')">${ic('phone')} Text ${esc(f.phone)}</button>` : ''}
        ${f.email ? `<button class="card-btn" onclick="sendFollowup('${id}','email')">${ic('mail')} Email</button>` : ''}
        <button class="card-btn" onclick="sendFollowup('${id}','copy')">${ic('copy')} Copy</button>
        <span class="fu-spacer"></span>
        <button class="card-btn" onclick="closeFollowup('${id}','sent')" title="I sent it">${ic('check')} Done</button>
        <button class="card-btn" onclick="closeFollowup('${id}','skipped')" title="Don't send">${ic('x')} Skip</button>
      </div>
    </div>`;
  }).join('');
  // Grow each box to fit its message so nothing is hidden on small screens
  list.querySelectorAll('.fu-msg').forEach(t => {
    const fit = () => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; };
    fit(); t.addEventListener('input', fit);
  });
}

function followupText(id) { return (document.getElementById('fumsg_' + id)?.value || followupDrafts[id] || '').trim(); }

async function sendFollowup(id, how) {
  const f = getStore('followups').find(x => x.id === id);
  if (!f) return;
  const text = followupText(id);
  if (how === 'copy') {
    try { await navigator.clipboard.writeText(text); showAdminToast('📋 Copied — paste it into your texts'); }
    catch { prompt('Copy this message:', text); }
    return;
  }
  if (how === 'sms') {
    // "?&body=" works on both iPhone and Android
    location.href = `sms:${String(f.phone).replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(text)}`;
  } else {
    location.href = `mailto:${encodeURIComponent(f.email)}?subject=${encodeURIComponent('Oceanside Appliance')}&body=${encodeURIComponent(text)}`;
  }
  setTimeout(() => {
    if (confirm('Did you send it? Tap OK to mark this follow-up as done.')) closeFollowup(id, 'sent');
  }, 1500);
}

async function closeFollowup(id, status) {
  const all = getStore('followups');
  const f = all.find(x => x.id === id);
  if (!f) return;
  const message = followupText(id) || f.message;
  Object.assign(f, { status, message, closedAt: new Date().toISOString() });
  delete followupDrafts[id];
  setStore('followups', all);
  renderFollowups();
  await saveRemote('followups', [{ id, status, message, closedAt: f.closedAt }], 'follow-up ' + status);
}

async function draftFollowupsNow(btn) {
  btn.disabled = true;
  const label = btn.innerHTML;
  btn.innerHTML = `${ic('sparkles')} Drafting…`;
  try {
    const res = await apiPost('admin_followups');
    await pullFromSheets({ silent: true, force: true });
    showAdminToast(res.created ? `✨ ${res.created} new follow-up${res.created > 1 ? 's' : ''} drafted` : 'Nothing new to follow up on right now');
  } catch (err) {
    if (err.code === 'unauthorized') handleApiError(err, 'Follow-ups'); else showAdminToast('⚠️ ' + err.message);
  } finally { btn.disabled = false; btn.innerHTML = label; }
}

// ─── Background jobs: website images + price research, one product at a time ───
const imageJobs = new Set(), priceJobs = new Set(), specJobs = new Set();
let jobChain = Promise.resolve();
function queueJob(fn) { jobChain = jobChain.then(fn, fn); return jobChain; }

async function runProductJobs({ type, ids, set, missing, label }) {
  const inv = getStore('inventory');
  const todo = (ids || inv.filter(p => (p.stock || 0) > 0 && missing(p)).map(p => p.id)).filter(id => !set.has(id));
  if (!todo.length) { if (!ids) showAdminToast(`✅ Nothing left to ${label}`); return; }
  todo.forEach(id => set.add(id));
  renderInventorySafely();
  return queueJob(async () => {
    let done = 0;
    for (const id of todo) {
      try {
        const { update } = await apiPost(type, { id });
        const all = getStore('inventory'); const p = all.find(x => x.id === id);
        if (p && update) { Object.assign(p, update); setStore('inventory', all); }
        if (update && (update.imageUrl || update.priceResearch || update.specs || update.desc)) done++;
      } catch (err) {
        if (err.code === 'unauthorized') { handleApiError(err, label); break; }
      } finally { set.delete(id); renderInventorySafely(); }
    }
    todo.forEach(id => set.delete(id));
    syncStorefront(); renderInventorySafely();
    const what = { admin_auto_images: '🖼 Website images', admin_auto_price: '💲 Price research', admin_auto_specs: '📐 Specs & dimensions' }[type];
    showAdminToast(`${what}: ${done} of ${todo.length} updated${done < todo.length ? (type === 'admin_auto_specs' ? ' — the rest were already complete or their model wasn’t found' : ' — hover the tag to see why') : ''}`);
  });
}

function findMissingWebImages(ids) {
  return runProductJobs({ type: 'admin_auto_images', ids, set: imageJobs, label: 'find images for',
    missing: p => !String(p.imageUrl || '').trim() });
}
// Look up each in-stock item's model number online: add missing specs & dimensions, remove
// stockroom-only specs, and fix descriptions that talk about the photos. Once per item.
function fillMissingSpecs(ids) {
  return runProductJobs({ type: 'admin_auto_specs', ids, set: specJobs, label: 'fill in specs for',
    missing: p => String(p.model || '').trim() && !p.specsCheckedAt });
}
function researchMissingPrices(ids) {
  return runProductJobs({ type: 'admin_auto_price', ids, set: priceJobs, label: 'research prices for',
    missing: p => !p.priceResearch });
}
