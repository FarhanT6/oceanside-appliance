
// ── EmailJS Configuration ──
// Replace these with your real EmailJS IDs after setup
const EMAILJS_CONFIG = {
  publicKey:       'zApEOFXgTWDriXocs',
  serviceId:       'service_22kkrwi',
  ownerTemplateId: 'template_yria11m',    // email to you (Farhan)
  customerTemplateId: 'template_9afw7mc' // confirmation to customer
};

// ── Load EmailJS ──
(function loadEmailJS() {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
  s.onload = () => {
    if (EMAILJS_CONFIG.publicKey !== 'zApEOFXgTWDriXocs') {
      emailjs.init({ publicKey: EMAILJS_CONFIG.publicKey });
    }
  };
  document.head.appendChild(s);
})();

// ── State ──
let currentCheckoutStep = 1;
let orderCompleted = false;

// ── Open checkout (called from cart.js checkout button) ──
function openCheckout() {
  if (cart.length === 0) { showToast('⚠️ Your cart is empty!'); return; }

  // Close cart sidebar first
  const sidebar = document.getElementById('cartSidebar');
  const overlay = document.getElementById('cartOverlay');
  sidebar.classList.remove('open');
  overlay.classList.remove('open');

  // Reset to step 1
  currentCheckoutStep = 1;
  updateCheckoutSteps(1);
  ['checkoutStep1','checkoutStep2','checkoutStep3'].forEach((id, i) => {
    document.getElementById(id).classList.toggle('hidden', i !== 0);
  });

  populateSidebar();
  updateFooterTotal();

  document.getElementById('checkoutOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCheckout() {
  document.getElementById('checkoutOverlay').classList.remove('open');
  document.body.style.overflow = '';
  if (orderCompleted) window.location.reload();
}

// Close on overlay click
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('checkoutOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('checkoutOverlay')) closeCheckout();
  });

  // Show/hide delivery address based on selection
  document.querySelectorAll('input[name="fulfillment"]').forEach(r => {
    r.addEventListener('change', () => {
      const block = document.getElementById('deliveryAddressBlock');
      block.style.display = r.value === 'delivery' ? 'block' : 'none';
      updateOrderTotal();
      updateFooterTotal();
    });
  });
});

// ── Populate sidebar order summary ──
function populateSidebar() {
  const container = document.getElementById('checkoutSidebarItems');
  if (!container) return;
  container.innerHTML = cart.map(item => {
    const p = getProduct(item.id);
    if (!p) return '';
    return `<div class="checkout-sidebar-item">
      <div class="sidebar-item-icon">${p.icon}</div>
      <div style="flex:1">
        <div class="sidebar-item-name">${p.name}</div>
        <div class="sidebar-item-qty">Qty: ${item.qty}</div>
      </div>
      <div class="sidebar-item-price">$${(p.price * item.qty).toLocaleString()}</div>
    </div>`;
  }).join('');

  const subtotal = getSubtotal();
  document.getElementById('checkoutSidebarSubtotal').textContent = `$${subtotal.toLocaleString()}`;
}

function getSubtotal() {
  return cart.reduce((sum, i) => {
    const p = getProduct(i.id); return p ? sum + p.price * i.qty : sum;
  }, 0);
}

function getDeliveryFee() {
  return 0; // No fixed delivery fee — arranged by appointment
}

const SALES_TAX_RATE = 0.0825; // 8.25% Oceanside, CA sales tax

function getSalesTax(subtotal) {
  return Math.round(subtotal * SALES_TAX_RATE * 100) / 100;
}

function updateFooterTotal() {
  const subtotal = getSubtotal();
  const tax   = getSalesTax(subtotal);
  const total = subtotal + tax;
  const el1 = document.getElementById('checkoutFooterTotal');
  if (el1) el1.textContent = `$${total.toLocaleString('en-US', {minimumFractionDigits:2})}`;
}

// ── Step navigation ──
function updateCheckoutSteps(step) {
  currentCheckoutStep = step;
  const labels = ['', 'Your Information', 'Review Order', 'Order Confirmed'];
  document.getElementById('checkoutStepLabel').textContent = labels[step];

  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`step-dot-${i}`);
    el.classList.remove('active', 'done');
    if (i < step) el.classList.add('done');
    else if (i === step) el.classList.add('active');
  }
}

function goToStep1() {
  document.getElementById('checkoutStep2').classList.add('hidden');
  document.getElementById('checkoutStep1').classList.remove('hidden');
  updateCheckoutSteps(1);
}

function goToStep2() {
  // Validate
  const fields = [
    { id: 'co-firstName', label: 'First name' },
    { id: 'co-lastName',  label: 'Last name' },
    { id: 'co-phone',     label: 'Phone number' },
    { id: 'co-email',     label: 'Email address' },
  ];

  const delivery = document.querySelector('input[name="fulfillment"]:checked')?.value;
  if (delivery === 'delivery') {
    fields.push({ id: 'co-address', label: 'Delivery address (optional for now)' });
  }

  let valid = true;
  fields.forEach(f => {
    const el = document.getElementById(f.id);
    if (!el.value.trim()) {
      el.classList.add('error');
      el.addEventListener('input', () => el.classList.remove('error'), { once: true });
      valid = false;
    }
  });

  if (!valid) { showToast('⚠️ Please fill in all required fields.'); return; }

  // Email validation
  const emailEl = document.getElementById('co-email');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value)) {
    emailEl.classList.add('error');
    showToast('⚠️ Please enter a valid email address.');
    return;
  }

  buildReviewStep();
  document.getElementById('checkoutStep1').classList.add('hidden');
  document.getElementById('checkoutStep2').classList.remove('hidden');
  updateCheckoutSteps(2);
  document.getElementById('checkoutModal').scrollTop = 0;
}

function buildReviewStep() {
  const subtotal    = getSubtotal();
  const deliveryFee = 0;
  const tax         = getSalesTax(subtotal);
  const total       = subtotal + tax;
  const delivery    = document.querySelector('input[name="fulfillment"]:checked')?.value;

  // Items
  document.getElementById('reviewItems').innerHTML = cart.map(item => {
    const p = getProduct(item.id); if (!p) return '';
    return `<div class="review-item">
      <div class="review-item-icon">${p.icon}</div>
      <div>
        <div class="review-item-name">${p.name}</div>
        <div class="review-item-meta">${p.brand} · Qty: ${item.qty}</div>
      </div>
      <div class="review-item-price">$${(p.price * item.qty).toLocaleString()}</div>
    </div>`;
  }).join('');

  // Details
  document.getElementById('reviewDetails').innerHTML = `
    <div class="review-detail-row"><span>Name</span><span>${val('co-firstName')} ${val('co-lastName')}</span></div>
    <div class="review-detail-row"><span>Phone</span><span>${val('co-phone')}</span></div>
    <div class="review-detail-row"><span>Email</span><span>${val('co-email')}</span></div>
    ${val('co-date') ? `<div class="review-detail-row"><span>Availability</span><span>${val('co-date')}</span></div>` : ''}
    ${val('co-notes') ? `<div class="review-detail-row"><span>Notes</span><span>${val('co-notes')}</span></div>` : ''}
  `;

  // Fulfillment
  document.getElementById('reviewFulfillment').innerHTML = `
    <div class="review-detail-row"><span>Type</span><span>${delivery === 'delivery' ? '🚚 Delivery & Installation' : delivery === 'view' ? '👀 View In Person' : '🏪 Store Pickup'}</span></div>
    ${delivery === 'delivery' ? `<div class="review-detail-row"><span>Address</span><span>${val('co-address')}</span></div>` : ''}
  `;

  // Price breakdown
  const totalWithTax = subtotal + tax;
  document.getElementById('reviewPriceBreakdown').innerHTML = `
    <div class="price-row"><span>Subtotal (${cart.reduce((s,i)=>s+i.qty,0)} items)</span><span>$${subtotal.toLocaleString('en-US',{minimumFractionDigits:2})}</span></div>
    <div class="price-row"><span>Sales Tax (8.25%)</span><span>$${tax.toLocaleString('en-US',{minimumFractionDigits:2})}</span></div>
    <div class="price-row total"><span>Estimated Total</span><span>$${totalWithTax.toLocaleString('en-US',{minimumFractionDigits:2})}</span></div>
    <p style="font-size:.72rem;color:var(--gray-mid);margin-top:.75rem;line-height:1.5">Parts/installation costs may vary. Final price confirmed when we contact you.</p>
  `;
}

function val(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

// ── Submit Order ──
async function submitOrder() {
  const btn = document.getElementById('submitBtnText');
  btn.textContent = '⏳ Submitting…';
  document.querySelector('.btn-checkout-next').disabled = true;

  const orderId     = 'ORD-' + Date.now();
  const timestamp   = new Date().toISOString();
  const subtotal    = getSubtotal();
  const deliveryFee = 0;
  const tax         = getSalesTax(subtotal);
  const total       = subtotal + tax;
  const delivery    = document.querySelector('input[name="fulfillment"]:checked')?.value;

  const itemList = cart.map(i => {
    const p = getProduct(i.id);
    return p ? `${p.name} x${i.qty} ($${p.price * i.qty})` : '';
  }).filter(Boolean).join(' | ');

  const orderData = {
    orderId, timestamp, status: 'pending',
    firstName:   val('co-firstName'),
    lastName:    val('co-lastName'),
    phone:       val('co-phone'),
    email:       val('co-email'),
    address:     val('co-address'),
    fulfillment: delivery,
    availability: val('co-date'),
    notes:       val('co-notes'),
    items:       itemList,
    subtotal, deliveryFee, total,
    itemCount:   cart.reduce((s,i) => s+i.qty, 0),
  };

  // 1. Save to localStorage (admin panel reads this)
  const sales = JSON.parse(localStorage.getItem('oa_sales') || '[]');
  sales.unshift(orderData);
  localStorage.setItem('oa_sales', JSON.stringify(sales));

  // 2. Sync to Google Sheets
  logToSheets('completed_sale', orderData); // fire-and-forget — don't block confirmation

  // 3. Send emails via EmailJS
  await sendOrderEmails(orderData);

  // 4. Show confirmation
  orderCompleted = true;
  showConfirmation(orderData);

  // 5. Decrement stock immediately so no one else can buy sold items
  const inventory = getStore('inventory');
  cart.forEach(item => {
    let inv = inventory.find(i => i.id === item.id);
    if (inv) {
      inv.stock = Math.max(0, (inv.stock || 0) - item.qty);
      inv.stockStatus = inv.stock <= 0 ? 'out' : 'in-stock';
    } else {
      // Product from hardcoded PRODUCTS — save an override record
      const p = getProduct(item.id);
      if (p) {
        inventory.push({
          id: p.id, name: p.name, brand: p.brand,
          category: p.category, price: p.price,
          stock: Math.max(0, (p.stock || 0) - item.qty),
          stockStatus: Math.max(0, (p.stock || 0) - item.qty) <= 0 ? 'out' : 'in-stock',
        });
      }
    }
  });
  setStore('inventory', inventory);

  // 6. Clear cart
  cart = [];
  saveCart();
  updateCartUI();
}

async function sendOrderEmails(order) {
  if (EMAILJS_CONFIG.publicKey === 'zApEOFXgTWDriXocs') {
    console.log('[EmailJS Mock] Would send emails for order:', order.orderId);
    return;
  }

  const itemLines = cart.map(i => {
    const p = getProduct(i.id);
    return p ? `• ${p.name} (x${i.qty}) — $${(p.price * i.qty).toLocaleString()}` : '';
  }).filter(Boolean).join('\n');

  // Email to Farhan (owner notification)
  const ownerParams = {
    to_email:    'oceansideappliance96@gmail.com',
    order_id:    order.orderId,
    customer_name: `${order.firstName} ${order.lastName}`,
    customer_phone: order.phone,
    customer_email: order.email,
    items:       order.items,
    subtotal:    `$${order.subtotal.toLocaleString('en-US',{minimumFractionDigits:2})}`,
    fulfillmentType: order.fulfillment === 'delivery' ? 'Delivery & Installation' : order.fulfillment === 'view' ? 'View In Person' : 'Store Pickup',
    delivery_fee: order.deliveryFee > 0 ? `$${order.deliveryFee} (Delivery & Installation)` : 'N/A (Pickup)',
    total:       `$${order.total.toLocaleString('en-US',{minimumFractionDigits:2})}`,
    fulfillment: order.fulfillment === 'delivery' ? `Delivery to: ${order.address}` : 'Store Pickup',
    availability: order.availability || 'Not specified',
    notes:       order.notes || 'None',
    timestamp:   new Date(order.timestamp).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }),
  };

  // Email to customer (confirmation)
  const customerParams = {
    to_email:    order.email,
    to_name:     order.firstName,
    order_id:    order.orderId,
    items:       itemLines,
    total:       `$${order.total.toLocaleString()}`,
    fulfillment: order.fulfillment === 'delivery' ? `Delivery to ${order.address}` : 'Store Pickup at 1016 S Tremont St, Oceanside',
    business_phone: '(760) 754-8200',
    business_email: 'oceansideappliance96@gmail.com',
  };

  try {
    await Promise.all([
      emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.ownerTemplateId, ownerParams),
      emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.customerTemplateId, customerParams),
    ]);
    console.log('Emails sent successfully');
  } catch (err) {
    console.error('EmailJS error:', err);
    // Don't block checkout if email fails
  }
}

function showConfirmation(order) {
  document.getElementById('checkoutStep2').classList.add('hidden');
  document.getElementById('checkoutStep3').classList.remove('hidden');
  updateCheckoutSteps(3);

  document.getElementById('confirmationDetails').innerHTML = `
    <div class="review-detail-row"><span>Order ID</span><span>${order.orderId}</span></div>
    <div class="review-detail-row"><span>Name</span><span>${order.firstName} ${order.lastName}</span></div>
    <div class="review-detail-row"><span>Phone</span><span>${order.phone}</span></div>
    <div class="review-detail-row"><span>Email</span><span>${order.email}</span></div>
    <div class="review-detail-row"><span>Fulfillment</span><span>${order.fulfillment === 'delivery' ? '🚚 Delivery' : '🏪 Pickup'}</span></div>
    <div class="review-detail-row"><span>Tax (8.25%)</span><span>$${(order.tax||0).toLocaleString('en-US',{minimumFractionDigits:2})}</span></div>
    <div class="review-detail-row"><span>Est. Total</span><span><strong>$${order.total.toLocaleString('en-US',{minimumFractionDigits:2})}</strong></span></div>
  `;
  document.getElementById('checkoutModal').scrollTop = 0;
}
