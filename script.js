/**
 * script.js – Main application controller for GeoTag Pro
 * Wires together upload, map, metadata editor, overlay, and export.
 */

'use strict';

(function App() {
  const G = window.GTP;
  const { Toast, Loader, UndoStack, $, $$, setVal, getVal, showEl, hideEl,
          validateLat, validateLng, validateDate, showFieldError, clearFieldError,
          readFileAsDataURL, downloadBlob, formatFileSize, nowDateString, nowTimeString,
          debounce, AutoSave, copyToClipboard, headingToLabel } = G;
  const Exif = G.Exif;
  const MapM = G.Map;
  const Overlay = G.Overlay;

  /* ── App State ── */
  const appState = {
    file: null,
    fileName: '',
    originalDataUrl: null,
    originalExif: null,   // raw piexif object from uploaded file
    imageEl: null,        // loaded Image() of original
    width: 0,
    height: 0,
    geocode: null,         // last reverse-geocode result
    mapThumbImg: null,     // cached map thumbnail Image for GPS Map Camera template
    mapThumbKey: null,     // "lat,lng" string the cached thumbnail was generated for
  };

  const undoStack = new UndoStack(40);
  let suppressUndo = false;

  /* =========================================================
     INIT
  ========================================================= */
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initUploadZone();
    initTabs();
    initMapControls();
    initMetaFieldListeners();
    initOverlayControls();
    initExportControls();
    initModals();
    initHeaderActions();
    initKeyboardShortcuts();
    Overlay.populateTemplateGrid();
    Overlay.onRender(renderCanvasPreview);
    Overlay.onLayoutRequest(applyMapCameraLayout);
    restoreAutoSave();
  });

  /* =========================================================
     THEME
  ========================================================= */
  function initTheme() {
    const stored = localStorage.getItem('gtp-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = stored || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);

    $('#btn-theme').addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('gtp-theme', next);
      MapM.invalidateSize();
    });
  }

  /* =========================================================
     UPLOAD
  ========================================================= */
  function initUploadZone() {
    const dropZone = $('#drop-zone');
    const fileInput = $('#file-input');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });

    ['dragenter', 'dragover'].forEach(evt =>
      dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); })
    );
    ['dragleave', 'drop'].forEach(evt =>
      dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.remove('drag-over'); })
    );

    dropZone.addEventListener('drop', (e) => {
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleFile(file);
    });

    $('#btn-change-image').addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });
  }

  async function handleFile(file) {
    if (!/jpe?g$/i.test(file.name) && file.type !== 'image/jpeg') {
      Toast.show('Please upload a JPG/JPEG image.', 'error');
      return;
    }

    Loader.show('Reading image…', 20);
    try {
      const dataUrl = await readFileAsDataURL(file);
      const img = await loadImage(dataUrl);

      appState.file = file;
      appState.fileName = file.name.replace(/\.[^.]+$/, '');
      appState.originalDataUrl = dataUrl;
      appState.imageEl = img;
      appState.width = img.naturalWidth;
      appState.height = img.naturalHeight;

      Loader.update('Parsing EXIF metadata…', 60);
      const exifData = Exif.readExif(dataUrl);
      appState.originalExif = exifData.raw;

      populateFormFromExif(exifData);
      showPreview(dataUrl, file);
      revealWorkflowSections();
      initMapIfNeeded(exifData);
      setupOverlayCanvasSize();
      pushUndoSnapshot();

      Loader.update('Done', 100);
      setTimeout(() => Loader.hide(), 250);
      Toast.show('Image loaded successfully.', 'success');
    } catch (err) {
      console.error(err);
      Loader.hide();
      Toast.show('Failed to read image: ' + err.message, 'error');
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Invalid image file'));
      img.src = src;
    });
  }

  function showPreview(dataUrl, file) {
    $('#dz-idle').classList.add('hidden');
    const dzPreview = $('#dz-preview');
    dzPreview.classList.remove('hidden');
    $('#preview-img').src = dataUrl;
    $('#image-info').textContent =
      `${appState.width} × ${appState.height}px  •  ${formatFileSize(file.size)}  •  ${file.name}`;
    showEl('upload-actions');
  }

  function revealWorkflowSections() {
    showEl('section-map');
    showEl('section-meta');
    showEl('section-overlay');
    showEl('section-export');
  }

  /* =========================================================
     EXIF → FORM
  ========================================================= */
  function populateFormFromExif(exifData) {
    const { gps, datetime, camera, author, image } = exifData;

    setVal('meta-lat', gps.lat ?? '');
    setVal('meta-lng', gps.lng ?? '');
    setVal('meta-alt', gps.altitude ?? '');
    setVal('meta-direction', gps.direction ?? '');
    setVal('input-lat', gps.lat ?? '');
    setVal('input-lng', gps.lng ?? '');

    setVal('meta-date', datetime.date || nowDateString());
    setVal('meta-time', datetime.time || nowTimeString());

    setVal('meta-make', camera.make);
    setVal('meta-model', camera.model);
    setVal('meta-lens', camera.lens);
    setVal('meta-software', image.software || 'GeoTag Pro');

    setVal('meta-artist', author.artist);
    setVal('meta-copyright', author.copyright);

    setVal('meta-description', image.description);
    setVal('meta-comment', image.comment);
    setVal('meta-orientation', image.orientation || 1);

    updateExportSummary();
  }

  function initMapIfNeeded(exifData) {
    const hasGps = exifData.gps.lat != null && exifData.gps.lng != null;
    const lat = hasGps ? exifData.gps.lat : 20.5937;
    const lng = hasGps ? exifData.gps.lng : 78.9629;

    MapM.init(lat, lng, hasGps ? 14 : 5);
    MapM.onLocationChange(handleMapLocationChange);

    if (hasGps) {
      MapM.setView(lat, lng, 14);
      reverseGeocodeAndFill(lat, lng);
    }
    MapM.invalidateSize();
  }

  /* =========================================================
     TABS
  ========================================================= */
  function initTabs() {
    $$('.meta-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.meta-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
        $$('.meta-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        $(`#tab-${tab.dataset.tab}`).classList.add('active');
      });
    });
  }

  /* =========================================================
     MAP CONTROLS
  ========================================================= */
  function initMapControls() {
    const searchInput = $('#map-search');
    const suggestionsBox = $('#search-suggestions');

    const doSearch = debounce(async () => {
      const q = searchInput.value.trim();
      if (q.length < 2) { suggestionsBox.classList.add('hidden'); return; }
      try {
        const results = await MapM.searchLocation(q);
        renderSuggestions(results);
      } catch (e) {
        console.warn('Search failed', e);
      }
    }, 450);

    searchInput.addEventListener('input', doSearch);
    searchInput.addEventListener('focus', () => {
      if (suggestionsBox.children.length) suggestionsBox.classList.remove('hidden');
    });
    document.addEventListener('click', (e) => {
      if (!suggestionsBox.contains(e.target) && e.target !== searchInput) {
        suggestionsBox.classList.add('hidden');
      }
    });

    function renderSuggestions(results) {
      suggestionsBox.innerHTML = '';
      if (!results.length) { suggestionsBox.classList.add('hidden'); return; }
      results.forEach(r => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.textContent = r.label;
        item.addEventListener('click', () => {
          searchInput.value = r.label;
          suggestionsBox.classList.add('hidden');
          MapM.setView(r.lat, r.lng, 15);
          handleMapLocationChange(r.lat, r.lng, true);
        });
        suggestionsBox.appendChild(item);
      });
      suggestionsBox.classList.remove('hidden');
    }

    $('#btn-use-location').addEventListener('click', () => {
      if (!navigator.geolocation) { Toast.show('Geolocation not supported by your browser.', 'error'); return; }
      Loader.show('Fetching your location…', 30);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          Loader.hide();
          const { latitude, longitude } = pos.coords;
          MapM.setView(latitude, longitude, 15);
          handleMapLocationChange(latitude, longitude, true);
        },
        () => { Loader.hide(); Toast.show('Unable to retrieve your location.', 'error'); },
        { timeout: 8000 }
      );
    });

    // Manual lat/lng input fields (top map section)
    $('#input-lat').addEventListener('change', syncFromManualCoordInputs);
    $('#input-lng').addEventListener('change', syncFromManualCoordInputs);

    $('#btn-copy-coords').addEventListener('click', async () => {
      const lat = getVal('input-lat'), lng = getVal('input-lng');
      if (!lat || !lng) { Toast.show('No coordinates to copy.', 'warning'); return; }
      const ok = await copyToClipboard(`${lat}, ${lng}`);
      Toast.show(ok ? 'Coordinates copied.' : 'Copy failed.', ok ? 'success' : 'error');
    });

    $('#btn-paste-coords').addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        const parsed = G.parseCoordString(text);
        if (parsed) {
          setVal('input-lat', parsed.lat);
          setVal('input-lng', parsed.lng);
          syncFromManualCoordInputs();
          Toast.show('Coordinates pasted.', 'success');
        } else {
          Toast.show('Clipboard does not contain valid coordinates.', 'warning');
        }
      } catch (e) {
        Toast.show('Unable to read clipboard.', 'error');
      }
    });
  }

  function syncFromManualCoordInputs() {
    const lat = parseFloat(getVal('input-lat'));
    const lng = parseFloat(getVal('input-lng'));
    if (!isNaN(lat) && !isNaN(lng) && validateLat(lat) && validateLng(lng)) {
      MapM.setView(lat, lng, 14);
      handleMapLocationChange(lat, lng, true);
    }
  }

  function handleMapLocationChange(lat, lng, shouldGeocode) {
    setVal('input-lat', lat.toFixed(6));
    setVal('input-lng', lng.toFixed(6));
    setVal('meta-lat', lat.toFixed(6));
    setVal('meta-lng', lng.toFixed(6));
    clearFieldError('meta-lat');
    clearFieldError('meta-lng');
    renderCanvasPreview();
    updateExportSummary();

    if (shouldGeocode) {
      reverseGeocodeAndFill(lat, lng);
    }
  }

  async function reverseGeocodeAndFill(lat, lng) {
    const statusEl = $('#geocode-status');
    statusEl.textContent = 'Looking up address…';
    statusEl.className = 'address-status loading';
    try {
      const result = await MapM.reverseGeocode(lat, lng);
      appState.geocode = result;
      setVal('meta-address', result.address);
      setVal('meta-country', result.country);
      setVal('meta-state', result.state);
      setVal('meta-city', result.city);
      setVal('meta-district', result.district);
      setVal('meta-village', result.village);
      setVal('meta-postal', result.postal);
      statusEl.textContent = 'Address resolved successfully.';
      statusEl.className = 'address-status success';
      renderCanvasPreview();
    } catch (e) {
      statusEl.textContent = 'Could not resolve address. You can enter it manually.';
      statusEl.className = 'address-status error';
    }
  }

  /* =========================================================
     METADATA FIELD LISTENERS
  ========================================================= */
  function initMetaFieldListeners() {
    const syncIds = ['meta-lat', 'meta-lng'];
    syncIds.forEach(id => {
      $(`#${id}`).addEventListener('change', () => {
        const lat = parseFloat(getVal('meta-lat'));
        const lng = parseFloat(getVal('meta-lng'));
        if (!isNaN(lat) && validateLat(lat)) { clearFieldError('meta-lat'); setVal('input-lat', lat); }
        if (!isNaN(lng) && validateLng(lng)) { clearFieldError('meta-lng'); setVal('input-lng', lng); }
        if (!isNaN(lat) && !isNaN(lng) && validateLat(lat) && validateLng(lng)) {
          MapM.setView(lat, lng, 14);
        }
        renderCanvasPreview();
        updateExportSummary();
        debouncedAutoSave();
      });
    });

    $('#meta-lat').addEventListener('input', () => validateFieldLive('meta-lat', validateLat, 'Latitude must be between -90 and 90'));
    $('#meta-lng').addEventListener('input', () => validateFieldLive('meta-lng', validateLng, 'Longitude must be between -180 and 180'));
    $('#meta-alt').addEventListener('input', () => validateFieldLive('meta-alt', v => v === '' || !isNaN(parseFloat(v)), 'Altitude must be numeric'));
    $('#meta-date').addEventListener('change', () => validateFieldLive('meta-date', v => v === '' || validateDate(v), 'Invalid date'));

    $('#btn-now').addEventListener('click', () => {
      setVal('meta-date', nowDateString());
      setVal('meta-time', nowTimeString());
      updateExportSummary();
      debouncedAutoSave();
    });

    $('#btn-copy-address').addEventListener('click', async () => {
      const addr = getVal('meta-address');
      if (!addr) { Toast.show('No address to copy.', 'warning'); return; }
      const ok = await copyToClipboard(addr);
      Toast.show(ok ? 'Address copied.' : 'Copy failed.', ok ? 'success' : 'error');
    });

    // Generic listener: any input/select/textarea in meta sections triggers preview + autosave
    $$('#section-meta input, #section-meta select, #section-meta textarea').forEach(el => {
      el.addEventListener('input', () => { renderCanvasPreview(); updateExportSummary(); debouncedAutoSave(); });
    });

    $('#btn-fullscreen').addEventListener('click', () => {
      $('#fullscreen-img').src = appState.originalDataUrl;
      showEl('fullscreen-modal');
    });

    $('#btn-compare').addEventListener('click', openCompareModal);
  }

  function validateFieldLive(id, validator, message) {
    const val = getVal(id);
    if (val === '' ) { clearFieldError(id); return true; }
    if (!validator(val)) { showFieldError(id, message); return false; }
    clearFieldError(id);
    return true;
  }

  const debouncedAutoSave = debounce(() => { saveFormState(); pushUndoSnapshot(); }, 800);

  /* =========================================================
     OVERLAY CONTROLS
  ========================================================= */
  function initOverlayControls() {
    const enabledToggle = $('#overlay-enabled');
    enabledToggle.addEventListener('change', () => {
      Overlay.state.enabled = enabledToggle.checked;
      toggleEl('overlay-body', enabledToggle.checked);
      toggleEl('overlay-handle', enabledToggle.checked);
      $('#btn-export-overlay').disabled = !enabledToggle.checked;
      renderCanvasPreview();
    });
    toggleEl('overlay-body', false);

    // Content field toggles
    $$('#content-toggles input').forEach(cb => {
      cb.addEventListener('change', () => {
        Overlay.state.fields[cb.dataset.field] = cb.checked;
        $('#custom-text-wrap').style.display = Overlay.state.fields.custom ? 'block' : 'none';
        renderCanvasPreview();
      });
    });

    $('#overlay-custom-text').addEventListener('input', (e) => {
      Overlay.state.customText = e.target.value;
      renderCanvasPreview();
    });

    // Style controls
    const styleMap = {
      'ov-font-family': v => Overlay.state.style.fontFamily = v,
      'ov-font-size': v => Overlay.state.style.fontSize = parseInt(v, 10),
      'ov-font-weight': v => Overlay.state.style.fontWeight = parseInt(v, 10),
      'ov-text-color': v => Overlay.state.style.textColor = v,
      'ov-bg-color': v => Overlay.state.style.bgColor = v,
      'ov-bg-opacity': v => Overlay.state.style.bgOpacity = parseFloat(v),
      'ov-border-color': v => Overlay.state.style.borderColor = v,
      'ov-border-width': v => Overlay.state.style.borderWidth = parseInt(v, 10),
      'ov-border-radius': v => Overlay.state.style.borderRadius = parseInt(v, 10),
      'ov-padding': v => Overlay.state.style.padding = parseInt(v, 10),
      'ov-shadow': v => Overlay.state.style.shadow = v,
      'ov-text-align': v => Overlay.state.style.textAlign = v,
    };
    Object.entries(styleMap).forEach(([id, setter]) => {
      const el = $(`#${id}`);
      el.addEventListener('input', () => { setter(el.value); renderCanvasPreview(); });
    });

    // Lock aspect ratio button
    $('#overlay-lock-btn').addEventListener('click', () => {
      const locked = Overlay.toggleAspectLock();
      $('#overlay-lock-btn').classList.toggle('locked', locked);
      Toast.show(locked ? 'Aspect ratio locked.' : 'Aspect ratio unlocked.', 'info', 1800);
    });

    // Drag/resize handlers wired once canvas exists
    const canvas = $('#preview-canvas');
    const handle = $('#overlay-handle');
    Overlay.setupDragHandlers(canvas, handle, getCanvasScale);
  }

  function toggleEl(id, show) {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? '' : 'none';
  }

  function getCanvasScale() {
    const canvas = $('#preview-canvas');
    if (!canvas || !canvas.clientWidth) return 1;
    return canvas.clientWidth / canvas.width;
  }

  /* =========================================================
     CANVAS PREVIEW RENDERING
  ========================================================= */
  function setupOverlayCanvasSize() {
    const canvas = $('#preview-canvas');
    const maxDisplayWidth = 760;
    const scale = appState.width > maxDisplayWidth ? maxDisplayWidth / appState.width : 1;

    canvas.width = appState.width;
    canvas.height = appState.height;
    canvas.style.width = `${appState.width * scale}px`;
    canvas.style.height = `${appState.height * scale}px`;

    // Reset overlay position to bottom-left with sensible default size
    Overlay.state.x = Math.round(appState.width * 0.04);
    Overlay.state.y = Math.round(appState.height * 0.82);
    Overlay.state.width = Math.round(Math.min(appState.width * 0.5, 420));
    Overlay.state.height = 90;

    // Reset GPS Map Camera bar to span full width at the bottom by default
    Overlay.state.mapCamera.x = 0;
    Overlay.state.mapCamera.y = Math.round(appState.height * 0.78);
    Overlay.state.mapCamera.width = appState.width;
    Overlay.state.mapCamera.height = Math.round(appState.height * 0.22);

    renderCanvasPreview();
    positionHandleOverlay();
  }

  function renderCanvasPreview() {
    if (!appState.imageEl) return;
    const canvas = $('#preview-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(appState.imageEl, 0, 0, canvas.width, canvas.height);

    if (Overlay.state.enabled) {
      if (Overlay.isMapCameraTemplate()) {
        const mcContext = buildMapCameraContext();
        ensureMapThumbnail(mcContext.lat, mcContext.lng).then(() => {
          // Redraw once thumbnail is ready (handles async fetch on first apply)
          const ctx2 = canvas.getContext('2d');
          ctx2.clearRect(0, 0, canvas.width, canvas.height);
          ctx2.drawImage(appState.imageEl, 0, 0, canvas.width, canvas.height);
          Overlay.drawMapCameraOverlay(ctx2, canvas.width, canvas.height, mcContext, appState.mapThumbImg);
        });
        // Draw immediately too (with placeholder if thumbnail not ready yet) to avoid flashing blank
        Overlay.drawMapCameraOverlay(ctx, canvas.width, canvas.height, mcContext, appState.mapThumbImg);
      } else {
        const context = buildOverlayContext();
        const lines = Overlay.buildOverlayLines(context);
        Overlay.drawOverlay(ctx, lines);
      }
    }
    positionHandleOverlay();
  }

  function applyMapCameraLayout() {
    // Give the GPS Map Camera bar a sensible default size/position
    // spanning the bottom of the image, then let the user drag/resize it.
    const mc = Overlay.state.mapCamera;
    mc.x = 0;
    mc.y = Math.round(appState.height * 0.78);
    mc.width = appState.width;
    mc.height = Math.round(appState.height * 0.22);
    renderCanvasPreview();
  }

  function buildMapCameraContext() {
    const lat = parseFloat(getVal('meta-lat'));
    const lng = parseFloat(getVal('meta-lng'));
    const city = getVal('meta-city');
    const state_ = getVal('meta-state');
    const country = getVal('meta-country');
    const address = getVal('meta-address');
    const date = getVal('meta-date');
    const time = getVal('meta-time');

    const titleParts = [city, state_, country].filter(Boolean);
    const titleLine = titleParts.join(', ');

    // Wrap address into up to 2 lines for the bar
    const addressLines = wrapAddress(address, 2);

    const latLngLine = (!isNaN(lat) && !isNaN(lng))
      ? `Lat ${lat.toFixed(6)}°  Long ${lng.toFixed(6)}°`
      : '';

    const timestampLine = (date || time) ? formatTimestampLine(date, time) : '';

    return {
      lat: isNaN(lat) ? null : lat,
      lng: isNaN(lng) ? null : lng,
      titleLine, addressLines, latLngLine, timestampLine,
    };
  }

  function wrapAddress(address, maxLines) {
    if (!address) return [];
    const parts = address.split(',').map(s => s.trim()).filter(Boolean);
    if (!parts.length) return [];
    const lines = [];
    let current = '';
    parts.forEach(part => {
      const candidate = current ? `${current}, ${part}` : part;
      if (candidate.length > 55 && current) {
        lines.push(current);
        current = part;
      } else {
        current = candidate;
      }
    });
    if (current) lines.push(current);
    return lines.slice(0, maxLines);
  }

  function formatTimestampLine(dateStr, timeStr) {
    let dayName = '';
    let dateFormatted = '';
    if (dateStr) {
      const d = new Date(dateStr + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        dateFormatted = `${dd}/${mm}/${yyyy}`;
      }
    }
    let timeFormatted = '';
    if (timeStr) {
      const [h, m] = timeStr.split(':');
      let hour = parseInt(h, 10);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      hour = hour % 12 || 12;
      timeFormatted = `${String(hour).padStart(2, '0')}:${m} ${ampm}`;
    }
    const tzOffsetMin = -new Date().getTimezoneOffset();
    const sign = tzOffsetMin >= 0 ? '+' : '-';
    const tzH = String(Math.floor(Math.abs(tzOffsetMin) / 60)).padStart(2, '0');
    const tzM = String(Math.abs(tzOffsetMin) % 60).padStart(2, '0');
    const tz = `GMT ${sign}${tzH}:${tzM}`;

    return [dayName, dateFormatted].filter(Boolean).join(', ') +
      (timeFormatted ? `  ${timeFormatted}` : '') +
      (dateFormatted ? `  ${tz}` : '');
  }

  async function ensureMapThumbnail(lat, lng) {
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return;
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (appState.mapThumbKey === key && appState.mapThumbImg) return;
    const img = await Overlay.fetchMapThumbnail(lat, lng, 320, 16);
    if (img) {
      appState.mapThumbImg = img;
      appState.mapThumbKey = key;
    }
  }

  function positionHandleOverlay() {
    if (!Overlay.state.enabled) { hideEl('overlay-handle'); return; }
    showEl('overlay-handle');
    const handle = $('#overlay-handle');
    const scale = getCanvasScale();
    const geo = Overlay.isMapCameraTemplate() ? Overlay.state.mapCamera : Overlay.state;
    handle.style.left = `${geo.x * scale}px`;
    handle.style.top = `${geo.y * scale}px`;
    handle.style.width = `${geo.width * scale}px`;
    handle.style.height = `${geo.height * scale}px`;
  }

  function buildOverlayContext() {
    const lat = parseFloat(getVal('meta-lat'));
    const lng = parseFloat(getVal('meta-lng'));
    return {
      lat: isNaN(lat) ? null : lat,
      lng: isNaN(lng) ? null : lng,
      address: getVal('meta-address'),
      city: getVal('meta-city'),
      country: getVal('meta-country'),
      date: getVal('meta-date'),
      time: getVal('meta-time'),
      altitude: getVal('meta-alt') !== '' ? parseFloat(getVal('meta-alt')) : null,
      heading: getVal('meta-direction') !== '' ? parseFloat(getVal('meta-direction')) : null,
      make: getVal('meta-make'),
      model: getVal('meta-model'),
    };
  }

  window.addEventListener('resize', debounce(() => {
    if (appState.imageEl) positionHandleOverlay();
    MapM.invalidateSize();
  }, 200));

  /* =========================================================
     FORM → EXIF DATA OBJECT
  ========================================================= */
  function collectExifFormData() {
    return {
      gps: {
        lat: getVal('meta-lat') !== '' ? parseFloat(getVal('meta-lat')) : null,
        lng: getVal('meta-lng') !== '' ? parseFloat(getVal('meta-lng')) : null,
        altitude: getVal('meta-alt') !== '' ? parseFloat(getVal('meta-alt')) : null,
        direction: getVal('meta-direction') !== '' ? parseFloat(getVal('meta-direction')) : null,
      },
      datetime: {
        date: getVal('meta-date'),
        time: getVal('meta-time'),
      },
      camera: {
        make: getVal('meta-make'),
        model: getVal('meta-model'),
        lens: getVal('meta-lens'),
      },
      author: {
        artist: getVal('meta-artist'),
        copyright: getVal('meta-copyright'),
      },
      image: {
        description: getVal('meta-description'),
        comment: getVal('meta-comment'),
        orientation: getVal('meta-orientation'),
        software: getVal('meta-software'),
      },
    };
  }

  /* =========================================================
     VALIDATION BEFORE EXPORT
  ========================================================= */
  function validateAllFields() {
    let valid = true;
    const lat = getVal('meta-lat'), lng = getVal('meta-lng');
    const alt = getVal('meta-alt'), date = getVal('meta-date');

    if (lat !== '' && !validateLat(lat)) { showFieldError('meta-lat', 'Latitude must be between -90 and 90'); valid = false; }
    else clearFieldError('meta-lat');

    if (lng !== '' && !validateLng(lng)) { showFieldError('meta-lng', 'Longitude must be between -180 and 180'); valid = false; }
    else clearFieldError('meta-lng');

    if (alt !== '' && isNaN(parseFloat(alt))) { showFieldError('meta-alt', 'Altitude must be numeric'); valid = false; }
    else clearFieldError('meta-alt');

    if (date !== '' && !validateDate(date)) { showFieldError('meta-date', 'Invalid date'); valid = false; }
    else clearFieldError('meta-date');

    return valid;
  }

  /* =========================================================
     EXPORT
  ========================================================= */
  function initExportControls() {
    $('#btn-export-exif').addEventListener('click', () => exportImage(false));
    $('#btn-export-overlay').addEventListener('click', () => exportImage(true));
  }

  function updateExportSummary() {
    const data = collectExifFormData();
    const lines = Exif.summarize(data);
    const summaryEl = $('#export-meta-summary');
    if (!lines.length) { summaryEl.innerHTML = '<em>No metadata set yet.</em>'; return; }
    summaryEl.innerHTML = lines.map(([k, v]) =>
      `<div class="meta-row"><span class="meta-key">${k}:</span><span class="meta-val">${escapeHtml(String(v))}</span></div>`
    ).join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function exportImage(withOverlay) {
    if (!appState.file) { Toast.show('Please upload an image first.', 'warning'); return; }
    if (!validateAllFields()) { Toast.show('Please fix validation errors before exporting.', 'error'); return; }

    Loader.show('Preparing export…', 10);
    try {
      let dataUrl;

      if (withOverlay) {
        Loader.update('Rendering overlay onto image…', 40);
        dataUrl = await renderFinalCanvasWithOverlay();
      } else {
        dataUrl = appState.originalDataUrl;
      }

      Loader.update('Writing EXIF metadata…', 70);
      const formData = collectExifFormData();
      const exifObj = Exif.buildExifObject(formData, appState.originalExif);
      const finalDataUrl = Exif.writeExif(dataUrl, exifObj);

      Loader.update('Generating file…', 90);
      const blob = dataURLToBlob(finalDataUrl);
      const filename = `${appState.fileName}_geotagged.jpg`;
      downloadBlob(blob, filename);

      Loader.update('Done!', 100);
      setTimeout(() => Loader.hide(), 300);
      Toast.show(`Exported "${filename}" successfully.`, 'success');
    } catch (err) {
      console.error(err);
      Loader.hide();
      Toast.show('Export failed: ' + err.message, 'error');
    }
  }

  async function renderFinalCanvasWithOverlay() {
    // Render at full original resolution for quality export
    const canvas = document.createElement('canvas');
    canvas.width = appState.width;
    canvas.height = appState.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(appState.imageEl, 0, 0, appState.width, appState.height);

    if (Overlay.isMapCameraTemplate()) {
      const mcContext = buildMapCameraContext();
      await ensureMapThumbnail(mcContext.lat, mcContext.lng);
      Overlay.drawMapCameraOverlay(ctx, canvas.width, canvas.height, mcContext, appState.mapThumbImg);
    } else {
      const context = buildOverlayContext();
      const lines = Overlay.buildOverlayLines(context);
      Overlay.drawOverlay(ctx, lines);
    }

    return canvas.toDataURL('image/jpeg', 0.95);
  }

  function dataURLToBlob(dataUrl) {
    const [header, base64] = dataUrl.split(',');
    const mimeMatch = header.match(/data:(.*?);base64/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const buffer = G.base64ToArrayBuffer(base64);
    return new Blob([buffer], { type: mime });
  }

  /* =========================================================
     MODALS
  ========================================================= */
  function initModals() {
    $('#modal-close').addEventListener('click', () => hideEl('fullscreen-modal'));
    $('#modal-backdrop').addEventListener('click', () => hideEl('fullscreen-modal'));
    $('#compare-close').addEventListener('click', () => hideEl('compare-modal'));
    $('#compare-backdrop').addEventListener('click', () => hideEl('compare-modal'));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hideEl('fullscreen-modal');
        hideEl('compare-modal');
      }
    });
  }

  function openCompareModal() {
    if (!appState.originalExif && !appState.file) {
      Toast.show('Upload an image first.', 'warning');
      return;
    }
    const originalData = Exif.readExif(appState.originalDataUrl);
    const originalLines = Exif.summarize(originalData);
    const updatedLines = Exif.summarize(collectExifFormData());

    $('#compare-original').innerHTML = originalLines.length
      ? originalLines.map(([k, v]) => `<div class="meta-row"><span class="meta-key">${k}:</span><span class="meta-val">${escapeHtml(String(v))}</span></div>`).join('')
      : '<em>No original metadata found.</em>';

    $('#compare-updated').innerHTML = updatedLines.length
      ? updatedLines.map(([k, v]) => `<div class="meta-row"><span class="meta-key">${k}:</span><span class="meta-val">${escapeHtml(String(v))}</span></div>`).join('')
      : '<em>No metadata set.</em>';

    showEl('compare-modal');
  }

  /* =========================================================
     HEADER ACTIONS: Reset / Undo / Redo
  ========================================================= */
  function initHeaderActions() {
    $('#btn-reset-all').addEventListener('click', () => {
      if (!confirm('Reset all fields? This cannot be undone.')) return;
      resetAllFields();
      Toast.show('All fields have been reset.', 'info');
    });

    $('#btn-undo').addEventListener('click', () => {
      const snap = undoStack.undo();
      if (snap) applySnapshot(snap);
    });

    $('#btn-redo').addEventListener('click', () => {
      const snap = undoStack.redo();
      if (snap) applySnapshot(snap);
    });

    undoStack.onChange((canUndo, canRedo) => {
      $('#btn-undo').disabled = !canUndo;
      $('#btn-redo').disabled = !canRedo;
    });
  }

  function resetAllFields() {
    $$('#section-meta input, #section-meta select, #section-meta textarea').forEach(el => el.value = '');
    setVal('meta-date', nowDateString());
    setVal('meta-time', nowTimeString());
    setVal('meta-orientation', 1);
    setVal('meta-software', 'GeoTag Pro');
    AutoSave.clear();
    renderCanvasPreview();
    updateExportSummary();
  }

  function pushUndoSnapshot() {
    if (suppressUndo) return;
    const snapshot = {
      form: collectExifFormData(),
      overlay: JSON.parse(JSON.stringify(Overlay.state)),
    };
    undoStack.push(snapshot);
  }

  function applySnapshot(snapshot) {
    suppressUndo = true;
    const f = snapshot.form;
    setVal('meta-lat', f.gps.lat ?? '');
    setVal('meta-lng', f.gps.lng ?? '');
    setVal('meta-alt', f.gps.altitude ?? '');
    setVal('meta-direction', f.gps.direction ?? '');
    setVal('meta-date', f.datetime.date);
    setVal('meta-time', f.datetime.time);
    setVal('meta-make', f.camera.make);
    setVal('meta-model', f.camera.model);
    setVal('meta-lens', f.camera.lens);
    setVal('meta-artist', f.author.artist);
    setVal('meta-copyright', f.author.copyright);
    setVal('meta-description', f.image.description);
    setVal('meta-comment', f.image.comment);
    setVal('meta-orientation', f.image.orientation);
    setVal('meta-software', f.image.software);

    Object.assign(Overlay.state, snapshot.overlay);
    renderCanvasPreview();
    updateExportSummary();
    suppressUndo = false;
  }

  /* =========================================================
     AUTO-SAVE (sessionStorage)
  ========================================================= */
  function saveFormState() {
    AutoSave.save({
      form: collectExifFormData(),
      geocodeFields: {
        address: getVal('meta-address'), country: getVal('meta-country'),
        state: getVal('meta-state'), city: getVal('meta-city'),
        district: getVal('meta-district'), village: getVal('meta-village'),
        postal: getVal('meta-postal'),
      },
    });
  }

  function restoreAutoSave() {
    const saved = AutoSave.load();
    if (!saved) return;
    // Only restore form-level fields (no image data since File objects aren't serializable)
    // This will apply once an image is uploaded, pre-filling fields the user had set.
    document.addEventListener('gtp:image-loaded', () => {}, { once: true });
  }

  /* =========================================================
     KEYBOARD SHORTCUTS
  ========================================================= */
  function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const ctrlOrCmd = e.ctrlKey || e.metaKey;
      if (ctrlOrCmd && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        const snap = undoStack.undo();
        if (snap) applySnapshot(snap);
      } else if (ctrlOrCmd && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        const snap = undoStack.redo();
        if (snap) applySnapshot(snap);
      }
    });
  }

})();
