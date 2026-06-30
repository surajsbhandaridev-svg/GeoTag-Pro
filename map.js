/**
 * map.js – Leaflet map, search, reverse geocoding (Nominatim)
 */

'use strict';

const MapModule = (() => {
  const { Toast, debounce, $ } = window.GTP;

  let map = null;
  let marker = null;
  let onLocationChangeCallback = null;
  let initialized = false;

  const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

  function init(defaultLat = 20.5937, defaultLng = 78.9629, defaultZoom = 5) {
    if (initialized) return;
    initialized = true;

    map = L.map('map-container', {
      center: [defaultLat, defaultLng],
      zoom: defaultZoom,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    marker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(map);

    marker.on('drag', throttledDragHandler);
    marker.on('dragend', (e) => {
      const pos = e.target.getLatLng();
      emitLocationChange(pos.lat, pos.lng, true);
    });

    map.on('click', (e) => {
      setMarkerPosition(e.latlng.lat, e.latlng.lng);
      emitLocationChange(e.latlng.lat, e.latlng.lng, true);
    });

    // Fix map sizing issues when container becomes visible
    setTimeout(() => map.invalidateSize(), 200);
  }

  const throttledDragHandler = window.GTP.throttle((e) => {
    const pos = e.target.getLatLng();
    emitLocationChange(pos.lat, pos.lng, false);
  }, 120);

  function emitLocationChange(lat, lng, shouldGeocode) {
    if (onLocationChangeCallback) onLocationChangeCallback(lat, lng, shouldGeocode);
  }

  function setMarkerPosition(lat, lng, panTo = false) {
    if (!marker) return;
    marker.setLatLng([lat, lng]);
    if (panTo && map) map.panTo([lat, lng]);
  }

  function setView(lat, lng, zoom = 14) {
    if (!map) return;
    map.setView([lat, lng], zoom);
    setMarkerPosition(lat, lng);
  }

  function onLocationChange(fn) {
    onLocationChangeCallback = fn;
  }

  function invalidateSize() {
    if (map) setTimeout(() => map.invalidateSize(), 100);
  }

  /* ── Reverse Geocoding ── */
  async function reverseGeocode(lat, lng) {
    const url = `${NOMINATIM_BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en' },
    });
    if (!res.ok) throw new Error('Reverse geocoding failed');
    const data = await res.json();
    return parseGeocodeResult(data);
  }

  /* ── Forward Geocoding / Search ── */
  async function searchLocation(query) {
    if (!query || query.trim().length < 2) return [];
    const url = `${NOMINATIM_BASE}/search?format=jsonv2&q=${encodeURIComponent(query)}&addressdetails=1&limit=6`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en' },
    });
    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();
    return data.map(item => ({
      label: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      raw: item,
    }));
  }

  function parseGeocodeResult(data) {
    const addr = data.address || {};
    return {
      address: data.display_name || '',
      country: addr.country || '',
      state: addr.state || addr.region || '',
      city: addr.city || addr.town || addr.municipality || '',
      district: addr.county || addr.district || addr.suburb || '',
      village: addr.village || addr.hamlet || '',
      postal: addr.postcode || '',
    };
  }

  return {
    init, setView, setMarkerPosition, onLocationChange,
    reverseGeocode, searchLocation, invalidateSize,
  };
})();

window.GTP = window.GTP || {};
window.GTP.Map = MapModule;
