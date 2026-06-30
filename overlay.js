/**
 * overlay.js – Visible geotag overlay: templates, canvas rendering,
 * drag/resize/rotate interactions.
 */

'use strict';

const OverlayModule = (() => {
  const { $, $$ } = window.GTP;

  /* ── Overlay state ── */
  const state = {
    enabled: false,
    x: 20, y: 20,           // top-left position in canvas px (image-space)
    width: 260, height: 90, // box size in canvas px (image-space)
    rotation: 0,
    opacity: 1,
    aspectLocked: false,
    style: {
      fontFamily: "Inter, sans-serif",
      fontSize: 14,
      fontWeight: 400,
      textColor: '#ffffff',
      bgColor: '#000000',
      bgOpacity: 0.7,
      borderColor: '#ffffff',
      borderWidth: 0,
      borderRadius: 8,
      padding: 10,
      shadow: 'md',
      textAlign: 'left',
    },
    fields: {
      coords: true, address: false, city: false, country: false,
      date: true, time: false, altitude: false, heading: false,
      make: false, model: false, custom: false,
    },
    customText: '',
    template: 'glass',
    mapThumbDataUrl: null, // cached static map image for gpsmapcamera template
    mapCamera: {
      // Independent geometry for the GPS Map Camera bar so it doesn't
      // collide with the free-form overlay's x/y/width/height.
      x: 0, y: 0, width: 600, height: 130,
    },
  };

  /* ── Templates ── */
  const TEMPLATES = {
    glass: {
      label: 'Glassmorphism',
      style: { bgColor: '#1a1a2e', bgOpacity: 0.45, textColor: '#ffffff', borderColor: '#ffffff', borderWidth: 1, borderRadius: 16, shadow: 'lg' },
    },
    dark: {
      label: 'Dark Card',
      style: { bgColor: '#000000', bgOpacity: 0.78, textColor: '#ffffff', borderColor: '#333333', borderWidth: 0, borderRadius: 10, shadow: 'md' },
    },
    light: {
      label: 'White Minimal',
      style: { bgColor: '#ffffff', bgOpacity: 0.92, textColor: '#111111', borderColor: '#dddddd', borderWidth: 1, borderRadius: 10, shadow: 'sm' },
    },
    gmaps: {
      label: 'Google Maps Card',
      style: { bgColor: '#ffffff', bgOpacity: 0.97, textColor: '#202124', borderColor: '#e0e0e0', borderWidth: 1, borderRadius: 8, shadow: 'md' },
    },
    panel: {
      label: 'GPS Info Panel',
      style: { bgColor: '#0d1b2a', bgOpacity: 0.85, textColor: '#7fd8ff', borderColor: '#1b3a52', borderWidth: 2, borderRadius: 6, shadow: 'md' },
    },
    watermark: {
      label: 'Photographer Mark',
      style: { bgColor: '#000000', bgOpacity: 0.0, textColor: '#ffffff', borderColor: 'transparent', borderWidth: 0, borderRadius: 0, shadow: 'sm' },
    },
    badge: {
      label: 'Rounded Badge',
      style: { bgColor: '#6272ea', bgOpacity: 0.92, textColor: '#ffffff', borderColor: '#ffffff', borderWidth: 0, borderRadius: 40, shadow: 'md' },
    },
    pin: {
      label: 'Map Pin Label',
      style: { bgColor: '#ea6296', bgOpacity: 0.95, textColor: '#ffffff', borderColor: '#ffffff', borderWidth: 2, borderRadius: 14, shadow: 'lg' },
    },
    compact: {
      label: 'Compact Tag',
      style: { bgColor: '#1a1d2e', bgOpacity: 0.7, textColor: '#e8eaf6', borderColor: 'transparent', borderWidth: 0, borderRadius: 6, shadow: 'sm', padding: 6 },
    },
    modern: {
      label: 'Modern Info Card',
      style: { bgColor: '#16213e', bgOpacity: 0.88, textColor: '#f1f1f1', borderColor: '#6272ea', borderWidth: 1, borderRadius: 12, shadow: 'lg' },
    },
    gpsmapcamera: {
      label: 'GPS Map Camera',
      isMapCameraStyle: true,
      style: { bgColor: '#1c1c1c', bgOpacity: 0.82, textColor: '#ffffff', borderColor: 'transparent', borderWidth: 0, borderRadius: 0, shadow: 'none', padding: 16 },
    },
  };

  const SHADOW_PRESETS = {
    none: null,
    sm: { blur: 4, offsetY: 2, alpha: 0.25 },
    md: { blur: 12, offsetY: 4, alpha: 0.35 },
    lg: { blur: 24, offsetY: 8, alpha: 0.45 },
  };

  /* ── Template grid population ── */
  function populateTemplateGrid() {
    const grid = $('#template-grid');
    grid.innerHTML = '';
    Object.entries(TEMPLATES).forEach(([key, tpl]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'template-btn' + (state.template === key ? ' active' : '');
      btn.dataset.template = key;
      btn.innerHTML = `
        <span class="t-preview" style="background:${tpl.style.bgColor}; opacity:${Math.max(tpl.style.bgOpacity, 0.5)};">
          <span style="color:${tpl.style.textColor}; font-size:9px; font-weight:600;">GPS</span>
        </span>
        ${tpl.label}
      `;
      btn.addEventListener('click', () => applyTemplate(key));
      grid.appendChild(btn);
    });
  }

  function applyTemplate(key) {
    const tpl = TEMPLATES[key];
    if (!tpl) return;
    state.template = key;
    Object.assign(state.style, tpl.style);
    syncStyleControlsFromState();
    $$('.template-btn').forEach(b => b.classList.toggle('active', b.dataset.template === key));
    if (tpl.isMapCameraStyle && layoutCallback) {
      layoutCallback(); // let script.js size/position the bar to the current canvas
    }
    renderCallback && renderCallback();
  }

  let layoutCallback = null;
  function onLayoutRequest(fn) { layoutCallback = fn; }

  function isMapCameraTemplate() {
    return !!(TEMPLATES[state.template] && TEMPLATES[state.template].isMapCameraStyle);
  }

  function syncStyleControlsFromState() {
    const s = state.style;
    $('#ov-font-family').value = s.fontFamily;
    $('#ov-font-size').value = s.fontSize;
    $('#ov-font-weight').value = s.fontWeight;
    $('#ov-text-color').value = s.textColor;
    $('#ov-bg-color').value = s.bgColor === 'transparent' ? '#000000' : s.bgColor;
    $('#ov-bg-opacity').value = s.bgOpacity;
    $('#ov-border-color').value = s.borderColor === 'transparent' ? '#ffffff' : s.borderColor;
    $('#ov-border-width').value = s.borderWidth;
    $('#ov-border-radius').value = s.borderRadius;
    $('#ov-padding').value = s.padding;
    $('#ov-shadow').value = s.shadow;
    $('#ov-text-align').value = s.textAlign;
  }

  /* ── Build text lines from enabled fields ── */
  function buildOverlayLines(context) {
    const lines = [];
    const f = state.fields;
    if (f.coords && context.lat != null && context.lng != null) {
      lines.push(`${context.lat.toFixed(6)}, ${context.lng.toFixed(6)}`);
    }
    if (f.address && context.address) lines.push(context.address);
    if (f.city && context.city) lines.push(context.city);
    if (f.country && context.country) lines.push(context.country);
    if (f.date && context.date) lines.push(context.date);
    if (f.time && context.time) lines.push(context.time);
    if (f.altitude && context.altitude != null) lines.push(`Alt: ${context.altitude} m`);
    if (f.heading && context.heading != null) lines.push(`Heading: ${context.heading}° ${window.GTP.headingToLabel(context.heading)}`);
    if (f.make && context.make) lines.push(context.make);
    if (f.model && context.model) lines.push(context.model);
    if (f.custom && state.customText) lines.push(state.customText);
    return lines.length ? lines : ['No data selected'];
  }

  /* ── Canvas drawing ── */
  function drawOverlay(ctx, lines) {
    const s = state.style;
    ctx.save();

    // Translate to overlay center for rotation
    const cx = state.x + state.width / 2;
    const cy = state.y + state.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((state.rotation * Math.PI) / 180);
    ctx.translate(-state.width / 2, -state.height / 2);

    // Shadow
    const shadow = SHADOW_PRESETS[s.shadow];
    if (shadow) {
      ctx.shadowColor = `rgba(0,0,0,${shadow.alpha})`;
      ctx.shadowBlur = shadow.blur;
      ctx.shadowOffsetY = shadow.offsetY;
    }

    // Background
    ctx.globalAlpha = state.opacity;
    if (s.bgColor !== 'transparent' && s.bgOpacity > 0) {
      ctx.fillStyle = hexToRgba(s.bgColor, s.bgOpacity);
      drawRoundedRect(ctx, 0, 0, state.width, state.height, s.borderRadius);
      ctx.fill();
    }

    // Border
    if (s.borderWidth > 0 && s.borderColor !== 'transparent') {
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = s.borderWidth;
      ctx.strokeStyle = s.borderColor;
      drawRoundedRect(ctx, s.borderWidth / 2, s.borderWidth / 2, state.width - s.borderWidth, state.height - s.borderWidth, s.borderRadius);
      ctx.stroke();
    }

    ctx.shadowColor = 'transparent';

    // Text
    ctx.fillStyle = s.textColor;
    ctx.font = `${s.fontWeight} ${s.fontSize}px ${s.fontFamily}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = s.textAlign;

    const pad = s.padding;
    const lineHeight = s.fontSize * 1.35;
    let textX = pad;
    if (s.textAlign === 'center') textX = state.width / 2;
    if (s.textAlign === 'right') textX = state.width - pad;

    lines.forEach((line, i) => {
      ctx.fillText(line, textX, pad + i * lineHeight, state.width - pad * 2);
    });

    ctx.restore();
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function hexToRgba(hex, alpha) {
    if (hex === 'transparent') return 'rgba(0,0,0,0)';
    const h = hex.replace('#', '');
    const bigint = parseInt(h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /* ── GPS Map Camera style overlay ──
     Editable bottom bar replicating the classic "GPS Map Camera" app look:
     [ map thumbnail ] [ location title + address lines + lat/long + timestamp ]
     Position/size driven by state.mapCamera (draggable + resizable like other overlays).
  */
  function drawMapCameraOverlay(ctx, canvasWidth, canvasHeight, context, mapImg) {
    const mc = state.mapCamera;
    const barX = mc.x;
    const barY = mc.y;
    const barWidth = mc.width;
    const barHeight = mc.height;
    const thumbSize = barHeight; // square thumbnail matches bar height
    const s = state.style;
    const baseFontSize = s.fontSize || 14; // driven by the existing "Size (px)" style control

    ctx.save();

    // Background bar
    ctx.globalAlpha = 1;
    ctx.fillStyle = hexToRgba(s.bgColor, s.bgOpacity);
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Map thumbnail (left)
    if (mapImg) {
      ctx.drawImage(mapImg, barX, barY, thumbSize, thumbSize);
      // Red pin marker centered on thumbnail
      drawPin(ctx, barX + thumbSize / 2, barY + thumbSize * 0.55, thumbSize * 0.10);
    } else {
      // Fallback placeholder block if map image unavailable (e.g. offline)
      ctx.fillStyle = '#2b2b2b';
      ctx.fillRect(barX, barY, thumbSize, thumbSize);
      ctx.fillStyle = '#888';
      ctx.font = `400 ${Math.round(thumbSize * 0.09)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Map unavailable', barX + thumbSize / 2, barY + thumbSize / 2);
    }

    // "Google" wordmark bottom-left over thumbnail (small, like the reference)
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `600 ${Math.round(thumbSize * 0.085)}px Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Google', barX + thumbSize * 0.08, barY + thumbSize - thumbSize * 0.06);

    // Text block (right of thumbnail)
    const textX = barX + thumbSize + Math.round(barWidth * 0.018);
    const textRight = barX + barWidth - Math.round(barWidth * 0.015);
    const maxTextWidth = Math.max(20, textRight - textX);
    let cursorY = barY + barHeight * 0.10;

    const titleSize = Math.max(8, Math.round(baseFontSize * 1.5));
    const lineSize  = Math.max(7, Math.round(baseFontSize * 1.0));
    const lineGap   = lineSize * 1.32;

    ctx.fillStyle = s.textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Title: "City, State, Country  🇮🇳"
    if (context.titleLine) {
      ctx.font = `700 ${titleSize}px ${s.fontFamily}`;
      ctx.fillText(truncateToWidth(ctx, context.titleLine, maxTextWidth), textX, cursorY);
      cursorY += titleSize * 1.4;
    }

    // Address lines (wrapped to 2 lines max)
    ctx.font = `400 ${lineSize}px ${s.fontFamily}`;
    if (context.addressLines && context.addressLines.length) {
      context.addressLines.forEach(line => {
        ctx.fillText(truncateToWidth(ctx, line, maxTextWidth), textX, cursorY);
        cursorY += lineGap;
      });
    }

    // Lat/Long line
    if (context.latLngLine) {
      ctx.fillText(truncateToWidth(ctx, context.latLngLine, maxTextWidth), textX, cursorY);
      cursorY += lineGap;
    }

    // Timestamp line
    if (context.timestampLine) {
      ctx.fillText(truncateToWidth(ctx, context.timestampLine, maxTextWidth), textX, cursorY);
    }

    ctx.restore();
  }

  function drawPin(ctx, cx, cy, r) {
    ctx.save();
    ctx.fillStyle = '#ea4335';
    ctx.beginPath();
    ctx.arc(cx, cy - r, r, 0, Math.PI * 2);
    ctx.moveTo(cx - r, cy - r + r * 0.3);
    ctx.lineTo(cx, cy + r * 1.4);
    ctx.lineTo(cx + r, cy - r + r * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy - r, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function truncateToWidth(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) {
      t = t.slice(0, -1);
    }
    return t + '…';
  }

  /**
   * Fetch a static satellite/map thumbnail centered on lat/lng using
   * free OSM raster tiles, composited client-side into a single square image.
   * Returns a Promise<HTMLImageElement|null>.
   */
  async function fetchMapThumbnail(lat, lng, sizePx = 300, zoom = 16) {
    try {
      const tileSize = 256;
      const scaleFactor = sizePx / tileSize;
      const n = Math.pow(2, zoom);
      const xtileF = (lng + 180) / 360 * n;
      const latRad = lat * Math.PI / 180;
      const ytileF = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;

      const xtile = Math.floor(xtileF);
      const ytile = Math.floor(ytileF);

      // Compose a 2x2 tile grid centered roughly on the point for safety margin
      const canvas = document.createElement('canvas');
      canvas.width = tileSize * 2;
      canvas.height = tileSize * 2;
      const ctx = canvas.getContext('2d');

      const subdomains = ['a', 'b', 'c'];
      const loads = [];
      for (let dx = 0; dx <= 1; dx++) {
        for (let dy = 0; dy <= 1; dy++) {
          const tx = xtile + dx;
          const ty = ytile + dy;
          const sub = subdomains[(tx + ty) % subdomains.length];
          const url = `https://${sub}.tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;
          loads.push(
            loadCrossOriginImage(url).then(img => {
              if (img) ctx.drawImage(img, dx * tileSize, dy * tileSize, tileSize, tileSize);
            }).catch(() => {})
          );
        }
      }
      await Promise.all(loads);

      // Crop to a centered square around the precise point and scale to sizePx
      const pxX = (xtileF - xtile) * tileSize + tileSize;
      const pxY = (ytileF - ytile) * tileSize + tileSize;
      const cropSize = tileSize; // crop window before final scale
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = sizePx;
      finalCanvas.height = sizePx;
      const fctx = finalCanvas.getContext('2d');
      fctx.drawImage(
        canvas,
        pxX - cropSize / 2, pxY - cropSize / 2, cropSize, cropSize,
        0, 0, sizePx, sizePx
      );

      const dataUrl = finalCanvas.toDataURL('image/png');
      return await loadImageFromSrc(dataUrl);
    } catch (e) {
      console.warn('Map thumbnail fetch failed:', e);
      return null;
    }
  }

  function loadCrossOriginImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('tile load failed'));
      img.src = src;
    });
  }

  function loadImageFromSrc(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  /* ── Measure required height based on lines/fontsize ── */
  function autoSizeForLines(lines) {
    const s = state.style;
    state.height = Math.max(50, lines.length * s.fontSize * 1.35 + s.padding * 2);
  }

  /* ── Drag/resize handle management (DOM overlay synced to canvas) ── */
  let renderCallback = null;
  function onRender(fn) { renderCallback = fn; }

  function setupDragHandlers(canvasEl, handleEl, getScale) {
    let dragging = false, resizing = false, resizeDir = null;
    let startX, startY, startState;

    function activeGeometry() {
      return isMapCameraTemplate() ? state.mapCamera : state;
    }

    function getPointer(e) {
      const rect = canvasEl.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    handleEl.addEventListener('mousedown', startDrag);
    handleEl.addEventListener('touchstart', startDrag, { passive: false });

    function startDrag(e) {
      if (e.target.classList.contains('resize-handle')) {
        resizing = true;
        resizeDir = e.target.dataset.dir;
      } else if (e.target.classList.contains('overlay-lock-btn')) {
        return; // handled separately
      } else {
        dragging = true;
      }
      const geo = activeGeometry();
      const p = getPointer(e);
      startX = p.x; startY = p.y;
      startState = { x: geo.x, y: geo.y, width: geo.width, height: geo.height };
      e.preventDefault();
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', endDrag);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', endDrag);
    }

    function onMove(e) {
      const scale = getScale();
      const geo = activeGeometry();
      const p = getPointer(e);
      const dx = (p.x - startX) / scale;
      const dy = (p.y - startY) / scale;

      if (dragging) {
        geo.x = startState.x + dx;
        geo.y = startState.y + dy;
        clampToCanvas(canvasEl, scale);
      } else if (resizing) {
        applyResize(resizeDir, dx, dy, startState, geo);
      }
      renderCallback && renderCallback();
      e.preventDefault();
    }

    function endDrag() {
      dragging = false; resizing = false; resizeDir = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', endDrag);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', endDrag);
    }

    function applyResize(dir, dx, dy, start, geo) {
      const minSize = 40;
      let { x, y, width, height } = start;

      if (dir.includes('r')) width = Math.max(minSize, start.width + dx);
      if (dir.includes('l')) { width = Math.max(minSize, start.width - dx); x = start.x + dx; if(width===minSize) x = start.x + start.width - minSize; }
      if (dir.includes('b')) height = Math.max(minSize, start.height + dy);
      if (dir.includes('t')) { height = Math.max(minSize, start.height - dy); y = start.y + dy; if(height===minSize) y = start.y + start.height - minSize; }

      if (state.aspectLocked) {
        const ratio = start.width / start.height;
        height = width / ratio;
        if (dir.includes('t')) y = start.y + start.height - height;
      }

      geo.x = x; geo.y = y; geo.width = width; geo.height = height;
    }

    // Keyboard movement
    handleEl.setAttribute('tabindex', '0');
    handleEl.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 10 : 2;
      const geo = activeGeometry();
      let handled = true;
      switch (e.key) {
        case 'ArrowUp': geo.y -= step; break;
        case 'ArrowDown': geo.y += step; break;
        case 'ArrowLeft': geo.x -= step; break;
        case 'ArrowRight': geo.x += step; break;
        default: handled = false;
      }
      if (handled) {
        e.preventDefault();
        clampToCanvas(canvasEl, getScale());
        renderCallback && renderCallback();
      }
    });
  }

  function clampToCanvas(canvasEl, scale) {
    const geo = isMapCameraTemplate() ? state.mapCamera : state;
    const maxX = canvasEl.width / scale - geo.width;
    const maxY = canvasEl.height / scale - geo.height;
    geo.x = Math.max(0, Math.min(geo.x, Math.max(0, maxX)));
    geo.y = Math.max(0, Math.min(geo.y, Math.max(0, maxY)));
  }

  function toggleAspectLock() {
    state.aspectLocked = !state.aspectLocked;
    return state.aspectLocked;
  }

  return {
    state, TEMPLATES,
    populateTemplateGrid, applyTemplate, syncStyleControlsFromState,
    buildOverlayLines, drawOverlay, autoSizeForLines,
    setupDragHandlers, clampToCanvas, toggleAspectLock,
    onRender, onLayoutRequest, isMapCameraTemplate,
    drawMapCameraOverlay, fetchMapThumbnail,
  };
})();

window.GTP = window.GTP || {};
window.GTP.Overlay = OverlayModule;
