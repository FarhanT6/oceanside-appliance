// ── Shared store helpers ──
function getStore(key) {
  try { return JSON.parse(localStorage.getItem('oa_' + key) || '[]'); } catch { return []; }
}
function setStore(key, val) { localStorage.setItem('oa_' + key, JSON.stringify(val)); }


let cart = JSON.parse(localStorage.getItem('oa_cart') || '[]');

function saveCart() { localStorage.setItem('oa_cart', JSON.stringify(cart)); }

function addToCart(productId, e) {
  if (e) e.stopPropagation();
  const product = getProduct(productId);
  if (!product || product.stock === 0) return;
  const existing = cart.find(i => i.id === productId);
  const currentQty = existing ? existing.qty : 0;
  if (currentQty >= product.stock) {
    showToast(`⚠️ Only ${product.stock} available for ${product.name}`);
    return;
  }
  if (existing) existing.qty += 1;
  else cart.push({ id: productId, qty: 1 });
  saveCart();
  updateCartUI();
  showToast(`✅ ${product.name} added to cart!`);
}

function removeFromCart(productId) {
  cart = cart.filter(i => i.id !== productId);
  saveCart();
  updateCartUI();
}

function updateQty(productId, delta) {
  const item = cart.find(i => i.id === productId);
  if (!item) return;
  if (delta > 0) {
    const product = getProduct(productId);
    if (product && item.qty >= product.stock) {
      showToast(`⚠️ Only ${product.stock} available`);
      return;
    }
  }
  item.qty += delta;
  if (item.qty <= 0) removeFromCart(productId);
  else { saveCart(); updateCartUI(); }
}

function updateCartUI() {
  const total = cart.reduce((sum, i) => {
    const p = getProduct(i.id);
    return p ? sum + p.price * i.qty : sum;
  }, 0);
  const count = cart.reduce((sum, i) => sum + i.qty, 0);

  document.querySelectorAll('#cartCountNav').forEach(el => el.textContent = count);
  document.getElementById('cartTotal').textContent =
    `$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const container = document.getElementById('cartItems');
  if (cart.length === 0) {
    container.innerHTML = `<p style="color:var(--gray-mid);text-align:center;padding:3rem 1rem;font-size:0.9rem;">
      Your cart is empty.<br/><a href='#products' style='color:var(--ocean)' onclick='toggleCart()'>Browse products →</a></p>`;
    return;
  }
  container.innerHTML = cart.map(item => {
    const p = getProduct(item.id);
    if (!p) return '';
    return `<div class="cart-item">
      <div class="cart-item-icon">${p.icon}</div>
      <div class="cart-item-info">
        <div class="cart-item-name">${p.name}</div>
        <div class="cart-item-price">$${(p.price * item.qty).toLocaleString()}</div>
        <div class="cart-qty">
          <button class="qty-btn" onclick="updateQty('${p.id}',-1)">−</button>
          <span class="qty-val">${item.qty}</span>
          <button class="qty-btn" onclick="updateQty('${p.id}',1)">+</button>
        </div>
      </div>
      <button class="cart-item-remove" onclick="removeFromCart('${p.id}')">🗑️</button>
    </div>`;
  }).join('');
}

function toggleCart() {
  const overlay = document.getElementById('cartOverlay');
  const sidebar = document.getElementById('cartSidebar');
  const isOpen  = sidebar.classList.contains('open');
  overlay.classList.toggle('open', !isOpen);
  sidebar.classList.toggle('open', !isOpen);
  document.body.style.overflow = isOpen ? '' : 'hidden';
}

async function checkout() {
  openCheckout(); // handled by checkout.js
}

document.addEventListener('DOMContentLoaded', () => {
  updateCartUI();
  document.getElementById('cartNavBtn')?.addEventListener('click', e => {
    e.preventDefault(); toggleCart();
  });
});
