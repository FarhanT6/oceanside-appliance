#!/usr/bin/env python3
"""
Builds the extra static pages (product page + service pages) from index.html's
header, icon set and footer, so every page stays consistent.

Run from the project root after editing index.html's header/footer or the
content below:   python3 tools/build_pages.py

When you move to a custom domain, change SITE_URL below and re-run.
"""
import html, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE_URL = 'https://farhant6.github.io/oceanside-appliance/'
VERSION = '7'  # bump to make browsers fetch fresh CSS/JS

index = (ROOT / 'index.html').read_text()
sprite = index[index.index('<!-- ======== ICON SPRITE'):index.index('<!-- ======== NAVBAR')]
footer = index[index.index('<!-- ======== FOOTER'):index.index('</footer>') + len('</footer>')]

AREAS = ['Oceanside', 'Carlsbad', 'Vista', 'San Marcos', 'Escondido', 'Encinitas', 'Fallbrook']
BRANDS = ['Samsung', 'LG', 'Whirlpool', 'GE', 'Maytag', 'Bosch', 'KitchenAid', 'Frigidaire', 'Electrolux']

SERVICES = [
    dict(slug='refrigerator-repair', icon='refrigerator', appliance='refrigerator', name='Refrigerator',
         h1='Refrigerator Repair', lead='Fridge not cooling, leaking or making noise? We repair refrigerators and freezers of every major brand.',
         problems=['Not cooling or running warm', 'Freezer frosting up or not freezing', 'Water leaking inside or under the fridge',
                   'Ice maker or water dispenser not working', 'Loud buzzing, clicking or rattling', 'Won’t turn on or keeps cycling'],
         types='French door, side-by-side, top-freezer, bottom-freezer and built-in refrigerators, plus stand-alone freezers.'),
    dict(slug='washer-repair', icon='washer', appliance='washer', name='Washer',
         h1='Washer Repair', lead='Washer won’t drain, spin or start? We repair front-load and top-load washers of every major brand.',
         problems=['Won’t drain or leaves standing water', 'Won’t spin or agitate', 'Leaking during a cycle', 'Loud banging or shaking',
                   'Door or lid won’t lock or unlock', 'Error codes or won’t start'],
         types='Front-load, top-load, high-efficiency and stacked washer units.'),
    dict(slug='dryer-repair', icon='dryer', appliance='dryer', name='Dryer',
         h1='Dryer Repair', lead='Clothes still damp, dryer not heating or drum not turning? We repair gas and electric dryers of every major brand.',
         problems=['Not heating or taking too long to dry', 'Drum not turning', 'Squealing, thumping or scraping noises', 'Shuts off mid-cycle',
                   'Won’t start', 'Overheating or burning smell (turn it off and call us)'],
         types='Gas and electric dryers, including stacked units.'),
    dict(slug='dishwasher-repair', icon='dishwasher', appliance='dishwasher', name='Dishwasher',
         h1='Dishwasher Repair', lead='Dishes coming out dirty or water left in the bottom? We repair dishwashers of every major brand.',
         problems=['Not cleaning dishes well', 'Water left in the bottom / not draining', 'Leaking onto the floor', 'Not drying',
                   'Won’t start or stops mid-cycle', 'Door won’t latch'],
         types='Built-in and portable dishwashers.'),
    dict(slug='oven-range-repair', icon='oven', appliance='oven', name='Oven & Range',
         h1='Oven & Range Repair', lead='Oven not heating evenly or a burner won’t light? We repair gas and electric ovens, ranges and cooktops.',
         problems=['Oven not heating or heating unevenly', 'Burner won’t light or keeps clicking', 'Temperature is off', 'Door or self-clean lock stuck',
                   'Control panel or display not working', 'Electric element not heating'],
         types='Gas and electric ranges, wall ovens and cooktops.'),
]


def page(*, path, title, description, body, scripts='', canonical=None, extra_head=''):
    depth = path.count('/')
    base = '../' * depth
    canonical = canonical if canonical is not None else SITE_URL + path
    nav = f'''<header class="navbar" id="navbar">
  <a href="{base}index.html" class="nav-logo" aria-label="Oceanside Appliance — home">
    <span class="logo-mark" aria-hidden="true"></span>
    <span class="nav-logo-text">Oceanside <span>Appliance</span></span>
  </a>
  <nav aria-label="Main">
    <ul class="nav-links" id="navLinks">
      <li><a href="{base}index.html#products">Shop</a></li>
      <li><a href="{base}index.html#repair">Repair</a></li>
      <li><a href="{base}index.html#faq">FAQ</a></li>
      <li><a href="{base}index.html#visit">Visit</a></li>
      <li class="nav-phone"><a href="tel:+17607548200"><svg class="ic"><use href="#i-phone"/></svg>(760) 754-8200</a></li>
    </ul>
  </nav>
  <div class="nav-actions">
    <a class="nav-cart" href="{base}index.html#cart" aria-label="Open cart">
      <svg class="ic"><use href="#i-cart"/></svg><span class="nav-cart-label">Cart</span>
      <span class="cart-count" id="cartCountNav">0</span>
    </a>
    <button class="hamburger" id="hamburger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="navLinks">
      <span></span><span></span><span></span>
    </button>
  </div>
</header>'''
    foot = (footer.replace('<a href="#home"', f'<a href="{base}index.html"')
                  .replace('<a href="#', f'<a href="{base}index.html#')
                  .replace('<a href="services/', f'<a href="{base}services/'))
    mobile = f'''<nav class="mobile-bar" aria-label="Quick actions">
  <a href="tel:+17607548200"><svg class="ic"><use href="#i-phone"/></svg>Call</a>
  <a href="{base}index.html#repair"><svg class="ic"><use href="#i-wrench"/></svg>Repair</a>
  <a href="{base}index.html#products"><svg class="ic"><use href="#i-store"/></svg>Shop</a>
  <a href="{base}index.html#cart"><svg class="ic"><use href="#i-cart"/></svg>Cart<span class="cart-count" id="cartCountMobile">0</span></a>
</nav>'''
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>{html.escape(title)}</title>
  <meta name="description" content="{html.escape(description)}" />
  <meta name="theme-color" content="#1a2e44" />
  {f'<link rel="canonical" href="{canonical}" />' if canonical else ''}
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Oceanside Appliance" />
  <meta property="og:title" content="{html.escape(title)}" />
  <meta property="og:description" content="{html.escape(description)}" />
  <meta property="og:image" content="{SITE_URL}img/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="icon" type="image/svg+xml" href="{base}img/favicon.svg" />
  <link rel="apple-touch-icon" href="{base}img/apple-touch-icon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Jost:wght@400;500;600;700&display=swap" />
  <link rel="stylesheet" href="{base}css/styles.css?v={VERSION}" />
  {extra_head}
</head>
<body class="subpage">
<!-- Generated by tools/build_pages.py — edit that file, not this one. -->
{sprite}
{nav}

<main>
{body}
</main>

{foot}

{mobile}

<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script src="{base}js/core.js?v={VERSION}"></script>
<script src="{base}js/site.js?v={VERSION}"></script>
{scripts}
<script src="{base}js/chat.js?v={VERSION}"></script>
</body>
</html>
'''


def bullet_list(items):
    return '\n'.join(f'          <li>{html.escape(i)}</li>' for i in items)


def build_service(svc):
    others = [s for s in SERVICES if s['slug'] != svc['slug']]
    area_text = ', '.join(AREAS[:-1]) + ' and ' + AREAS[-1]
    faq = [
        (f'How soon can you look at my {svc["name"].lower()}?', 'Same-day service is often available, 7 days a week — including evenings, weekends and holidays. Call or send a request and we’ll give you the earliest time.'),
        ('Which brands do you work on?', 'All major brands, including ' + ', '.join(BRANDS[:-1]) + ' and ' + BRANDS[-1] + '.'),
        ('Where do you service?', f'All of San Diego County with a focus on North County — {area_text}.'),
    ]
    faq_ld = {'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
        {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in faq]}
    service_ld = {
        '@context': 'https://schema.org', '@type': 'Service', 'serviceType': svc['h1'],
        'provider': {'@type': 'LocalBusiness', 'name': 'Oceanside Appliance', 'telephone': '+1-760-754-8200',
                     'address': {'@type': 'PostalAddress', 'streetAddress': '1016 S Tremont St', 'addressLocality': 'Oceanside',
                                 'addressRegion': 'CA', 'postalCode': '92054', 'addressCountry': 'US'}},
        'areaServed': [{'@type': 'City', 'name': a} for a in AREAS],
    }
    body = f'''<section class="page-hero">
  <div class="section-inner">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="../index.html">Home</a><span>/</span><a href="../index.html#repair">Repair</a><span>/</span>{html.escape(svc['h1'])}</nav>
    <div class="page-hero-grid">
      <div>
        <div class="section-tag"><svg class="ic"><use href="#i-{svc['icon']}"/></svg> Oceanside &amp; North County</div>
        <h1 class="page-title">{html.escape(svc['h1'])} <span>in Oceanside</span></h1>
        <p class="page-lead">{html.escape(svc['lead'])} Locally owned since 1996, available 7 days a week — including evenings, weekends and holidays.</p>
        <div class="hero-actions">
          <a class="btn-primary" href="../index.html?appliance={svc['appliance']}#repair"><svg class="ic"><use href="#i-wrench"/></svg>Request a repair</a>
          <a class="btn-outline" href="tel:+17607548200"><svg class="ic"><use href="#i-phone"/></svg>(760) 754-8200</a>
        </div>
      </div>
      <div class="page-hero-art" aria-hidden="true"><svg class="ic"><use href="#i-{svc['icon']}"/></svg></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="section-inner content-grid">
    <div>
      <h2 class="content-h">Common problems we fix</h2>
      <ul class="check-list">
{bullet_list(svc['problems'])}
      </ul>
      <p class="content-p">Not on the list? Describe what’s happening and we’ll let you know if we can help.</p>
    </div>
    <div>
      <h2 class="content-h">What we work on</h2>
      <p class="content-p">{html.escape(svc['types'])}</p>
      <div class="brand-chips">{''.join(f'<span>{b}</span>' for b in BRANDS)}</div>
      <h2 class="content-h">Where we go</h2>
      <p class="content-p">All of San Diego County, with a focus on North County:</p>
      <div class="brand-chips">{''.join(f'<span>{a}</span>' for a in AREAS)}</div>
    </div>
  </div>
</section>

<section class="section alt">
  <div class="section-inner faq-layout">
    <h2 class="content-h center">Questions</h2>
    <div class="faq-list">
{chr(10).join(f'      <details class="faq-item"><summary>{html.escape(q)}<svg class="ic"><use href="#i-plus"/></svg></summary><div class="faq-a">{html.escape(a)}</div></details>' for q, a in faq)}
    </div>
  </div>
</section>

<section class="section cta-band">
  <div class="section-inner cta-inner">
    <div>
      <h2 class="content-h">Get your {html.escape(svc['name'].lower())} working again</h2>
      <p class="content-p">Send a request and we’ll call you to schedule — or call now.</p>
    </div>
    <div class="hero-actions">
      <a class="btn-primary" href="../index.html?appliance={svc['appliance']}#repair">Request a repair</a>
      <a class="btn-outline" href="tel:+17607548200">Call (760) 754-8200</a>
    </div>
  </div>
  <div class="section-inner other-services">
    <span>We also repair:</span>
    {' '.join(f'<a href="{o["slug"]}.html"><svg class="ic"><use href="#i-{o["icon"]}"/></svg>{html.escape(o["name"])}s</a>' if not o['name'].endswith('Range') else f'<a href="{o["slug"]}.html"><svg class="ic"><use href="#i-{o["icon"]}"/></svg>Ovens &amp; ranges</a>' for o in others)}
    <a href="used-appliances.html"><svg class="ic"><use href="#i-store"/></svg>Shop used appliances</a>
  </div>
</section>'''
    ld = f'<script type="application/ld+json">{json.dumps(service_ld)}</script>\n  <script type="application/ld+json">{json.dumps(faq_ld, ensure_ascii=False)}</script>'
    out = page(path=f'services/{svc["slug"]}.html',
               title=f'{svc["h1"]} in Oceanside & North County San Diego | Oceanside Appliance',
               description=f'{svc["lead"]} Serving Oceanside, Carlsbad, Vista and all of San Diego since 1996. Call (760) 754-8200.',
               body=body, extra_head=ld)
    (ROOT / 'services' / f'{svc["slug"]}.html').write_text(out)


def build_used():
    body = '''<section class="page-hero">
  <div class="section-inner">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="../index.html">Home</a><span>/</span>Used appliances</nav>
    <div class="page-hero-grid">
      <div>
        <div class="section-tag"><svg class="ic"><use href="#i-store"/></svg> In stock in Oceanside</div>
        <h1 class="page-title">New &amp; Used Appliances <span>in Oceanside</span></h1>
        <p class="page-lead">Quality used and open-box refrigerators, washers, dryers, ranges and dishwashers from a local shop that’s been fixing appliances since 1996. Reserve online, see it in person, and take it home or have it delivered.</p>
        <div class="hero-actions">
          <a class="btn-primary" href="../index.html#products"><svg class="ic"><use href="#i-cart"/></svg>Shop all appliances</a>
          <a class="btn-outline" href="tel:+17607548200"><svg class="ic"><use href="#i-phone"/></svg>(760) 754-8200</a>
        </div>
      </div>
      <div class="page-hero-art" aria-hidden="true"><svg class="ic"><use href="#i-refrigerator"/></svg></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="section-inner">
    <div class="section-header">
      <h2 class="section-title">In stock <span>now</span></h2>
      <p class="section-sub">A few of our latest appliances. Inventory changes quickly — call if you’re looking for something specific.</p>
    </div>
    <div class="products-grid" id="featuredGrid" data-limit="8"></div>
    <div class="center-cta"><a class="btn-outline" href="../index.html#products">See everything in stock<svg class="ic"><use href="#i-arrow-right"/></svg></a></div>
  </div>
</section>

<section class="section alt">
  <div class="section-inner steps">
    <div class="step"><span class="step-n">1</span><h3>Reserve online</h3><p>Add items to your cart and check out — no payment is taken online.</p></div>
    <div class="step"><span class="step-n">2</span><h3>We call you</h3><p>We confirm the details and set up a time that works for you.</p></div>
    <div class="step"><span class="step-n">3</span><h3>Pick up or delivery</h3><p>Pick up at 1016 S Tremont St, or ask about delivery and installation.</p></div>
  </div>
</section>'''
    out = page(path='services/used-appliances.html',
               title='Used Appliances for Sale in Oceanside, CA | Oceanside Appliance',
               description='Quality used and open-box refrigerators, washers, dryers, ranges and dishwashers in Oceanside. Reserve online, see it in person, pickup or delivery. Call (760) 754-8200.',
               body=body, scripts='<script src="../js/product-page.js?v=' + VERSION + '"></script>')
    (ROOT / 'services' / 'used-appliances.html').write_text(out)


def build_product():
    body = '''<section class="section product-page" id="productPage" aria-live="polite">
  <div class="section-inner">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><span>/</span><a href="index.html#products">Shop</a><span>/</span><span id="crumbName">Appliance</span></nav>
    <div class="pp-layout" id="ppContent">
      <div class="pp-gallery skeleton"><div class="product-media"></div></div>
      <div class="pp-info skeleton"><div class="sk" style="width:40%"></div><div class="sk" style="width:80%;height:28px;margin-top:.75rem"></div><div class="sk" style="width:30%;height:32px;margin-top:1rem"></div></div>
    </div>
  </div>
</section>
<section class="section alt" id="relatedSection" hidden>
  <div class="section-inner">
    <h2 class="content-h">More like this</h2>
    <div class="products-grid" id="featuredGrid" data-limit="4"></div>
  </div>
</section>'''
    # Canonical is set per product by script; omit the static one
    out = page(path='product.html', title='Appliance for Sale | Oceanside Appliance',
               description='New and used appliances for sale at Oceanside Appliance, 1016 S Tremont St, Oceanside. Call (760) 754-8200.',
               body=body, canonical='', scripts='<script src="js/product-page.js?v=' + VERSION + '"></script>')
    (ROOT / 'product.html').write_text(out)


def build_sitemap():
    urls = [SITE_URL, SITE_URL + 'services/used-appliances.html'] + [f'{SITE_URL}services/{s["slug"]}.html' for s in SERVICES]
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + \
          ''.join(f'  <url><loc>{u}</loc><changefreq>weekly</changefreq></url>\n' for u in urls) + '</urlset>\n'
    (ROOT / 'sitemap.xml').write_text(xml)


if __name__ == '__main__':
    (ROOT / 'services').mkdir(exist_ok=True)
    for s in SERVICES:
        build_service(s)
    build_used()
    build_product()
    build_sitemap()
    print('Built', len(SERVICES) + 2, 'pages + sitemap.xml')
