/**
 * utils.js – Shared helper utilities for GeoTag Pro
 */

'use strict';

/* ── Toast Notifications ── */
const Toast = (() => {
  const ICONS = {
    success: `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>`,
    error:   `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>`,
    warning: `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>`,
    info:    `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>`,
  };

  const container = document.getElementById('toast-container');

  function show(message, type = 'info', duration = 3500) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `${ICONS[type] || ICONS.info}<span>${message}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      el.style.transition = 'opacity .3s, transform .3s';
      setTimeout(() => el.remove(), 320);
    }, duration);
  }

  return { show };
})();


/* ── Loading overlay ── */
const Loader = (() => {
  const overlay  = document.getElementById('loading-overlay');
  const textEl   = document.getElementById('loading-text');
  const barEl    = document.getElementById('progress-bar');

  function show(text = 'Processing…', progress = 0) {
    textEl.textContent = text;
    barEl.style.width = `${progress}%`;
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function update(text, progress) {
    if (text !== undefined) textEl.textContent = text;
    if (progress !== undefined) barEl.style.width = `${progress}%`;
  }

  function hide() {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }

  return { show, update, hide };
})();


/* ── Undo / Redo Stack ── */
class UndoStack {
  constructor(maxSize = 50) {
    this._stack = [];
    this._index = -1;
    this._max   = maxSize;
    this._onchange = null;
  }

  push(snapshot) {
    // drop any redo states ahead of current pointer
    this._stack = this._stack.slice(0, this._index + 1);
    this._stack.push(JSON.stringify(snapshot));
    if (this._stack.length > this._max) this._stack.shift();
    this._index = this._stack.length - 1;
    this._emit();
  }

  undo() {
    if (!this.canUndo()) return null;
    this._index--;
    this._emit();
    return JSON.parse(this._stack[this._index]);
  }

  redo() {
    if (!this.canRedo()) return null;
    this._index++;
    this._emit();
    return JSON.parse(this._stack[this._index]);
  }

  canUndo() { return this._index > 0; }
  canRedo() { return this._index < this._stack.length - 1; }

  onChange(fn) { this._onchange = fn; }
  _emit() { if (this._onchange) this._onchange(this.canUndo(), this.canRedo()); }
}


/* ── DOM Helpers ── */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function setVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? '';
}

function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function showEl(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function hideEl(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function toggleEl(id, force) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('hidden', force === undefined ? undefined : !force);
}


/* ── Coordinate helpers ── */
function formatCoord(deg, isLat) {
  if (deg === null || deg === undefined || isNaN(deg)) return '';
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const mFull = (abs - d) * 60;
  const m = Math.floor(mFull);
  const s = ((mFull - m) * 60).toFixed(3);
  const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
  return `${d}°${m}'${s}"${dir}`;
}

function parseCoordString(str) {
  // Accept "lat, lng" or "lat lng" decimal format
  str = str.trim();
  const parts = str.split(/[\s,]+/);
  if (parts.length === 2) {
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  }
  return null;
}

function clampLat(v) { return Math.max(-90, Math.min(90, v)); }
function clampLng(v) { return Math.max(-180, Math.min(180, v)); }


/* ── Validation ── */
function validateLat(v) {
  const n = parseFloat(v);
  return !isNaN(n) && n >= -90 && n <= 90;
}

function validateLng(v) {
  const n = parseFloat(v);
  return !isNaN(n) && n >= -180 && n <= 180;
}

function validateDate(v) {
  if (!v) return false;
  const d = new Date(v);
  return !isNaN(d.getTime());
}

function showFieldError(fieldId, msg) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  el.classList.add('error');
  let err = el.parentElement.querySelector('.field-error');
  if (!err) {
    err = document.createElement('span');
    err.className = 'field-error';
    el.parentElement.appendChild(err);
  }
  err.textContent = msg;
}

function clearFieldError(fieldId) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  el.classList.remove('error');
  const err = el.parentElement.querySelector('.field-error');
  if (err) err.remove();
}


/* ── File helpers ── */
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}


/* ── Date / time helpers ── */
function nowDateString() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

function nowTimeString() {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

function formatExifDateTime(dateStr, timeStr) {
  // Returns "YYYY:MM:DD HH:MM:SS" as required by EXIF
  if (!dateStr) return '';
  const datePart = dateStr.replace(/-/g, ':');
  const timePart = timeStr || '00:00:00';
  return `${datePart} ${timePart}`;
}

function parseExifDateTime(exifStr) {
  // Parse "YYYY:MM:DD HH:MM:SS" → { date: "YYYY-MM-DD", time: "HH:MM:SS" }
  if (!exifStr || typeof exifStr !== 'string') return { date: '', time: '' };
  const [datePart, timePart] = exifStr.split(' ');
  return {
    date: datePart ? datePart.replace(/:/g, '-') : '',
    time: timePart || '',
  };
}


/* ── Debounce ── */
function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/* ── Throttle ── */
function throttle(fn, limit = 100) {
  let last = 0;
  return function (...args) {
    const now = Date.now();
    if (now - last >= limit) { last = now; fn.apply(this, args); }
  };
}


/* ── Auto-save to sessionStorage ── */
const AutoSave = (() => {
  const KEY = 'geotag_pro_form_state';

  function save(state) {
    try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
  }

  function load() {
    try {
      const raw = sessionStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function clear() {
    try { sessionStorage.removeItem(KEY); } catch (_) {}
  }

  return { save, load, clear };
})();


/* ── Compass direction label ── */
function headingToLabel(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const index = Math.round(deg / 22.5) % 16;
  return dirs[index] || 'N';
}

/* ── Copy to clipboard ── */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    // Fallback
    const el = document.createElement('textarea');
    el.value = text;
    el.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  }
}

/* ── Expose globally ── */
window.GTP = window.GTP || {};
Object.assign(window.GTP, {
  Toast, Loader, UndoStack,
  $, $$, setVal, getVal, showEl, hideEl, toggleEl,
  formatCoord, parseCoordString, clampLat, clampLng,
  validateLat, validateLng, validateDate,
  showFieldError, clearFieldError,
  readFileAsArrayBuffer, readFileAsDataURL,
  arrayBufferToBase64, base64ToArrayBuffer,
  downloadBlob, formatFileSize,
  nowDateString, nowTimeString,
  formatExifDateTime, parseExifDateTime,
  debounce, throttle,
  AutoSave, headingToLabel, copyToClipboard,
});
