# Oceanside Appliance — new site

Plain HTML, CSS and JS. No build step. Everything is in this folder:

- `index.html`: the page
- `styles.css`: the design
- `app.js`: inventory display and the repair request form
- `inventory.json`: what's in stock (edit this to update the site)

## Updating inventory

`inventory.json` is a list of items. It starts empty, and the site shows a "Call for today's appliances" message until you add some. Example:

```json
[
  {
    "name": "Samsung 28 cu ft French Door Refrigerator",
    "category": "Refrigerator",
    "condition": "New",
    "price": 1499,
    "image": "images/samsung-fridge.jpg"
  },
  {
    "name": "Whirlpool Top-Load Washer",
    "category": "Washer",
    "condition": "Used - Excellent",
    "price": 350
  }
]
```

- `condition`: anything starting with "New" shows under **New**. Everything else shows under **Used**, with the condition text as its tag.
- `price`: a number. Leave it out to show "Call for price".
- `image`: optional. It can be a path to a photo in this folder or a full URL.
- `"sold": true`: hides an item without deleting it.

## Repair form

The repair form opens the customer's email app with a pre-filled message to oceansideappliance96@gmail.com, so no server or account is needed. To receive submissions directly instead, point the form at a service like Formspree or Netlify Forms.

## Previewing

`inventory.json` loads with `fetch`, which browsers block for files opened straight from disk. Preview with a local server:

```bash
cd site
python3 -m http.server 8000
# open http://localhost:8000
```
