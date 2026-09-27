// ============================================
//   OCEANSIDE APPLIANCE — WEBSITE CHAT
//   A small "Ask us" assistant. Answers come from Claude via the Apps Script
//   backend, which only knows the store's public facts and what's in stock.
// ============================================

(function () {
  const BASE = (document.currentScript?.getAttribute('src') || '').replace(/js\/chat\.js.*$/, '');
  const KEY = 'oa_chat';
  const GREETING = "Hi! I can help you find an appliance we have in stock, answer questions about delivery or pickup, or help with a repair. What can I help with?";
  const SUGGESTIONS = ['What washers do you have?', 'My fridge isn’t cooling', 'Do you deliver?'];

  let state = load();
  let busy = false;
  let errorNote = '';
  let els = {};

  function load() {
    try {
      const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (s && Array.isArray(s.messages)) return s;
    } catch {}
    return { id: 'chat-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), messages: [], open: false };
  }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch {} }

  function build() {
    const launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'chat-launcher';
    launcher.setAttribute('aria-label', 'Chat with us');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.innerHTML = `${icon('chat')}<span>Ask us</span>`;

    const panel = document.createElement('section');
    panel.className = 'chat-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chat with Oceanside Appliance');
    panel.innerHTML = `
      <header class="chat-head">
        <div><strong>Oceanside Appliance</strong><span>Ask about appliances, delivery or repairs</span></div>
        <button type="button" class="chat-close" aria-label="Close chat">${icon('x')}</button>
      </header>
      <div class="chat-log" aria-live="polite"></div>
      <form class="chat-form" autocomplete="off">
        <input type="text" name="website" class="hp-field" tabindex="-1" aria-hidden="true" />
        <label class="sr-only" for="chatInput">Your message</label>
        <input id="chatInput" class="chat-input" type="text" maxlength="600" placeholder="Type your question…" enterkeyhint="send" />
        <button type="submit" class="chat-send" aria-label="Send">${icon('arrow-right')}</button>
      </form>
      <p class="chat-note">Automated assistant — for exact prices and scheduling, call <a href="tel:+17607548200">${BUSINESS_PHONE}</a>.</p>`;

    document.body.append(launcher, panel);
    els = { launcher, panel, log: panel.querySelector('.chat-log'), form: panel.querySelector('.chat-form'),
            input: panel.querySelector('.chat-input'), send: panel.querySelector('.chat-send'), hp: panel.querySelector('.hp-field') };

    launcher.addEventListener('click', () => toggle(true));
    panel.querySelector('.chat-close').addEventListener('click', () => toggle(false));
    panel.addEventListener('keydown', e => { if (e.key === 'Escape') toggle(false); });
    els.form.addEventListener('submit', e => { e.preventDefault(); ask(els.input.value); });
    els.log.addEventListener('click', e => {
      const chip = e.target.closest('[data-suggest]');
      if (chip) ask(chip.dataset.suggest);
      if (e.target.closest('a[href*="#repair"]') && document.getElementById('repair')) toggle(false);
    });
    render();
    if (state.open) toggle(true, false);
  }

  function toggle(open, focus = true) {
    state.open = open; save();
    els.panel.hidden = !open;
    els.launcher.hidden = open;
    els.launcher.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('chat-open', open);
    if (open) { scrollDown(); if (focus && matchMedia('(min-width: 701px)').matches) els.input.focus(); }
    else if (focus) els.launcher.focus();
  }

  function bubble(role, html) { return `<div class="chat-msg ${role}"><div class="chat-bubble">${html}</div></div>`; }

  function text(t) {
    return esc(t).replace(/\(760\) 754-8200/g, '<a href="tel:+17607548200">(760) 754-8200</a>').replace(/\n/g, '<br>');
  }

  function extras(m) {
    let html = '';
    if (m.products?.length) {
      html += `<div class="chat-products">${m.products.map(p => `<a href="${BASE}product.html?id=${encodeURIComponent(p.id)}">
        <span>${esc(p.name)}</span><small>${esc([p.condition, money(p.price)].filter(Boolean).join(' · '))}</small>${icon('arrow-right')}</a>`).join('')}</div>`;
    }
    const act = {
      call: `<a class="chat-action" href="tel:+17607548200">${icon('phone')}Call ${BUSINESS_PHONE}</a>`,
      repair_form: `<a class="chat-action" href="${BASE}index.html#repair">${icon('wrench')}Request a repair</a>`,
      see_in_person: m.products?.length === 1
        ? `<a class="chat-action" href="${BASE}index.html?view=${encodeURIComponent(m.products[0].id)}#products">${icon('eye')}See it in person</a>`
        : `<a class="chat-action" href="tel:+17607548200">${icon('phone')}Call to set up a visit</a>`
    }[m.action];
    return html + (act || '');
  }

  function render() {
    let html = bubble('bot', text(GREETING));
    if (!state.messages.length) {
      html += `<div class="chat-suggest">${SUGGESTIONS.map(s => `<button type="button" data-suggest="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
    }
    state.messages.forEach(m => {
      html += m.role === 'user' ? bubble('me', text(m.text)) : bubble('bot', text(m.text) + extras(m));
    });
    if (errorNote) html += bubble('bot', text(errorNote) + extras({ action: 'call' }));
    if (busy) html += `<div class="chat-msg bot"><div class="chat-bubble chat-typing" aria-label="Typing"><i></i><i></i><i></i></div></div>`;
    els.log.innerHTML = html;
    scrollDown();
  }

  function scrollDown() { requestAnimationFrame(() => { els.log.scrollTop = els.log.scrollHeight; }); }

  async function ask(q) {
    q = String(q || '').trim().slice(0, 600);
    if (!q || busy) return;
    els.input.value = '';
    state.messages.push({ role: 'user', text: q });
    busy = true; els.send.disabled = true;
    save(); render();
    errorNote = '';
    try {
      const res = await fetch(SHEETS_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          type: 'chat', chatId: state.id, website: els.hp.value,
          messages: state.messages.slice(-12).map(m => ({ role: m.role, text: m.text }))
        })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'failed');
      state.messages.push({ role: 'assistant', text: json.reply || '', products: json.products || [], action: json.action || 'none' });
    } catch (err) {
      console.warn('Chat failed', err);
      // Put the question back so the customer can retry; the history must stay question/answer pairs
      state.messages.pop();
      els.input.value = q;
      errorNote = `Sorry — I couldn't connect just now. Try again, or call us at ${BUSINESS_PHONE}.`;
    }
    busy = false; els.send.disabled = false;
    save(); render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
