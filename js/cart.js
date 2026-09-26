// ============================================
//   OCEANSIDE APPLIANCE — CART
//   Stored in this browser as [{ id, qty }]; prices always come from
//   the live inventory, and the server re-checks everything on order.
// ============================================

let cart = [];
try { cart = JSON.parse(localStorage.getItem('oa_cart') || '[]').filter(i => i && i.id && i.qty > 0); } catch { cart = []; }

function saveCart() {
  try { localStorage.setItem('oa_cart', JSON.stringify(cart)); } catch {}
}

function cartLines() {
  return cart.map(i => ({ ...i, product: getProduct(i.id) })).filter(l => l.product);
}
function getSubtotal() {
  return roundCents(cartLines().reduce((s, l) => s + l.product.price * Math.min(l.qty, l.product.stock), 0));
}
function cartCount() { return cart.reduce((s, i) => s + i.qty, 0); }

function addToCart(productId) {
  const product = getProduct(productId);
  if (!product || product.stock <= 0) return;
  const existing = cart.find(i => i.id === productId);
  if ((existing?.qty || 0) >= product.stock) {
    showToast(product.stock === 1 ? `That's our only one — it's already in your cart` : `Only ${product.stock} available`, { type: 'alert' });
    return;
  }
  if (existing) existing.qty += 1;
  else cart.push({ id: productId, qty: 1 });
  saveCart();
  updateCartUI(true);
  applyFilters();
  showToast(`${product.name} added to cart`, { type: 'cart' });
}

function removeFromCart(productId) {
  cart = cart.filter(i => i.id !== productId);
  saveCart();
  updateCartUI();
  applyFilters();
}

function updateQty(productId, delta) {
  const item = cart.find(i => i.id === productId);
  if (!item) return;
  const product = getProduct(productId);
  if (delta > 0 && product && item.qty >= product.stock) {
    showToast(`Only ${product.stock} available`, { type: 'alert' });
    return;
  }
  item.qty += delta;
  if (item.qty <= 0) return removeFromCart(productId);
  saveCart();
  updateCartUI();
  applyFilters();
}

function clearCart() {
  cart = [];
  saveCart();
  updateCartUI();
}

function thumbHtml(p) {
  const img = productImages(p)[0];
  return `<span class="cart-thumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy" data-fallback="${categoryIcon(p.category)}" />` : icon(categoryIcon(p.category))}</span>`;
}

function updateCartUI(bump = false) {
  // Once inventory is known, drop items that no longer exist and cap quantities at stock
  if (productsState === 'ready') {
    const before = JSON.stringify(cart);
    cart = cart.filter(i => getProduct(i.id));
    if (JSON.stringify(cart) !== before) saveCart();
  }

  const count = cartCount();
  document.querySelectorAll('#cartCountNav, #cartCountMobile').forEach(el => {
    el.textContent = count;
    if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  });
  document.getElementById('cartTotal').textContent = money(getSubtotal());

  const container = document.getElementById('cartItems');
  const footer = document.getElementById('cartFooter');
  const lines = cartLines();
  footer.hidden = !lines.length;

  if (!lines.length) {
    container.innerHTML = `<div class="cart-empty">${icon('cart')}<p>${productsState === 'loading' && cart.length ? 'Loading your cart…' : 'Your cart is empty.'}</p>
      <a href="#products" class="btn-outline" data-close>Browse appliances</a></div>`;
    return;
  }

  container.innerHTML = lines.map(({ product: p, qty }) => {
    const out = p.stock <= 0;
    const over = !out && qty > p.stock;
    return `<div class="cart-item">
      ${thumbHtml(p)}
      <div class="cart-item-info">
        <div class="cart-item-name">${esc(p.name)}</div>
        <div class="cart-item-meta">${esc([p.brand, p.condition].filter(Boolean).join(' · '))} · ${money(p.price)} each</div>
        ${out ? '<div class="cart-item-warn">Just sold out — please remove</div>' : over ? `<div class="cart-item-warn">Only ${p.stock} left</div>` : ''}
        <div class="cart-qty">
          <button type="button" class="qty-btn" data-qty="-1" data-id="${esc(p.id)}" aria-label="Decrease quantity">${icon('minus')}</button>
          <span class="qty-val" aria-label="Quantity">${qty}</span>
          <button type="button" class="qty-btn" data-qty="1" data-id="${esc(p.id)}" aria-label="Increase quantity" ${qty >= p.stock ? 'disabled' : ''}>${icon('plus')}</button>
        </div>
      </div>
      <div class="cart-item-side">
        <div class="cart-item-price">${money(p.price * qty)}</div>
        <button type="button" class="cart-item-remove" data-remove="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">${icon('trash')}</button>
      </div>
    </div>`;
  }).join('');
}

function cartHasProblems() {
  return cartLines().some(l => l.product.stock <= 0 || l.qty > l.product.stock);
}

function openCart() {
  document.getElementById('cartOverlay').classList.add('open');
  Modal.open(document.getElementById('cartSidebar'), {
    onClose: () => document.getElementById('cartOverlay').classList.remove('open')
  });
}
function closeCart() { Modal.close(document.getElementById('cartSidebar')); }
function toggleCart() {
  document.getElementById('cartSidebar').classList.contains('open') ? closeCart() : openCart();
}

document.addEventListener('DOMContentLoaded', () => {
  updateCartUI();
  document.getElementById('cartNavBtn')?.addEventListener('click', openCart);
  document.getElementById('mobileCartBtn')?.addEventListener('click', openCart);
  document.getElementById('cartCloseBtn')?.addEventListener('click', closeCart);
  document.getElementById('cartOverlay')?.addEventListener('click', closeCart);
  document.getElementById('cartItems')?.addEventListener('click', e => {
    const q = e.target.closest('[data-qty]');
    if (q) return updateQty(q.dataset.id, Number(q.dataset.qty));
    const r = e.target.closest('[data-remove]');
    if (r) removeFromCart(r.dataset.remove);
  });
  document.getElementById('checkoutBtn')?.addEventListener('click', openCheckout);

  // Cart changed in another tab
  window.addEventListener('storage', e => {
    if (e.key !== 'oa_cart') return;
    try { cart = JSON.parse(e.newValue || '[]'); } catch { cart = []; }
    updateCartUI();
  });
});
