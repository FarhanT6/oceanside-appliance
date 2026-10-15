// ============================================
//   OCEANSIDE APPLIANCE — BULK ADD FROM PHOTOS
//   1. Pick lots of photos → sorted by when they were taken
//   2. AI groups them by appliance (using small previews)
//   3. AI reads each group's details from the full-size label photos
//   4. Review / fix groups, add prices, save as drafts or publish
// ============================================

// ─── Photo date from EXIF (DateTimeOriginal), falling back to file date ───
async function photoTakenAt(file) {
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xFFD8) throw 0;
    let off = 2;
    while (off + 4 < v.byteLength) {
      const marker = v.getUint16(off), size = v.getUint16(off + 2);
      if (marker === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) { // "Exif"
        const tiff = off + 10;
        const le = v.getUint16(tiff) === 0x4949;
        const u16 = o => v.getUint16(o, le), u32 = o => v.getUint32(o, le);
        const readTag = (ifd, tag) => {
          const n = u16(ifd);
          for (let i = 0; i < n; i++) {
            const e = ifd + 2 + i * 12;
            if (u16(e) === tag) return e;
          }
          return null;
        };
        const ifd0 = tiff + u32(tiff + 4);
        const exifPtr = readTag(ifd0, 0x8769);
        const exifIfd = exifPtr ? tiff + u32(exifPtr + 8) : null;
        const entry = (exifIfd && (readTag(exifIfd, 0x9003) || readTag(exifIfd, 0x9004))) || readTag(ifd0, 0x0132);
        if (entry) {
          const start = tiff + u32(entry + 8);
          let str = '';
          for (let i = 0; i < 19; i++) str += String.fromCharCode(v.getUint8(start + i));
          const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(str);
          if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
        }
        break;
      }
      if ((marker & 0xFF00) !== 0xFF00) break;
      off += 2 + size;
    }
  } catch { /* no EXIF — use the file date */ }
  return file.lastModified || null;
}

async function previewBase64(file, max = 512) {
  const b64 = await resizeToJpegBase64(file, max, 0.7);
  return b64;
}

// Run async jobs with limited concurrency
async function runPool(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx], idx); }
  });
  await Promise.all(workers);
}

// Split into chunks of ≤ max photos, cutting at the biggest time gap
function chunkByGaps(items, max = 24) {
  const chunks = [];
  let start = 0;
  while (items.length - start > max) {
    let cut = start + max, best = -1;
    for (let j = start + Math.floor(max / 2); j < start + max; j++) {
      const gap = (items[j].time || 0) - (items[j - 1].time || 0);
      if (gap > best) { best = gap; cut = j; }
    }
    chunks.push([start, cut]);
    start = cut;
  }
  chunks.push([start, items.length]);
  return chunks;
}

// ─── The importer ───
function openBulkImport() {
  let lastLoc = '', autoPrice = true;
  try { lastLoc = localStorage.getItem('oa_last_location') || ''; autoPrice = localStorage.getItem('oa_auto_price') !== 'off'; } catch {}
  const S = { items: [], groups: [], uploading: 0, phase: 'pick', location: lastLoc, autoPrice };

  const m = openAdminModal({
    title: 'Bulk add from photos',
    size: 'wide',
    dismissable: false,
    body: `<div id="biBody"></div>`,
    footer: `<span class="hint" id="biStatus"></span><span style="flex:1"></span>
      <button type="button" class="card-btn" data-am-close>Cancel</button>
      <button type="button" class="card-btn" id="biDrafts" hidden>Save all as drafts</button>
      <button type="button" class="card-btn primary" id="biPublish" hidden>Save &amp; publish priced items</button>`,
  });
  const body = m.$('#biBody');
  const status = t => { m.$('#biStatus').textContent = t; };

  // ── Step 1: pick photos ──
  body.innerHTML = `
    <div class="bi-pick">
      ${ic('camera')}
      <h3>Choose all the photos you want to add</h3>
      <p>Select them in one go — phone camera roll or a computer folder. They'll be sorted by when they were taken, grouped by appliance, and the model number is read from whichever photo shows the sticker or box label. These photos stay private (inventory only) — customers see product images found online.</p>
      <label class="upload-btn">${ic('camera')}<span>Choose photos</span><input type="file" id="biFiles" accept="image/*" multiple hidden /></label>
      <p class="hint">Tip: photograph the model sticker or box label for each appliance. On a phone, keep this screen open until the photos finish uploading.</p>
    </div>`;
  m.$('#biFiles').addEventListener('change', e => start([...e.target.files]));

  async function start(files) {
    if (!files.length) return;
    S.phase = 'group';
    body.innerHTML = `<div class="bi-progress"><div class="spin"></div><div><strong id="biStep">Reading photo dates…</strong><div class="hint" id="biSub"></div></div></div><div class="bi-strip" id="biStrip"></div>`;
    const step = t => { const el = m.$('#biStep'); if (el) el.textContent = t; };
    const sub = t => { const el = m.$('#biSub'); if (el) el.textContent = t; };

    // Keep the phone screen awake so a big batch isn't interrupted
    try { S.wake = await navigator.wakeLock?.request('screen'); } catch {}

    // Sort by time taken (then file name)
    S.items = files.map((file, n) => ({ file, n, time: null, url: '', preview: '' }));
    await runPool(S.items, 6, async it => { it.time = await photoTakenAt(it.file); });
    S.items.sort((a, b) => ((a.time || 0) - (b.time || 0)) || a.file.name.localeCompare(b.file.name, undefined, { numeric: true }));
    m.$('#biStrip').innerHTML = S.items.map((it, k) => `<span class="bi-ph" data-k="${k}"></span>`).join('');

    // Small previews only (full-size photos would use too much memory on a phone).
    // Two at a time; each one is shown as soon as it's ready.
    step('Making previews…');
    let made = 0;
    await runPool(S.items, 2, async (it, k) => {
      try {
        it.thumb = await previewBase64(it.file);
        it.preview = 'data:image/jpeg;base64,' + it.thumb;
        const slot = m.$(`#biStrip [data-k="${k}"]`);
        if (slot) slot.outerHTML = `<img src="${it.preview}" alt="" />`;
      } catch (err) { it.error = err.message || 'Could not open photo'; }
      sub(`${++made} of ${S.items.length}`);
    });
    sub('');
    const unreadable = S.items.filter(it => it.error).length;
    if (unreadable) showAdminToast(`⚠️ ${unreadable} photo${unreadable > 1 ? 's' : ''} couldn't be opened and ${unreadable > 1 ? 'were' : 'was'} left out`);
    S.items = S.items.filter(it => !it.error);
    if (!S.items.length) { m.close(); return; }

    // Full-size uploads run in the background (two at a time) while the AI groups the previews
    S.uploading = S.items.length;
    const uploads = runPool(S.items, 2, async it => {
      try { it.url = await uploadPhoto(it.file); } catch (err) { it.error = err.message || 'Upload failed'; }
      S.uploading--;
      updateFooter();
    });

    step('Grouping photos by appliance…');
    const chunks = chunkByGaps(S.items);
    S.groups = [];
    for (let c = 0; c < chunks.length; c++) {
      const [a, b] = chunks[c];
      sub(chunks.length > 1 ? `Batch ${c + 1} of ${chunks.length}` : `${S.items.length} photos`);
      try {
        const { groups } = await apiPost('admin_ai_group', {
          photos: S.items.slice(a, b).map(it => ({ data: it.thumb, time: it.time ? new Date(it.time).toISOString() : null })),
        });
        groups.forEach(g => S.groups.push(newGroup(g.photoIndexes.map(i => i + a), g.labelPhotoIndexes.map(i => i + a), g)));
      } catch (err) {
        if (err.code === 'unauthorized') { handleApiError(err, 'AI'); m.close(); return; }
        // AI unavailable: fall back to one group per time cluster so nothing is lost
        showAdminToast('⚠️ AI grouping failed for a batch — grouped by time instead. ' + err.message);
        timeClusters(a, b).forEach(idx => S.groups.push(newGroup(idx, [], {})));
      }
    }
    S.phase = 'review';
    renderReview();
    updateFooter();
    readAllDetails(uploads);
  }

  function timeClusters(a, b) {
    const out = [[a]];
    for (let i = a + 1; i < b; i++) {
      const gap = (S.items[i].time || 0) - (S.items[i - 1].time || 0);
      if (gap > 90 * 1000) out.push([i]); else out[out.length - 1].push(i);
    }
    return out;
  }

  function newGroup(idx, labels, g) {
    return {
      key: Math.random().toString(36).slice(2), idx, labels, keep: true,
      confidence: g.confidence || 'low', looksLike: g.looksLike || '',
      f: { name: '', brand: g.brand || '', model: '', category: g.category || '', condition: g.inBox ? 'New' : 'Used - Good', price: '', msrp: '', stock: 1, desc: '', specs: {}, storageLocation: S.location || '', priceResearch: null },
      edited: new Set(), ai: 'waiting',
    };
  }

  // ── Step 3: read details per group from full-size photos ──
  async function readAllDetails(uploadsDone) {
    await uploadsDone;
    try { S.wake?.release(); } catch {}
    const failed = S.items.filter(it => it.error).length;
    if (failed) showAdminToast(`⚠️ ${failed} photo${failed > 1 ? 's' : ''} didn't upload and will be left out`);
    await runPool(S.groups, 2, readDetails);
    status('');
    mergeSameModel();
    if (S.autoPrice) await runPool(S.groups.filter(g => g.keep && !g.f.priceResearch), 2, researchPrice);
  }

  // Neighbouring groups that turned out to have the same model number are one appliance
  // photographed in two bursts (e.g. in the box, then unboxed) — join them.
  function mergeSameModel() {
    const norm = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    let merged = 0;
    for (let n = S.groups.length - 1; n > 0; n--) {
      const g = S.groups[n], prev = S.groups[n - 1];
      if (!g.keep || !prev.keep) continue;
      const a = norm(g.f.model), b = norm(prev.f.model);
      if (a.length < 5 || a !== b) continue;
      if (g.labels.length && prev.labels.length) { g.sameAsAbove = true; continue; } // each has its own label shot: likely two units
      prev.idx = [...prev.idx, ...g.idx].sort((x, y) => x - y);
      prev.labels = [...prev.labels, ...g.labels];
      prev.mergedNote = true;
      if (!prev.f.desc && g.f.desc) prev.f.desc = g.f.desc;
      S.groups.splice(n, 1);
      merged++;
    }
    if (merged) {
      renderReview(); updateFooter();
      showAdminToast(`🔗 Joined ${merged} duplicate group${merged > 1 ? 's' : ''} with the same model number — use ✂ if they were really separate units`);
    }
  }

  async function researchPrice(g) {
    if (!g.keep) return;
    if (!g.f.model && !g.f.name) return;
    g.pricing = 'busy'; renderCard(g); updateFooter();
    try {
      const { pricing: r } = await apiPost('admin_ai_price', { product: { ...g.f } });
      if (r.suggestedPrice && !g.edited.has('price')) g.f.price = Math.round(r.suggestedPrice);
      if (r.msrp && !g.f.msrp) g.f.msrp = Math.round(r.msrp);
      if (r.suggestedPrice || r.rangeLow) g.f.priceResearch = priceResearchFrom(r);
      g.pricing = r.suggestedPrice || r.rangeLow ? 'done' : 'none';
    } catch (err) { g.pricing = 'error'; g.priceErr = err.message; }
    renderCard(g); updateFooter();
  }
  async function readDetails(g) {
    if (!g.keep) return;
    const order = [...g.labels, ...g.idx.filter(i => !g.labels.includes(i))];
    const urls = order.map(i => S.items[i].url).filter(Boolean).slice(0, 4);
    if (!urls.length) { g.ai = 'error'; return renderCard(g); }
    g.ai = 'reading'; renderCard(g); updateFooter();
    try {
      const { suggestion: s } = await apiPost('admin_ai_product', { images: urls, hints: { brand: g.f.brand, category: g.f.category } });
      const set = (k, val) => { if (val && !g.edited.has(k)) g.f[k] = val; };
      set('name', s.name); set('brand', s.brand); set('model', s.model); set('category', s.category); set('desc', s.description);
      if (s.conditionGuess && s.conditionGuess !== 'Unknown') set('condition', s.conditionGuess);
      if (Array.isArray(s.specs)) g.f.specs = Object.fromEntries(s.specs.filter(x => x.label && x.value).map(x => [x.label, x.value]));
      g.check = s.checkBeforeSaving || '';
      g.ai = 'done';
    } catch (err) { g.ai = 'error'; g.err = err.message; }
    renderCard(g); updateFooter();
  }

  // ── Step 4: review ──
  function renderReview() {
    const kept = S.groups.filter(g => g.keep).length;
    body.innerHTML = `
      <div class="bi-summary">${ic('sparkles')}<span>Found <strong>${kept} appliance${kept === 1 ? '' : 's'}</strong> in ${S.items.length} photos. Check each group — use the arrows under a photo to move it, <strong>✂</strong> to start a new appliance from that photo, or <strong>Merge</strong> to join a group with the one above.</span></div>
      <label class="check-line bi-auto-price"><input type="checkbox" id="biAutoPrice" ${S.autoPrice ? 'checked' : ''} /> Research prices automatically <span class="hint">(fills in the price + saves the market range · about 10–30¢ each)</span></label>
      <label class="af bi-loc-all"><span class="af-label">Storage location for all <span class="hint">staff only · you can change it per appliance below</span></span>
        <input id="biLocAll" value="${esc(S.location || '')}" placeholder="e.g. Ramona, Tremont, Unit A" /></label>
      <div id="biGroups">${S.groups.map((g, n) => `<div class="bi-card" data-key="${g.key}"></div>`).join('')}</div>`;
    S.groups.forEach(renderCard);
  }

  function renderCard(g) {
    const el = body.querySelector(`.bi-card[data-key="${g.key}"]`);
    if (!el) return;
    const n = S.groups.indexOf(g);
    el.classList.toggle('removed', !g.keep);
    const conf = { high: '', medium: 'Check grouping', low: 'Please check grouping' }[g.confidence] || '';
    const aiLabel = { waiting: 'Waiting for photos to upload…', reading: 'Reading label…', done: '', error: `Couldn't read details${g.err ? ' — ' + esc(g.err) : ''}` }[g.ai];
    if (!g.keep) {
      el.innerHTML = `<div class="bi-removed">Appliance ${n + 1} removed · ${g.idx.length} photo${g.idx.length === 1 ? '' : 's'} <button type="button" class="link-btn" data-act="restore">Undo</button></div>`;
      return;
    }
    el.innerHTML = `
      <div class="bi-head">
        <strong>Appliance ${n + 1}</strong><span class="hint">${g.idx.length} photo${g.idx.length === 1 ? '' : 's'}${g.looksLike ? ' · ' + esc(g.looksLike) : ''}</span>
        ${conf ? `<span class="urg-tag" style="color:#b9770e;background:#b9770e1a">${conf}</span>` : ''}
        ${aiLabel ? `<span class="hint bi-ai ${g.ai}">${g.ai === 'reading' ? '<span class="mini-spin"></span>' : ''}${aiLabel}</span>` : ''}
        <span style="flex:1"></span>
        ${n > 0 ? `<button type="button" class="link-btn" data-act="merge">Merge with above</button>` : ''}
        <button type="button" class="link-btn" data-act="reread">${ic('sparkles')} Re-read</button>
        <button type="button" class="link-btn danger" data-act="remove">Remove</button>
      </div>
      <div class="bi-photos">${g.idx.map((i, pos) => {
        const it = S.items[i];
        return `<div class="bi-photo${g.labels.includes(i) ? ' label' : ''}${it.error ? ' failed' : ''}">
          <img src="${it.preview}" alt="" />
          ${pos === 0 ? '<span class="cover">Cover</span>' : ''}${g.labels.includes(i) ? '<span class="lbl">Label</span>' : ''}
          ${!it.url && !it.error ? '<span class="up"><span class="mini-spin"></span></span>' : ''}
          <div class="tile-actions">
            <button type="button" data-act="prev" data-i="${i}" title="Move to previous appliance" ${n === 0 ? 'disabled' : ''}>${ic('chevron-left')}</button>
            ${pos > 0 ? `<button type="button" data-act="split" data-i="${i}" title="New appliance starts here">✂</button>` : `<span></span>`}
            ${pos > 0 ? `<button type="button" data-act="cover" data-i="${i}" title="Make cover photo">★</button>` : ''}
            <button type="button" data-act="next" data-i="${i}" title="Move to next appliance" ${n === S.groups.length - 1 ? 'disabled' : ''}>${ic('chevron-right')}</button>
          </div>
        </div>`;
      }).join('')}</div>
      <div class="bi-fields">
        <label class="af bi-name"><span class="af-label">Name</span><input data-f="name" value="${esc(g.f.name)}" placeholder="${esc(g.looksLike)}" /></label>
        <label class="af"><span class="af-label">Brand</span><input data-f="brand" value="${esc(g.f.brand)}" /></label>
        <label class="af"><span class="af-label">Model #</span><input data-f="model" value="${esc(g.f.model)}" /></label>
        <label class="af"><span class="af-label">Type</span><select data-f="category"><option value="">Select…</option>${options(CATEGORY_OPTIONS, g.f.category)}</select></label>
        <label class="af"><span class="af-label">Condition</span><select data-f="condition">${options(CONDITIONS, g.f.condition)}</select></label>
        <label class="af"><span class="af-label">Price ($)</span><input data-f="price" type="number" min="0" value="${esc(g.f.price)}" placeholder="Optional" /></label>
        <label class="af"><span class="af-label">Stock</span><input data-f="stock" type="number" min="1" value="${esc(g.f.stock)}" /></label>
        <label class="af bi-loc"><span class="af-label">Location <span class="hint">staff only</span></span><input data-f="storageLocation" value="${esc(g.f.storageLocation)}" placeholder="e.g. Ramona" /></label>
        <label class="af bi-desc"><span class="af-label">Description</span><textarea data-f="desc" rows="2">${esc(g.f.desc)}</textarea></label>
      </div>
      ${g.sameAsAbove ? `<div class="ai-note">${ic('sparkles')}<span>Same model number as the appliance above. If it's the same unit, tap “Merge with above”; if you have two, keep both (or set Stock to 2 above and remove this one).</span></div>` : ''}
      ${g.mergedNote ? `<div class="ai-note">${ic('sparkles')}<span>Joined two photo groups with the same model number. If these are two separate units, use ✂ to split them.</span></div>` : ''}
      ${g.f.priceResearch ? priceRangeBox(g.f.priceResearch)
        : g.pricing === 'busy' ? `<div class="range-box empty"><span><span class="mini-spin"></span> Researching price online…</span></div>`
        : g.pricing === 'none' ? `<div class="range-box empty"><span>Not enough price data found online — set the price yourself.</span></div>`
        : g.pricing === 'error' ? `<div class="range-box empty"><span>Price research failed${g.priceErr ? ' — ' + esc(g.priceErr) : ''}. Tap “Research price” to try again.</span></div>` : ''}
      ${g.check ? `<div class="ai-note">${ic('sparkles')}<span>Double-check: ${esc(g.check)}</span></div>` : ''}
      <div class="bi-actions">
        <button type="button" class="ai-btn small" data-act="price">${ic('search')}<span>Research price</span></button>
        <span class="hint bi-price-note"></span>
      </div>`;
  }

  // Field edits (no re-render, so typing isn't interrupted)
  body.addEventListener('change', e => {
    if (e.target.id !== 'biAutoPrice') return;
    S.autoPrice = e.target.checked;
    try { localStorage.setItem('oa_auto_price', S.autoPrice ? 'on' : 'off'); } catch {}
    if (S.autoPrice && S.groups.every(g => g.ai !== 'reading' && g.ai !== 'waiting')) runPool(S.groups.filter(g => g.keep && !g.f.priceResearch && !g.pricing), 2, researchPrice);
  });
  body.addEventListener('input', e => {
    if (e.target.id === 'biLocAll') {
      S.location = e.target.value;
      try { localStorage.setItem('oa_last_location', S.location.trim()); } catch {}
      S.groups.forEach(g => {
        if (g.edited.has('storageLocation')) return;
        g.f.storageLocation = S.location;
        const input = body.querySelector(`.bi-card[data-key="${g.key}"] [data-f="storageLocation"]`);
        if (input) input.value = S.location;
      });
      return;
    }
    const f = e.target.dataset.f; if (!f) return;
    const g = S.groups.find(x => x.key === e.target.closest('.bi-card')?.dataset.key); if (!g) return;
    g.f[f] = e.target.value; g.edited.add(f);
  });

  body.addEventListener('click', async e => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const card = btn.closest('.bi-card');
    const g = S.groups.find(x => x.key === card?.dataset.key); if (!g) return;
    const n = S.groups.indexOf(g);
    const i = btn.dataset.i !== undefined ? +btn.dataset.i : null;
    const act = btn.dataset.act;
    const take = idx => { g.idx = g.idx.filter(x => x !== idx); g.labels = g.labels.filter(x => x !== idx); };

    if (act === 'remove') { g.keep = false; renderCard(g); return updateFooter(); }
    if (act === 'restore') { g.keep = true; renderCard(g); return updateFooter(); }
    if (act === 'reread') return readDetails(g);
    if (act === 'cover') { g.idx = [i, ...g.idx.filter(x => x !== i)]; return renderCard(g); }
    if (act === 'prev' || act === 'next') {
      const target = S.groups[act === 'prev' ? n - 1 : n + 1];
      take(i);
      target.idx.push(i); target.idx.sort((a, b) => a - b);
      if (!g.idx.length) S.groups.splice(n, 1);
      return renderReview(), updateFooter();
    }
    if (act === 'split') {
      const pos = g.idx.indexOf(i);
      const moved = g.idx.slice(pos);
      g.idx = g.idx.slice(0, pos);
      const labels = g.labels.filter(x => moved.includes(x));
      g.labels = g.labels.filter(x => !moved.includes(x));
      const ng = newGroup(moved, labels, { category: g.f.category });
      ng.confidence = 'high';
      S.groups.splice(n + 1, 0, ng);
      renderReview(); updateFooter();
      readDetails(g); readDetails(ng);
      return;
    }
    if (act === 'merge') {
      let k = n - 1; while (k > 0 && !S.groups[k].keep) k--;
      const above = S.groups[k];
      if (!above.keep) above.keep = true;
      above.idx = [...above.idx, ...g.idx].sort((a, b) => a - b);
      above.labels = [...above.labels, ...g.labels];
      S.groups.splice(n, 1);
      renderReview(); updateFooter();
      return readDetails(above);
    }
    if (act === 'price') return researchPrice(g);
  });

  function updateFooter() {
    if (S.phase !== 'review') { status(S.uploading ? `Uploading photos… ${S.items.length - S.uploading}/${S.items.length}` : ''); return; }
    const kept = S.groups.filter(g => g.keep);
    const busy = S.uploading > 0;
    m.$('#biDrafts').hidden = m.$('#biPublish').hidden = false;
    const working = kept.filter(g => g.ai === 'waiting' || g.ai === 'reading' || g.pricing === 'busy').length;
    m.$('#biDrafts').disabled = m.$('#biPublish').disabled = busy || working > 0 || !kept.length || S.saving;
    status(busy ? `Uploading photos… ${S.items.length - S.uploading}/${S.items.length}`
      : working ? `Reading labels and prices… ${kept.length - working}/${kept.length} done`
      : `${kept.length} appliance${kept.length === 1 ? '' : 's'} ready`);
  }

  async function save(publish) {
    if (S.saving) return;
    const kept = S.groups.filter(g => g.keep);
    const missing = kept.findIndex(g => !(g.f.name || g.looksLike) || !g.f.category);
    if (missing >= 0) {
      showAdminToast(`⚠️ Appliance ${S.groups.indexOf(kept[missing]) + 1} needs a name and type`);
      body.querySelector(`.bi-card[data-key="${kept[missing].key}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const stamp = Date.now();
    const records = kept.map((g, k) => {
      const price = parseFloat(g.f.price) || 0;
      const urls = g.idx.map(i => S.items[i].url).filter(Boolean);
      return {
        id: `PROD-${stamp + k}`, createdAt: new Date().toISOString(),
        name: g.f.name || g.looksLike, brand: g.f.brand, model: g.f.model, category: g.f.category,
        condition: g.f.condition, price, msrp: parseFloat(g.f.msrp) || 0, refPrice: 0,
        stock: Math.max(1, parseInt(g.f.stock, 10) || 1), desc: g.f.desc, specs: g.f.specs || {},
        imageUrl: '', internalPhotos: urls.join(', '), storageLocation: String(g.f.storageLocation || '').trim(),
        priceResearch: g.f.priceResearch || null,
        draft: !(publish && price > 0),
      };
    });
    S.saving = true; updateFooter(); status('Saving…');
    const ok = await saveRemote('inventory', records, 'Bulk add');
    S.saving = false;
    if (!ok) { updateFooter(); status('Not saved — check your connection and try again'); return; }
    setStore('inventory', [...getStore('inventory'), ...records]);
    syncStorefront();
    renderInventory(); renderDashboard();
    const live = records.filter(r => !r.draft).length, drafts = records.length - live;
    m.close();
    showAdminToast(`✅ Added ${records.length} appliance${records.length === 1 ? '' : 's'}${live ? ` · ${live} live` : ''}${drafts ? ` · ${drafts} draft${drafts === 1 ? '' : 's'}` : ''} — now finding website images${records.some(r => !r.priceResearch) ? ' and prices' : ''}`);
    // Find website images (and any prices not researched yet) in the background, one at a time
    setTimeout(() => {
      findMissingWebImages(records.map(r => r.id));
      const unpriced = records.filter(r => !r.priceResearch).map(r => r.id);
      if (unpriced.length) researchMissingPrices(unpriced);
    }, 2500);
  }
  m.$('#biDrafts').addEventListener('click', () => save(false));
  m.$('#biPublish').addEventListener('click', () => save(true));
}
