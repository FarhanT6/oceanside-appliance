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
- Request a repair, or ask for an offer on an appliance you want to sell
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
3. In the function dropdown pick **`setupAdminKey`** → **▶ Run** → approve the permissions (it needs Sheets + "send email as you" for owner alerts). Copy the staff key it shows (also in **View → Executions / Logs**).
4. **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy.** The web-app URL stays the same.
5. Open the staff panel → click **Google Sheets** at the bottom of the sidebar → paste the staff key → **Save & Connect**.
   The first time you connect, anything that only existed in that browser (old orders, repairs, ledger entries, product details) is copied up to the Sheet automatically.

Existing tabs in the old format are read automatically and converted to the new format the next time they're written.

To change the key later, run `setupAdminKey()` again and paste the new key into the staff panel.

---

## Project Structure

```
oceanside-appliance/
├── index.html              — Public website
├── 404.html                — Not-found page
├── css/styles.css          — Design system (shared with the staff panel)
├── img/                    — Logo, favicon, social-share image
├── js/
│   ├── core.js             — Config, Sheets API, validation, modals, toast
│   ├── products.js         — Catalog, search, filters, product + viewing modals
│   ├── cart.js             — Cart
│   ├── checkout.js         — 3-step order request, EmailJS confirmation
│   ├── main.js             — Nav, scroll effects, repair / sell form
│   └── logo.js             — Logo for the staff panel
├── staff-9k2x/             — Staff panel (not linked publicly, noindex)
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
