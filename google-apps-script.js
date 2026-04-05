// ============================================================
//   OCEANSIDE APPLIANCE — GOOGLE APPS SCRIPT
//   Supports two-way sync:
//   • Website/Admin → Sheets (POST)
//   • Sheets → Website (GET)
//
//   SETUP:
//   1. Extensions → Apps Script → paste this file
//   2. Run initialSetup() once manually
//   3. Deploy → New Deployment → Web App
//      Execute as: Me  |  Access: Anyone
//   4. Copy URL → paste in js/main.js line 4
//
//   RE-DEPLOYING AFTER CODE CHANGES:
//   → Deploy → Manage Deployments → Edit (pencil)
//   → Version: "New version" → Save
//   The URL stays the same! You never need to recopy it.
// ============================================================

const SHEET_NAMES = {
  sales:     'Sales',
  repairs:   'Repair Requests',
  inventory: 'Inventory',
  log:       'Activity Log',
  views:     'Viewing Requests'
};

// ─── GET: Website fetches products / inventory from Sheets ───
function doGet(e) {
  const action = e?.parameter?.action || '';

  if (action === 'getProducts') {
    // Return inventory data so website can sync stock levels
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.inventory);
    if (!sheet) return jsonResponse({ products: [] });

    const rows = sheet.getDataRange().getValues();
    if (rows.length < 2) return jsonResponse({ products: [] });

    const headers  = rows[0];
    const idCol    = headers.indexOf('Product ID');
    const nameCol  = headers.indexOf('Product Name');
    const priceCol = headers.indexOf('Price ($)');
    const stockCol = headers.indexOf('Stock Qty');
    const catCol   = headers.indexOf('Category');
    const brandCol = headers.indexOf('Brand');
    const customCol= headers.indexOf('Custom');

    const locCol   = headers.indexOf('Storage Location');

    const products = rows.slice(1).map(row => ({
      id:       row[idCol]    || '',
      name:     row[nameCol]  || '',
      price:    parseFloat(row[priceCol]) || 0,
      stock:    parseInt(row[stockCol])   || 0,
      category: row[catCol]   || '',
      brand:    row[brandCol] || '',
      _custom:  row[customCol] === true || row[customCol] === 'TRUE',
      storageLocation: locCol >= 0 ? (row[locCol] || '') : ''
    })).filter(p => p.id);

    return jsonResponse({ products });
  }

  // Health check
  return jsonResponse({ status: 'ok', app: 'Oceanside Appliance' });
}

// ─── POST: Website/Admin sends data to Sheets ───
function doPost(e) {
  try {
    // Accept text/plain (sent by browser no-cors) and application/json
    const raw  = e.postData ? e.postData.contents : '{}';
    const data = JSON.parse(raw);
    const type = data.type;
    const ss   = SpreadsheetApp.getActiveSpreadsheet();

    if (type === 'completed_sale')      logSale(ss, data);
    else if (type === 'repair_request') logRepair(ss, data);
    else if (type === 'inventory_update') updateInventoryRow(ss, data);
    else if (type === 'inventory_full')   writeFullInventory(ss, data.inventory);
    else if (type === 'add_product')      addProductToInventory(ss, data);
    else if (type === 'view_request')  logViewRequest(ss, data);
    else if (type === 'full_sync') {
      if (data.sales)     writeAllSales(ss, data.sales);
      if (data.repairs)   writeAllRepairs(ss, data.repairs);
      if (data.inventory) writeFullInventory(ss, data.inventory);
    }

    appendLog(ss, type, data);
    return jsonResponse({ success: true });

  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// ─── SALES ───
function logSale(ss, data) {
  const sheet = getOrCreateSheet(ss, SHEET_NAMES.sales, salesHeaders());
  const dt = new Date(data.timestamp || new Date());
  sheet.appendRow([
    data.orderId || ('ORD-'+Date.now()),
    (data.firstName||'') + ' ' + (data.lastName||''),
    data.email   || '',
    data.phone   || '',
    data.items   || '',
    data.itemCount || 1,
    data.subtotal || 0,
    data.tax      || 0,
    data.deliveryFee || 0,
    data.total    || 0,
    data.fulfillment || 'pickup',
    formatDate(dt), formatTime(dt),
    data.status  || 'pending'
  ]);
  formatLastRow(sheet, '#E8F5E9');
}

function writeAllSales(ss, sales) {
  const sheet = getOrCreateSheet(ss, SHEET_NAMES.sales, salesHeaders());
  sheet.clear(); // clears both content AND formatting
  const hdrs = salesHeaders();
  const hdrRange = sheet.getRange(1, 1, 1, hdrs.length);
  hdrRange.setValues([hdrs]);
  hdrRange.setBackground('#1a2e44');
  hdrRange.setFontColor('#ffffff');
  hdrRange.setFontWeight('bold');
  hdrRange.setFontSize(10);
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, hdrs.length, 150);
  sales.forEach(data => {
    const dt = new Date(data.timestamp || new Date());
    sheet.appendRow([
      data.orderId,
      (data.firstName||'') + ' ' + (data.lastName||''),
      data.email||'', data.phone||'',
      ''+data.items, data.itemCount||1,
      data.subtotal||0, data.tax||0, data.deliveryFee||0, data.total||0,
      data.fulfillment||'pickup',
      formatDate(dt), formatTime(dt), data.status||'pending'
    ]);
  });
}

// ─── REPAIRS ───
function logRepair(ss, data) {
  const sheet = getOrCreateSheet(ss, SHEET_NAMES.repairs,
    ['Ticket ID','First Name','Last Name','Phone','Email','Address','Appliance','Brand','Description','Date Submitted','Status','Assigned To','Notes']);
  const dt = new Date(data.timestamp || new Date());
  sheet.appendRow([
    data.ticketId||('TKT-'+Date.now()),
    data.firstName||'', data.lastName||'', data.phone||'', data.email||'', data.address||'',
    data.applianceType||'', data.brand||'', data.description||'',
    formatDate(dt)+' '+formatTime(dt), data.status||'New', '', ''
  ]);
  formatLastRow(sheet, '#F3F8FF');
}

function writeAllRepairs(ss, repairs) {
  const repairHeaders = ['Ticket ID','First Name','Last Name','Phone','Email','Service Address','Appliance Type','Appliance Brand','Issue Description','Date Submitted','Status (New/Scheduled/In Progress/Completed)','Assigned Technician','Internal Notes'];
  const sheet = getOrCreateSheet(ss, SHEET_NAMES.repairs, repairHeaders);
  sheet.clear(); // clears both content AND formatting
  const hdrRange = sheet.getRange(1, 1, 1, repairHeaders.length);
  hdrRange.setValues([repairHeaders]);
  hdrRange.setBackground('#1a2e44');
  hdrRange.setFontColor('#ffffff');
  hdrRange.setFontWeight('bold');
  hdrRange.setFontSize(10);
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, repairHeaders.length, 150);
  repairs.forEach(r => {
    const dt = new Date(r.timestamp||new Date());
    sheet.appendRow([r.ticketId,r.firstName,r.lastName,r.phone,r.email,r.address,
      r.applianceType,r.brand,r.description,formatDate(dt)+' '+formatTime(dt),r.status||'New','','']);
  });
}

// ─── INVENTORY ───
function updateInventoryRow(ss, data) {
  const sheet  = getOrCreateSheet(ss, SHEET_NAMES.inventory, inventoryHeaders());
  const values = sheet.getDataRange().getValues();
  const idCol  = values[0].indexOf('Product ID');
  for (let i = 1; i < values.length; i++) {
    if (values[i][idCol] === data.productId) {
      const curStock = parseInt(values[i][5]) || 0;
      const newStock = Math.max(0, curStock + (parseInt(data.qtyChange) || 0));
      const status   = newStock <= 0 ? 'Out of Stock' : 'In Stock';
      sheet.getRange(i+1, 6).setValue(newStock);
      sheet.getRange(i+1, 7).setValue(status);
      if (data.storageLocation !== undefined) sheet.getRange(i+1, 8).setValue(data.storageLocation);
      if (data.price !== undefined) sheet.getRange(i+1, 5).setValue(data.price);
      sheet.getRange(i+1, 9).setValue(new Date());
      return;
    }
  }
}

function writeFullInventory(ss, inventory) {
  const sheet = getOrCreateSheet(ss, SHEET_NAMES.inventory, inventoryHeaders());
  // Clear everything and rewrite — truly idempotent, no duplicates ever
  sheet.clear(); // clears both content AND formatting
  const hdrs = inventoryHeaders();
  const hdrRange = sheet.getRange(1, 1, 1, hdrs.length);
  hdrRange.setValues([hdrs]);
  hdrRange.setBackground('#1a2e44');
  hdrRange.setFontColor('#ffffff');
  hdrRange.setFontWeight('bold');
  hdrRange.setFontSize(10);
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, hdrs.length, 160);
  inventory.forEach(item => {
    const status = item.stock <= 0 ? 'Out of Stock' : 'In Stock';
    sheet.appendRow([item.id, item.name, item.brand||'', item.category||'', item.condition||'',
      item.price||0, item.msrp||0, item.refPrice||0, item.stock||0, status, item.storageLocation||'', item.imageUrl||'', new Date(), item._custom||false]);
    formatLastRow(sheet, status === 'Out of Stock' ? '#FFEBEE' : (item.storageLocation ? '#F0FFF0' : '#F3F8FF'));
  });
}

// ─── ADD NEW PRODUCT (from admin panel) ───
function addProductToInventory(ss, data) {
  const sheet = getOrCreateSheet(ss, SHEET_NAMES.inventory, inventoryHeaders());
  sheet.appendRow([
    data.id || ('PROD-'+Date.now()),
    data.name || '', data.brand || '', data.category || '',
    data.condition || 'Used - Good', data.price || 0, data.stock || 1,
    data.stock > 0 ? 'In Stock' : 'Out of Stock',
    data.storageLocation || '',
    new Date(), true  // _custom = true
  ]);
  formatLastRow(sheet, '#FFF9C4'); // yellow for new custom products
}

// ─── LOG ───
function appendLog(ss, type, data) {
  const sheet = getOrCreateSheet(ss, SHEET_NAMES.log, ['Timestamp (when it happened)','Event Type (what action was triggered)','Summary (details of the event)']);
  let summary = '';
  if (type === 'completed_sale')      summary = `Order ${data.orderId} — $${data.total}`;
  else if (type === 'repair_request') summary = `${data.firstName} ${data.lastName} — ${data.applianceType}`;
  else if (type === 'add_product')    summary = `New product added: ${data.name}`;
  else if (type === 'inventory_update') summary = `Stock update: ${data.productName}`;
  else if (type === 'full_sync')      summary = 'Full admin sync';
  else summary = type;
  sheet.appendRow([new Date(), type, summary]);
}


// ─── VIEWING REQUESTS ───
function logViewRequest(ss, data) {
  const headers = ['Timestamp','Name','Phone','Email','Appliance','Brand','Price ($)','Preferred Contact Time','Status'];
  const sheet = getOrCreateSheet(ss, SHEET_NAMES.views, headers);
  const dt = new Date(data.timestamp || new Date());
  sheet.appendRow([
    dt,
    data.name || '',
    data.phone || '',
    data.email || '',
    data.appliance || '',
    data.brand || '',
    data.price || '',
    data.preferredTime || '',
    'New'
  ]);
  formatLastRow(sheet, '#FFF3E0');
}

// ─── HELPERS ───
function salesHeaders() {
  return ['Order ID','Customer Full Name','Customer Email','Customer Phone','Items Ordered','Item Count','Subtotal ($)','Tax ($)','Delivery Fee ($)','Total Charged ($)','Fulfillment Type (pickup/view/delivery)','Date','Time','Order Status'];
}

function inventoryHeaders() {
  return ['Product ID','Product Name','Brand / Manufacturer','Category (appliance type)','Condition (New/Used/etc)','Our Price ($)','MSRP / Retail Price ($)','Competitor Price ($)','Stock Qty','Status (In Stock / Out of Stock)','Storage Location','Image URL(s)','Last Updated','Admin-Added'];
}

// Ensures header row exists — adds it if row 1 is blank (e.g. sheet created manually)
function ensureHeaders(sheet, headers) {
  const row1 = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (!row1[0]) {
    const r = sheet.getRange(1, 1, 1, headers.length);
    r.setValues([headers]);
    r.setBackground('#1a2e44');
    r.setFontColor('#ffffff');
    r.setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    const r = sheet.getRange(1, 1, 1, headers.length);
    r.setValues([headers]);
    r.setBackground('#1a2e44');
    r.setFontColor('#ffffff');
    r.setFontWeight('bold');
    r.setFontSize(10);
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, headers.length, 150);
  }
  return sheet;
}

function clearDataRows(sheet) {
  const last = sheet.getLastRow();
  if (last > 1) sheet.deleteRows(2, last - 1);
}

function formatLastRow(sheet, bg) {
  const lr = sheet.getLastRow(), lc = sheet.getLastColumn();
  sheet.getRange(lr, 1, 1, lc).setBackground(bg);
}

function formatDate(d) { return Utilities.formatDate(d, 'America/Los_Angeles', 'MM/dd/yyyy'); }
function formatTime(d) { return Utilities.formatDate(d, 'America/Los_Angeles', 'HH:mm:ss'); }

// ─── RUN THIS ONCE MANUALLY TO SET UP ALL SHEETS ───
function initialSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.rename('Oceanside Appliance — Database');
  getOrCreateSheet(ss, SHEET_NAMES.sales, salesHeaders());
  getOrCreateSheet(ss, SHEET_NAMES.repairs,   ['Ticket ID','First Name','Last Name','Phone','Email','Address','Appliance','Brand','Description','Date Submitted','Status','Assigned To','Notes']);
  getOrCreateSheet(ss, SHEET_NAMES.inventory, inventoryHeaders());
  getOrCreateSheet(ss, SHEET_NAMES.log,       ['Timestamp (when it happened)','Event Type (what action was triggered)','Summary (details of the event)']);
  SpreadsheetApp.getUi().alert('✅ Oceanside Appliance database ready!\n\nNext: Deploy → New Deployment → Web App');
}
