# Oceanside Appliance — Full-Stack Business Website

A fully functional e-commerce and business management platform built for a real locally-owned appliance store in Oceanside, CA (est. 1996). Built entirely from scratch with no frameworks — vanilla HTML, CSS, and JavaScript.

**Live site:** https://farhant6.github.io/oceanside-appliance

---

## What This Project Does

This is a production website for an active business. It handles the full customer journey and gives the owner a private admin panel to manage everything — no third-party CMS, no WordPress, no boilerplate.

**Customer-facing:**
- Browse live inventory with category chips, search, and filters for brand, price and condition (New / Used)
- Add items to cart and reserve them with a 3-step order request (stock is checked and held on the server)
- Schedule a viewing appointment for used appliances (View In Person form)
- Request a repair (service pages link straight to the form with the appliance pre-selected)
- Shareable page for every product (`product.html?id=…`) with Google-friendly product data
- Service pages for local search: refrigerator, washer, dryer, dishwasher and oven/range repair, plus used appliances
- FAQ section
- Map, directions, click-to-call, and a sticky call / repair / cart bar on phones
- Fully responsive and keyboard-accessible (Escape closes dialogs, focus is trapped in modals)

**Admin panel** (private, password-protected at `/staff-9k2x/`):
- Dashboard with live KPIs — sales revenue, repair revenue, total revenue, open orders
- Inventory management: add/edit products, condition grading, stock levels, storage location, split New vs Used sections
- Sales management: order tracking, status updates, invoice generation, CSV export
- Repair request tracking: ticket status workflow (New → Scheduled → In Progress → Completed)
- Viewing requests log: see who wants to view which appliance
- Financial ledger: separate tabs for sales revenue and manual repair revenue entries, date filtering, printable invoices
- Google Sheets as the database: loads fresh data on open, saves every change, refreshes every minute
- Cancelling an order automatically returns its items to stock
- **Product editor** with photo upload straight from your phone (photos are resized and stored in a Google Drive folder)
- **Marketplace listing** button: ready-to-paste title + description for OfferUp / Facebook Marketplace / Craigslist, with a switch to include or leave out the business name
- **Record sale** for in-store and marketplace sales — takes the item off the website and adds it to Sales and the Ledger
- Order and repair detail views with call / text / email / map buttons, internal notes, scheduling and technician
- Marking a repair Completed offers to log the payment in the Ledger
- Search on Sales, Repairs and Inventory
- **AI helpers** (optional): product details from photos, automatic repair diagnosis with a text-message draft, listing polish — see "AI features" below

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML5, CSS3, JavaScript (ES6+) — no frameworks, no build step |
| Database | Google Sheets, via a Google Apps Script web app (`google-apps-script.js`) |
| Email | Owner alerts: Apps Script `MailApp` · Customer order confirmations: EmailJS |
| Hosting | GitHub Pages |
| Staff auth | Password screen + a secret staff key checked by Apps Script |

---

## How the data flows

```
 Customer browser ──GET ?action=products──▶ Apps Script ──▶ Inventory tab
 Customer browser ──POST order / repair / view request──▶ Apps Script ──▶ Sales / Repair Requests / Viewing Requests tabs
                                                             └─▶ emails the owner
 Staff panel ──POST admin_pull / admin_upsert / admin_delete + staff key──▶ Apps Script
```

- **Google Sheets is the single source of truth.** Every customer sees the same inventory, and every order or request lands in the spreadsheet no matter which device it came from.
- **Orders are validated on the server.** Apps Script re-reads prices and stock, rejects overselling, calculates tax, and reserves the items (decrements stock) in one locked step.
- **The staff panel saves one record at a time** (`admin_upsert` / `admin_delete`). It never clears and rewrites a whole tab, so it can't wipe out requests that customers submitted.
- **Staff-only actions need the staff key.** Anyone can read the public catalog or submit a request; only someone with the key can read customer details or change inventory.
- **Duplicate-safe.** Each submission carries a random `clientRef`; if a request is retried, Apps Script returns the original instead of creating a second order.
- **You can edit the Sheet directly.** Change a price, stock count, description or status in a readable column and the website and staff panel pick it up. (The hidden `_data` column stores the full record — leave it alone.)

---

## Google Sheets setup (one time, ~5 minutes)

1. Open the spreadsheet → **Extensions → Apps Script**.
2. Replace everything in the editor with the contents of `google-apps-script.js` → **Save**.
3. In the function dropdown pick **`setupAdminKey`** (only needed the first time) → **▶ Run** → approve the permissions (it needs Sheets + "send email as you" for owner alerts). Copy the staff key it shows (also in **View → Executions / Logs**).
4. **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy.** The web-app URL stays the same.
5. Open the staff panel → click **Google Sheets** at the bottom of the sidebar → paste the staff key → **Save & Connect**.
   The first time you connect, anything that only existed in that browser (old orders, repairs, ledger entries, product details) is copied up to the Sheet automatically.

Existing tabs in the old format are read automatically and converted to the new format the next time they're written.

To change the key later, run `setupAdminKey()` again and paste the new key into the staff panel.

**After updating the script:** always re-deploy (Deploy → Manage deployments → ✏️ → New version). Photo upload needs Google Drive access, so the first time you update to a version with photo upload, run any function once (e.g. `initialSetup`) and approve the new Drive permission.

---

## AI features (optional, powered by Claude)

The AI runs inside Apps Script, so the API key never appears in the website code.

- **Fill in details from photos** (product editor): reads the photos — including the model sticker — and drafts the name, brand, model, category, description and specs. It never overwrites fields you've already typed.
- **Repair diagnosis**: likely causes, parts to bring, questions to ask, an urgency level (with a safety warning when needed) and a ready-to-send text message. New requests are diagnosed automatically and emailed to you; you can also run it from any repair.
- **Polish with AI** (marketplace listing): rewrites the listing using only the product's facts.
- **Pricing research agent** (product editor → "Research the price online"): searches the web for this model's new retail price and used/sold prices, then suggests an asking price with a range, confidence level and the links it used. One click fills in the price or MSRP. About 10–30¢ per lookup.
- **Bulk add from photos** (Inventory → "Bulk add from photos"): pick a whole batch of photos at once. They're sorted by when they were taken, Claude groups consecutive photos by appliance and spots the ones showing a model sticker or box label, then reads each appliance's details from those full-size label photos. Review the groups (move a photo, split, merge, remove), add prices or run the pricing agent, and save — items without a price are saved as **drafts** (hidden from the website until published). About 3–5¢ per 24 photos to group plus 5–10¢ per appliance to read details.
- **Website images from the web** (product editor → "Find product images online", plus automatic): your own photos are kept as staff-only *inventory photos*; customers see clean product images of the same model. Claude searches for the model's product pages (manufacturer site first, then major retailers), the images on those pages are compared with your photo of the unit (same model? same color? clean product shot?), and the chosen ones are copied into your Drive folder. Products without website images get them automatically every 15 minutes (tagged "Check images" until you review). The website marks these with a "Stock photo" label, and for used items notes that the actual unit may differ. About 10–25¢ per product. *Product images are the manufacturer's or retailer's copyright — manufacturer images are generally the safer choice for dealers; retailer photos carry more risk.*
- **Morning briefing** (emailed daily at 7am Pacific): yesterday's and month-to-date revenue, safety alerts, today's scheduled repairs, orders and repairs waiting on you, what came in overnight, items listed 30+ days with a suggested price drop, and AI-picked top priorities. "Send today's briefing" in the staff panel sends one on demand.

**Setup (about 5 minutes):**
1. Create an API key at console.anthropic.com (add a payment method; typical cost is a few cents per photo fill-in or diagnosis).
2. Apps Script → ⚙️ **Project Settings** → **Script properties** → **Add script property**: name `ANTHROPIC_API_KEY`, value = your key → Save.
3. Paste in the latest `google-apps-script.js`, save, then run **`setupAutomations`** once (▶ Run → allow the new permissions). This turns on automatic diagnosis every 10 minutes and the 7am briefing. Re-run it any time — it replaces the old schedule rather than duplicating it.
4. **Deploy → Manage deployments → ✏️ → New version → Deploy.**

To turn either automation off, open ⏰ **Triggers** in Apps Script and delete the `autoTriageRepairs` or `sendDailyBriefing` trigger. The briefing works without an API key too — it just skips the AI "top priorities".

---

## Extra pages

`product.html` and everything in `services/` are generated from `index.html`'s header and footer by `tools/build_pages.py`. After changing the header/footer or the service text, run:

```bash
python3 tools/build_pages.py
```

**Moving to a custom domain:** set up the domain in GitHub → Settings → Pages, then change `SITE_URL` at the top of `tools/build_pages.py`, update the `canonical`, `og:url`, `og:image` and JSON-LD `url` lines at the top of `index.html`, and `robots.txt`, then re-run the script.

---

## Project Structure

```
oceanside-appliance/
├── index.html              — Public website
├── product.html            — Shareable product page (generated)
├── services/               — Repair + used-appliance pages (generated)
├── tools/build_pages.py    — Builds product.html, services/, sitemap.xml
├── 404.html                — Not-found page
├── css/styles.css          — Design system (shared with the staff panel)
├── img/                    — Logo, favicon, social-share image
├── js/
│   ├── core.js             — Config, Sheets API, validation, modals, toast
│   ├── products.js         — Catalog, search, filters, product + viewing modals
│   ├── cart.js             — Cart
│   ├── checkout.js         — 3-step order request, EmailJS confirmation
│   ├── main.js             — Nav, scroll effects, repair form
│   ├── site.js             — Nav + cart count on product/service pages
│   ├── product-page.js     — Product page and "in stock" grids
│   └── logo.js             — Logo for the staff panel
├── staff-9k2x/             — Staff panel (not linked publicly, noindex)
│   ├── admin.js            — Data sync, dashboard, tables, ledger, invoices
│   └── admin-tools.js      — Product editor, photos, listings, record sale, detail views
├── google-apps-script.js   — Paste into Apps Script (see setup above)
├── robots.txt / sitemap.xml
└── netlify.toml / .htaccess — Security headers (only used if hosted on Netlify / Apache)
```

---

## Features By the Numbers

- Vanilla JavaScript, no dependencies besides EmailJS
- 5 data types: inventory, sales, repair / sell requests, viewing requests, repair revenue
- 6 Google Sheets tabs: Inventory, Sales, Repair Requests, Viewing Requests, Repair Revenue, Activity Log
- 6 admin tabs: Dashboard, Sales, Repairs, Inventory, Ledger, (viewing requests on dashboard)
- Invoice generator for both sales and repair revenue with browser print-to-PDF

---

## Running Locally

No build step. Serve the folder with any static server (opening the file directly works too, but a server matches GitHub Pages):

```bash
git clone https://github.com/FarhanT6/oceanside-appliance.git
cd oceanside-appliance
python3 -m http.server 8000   # then open http://localhost:8000
```

The staff panel is at `/staff-9k2x/`. The Sheets URL lives in `js/core.js` (`SHEETS_WEBHOOK_URL`) and in the staff panel's settings.

---

## About

Built for Oceanside Appliance, a real business at 1016 S Tremont St, Oceanside CA — serving San Diego since 1996. This is a live production project, not a demo.
