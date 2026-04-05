// ============================================
//   OCEANSIDE APPLIANCE — ADMIN JS
//   Dashboard, Sales, Repairs, Inventory
// ============================================

// ─── DATA STORES (LocalStorage-backed) ───
function getStore(key) {
  try { return JSON.parse(localStorage.getItem('oa_' + key) || '[]'); }
  catch { return []; }
}
function setStore(key, val) {
  localStorage.setItem('oa_' + key, JSON.stringify(val));
}

function getSales()   { return getStore('sales'); }
function getRepairs() { return getStore('repairs'); }

// Sync full inventory to storefront-readable key
function syncStorefront() {
  const all = getInventory();
  localStorage.setItem('oa_inventory', JSON.stringify(all));
}

function getInventory() {
  // All products are admin-managed — return everything in storage
  const saved = getStore('inventory');
  return saved.map(p => ({
    ...p,
    icon: p.icon || '📦',
    stockStatus: p.stock <= 0 ? 'out' : 'in-stock',
  }));
}

// ─── SILENT AUTO-SYNC ───
// Called after every state change — fire-and-forget, never blocks the UI
function autoSyncInventory() {
  if (SHEETS_URL) logToSheetsAdmin('inventory_full', { inventory: getInventory() });
}
function autoSyncSales() {
  if (SHEETS_URL) logToSheetsAdmin('full_sync', { sales: getSales() });
}
function autoSyncRepairs() {
  if (SHEETS_URL) logToSheetsAdmin('full_sync', { repairs: getRepairs() });
}

// ─── TABS ───
function showTab(tabName) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));

  document.getElementById('tab-' + tabName)?.classList.add('active');
  document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');

  const titles = { dashboard: 'Dashboard', sales: 'Sales', repairs: 'Repair Requests', inventory: 'Inventory', ledger: 'Ledger' };
  document.getElementById('pageTitle').textContent = titles[tabName] || tabName;

  renderTab(tabName);
}

function renderTab(tab) {
  if (tab === 'dashboard') renderDashboard();
  else if (tab === 'sales')    renderSales();
  else if (tab === 'repairs')  renderRepairs();
  else if (tab === 'inventory') renderInventory();
  else if (tab === 'ledger')    renderLedger();
}

// ─── DASHBOARD ───
function renderDashboard() {
  const sales   = getSales();
  const repairs = getRepairs();
  const inv     = getInventory();

  const revenue = sales.reduce((s, o) => s + (o.total || 0), 0);
  document.getElementById('kpi-revenue').textContent  = '$' + revenue.toLocaleString();
  document.getElementById('kpi-orders').textContent   = sales.length;
  document.getElementById('kpi-repairs').textContent  = repairs.length;
  document.getElementById('kpi-lowstock').textContent = inv.filter(i => i.stock <= 0).length;

  // Recent sales
  const recentSales = [...sales].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5);
  document.getElementById('recentSalesTbody').innerHTML = recentSales.map(s => `
    <tr>
      <td><strong>${s.orderId}</strong></td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.items}</td>
      <td><strong>$${(s.total||0).toLocaleString()}</strong></td>
      <td>${formatDate(s.timestamp)}</td>
      <td><span class="status-badge ${s.status}">${s.status}</span></td>
    </tr>
  `).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--gray-mid);padding:1.5rem">No sales yet</td></tr>';

  renderViewRequests();

  // Recent repairs
  const recentRepairs = [...repairs].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5);
  document.getElementById('recentRepairsTbody').innerHTML = recentRepairs.map(r => `
    <tr>
      <td><strong>${r.ticketId}</strong></td>
      <td>${r.firstName} ${r.lastName}</td>
      <td>${r.applianceType}</td>
      <td><span class="status-badge ${r.status?.toLowerCase().replace(' ','')}">${r.status}</span></td>
    </tr>
  `).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--gray-mid);padding:1.5rem">No repair requests yet</td></tr>';
}

// ─── VIEWING REQUESTS ───
function getViewRequests() {
  try { return JSON.parse(localStorage.getItem('oa_view_requests') || '[]'); } catch(e) { return []; }
}

function renderViewRequests() {
  const reqs = getViewRequests();
  const tbody = document.getElementById('viewRequestsTbody');
  if (!tbody) return;
  tbody.innerHTML = reqs.map(r => `<tr>
    <td style="font-size:.78rem">${formatDate(r.timestamp)}</td>
    <td><strong>${r.name||'—'}</strong></td>
    <td>${r.phone||'—'}</td>
    <td style="font-size:.8rem">${r.email||'—'}</td>
    <td style="font-size:.82rem">${r.appliance||'—'}${r.brand?' · '+r.brand:''}</td>
    <td style="font-size:.78rem;color:var(--gray-mid)">${r.preferredTime||'—'}</td>
  </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--gray-mid);padding:1.5rem">No viewing requests yet.</td></tr>';
}

function clearViewRequests() {
  if (!confirm('Clear all viewing requests? This cannot be undone.')) return;
  localStorage.removeItem('oa_view_requests');
  renderViewRequests();
  showAdminToast('🗑️ Viewing requests cleared');
}

// ─── SALES ───
function renderSales() {
  const all   = getSales().sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
  const active = all.filter(s => s.status !== 'completed' && s.status !== 'cancelled');
  const done   = all.filter(s => s.status === 'completed' || s.status === 'cancelled');

  function row(s) {
    const statusColor = s.status === 'pending' ? '#e67e22' : s.status === 'completed' ? '#27ae60' : '#c0392b';
    return `<tr>
      <td><strong>${s.orderId}</strong></td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${s.items}">${s.items}</td>
      <td><strong>$${(s.total||0).toLocaleString()}</strong></td>
      <td>${formatDate(s.timestamp)}</td>
      <td>
        <select onchange="updateSaleStatus('${s.orderId}', this.value)" style="border:1px solid var(--gray-light);border-radius:6px;padding:.25rem .5rem;font-size:.78rem;font-family:var(--font-body);color:${statusColor};font-weight:600">
          <option ${s.status==='pending'?'selected':''}>pending</option>
          <option ${s.status==='completed'?'selected':''}>completed</option>
          <option ${s.status==='cancelled'?'selected':''}>cancelled</option>
        </select>
      </td>
      <td><button class="action-btn" onclick="deleteSale('${s.orderId}')" title="Delete">🗑️</button></td>
    </tr>`;
  }

  const sectionHeader = (label, count, color) =>
    `<tr><td colspan="6" style="background:${color};padding:.5rem 1rem;font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#fff">${label} (${count})</td></tr>`;

  let html = '';
  if (active.length) {
    html += sectionHeader('🔔 Needs Attention', active.length, '#e67e22');
    html += active.map(row).join('');
  }
  if (done.length) {
    html += sectionHeader('✓ Completed / Cancelled', done.length, '#7f8c8d');
    html += done.map(s => `<tr style="opacity:.65">${row(s).replace('<tr>','')}`).join('');
  }
  if (!all.length) {
    html = '<tr><td colspan="6" style="text-align:center;color:var(--gray-mid);padding:2rem">No orders yet.<br><small>Orders will appear here when customers checkout.</small></td></tr>';
  }
  document.getElementById('salesTbody').innerHTML = html;
}

function updateSaleStatus(orderId, status) {
  const sales = getSales();
  const sale = sales.find(s => s.orderId === orderId);
  if (sale) { sale.status = status; setStore('sales', sales); autoSyncSales(); }
}

function deleteSale(orderId) {
  if (!confirm('Delete this order record?')) return;
  setStore('sales', getSales().filter(s => s.orderId !== orderId));
  renderSales();
  autoSyncSales();
}

// ─── REPAIRS ───
function openDescModal(ticketId) {
  const r = getRepairs().find(r => r.ticketId === ticketId);
  if (!r) return;
  const overlay = document.createElement('div');
  overlay.id = 'descModalOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:2rem;max-width:520px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.2);position:relative">
      <div style="font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ocean);margin-bottom:.5rem">${r.ticketId} · ${r.firstName} ${r.lastName}</div>
      <div style="font-size:.8rem;color:var(--gray-mid);margin-bottom:1rem">${r.applianceType ? r.applianceType.charAt(0).toUpperCase()+r.applianceType.slice(1) : ''} ${r.brand ? '· '+r.brand : ''}</div>
      <div style="font-size:.95rem;color:var(--navy);line-height:1.65;white-space:pre-wrap;background:var(--bg-soft);border-radius:8px;padding:1rem 1.25rem">${r.description || 'No description provided.'}</div>
      <button onclick="document.getElementById('descModalOverlay').remove()" style="margin-top:1.5rem;width:100%;padding:.75rem;background:var(--ocean);color:#fff;border:none;border-radius:8px;font-family:var(--font-body);font-size:.875rem;font-weight:600;cursor:pointer">Close</button>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function renderRepairs() {
  const all    = getRepairs().sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
  const active = all.filter(r => r.status !== 'Completed' && r.status !== 'Cancelled');
  const done   = all.filter(r => r.status === 'Completed' || r.status === 'Cancelled');

  function repairRow(r) {
    return `<tr>
      <td><strong>${r.ticketId}</strong></td>
      <td>${r.firstName} ${r.lastName}<br><small style="color:var(--gray-mid)">${r.email}</small></td>
      <td>${r.phone}</td>
      <td style="text-transform:capitalize">${r.applianceType}</td>
      <td>${r.brand || '—'}</td>
      <td style="max-width:160px;font-size:.78rem;color:var(--gray-mid);cursor:pointer" title="Double-click to read full description" ondblclick="openDescModal('${r.ticketId}')">${r.description?.substring(0,60)}${r.description?.length>60?'… <span style="color:var(--ocean);font-size:.7rem">dbl-click</span>':''}</td>
      <td>
        <select onchange="updateRepairStatus('${r.ticketId}', this.value)" style="border:1px solid var(--gray-light);border-radius:6px;padding:.25rem .5rem;font-size:.78rem;font-family:var(--font-body)">
          <option ${r.status==='New'?'selected':''}>New</option>
          <option ${r.status==='Scheduled'?'selected':''}>Scheduled</option>
          <option ${r.status==='In Progress'?'selected':''}>In Progress</option>
          <option ${r.status==='Completed'?'selected':''}>Completed</option>
          <option ${r.status==='Cancelled'?'selected':''}>Cancelled</option>
        </select>
      </td>
      <td><button class="action-btn" onclick="deleteRepair('${r.ticketId}')" title="Delete">🗑️</button></td>
    </tr>`;
  }

  const sectionHeader = (label, count, color) =>
    `<tr><td colspan="8" style="background:${color};padding:.5rem 1rem;font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#fff">${label} (${count})</td></tr>`;

  let html = '';
  if (active.length) {
    html += sectionHeader('🔔 Active', active.length, '#e67e22');
    html += active.map(repairRow).join('');
  }
  if (done.length) {
    html += sectionHeader('✓ Completed / Cancelled', done.length, '#7f8c8d');
    html += done.map(r => `<tr style="opacity:.6">${repairRow(r).replace('<tr>','')}`).join('');
  }
  if (!all.length) {
    html = '<tr><td colspan="8" style="text-align:center;color:var(--gray-mid);padding:2rem">No repair requests yet.</td></tr>';
  }
  document.getElementById('repairsTbody').innerHTML = html;
}

function updateRepairStatus(ticketId, status) {
  const repairs = getRepairs();
  const r = repairs.find(r => r.ticketId === ticketId);
  if (r) { r.status = status; setStore('repairs', repairs); autoSyncRepairs(); }
}

function deleteRepair(ticketId) {
  if (!confirm('Delete this repair request?')) return;
  setStore('repairs', getRepairs().filter(r => r.ticketId !== ticketId));
  renderRepairs();
  autoSyncRepairs();
}

// ─── INVENTORY ───
function renderInventory() {
  const all     = getInventory();
  const inStock = all.filter(p => p.stock > 0).sort((a,b) => b.stock - a.stock);
  const outStock = all.filter(p => p.stock <= 0);

  function row(p) {
    const isOut = p.stock <= 0;
    const badge = isOut ? 'cancelled' : 'in-stock';
    const label = isOut ? 'Out of Stock' : 'In Stock';
    return `<tr style="${isOut ? 'opacity:.55' : ''}">
      <td style="font-size:.72rem;color:var(--gray-mid)">${p.id}</td>
      <td>
        <div style="font-weight:600;font-size:.875rem;color:var(--navy)">${p.name}</div>
        <div style="font-size:.72rem;color:var(--gray-mid)">${p.brand}</div>
      </td>
      <td style="text-transform:capitalize;font-size:.82rem">${p.category}</td>
      <td>
        <div style="margin-bottom:.25rem">
          <span id="condLabel_${p.id}" style="display:inline-block;padding:.15rem .5rem;border-radius:4px;font-size:.65rem;font-weight:700;background:${(p.condition||'').startsWith('New')?'rgba(39,174,96,.15)':'rgba(52,152,219,.12)'};color:${(p.condition||'').startsWith('New')?'#27ae60':'#2980b9'}">${p.condition||'Used - Good'}</span>
        </div>
        <select id="cond_${p.id}" onchange="const s=this;const lbl=document.getElementById('condLabel_'+s.dataset.pid);lbl.textContent=s.value;lbl.style.background=s.value.startsWith('New')?'rgba(39,174,96,.15)':'rgba(52,152,219,.12)';lbl.style.color=s.value.startsWith('New')?'#27ae60':'#2980b9'" data-pid="${p.id}" style="border:1px solid var(--gray-light);border-radius:6px;padding:.25rem .4rem;font-size:.72rem;font-family:var(--font-body);color:var(--navy);min-width:120px">
          ${['New','New (Open Box)','Used - Excellent','Used - Good','Used - Fair','For Parts'].map(c=>`<option value="${c}" ${(p.condition||'Used - Good')===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </td>
      <td>
        <input type="text" id="loc_${p.id}" value="${p.storageLocation||''}" placeholder="e.g. Unit A"
          style="width:110px;padding:.3rem .4rem;border:1px solid var(--gray-light);border-radius:6px;font-size:.78rem;font-family:var(--font-body);color:var(--navy)"/>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:.4rem">
          <span style="font-size:.72rem;color:var(--gray-mid)">$</span>
          <input type="number" id="price_${p.id}" value="${p.price}" min="0"
            style="width:70px;padding:.3rem .4rem;border:1px solid var(--gray-light);border-radius:6px;font-size:.82rem;font-family:var(--font-body);color:var(--navy)"/>
        </div>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:.4rem">
          <button onclick="adjustStock('${p.id}',-1)" style="width:24px;height:24px;border:1px solid var(--gray-light);background:var(--white);border-radius:5px;cursor:pointer;font-size:.9rem">−</button>
          <input type="number" id="stock_${p.id}" value="${p.stock}" min="0"
            style="width:52px;padding:.3rem .4rem;border:1px solid var(--gray-light);border-radius:6px;font-size:.9rem;font-weight:600;text-align:center;font-family:var(--font-body);color:var(--navy)"/>
          <button onclick="adjustStock('${p.id}',1)" style="width:24px;height:24px;border:1px solid var(--gray-light);background:var(--white);border-radius:5px;cursor:pointer;font-size:.9rem">+</button>
        </div>
      </td>
      <td><span class="status-badge ${badge}">${label}</span></td>
      <td>
        <button class="stock-save-btn" onclick="saveInventoryRow('${p.id}')">Save</button>
        <button onclick="removeProduct('${p.id}')" style="background:none;border:none;cursor:pointer;color:var(--gray-mid);font-size:.9rem;padding:4px;margin-left:2px" title="Remove">🗑️</button>
      </td>
    </tr>`;
  }

  const sectionHeader = (label, count, color) =>
    `<tr><td colspan="8" style="background:${color};padding:.5rem 1rem;font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#fff">${label} (${count})</td></tr>`;

  let html = '';
  if (inStock.length) {
    html += sectionHeader('✅ In Stock', inStock.length, '#1a7fc1');
    html += inStock.map(row).join('');
  }
  if (outStock.length) {
    html += sectionHeader('⚠️ Sold Out', outStock.length, '#7f8c8d');
    html += outStock.map(row).join('');
  }
  if (!all.length) {
    html = '<tr><td colspan="8" style="text-align:center;color:var(--gray-mid);padding:2rem">No products yet.<br><small>Add products using the + Add Product button above.</small></td></tr>';
  }
  document.getElementById('inventoryTbody').innerHTML = html;
}

function adjustStock(productId, delta) {
  const input = document.getElementById('stock_' + productId);
  input.value = Math.max(0, (parseInt(input.value) || 0) + delta);
}

function saveStock(productId) { saveInventoryRow(productId); }

function saveInventoryRow(productId) {
  const stockInput = document.getElementById('stock_' + productId);
  const priceInput = document.getElementById('price_' + productId);
  const newQty   = parseInt(stockInput.value);
  const newPrice = parseFloat(priceInput.value);
  if (isNaN(newQty) || newQty < 0) return;
  // Work on raw saved store to preserve _custom flag
  const saved = getStore('inventory');
  const existing = saved.find(s => s.id === productId);
  if (existing) {
    existing.stock = newQty;
    existing.price = isNaN(newPrice) ? existing.price : newPrice;
    existing.stockStatus = newQty <= 0 ? 'out' : 'in-stock';
  } else {
    // Base product being saved for first time
    const item = getInventory().find(i => i.id === productId);
    if (!item) return;
    saved.push({ id: item.id, name: item.name, brand: item.brand,
      category: item.category, price: isNaN(newPrice) ? item.price : newPrice,
      stock: newQty, stockStatus: newQty <= 0 ? 'out' : 'in-stock' });
  }
  const inv = getInventory(); // for toast name lookup
  const item = inv.find(i => i.id === productId);
  setStore('inventory', saved);
  syncStorefront();
  renderInventory();
  autoSyncInventory(); // auto-sync full inventory on individual row save
  showAdminToast(`✅ ${item.name} updated`);
}

function saveAllInventory() {
  // Work from the raw saved store so we never strip _custom or other fields
  const saved = getStore('inventory');
  const allItems = getInventory(); // merged view for reading current input values

  allItems.forEach(item => {
    const si = document.getElementById('stock_' + item.id);
    const pi = document.getElementById('price_' + item.id);
    const newStock = si ? Math.max(0, parseInt(si.value) || 0) : item.stock;
    const newPrice = pi ? (parseFloat(pi.value) || item.price) : item.price;
    const newStatus = newStock <= 0 ? 'out' : 'in-stock';

    const existing = saved.find(s => s.id === item.id);
    if (existing) {
      // Update in place — preserves _custom and all other fields
      existing.stock = newStock;
      existing.price = newPrice;
      existing.stockStatus = newStatus;
      const locEl = document.getElementById('loc_' + item.id);
      if (locEl !== null) existing.storageLocation = locEl.value.trim();
      const condEl  = document.getElementById('cond_' + item.id);
      if (condEl !== null) existing.condition = condEl.value;
      const msrpEl  = document.getElementById('msrp_' + item.id);
      if (msrpEl !== null) existing.msrp = parseFloat(msrpEl.value) || 0;
      const refEl   = document.getElementById('ref_' + item.id);
      if (refEl !== null) existing.refPrice = parseFloat(refEl.value) || 0;
      const imgEl   = document.getElementById('img_' + item.id);
      if (imgEl !== null) existing.imageUrl = imgEl.value.trim();
    } else {
      // First time saving this product (base product with changes)
      saved.push({ id: item.id, name: item.name, brand: item.brand,
        category: item.category, price: newPrice,
        stock: newStock, stockStatus: newStatus });
    }
  });

  setStore('inventory', saved);
  syncStorefront();
  renderInventory();
  autoSyncInventory();
  showAdminToast('✅ All inventory saved!');
}

function removeProduct(productId) {
  const inv  = getInventory();
  const item = inv.find(i => i.id === productId);
  if (!item || !confirm(`Remove "${item.name}" from inventory?`)) return;
  setStore('inventory', inv.filter(i => i.id !== productId));
  syncStorefront();
  renderInventory();
  autoSyncInventory();
  showAdminToast(`🗑️ ${item.name} removed`);
}

function showAddProduct() {
  document.getElementById('addProductModal').style.display = 'flex';
}

function hideAddProduct() {
  document.getElementById('addProductModal').style.display = 'none';
  document.getElementById('addProductForm').reset();
}

function submitNewProduct() {
  const get = id => document.getElementById(id)?.value?.trim();
  const name     = get('np-name');
  const brand    = get('np-brand');
  const category = get('np-category');
  const price    = parseFloat(get('np-price'));
  const stock    = parseInt(get('np-stock'));
  const desc     = get('np-desc');
  const model          = get('np-model') || '';
  const storageLocation = get('np-location') || '';
  const condition      = document.getElementById('np-condition')?.value || 'Used - Good';
  const msrp           = parseFloat(document.getElementById('np-msrp')?.value) || 0;
  const refPrice       = parseFloat(document.getElementById('np-refprice')?.value) || 0;
  const imageUrl       = document.getElementById('np-image')?.value.trim() || '';
  if (!name || !brand || !category || isNaN(price) || isNaN(stock)) {
    showAdminToast('⚠️ Please fill in all required fields'); return;
  }
  const icons = { refrigerator:'🧊', washer:'👕', dryer:'🌀', dishwasher:'🍽️', oven:'🔥', microwave:'📡', freezer:'❄️', vacuum:'🧹', other:'📦' };
  const newProduct = {
    id: 'PROD-' + Date.now(), name, brand, category, price, stock, desc,
    stockStatus: stock <= 0 ? 'out' : 'in-stock',
    icon: icons[category] || '📦', badge: null, oldPrice: null, _custom: true, specs: {},
    storageLocation, condition, model
  };
  const inv = getInventory();
  inv.push(newProduct);
  setStore('inventory', inv);
  syncStorefront();
  autoSyncInventory(); // auto-sync on new product add
  renderInventory();
  hideAddProduct();
  showAdminToast(`✅ "${name}" added!`);
  renderDashboard();
}

// ─── GOOGLE SHEETS SYNC ───
const SHEETS_WEBHOOK_DEFAULT = 'https://script.google.com/macros/s/AKfycbwTvfY5mJPha_m8HO5lN944sGKcC9Xobl0YlhiUw2vf2LGON4nO8gHOE-hYTP7hB3qm/exec';
let SHEETS_URL = localStorage.getItem('oa_sheets_url') || SHEETS_WEBHOOK_DEFAULT;

function updateSheetsStatus() {
  const dot = document.querySelector('.sheets-dot');
  if (SHEETS_URL) dot.classList.add('connected');
  else dot.classList.remove('connected');
}

function saveSheetUrl() {
  const url = document.getElementById('sheetsUrlInput').value.trim();
  if (url) {
    localStorage.setItem('oa_sheets_url', url);
    SHEETS_URL = url;
    updateSheetsStatus();
    document.getElementById('sheetsModal').style.display = 'none';
    showAdminToast('✅ Google Sheets connected!');
  }
}

async function logToSheetsAdmin(type, data) {
  if (!SHEETS_URL) return;
  try {
    // Must use text/plain with no-cors — JSON content-type triggers preflight which Google blocks
    await fetch(SHEETS_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ type, ...data })
    });
  } catch (e) { console.error('Sheets error:', e); }
}

async function syncToSheets() { syncAllToSheets(); }

async function syncAllToSheets() {
  if (!SHEETS_URL) {
    document.getElementById('sheetsModal')?.style && (document.getElementById('sheetsModal').style.display = 'flex');
    return;
  }
  const btn = document.getElementById('syncBtn');
  if (btn) { btn.textContent = '⏳ Syncing…'; btn.disabled = true; }
  showAdminToast('⏳ Syncing all data to Google Sheets…');

  await logToSheetsAdmin('full_sync', {
    sales:     getSales(),
    repairs:   getRepairs(),
    inventory: getInventory(),
    syncedAt:  new Date().toISOString()
  });

  if (btn) { btn.textContent = '🔄 Sync All to Sheets'; btn.disabled = false; }
  showAdminToast('✅ Inventory, Sales & Repairs synced!');
}

async function syncInventoryToSheets() {
  await logToSheetsAdmin('inventory_full', { inventory: getInventory(), timestamp: new Date().toISOString() });
  showAdminToast('✅ Inventory synced!');
}

// ─── EXPORT CSV ───

// ─── LEDGER ───
function filterByDate(items, period) {
  const now = new Date();
  return items.filter(item => {
    const d = new Date(item.timestamp);
    if (period === 'today') return d.toDateString() === now.toDateString();
    if (period === 'week') { const w = new Date(now); w.setDate(now.getDate()-7); return d >= w; }
    if (period === 'month') return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
    if (period === 'year') return d.getFullYear()===now.getFullYear();
    return true;
  });
}

// ─── SYNC SALES/REPAIRS TO SHEETS ───
async function syncSalesToSheets() {
  if (!SHEETS_URL) return showAdminToast('⚠️ No Sheets URL configured');
  showAdminToast('⏳ Syncing sales...');
  await logToSheetsAdmin('full_sync', { sales: getSales(), syncedAt: new Date().toISOString() });
  showAdminToast('✅ Sales synced to Google Sheets!');
}

async function syncRepairsToSheets() {
  if (!SHEETS_URL) return showAdminToast('⚠️ No Sheets URL configured');
  showAdminToast('⏳ Syncing repairs...');
  await logToSheetsAdmin('full_sync', { repairs: getRepairs(), syncedAt: new Date().toISOString() });
  showAdminToast('✅ Repair requests synced!');
}

// ─── REPAIR REVENUE ───
function getRepairRevenue() {
  try { return JSON.parse(localStorage.getItem('oa_repair_revenue') || '[]'); } catch(e) { return []; }
}
function setRepairRevenue(arr) { localStorage.setItem('oa_repair_revenue', JSON.stringify(arr)); }

function showAddRepairRevenueModal() {
  const today = new Date().toISOString().slice(0,10);
  document.getElementById('rr-date').value = today;
  ['rr-desc','rr-customer','rr-amount','rr-notes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('repairRevModal').style.display = 'flex';
}

function saveRepairRevenue() {
  const date     = document.getElementById('rr-date').value;
  const desc     = document.getElementById('rr-desc').value.trim();
  const customer = document.getElementById('rr-customer').value.trim();
  const amount   = parseFloat(document.getElementById('rr-amount').value) || 0;
  const notes    = document.getElementById('rr-notes').value.trim();
  if (!desc || amount <= 0) return showAdminToast('⚠️ Description and amount required');
  const arr = getRepairRevenue();
  arr.unshift({ id: 'RR-'+Date.now(), date, desc, customer, amount, notes, timestamp: new Date().toISOString() });
  setRepairRevenue(arr);
  document.getElementById('repairRevModal').style.display = 'none';
  renderLedger();
  showAdminToast('✅ Repair revenue added!');
}

function deleteRepairRevenue(id) {
  if (!confirm('Delete this entry?')) return;
  setRepairRevenue(getRepairRevenue().filter(r => r.id !== id));
  renderLedger();
}

function switchLedgerTab(tab) {
  document.getElementById('ledger-panel-sales').style.display   = tab === 'sales'   ? 'block' : 'none';
  document.getElementById('ledger-panel-repairs').style.display = tab === 'repairs' ? 'block' : 'none';
  document.getElementById('ledger-tab-sales').style.background   = tab === 'sales'   ? 'var(--ocean)' : 'var(--gray-light)';
  document.getElementById('ledger-tab-sales').style.color        = tab === 'sales'   ? '#fff' : 'var(--navy)';
  document.getElementById('ledger-tab-repairs').style.background = tab === 'repairs' ? 'var(--ocean)' : 'var(--gray-light)';
  document.getElementById('ledger-tab-repairs').style.color      = tab === 'repairs' ? '#fff' : 'var(--navy)';
}

function generateRepairInvoice(id) {
  const r = getRepairRevenue().find(r => r.id === id);
  if (!r) return;
  const invNum = r.id.replace('RR-','RINV-');
  document.getElementById('invoiceContent').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2.5rem;padding-bottom:1.5rem;border-bottom:2px solid #eee">
      <div>
        <div style="font-size:1.6rem;font-weight:800;color:#1a2e44">Oceanside Appliance</div>
        <div style="color:#666;font-size:.82rem;margin-top:.3rem">1016 S Tremont St, Oceanside, CA 92054</div>
        <div style="color:#666;font-size:.82rem">(760) 754-8200 · oceansideappliance96@gmail.com</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#1a7fc1">Repair Invoice</div>
        <div style="font-size:1.3rem;font-weight:700;color:#1a2e44">${invNum}</div>
        <div style="font-size:.8rem;color:#666;margin-top:.25rem">Date: ${r.date}</div>
      </div>
    </div>
    <div style="margin-bottom:2rem">
      <div style="font-size:.68rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#999;margin-bottom:.4rem">Bill To</div>
      <div style="font-weight:600;color:#1a2e44">${r.customer || 'Customer'}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:1.5rem">
      <thead><tr style="background:#f8f9fa">
        <th style="text-align:left;padding:.6rem .8rem;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:#666;border-bottom:2px solid #eee">Service Description</th>
        <th style="text-align:right;padding:.6rem .8rem;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:#666;border-bottom:2px solid #eee">Amount</th>
      </tr></thead>
      <tbody>
        <tr><td style="padding:.7rem .8rem;font-size:.88rem;color:#333">${r.desc}</td><td style="padding:.7rem .8rem;font-size:.88rem;text-align:right;color:#333">$${r.amount.toFixed(2)}</td></tr>
        ${r.notes ? '<tr><td colspan="2" style="padding:.5rem .8rem;font-size:.78rem;color:#888;font-style:italic">'+r.notes+'</td></tr>' : ''}
      </tbody>
    </table>
    <div style="display:flex;justify-content:flex-end">
      <div style="width:220px;border-top:2px solid #eee">
        <div style="display:flex;justify-content:space-between;padding:.75rem 0;font-size:1.05rem;font-weight:700;color:#1a2e44"><span>Total</span><span>$${r.amount.toFixed(2)}</span></div>
      </div>
    </div>
    <div style="margin-top:2rem;padding:1rem;background:#f8f9fa;border-radius:8px;font-size:.78rem;color:#666;text-align:center">
      Thank you for choosing Oceanside Appliance · Est. 1996 · Serving all of San Diego
    </div>`;
  document.getElementById('invoiceOverlay').style.display = 'flex';
}

function renderLedger() {
  const period     = document.getElementById('ledgerFilter')?.value || 'all';
  const sales      = filterByDate(getSales(), period).sort((a,b) => new Date(b.timestamp)-new Date(a.timestamp));
  const repairRevs = filterByDate(getRepairRevenue().map(r => ({...r, timestamp: r.timestamp||r.date+'T00:00:00'})), period)
                       .sort((a,b) => new Date(b.timestamp)-new Date(a.timestamp));
  const salesRev  = sales.reduce((s, o) => s + (o.total||0), 0);
  const repairRev = repairRevs.reduce((s, r) => s + (r.amount||0), 0);
  document.getElementById('ledger-revenue').textContent    = '$' + salesRev.toLocaleString('en-US',{minimumFractionDigits:2});
  document.getElementById('ledger-repair-rev').textContent = '$' + repairRev.toLocaleString('en-US',{minimumFractionDigits:2});
  document.getElementById('ledger-total-rev').textContent  = '$' + (salesRev+repairRev).toLocaleString('en-US',{minimumFractionDigits:2});
  document.getElementById('ledger-orders').textContent     = sales.length;
  const fulfillLabel = f => f==='delivery'?'🚚 Delivery':f==='view'?'👀 View':'🏪 Pickup';
  document.getElementById('ledgerTbody').innerHTML = sales.map(s => {
    const statusColor = s.status==='completed'?'#27ae60':s.status==='cancelled'?'#c0392b':'#e67e22';
    return `<tr>
      <td style="font-size:.78rem">${formatDate(s.timestamp)}</td>
      <td><strong>${s.orderId}</strong></td>
      <td style="font-size:.82rem">${s.firstName||''} ${s.lastName||''}<br><small style="color:var(--gray-mid)">${s.email||''}</small></td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.78rem" title="${s.items}">${s.items||''}</td>
      <td><strong>$${(s.total||0).toLocaleString('en-US',{minimumFractionDigits:2})}</strong></td>
      <td style="font-size:.78rem">${fulfillLabel(s.fulfillment)}</td>
      <td><span style="padding:.2rem .5rem;border-radius:5px;font-size:.7rem;font-weight:700;color:#fff;background:${statusColor}">${s.status||'pending'}</span></td>
      <td><button onclick="generateInvoice('${s.orderId}')" style="padding:.3rem .6rem;background:var(--ocean);color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:.72rem;font-family:var(--font-body)">🧾 Invoice</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--gray-mid);padding:2rem">No sales in this period.</td></tr>';
  document.getElementById('repairRevTbody').innerHTML = repairRevs.map(r => `<tr>
    <td style="font-size:.78rem">${r.date||''}</td>
    <td style="font-size:.82rem">${r.desc||''}</td>
    <td style="font-size:.82rem">${r.customer||'—'}</td>
    <td><strong>$${(r.amount||0).toFixed(2)}</strong></td>
    <td style="font-size:.78rem;color:var(--gray-mid)">${r.notes||'—'}</td>
    <td><button onclick="generateRepairInvoice('${r.id}')" style="padding:.3rem .6rem;background:var(--ocean);color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:.72rem;font-family:var(--font-body)">🧾 Invoice</button></td>
    <td><button onclick="deleteRepairRevenue('${r.id}')" style="background:none;border:none;cursor:pointer;color:var(--gray-mid);font-size:.9rem">🗑️</button></td>
  </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--gray-mid);padding:2rem">No repair revenue yet.<br><small>Click "+ Add Repair Revenue" to log a completed service.</small></td></tr>';
}

function exportLedgerCSV() {
  const period = document.getElementById('ledgerFilter')?.value || 'all';
  const sales  = filterByDate(getSales(), period).sort((a,b) => new Date(b.timestamp)-new Date(a.timestamp));
  const rows   = [['Date','Order ID','Customer','Email','Items','Subtotal','Tax','Delivery','Total','Type','Status']];
  sales.forEach(s => {
    const sub = Math.max(0,(s.total||0)-(s.tax||0)-(s.deliveryFee||0));
    rows.push([formatDate(s.timestamp), s.orderId, `${s.firstName||''} ${s.lastName||''}`, s.email||'',
      `"${s.items||''}"`, sub.toFixed(2), (s.tax||0).toFixed(2), (s.deliveryFee||0).toFixed(2),
      (s.total||0).toFixed(2), s.fulfillment||'pickup', s.status||'pending']);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = `ledger-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

function generateInvoice(orderId) {
  const s = getSales().find(s => s.orderId === orderId);
  if (!s) return;
  const subtotal  = Math.max(0,(s.total||0)-(s.tax||0)-(s.deliveryFee||0));
  const lineItems = (s.items||'').split(',').map(i => i.trim()).filter(Boolean);
  const invNum    = orderId.replace('ORD-','INV-');
  document.getElementById('invoiceContent').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2.5rem;padding-bottom:1.5rem;border-bottom:2px solid #eee">
      <div>
        <div style="font-size:1.6rem;font-weight:800;color:#1a2e44;letter-spacing:-.02em">Oceanside Appliance</div>
        <div style="color:#666;font-size:.82rem;margin-top:.3rem">1016 S Tremont St, Oceanside, CA 92054</div>
        <div style="color:#666;font-size:.82rem">(760) 754-8200 · oceansideappliance96@gmail.com</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#1a7fc1">Invoice</div>
        <div style="font-size:1.3rem;font-weight:700;color:#1a2e44">${invNum}</div>
        <div style="font-size:.8rem;color:#666;margin-top:.25rem">Date: ${formatDate(s.timestamp)}</div>
        <div style="margin-top:.5rem;padding:.3rem .7rem;background:${s.status==='completed'?'#27ae60':s.status==='cancelled'?'#c0392b':'#e67e22'};color:#fff;border-radius:5px;font-size:.72rem;font-weight:700;text-transform:uppercase;display:inline-block">${s.status||'pending'}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-bottom:2rem">
      <div>
        <div style="font-size:.68rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#999;margin-bottom:.4rem">Bill To</div>
        <div style="font-weight:600;color:#1a2e44">${s.firstName||''} ${s.lastName||''}</div>
        <div style="font-size:.85rem;color:#555">${s.email||''}</div>
        <div style="font-size:.85rem;color:#555">${s.phone||''}</div>
        ${s.address?`<div style="font-size:.85rem;color:#555">${s.address}</div>`:''}
      </div>
      <div>
        <div style="font-size:.68rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#999;margin-bottom:.4rem">Fulfillment</div>
        <div style="font-weight:600;color:#1a2e44">${s.fulfillment==='delivery'?'🚚 Delivery & Installation':'🏪 Store Pickup'}</div>
        <div style="font-size:.68rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#999;margin-top:.75rem;margin-bottom:.4rem">Order Reference</div>
        <div style="font-size:.82rem;color:#1a7fc1;font-weight:600">${s.orderId}</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:1.5rem">
      <thead><tr style="background:#f8f9fa">
        <th style="text-align:left;padding:.6rem .8rem;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:#666;border-bottom:2px solid #eee">Description</th>
        <th style="text-align:right;padding:.6rem .8rem;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:#666;border-bottom:2px solid #eee">Amount</th>
      </tr></thead>
      <tbody>
        ${lineItems.map(item=>`<tr><td style="padding:.7rem .8rem;font-size:.88rem;border-bottom:1px solid #f0f0f0;color:#333">${item}</td><td style="padding:.7rem .8rem;font-size:.88rem;border-bottom:1px solid #f0f0f0;text-align:right;color:#333">—</td></tr>`).join('')}
        ${s.fulfillment==='delivery'?`<tr><td style="padding:.7rem .8rem;font-size:.88rem;border-bottom:1px solid #f0f0f0;color:#333">Delivery & Installation</td><td style="padding:.7rem .8rem;font-size:.88rem;border-bottom:1px solid #f0f0f0;text-align:right;color:#333">$${(s.deliveryFee||145).toFixed(2)}</td></tr>`:''}
      </tbody>
    </table>
    <div style="display:flex;justify-content:flex-end">
      <div style="width:260px">
        <div style="display:flex;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid #eee;font-size:.88rem"><span style="color:#666">Subtotal</span><span>$${subtotal.toFixed(2)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid #eee;font-size:.88rem"><span style="color:#666">Tax (8.25%)</span><span>$${(s.tax||0).toFixed(2)}</span></div>
        ${s.fulfillment==='delivery'?`<div style="display:flex;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid #eee;font-size:.88rem"><span style="color:#666">Delivery & Installation</span><span>$${(s.deliveryFee||145).toFixed(2)}</span></div>`:''}
        <div style="display:flex;justify-content:space-between;padding:.75rem 0;font-size:1.05rem;font-weight:700;color:#1a2e44"><span>Total</span><span>$${(s.total||0).toFixed(2)}</span></div>
      </div>
    </div>
    <div style="margin-top:2rem;padding:1rem;background:#f8f9fa;border-radius:8px;font-size:.78rem;color:#666;text-align:center">
      Thank you for choosing Oceanside Appliance · Est. 1996 · Serving all of San Diego
    </div>`;
  document.getElementById('invoiceOverlay').style.display = 'flex';
}

function exportCSV(type) {
  let rows = [], headers = [], filename = '';
  if (type === 'sales') {
    headers = ['Order ID', 'Items', 'Total', 'Date', 'Status'];
    rows = getSales().map(s => [s.orderId, `"${s.items}"`, s.total, s.timestamp, s.status]);
    filename = 'sales_export.csv';
  } else if (type === 'repairs') {
    headers = ['Ticket ID', 'First Name', 'Last Name', 'Phone', 'Email', 'Address', 'Appliance', 'Brand', 'Urgency', 'Description', 'Date', 'Status'];
    rows = getRepairs().map(r => [r.ticketId, r.firstName, r.lastName, r.phone, r.email, `"${r.address}"`, r.applianceType, r.brand, `"${r.description}"`, r.timestamp, r.status]);
    filename = 'repair_requests_export.csv';
  } else if (type === 'inventory') {
    headers = ['ID', 'Product', 'Brand', 'Category', 'Price', 'Stock', 'Status'];
    rows = getInventory().map(i => [i.id, `"${i.name}"`, i.brand, i.category, i.price, i.stock, i.stockStatus]);
    filename = 'inventory_export.csv';
  }

  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  showAdminToast(`📥 ${filename} downloaded!`);
}

// ─── UTILITIES ───
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

let adminToastTimer;
function showAdminToast(msg) {
  let toast = document.getElementById('adminToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'adminToast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(adminToastTimer);
  adminToastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ─── INIT ───
document.addEventListener('DOMContentLoaded', () => {
  renderDashboard();
  updateSheetsStatus();

  // Sidebar navigation
  document.querySelectorAll('.sidebar-link[data-tab]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showTab(link.dataset.tab);
    });
  });

  // Sheets status click
  document.getElementById('sheetsStatus')?.addEventListener('click', () => {
    document.getElementById('sheetsModal').style.display = 'flex';
  });

  // Load saved sheets URL
  const savedUrl = localStorage.getItem('oa_sheets_url');
  if (savedUrl) {
    SHEETS_URL = savedUrl;
    document.getElementById('sheetsUrlInput').value = savedUrl;
    updateSheetsStatus();
  }
});
