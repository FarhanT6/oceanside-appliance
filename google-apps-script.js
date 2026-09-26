// ============================================================
//   OCEANSIDE APPLIANCE — GOOGLE APPS SCRIPT (v2)
//   Google Sheets is the single source of truth for the website
//   and the staff panel.
//
//   PUBLIC (no key needed — used by the website):
//     GET  ?action=products        → in-stock + sold-out catalog (public fields only)
//     POST {type:'order'}          → places an order request, checks + decrements stock
//     POST {type:'repair_request'} → logs a repair / sell-to-us request
//     POST {type:'view_request'}   → logs a "view in person" request
//
//   STAFF ONLY (requires the admin key):
//     POST {type:'admin_pull', key}                         → everything
//     POST {type:'admin_upsert', key, collection, records}  → add / update rows
//     POST {type:'admin_delete', key, collection, ids}      → remove rows
//
//   SETUP / UPDATING — see README.md → "Google Sheets setup"
//   1. Extensions → Apps Script → replace everything with this file → Save
//   2. Run setupAdminKey() once (▶ Run). Copy the key it shows you.
//   3. Deploy → Manage deployments → ✏️ Edit → Version: "New version" → Deploy
//      (the URL stays the same)
//   4. In the staff panel click the Sheets status pill and paste the key.
// ============================================================

const NOTIFY_EMAIL      = 'oceansideappliance96@gmail.com'; // owner alerts go here
const SEND_OWNER_EMAILS = true;
const TAX_RATE          = 0.0825; // Oceanside, CA

// Column flags
const RO  = 1; // read-only in the sheet (display only; the hidden _data column wins)
const NUM = 2;
const INT = 4;

// Each collection = one tab. Columns the owner edits directly in Sheets
// (anything not RO) are read back and override the stored record.
const COLLECTIONS = {
  inventory: {
    sheet: 'Inventory', idKey: 'id',
    cols: [
      ['Product ID', 'id', RO], ['Product Name', 'name'], ['Brand', 'brand'],
      ['Category', 'category'], ['Condition', 'condition'], ['Model', 'model'],
      ['Our Price ($)', 'price', NUM], ['MSRP ($)', 'msrp', NUM], ['Competitor Price ($)', 'refPrice', NUM],
      ['Stock Qty', 'stock', INT], ['Storage Location', 'storageLocation'],
      ['Image URL(s)', 'imageUrl'], ['Description', 'desc'], ['Last Updated', 'updatedAt', RO]
    ],
    legacy: {
      'Product ID': 'id', 'Product Name': 'name', 'Brand / Manufacturer': 'brand', 'Brand': 'brand',
      'Category (appliance type)': 'category', 'Category': 'category',
      'Condition (New/Used/etc)': 'condition', 'Our Price ($)': 'price', 'Price ($)': 'price',
      'MSRP / Retail Price ($)': 'msrp', 'Competitor Price ($)': 'refPrice', 'Stock Qty': 'stock',
      'Storage Location': 'storageLocation', 'Image URL(s)': 'imageUrl'
    }
  },
  sales: {
    sheet: 'Sales', idKey: 'orderId', newestFirst: true,
    cols: [
      ['Order ID', 'orderId', RO], ['Date', 'timestamp', RO], ['Status', 'status'],
      ['First Name', 'firstName'], ['Last Name', 'lastName'], ['Phone', 'phone'], ['Email', 'email'],
      ['Items', 'items', RO], ['Item Count', 'itemCount', RO | INT],
      ['Subtotal ($)', 'subtotal', NUM], ['Tax ($)', 'tax', NUM], ['Delivery Fee ($)', 'deliveryFee', NUM],
      ['Total ($)', 'total', NUM], ['Fulfillment', 'fulfillment'], ['Address', 'address'],
      ['Availability', 'availability'], ['Customer Notes', 'notes'], ['Internal Notes', 'internalNotes']
    ],
    legacy: {
      'Order ID': 'orderId', 'Customer Full Name': '_fullName', 'Customer Email': 'email',
      'Customer Phone': 'phone', 'Items Ordered': 'items', 'Item Count': 'itemCount',
      'Subtotal ($)': 'subtotal', 'Tax ($)': 'tax', 'Delivery Fee ($)': 'deliveryFee',
      'Total Charged ($)': 'total', 'Fulfillment Type (pickup/view/delivery)': 'fulfillment',
      'Date': '_date', 'Time': '_time', 'Order Status': 'status'
    }
  },
  repairs: {
    sheet: 'Repair Requests', idKey: 'ticketId', newestFirst: true,
    cols: [
      ['Ticket ID', 'ticketId', RO], ['Date', 'timestamp', RO], ['Status', 'status'],
      ['Request Type', 'requestType'], ['First Name', 'firstName'], ['Last Name', 'lastName'],
      ['Phone', 'phone'], ['Email', 'email'], ['Address', 'address'],
      ['Appliance', 'applianceType'], ['Brand', 'brand'], ['Description', 'description'],
      ['Assigned To', 'assignedTo'], ['Internal Notes', 'internalNotes']
    ],
    legacy: {
      'Ticket ID': 'ticketId', 'First Name': 'firstName', 'Last Name': 'lastName', 'Phone': 'phone',
      'Email': 'email', 'Address': 'address', 'Service Address': 'address',
      'Appliance': 'applianceType', 'Appliance Type': 'applianceType',
      'Brand': 'brand', 'Appliance Brand': 'brand',
      'Description': 'description', 'Issue Description': 'description',
      'Date Submitted': '_dateSubmitted', 'Status': 'status',
      'Status (New/Scheduled/In Progress/Completed)': 'status',
      'Assigned To': 'assignedTo', 'Assigned Technician': 'assignedTo',
      'Notes': 'internalNotes', 'Internal Notes': 'internalNotes'
    }
  },
  views: {
    sheet: 'Viewing Requests', idKey: 'requestId', newestFirst: true,
    cols: [
      ['Request ID', 'requestId', RO], ['Date', 'timestamp', RO], ['Status', 'status'],
      ['Name', 'name'], ['Phone', 'phone'], ['Email', 'email'],
      ['Appliance', 'appliance'], ['Brand', 'brand'], ['Price ($)', 'price', NUM],
      ['Preferred Time', 'preferredTime'], ['Product ID', 'productId', RO]
    ],
    legacy: {
      'Timestamp': 'timestamp', 'Name': 'name', 'Phone': 'phone', 'Email': 'email',
      'Appliance': 'appliance', 'Brand': 'brand', 'Price ($)': 'price',
      'Preferred Contact Time': 'preferredTime', 'Status': 'status'
    }
  },
  repairRevenue: {
    sheet: 'Repair Revenue', idKey: 'id', newestFirst: true,
    cols: [
      ['Entry ID', 'id', RO], ['Date', 'date'], ['Description', 'desc'],
      ['Customer', 'customer'], ['Amount ($)', 'amount', NUM], ['Notes', 'notes']
    ],
    legacy: {}
  }
};

const PUBLIC_PRODUCT_FIELDS = ['id', 'name', 'brand', 'category', 'condition', 'model', 'price', 'msrp',
  'refPrice', 'stock', 'imageUrl', 'desc', 'specs', 'badge', 'badgeText', 'oldPrice'];

// ─── GET ───
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'products' || action === 'getProducts') {
    const products = readCollection('inventory').map(p => {
      const out = {};
      PUBLIC_PRODUCT_FIELDS.forEach(k => { if (p[k] !== undefined && p[k] !== '') out[k] = p[k]; });
      return out;
    });
    return jsonResponse({ success: true, products: products });
  }
  return jsonResponse({ status: 'ok', app: 'Oceanside Appliance', version: 2 });
}

// ─── POST ───
function doPost(e) {
  let data;
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return jsonResponse({ success: false, error: 'Bad request' });
  }
  const type = data.type;

  try {
    // Public, customer-facing requests
    if (type === 'order' || type === 'completed_sale') return jsonResponse(withLock(() => placeOrder(data)));
    if (type === 'repair_request') return jsonResponse(withLock(() => logRepair(data)));
    if (type === 'view_request')   return jsonResponse(withLock(() => logViewRequest(data)));

    // Everything else is staff-only
    if (!isAuthorized(data.key)) {
      return jsonResponse({ success: false, error: 'unauthorized' });
    }
    if (type === 'admin_ping') return jsonResponse({ success: true });
    if (type === 'admin_pull') {
      const out = {};
      Object.keys(COLLECTIONS).forEach(name => { out[name] = readCollection(name); });
      return jsonResponse({ success: true, data: out });
    }
    if (type === 'admin_upsert') {
      requireCollection(data.collection);
      return jsonResponse(withLock(() => {
        upsertRecords(data.collection, Array.isArray(data.records) ? data.records : []);
        appendLog('admin_upsert', data.collection + ' × ' + (data.records || []).length);
        return { success: true };
      }));
    }
    if (type === 'admin_delete') {
      requireCollection(data.collection);
      return jsonResponse(withLock(() => {
        deleteRecords(data.collection, Array.isArray(data.ids) ? data.ids : []);
        appendLog('admin_delete', data.collection + ' × ' + (data.ids || []).length);
        return { success: true };
      }));
    }
    return jsonResponse({ success: false, error: 'Unknown request type' });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err && err.message || err) });
  }
}

// ─── ORDERS ───
function placeOrder(d) {
  if (d.website) return { success: true }; // honeypot — silently ignore bots

  const sales = readCollection('sales');
  if (d.clientRef) {
    const dup = sales.find(s => s.clientRef === d.clientRef);
    if (dup) return { success: true, order: publicOrder(dup) };
  }

  const firstName = clean(d.firstName, 60), lastName = clean(d.lastName, 60);
  const phone = clean(d.phone, 30), email = clean(d.email, 120);
  if (!firstName || !lastName) return fail('Please enter your first and last name.');
  if (!validPhone(phone)) return fail('Please enter a valid phone number.');
  if (!validEmail(email)) return fail('Please enter a valid email address.');

  const fulfillment = d.fulfillment === 'delivery' ? 'delivery' : 'pickup';
  const address = clean(d.address, 200);
  if (fulfillment === 'delivery' && !address) return fail('Please enter a delivery address.');

  const lines = Array.isArray(d.lineItems) ? d.lineItems.slice(0, 50) : [];
  if (!lines.length) return fail('Your cart is empty.');

  const inventory = readCollection('inventory');
  const byId = {};
  inventory.forEach(p => { byId[p.id] = p; });

  let subtotal = 0, itemCount = 0;
  const itemTexts = [], resolved = [];
  for (let i = 0; i < lines.length; i++) {
    const qty = Math.max(1, parseInt(lines[i].qty, 10) || 1);
    const p = byId[lines[i].id];
    if (!p) return fail('One of the items in your cart is no longer available. Please refresh and try again.');
    if ((p.stock || 0) < qty) {
      return fail((p.stock || 0) > 0
        ? `Only ${p.stock} of "${p.name}" left — please update your cart.`
        : `"${p.name}" just sold out — please remove it from your cart.`);
    }
    const price = Number(p.price) || 0;
    subtotal += price * qty;
    itemCount += qty;
    itemTexts.push(`${p.name} x${qty} ($${(price * qty).toFixed(2)})`);
    resolved.push({ p: p, qty: qty, price: price });
  }
  subtotal = round2(subtotal);
  const tax = round2(subtotal * TAX_RATE);

  const order = {
    orderId: 'ORD-' + Date.now(),
    clientRef: clean(d.clientRef, 60),
    timestamp: new Date().toISOString(),
    status: 'pending',
    firstName: firstName, lastName: lastName, phone: phone, email: email,
    fulfillment: fulfillment, address: address,
    availability: clean(d.availability, 200), notes: clean(d.notes, 1000),
    items: itemTexts.join(' | '),
    lineItems: resolved.map(r => ({ id: r.p.id, name: r.p.name, qty: r.qty, price: r.price })),
    itemCount: itemCount, subtotal: subtotal, tax: tax, deliveryFee: 0,
    total: round2(subtotal + tax)
  };

  // Decrement stock so nobody else can buy the same unit
  resolved.forEach(r => { r.p.stock = Math.max(0, (r.p.stock || 0) - r.qty); r.p.updatedAt = order.timestamp; });
  writeCollection('inventory', inventory);

  sales.push(order);
  writeCollection('sales', sales);
  appendLog('order', `${order.orderId} — ${firstName} ${lastName} — $${order.total}`);

  notifyOwner(`🛒 New order request ${order.orderId} — $${order.total.toFixed(2)}`, [
    `Customer: ${firstName} ${lastName}`, `Phone: ${phone}`, `Email: ${email}`,
    `Fulfillment: ${fulfillment === 'delivery' ? 'Delivery to ' + address : 'Store pickup'}`,
    `Availability: ${order.availability || '—'}`, '',
    'Items:', ...order.lineItems.map(l => `  • ${l.name} × ${l.qty} — $${(l.price * l.qty).toFixed(2)}`), '',
    `Subtotal: $${subtotal.toFixed(2)}`, `Tax: $${tax.toFixed(2)}`, `Estimated total: $${order.total.toFixed(2)}`,
    '', `Notes: ${order.notes || '—'}`
  ], email);

  return { success: true, order: publicOrder(order) };
}

function publicOrder(o) {
  return {
    orderId: o.orderId, items: o.items, lineItems: o.lineItems || [], itemCount: o.itemCount,
    subtotal: o.subtotal, tax: o.tax, total: o.total, fulfillment: o.fulfillment
  };
}

// ─── REPAIR / SELL REQUESTS ───
function logRepair(d) {
  if (d.website) return { success: true };
  const repairs = readCollection('repairs');
  if (d.clientRef) {
    const dup = repairs.find(r => r.clientRef === d.clientRef);
    if (dup) return { success: true, ticketId: dup.ticketId };
  }
  const r = {
    ticketId: 'TKT-' + Date.now(),
    clientRef: clean(d.clientRef, 60),
    timestamp: new Date().toISOString(),
    status: 'New',
    requestType: ['Repair', 'Sell to us', 'Other'].indexOf(d.requestType) >= 0 ? d.requestType : 'Repair',
    firstName: clean(d.firstName, 60), lastName: clean(d.lastName, 60),
    phone: clean(d.phone, 30), email: clean(d.email, 120), address: clean(d.address, 200),
    applianceType: clean(d.applianceType, 40), brand: clean(d.brand, 40),
    description: clean(d.description, 2000), assignedTo: '', internalNotes: ''
  };
  if (!r.firstName || !r.lastName) return fail('Please enter your first and last name.');
  if (!validPhone(r.phone)) return fail('Please enter a valid phone number.');
  if (r.email && !validEmail(r.email)) return fail('Please enter a valid email address.');
  if (!r.address || !r.applianceType || !r.description) return fail('Please fill in all required fields.');

  repairs.push(r);
  writeCollection('repairs', repairs);
  appendLog('repair_request', `${r.ticketId} — ${r.firstName} ${r.lastName} — ${r.requestType} — ${r.applianceType}`);
  notifyOwner(`🔧 New ${r.requestType.toLowerCase()} request ${r.ticketId} — ${r.applianceType}`, [
    `Customer: ${r.firstName} ${r.lastName}`, `Phone: ${r.phone}`, `Email: ${r.email || '—'}`,
    `Address: ${r.address}`, `Appliance: ${r.applianceType}${r.brand ? ' · ' + r.brand : ''}`, '',
    r.description
  ], r.email);
  return { success: true, ticketId: r.ticketId };
}

// ─── VIEWING REQUESTS ───
function logViewRequest(d) {
  if (d.website) return { success: true };
  const views = readCollection('views');
  if (d.clientRef) {
    const dup = views.find(v => v.clientRef === d.clientRef);
    if (dup) return { success: true, requestId: dup.requestId };
  }
  const product = readCollection('inventory').find(p => p.id === d.productId);
  const v = {
    requestId: 'VIEW-' + Date.now(),
    clientRef: clean(d.clientRef, 60),
    timestamp: new Date().toISOString(),
    status: 'New',
    name: clean(d.name, 120), phone: clean(d.phone, 30), email: clean(d.email, 120),
    preferredTime: clean(d.preferredTime, 200),
    productId: product ? product.id : clean(d.productId, 60),
    appliance: product ? product.name : clean(d.appliance, 120),
    brand: product ? product.brand : '',
    price: product ? product.price : 0
  };
  if (!v.name) return fail('Please enter your name.');
  if (!validPhone(v.phone)) return fail('Please enter a valid phone number.');
  if (v.email && !validEmail(v.email)) return fail('Please enter a valid email address.');

  views.push(v);
  writeCollection('views', views);
  appendLog('view_request', `${v.requestId} — ${v.name} — ${v.appliance}`);
  notifyOwner(`👀 Viewing request — ${v.appliance}`, [
    `Customer: ${v.name}`, `Phone: ${v.phone}`, `Email: ${v.email || '—'}`,
    `Appliance: ${v.appliance}${v.brand ? ' · ' + v.brand : ''}${v.price ? ' · $' + v.price : ''}`,
    `Best time: ${v.preferredTime || '—'}`
  ], v.email);
  return { success: true, requestId: v.requestId };
}

// ─── GENERIC COLLECTION STORAGE ───
// Every tab has a hidden "_data" column holding the full JSON record, plus
// readable columns. Editing a readable (non-RO) column in Sheets updates the record.
function readCollection(name) {
  const def = COLLECTIONS[name];
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.sheet);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h).trim());
  const dataCol = headers.indexOf('_data');
  const records = [];

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (row.every(c => c === '' || c === null)) continue;
    let rec;
    if (dataCol >= 0 && row[dataCol]) {
      try { rec = JSON.parse(row[dataCol]); } catch (err) { rec = {}; }
      def.cols.forEach(col => {
        const [header, key, flags] = col;
        if (flags & RO) return;
        const c = headers.indexOf(header);
        if (c >= 0) rec[key] = coerce(row[c], flags);
      });
    } else {
      rec = fromLegacyRow(name, def, headers, row, r);
    }
    if (rec && rec[def.idKey]) records.push(rec);
  }
  return records;
}

function fromLegacyRow(name, def, headers, row, rowIndex) {
  const rec = {};
  headers.forEach((h, c) => {
    const key = def.legacy[h];
    if (!key) return;
    const colDef = def.cols.find(col => col[1] === key);
    rec[key] = coerce(row[c], colDef ? colDef[2] : 0);
  });
  if (name === 'sales') {
    if (rec._fullName) {
      const parts = String(rec._fullName).trim().split(/\s+/);
      rec.firstName = parts.shift() || ''; rec.lastName = parts.join(' ');
    }
    rec.timestamp = toIso(rec._date, rec._time);
    delete rec._fullName; delete rec._date; delete rec._time;
    rec.status = rec.status || 'pending';
  }
  if (name === 'repairs') {
    rec.timestamp = toIso(rec._dateSubmitted);
    delete rec._dateSubmitted;
    rec.status = rec.status || 'New';
    rec.requestType = 'Repair';
    if (!rec.ticketId) rec.ticketId = 'TKT-legacy-' + rowIndex;
  }
  if (name === 'views') {
    rec.timestamp = toIso(rec.timestamp);
    rec.requestId = 'VIEW-' + (new Date(rec.timestamp).getTime() || ('legacy-' + rowIndex));
    rec.status = rec.status || 'New';
  }
  if (name === 'inventory') {
    rec.stock = parseInt(rec.stock, 10) || 0;
  }
  return rec;
}

function writeCollection(name, records) {
  const def = COLLECTIONS[name];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(def.sheet);
  if (!sheet) sheet = ss.insertSheet(def.sheet);

  if (def.newestFirst) {
    records = records.slice().sort((a, b) =>
      new Date(b.timestamp || b.date || 0) - new Date(a.timestamp || a.date || 0));
  }

  const headers = def.cols.map(c => c[0]).concat(['_data']);
  const rows = records.map(rec => def.cols.map(col => {
    const [, key, flags] = col;
    const v = rec[key];
    if (key === 'timestamp' || key === 'updatedAt') return v ? formatStamp(v) : '';
    if (flags & (NUM | INT)) return Number(v) || 0;
    return v === undefined || v === null ? '' : String(v);
  }).concat([JSON.stringify(rec)]));

  sheet.clear();
  const width = headers.length;
  if (sheet.getMaxRows() < rows.length + 1) sheet.insertRowsAfter(sheet.getMaxRows(), rows.length + 1 - sheet.getMaxRows());
  if (sheet.getMaxColumns() < width) sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
  sheet.showColumns(1, width);
  // Plain-text format stops Sheets from mangling phone numbers, IDs and zip codes
  if (rows.length) {
    def.cols.forEach((col, i) => {
      if (!(col[2] & (NUM | INT))) sheet.getRange(2, i + 1, rows.length, 1).setNumberFormat('@');
    });
  }
  sheet.getRange(1, 1, 1, width).setValues([headers])
    .setBackground('#1a2e44').setFontColor('#ffffff').setFontWeight('bold').setFontSize(10);
  if (rows.length) sheet.getRange(2, 1, rows.length, width).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, width - 1, 150);
  sheet.hideColumns(width);
}

function upsertRecords(name, incoming) {
  const def = COLLECTIONS[name];
  const records = readCollection(name);
  const index = {};
  records.forEach((r, i) => { index[r[def.idKey]] = i; });
  incoming.forEach(rec => {
    if (!rec || !rec[def.idKey]) return;
    if (name === 'inventory') rec.updatedAt = new Date().toISOString();
    const i = index[rec[def.idKey]];
    if (i === undefined) { index[rec[def.idKey]] = records.length; records.push(rec); }
    else records[i] = Object.assign({}, records[i], rec);
  });
  writeCollection(name, records);
}

function deleteRecords(name, ids) {
  const def = COLLECTIONS[name];
  const drop = {};
  ids.forEach(id => { drop[id] = true; });
  writeCollection(name, readCollection(name).filter(r => !drop[r[def.idKey]]));
}

// ─── AUTH ───
function isAuthorized(key) {
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  return !!real && typeof key === 'string' && key === real;
}

// ▶ Run this once from the Apps Script editor. It creates a random staff key.
function setupAdminKey() {
  const key = 'oa-' + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('ADMIN_KEY', key);
  Logger.log('Your staff key: ' + key);
  try {
    SpreadsheetApp.getUi().alert('Your staff key (paste it into the staff panel → Sheets settings):\n\n' + key);
  } catch (err) { /* running outside the spreadsheet UI — check the execution log */ }
  return key;
}

// Also creates any missing tabs in the new format. Safe to run again.
function initialSetup() {
  Object.keys(COLLECTIONS).forEach(name => writeCollection(name, readCollection(name)));
  if (!PropertiesService.getScriptProperties().getProperty('ADMIN_KEY')) setupAdminKey();
}

// ─── HELPERS ───
function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function requireCollection(name) {
  if (!COLLECTIONS[name]) throw new Error('Unknown collection: ' + name);
}

function fail(msg) { return { success: false, error: msg }; }

function clean(v, max) {
  if (v === undefined || v === null) return '';
  return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s || ''); }
function validPhone(s) { const n = String(s || '').replace(/\D/g, ''); return n.length >= 10 && n.length <= 15; }
function round2(n) { return Math.round(n * 100) / 100; }

function coerce(v, flags) {
  if (flags & INT) return parseInt(v, 10) || 0;
  if (flags & NUM) return Number(v) || 0;
  if (v instanceof Date) return v.toISOString();
  return v === null || v === undefined ? '' : String(v);
}

function toIso(date, time) {
  if (!date) return new Date(0).toISOString();
  let d = date instanceof Date ? date : new Date(String(date) + (time ? ' ' + time : ''));
  if (isNaN(d.getTime())) d = new Date(String(date));
  return isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

function formatStamp(v) {
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : Utilities.formatDate(d, 'America/Los_Angeles', 'MM/dd/yyyy h:mm a');
}

function notifyOwner(subject, lines, replyTo) {
  if (!SEND_OWNER_EMAILS || !NOTIFY_EMAIL) return;
  try {
    const opts = { to: NOTIFY_EMAIL, subject: subject, body: lines.join('\n') };
    if (replyTo && validEmail(replyTo)) opts.replyTo = replyTo;
    MailApp.sendEmail(opts);
  } catch (err) { /* never block a customer request on email */ }
}

function appendLog(type, summary) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Activity Log');
    if (!sheet) {
      sheet = ss.insertSheet('Activity Log');
      sheet.getRange(1, 1, 1, 3).setValues([['Timestamp', 'Event', 'Summary']])
        .setBackground('#1a2e44').setFontColor('#ffffff').setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([new Date(), type, summary]);
  } catch (err) { /* logging is best-effort */ }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
