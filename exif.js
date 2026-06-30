/**
 * exif.js – EXIF metadata reading & writing via piexifjs
 */

'use strict';

const ExifModule = (() => {
  const { formatExifDateTime, parseExifDateTime } = window.GTP;

  /* ── Convert decimal degrees → EXIF DMS rational array ── */
  function toDMS(deg) {
    const absolute = Math.abs(deg);
    const degrees = Math.floor(absolute);
    const minutesFloat = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesFloat);
    const secondsFloat = (minutesFloat - minutes) * 60;
    // piexif expects [[num,den],[num,den],[num,den]]
    return [
      [degrees, 1],
      [minutes, 1],
      [Math.round(secondsFloat * 100), 100],
    ];
  }

  /* ── Convert EXIF DMS rational array → decimal degrees ── */
  function fromDMS(dms, ref) {
    if (!dms || dms.length < 3) return null;
    const d = dms[0][0] / dms[0][1];
    const m = dms[1][0] / dms[1][1];
    const s = dms[2][0] / dms[2][1];
    let dec = d + m / 60 + s / 3600;
    if (ref === 'S' || ref === 'W') dec = -dec;
    return dec;
  }

  /**
   * Read all relevant EXIF data from a JPEG data URL.
   * Returns a plain JS object with normalized fields.
   */
  function readExif(dataUrl) {
    const result = {
      gps: { lat: null, lng: null, altitude: null, direction: null },
      datetime: { date: '', time: '' },
      camera: { make: '', model: '', lens: '' },
      author: { artist: '', copyright: '' },
      image: { description: '', comment: '', orientation: 1, software: '' },
      raw: null,
    };

    let exifObj;
    try {
      exifObj = piexif.load(dataUrl);
    } catch (e) {
      console.warn('No EXIF data found or failed to parse:', e);
      return result;
    }

    result.raw = exifObj;
    const GPS = exifObj['GPS'] || {};
    const Exif = exifObj['Exif'] || {};
    const Zeroth = exifObj['0th'] || {};

    // GPS
    if (GPS[piexif.GPSIFD.GPSLatitude] && GPS[piexif.GPSIFD.GPSLatitudeRef]) {
      result.gps.lat = fromDMS(GPS[piexif.GPSIFD.GPSLatitude], GPS[piexif.GPSIFD.GPSLatitudeRef]);
    }
    if (GPS[piexif.GPSIFD.GPSLongitude] && GPS[piexif.GPSIFD.GPSLongitudeRef]) {
      result.gps.lng = fromDMS(GPS[piexif.GPSIFD.GPSLongitude], GPS[piexif.GPSIFD.GPSLongitudeRef]);
    }
    if (GPS[piexif.GPSIFD.GPSAltitude]) {
      const alt = GPS[piexif.GPSIFD.GPSAltitude];
      result.gps.altitude = alt[0] / alt[1];
      if (GPS[piexif.GPSIFD.GPSAltitudeRef] === 1) result.gps.altitude *= -1;
    }
    if (GPS[piexif.GPSIFD.GPSImgDirection]) {
      const dir = GPS[piexif.GPSIFD.GPSImgDirection];
      result.gps.direction = dir[0] / dir[1];
    }

    // DateTime
    const dt = Exif[piexif.ExifIFD.DateTimeOriginal] || Zeroth[piexif.ImageIFD.DateTime];
    if (dt) {
      const parsed = parseExifDateTime(dt);
      result.datetime.date = parsed.date;
      result.datetime.time = parsed.time;
    }

    // Camera
    result.camera.make  = Zeroth[piexif.ImageIFD.Make] || '';
    result.camera.model = Zeroth[piexif.ImageIFD.Model] || '';
    result.camera.lens  = Exif[piexif.ExifIFD.LensModel] || '';

    // Author
    result.author.artist    = Zeroth[piexif.ImageIFD.Artist] || '';
    result.author.copyright = Zeroth[piexif.ImageIFD.Copyright] || '';

    // Image
    result.image.description = Zeroth[piexif.ImageIFD.ImageDescription] || '';
    result.image.orientation = Zeroth[piexif.ImageIFD.Orientation] || 1;
    result.image.software    = Zeroth[piexif.ImageIFD.Software] || '';
    if (Exif[piexif.ExifIFD.UserComment]) {
      try {
        // UserComment may be prefixed with character code; strip non-printable header
        result.image.comment = String(Exif[piexif.ExifIFD.UserComment]).replace(/^[\x00-\x1F]+/, '');
      } catch (_) { result.image.comment = ''; }
    }

    return result;
  }

  /**
   * Build a fresh/merged piexif exifObj from form data, preserving
   * any existing tags from `existingRaw` where not overridden.
   */
  function buildExifObject(data, existingRaw) {
    const exifObj = existingRaw ? JSON.parse(JSON.stringify(existingRaw)) : { '0th': {}, 'Exif': {}, 'GPS': {}, '1st': {}, 'Interop': {}, 'thumbnail': null };

    exifObj['0th'] = exifObj['0th'] || {};
    exifObj['Exif'] = exifObj['Exif'] || {};
    exifObj['GPS'] = exifObj['GPS'] || {};

    const Zeroth = exifObj['0th'];
    const Exif = exifObj['Exif'];
    const GPS = exifObj['GPS'];

    // GPS Latitude/Longitude
    if (data.gps && data.gps.lat !== null && data.gps.lat !== undefined && data.gps.lat !== '') {
      const lat = parseFloat(data.gps.lat);
      GPS[piexif.GPSIFD.GPSLatitude] = toDMS(lat);
      GPS[piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? 'N' : 'S';
    }
    if (data.gps && data.gps.lng !== null && data.gps.lng !== undefined && data.gps.lng !== '') {
      const lng = parseFloat(data.gps.lng);
      GPS[piexif.GPSIFD.GPSLongitude] = toDMS(lng);
      GPS[piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? 'E' : 'W';
    }
    if (data.gps && data.gps.altitude !== null && data.gps.altitude !== undefined && data.gps.altitude !== '') {
      const alt = parseFloat(data.gps.altitude);
      GPS[piexif.GPSIFD.GPSAltitude] = [Math.round(Math.abs(alt) * 100), 100];
      GPS[piexif.GPSIFD.GPSAltitudeRef] = alt < 0 ? 1 : 0;
    }
    if (data.gps && data.gps.direction !== null && data.gps.direction !== undefined && data.gps.direction !== '') {
      const dir = parseFloat(data.gps.direction);
      GPS[piexif.GPSIFD.GPSImgDirection] = [Math.round(dir * 100), 100];
      GPS[piexif.GPSIFD.GPSImgDirectionRef] = 'T';
    }
    GPS[piexif.GPSIFD.GPSVersionID] = [2, 3, 0, 0];

    // DateTime
    if (data.datetime && data.datetime.date) {
      const exifDt = formatExifDateTime(data.datetime.date, data.datetime.time);
      Exif[piexif.ExifIFD.DateTimeOriginal] = exifDt;
      Exif[piexif.ExifIFD.DateTimeDigitized] = exifDt;
      Zeroth[piexif.ImageIFD.DateTime] = exifDt;
    }

    // Camera
    if (data.camera) {
      if (data.camera.make)  Zeroth[piexif.ImageIFD.Make] = data.camera.make;
      if (data.camera.model) Zeroth[piexif.ImageIFD.Model] = data.camera.model;
      if (data.camera.lens)  Exif[piexif.ExifIFD.LensModel] = data.camera.lens;
    }

    // Author
    if (data.author) {
      if (data.author.artist)    Zeroth[piexif.ImageIFD.Artist] = data.author.artist;
      if (data.author.copyright) Zeroth[piexif.ImageIFD.Copyright] = data.author.copyright;
    }

    // Image
    if (data.image) {
      if (data.image.description) Zeroth[piexif.ImageIFD.ImageDescription] = data.image.description;
      if (data.image.orientation) Zeroth[piexif.ImageIFD.Orientation] = parseInt(data.image.orientation, 10);
      if (data.image.software)    Zeroth[piexif.ImageIFD.Software] = data.image.software;
      if (data.image.comment)     Exif[piexif.ExifIFD.UserComment] = data.image.comment;
    }

    return exifObj;
  }

  /**
   * Insert EXIF metadata into a JPEG data URL, returns new data URL.
   */
  function writeExif(dataUrl, exifObj) {
    const exifBytes = piexif.dump(exifObj);
    return piexif.insert(exifBytes, dataUrl);
  }

  /**
   * Strip all EXIF metadata from a JPEG data URL.
   */
  function clearExif(dataUrl) {
    try {
      return piexif.remove(dataUrl);
    } catch (e) {
      console.warn('Failed to clear EXIF:', e);
      return dataUrl;
    }
  }

  /**
   * Render a human-readable summary of exif-relevant form data,
   * for the comparison modal and export summary.
   */
  function summarize(data) {
    const lines = [];
    if (data.gps) {
      if (data.gps.lat != null) lines.push(['Latitude', data.gps.lat]);
      if (data.gps.lng != null) lines.push(['Longitude', data.gps.lng]);
      if (data.gps.altitude != null) lines.push(['Altitude', `${data.gps.altitude} m`]);
      if (data.gps.direction != null) lines.push(['Direction', `${data.gps.direction}°`]);
    }
    if (data.datetime && data.datetime.date) lines.push(['Date Taken', data.datetime.date]);
    if (data.datetime && data.datetime.time) lines.push(['Time Taken', data.datetime.time]);
    if (data.camera) {
      if (data.camera.make) lines.push(['Camera Make', data.camera.make]);
      if (data.camera.model) lines.push(['Camera Model', data.camera.model]);
      if (data.camera.lens) lines.push(['Lens', data.camera.lens]);
    }
    if (data.author) {
      if (data.author.artist) lines.push(['Artist', data.author.artist]);
      if (data.author.copyright) lines.push(['Copyright', data.author.copyright]);
    }
    if (data.image) {
      if (data.image.description) lines.push(['Description', data.image.description]);
      if (data.image.software) lines.push(['Software', data.image.software]);
    }
    return lines;
  }

  return { readExif, buildExifObject, writeExif, clearExif, toDMS, fromDMS, summarize };
})();

window.GTP = window.GTP || {};
window.GTP.Exif = ExifModule;
