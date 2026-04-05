# Oceanside Appliance — Full-Stack Business Website

A fully functional e-commerce and business management platform built for a real locally-owned appliance store in Oceanside, CA (est. 1996). Built entirely from scratch with no frameworks — vanilla HTML, CSS, and JavaScript.

**Live site:** https://farhant6.github.io/oceanside-appliance

---

## What This Project Does

This is a production website for an active business. It handles the full customer journey and gives the owner a private admin panel to manage everything — no third-party CMS, no WordPress, no boilerplate.

**Customer-facing:**
- Browse and filter inventory by appliance type, brand, price, and condition (New / Used)
- Add items to cart, review order, and submit purchase requests with a 3-step checkout flow
- Schedule a viewing appointment for used appliances (View In Person form)
- Submit appliance repair requests with a structured intake form
- Fully responsive across mobile, tablet, and desktop

**Admin panel** (private, password-protected at `/staff-9k2x/`):
- Dashboard with live KPIs — sales revenue, repair revenue, total revenue, open orders
- Inventory management: add/edit products, condition grading, stock levels, storage location, split New vs Used sections
- Sales management: order tracking, status updates, invoice generation, CSV export
- Repair request tracking: ticket status workflow (New → Scheduled → In Progress → Completed)
- Viewing requests log: see who wants to view which appliance
- Financial ledger: separate tabs for sales revenue and manual repair revenue entries, date filtering, printable invoices
- Real-time Google Sheets sync: every state change auto-syncs to a live spreadsheet

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML5, CSS3, JavaScript (ES6+) |
| Email notifications | EmailJS (order confirmations + owner alerts) |
| Database / sync | Google Sheets via Google Apps Script (REST webhook) |
| Hosting | GitHub Pages |
| Auth | SHA-256 hashed password via Web Crypto API |
| Storage | localStorage (client-side persistence) |

**No frameworks. No npm. No build step.** Everything ships as static files.

---

## Architecture Highlights

**Google Sheets as a live database** — The admin panel syncs inventory, sales, and repair requests to Google Sheets in real time using a custom Apps Script webhook. Requests are sent as `text/plain` with `no-cors` to work around CORS preflight restrictions on Google's endpoints. Each sync does a full `sheet.clear()` before rewriting to prevent duplicate rows from accumulating.

**Fire-and-forget sync pattern** — Sheets sync calls are intentionally non-blocking (`logToSheets(...)` without `await`). This keeps checkout confirmation and repair form submission instant for the user while data still syncs in the background.

**Condition-aware UI** — Products have a condition field (New / Open Box / Used grades). The "View In Person" appointment button only renders for non-new items — new sealed appliances don't need a viewing. This logic runs at render time in `products.js`.

**SHA-256 admin auth** — The admin password is never stored in plain text. On login, the input is hashed client-side using the Web Crypto API and compared against a stored hash. Safe to keep in a public repo.

**Auto-sync on every mutation** — Rather than requiring manual sync clicks, every inventory edit, status change, or deletion fires a background Sheets sync automatically via `autoSyncInventory()`, `autoSyncSales()`, and `autoSyncRepairs()`.

---

## Project Structure

```
oceanside-appliance/
├── index.html              — Main public website
├── css/styles.css          — Design system (ocean blue theme, Cormorant + Jost fonts)
├── js/
│   ├── products.js         — Product catalog, filters, condition logic, View In Person
│   ├── cart.js             — Cart state management
│   ├── checkout.js         — 3-step checkout modal, EmailJS integration
│   ├── main.js             — Scroll effects, repair form, Sheets webhook
│   └── logo.js             — SVG badge logo
├── staff-9k2x/             — Admin panel (obscure path, not linked publicly)
│   ├── index.html          — Login + admin app shell
│   ├── admin.js            — All admin logic (~850 lines)
│   └── admin.css           — Admin-specific styles
├── google-apps-script.js   — Paste into Google Apps Script for Sheets integration
├── robots.txt              — Blocks admin path from crawlers
└── netlify.toml / .htaccess — Security headers, redirect rules
```

---

## Features By the Numbers

- ~2,500 lines of vanilla JavaScript across 5 files
- 7 data types managed: inventory, sales, repairs, viewing requests, repair revenue, ledger entries, activity log
- 5 Google Sheets tabs auto-populated: Inventory, Sales, Repair Requests, Viewing Requests, Activity Log
- 6 admin tabs: Dashboard, Sales, Repairs, Inventory, Ledger, (viewing requests on dashboard)
- Invoice generator for both sales and repair revenue with browser print-to-PDF
- Cross-tab localStorage sync (admin inventory changes reflect on the shop instantly)

---

## Running Locally

No build step needed — just open the files.

```bash
git clone https://github.com/FarhanT6/oceanside-appliance.git
cd oceanside-appliance
open index.html   # or use Live Server in VS Code
```

The admin panel is at `/staff-9k2x/`. Google Sheets sync requires a deployed Apps Script endpoint (see `google-apps-script.js`).

---

## About

Built for Oceanside Appliance, a real business at 1016 S Tremont St, Oceanside CA — serving San Diego since 1996. This is a live production project, not a demo.
