/* College-town home sales: Explore filters, map, comparison and Q1 to Q10.
   Every number is computed in the browser from data/college_town_home_sales.csv.
   Plain JavaScript; Chart.js and Leaflet are loaded by script tags in index.html. */
(function () {
  'use strict';

  var CSV_URL = 'data/college_town_home_sales.csv';
  var PRICE_MIN = 10000;
  var PRICE_MAX = 5000000;
  var DAY_MS = 86400000;
  var AREA_MIN = 0;
  var AREA_MAX = 7000;
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];
  var FEATURE_FIELDS = { gar: 'garage', bas: 'basement', fire: 'fireplace' };

  // Colours are read from the CSS variables, so both themes work. They are set by readPalette().
  var FONT_SANS, INK, INK_2, PAPER, RULE, GRID, QUIET, QUIET_DARK, QUIET_LIGHT, ACCENT, ACCENT_LIGHT, TEAL, TEAL_LIGHT;

  var charts = {};
  var labelFormats = {};
  var D = [];
  var CITIES = [];
  var CAMPUSES = [];
  var CITY_UNI = {};
  var CITY_CENTER = {};
  var YEARS = [];
  var PARTIAL_YEAR_NOTE = {};
  var map = null;
  var mapTiles = null;
  var markers = {};
  var resultRows = [];
  var resultSort = { key: 'n', dir: 'desc' };
  var MAP_TILES = {
    light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
  };
  var MAP_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

  /* ---------- Small helpers ---------- */

  function el(id) { return document.getElementById(id); }

  function readPalette() {
    var cs = getComputedStyle(document.documentElement);
    function v(name) { return cs.getPropertyValue(name).trim(); }
    FONT_SANS = v('--font-sans');
    INK = v('--ink');
    INK_2 = v('--ink-2');
    PAPER = v('--paper');
    RULE = v('--rule');
    GRID = v('--grid');
    QUIET = v('--quiet');
    QUIET_DARK = v('--quiet-2');
    QUIET_LIGHT = v('--quiet-3');
    ACCENT = v('--accent');
    ACCENT_LIGHT = v('--accent-soft');
    TEAL = v('--accent-2');
    TEAL_LIGHT = v('--accent-2-soft');
    if (window.Chart) {
      Chart.defaults.color = INK;
      Chart.defaults.borderColor = GRID;
      Chart.defaults.font.family = FONT_SANS;
      var tip = Chart.defaults.plugins.tooltip;
      tip.backgroundColor = PAPER;
      tip.titleColor = INK;
      tip.bodyColor = INK_2;
      tip.footerColor = INK_2;
      tip.borderColor = RULE;
      tip.borderWidth = 1;
      tip.cornerRadius = 6;
      tip.padding = 10;
      tip.boxPadding = 4;
      tip.titleFont = { family: FONT_SANS, size: 13, weight: '600' };
      tip.bodyFont = { family: FONT_SANS, size: 13 };
      tip.footerFont = { family: FONT_SANS, size: 12 };
    }
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  // Returns an rgba() string for a six-digit hex colour from the palette.
  function alpha(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ', ' + a + ')';
  }

  function chartReady() { return typeof window.Chart !== 'undefined'; }
  function mapReady() { return typeof window.L !== 'undefined'; }

  function numOrNull(s) {
    if (s === undefined || s === null || String(s).trim() === '') { return null; }
    var v = Number(s);
    return isFinite(v) ? v : null;
  }

  function dateParts(s) {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) { return null; }
    return [Number(s.slice(0, 4)), Number(s.slice(5, 7)), Number(s.slice(8, 10))];
  }

  function dateMs(s) {
    var p = dateParts(s);
    return p ? Date.UTC(p[0], p[1] - 1, p[2]) : null;
  }

  function median(values) {
    if (!values.length) { return null; }
    var s = values.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function mean(values) {
    var total = 0;
    for (var i = 0; i < values.length; i++) { total += values[i]; }
    return total / values.length;
  }

  function groupBy(items, keyFn) {
    var map = new Map();
    items.forEach(function (it) {
      var k = keyFn(it);
      if (k === null || k === undefined) { return; }
      if (!map.has(k)) { map.set(k, []); }
      map.get(k).push(it);
    });
    return map;
  }

  // Half up, away from zero, on the decimal value. Adding 0 turns -0 into 0.
  function roundHalfUp(x, places) {
    var f = Math.pow(10, places);
    return Math.sign(x) * Math.floor(Math.abs(x) * f + 0.5 + 1e-9) / f + 0;
  }

  // Every entry tied for the largest (or smallest) value, compared at the precision shown.
  function extremes(entries, wantMax, places) {
    if (!entries.length) { return []; }
    var target = null;
    entries.forEach(function (e) {
      var k = roundHalfUp(e.value, places);
      if (target === null || (wantMax ? k > target : k < target)) { target = k; }
    });
    return entries.filter(function (e) { return roundHalfUp(e.value, places) === target; });
  }

  function fmtInt(n) { return roundHalfUp(n, 0).toLocaleString('en-US'); }
  function fmtUsd(v) { return '$' + roundHalfUp(v, 0).toLocaleString('en-US'); }
  function fmtDec(v, places) { return roundHalfUp(v, places).toFixed(places); }
  function fmtPct(v, signed) { return (signed && roundHalfUp(v, 1) > 0 ? '+' : '') + fmtDec(v, 1) + '%'; }
  function fmtDays(v) { return fmtDec(v, 1) + ' days'; }
  function fmtMiles(v) { return fmtDec(v, 1) + ' miles'; }
  function fmtSqft(v) { return fmtInt(v) + ' sq ft'; }
  function plural(n, word) { return fmtInt(n) + ' ' + word + (n === 1 ? '' : 's'); }
  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'];
    var v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  function dash(v, f) { return v === null || v === undefined ? '—' : f(v); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function joinNames(names) {
    if (names.length <= 1) { return names.join(''); }
    if (names.length === 2) { return names[0] + ' and ' + names[1]; }
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  function byName(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  function yearLabel(y) {
    return String(y) + (PARTIAL_YEAR_NOTE[y] ? ' (' + PARTIAL_YEAR_NOTE[y] + ')' : '');
  }

  function fillTable(id, headers, rows, optionalCols) {
    var html = '<thead><tr>' + headers.map(function (h, i) {
      return '<th scope="col"' + (optionalCols && optionalCols[i] ? ' class="optional"' : '') + '>' + esc(h) + '</th>';
    }).join('') + '</tr></thead><tbody>' + rows.map(function (r) {
      return '<tr>' + r.map(function (c, i) {
        return '<td data-label="' + esc(headers[i]) + '"' + (optionalCols && optionalCols[i] ? ' class="optional"' : '') + '>' + esc(c) + '</td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody>';
    el(id).innerHTML = html;
  }

  function setAnswer(id, paragraphs) {
    el(id).innerHTML = paragraphs.map(function (p) { return '<p>' + p + '</p>'; }).join('');
  }

  function setError(id, message) {
    el(id).innerHTML = '<p class="error">' + esc(message) + '</p>';
  }

  // Chart titles and axis labels. x is the horizontal axis and y the vertical one, whichever way the chart runs.
  var CHART_META = {
    c1: { title: 'Median sale price by city, valid prices', x: 'Median sale price', y: 'City' },
    c2: { title: 'Mean and median sale price by city, all rows', x: 'Sale price', y: 'City' },
    c3: { title: 'Rank by mean sale price: all rows and valid prices', x: 'Price rule', y: 'Rank by mean (1 is highest)' },
    c4: { title: 'Change in median sale price, 2024 to 2025, by campus area', x: 'Percent change', y: 'Campus area' },
    c5: { title: 'Median days on market by campus area', x: 'Days from listing to contract', y: 'Campus area' },
    c6: { title: 'Median annual tax as a percent of sale price, by campus area', x: 'Percent of sale price', y: 'Campus area' },
    c7: { title: 'Median sale price by city for the chosen bedroom count', x: 'Median sale price', y: 'City' },
    c8: { title: 'Median days on market by city for the chosen price range', x: 'Days from listing to contract', y: 'City' },
    c9: { title: 'Sales by month for the chosen city and year', x: 'Month', y: 'Sales' },
    c10: { title: 'Sales that meet the conditions: distance to campus and price', x: 'Miles to campus', y: 'Sale price' },
    'cx-year': { title: 'Sales per sale year under the current filters', x: 'Sale year', y: 'Sales' },
    'cx-beds': { title: 'Median sale price by bedrooms under the current filters', x: 'Bedrooms', y: 'Median sale price' },
    'c-compare': { title: 'Median sale price: Area A and Area B', x: 'Median sale price', y: 'Area' },
    cp1: { title: 'Mean sale price by city, before and after the valid price rule', x: 'Mean sale price', y: 'City' }
  };

  function chartTitleOpts(text) {
    return { display: true, text: text, align: 'start', color: INK, padding: { bottom: 14 },
             font: { family: FONT_SANS, size: 15, weight: '600' } };
  }

  function axisTitleOpts(text) {
    return { display: true, text: text, color: INK_2, padding: { top: 6, bottom: 2 },
             font: { family: FONT_SANS, size: 12, weight: '600' } };
  }

  function drawChart(id, config) {
    if (charts[id]) { charts[id].destroy(); }
    var meta = CHART_META[id];
    if (meta) {
      var o = config.options = config.options || {};
      o.plugins = o.plugins || {};
      o.plugins.title = chartTitleOpts(meta.title);
      o.scales = o.scales || {};
      o.scales.x = Object.assign({}, o.scales.x || {}, { title: axisTitleOpts(meta.x) });
      o.scales.y = Object.assign({}, o.scales.y || {}, { title: axisTitleOpts(meta.y) });
    }
    var plugins = config.plugins || [];
    if (labelFormats[id]) { plugins = plugins.concat([valueLabelsPlugin]); }
    config.plugins = plugins;
    charts[id] = new Chart(el(id), config);
  }

  function sizeWrap(wrapId, rowCount) {
    el(wrapId).style.height = Math.max(260, rowCount * 30 + 90) + 'px';
  }

  function drawEmpty(canvasId, wrapId) {
    sizeWrap(wrapId, 4);
    drawChart(canvasId, { type: 'bar', data: { labels: [], datasets: [] }, options: { responsive: true, maintainAspectRatio: false } });
  }

  function colorsFor(names, highlighted, hi, lo) {
    return names.map(function (n) { return highlighted.indexOf(n) >= 0 ? hi : lo; });
  }

  /* ---------- Chart.js plugins ---------- */

  // Writes a value next to each bar or point. The formatter for each chart is in labelFormats[canvasId].
  var valueLabelsPlugin = {
    id: 'valueLabels',
    afterDatasetsDraw: function (chart) {
      var format = labelFormats[chart.canvas.id];
      if (!chart.options.plugins.valueLabels || !format) { return; }
      var ctx = chart.ctx;
      var horizontal = chart.options.indexAxis === 'y';
      ctx.save();
      ctx.font = '12px ' + FONT_SANS;
      ctx.fillStyle = INK;
      chart.data.datasets.forEach(function (ds, di) {
        if (!chart.isDatasetVisible(di)) { return; }
        chart.getDatasetMeta(di).data.forEach(function (elm, i) {
          var v = ds.data[i];
          if (typeof v !== 'number') { return; }
          var text = format(v, i);
          if (horizontal) {
            ctx.textBaseline = 'middle';
            if (v < 0) { ctx.textAlign = 'right'; ctx.fillText(text, elm.x - 6, elm.y); }
            else { ctx.textAlign = 'left'; ctx.fillText(text, elm.x + 6, elm.y); }
          } else if (v < 0) {
            ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            ctx.fillText(text, elm.x, elm.y + 6);
          } else {
            ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillText(text, elm.x, elm.y - 6);
          }
        });
      });
      ctx.restore();
    }
  };

  // Writes each city's name and rank at both ends of a slope-chart line. Attached to the slope chart only.
  var seriesEndsPlugin = {
    id: 'seriesEnds',
    afterDatasetsDraw: function (chart) {
      var ctx = chart.ctx;
      ctx.save();
      ctx.font = '12px ' + FONT_SANS;
      ctx.textBaseline = 'middle';
      chart.data.datasets.forEach(function (ds, di) {
        var pts = chart.getDatasetMeta(di).data;
        if (pts.length < 2) { return; }
        var first = pts[0];
        var last = pts[pts.length - 1];
        ctx.fillStyle = ds.labelColor || INK;
        ctx.textAlign = 'right';
        ctx.fillText(ds.label + '  ' + ds.data[0], first.x - 10, first.y);
        ctx.textAlign = 'left';
        ctx.fillText(ds.data[1] + '  ' + ds.label, last.x + 10, last.y);
      });
      ctx.restore();
    }
  };

  // Draws a dashed vertical line at x = plugins.medianLine.x on the scatter chart only.
  var medianLinePlugin = {
    id: 'medianLine',
    afterDatasetsDraw: function (chart) {
      var opts = chart.options.plugins.medianLine;
      if (!opts || opts.x === null || opts.x === undefined) { return; }
      var xs = chart.scales.x;
      var ys = chart.scales.y;
      var px = xs.getPixelForValue(opts.x);
      var ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(px, ys.top);
      ctx.lineTo(px, ys.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = ACCENT;
      ctx.font = '12px ' + FONT_SANS;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(opts.label, px + 6, ys.top + 4);
      ctx.restore();
    }
  };

  /* ---------- Parsing ---------- */

  // RFC 4180 CSV: quoted fields may contain commas and doubled quotes.
  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var i = 0;
    var n = text.length;
    while (i < n) {
      var c = text.charAt(i);
      if (inQuotes) {
        if (c === '"') {
          if (text.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i += 1; continue;
        }
        field += c; i += 1; continue;
      }
      if (c === '"') { inQuotes = true; i += 1; continue; }
      if (c === ',') { row.push(field); field = ''; i += 1; continue; }
      if (c === '\r') { i += 1; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue; }
      field += c; i += 1;
    }
    if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
  }

  function loadData() {
    return fetch(CSV_URL).then(function (res) {
      if (!res.ok) { throw new Error('Could not load ' + CSV_URL + ' (HTTP ' + res.status + ').'); }
      return res.text();
    }).then(function (text) {
      var table = parseCSV(text);
      var header = table[0];
      var col = {};
      header.forEach(function (name, i) { col[name] = i; });
      var out = [];
      for (var r = 1; r < table.length; r++) {
        var f = table[r];
        if (f.length < header.length) { continue; }
        var price = numOrNull(f[col.sale_price]);
        var sp = dateParts(f[col.sale_date]);
        out.push({
          city: f[col.city] + ', ' + f[col.state],
          uni: f[col.university],
          price: price,
          valid: price !== null && price >= PRICE_MIN && price <= PRICE_MAX,
          beds: numOrNull(f[col.beds]),
          miles: numOrNull(f[col.miles_to_campus]),
          tax: numOrNull(f[col.tax_annual_amount]),
          area: numOrNull(f[col.living_area_sqft]),
          garage: numOrNull(f[col.has_garage]),
          basement: numOrNull(f[col.has_basement]),
          fireplace: numOrNull(f[col.has_fireplace]),
          lat: numOrNull(f[col.latitude]),
          lon: numOrNull(f[col.longitude]),
          listMs: dateMs(f[col.list_date]),
          contractMs: dateMs(f[col.contract_date]),
          saleYear: sp ? sp[0] : null,
          saleMonth: sp ? sp[1] : null
        });
      }
      return out;
    });
  }

  /* ---------- Shared lists ---------- */

  function setUpLists() {
    CITIES = Array.from(new Set(D.map(function (r) { return r.city; }))).sort(byName);
    CAMPUSES = Array.from(new Set(D.map(function (r) { return r.uni; }))).sort(byName);
    CITIES.forEach(function (c) {
      var rs = D.filter(function (r) { return r.city === c; });
      CITY_UNI[c] = rs[0].uni;
      CITY_CENTER[c] = [median(rs.map(function (r) { return r.lat; })), median(rs.map(function (r) { return r.lon; }))];
    });
    YEARS = Array.from(new Set(D.filter(function (r) { return r.saleYear !== null; })
      .map(function (r) { return r.saleYear; }))).sort(function (a, b) { return a - b; });
    YEARS.forEach(function (y) {
      var months = D.filter(function (r) { return r.saleYear === y; }).map(function (r) { return r.saleMonth; });
      var last = Math.max.apply(null, months);
      if (last < 12) { PARTIAL_YEAR_NOTE[y] = 'through ' + MONTHS[last - 1]; }
    });
  }

  function fillSelect(selectId, options, defaultValue) {
    var sel = el(selectId);
    sel.innerHTML = options.map(function (o) {
      return '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>';
    }).join('');
    var hasDefault = options.some(function (o) { return String(o.value) === String(defaultValue); });
    sel.value = hasDefault ? String(defaultValue) : String(options[0].value);
  }

  function fillGroupedSelect(selectId, groups, defaultValue) {
    var sel = el(selectId);
    sel.innerHTML = groups.map(function (g) {
      return '<optgroup label="' + esc(g.label) + '">' + g.options.map(function (o) {
        return '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
    sel.value = defaultValue;
  }

  function locationGroups() {
    return [
      { label: 'Campus areas', options: CAMPUSES.map(function (u) { return { value: 'campus:' + u, label: u }; }) },
      { label: 'Cities', options: CITIES.map(function (c) { return { value: 'city:' + c, label: c }; }) }
    ];
  }

  function parseLoc(v) {
    if (!v) { return null; }
    var i = v.indexOf(':');
    return { type: v.slice(0, i), name: v.slice(i + 1) };
  }

  function locLabel(loc) {
    if (!loc) { return 'all 18 cities'; }
    return loc.type === 'campus' ? 'the ' + loc.name + ' area' : loc.name;
  }

  /* ---------- Explore: filter state and matching ---------- */

  var DEFAULTS = {
    area: '', year: 'any', beds: 'any', pmin: '', pmax: '',
    amin: String(AREA_MIN), amax: String(AREA_MAX), gar: 'any', bas: 'any', fire: 'any'
  };

  function val(id) { return el(id).value; }

  function readFilters() {
    var errors = [];
    var pmin = numOrNull(val('f-pmin'));
    var pmax = numOrNull(val('f-pmax'));
    var amin = numOrNull(val('f-area-min'));
    var amax = numOrNull(val('f-area-max'));
    if (val('f-pmin').trim() !== '' && pmin === null) { errors.push('Type a number for the minimum price.'); }
    if (val('f-pmax').trim() !== '' && pmax === null) { errors.push('Type a number for the maximum price.'); }
    if (pmin !== null && pmin < 0) { errors.push('Prices cannot be negative.'); }
    if (pmax !== null && pmax < 0) { errors.push('Prices cannot be negative.'); }
    if (pmin !== null && pmax !== null && pmin > pmax) { errors.push('The minimum price is above the maximum price.'); }
    if (amin === null || amax === null) { errors.push('Type numbers for the living area limits.'); }
    if (amin !== null && amax !== null && amin > amax) { errors.push('The minimum living area is above the maximum.'); }
    var f = {
      errors: errors,
      loc: parseLoc(val('f-area')),
      year: val('f-year') === 'any' ? null : Number(val('f-year')),
      beds: val('f-beds'),
      pmin: pmin,
      pmax: pmax,
      amin: amin === null ? AREA_MIN : amin,
      amax: amax === null ? AREA_MAX : amax,
      gar: val('f-gar'),
      bas: val('f-bas'),
      fire: val('f-fire')
    };
    f.areaActive = f.amin > AREA_MIN || f.amax < AREA_MAX;
    return f;
  }

  // A home passes if it has a valid price and meets every active filter. Blank values are unknown:
  // they fail a filter that asks for "Has" or "No", and they fail a living-area limit once one is set.
  function passes(r, f, withLoc) {
    if (!r.valid) { return false; }
    if (withLoc && f.loc) {
      if (f.loc.type === 'city' && r.city !== f.loc.name) { return false; }
      if (f.loc.type === 'campus' && r.uni !== f.loc.name) { return false; }
    }
    if (f.year !== null && r.saleYear !== f.year) { return false; }
    if (f.beds !== 'any') {
      if (r.beds === null) { return false; }
      if (f.beds === '6+' ? r.beds < 6 : r.beds !== Number(f.beds)) { return false; }
    }
    if (f.pmin !== null && r.price < f.pmin) { return false; }
    if (f.pmax !== null && r.price > f.pmax) { return false; }
    if (f.areaActive) {
      if (!r.area) { return false; }
      if (f.amin > AREA_MIN && r.area < f.amin) { return false; }
      if (f.amax < AREA_MAX && r.area > f.amax) { return false; }
    }
    for (var key in FEATURE_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(FEATURE_FIELDS, key)) { continue; }
      if (f[key] !== 'any') {
        var v = r[FEATURE_FIELDS[key]];
        if (v === null) { return false; }
        if ((f[key] === 'yes') !== (v === 1)) { return false; }
      }
    }
    return true;
  }

  function describeFilters(f) {
    var parts = [];
    if (f.loc) { parts.push('in ' + locLabel(f.loc)); }
    if (f.year !== null) { parts.push('sold in ' + f.year); }
    if (f.beds !== 'any') { parts.push('with ' + (f.beds === '6+' ? '6 or more' : f.beds) + ' bedroom' + (f.beds === '1' ? '' : 's')); }
    if (f.pmin !== null && f.pmax !== null) { parts.push('priced ' + fmtUsd(f.pmin) + ' to ' + fmtUsd(f.pmax)); }
    else if (f.pmin !== null) { parts.push('priced at least ' + fmtUsd(f.pmin)); }
    else if (f.pmax !== null) { parts.push('priced up to ' + fmtUsd(f.pmax)); }
    if (f.areaActive) {
      var a = f.amin > AREA_MIN ? fmtInt(f.amin) : 'any';
      var b = f.amax < AREA_MAX ? fmtInt(f.amax) : 'no limit';
      parts.push('living area ' + a + ' to ' + b + ' sq ft');
    }
    var feat = { gar: ['with a garage', 'without a garage'], bas: ['with a basement', 'without a basement'], fire: ['with a fireplace', 'without a fireplace'] };
    ['gar', 'bas', 'fire'].forEach(function (k) {
      if (f[k] === 'yes') { parts.push(feat[k][0]); }
      if (f[k] === 'no') { parts.push(feat[k][1]); }
    });
    return parts.join(', ');
  }

  /* ---------- Explore: rendering ---------- */

  function renderExplore() {
    var f = readFilters();
    var error = el('filter-error');
    if (f.errors.length) {
      error.textContent = f.errors.join(' ');
      el('key-median').textContent = '—';
      el('key-count').textContent = '—';
      el('explore-summary').innerHTML = '<p class="error">Fix the filter above to see the results.</p>';
      writeHash(f);
      return;
    }
    error.textContent = '';

    var rows = D.filter(function (r) { return passes(r, f, true); });
    var prices = rows.map(function (r) { return r.price; });
    var med = median(prices);
    el('key-median').textContent = med === null ? 'No sales' : fmtUsd(med);
    el('key-count').textContent = fmtInt(rows.length);

    var described = describeFilters(f);
    var summary = rows.length
      ? '<p><strong>' + fmtInt(rows.length) + '</strong> ' + (rows.length === 1 ? 'sale matches' : 'sales match') +
        (described ? ' these filters: ' + esc(described) + '.' : ' (no filters are set).') + '</p>' +
        '<p>Median sale price: <strong>' + fmtUsd(med) + '</strong>.</p>'
      : '<p>No sales match these filters. Try a wider price range, another year, or fewer features.</p>';
    el('explore-summary').innerHTML = summary;

    renderExploreCharts(rows);
    renderResults(rows);
    updateMarkers(f);
    writeHash(f);
  }

  function renderExploreCharts(rows) {
    var yLabels = YEARS.map(yearLabel);
    var yCounts = YEARS.map(function (y) { return rows.filter(function (r) { return r.saleYear === y; }).length; });
    var yMed = YEARS.map(function (y) {
      var ps = rows.filter(function (r) { return r.saleYear === y; }).map(function (r) { return r.price; });
      return median(ps);
    });
    labelFormats['cx-year'] = function (v) { return fmtInt(v); };
    sizeWrap('wx-year', 4);
    drawChart('cx-year', {
      type: 'bar',
      data: { labels: yLabels, datasets: [{ label: 'Sales', data: yCounts, backgroundColor: QUIET_DARK }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 20 } },
        plugins: {
          legend: { display: false },
          valueLabels: true,
          tooltip: { callbacks: { label: function (ctx) {
            var i = ctx.dataIndex;
            return plural(yCounts[i], 'sale') + (yMed[i] === null ? '' : ', median ' + fmtUsd(yMed[i]));
          } } }
        },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'Sales' } } }
      }
    });

    var buckets = ['1', '2', '3', '4', '5', '6+'];
    var bMed = buckets.map(function (b) {
      var ps = rows.filter(function (r) {
        if (r.beds === null) { return false; }
        return b === '6+' ? r.beds >= 6 : r.beds === Number(b);
      }).map(function (r) { return r.price; });
      return median(ps);
    });
    var bN = buckets.map(function (b) {
      return rows.filter(function (r) {
        if (r.beds === null) { return false; }
        return b === '6+' ? r.beds >= 6 : r.beds === Number(b);
      }).length;
    });
    labelFormats['cx-beds'] = function (v) { return fmtUsd(v); };
    sizeWrap('wx-beds', 4);
    drawChart('cx-beds', {
      type: 'bar',
      data: {
        labels: buckets.map(function (b) { return b + (b === '1' ? ' bedroom' : ' bedrooms'); }),
        datasets: [{ label: 'Median sale price', data: bMed, backgroundColor: QUIET_DARK }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 20 } },
        plugins: {
          legend: { display: false },
          valueLabels: true,
          tooltip: { callbacks: { label: function (ctx) {
            var i = ctx.dataIndex;
            return bMed[i] === null ? 'No sales' : fmtUsd(bMed[i]) + ' from ' + plural(bN[i], 'sale');
          } } }
        },
        scales: { y: { beginAtZero: true, ticks: { maxTicksLimit: 6, callback: function (v) { return fmtUsd(v); } } } }
      }
    });
  }

  /* ---------- Explore: results table (sortable) ---------- */

  function renderResults(rows) {
    var groups = groupBy(rows, function (r) { return r.city; });
    resultRows = [];
    groups.forEach(function (rs, city) {
      var area = rs.map(function (r) { return r.area; }).filter(function (a) { return a; });
      var dom = rs.filter(function (r) { return r.listMs !== null && r.contractMs !== null; })
        .map(function (r) { return (r.contractMs - r.listMs) / DAY_MS; });
      resultRows.push({
        city: city,
        campus: CITY_UNI[city],
        n: rs.length,
        price: median(rs.map(function (r) { return r.price; })),
        area: median(area),
        dom: median(dom)
      });
    });
    drawResultsTable();
  }

  var RESULT_COLUMNS = [
    { key: 'city', label: 'City', text: true },
    { key: 'campus', label: 'Campus area', text: true, optional: true },
    { key: 'n', label: 'Sales' },
    { key: 'price', label: 'Median sale price' },
    { key: 'area', label: 'Median living area', optional: true },
    { key: 'dom', label: 'Median days on market' }
  ];

  // Two triangles: the active one is dark, the other is faint. "asc" shows the up one, "desc" the down one.
  function sortIcon(dir) {
    var state = dir === 'asc' ? 'asc' : dir === 'desc' ? 'desc' : 'none';
    return '<svg class="sort-icon ' + state + '" viewBox="0 0 12 14" width="12" height="14" aria-hidden="true" focusable="false">' +
      '<path class="up" d="M6 1 L11 6 H1 Z"/><path class="down" d="M6 13 L11 8 H1 Z"/></svg>';
  }

  function drawResultsTable() {
    var dir = resultSort.dir === 'asc' ? 1 : -1;
    var sorted = resultRows.slice().sort(function (a, b) {
      var x = a[resultSort.key];
      var y = b[resultSort.key];
      if (x === null && y === null) { return byName(a.city, b.city); }
      if (x === null) { return 1; }
      if (y === null) { return -1; }
      if (typeof x === 'string') { return dir * byName(x, y) || byName(a.city, b.city); }
      return dir * (x - y) || byName(a.city, b.city);
    });
    var head = '<thead><tr>' + RESULT_COLUMNS.map(function (c) {
      var active = c.key === resultSort.key;
      var aria = active ? (resultSort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
      var hcls = [c.optional ? 'optional' : '', c.text ? 'txt' : ''].join(' ').trim();
      return '<th scope="col"' + (hcls ? ' class="' + hcls + '"' : '') + ' aria-sort="' + aria + '">' +
        '<button type="button" data-sort="' + c.key + '">' + esc(c.label) + sortIcon(active ? resultSort.dir : null) + '</button></th>';
    }).join('') + '</tr></thead>';
    var body;
    if (!sorted.length) {
      body = '<tbody><tr><td colspan="' + RESULT_COLUMNS.length + '">No sales match these filters.</td></tr></tbody>';
    } else {
      body = '<tbody>' + sorted.map(function (r) {
        return '<tr>' + RESULT_COLUMNS.map(function (c) {
          var cell;
          if (c.key === 'city' || c.key === 'campus') { cell = r[c.key]; }
          else if (c.key === 'n') { cell = fmtInt(r.n); }
          else if (c.key === 'price') { cell = dash(r.price, fmtUsd); }
          else if (c.key === 'area') { cell = dash(r.area, fmtSqft); }
          else { cell = dash(r.dom, fmtDays); }
          var cls = [c.optional ? 'optional' : '', c.text ? 'txt' : ''].join(' ').trim();
          return '<td data-label="' + esc(c.label) + '"' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(cell) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody>';
    }
    el('t-results').innerHTML = head + body;
    el('t-results').classList.add('stack-sm');
  }

  /* ---------- Explore: map ---------- */

  function initMap() {
    if (!mapReady()) {
      el('map').innerHTML = '<p class="error" style="padding:1rem">The map could not load. Use the campus or city filter instead.</p>';
      return;
    }
    map = L.map('map', { scrollWheelZoom: false, attributionControl: true });
    mapTiles = L.tileLayer(MAP_TILES[currentTheme()], { attribution: MAP_ATTRIBUTION, subdomains: 'abcd', maxZoom: 18 });
    mapTiles.addTo(map);
    var lats = CITIES.map(function (c) { return CITY_CENTER[c][0]; });
    var lons = CITIES.map(function (c) { return CITY_CENTER[c][1]; });
    map.fitBounds([[Math.min.apply(null, lats), Math.min.apply(null, lons)],
                   [Math.max.apply(null, lats), Math.max.apply(null, lons)]], { padding: [24, 24] });
    CITIES.forEach(function (c) {
      var m = L.circleMarker(CITY_CENTER[c], { radius: 8, weight: 1.5, color: INK, fillOpacity: 0.7 });
      m.bindTooltip(c);
      m.on('click', function () {
        setLocation('city:' + c);
      });
      m.addTo(map);
      markers[c] = m;
    });
    updateMarkers(readFilters());
  }

  function updateMapTheme() {
    if (!map || !mapTiles) { return; }
    mapTiles.setUrl(MAP_TILES[currentTheme()]);
  }

  function updateMarkers(f) {
    if (!map) { return; }
    var totals = CITIES.map(function (c) { return D.filter(function (r) { return r.city === c && r.valid; }).length; });
    var maxTotal = Math.max.apply(null, totals);
    CITIES.forEach(function (c, i) {
      var m = markers[c];
      if (!m) { return; }
      var rows = D.filter(function (r) { return r.city === c && passes(r, f, false); });
      var selected = f.loc && f.loc.type === 'city' && f.loc.name === c;
      var inCampus = f.loc && f.loc.type === 'campus' && f.loc.name === CITY_UNI[c];
      var fill = selected ? ACCENT : inCampus ? ACCENT_LIGHT : QUIET_DARK;
      var none = rows.length === 0;
      m.setStyle({
        radius: 6 + 12 * Math.sqrt(totals[i] / maxTotal),
        fillColor: none ? QUIET : fill,
        fillOpacity: none ? 0.25 : 0.8,
        color: INK,
        weight: selected ? 3 : 1.5
      });
      m.setTooltipContent(c + ': ' + plural(rows.length, 'sale') + (rows.length ? ', median ' + fmtUsd(median(rows.map(function (r) { return r.price; }))) : '') + ' under these filters');
    });
  }

  function setLocation(value) {
    el('f-area').value = value;
    renderExplore();
    el('explore-summary').scrollIntoView({ block: 'nearest' });
  }

  /* ---------- Explore: living-area slider and number inputs ---------- */

  // Keeps the two sliders and the two number inputs in step. The source is the control the visitor changed.
  // rewriteSource is false while a number is still being typed, so typing is not disturbed; it is true on
  // slider moves and when a typed number is committed (blur or Enter), so the typed value is clamped.
  function syncArea(sourceId, rewriteSource) {
    var src = el(sourceId);
    var raw = src.value.trim();
    var v = raw === '' ? NaN : Number(raw);
    if (isNaN(v)) { renderExplore(); return; }
    var minR = el('f-area-min-range');
    var maxR = el('f-area-max-range');
    var minN = el('f-area-min');
    var maxN = el('f-area-max');
    var isMin = sourceId === 'f-area-min-range' || sourceId === 'f-area-min';
    var other;
    if (isMin) {
      other = numOrNull(maxN.value) !== null ? Number(maxN.value) : Number(maxR.value);
    } else {
      other = numOrNull(minN.value) !== null ? Number(minN.value) : Number(minR.value);
    }
    var mine = Math.min(AREA_MAX, Math.max(AREA_MIN, v));
    if (isMin && mine > other) { mine = other; }
    if (!isMin && mine < other) { mine = other; }
    var min = isMin ? mine : other;
    var max = isMin ? other : mine;
    minR.value = String(min);
    maxR.value = String(max);
    if (rewriteSource) { src.value = String(mine); }
    if (sourceId !== 'f-area-min') { minN.value = String(min); }
    if (sourceId !== 'f-area-max') { maxN.value = String(max); }
    renderExplore();
  }

  /* ---------- Explore: shareable link ---------- */

  function currentParams(f) {
    var p = new URLSearchParams();
    function put(key, value, def) { if (String(value) !== def) { p.set(key, String(value)); } }
    put('area', val('f-area'), DEFAULTS.area);
    put('year', val('f-year'), DEFAULTS.year);
    put('beds', val('f-beds'), DEFAULTS.beds);
    put('pmin', val('f-pmin').trim(), DEFAULTS.pmin);
    put('pmax', val('f-pmax').trim(), DEFAULTS.pmax);
    put('amin', val('f-area-min').trim(), DEFAULTS.amin);
    put('amax', val('f-area-max').trim(), DEFAULTS.amax);
    put('gar', val('f-gar'), DEFAULTS.gar);
    put('bas', val('f-bas'), DEFAULTS.bas);
    put('fire', val('f-fire'), DEFAULTS.fire);
    put('ca', val('cmp-a'), 'campus:University of Michigan');
    put('cb', val('cmp-b'), 'city:Champaign, IL');
    return p;
  }

  function writeHash(f) {
    var s = currentParams(f).toString();
    var url = window.location.pathname + window.location.search + (s ? '#' + s : '');
    try { window.history.replaceState(null, '', url); } catch (e) { /* ignore: the address bar just keeps its old value */ }
  }

  function applyHash() {
    var p = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    function has(key) { return p.has(key); }
    function selectHas(id, value) {
      return Array.prototype.some.call(el(id).options, function (o) { return o.value === value; });
    }
    if (has('area') && selectHas('f-area', p.get('area'))) { el('f-area').value = p.get('area'); }
    if (has('year') && selectHas('f-year', p.get('year'))) { el('f-year').value = p.get('year'); }
    if (has('beds') && selectHas('f-beds', p.get('beds'))) { el('f-beds').value = p.get('beds'); }
    if (has('pmin')) { el('f-pmin').value = p.get('pmin'); }
    if (has('pmax')) { el('f-pmax').value = p.get('pmax'); }
    if (has('amin')) { el('f-area-min').value = p.get('amin'); el('f-area-min-range').value = p.get('amin'); }
    if (has('amax')) { el('f-area-max').value = p.get('amax'); el('f-area-max-range').value = p.get('amax'); }
    if (has('gar') && selectHas('f-gar', p.get('gar'))) { el('f-gar').value = p.get('gar'); }
    if (has('bas') && selectHas('f-bas', p.get('bas'))) { el('f-bas').value = p.get('bas'); }
    if (has('fire') && selectHas('f-fire', p.get('fire'))) { el('f-fire').value = p.get('fire'); }
    if (has('ca') && selectHas('cmp-a', p.get('ca'))) { el('cmp-a').value = p.get('ca'); }
    if (has('cb') && selectHas('cmp-b', p.get('cb'))) { el('cmp-b').value = p.get('cb'); }
  }

  function resetFilters() {
    el('f-area').value = DEFAULTS.area;
    el('f-year').value = DEFAULTS.year;
    el('f-beds').value = DEFAULTS.beds;
    el('f-pmin').value = '';
    el('f-pmax').value = '';
    el('f-area-min').value = DEFAULTS.amin;
    el('f-area-max').value = DEFAULTS.amax;
    el('f-area-min-range').value = DEFAULTS.amin;
    el('f-area-max-range').value = DEFAULTS.amax;
    el('f-gar').value = DEFAULTS.gar;
    el('f-bas').value = DEFAULTS.bas;
    el('f-fire').value = DEFAULTS.fire;
    renderExplore();
  }

  function copyLink() {
    var status = el('copy-status');
    var url = window.location.href;
    function done(ok) {
      status.textContent = ok ? 'Link copied.' : 'Copy the address from the address bar to share this view.';
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { done(true); }, function () { done(false); });
    } else {
      done(false);
    }
  }

  /* ---------- Compare ---------- */

  function itemMatch(r, item) {
    return item.type === 'campus' ? r.uni === item.name : r.city === item.name;
  }

  function renderCompare() {
    var f = readFilters();
    if (f.errors.length) {
      setError('a-compare', 'Fix the filter errors in the Explore section to compare.');
      drawEmpty('c-compare', 'wc');
      el('t-compare').innerHTML = '';
      return;
    }
    var itemA = parseLoc(val('cmp-a'));
    var itemB = parseLoc(val('cmp-b'));
    function stats(item) {
      var rows = D.filter(function (r) { return passes(r, f, false) && itemMatch(r, item); });
      return {
        name: item.name,
        n: rows.length,
        price: median(rows.map(function (r) { return r.price; })),
        area: median(rows.map(function (r) { return r.area; }).filter(function (a) { return a; })),
        dom: median(rows.filter(function (r) { return r.listMs !== null && r.contractMs !== null; })
          .map(function (r) { return (r.contractMs - r.listMs) / DAY_MS; }))
      };
    }
    var A = stats(itemA);
    var B = stats(itemB);

    var lines = [];
    if (A.n === 0 || B.n === 0) {
      lines.push('One of the two areas has no sales under these filters.');
    } else {
      var diff = (B.price - A.price) / A.price * 100;
      var dir = diff > 0 ? 'higher' : diff < 0 ? 'lower' : 'the same';
      lines.push('<strong>' + esc(A.name) + '</strong> has ' + fmtInt(A.n) + ' sales with a median sale price of <strong>' + fmtUsd(A.price) + '</strong>.');
      lines.push('<strong>' + esc(B.name) + '</strong> has ' + fmtInt(B.n) + ' sales with a median sale price of <strong>' + fmtUsd(B.price) + '</strong>.');
      if (diff === 0) {
        lines.push('The two medians are the same.');
      } else {
        lines.push('The median for ' + esc(B.name) + ' is <strong>' + fmtPct(Math.abs(diff), false) + '</strong> ' + dir + ' than for ' + esc(A.name) + '.');
      }
    }
    setAnswer('a-compare', lines);

    var rowsOut = [
      ['Sales', fmtInt(A.n), fmtInt(B.n)],
      ['Median sale price', dash(A.price, fmtUsd), dash(B.price, fmtUsd)],
      ['Median living area', dash(A.area, fmtSqft), dash(B.area, fmtSqft)],
      ['Median days on market', dash(A.dom, fmtDays), dash(B.dom, fmtDays)]
    ];
    fillTable('t-compare', ['Measure', A.name, B.name], rowsOut);

    labelFormats['c-compare'] = function (v) { return fmtUsd(v); };
    sizeWrap('wc', 2);
    el('wc').style.height = '260px';
    drawChart('c-compare', {
      type: 'bar',
      data: {
        labels: [A.name, B.name],
        datasets: [{ label: 'Median sale price', data: [A.price, B.price],
                     backgroundColor: [QUIET_DARK, TEAL], borderRadius: 4 }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 90 } },
        plugins: {
          legend: { display: false },
          valueLabels: true,
          tooltip: { callbacks: { label: function (ctx) {
            var s = ctx.dataIndex === 0 ? A : B;
            return fmtUsd(s.price) + ' from ' + plural(s.n, 'sale');
          } } }
        },
        scales: { x: { beginAtZero: true, ticks: { maxTicksLimit: 6, callback: function (v) { return fmtUsd(v); } } } }
      }
    });
  }

  /* ---------- Insights P1: the valid price rule ---------- */

  function renderP1() {
    var all = D.filter(function (r) { return r.price !== null; });
    var valid = all.filter(function (r) { return r.valid; });
    var below = all.filter(function (r) { return r.price < PRICE_MIN; });
    var above = all.filter(function (r) { return r.price > PRICE_MAX; });
    var removed = all.length - valid.length;
    var allG = groupBy(all, function (r) { return r.city; });
    var validG = groupBy(valid, function (r) { return r.city; });
    var cities = Array.from(allG.keys()).sort(byName);
    var meanB = {};
    var meanA = {};
    cities.forEach(function (c) {
      meanB[c] = mean(allG.get(c).map(function (r) { return r.price; }));
      meanA[c] = mean(validG.get(c).map(function (r) { return r.price; }));
    });
    function rankOf(city, means) {
      var higher = 0;
      cities.forEach(function (other) { if (means[other] > means[city]) { higher += 1; } });
      return higher + 1;
    }
    var rows = cities.map(function (c) {
      var pb = allG.get(c).map(function (r) { return r.price; });
      var pa = (validG.get(c) || []).map(function (r) { return r.price; });
      var medB = median(pb);
      var medA = median(pa);
      return {
        name: c, removed: pb.length - pa.length,
        mb: meanB[c], ma: meanA[c], medB: medB, medA: medA,
        rb: rankOf(c, meanB), ra: rankOf(c, meanA),
        mchg: (meanA[c] - meanB[c]) / meanB[c] * 100,
        medchg: (medA - medB) / medB * 100
      };
    });
    rows.sort(function (a, b) { return a.rb - b.rb; });

    var allPrices = all.map(function (r) { return r.price; });
    var validPrices = valid.map(function (r) { return r.price; });
    var wholeMeanB = mean(allPrices);
    var wholeMeanA = mean(validPrices);
    var wholeMedB = median(allPrices);
    var wholeMedA = median(validPrices);
    var wholeMeanChg = (wholeMeanA - wholeMeanB) / wholeMeanB * 100;
    var maxRow = all.reduce(function (a, b) { return b.price > a.price ? b : a; });
    var minRow = all.reduce(function (a, b) { return b.price < a.price ? b : a; });
    var changed = rows.filter(function (r) { return r.rb !== r.ra; });
    var bigMean = extremes(rows.map(function (r) { return { name: r.name, value: Math.abs(r.mchg), row: r }; }), true, 1)[0].row;
    var bigMed = extremes(rows.map(function (r) { return { name: r.name, value: Math.abs(r.medchg), row: r }; }), true, 1)[0].row;
    var maxMedAbs = Math.abs(bigMed.medchg);

    var medSame = roundHalfUp(wholeMedA, 0) === roundHalfUp(wholeMedB, 0);
    var p = [];
    p.push('The data description sheet lists impossible prices: ' + plural(below.length, 'sale') + ' under $10,000, including one at ' +
      fmtUsd(minRow.price) + ', and ' + fmtInt(above.length) + ' over $5,000,000, up to ' + fmtUsd(maxRow.price) +
      '. The valid price rule keeps sales from $10,000 to $5,000,000, inclusive, and removes the other <strong>' +
      fmtInt(removed) + '</strong> rows. The rule is applied everywhere except Q2, Q3 and Q9, which use all rows as their questions state. No row is deleted from the dataset; the rule only changes which sales are counted.');
    p.push('<strong>Means moved; medians barely did.</strong> Across the whole dataset the mean falls from ' + fmtUsd(wholeMeanB) +
      ' to ' + fmtUsd(wholeMeanA) + ', a change of ' + fmtPct(wholeMeanChg, false) + '. The median ' +
      (medSame ? 'stays at ' + fmtUsd(wholeMedB) + '.' : 'moves from ' + fmtUsd(wholeMedB) + ' to ' + fmtUsd(wholeMedA) + '.') +
      ' Per city, no median moves by more than ' + fmtPct(maxMedAbs, false) + '. ' + esc(bigMean.name) + '\'s mean moves the most, ' +
      fmtPct(bigMean.mchg, true) + ', from ' + fmtUsd(bigMean.mb) + ' to ' + fmtUsd(bigMean.ma) + '.' +
      (maxRow.city === bigMean.name ? ' Its ' + fmtInt(bigMean.removed) + ' removed sales include the highest price in the dataset, ' + fmtUsd(maxRow.price) + '.' : ''));
    if (changed.length) {
      p.push(changed.length === 1 ? 'One city changes rank by mean: ' : changed.length + ' cities change rank by mean: ' +
        changed.map(function (r) { return esc(r.name) + ' (' + ordinal(r.rb) + ' to ' + ordinal(r.ra) + ')'; }).join(', ') + '.');
    } else {
      p.push('No city changes rank by mean.');
    }
    p.push('<strong>What the rule cannot fix.</strong> It only removes prices outside a fixed range. A wrong price inside the range, such as a $600,000 entry that should read $60,000, stays in the data and still affects the results. The rule also leaves the other problems in the sheet alone: blank dates, addresses shared by several units, and an unreliable home type. A mean responds to any single sale, which is why the results on this page use medians except where a question asks for a mean.');
    setAnswer('ap1-text', p);

    var headers = ['City', 'Sales removed', 'Mean, before', 'Mean, after', 'Median, before', 'Median, after', 'Rank by mean, before', 'Rank by mean, after'];
    var tableRows = [['All cities', fmtInt(removed), fmtUsd(wholeMeanB), fmtUsd(wholeMeanA), fmtUsd(wholeMedB), fmtUsd(wholeMedA), '—', '—']];
    rows.forEach(function (r) {
      tableRows.push([r.name, fmtInt(r.removed), fmtUsd(r.mb), fmtUsd(r.ma), fmtUsd(r.medB), fmtUsd(r.medA), String(r.rb), String(r.ra)]);
    });
    fillTable('tp1', headers, tableRows);

    var names = rows.map(function (r) { return r.name; });
    sizeWrap('wp1', rows.length);
    drawChart('cp1', {
      type: 'bar',
      data: {
        labels: names,
        datasets: [
          { label: 'Mean, all rows (before)', data: rows.map(function (r) { return r.mb; }), backgroundColor: QUIET_DARK },
          { label: 'Mean, valid prices (after)', data: rows.map(function (r) { return r.ma; }), backgroundColor: TEAL }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: {
            label: function (ctx) { return ctx.dataset.label + ': ' + fmtUsd(ctx.parsed.x); },
            footer: function (items) {
              var r = rows[items[0].dataIndex];
              return plural(r.removed, 'sale') + ' removed; rank ' + r.rb + ' to ' + r.ra;
            }
          } }
        },
        scales: { x: { beginAtZero: true, ticks: { maxTicksLimit: 6, callback: function (v) { return fmtUsd(v); } } } }
      }
    });
  }

  /* ---------- Q1 to Q6 (always the full dataset) ---------- */

  function renderQ1() {
    var valid = D.filter(function (r) { return r.valid; });
    var rows = [];
    groupBy(valid, function (r) { return r.city; }).forEach(function (rs, city) {
      rows.push({ name: city, value: median(rs.map(function (r) { return r.price; })), n: rs.length });
    });
    rows.sort(function (a, b) { return b.value - a.value; });

    var top = extremes(rows, true, 0);
    var topNames = top.map(function (r) { return r.name; });
    var next = rows.filter(function (r) { return topNames.indexOf(r.name) < 0; })[0];
    var first = top[0];
    var lead = '<strong>' + esc(joinNames(topNames)) + '</strong> ' +
      (top.length > 1 ? 'tie for' : 'has') + ' the highest median sale price, at <strong>' +
      fmtUsd(first.value) + '</strong>' +
      (top.length === 1 ? ' from ' + plural(first.n, 'valid sale') + '.' : '.');
    var tail = next ? ' The next highest is ' + esc(next.name) + ' at ' + fmtUsd(next.value) + '.' : '';
    setAnswer('a1', [lead + tail]);

    fillTable('t1', ['City', 'Median sale price', 'Valid sales'], rows.map(function (r) {
      return [r.name, fmtUsd(r.value), fmtInt(r.n)];
    }));

    labelFormats.c1 = function (v) { return fmtUsd(v); };
    sizeWrap('w1', rows.length);
    drawChart('c1', {
      type: 'bar',
      data: {
        labels: rows.map(function (r) { return r.name; }),
        datasets: [{
          label: 'Median sale price',
          data: rows.map(function (r) { return r.value; }),
          backgroundColor: colorsFor(rows.map(function (r) { return r.name; }), topNames, ACCENT, QUIET)
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 90 } },
        plugins: {
          legend: { display: false },
          valueLabels: true,
          tooltip: { callbacks: { label: function (ctx) {
            var r = rows[ctx.dataIndex];
            return fmtUsd(r.value) + ' from ' + plural(r.n, 'valid sale');
          } } }
        },
        scales: { x: { ticks: { maxTicksLimit: 6, callback: function (v) { return fmtUsd(v); } } } }
      }
    });
  }

  function renderQ2() {
    var all = D.filter(function (r) { return r.price !== null; });
    var rows = [];
    groupBy(all, function (r) { return r.city; }).forEach(function (rs, city) {
      var prices = rs.map(function (r) { return r.price; });
      var m = mean(prices);
      var md = median(prices);
      rows.push({ name: city, mean: m, median: md, value: (m - md) / md * 100, n: prices.length, prices: prices });
    });
    rows.sort(function (a, b) { return b.value - a.value; });

    var top = extremes(rows, true, 1);
    var top0 = top[0];
    var big = top0.prices.filter(function (p) { return p > PRICE_MAX; }).length;
    var maxPrice = Math.max.apply(null, top0.prices);
    var lead = '<strong>' + esc(joinNames(top.map(function (r) { return r.name; }))) + '</strong> ' +
      (top.length > 1 ? 'tie for' : 'has') + ' the largest gap: its mean of ' + fmtUsd(top0.mean) +
      ' is <strong>' + fmtPct(top0.value, false) + '</strong> above its median of ' + fmtUsd(top0.median) + '.';
    var cause = 'The cause is a few extreme prices: ' + fmtInt(big) + ' of its ' +
      fmtInt(top0.n) + ' sales ' + (big === 1 ? 'is' : 'are') + ' above $5,000,000, and the largest is ' + fmtUsd(maxPrice) +
      '. Sales that far above the median pull the mean up, but the median is the middle value and stays put.';
    setAnswer('a2', [lead, cause]);

    fillTable('t2', ['City', 'Mean sale price', 'Median sale price', 'Gap above median', 'Sales (all rows)'], rows.map(function (r) {
      return [r.name, fmtUsd(r.mean), fmtUsd(r.median), fmtPct(r.value, false), fmtInt(r.n)];
    }));

    var names = rows.map(function (r) { return r.name; });
    var hi = top.map(function (r) { return r.name; });
    sizeWrap('w2', rows.length);
    drawChart('c2', {
      type: 'bar',
      data: {
        labels: names,
        datasets: [
          { label: 'Mean', data: rows.map(function (r) { return r.mean; }), backgroundColor: colorsFor(names, hi, ACCENT, QUIET) },
          { label: 'Median', data: rows.map(function (r) { return r.median; }), backgroundColor: colorsFor(names, hi, ACCENT_LIGHT, QUIET_LIGHT) }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: function (ctx) { return ctx.dataset.label + ': ' + fmtUsd(ctx.parsed.x); },
              footer: function (items) {
                var r = rows[items[0].dataIndex];
                return 'Mean is ' + fmtPct(r.value, false) + ' above median (' + plural(r.n, 'sale') + ')';
              }
            }
          }
        },
        scales: { x: { ticks: { maxTicksLimit: 6, callback: function (v) { return fmtUsd(v); } } } }
      }
    });
  }

  function renderQ3() {
    var all = D.filter(function (r) { return r.price !== null; });
    var allG = groupBy(all, function (r) { return r.city; });
    var validG = groupBy(D.filter(function (r) { return r.valid; }), function (r) { return r.city; });
    var cities = [];
    var meanAll = {};
    var meanValid = {};
    var invalid = {};
    allG.forEach(function (rs, city) {
      cities.push(city);
      meanAll[city] = mean(rs.map(function (r) { return r.price; }));
      var vs = validG.get(city) || [];
      meanValid[city] = mean(vs.map(function (r) { return r.price; }));
      invalid[city] = rs.length - vs.length;
    });
    function rankOf(city, means) {
      var higher = 0;
      cities.forEach(function (other) { if (means[other] > means[city]) { higher += 1; } });
      return higher + 1;
    }
    var rows = cities.map(function (c) {
      return { name: c, all: rankOf(c, meanAll), valid: rankOf(c, meanValid), invalid: invalid[c] };
    });
    rows.sort(function (a, b) { return a.all - b.all; });

    var changed = rows.filter(function (r) { return r.all !== r.valid; });
    var parts = changed.map(function (r) {
      var places = Math.abs(r.all - r.valid);
      var dir = r.valid < r.all ? 'up' : 'down';
      return esc(r.name) + ' moves from ' + ordinal(r.all) + ' to ' + ordinal(r.valid) + ' (' +
        places + ' place' + (places === 1 ? '' : 's') + ' ' + dir + '; ' +
        plural(r.invalid, 'sale') + ' outside the valid price range)';
    });
    var intro = changed.length === 0
      ? 'No city changes rank.'
      : (changed.length === 1 ? 'One city changes rank: ' : changed.length + ' cities change rank: ') +
        parts.join('; ') + '.';
    setAnswer('a3', [intro + ' The other ' + fmtInt(rows.length - changed.length) + ' cities keep their rank.']);

    fillTable('t3', ['City', 'Rank, all rows', 'Rank, valid prices', 'Change'], rows.map(function (r) {
      var d = r.all - r.valid;
      return [r.name, String(r.all), String(r.valid), d === 0 ? 'no change' : (d > 0 ? '+' : '') + d + ' (' + (d > 0 ? 'up' : 'down') + ')'];
    }));

    var changedNames = changed.map(function (r) { return r.name; });
    sizeWrap('w3', rows.length);
    drawChart('c3', {
      type: 'line',
      data: {
        labels: ['All rows', 'Valid prices only'],
        datasets: rows.map(function (r) {
          var hi = changedNames.indexOf(r.name) >= 0;
          return {
            label: r.name,
            labelColor: hi ? ACCENT : INK,
            data: [r.all, r.valid],
            borderColor: hi ? ACCENT : QUIET,
            backgroundColor: hi ? ACCENT : QUIET,
            borderWidth: hi ? 2.5 : 1.5,
            pointRadius: hi ? 4 : 3,
            tension: 0
          };
        })
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { left: 190, right: 190, top: 10, bottom: 10 } },
        interaction: { mode: 'nearest', intersect: true },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (ctx) {
            return ctx.dataset.label + ': rank ' + ctx.parsed.y;
          } } }
        },
        scales: {
          y: { reverse: true, min: 0.5, max: rows.length + 0.5, display: false, grid: { display: false } },
          x: { grid: { display: false }, ticks: { font: { weight: '600' } } }
        }
      },
      plugins: [seriesEndsPlugin]
    });
  }

  function renderQ4() {
    var valid = D.filter(function (r) { return r.valid && (r.saleYear === 2024 || r.saleYear === 2025); });
    var rows = [];
    groupBy(valid, function (r) { return r.uni; }).forEach(function (rs, uni) {
      var p24 = rs.filter(function (r) { return r.saleYear === 2024; }).map(function (r) { return r.price; });
      var p25 = rs.filter(function (r) { return r.saleYear === 2025; }).map(function (r) { return r.price; });
      if (!p24.length || !p25.length) { return; }
      var m24 = median(p24);
      var m25 = median(p25);
      rows.push({ name: uni, m24: m24, m25: m25, n24: p24.length, n25: p25.length, value: (m25 - m24) / m24 * 100 });
    });
    rows.sort(function (a, b) { return b.value - a.value; });

    var inc = extremes(rows, true, 1);
    var decreases = rows.filter(function (r) { return roundHalfUp(r.value, 1) < 0; });
    var rises = rows.length - decreases.length;
    var first = inc[0];
    var paragraphs = [
      '<strong>Largest increase:</strong> ' + esc(joinNames(inc.map(function (r) { return r.name; }))) +
        ', <strong>' + fmtPct(first.value, true) + '</strong> (median ' + fmtUsd(first.m24) + ' in 2024, ' +
        fmtUsd(first.m25) + ' in 2025).'
    ];
    if (decreases.length) {
      paragraphs.push('<strong>Decrease' + (decreases.length > 1 ? 's' : '') + ':</strong> ' +
        decreases.map(function (r) {
          return esc(r.name) + ' (' + fmtPct(r.value, false) + ', from ' + fmtUsd(r.m24) + ' to ' + fmtUsd(r.m25) + ')';
        }).join('; ') + '.');
    } else {
      paragraphs.push('<strong>Decreases:</strong> none.');
    }
    paragraphs.push('Of the ' + rows.length + ' campus areas, ' + rises + ' rose and ' + decreases.length + ' fell.');
    setAnswer('a4', paragraphs);

    fillTable('t4', ['Campus area', 'Median 2024', 'Median 2025', 'Change', 'Sales 2024', 'Sales 2025'], rows.map(function (r) {
      return [r.name, fmtUsd(r.m24), fmtUsd(r.m25), fmtPct(r.value, true), fmtInt(r.n24), fmtInt(r.n25)];
    }));

    var hi = inc.map(function (r) { return r.name; }).concat(decreases.map(function (r) { return r.name; }));
    var names = rows.map(function (r) { return r.name; });
    labelFormats.c4 = function (v) { return fmtPct(v, true); };
    sizeWrap('w4', rows.length);
    drawChart('c4', {
      type: 'bar',
      data: {
        labels: names,
        datasets: [{ label: 'Change in median sale price', data: rows.map(function (r) { return r.value; }),
                     backgroundColor: colorsFor(names, hi, ACCENT, QUIET) }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { left: 10, right: 70 } },
        plugins: {
          legend: { display: false },
          valueLabels: true,
          tooltip: { callbacks: { label: function (ctx) {
            var r = rows[ctx.dataIndex];
            return fmtUsd(r.m24) + ' (2024) to ' + fmtUsd(r.m25) + ' (2025)';
          } } }
        },
        scales: { x: { ticks: { callback: function (v) { return fmtDec(v, 1) + '%'; } } } }
      }
    });
  }

  function renderQ5() {
    var valid = D.filter(function (r) { return r.valid && r.listMs !== null && r.contractMs !== null; });
    var rows = [];
    groupBy(valid, function (r) { return r.uni; }).forEach(function (rs, uni) {
      var days = rs.map(function (r) { return (r.contractMs - r.listMs) / DAY_MS; });
      rows.push({ name: uni, value: median(days), n: days.length });
    });
    rows.sort(function (a, b) { return a.value - b.value; });

    var slow = extremes(rows, true, 1);
    var fast = extremes(rows, false, 1);
    setAnswer('a5', [
      '<strong>Slowest:</strong> ' + esc(joinNames(slow.map(function (r) { return r.name; }))) +
        ', with a median of <strong>' + fmtDays(slow[0].value) + '</strong> on the market.',
      '<strong>Fastest:</strong> ' + esc(joinNames(fast.map(function (r) { return r.name; }))) +
        ', with a median of <strong>' + fmtDays(fast[0].value) + '</strong> on the market.'
    ]);

    fillTable('t5', ['Campus area', 'Median days on market', 'Sales used'], rows.map(function (r) {
      return [r.name, fmtDays(r.value), fmtInt(r.n)];
    }));

    var hi = slow.concat(fast).map(function (r) { return r.name; });
    var names = rows.map(function (r) { return r.name; });
    labelFormats.c5 = function (v) { return fmtDays(v); };
    sizeWrap('w5', rows.length);
    drawChart('c5', {
      type: 'bar',
      data: {
        labels: names,
        datasets: [{ label: 'Median days on market', data: rows.map(function (r) { return r.value; }),
                     backgroundColor: colorsFor(names, hi, ACCENT, QUIET) }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 90 } },
        plugins: {
          legend: { display: false },
          valueLabels: true,
          tooltip: { callbacks: { label: function (ctx) {
            return 'Sales used: ' + fmtInt(rows[ctx.dataIndex].n);
          } } }
        },
        scales: { x: { beginAtZero: true, title: { display: true, text: 'Days from listing to contract' } } }
      }
    });
  }

  function renderQ6() {
    var valid = D.filter(function (r) { return r.valid && r.tax !== null && r.tax > 0 && r.tax < r.price; });
    var rows = [];
    groupBy(valid, function (r) { return r.uni; }).forEach(function (rs, uni) {
      var pct = rs.map(function (r) { return r.tax / r.price * 100; });
      rows.push({ name: uni, value: median(pct), n: pct.length });
    });
    rows.sort(function (a, b) { return b.value - a.value; });

    var hiBurden = extremes(rows, true, 1);
    var loBurden = extremes(rows, false, 1);
    setAnswer('a6', [
      '<strong>Highest tax burden:</strong> ' + esc(joinNames(hiBurden.map(function (r) { return r.name; }))) +
        ', at <strong>' + fmtPct(hiBurden[0].value, false) + '</strong> of the sale price.',
      '<strong>Lowest tax burden:</strong> ' + esc(joinNames(loBurden.map(function (r) { return r.name; }))) +
        ', at <strong>' + fmtPct(loBurden[0].value, false) + '</strong>.'
    ]);

    fillTable('t6', ['Campus area', 'Median tax as % of sale price', 'Sales used'], rows.map(function (r) {
      return [r.name, fmtPct(r.value, false), fmtInt(r.n)];
    }));

    var hi = hiBurden.concat(loBurden).map(function (r) { return r.name; });
    var names = rows.map(function (r) { return r.name; });
    labelFormats.c6 = function (v) { return fmtPct(v, false); };
    sizeWrap('w6', rows.length);
    drawChart('c6', {
      type: 'bar',
      data: {
        labels: names,
        datasets: [{ label: 'Median tax as % of sale price', data: rows.map(function (r) { return r.value; }),
                     backgroundColor: colorsFor(names, hi, ACCENT, QUIET) }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 70 } },
        plugins: {
          legend: { display: false },
          valueLabels: true,
          tooltip: { callbacks: { label: function (ctx) {
            return 'Sales used: ' + fmtInt(rows[ctx.dataIndex].n);
          } } }
        },
        scales: { x: { beginAtZero: true, ticks: { callback: function (v) { return fmtDec(v, 1) + '%'; } } } }
      }
    });
  }

  /* ---------- Q7 to Q10 (their own controls, full dataset) ---------- */

  function renderQ7() {
    var beds = Number(el('q7-beds').value);
    var valid = D.filter(function (r) { return r.valid && r.beds === beds; });
    var rows = [];
    groupBy(valid, function (r) { return r.city; }).forEach(function (rs, city) {
      rows.push({ name: city, value: median(rs.map(function (r) { return r.price; })), n: rs.length });
    });
    rows.sort(function (a, b) { return a.value - b.value; });

    var label = plural(beds, 'bedroom');
    var missing = CITIES.filter(function (c) {
      return !rows.some(function (r) { return r.name === c; });
    });
    if (!rows.length) {
      setAnswer('a7', ['No valid sales with ' + label + ' are recorded in any city.']);
    } else {
      var low = extremes(rows, false, 0);
      var lowNames = low.map(function (r) { return r.name; });
      var paragraphs = [
        '<strong>' + esc(joinNames(lowNames)) + '</strong> ' + (low.length > 1 ? 'tie for' : 'has') +
          ' the lowest median sale price for homes with ' + label + ', at <strong>' + fmtUsd(low[0].value) + '</strong>' +
          (low.length === 1 ? ' from ' + plural(low[0].n, 'sale') + '.' : '.')
      ];
      var highest = rows[rows.length - 1];
      paragraphs.push('The highest is ' + esc(highest.name) + ' at ' + fmtUsd(highest.value) + ' from ' + plural(highest.n, 'sale') + '.');
      if (missing.length) {
        paragraphs.push('No valid sales with ' + label + ' are recorded in ' + esc(joinNames(missing)) + ', so they are not shown.');
      }
      setAnswer('a7', paragraphs);
    }

    fillTable('t7', ['City', 'Median sale price', 'Valid sales'], rows.map(function (r) {
      return [r.name, fmtUsd(r.value), fmtInt(r.n)];
    }));

    var names = rows.map(function (r) { return r.name; });
    var hi = rows.length ? extremes(rows, false, 0).map(function (r) { return r.name; }) : [];
    labelFormats.c7 = function (v, i) { return fmtUsd(v) + ' (' + plural(rows[i].n, 'sale') + ')'; };
    sizeWrap('w7', Math.max(rows.length, 1));
    drawChart('c7', {
      type: 'bar',
      data: {
        labels: names,
        datasets: [{ label: 'Median sale price', data: rows.map(function (r) { return r.value; }),
                     backgroundColor: colorsFor(names, hi, ACCENT, QUIET) }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 130 } },
        plugins: {
          legend: { display: false },
          valueLabels: true,
          tooltip: { callbacks: { label: function (ctx) {
            var r = rows[ctx.dataIndex];
            return fmtUsd(r.value) + ' from ' + plural(r.n, 'valid sale');
          } } }
        },
        scales: { x: { ticks: { maxTicksLimit: 6, callback: function (v) { return fmtUsd(v); } } } }
      }
    });
  }

  function readNumber(id) {
    var raw = el(id).value.trim();
    if (raw === '') { return null; }
    var v = Number(raw);
    return isFinite(v) ? v : null;
  }

  function renderQ8() {
    var lo = readNumber('q8-min');
    var hi = readNumber('q8-max');
    if (lo === null || hi === null) {
      setError('a8', 'Type a lowest and a highest price to see the answer.');
      drawEmpty('c8', 'w8');
      el('t8').innerHTML = '';
      return;
    }
    if (lo < 0 || hi < 0) {
      setError('a8', 'Prices cannot be negative.');
      drawEmpty('c8', 'w8');
      el('t8').innerHTML = '';
      return;
    }
    if (lo > hi) {
      setError('a8', 'The lowest price is above the highest price. Swap them to see the answer.');
      drawEmpty('c8', 'w8');
      el('t8').innerHTML = '';
      return;
    }

    var valid = D.filter(function (r) {
      return r.valid && r.price >= lo && r.price <= hi && r.listMs !== null && r.contractMs !== null;
    });
    var rows = [];
    groupBy(valid, function (r) { return r.city; }).forEach(function (rs, city) {
      var days = rs.map(function (r) { return (r.contractMs - r.listMs) / DAY_MS; });
      rows.push({ name: city, value: median(days), n: days.length });
    });
    rows.sort(function (a, b) { return a.value - b.value; });

    var shortNames = [];
    if (!rows.length) {
      setAnswer('a8', ['No sales priced from ' + fmtUsd(lo) + ' to ' + fmtUsd(hi) + ' have both a list date and a contract date.']);
    } else {
      var short = extremes(rows, false, 1);
      var longest = extremes(rows, true, 1);
      shortNames = short.map(function (r) { return r.name; });
      var usedText = short.length === 1
        ? 'Sales used: ' + fmtInt(short[0].n) + '.'
        : 'Sales used: ' + short.map(function (r) { return esc(r.name) + ' ' + fmtInt(r.n); }).join(', ') + '.';
      setAnswer('a8', [
        '<strong>' + esc(joinNames(shortNames)) + '</strong> ' +
          (short.length > 1 ? 'tie for' : 'has') + ' the shortest median days on market for sales priced ' +
          fmtUsd(lo) + ' to ' + fmtUsd(hi) + ': <strong>' + fmtDays(short[0].value) + '</strong>. ' + usedText,
        'The longest is ' + esc(joinNames(longest.map(function (r) { return r.name; }))) + ' at ' +
          fmtDays(longest[0].value) + '.'
      ]);
    }

    fillTable('t8', ['City', 'Median days on market', 'Sales used'], rows.map(function (r) {
      return [r.name, fmtDays(r.value), fmtInt(r.n)];
    }));

    var names = rows.map(function (r) { return r.name; });
    labelFormats.c8 = function (v) { return fmtDays(v); };
    sizeWrap('w8', Math.max(rows.length, 1));
    drawChart('c8', {
      type: 'bar',
      data: {
        labels: names,
        datasets: [{ label: 'Median days on market', data: rows.map(function (r) { return r.value; }),
                     backgroundColor: colorsFor(names, shortNames, ACCENT, QUIET) }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 90 } },
        plugins: {
          legend: { display: false },
          valueLabels: true,
          tooltip: { callbacks: { label: function (ctx) {
            return 'Sales used: ' + fmtInt(rows[ctx.dataIndex].n);
          } } }
        },
        scales: { x: { beginAtZero: true, title: { display: true, text: 'Median days from listing to contract' } } }
      }
    });
  }

  function renderQ9() {
    var city = el('q9-city').value;
    var year = Number(el('q9-year').value);
    var counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    D.forEach(function (r) {
      if (r.city === city && r.saleYear === year && r.saleMonth >= 1 && r.saleMonth <= 12) {
        counts[r.saleMonth - 1] += 1;
      }
    });
    var total = counts.reduce(function (a, b) { return a + b; }, 0);
    var peak = Math.max.apply(null, counts);
    var peakMonths = [];
    counts.forEach(function (c, i) { if (c === peak && peak > 0) { peakMonths.push(MONTHS[i]); } });

    if (total === 0) {
      setAnswer('a9', ['No sales in ' + esc(city) + ' are recorded for ' + year + '.']);
    } else {
      setAnswer('a9', [
        'In ' + year + ', ' + esc(city) + ' recorded <strong>' + fmtInt(total) + '</strong> sales.',
        'The busiest ' + (peakMonths.length > 1 ? 'months are ' : 'month is ') +
          '<strong>' + esc(joinNames(peakMonths)) + '</strong>, with ' + plural(peak, 'sale') +
          (peakMonths.length > 1 ? ' each.' : '.')
      ]);
    }

    fillTable('t9', ['Month', 'Sales'], MONTHS.map(function (m, i) {
      return [m, fmtInt(counts[i])];
    }));

    labelFormats.c9 = function (v) { return fmtInt(v); };
    sizeWrap('w9', 12);
    el('w9').style.height = '380px';
    drawChart('c9', {
      type: 'line',
      data: {
        labels: MONTHS.map(function (m) { return m.slice(0, 3); }),
        datasets: [{
          label: 'Sales',
          data: counts,
          borderColor: QUIET_DARK,
          backgroundColor: QUIET_DARK,
          borderWidth: 2,
          pointRadius: counts.map(function (c, i) { return peakMonths.indexOf(MONTHS[i]) >= 0 ? 7 : 4; }),
          pointBackgroundColor: counts.map(function (c, i) { return peakMonths.indexOf(MONTHS[i]) >= 0 ? ACCENT : QUIET_DARK; }),
          pointBorderColor: counts.map(function (c, i) { return peakMonths.indexOf(MONTHS[i]) >= 0 ? ACCENT : QUIET_DARK; }),
          tension: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 24, right: 28, left: 8 } },
        plugins: {
          legend: { display: false },
          valueLabels: true,
          tooltip: { callbacks: {
            title: function (items) { return MONTHS[items[0].dataIndex] + ' ' + year; },
            label: function (ctx) { return plural(ctx.parsed.y, 'sale'); }
          } }
        },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'Sales' } } }
      }
    });
  }

  function renderQ10() {
    var campus = el('q10-campus').value;
    var budgetRaw = el('q10-budget').value.trim();
    var bedsRaw = el('q10-beds').value.trim();
    var budget = budgetRaw === '' ? null : Number(budgetRaw);
    var minBeds = bedsRaw === '' ? 0 : Number(bedsRaw);

    if ((budget !== null && (!isFinite(budget) || budget < 0)) || !isFinite(minBeds) || minBeds < 0) {
      setError('a10', 'Type a budget of $0 or more, and a bedroom minimum of 0 or more.');
      drawEmpty('c10', 'w10');
      return;
    }

    var matches = D.filter(function (r) {
      return r.valid && r.uni === campus && r.miles !== null &&
        (budget === null || r.price <= budget) &&
        (r.beds !== null && r.beds >= minBeds);
    });
    var budgetText = budget === null ? 'no budget limit' : 'a budget of up to ' + fmtUsd(budget);
    var bedsText = minBeds === 0 ? 'any number of bedrooms' : 'at least ' + plural(minBeds, 'bedroom');

    if (!matches.length) {
      setAnswer('a10', ['No sales in the ' + esc(campus) + ' area meet these conditions: ' + budgetText + ', ' + bedsText + '.']);
    } else {
      var med = median(matches.map(function (r) { return r.miles; }));
      setAnswer('a10', [
        '<strong>' + fmtInt(matches.length) + '</strong> ' + (matches.length === 1 ? 'sale meets' : 'sales meet') +
          ' these conditions in the ' + esc(campus) + ' area (' + budgetText + ', ' + bedsText + ').',
        'The median distance to campus is <strong>' + fmtMiles(med) + '</strong>.'
      ]);
    }

    var points = matches.map(function (r) { return { x: r.miles, y: r.price }; });
    sizeWrap('w10', 10);
    el('w10').style.height = '420px';
    var medLine = matches.length
      ? { x: median(matches.map(function (r) { return r.miles; })), label: 'Median ' + fmtMiles(median(matches.map(function (r) { return r.miles; }))) }
      : null;
    drawChart('c10', {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Sales that meet the conditions',
          data: points,
          backgroundColor: alpha(QUIET_DARK, 0.4),
          borderColor: alpha(QUIET_DARK, 0.7),
          pointRadius: 2.5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          medianLine: medLine,
          tooltip: { callbacks: {
            title: function () { return 'One sale'; },
            label: function (ctx) { return fmtUsd(ctx.parsed.y) + ' · ' + fmtDec(ctx.parsed.x, 1) + ' miles from campus'; }
          } }
        },
        scales: {
          x: { title: { display: true, text: 'Miles to campus' }, min: 0, ticks: { callback: function (v) { return fmtDec(v, 0); } } },
          y: { title: { display: true, text: 'Sale price' }, min: 0, ticks: { maxTicksLimit: 6, callback: function (v) { return fmtUsd(v); } } }
        }
      },
      plugins: [medianLinePlugin]
    });
  }

  /* ---------- Start-up, events and themes ---------- */

  /* ---------- Key findings (top of the page) ---------- */

  function renderFindings() {
    var valid = D.filter(function (r) { return r.valid; });

    var cityRows = [];
    groupBy(valid, function (r) { return r.city; }).forEach(function (rs, city) {
      cityRows.push({ name: city, value: median(rs.map(function (r) { return r.price; })), n: rs.length });
    });
    var top = extremes(cityRows, true, 0);
    var low = extremes(cityRows, false, 0);
    var topNames = top.map(function (r) { return r.name; });
    var lowNames = low.map(function (r) { return r.name; });
    el('finding-1').innerHTML = '<strong>' + esc(joinNames(topNames)) + '</strong> ' +
      (top.length > 1 ? 'tie for' : 'has') + ' the highest median sale price, at ' + fmtUsd(top[0].value) +
      (top.length === 1 ? ' from ' + plural(top[0].n, 'valid sale') : '') + '. ' +
      esc(joinNames(lowNames)) + (low.length > 1 ? ' tie for' : ' has') + ' the lowest, at ' + fmtUsd(low[0].value) + '.';

    var dayRows = [];
    groupBy(valid.filter(function (r) { return r.listMs !== null && r.contractMs !== null; }),
      function (r) { return r.uni; }).forEach(function (rs, uni) {
      dayRows.push({ name: uni, value: median(rs.map(function (r) { return (r.contractMs - r.listMs) / DAY_MS; })) });
    });
    var slow = extremes(dayRows, true, 1);
    var fast = extremes(dayRows, false, 1);
    el('finding-2').innerHTML = 'Homes sell fastest in ' + esc(joinNames(fast.map(function (r) { return r.name; }))) +
      ', with a median of ' + fmtDays(fast[0].value) + ' from listing to contract, and slowest in ' +
      esc(joinNames(slow.map(function (r) { return r.name; }))) + ', at ' + fmtDays(slow[0].value) + '.';

    var all = D.filter(function (r) { return r.price !== null; });
    var removed = all.length - valid.length;
    var meanB = mean(all.map(function (r) { return r.price; }));
    var meanA = mean(valid.map(function (r) { return r.price; }));
    var medB = median(all.map(function (r) { return r.price; }));
    var medA = median(valid.map(function (r) { return r.price; }));
    var meanChg = (meanA - meanB) / meanB * 100;
    el('finding-3').innerHTML = 'The valid price rule removes ' + fmtInt(removed) + ' of ' + fmtInt(all.length) +
      ' sales (' + fmtPct(removed / all.length * 100, false) + '). Across the whole dataset the mean ' +
      (meanChg < 0 ? 'falls' : 'rises') + ' ' + fmtPct(Math.abs(meanChg), false) + ', but the median ' +
      (roundHalfUp(medA, 0) === roundHalfUp(medB, 0) ? 'stays at ' + fmtUsd(medB) : 'moves from ' + fmtUsd(medB) + ' to ' + fmtUsd(medA)) +
      '. The rule changes the averages much more than the typical sale.';
  }

  function renderAll() {
    renderFindings();
    renderExplore();
    renderP1();
    renderCompare();
    renderQ1();
    renderQ2();
    renderQ3();
    renderQ4();
    renderQ5();
    renderQ6();
    renderQ7();
    renderQ8();
    renderQ9();
    renderQ10();
  }

  function setTheme(name) {
    document.documentElement.setAttribute('data-theme', name);
    try { localStorage.setItem('theme', name); } catch (e) { /* storage blocked: the choice lasts for this visit */ }
    var btn = el('theme-toggle');
    btn.setAttribute('aria-pressed', name === 'dark' ? 'true' : 'false');
    btn.textContent = name === 'dark' ? 'Light mode' : 'Dark mode';
    readPalette();
    updateMapTheme();
    if (chartReady()) { renderAll(); }
    if (map) { updateMarkers(readFilters()); }
  }

  function bindEvents() {
    el('theme-toggle').addEventListener('click', function () {
      setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    });

    ['f-area', 'f-year', 'f-beds', 'f-gar', 'f-bas', 'f-fire'].forEach(function (id) {
      el(id).addEventListener('change', renderExplore);
    });
    ['f-pmin', 'f-pmax'].forEach(function (id) {
      el(id).addEventListener('input', renderExplore);
    });
    ['f-area-min-range', 'f-area-max-range'].forEach(function (id) {
      el(id).addEventListener('input', function () { syncArea(id, true); });
    });
    ['f-area-min', 'f-area-max'].forEach(function (id) {
      el(id).addEventListener('input', function () { syncArea(id, false); });
      el(id).addEventListener('change', function () { syncArea(id, true); });
    });

    el('reset-filters').addEventListener('click', resetFilters);
    el('copy-link').addEventListener('click', copyLink);
    el('show-all').addEventListener('click', function () { setLocation(''); });

    el('t-results').addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-sort]');
      if (!btn) { return; }
      var key = btn.getAttribute('data-sort');
      if (resultSort.key === key) {
        resultSort.dir = resultSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        resultSort = { key: key, dir: key === 'city' || key === 'campus' ? 'asc' : 'desc' };
      }
      drawResultsTable();
    });

    ['cmp-a', 'cmp-b'].forEach(function (id) {
      el(id).addEventListener('change', function () { renderCompare(); writeHash(readFilters()); });
    });

    ['q7-beds'].forEach(function (id) { el(id).addEventListener('change', renderQ7); });
    ['q8-min', 'q8-max'].forEach(function (id) { el(id).addEventListener('input', renderQ8); });
    ['q9-city', 'q9-year'].forEach(function (id) { el(id).addEventListener('change', renderQ9); });
    ['q10-campus'].forEach(function (id) { el(id).addEventListener('change', renderQ10); });
    ['q10-budget', 'q10-beds'].forEach(function (id) { el(id).addEventListener('input', renderQ10); });
  }

  function setUpControls() {
    var yearOptions = [{ value: 'any', label: 'All years' }].concat(YEARS.map(function (y) {
      return { value: String(y), label: yearLabel(y) };
    }));
    fillSelect('f-year', yearOptions, 'any');
    fillGroupedSelect('f-area', [{ label: 'Whole dataset', options: [{ value: '', label: 'All areas' }] }].concat(locationGroups()), '');
    fillGroupedSelect('cmp-a', locationGroups(), 'campus:University of Michigan');
    fillGroupedSelect('cmp-b', locationGroups(), 'city:Champaign, IL');

    var beds = Array.from(new Set(D.filter(function (r) { return r.valid && r.beds !== null; })
      .map(function (r) { return r.beds; }))).sort(function (a, b) { return a - b; });
    fillSelect('q7-beds', beds.map(function (b) { return { value: b, label: plural(b, 'bedroom') }; }), 3);
    fillSelect('q9-city', CITIES.map(function (c) { return { value: c, label: c }; }), 'Ann Arbor, MI');
    fillSelect('q9-year', YEARS.map(function (y) { return { value: y, label: String(y) }; }), 2025);
    fillSelect('q10-campus', CAMPUSES.map(function (u) { return { value: u, label: u }; }), 'University of Michigan');
  }

  function showStats() {
    var valid = D.filter(function (r) { return r.valid; }).length;
    el('stat-rows').textContent = fmtInt(D.length);
    el('stat-rows').title = fmtInt(valid) + ' of them have a valid price';
  }

  function fail(message) {
    var banner = el('loading');
    if (banner) {
      banner.textContent = message;
      banner.classList.add('error');
    }
    ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10', 'a-compare', 'explore-summary', 'ap1-text'].forEach(function (id) {
      setError(id, message);
    });
  }

  function start() {
    readPalette();
    var btn = el('theme-toggle');
    btn.setAttribute('aria-pressed', currentTheme() === 'dark' ? 'true' : 'false');
    btn.textContent = currentTheme() === 'dark' ? 'Light mode' : 'Dark mode';

    if (!chartReady()) {
      fail('The chart library did not load, so the charts and answers cannot be shown. Reload the page.');
      return;
    }

    loadData().then(function (rows) {
      D = rows;
      var banner = el('loading');
      if (banner) { banner.remove(); }
      setUpLists();
      showStats();
      setUpControls();
      applyHash();
      bindEvents();
      initMap();
      renderAll();
    }).catch(function (err) {
      fail('The data could not be loaded. ' + err.message);
    });
  }

  start();
})();
