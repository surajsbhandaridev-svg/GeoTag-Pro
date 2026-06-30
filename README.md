# GeoTag Pro

**GeoTag Pro** is a production-ready, 100% client-side web application for editing JPEG EXIF metadata — especially GPS geotags — and adding a fully customizable visible geotag overlay to your photos. Everything runs in your browser. No backend, no database, no paid APIs, and no image ever leaves your device.

---

## ✨ Features

### Upload
- Drag & drop or click-to-upload JPEG images
- Live preview with dimensions and file size
- Automatic parsing of existing EXIF/GPS metadata on upload

### Interactive Map
- Powered by Leaflet.js + OpenStreetMap tiles
- Search any location by name (Nominatim geocoding)
- Click anywhere on the map or drag the marker to set coordinates
- "Use My Location" button (browser geolocation)
- Live latitude/longitude fields synced with the map

### Reverse Geocoding
- Automatically fills in Country, State, City, District, Village, and Postal Code via the free Nominatim API
- All fields remain fully editable

### Metadata Editor
Tabbed editor covering:
- **GPS** – latitude, longitude, altitude, compass direction
- **Address** – full address and components
- **Date & Time** – date/time taken, with a "use now" shortcut
- **Camera** – make, model, lens
- **Author** – artist/photographer, copyright
- **Image** – description, user comment, orientation, software

All fields are validated (latitude -90 to 90, longitude -180 to 180, numeric altitude, valid dates) with clear inline error messages.

### EXIF Writer
Uses [piexif.js](https://github.com/hMatoba/piexifjs) to write standard EXIF tags (GPSLatitude/Longitude/Altitude/ImgDirection, DateTimeOriginal/Digitized, Make, Model, LensModel, Artist, Copyright, Software, ImageDescription, UserComment) while preserving any existing EXIF data that isn't explicitly overwritten.

### Visible GeoTag Overlay
A fully interactive Canvas-based overlay editor:
- Drag to move, resize from any corner, lock/unlock aspect ratio
- Toggle individual content fields (coordinates, address, city, country, date, time, altitude, compass heading, camera make/model, custom text)
- Style controls: font family/size/weight, text color, background color & opacity, border color/width, corner radius, padding, shadow intensity, text alignment
- 10 ready-made templates (Google Maps card, Glassmorphism, Dark, White Minimal, GPS Panel, Watermark, Badge, Pin Label, Compact Tag, Modern Card) — fully customizable after applying
- Keyboard-accessible (arrow keys to nudge position)
- Renders at full original image resolution on export — no quality loss

### Export
Two one-click export options:
1. **EXIF Metadata Only** — keeps the original image pixels untouched, only metadata changes
2. **EXIF Metadata + Visible Overlay** — permanently renders the overlay onto the image plus updates EXIF

Downloaded as `originalname_geotagged.jpg`.

### Extras
- Light / dark mode (auto-detects system preference, remembered across sessions)
- Undo/redo (toolbar buttons + Ctrl+Z / Ctrl+Y)
- Auto-save of form state to `sessionStorage`
- Copy/paste coordinates and address to/from clipboard
- Fullscreen image preview
- Side-by-side original vs. updated metadata comparison
- Toast notifications and a loading overlay with progress bar
- Fully responsive: mobile, tablet, and desktop layouts
- Keyboard accessible controls throughout

---

## 🧰 Technology Stack

| Purpose | Library |
|---|---|
| Markup / styling | HTML5, CSS3 (custom properties, no frameworks) |
| Logic | Vanilla JavaScript (ES6+, no build step) |
| Maps | [Leaflet.js](https://leafletjs.com/) + [OpenStreetMap](https://www.openstreetmap.org/) tiles |
| Geocoding | [Nominatim API](https://nominatim.org/) (OpenStreetMap's free geocoder) |
| EXIF read/write | [piexif.js](https://github.com/hMatoba/piexifjs) |

No React/Vue/Angular, no Node backend, no database, no authentication, no paid APIs, no tracking or analytics.

---

## 📁 Folder Structure

```
GeoTag-Pro/
│── index.html        # App shell & all markup
│── style.css          # All styling (design tokens, components, responsive rules)
│── script.js           # Main controller — wires upload, map, metadata, overlay, export
│── map.js               # Leaflet map, search, reverse/forward geocoding
│── exif.js               # EXIF read/write helpers built on piexif.js
│── overlay.js             # Overlay state, templates, canvas drawing, drag/resize
│── utils.js                # Shared helpers: toasts, loader, undo stack, validation, etc.
│── README.md
│
├── assets/
│     ├── icons/        # (reserved for custom icon assets)
│     ├── fonts/         # (reserved for self-hosted font files)
│     └── images/         # (reserved for static images)
```

---

## 🚀 Local Usage

No build tools or installation required.

1. Download or clone this folder.
2. Open `index.html` directly in any modern browser, **or** serve it with any static file server for best results with the Geolocation API (some browsers require a secure context):

   ```bash
   # Python 3
   python3 -m http.server 8080

   # Node (npx)
   npx serve .
   ```
3. Visit `http://localhost:8080` and start uploading images.

---

## 🌐 Deployment

### GitHub Pages
1. Push this folder to a GitHub repository.
2. Go to **Settings → Pages**.
3. Under "Build and deployment", select **Deploy from a branch**, choose your branch and the root (`/`) folder.
4. Save — your site will be live at `https://<username>.github.io/<repo>/` within a minute or two.

### Netlify
1. Drag and drop the `GeoTag-Pro` folder onto [app.netlify.com/drop](https://app.netlify.com/drop), **or**
2. Connect your GitHub repo in the Netlify dashboard and set:
   - Build command: *(none)*
   - Publish directory: `/` (project root)
3. Deploy — Netlify will give you a live URL immediately.

### Vercel
1. Import the repository at [vercel.com/new](https://vercel.com/new).
2. Framework preset: **Other** (static site).
3. Leave build command empty and output directory as `./`.
4. Deploy.

Because the app has zero backend dependencies, any static host works identically.

---

## 🛰️ How EXIF / GPS Metadata Works

EXIF (Exchangeable Image File Format) is metadata embedded directly inside a JPEG file, stored in special markers within the file's binary structure — it does not affect the visible pixels. GPS coordinates in EXIF are stored as *Degrees/Minutes/Seconds (DMS)* rational fractions plus a reference (N/S for latitude, E/W for longitude), rather than plain decimal numbers. GeoTag Pro:

1. **Reads** existing EXIF using `piexif.load()`, converting DMS back to decimal degrees for display.
2. **Writes** new values by converting your decimal coordinates back into the DMS rational format EXIF requires, then uses `piexif.insert()` to embed the updated EXIF block into the JPEG — preserving any other existing tags that weren't changed.
3. Altitude, direction, timestamps, camera info, and author/copyright fields follow the same read → edit → write cycle using their respective standard EXIF tags.

Because none of this requires decoding/recompressing the image pixels (for the "EXIF only" export), that option preserves 100% of the original image quality.

---

## 🔒 Privacy

GeoTag Pro is privacy-first by design:

- Images are **never uploaded** to any server — all reading, editing, and writing happens in your browser's memory using the File API and Canvas API.
- The only network requests made are to the public **Nominatim** geocoding API (only the coordinates/search text you provide are sent, exactly as you'd use any map search) and to load map tiles from **OpenStreetMap**.
- No cookies, no analytics, no tracking scripts, no user accounts, no external image storage of any kind.
- Form state is cached only in your browser's `sessionStorage` (cleared when you close the tab) to support auto-save; it is never transmitted anywhere.

---

## ⚠️ Known Limitations

- Only JPEG (`.jpg`/`.jpeg`) files are supported, since EXIF embedding via piexif.js requires the JPEG container format (PNG/WebP do not support EXIF the same way).
- The Nominatim API is rate-limited and intended for light usage; very rapid searches may be throttled by the public instance.
- Very large images (>20–30 MP) may be slower to process in-browser since all rendering happens on the main thread via Canvas.
- Geolocation ("My Location") requires the page to be served over HTTPS or `localhost` in most browsers.
- EXIF orientation is written as metadata only; GeoTag Pro does not currently auto-rotate the preview canvas to match.

---

## 🔮 Future Improvements

- Web Worker-based EXIF processing for very large images
- Batch processing of multiple images at once
- PNG/HEIC support via conversion pipeline
- IPTC/XMP metadata support alongside EXIF
- Custom user-saved overlay template presets (stored locally)
- Service worker for full offline-first PWA support
- Drag-to-reorder overlay text lines and multi-overlay support

---

## 📜 License & Attribution

- Map tiles © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, rendered via [Leaflet.js](https://leafletjs.com/).
- Geocoding powered by [Nominatim](https://nominatim.org/).
- EXIF read/write via [piexif.js](https://github.com/hMatoba/piexifjs) (MIT License).

Build, modify, and deploy freely for personal or commercial use.
