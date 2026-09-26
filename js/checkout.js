// ============================================
//   OCEANSIDE APPLIANCE — CHECKOUT (order request)
//   1. Details → 2. Review → 3. Confirmed
//   The order is checked against live stock by Google Apps Script, which
//   reserves the items and emails the owner. EmailJS sends the customer
//   their confirmation email.
// ============================================

const EMAILJS_CONFIG = {
  publicKey:          'zApEOFXgTWDriXocs',
  serviceId:          'service_22kkrwi',
  customerTemplateId: 'template_9afw7mc', // confirmation to the customer
};

// Load EmailJS on demand (only when someone starts checking out)
let emailjsReady = null;
function loadEmailJS() {
  if (emailjsReady) return emailjsReady;
  emailjsReady = new Promise(resolve => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
    s.onload = () => {
      try { window.emailjs.init({ publicKey: EMAILJS_CONFIG.publicKey }); resolve(true); }
      catch (e) { console.warn('EmailJS init failed', e); resolve(false); }
    };
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return emailjsReady;
}

let orderClientRef = null;
let orderCompleted = false;

const checkoutEl = () => document.getElementById('checkoutOverlay');

function openCheckout() {
  if (!cart.length) { showToast('Your cart is empty', { type: 'alert' }); return; }
  if (cartHasProblems()) { showToast('Please fix the items marked in your cart first', { type: 'alert' }); return; }
  closeCart();
  loadEmailJS();
  orderCompleted = false;
  orderClientRef = newClientRef();
  showStep(1);
  populateSidebar();
  Modal.open(checkoutEl(), { onClose: onCheckoutClosed });
}

function closeCheckout() { Modal.close(checkoutEl()); }

function onCheckoutClosed() {
  if (orderCompleted) { orderCompleted = false; showStep(1); }
}

function showStep(step) {
  [1, 2, 3].forEach(n => { document.getElementById(`checkoutStep${n}`).hidden = n !== step; });
  document.getElementById('checkoutStepLabel').textContent = ['', 'Your Information', 'Review Your Order', 'Order Received'][step];
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`step-dot-${i}`);
    el.classList.toggle('done', i < step);
    el.classList.toggle('active', i === step);
    el.querySelector('.step-dot').innerHTML = i < step ? icon('check') : i;
  }
  document.getElementById('checkoutModal').scrollTop = 0;
}

function totals() {
  const subtotal = getSubtotal();
  const tax = roundCents(subtotal * SALES_TAX_RATE);
  return { subtotal, tax, total: roundCents(subtotal + tax) };
}

function populateSidebar() {
  document.getElementById('checkoutSidebarItems').innerHTML = cartLines().map(({ product: p, qty }) => `
    <div class="checkout-sidebar-item">
      ${thumbHtml(p)}
      <div><div class="sidebar-item-name">${esc(p.name)}</div><div class="sidebar-item-qty">Qty ${qty}</div></div>
      <div class="sidebar-item-price">${money(p.price * qty)}</div>
    </div>`).join('');
  const t = totals();
  document.getElementById('checkoutSidebarSubtotal').textContent = money(t.subtotal, true);
  document.getElementById('checkoutSidebarTax').textContent = money(t.tax, true);
  document.getElementById('checkoutSidebarTotal').textContent = money(t.total, true);
}

function val(id) { return document.getElementById(id)?.value?.trim() || ''; }
function fulfillment() { return document.querySelector('input[name="fulfillment"]:checked')?.value || 'pickup'; }

function goToStep2(e) {
  e?.preventDefault();
  const isDelivery = fulfillment() === 'delivery';
  const rules = [
    { el: document.getElementById('co-firstName'), test: required, msg: 'Please enter your first name.' },
    { el: document.getElementById('co-lastName'),  test: required, msg: 'Please enter your last name.' },
    { el: document.getElementById('co-phone'),     test: isValidPhone, msg: 'Please enter a 10-digit phone number.' },
    { el: document.getElementById('co-email'),     test: isValidEmail, msg: 'Please enter a valid email address.' },
  ];
  if (isDelivery) rules.push({ el: document.getElementById('co-address'), test: required, msg: 'Please enter the delivery address.' });
  if (!validateFields(rules)) return;

  const t = totals();
  const count = cartCount();
  document.getElementById('reviewItems').innerHTML = cartLines().map(({ product: p, qty }) => `
    <div class="review-item">
      ${thumbHtml(p)}
      <div><div class="sidebar-item-name">${esc(p.name)}</div><div class="sidebar-item-qty">${esc([p.brand, p.condition].filter(Boolean).join(' · '))} · Qty ${qty}</div></div>
      <div class="sidebar-item-price">${money(p.price * qty)}</div>
    </div>`).join('');

  const row = (k, v) => v ? `<div class="review-detail-row"><span>${k}</span><span>${esc(v)}</span></div>` : '';
  document.getElementById('reviewDetails').innerHTML =
    row('Name', `${val('co-firstName')} ${val('co-lastName')}`) +
    row('Phone', val('co-phone')) +
    row('Email', val('co-email')) +
    row('Fulfillment', isDelivery ? 'Delivery & installation' : 'Store pickup') +
    (isDelivery ? row('Address', val('co-address')) : '') +
    row('Availability', val('co-date')) +
    row('Notes', val('co-notes'));

  document.getElementById('reviewPriceBreakdown').innerHTML = `
    <div class="price-row"><span>Subtotal (${count} item${count !== 1 ? 's' : ''})</span><span>${money(t.subtotal, true)}</span></div>
    <div class="price-row"><span>Sales tax (8.25%)</span><span>${money(t.tax, true)}</span></div>
    ${isDelivery ? '<div class="price-row"><span>Delivery</span><span>Quoted by phone</span></div>' : ''}
    <div class="price-row total"><span>Estimated total</span><span>${money(t.total, true)}</span></div>`;

  showFormError(document.getElementById('checkoutError'), '');
  showStep(2);
}

async function submitOrder() {
  const btn = document.getElementById('submitOrderBtn');
  const errEl = document.getElementById('checkoutError');
  showFormError(errEl, '');
  setBusy(btn, true, 'Reserving your items…');

  const lines = cartLines();
  const payload = {
    clientRef:    orderClientRef,
    firstName:    val('co-firstName'),
    lastName:     val('co-lastName'),
    phone:        val('co-phone'),
    email:        val('co-email'),
    fulfillment:  fulfillment(),
    address:      fulfillment() === 'delivery' ? val('co-address') : '',
    availability: val('co-date'),
    notes:        val('co-notes'),
    website:      val('co-website'),
    lineItems:    lines.map(l => ({ id: l.id, qty: l.qty })),
  };

  const res = await apiPost('order', payload);
  setBusy(btn, false);

  if (!res.success) {
    showFormError(errEl, res.error || `Something went wrong. Please try again or call ${BUSINESS_PHONE}.`);
    loadProducts(); // stock may have changed — refresh so the cart shows what's left
    return;
  }

  // Use the server's numbers when we have them; otherwise our own estimate
  const t = totals();
  const order = res.order || {
    orderId: null,
    items: lines.map(l => `${l.product.name} x${l.qty}`).join(' | '),
    lineItems: lines.map(l => ({ id: l.id, name: l.product.name, qty: l.qty, price: l.product.price })),
    subtotal: t.subtotal, tax: t.tax, total: t.total, fulfillment: payload.fulfillment,
  };

  sendCustomerEmail(order, payload);
  showConfirmation(order, payload, !!res.unconfirmed);
  orderCompleted = true;
  clearCart();
  loadProducts(); // pull the new stock levels
}

async function sendCustomerEmail(order, c) {
  if (!(await loadEmailJS()) || !window.emailjs) return;
  const itemLines = (order.lineItems || []).map(l => `• ${l.name} (x${l.qty}) — ${money(l.price * l.qty, true)}`).join('\n') || order.items;
  try {
    await window.emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.customerTemplateId, {
      to_email:       c.email,
      to_name:        c.firstName,
      order_id:       order.orderId || 'Pending',
      items:          itemLines,
      subtotal:       money(order.subtotal, true),
      tax:            money(order.tax, true),
      total:          money(order.total, true),
      fulfillment:    c.fulfillment === 'delivery' ? `Delivery to ${c.address}` : 'Store pickup at 1016 S Tremont St, Oceanside',
      business_phone: BUSINESS_PHONE,
      business_email: 'oceansideappliance96@gmail.com',
    });
  } catch (err) {
    console.warn('Confirmation email failed (order is still saved):', err);
  }
}

function showConfirmation(order, c, unconfirmed) {
  const row = (k, v) => `<div class="review-detail-row"><span>${k}</span><span>${v}</span></div>`;
  document.getElementById('confirmationSubtitle').textContent = unconfirmed
    ? `Thanks, ${c.firstName}! We received your request and will call ${c.phone} shortly to confirm.`
    : `Thanks, ${c.firstName}! We'll call ${c.phone} shortly to confirm and set up ${c.fulfillment === 'delivery' ? 'delivery' : 'pickup'}. A copy is on its way to ${c.email}.`;
  document.getElementById('confirmationDetails').innerHTML =
    (order.orderId ? row('Order number', `<strong>${esc(order.orderId)}</strong>`) : '') +
    row('Items', esc((order.lineItems || []).map(l => `${l.name} × ${l.qty}`).join(', ') || order.items)) +
    row('Fulfillment', c.fulfillment === 'delivery' ? 'Delivery & installation' : 'Store pickup') +
    row('Sales tax', money(order.tax, true)) +
    row('Estimated total', `<strong>${money(order.total, true)}</strong>`);
  showStep(3);
  document.querySelector('#checkoutStep3 .btn-primary')?.focus();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('checkoutStep1')?.addEventListener('submit', goToStep2);
  document.getElementById('backToStep1')?.addEventListener('click', () => showStep(1));
  document.getElementById('submitOrderBtn')?.addEventListener('click', submitOrder);
  document.querySelectorAll('input[name="fulfillment"]').forEach(r => r.addEventListener('change', () => {
    document.getElementById('deliveryAddressBlock').hidden = fulfillment() !== 'delivery';
  }));
});
