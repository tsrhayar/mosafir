# Mosafir: bus departures landing page

A static site in plain HTML, CSS and vanilla JS. There is no build step and no framework.
All timetable data is in **`data/departures.json`**.

## Run it
- **Laragon / Apache:** put the folder in `C:\laragon\www\mosafir` and open http://localhost/mosafir/
- **Any other machine:** `python -m http.server 8000` in this folder, then open http://localhost:8000/
  (Opening `index.html` directly with `file://` will not work: browsers block `fetch()` there.)

## Files
```
index.html               page markup
assets/css/style.css     styles (mobile-first; RTL handled with html[dir=rtl])
assets/js/i18n.js        UI texts in ar / fr / en
assets/js/app.js         loads the JSON and handles search, filters, sort and next departures
data/departures.json     the data (one entry per departure city)
```

## Add a new departure city
Add a key under `cities` in `data/departures.json`. It shows up automatically in the "Ville de départ" selector.

```json
{
  "cities": {
    "marrakech": { "...": "..." },
    "casablanca": {
      "name":    { "ar": "الدار البيضاء", "fr": "Casablanca", "en": "Casablanca" },
      "station": { "ar": "محطة أولاد زيان", "fr": "Gare routière Ouled Ziane", "en": "Ouled Ziane Coach Station" },
      "source":  { "ar": "…", "fr": "…", "en": "…" },
      "timezone": "Africa/Casablanca",
      "departures": [
        {
          "time": "08:30",
          "carrier": "CTM",
          "destination": { "ar": "أكادير", "fr": "Agadir", "en": "Agadir" },
          "stops": [
            { "ar": "سطات", "fr": "Settat", "en": "Settat" },
            { "ar": "مراكش", "fr": "Marrakech", "en": "Marrakesh" }
          ],
          "platform": "12"
        }
      ]
    }
  }
}
```

### Optional: `carriers` (per city)
This feeds the carrier autocomplete with Arabic names and spelling variants. Carriers that aren't listed still work.
```json
"carriers": {
  "JANNA VIAJES": { "ar": "جنة فياخس", "aliases": ["JANA VIAJES", "جنة فياخيس"] }
}
```

### Departure fields
| field | required | meaning |
|---|---|---|
| `time` | yes | `"HH:MM"` in 24 h format |
| `carrier` | yes | carrier name (Latin script); it is used by the carrier filter |
| `carrier_ar` | no | carrier name in Arabic |
| `destination` | yes | `{ar, fr, en}` |
| `stops` | no | stops on the route, in order, each one `{ar, fr, en}` |
| `platform` | no | platform/quai number, `"NC"`, or `null` when not shown |
| `uncertain` | no | `true` when the source was hard to read; shown with a "to verify" badge |
| `note` | no | `{ar, fr, en}` remark shown under the row |
| `seen` | no | dates (YYYY-MM-DD) the row was observed on the board |

Both search boxes are accessible autocompletes. They support ↑/↓, Enter and Esc, mouse and touch, RTL, and a clear button.
- **Destination / stop:** suggestions come from the destinations and stops of the selected city.
- **Carrier:** it suggests carriers by departure count and also matches `carrier_ar` and the `aliases`. Picking a carrier filters on exactly that carrier. Free text filters every carrier whose name contains it. Leave it empty for all carriers.

Search matches the destination **and** every stop in all three languages. It ignores accents and Arabic hamza/alif variants.
Departures leaving within the next 60 minutes, by the city's `timezone`, are highlighted.

Check that the JSON is valid before uploading, e.g. with `python -m json.tool data/departures.json`.

## Marrakech data
The rows were transcribed from 104 photos of the departures board at the Gare Routière de Voyageurs in Marrakech, taken on 20/11/2026 at about 16:40.
They cover 24 h from 16:30. Identical rows were merged. Rows that were hard to read have `"uncertain": true`.
One board page between 15:30 and 16:00 was not photographed, and this is noted in `coverage_gaps`.

## PWA (installable and works offline)
- `manifest.webmanifest`: app name, colors and icons. `start_url` and `scope` are `./`, so the same files work on GitHub Pages (`/mosafir/`) and at `http://localhost/mosafir/`.
- `sw.js`: the service worker. It precaches the app shell and loads `data/departures.json` network-first, falling back to the cached copy when offline. Pages are network-first with a fallback to the cached `index.html`. Google Fonts are cached at runtime.
- **When you change** `index.html`, CSS, JS or icons, **bump `VERSION` in `sw.js`** (e.g. `"v2"`). Visitors then get the new files, and the old caches are deleted on activate. Updates to `departures.json` are picked up automatically when online.
- Icons are in `assets/icons/` (192, 512, maskable 512, apple-touch 180, favicon 32).
- An "Installer l'app" button appears when the browser offers installation, and an "Hors ligne" badge appears when you're offline.
- `.htaccess` (Apache/Laragon only) serves the manifest with the right MIME type and stops `sw.js` from being cached. GitHub Pages ignores it.
- A service worker needs HTTPS or `localhost`. It does not run from `file://`.
