// ============================================
//   OCEANSIDE APPLIANCE — PAGE BEHAVIOR
//   Navigation, scroll effects, repair / sell form, small touches
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // ── Dynamic years (never goes stale) ──
  const now = new Date().getFullYear();
  document.querySelectorAll('[data-years]').forEach(el => { el.textContent = now - 1996; });
  document.querySelectorAll('[data-year]').forEach(el => { el.textContent = now; });

  // ── Navbar shadow on scroll ──
  const nav = document.getElementById('navbar');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 20);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ── Mobile menu ──
  const burger = document.getElementById('hamburger');
  const links = document.getElementById('navLinks');
  const setMenu = open => {
    links.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open);
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  burger?.addEventListener('click', () => setMenu(!links.classList.contains('open')));
  links?.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('click', e => { if (!e.target.closest('#navbar')) setMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

  // ── Scroll reveal ──
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('visible'); io.unobserve(en.target); }
    }), { rootMargin: '0px 0px -60px 0px', threshold: 0.05 });
    reveals.forEach(el => io.observe(el));
  } else {
    reveals.forEach(el => el.classList.add('visible'));
  }

  // ── Phone number formatting on every phone field ──
  document.querySelectorAll('input[data-phone]').forEach(formatPhoneInput);

  // ── Links from the service pages: index.html?appliance=washer#repair ──
  const params = new URLSearchParams(location.search);
  const presetAppliance = params.get('appliance');
  if (presetAppliance && document.querySelector(`#rf-type option[value="${CSS.escape(presetAppliance)}"]`)) {
    document.getElementById('rf-type').value = presetAppliance;
  }

  // ── Repair / sell request form ──
  const form = document.getElementById('repairForm');
  let repairRef = newClientRef();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const ok = validateFields([
      { el: form.firstName,     test: required, msg: 'Please enter your first name.' },
      { el: form.lastName,      test: required, msg: 'Please enter your last name.' },
      { el: form.phone,         test: isValidPhone, msg: 'Please enter a 10-digit phone number.' },
      { el: form.email,         test: v => !v || isValidEmail(v), msg: 'That email doesn’t look right.' },
      { el: form.address,       test: required, msg: 'Please enter your address.' },
      { el: form.applianceType, test: required, msg: 'Please choose the appliance.' },
      { el: form.description,   test: v => v.length >= 5, msg: 'Please add a short description.' },
    ]);
    if (!ok) return;

    const btn = document.getElementById('repairSubmitBtn');
    const errEl = document.getElementById('repairError');
    showFormError(errEl, '');
    setBusy(btn, true, 'Sending…');

    const data = Object.fromEntries(new FormData(form).entries());
    const res = await apiPost('repair_request', { ...data, clientRef: repairRef });
    setBusy(btn, false);

    if (!res.success) return showFormError(errEl, res.error || `Something went wrong. Please try again or call ${BUSINESS_PHONE}.`);

    document.getElementById('repairSuccessMsg').textContent =
      `Thanks, ${data.firstName}! We'll call ${data.phone} shortly to schedule your repair.` +
      (res.ticketId ? ` Your reference number is ${res.ticketId}.` : '');
    document.getElementById('repairFormContent').hidden = true;
    const success = document.getElementById('repairSuccess');
    success.classList.add('show');
    success.focus();
  });

  document.getElementById('repairAgainBtn')?.addEventListener('click', () => {
    form.reset();
    repairRef = newClientRef();
    document.getElementById('repairFormContent').hidden = false;
    document.getElementById('repairSuccess').classList.remove('show');
    form.firstName.focus();
  });
});
