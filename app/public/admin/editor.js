/* Tikspot captive-portal editor — palette / canvas / inspector.
 * Vanilla JS, no framework. Edits a design model { theme, blocks } and saves it
 * via /api/designs. The canvas renders a live preview using the same cp- styles
 * the real portal uses (/m/portal.css), so what you see is what guests get. */
(function () {
  // ---------- inline icons (Lucide paths) ----------
  var P = {
    image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    heading: '<path d="M6 12h12M6 20V4M18 20V4"/>',
    type: '<path d="M4 7V5h16v2M9 19h6M12 5v14"/>',
    zap: '<path d="M4 14a1 1 0 0 1-.8-1.6l9.4-10.8a.5.5 0 0 1 .9.4L11.5 9.5a1 1 0 0 0 .8 1.5H20a1 1 0 0 1 .8 1.6l-9.4 10.8a.5.5 0 0 1-.9-.4l1.9-7.5a1 1 0 0 0-.8-1.5z"/>',
    ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    'move-vertical': '<path d="M8 18L12 22 16 18M8 6L12 2 16 6M12 2v20"/>',
    monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/>',
    smartphone: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    wifi: '<path d="M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 20 0M12 20h.01"/>',
    grip: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    'align-left': '<path d="M3 6h18M3 12h12M3 18h15"/>',
    'align-center': '<path d="M3 6h18M6 12h12M4 18h16"/>',
    'align-right': '<path d="M3 6h18M9 12h12M6 18h15"/>',
  };
  function svg(name, size) {
    size = size || 16;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (P[name] || '') + '</svg>';
  }

  var META = {
    logo: { label: 'Logo / image', icon: 'image' },
    heading: { label: 'Heading', icon: 'heading' },
    text: { label: 'Paragraph', icon: 'type' },
    'free-login': { label: 'Free login', icon: 'zap' },
    'voucher-login': { label: 'Voucher login', icon: 'ticket' },
    'userpass-login': { label: 'Account login', icon: 'user' },
    spacer: { label: 'Spacer', icon: 'move-vertical' },
  };
  var ORDER = ['logo', 'heading', 'text', 'free-login', 'voucher-login', 'userpass-login', 'spacer'];
  var ACCENTS = ['#2F8CEE', '#1761B0', '#E85B9E', '#ADE84F', '#F5B544', '#9C7BFF'];
  var PAGEBG = ['#0E2233', '#0A0D12', '#10243A', '#1B1430', '#0C3C37', '#2A1020'];
  var FONTS = ['Helvetica', 'Inter', 'Verdana', 'IBM Plex Sans', 'Georgia', 'system-ui'];
  var ALIGN = [{ v: 'left', i: 'align-left' }, { v: 'center', i: 'align-center' }, { v: 'right', i: 'align-right' }];

  // ---------- state ----------
  var model = defaultModel();
  var selected = null; // block id, or null = page
  var tab = 'content';
  var device = 'desktop';
  var designId = null;
  var plans = [];
  var dragType = null; // palette drag
  var dragIndex = null; // layer reorder drag
  var uid = 1;

  function defaultModel() {
    return {
      theme: { pageBg: '#0E2233', pageBg2: '#2F8CEE', accent: '#2F8CEE', radius: 10, width: 420, font: 'Helvetica' },
      blocks: [],
    };
  }
  function newId() { return 'b' + Date.now().toString(36) + (uid++).toString(36); }
  function defProps(type) {
    return {
      logo: { src: '', text: 'Our Wi‑Fi', width: 150, alt: 'logo' },
      heading: { text: 'Heading', size: 24, align: 'center' },
      text: { text: 'Some text', align: 'center', muted: false },
      'free-login': { label: 'Connect for free', plan: 'free', macRemember: false },
      'voucher-login': { label: 'Use voucher', placeholder: 'Enter voucher code', macRemember: false },
      'userpass-login': { label: 'Log in', userPlaceholder: 'Username', passPlaceholder: 'Password', macRemember: false },
      spacer: { size: 16 },
    }[type] || {};
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  // ---------- toast ----------
  var toastEl = document.getElementById('ed-toast');
  function toast(msg, err) {
    toastEl.textContent = msg;
    toastEl.className = 'ed-toast show' + (err ? ' ed-toast--err' : '');
    setTimeout(function () { toastEl.className = 'ed-toast'; }, 2600);
  }

  // ---------- block preview (mirrors server widgets.js, but inert) ----------
  function fieldHtml(ico, inner) {
    return '<div class="cp-field"><span class="cp-field__ico">' + svg(ico, 16) + '</span>' + inner + '</div>';
  }
  function blockPreview(b) {
    var p = b.props || {};
    switch (b.type) {
      case 'logo':
        return p.src
          ? '<div class="cp-logo"><img src="' + esc(p.src) + '" alt="' + esc(p.alt) + '" style="max-width:' + esc(p.width) + 'px"></div>'
          : '<div class="cp-logo"><span class="cp-logo__txt">' + esc(p.text || 'Logo') + '</span></div>';
      case 'heading':
        return '<h1 class="cp-heading cp-al-' + esc(p.align) + '" style="font-size:' + esc(p.size) + 'px">' + esc(p.text) + '</h1>';
      case 'text':
        return '<p class="cp-text ' + (p.muted ? 'is-muted ' : '') + 'cp-al-' + esc(p.align) + '">' + esc(p.text) + '</p>';
      case 'spacer':
        return '<div class="cp-spacer" style="height:' + esc(p.size) + 'px;background:rgba(47,140,238,.06)"></div>';
      case 'free-login':
        return '<div class="cp-form"><button class="cp-btn">' + esc(p.label) + '</button></div>';
      case 'voucher-login':
        return '<div class="cp-form">' + fieldHtml('ticket', '<input placeholder="' + esc(p.placeholder) + '" readonly>') + '<button class="cp-btn">' + esc(p.label) + '</button></div>';
      case 'userpass-login':
        return '<div class="cp-form">' + fieldHtml('user', '<input placeholder="' + esc(p.userPlaceholder) + '" readonly>') + fieldHtml('lock', '<input placeholder="' + esc(p.passPlaceholder) + '" readonly>') + '<button class="cp-btn">' + esc(p.label) + '</button></div>';
    }
    return '';
  }

  // ---------- shell ----------
  function buildShell() {
    var root = document.getElementById('ed-root');
    root.innerHTML =
      '<div class="ed-app">' +
      '<header class="ed-top">' +
      '<div class="ed-top__left">' +
      '<a class="ed-btn ed-exit" href="/admin/" title="Back to the dashboard">' + svg('back', 15) + ' Exit</a>' +
      '<a class="ed-brand" href="/admin/"><img src="/ds/assets/logo-robot.png" alt=""><b>Tikspot</b></a>' +
      '<span class="ed-top__divider"></span>' +
      '<div class="ed-top__page"><div class="ed-top__crumb">// hotspot page</div><div class="ed-top__name">Captive portal</div></div>' +
      '<span class="ed-badge ed-badge--amber">Draft</span>' +
      '</div>' +
      '<div class="ed-top__center"><div class="ed-seg">' +
      '<button class="ed-seg__btn" data-dev="desktop" title="Desktop">' + svg('monitor') + '</button>' +
      '<button class="ed-seg__btn" data-dev="mobile" title="Mobile">' + svg('smartphone') + '</button>' +
      '</div></div>' +
      '<div class="ed-top__right">' +
      '<span class="ed-top__saved" id="ed-saved"></span>' +
      '<a class="ed-btn ed-btn--ghost" href="/login?preview=1" target="_blank" rel="noopener">' + svg('eye', 15) + ' Preview</a>' +
      '<div class="ed-hswrap">' +
      '<button class="ed-btn" id="ed-hotspot">Hotspot files &#9662;</button>' +
      '<div class="ed-menu" id="ed-hsmenu" hidden>' +
      '<a href="/api/hotspot/shim.zip" download="tikspot-hotspot.zip">' + svg('save', 15) + ' Download .zip</a>' +
      '<button id="ed-hspush">' + svg('rocket', 15) + ' Push to router</button>' +
      '</div></div>' +
      '<button class="ed-btn ed-btn--primary" id="ed-save">' + svg('rocket', 15) + ' Save &amp; publish</button>' +
      '</div></header>' +
      '<div class="ed-main">' +
      '<aside class="ed-left" id="ed-left"></aside>' +
      '<main class="ed-canvas"><div class="ed-canvas__bar"><span id="ed-dims"></span></div>' +
      '<div class="ed-canvas__scroll" id="ed-scroll"></div></main>' +
      '<aside class="ed-right" id="ed-right"></aside>' +
      '</div></div>';

    root.querySelectorAll('[data-dev]').forEach(function (b) {
      b.onclick = function () { device = b.dataset.dev; refreshTop(); refreshCanvas(); };
    });
    document.getElementById('ed-save').onclick = save;

    // Hotspot files dropdown: download zip, or push straight to the router.
    var hsMenu = document.getElementById('ed-hsmenu');
    document.getElementById('ed-hotspot').onclick = function (e) { e.stopPropagation(); hsMenu.hidden = !hsMenu.hidden; };
    hsMenu.onclick = function (e) { e.stopPropagation(); };
    document.addEventListener('click', function () { hsMenu.hidden = true; });
    document.getElementById('ed-hspush').onclick = function () { hsMenu.hidden = true; pushHotspot(); };
  }

  function pushHotspot() {
    toast('Pushing hotspot files to the router...');
    fetch('/api/hotspot/push', { method: 'POST' })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        var j = res.j || {};
        if (!res.ok) { toast(j.error || 'Push failed', true); return; }
        if (j.ok) toast('Pushed ' + j.pushed + '/' + j.total + ' files into ' + j.htmlDir + '/ on the router');
        else {
          var bad = (j.results || []).filter(function (x) { return !x.ok; }).map(function (x) { return x.name; }).join(', ');
          toast('Pushed ' + j.pushed + '/' + j.total + ' — failed: ' + bad, true);
        }
      })
      .catch(function (e) { toast(e.message, true); });
  }

  function refreshTop() {
    document.querySelectorAll('[data-dev]').forEach(function (b) { b.classList.toggle('is-active', b.dataset.dev === device); });
    document.getElementById('ed-dims').textContent = device === 'mobile' ? '390 × 844' : '1280 × 800';
  }

  // ---------- palette + layers ----------
  function refreshLeft() {
    var chips = ORDER.map(function (t) {
      return '<button class="ed-chip" draggable="true" data-add="' + t + '" title="Drag or click to add ' + META[t].label + '">' + svg(META[t].icon, 17) + '<span>' + META[t].label + '</span></button>';
    }).join('');
    var layers = model.blocks.length
      ? model.blocks.map(function (b, i) {
          return '<button class="ed-layer' + (selected === b.id ? ' is-active' : '') + '" draggable="true" data-id="' + b.id + '" data-idx="' + i + '">' +
            svg(META[b.type].icon, 15) + '<span class="ed-layer__name">' + esc(layerName(b)) + '</span><span class="ed-layer__grip">' + svg('grip', 14) + '</span></button>';
        }).join('')
      : '<div class="ed-hint">No blocks yet — add one above.</div>';
    document.getElementById('ed-left').innerHTML =
      '<div class="ed-panel__label">// add block</div><div class="ed-palette">' + chips + '</div>' +
      '<div class="ed-panel__label" style="margin-top:22px">// page layers</div><div class="ed-layers" id="ed-layers">' + layers + '</div>';

    document.querySelectorAll('[data-add]').forEach(function (c) {
      c.onclick = function () { addBlock(c.dataset.add); };
      c.ondragstart = function () { dragType = c.dataset.add; };
    });
    var layerEls = document.querySelectorAll('.ed-layer');
    layerEls.forEach(function (l) {
      l.onclick = function () { select(l.dataset.id); };
      l.ondragstart = function (e) { dragIndex = +l.dataset.idx; e.dataTransfer.effectAllowed = 'move'; };
      l.ondragover = function (e) { e.preventDefault(); l.classList.add('drag-over'); };
      l.ondragleave = function () { l.classList.remove('drag-over'); };
      l.ondrop = function (e) {
        e.preventDefault(); l.classList.remove('drag-over');
        if (dragIndex != null) { moveBlock(dragIndex, +l.dataset.idx); dragIndex = null; }
      };
    });
  }
  function layerName(b) {
    var p = b.props || {};
    if (b.type === 'heading' || b.type === 'text') return META[b.type].label + ' · ' + (p.text || '').slice(0, 18);
    return META[b.type].label;
  }

  // ---------- canvas ----------
  function refreshCanvas() {
    var t = model.theme;
    var blocksHtml = model.blocks.length
      ? model.blocks.map(function (b) {
          return '<div class="cp-sel' + (selected === b.id ? ' is-sel' : '') + '" data-id="' + b.id + '">' +
            (selected === b.id ? '<span class="cp-sel__tag">' + esc(META[b.type].label) + '<span class="cp-sel__del" data-del="' + b.id + '">' + svg('trash', 12) + '</span></span>' : '') +
            '<div style="pointer-events:none">' + blockPreview(b) + '</div></div>';
        }).join('')
      : '<div class="cp-empty">Drag a block here, or click one in the palette →</div>';
    var pageStyle = 'background:radial-gradient(120% 90% at 50% -10%, ' + t.pageBg2 + ' 0%, ' + t.pageBg + ' 60%);' +
      '--cp-w:' + t.width + 'px;--cp-accent:' + t.accent + ';--cp-radius:' + t.radius + 'px;--cp-font:' + t.font + ',system-ui,sans-serif;min-height:100%';
    document.getElementById('ed-scroll').innerHTML =
      '<div class="ed-frame ed-frame--' + device + '">' +
      '<div class="ed-frame__chrome"><span class="ed-frame__dot"></span><span class="ed-frame__dot"></span><span class="ed-frame__dot"></span>' +
      '<span class="ed-frame__url">' + svg('wifi', 12) + ' ' + esc(hostHint()) + '/login</span></div>' +
      '<div class="ed-frame__body"><div class="cp-page" style="' + pageStyle + '"><div class="cp-card" id="ed-card">' + blocksHtml + '</div></div></div></div>';

    // selection + delete
    document.querySelectorAll('#ed-card .cp-sel').forEach(function (s) {
      s.onclick = function (e) { e.stopPropagation(); select(s.dataset.id); };
    });
    document.querySelectorAll('#ed-card [data-del]').forEach(function (d) {
      d.onclick = function (e) { e.stopPropagation(); removeBlock(d.dataset.del); };
    });
    var page = document.querySelector('#ed-scroll .cp-page');
    if (page) page.onclick = function () { select(null); };

    // drop target for palette adds
    var scroll = document.getElementById('ed-scroll');
    scroll.ondragover = function (e) { if (dragType) { e.preventDefault(); scroll.classList.add('drop-armed'); } };
    scroll.ondragleave = function () { scroll.classList.remove('drop-armed'); };
    scroll.ondrop = function (e) { e.preventDefault(); scroll.classList.remove('drop-armed'); if (dragType) { addBlock(dragType); dragType = null; } };
  }
  var _host = '';
  function hostHint() { return _host || 'wifi.local'; }

  // ---------- inspector ----------
  function fieldWrap(label, inner, hint) {
    return '<label class="ed-field"><span class="ed-field__lbl">' + esc(label) + '</span>' + inner + (hint ? '<span class="ed-hint">' + esc(hint) + '</span>' : '') + '</label>';
  }
  function swatches(key, val, colors) {
    var presets = colors.map(function (c) {
      return '<button class="ed-sw' + (val === c ? ' is-on' : '') + '" data-sw="' + key + '" data-c="' + c + '" style="background:' + c + '" title="' + c + '"></button>';
    }).join('');
    // Preset quick-picks above a full colour picker (native colour input + hex field).
    var picker = '<div class="ed-cp">' +
      '<input type="color" class="ed-cp__color" data-cp="' + key + '" value="' + esc(val) + '" title="Pick any colour">' +
      '<input type="text" class="ed-cp__hex" data-hex="' + key + '" value="' + esc(val) + '" maxlength="7" spellcheck="false" autocapitalize="off">' +
      '</div>';
    return '<div class="ed-swatches">' + presets + '</div>' + picker;
  }
  function slider(key, val, min, max, unit) {
    return '<div class="ed-slider"><input type="range" data-num="' + key + '" min="' + min + '" max="' + max + '" value="' + val + '"><span class="ed-slider__val">' + val + (unit || '') + '</span></div>';
  }
  function seg(key, val, opts) {
    return '<div class="ed-segctl">' + opts.map(function (o) {
      return '<button class="ed-segctl__b' + (val === o.v ? ' is-on' : '') + '" data-seg="' + key + '" data-v="' + o.v + '">' + (o.i ? svg(o.i, 15) : esc(o.t)) + '</button>';
    }).join('') + '</div>';
  }
  function sw(key, on, label) {
    return '<label class="ed-switch">' + esc(label) + '<input type="checkbox" data-bool="' + key + '"' + (on ? ' checked' : '') + '><span class="ed-switch__track"></span></label>';
  }
  function txt(key, val) { return '<input class="ed-input" data-txt="' + key + '" value="' + esc(val) + '">'; }
  function area(key, val) { return '<textarea class="ed-textarea" rows="3" data-txt="' + key + '">' + esc(val) + '</textarea>'; }

  function refreshInspector() {
    var b = blockById(selected);
    var title = b ? META[b.type].label : 'Page';
    var type = b ? b.type : 'settings';
    var body = b ? (tab === 'content' ? blockContent(b) : blockStyle(b)) : (tab === 'content' ? pageContent() : pageStyle());
    document.getElementById('ed-right').innerHTML =
      '<div class="ed-insp__head"><div><div class="ed-insp__title">' + esc(title) + '</div><div class="ed-insp__type">' + esc(type) + '</div></div><span class="ed-badge ed-badge--cyan">' + (b ? 'block' : 'page') + '</span></div>' +
      '<div class="ed-insp__tabs"><button data-tab="content" class="' + (tab === 'content' ? 'is-on' : '') + '">Content</button><button data-tab="style" class="' + (tab === 'style' ? 'is-on' : '') + '">Style</button></div>' +
      '<div class="ed-insp__body">' + body + '</div>';
    bindInspector();
  }

  function pageContent() {
    return fieldWrap('Page background', swatches('theme.pageBg', model.theme.pageBg, PAGEBG)) +
      fieldWrap('Glow tint', swatches('theme.pageBg2', model.theme.pageBg2, ACCENTS)) +
      fieldWrap('Card width', slider('theme.width', model.theme.width, 320, 560, 'px')) +
      fieldWrap('Font', '<select class="ed-select" data-txt="theme.font">' + FONTS.map(function (f) { return '<option' + (model.theme.font === f ? ' selected' : '') + '>' + f + '</option>'; }).join('') + '</select>');
  }
  function pageStyle() {
    return fieldWrap('Button & accent', swatches('theme.accent', model.theme.accent, ACCENTS)) +
      fieldWrap('Corner radius', slider('theme.radius', model.theme.radius, 0, 24, 'px'));
  }
  function blockContent(b) {
    var p = b.props;
    switch (b.type) {
      case 'logo':
        return fieldWrap('Image', '<button class="ed-imgslot" id="ed-upload">' + svg('upload', 16) + (p.src ? ' Replace image' : ' Upload image') + '</button>', p.src ? p.src : 'No image — the text below shows instead') +
          (p.src ? '' : fieldWrap('Logo text', txt('props.text', p.text))) +
          fieldWrap('Max width', slider('props.width', p.width, 60, 300, 'px')) +
          fieldWrap('Alt text', txt('props.alt', p.alt));
      case 'heading':
        return fieldWrap('Text', txt('props.text', p.text)) + fieldWrap('Size', slider('props.size', p.size, 16, 40, 'px')) + fieldWrap('Alignment', seg('props.align', p.align, ALIGN));
      case 'text':
        return fieldWrap('Text', area('props.text', p.text)) + fieldWrap('Alignment', seg('props.align', p.align, ALIGN)) + '<div class="ed-toggles">' + sw('props.muted', p.muted, 'Muted / small') + '</div>';
      case 'free-login':
        return fieldWrap('Button label', txt('props.label', p.label)) + fieldWrap('Plan', planSelect('props.plan', p.plan), 'Speed, data & time limits come from this plan — edit them on the Plans page.') + '<div class="ed-toggles">' + sw('props.macRemember', p.macRemember, 'Remember device (MAC)') + '</div>';
      case 'voucher-login':
        return fieldWrap('Button label', txt('props.label', p.label)) + fieldWrap('Field placeholder', txt('props.placeholder', p.placeholder), 'Each voucher carries its own plan (speed/data/time), chosen when you generate codes on the Vouchers page.') + '<div class="ed-toggles">' + sw('props.macRemember', p.macRemember, 'Remember device (MAC)') + '</div>';
      case 'userpass-login':
        return fieldWrap('Button label', txt('props.label', p.label)) + fieldWrap('Username placeholder', txt('props.userPlaceholder', p.userPlaceholder)) + fieldWrap('Password placeholder', txt('props.passPlaceholder', p.passPlaceholder), 'Accounts are assigned a plan (speed/data/time) on the Accounts page.') + '<div class="ed-toggles">' + sw('props.macRemember', p.macRemember, 'Remember device (MAC)') + '</div>';
      case 'spacer':
        return fieldWrap('Height', slider('props.size', p.size, 4, 80, 'px'));
    }
    return '';
  }
  function blockStyle() {
    return '<div class="ed-hint">Page-wide colours, fonts and the button accent live in the <b>Page</b> panel (click empty space in the preview). Block-level styling comes from the page theme so everything stays consistent.</div>';
  }
  function planSelect(key, val) {
    var opts = plans.map(function (p) { return '<option value="' + esc(p.radius_groupname) + '"' + (val === p.radius_groupname ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
    return '<select class="ed-select" data-txt="' + key + '">' + (opts || '<option value="free">Free</option>') + '</select>';
  }

  // ---------- inspector bindings ----------
  function setPath(path, value) {
    var parts = path.split('.');
    if (parts[0] === 'theme') model.theme[parts[1]] = value;
    else if (parts[0] === 'props') { var b = blockById(selected); if (b) b.props[parts[1]] = value; }
  }
  // Keep a colour field's paired inputs + preset highlight in sync after a live edit,
  // without rebuilding the inspector (so the active picker/hex field keeps focus).
  function syncColor(key, value) {
    var R = document.getElementById('ed-right');
    var lc = String(value).toLowerCase();
    R.querySelectorAll('[data-cp="' + key + '"]').forEach(function (e) { if (e.value.toLowerCase() !== lc) e.value = value; });
    R.querySelectorAll('[data-hex="' + key + '"]').forEach(function (e) { if (e !== document.activeElement) e.value = value; });
    R.querySelectorAll('[data-sw="' + key + '"]').forEach(function (e) { e.classList.toggle('is-on', (e.dataset.c || '').toLowerCase() === lc); });
  }
  function bindInspector() {
    var R = document.getElementById('ed-right');
    R.querySelectorAll('[data-tab]').forEach(function (t) { t.onclick = function () { tab = t.dataset.tab; refreshInspector(); }; });
    R.querySelectorAll('[data-sw]').forEach(function (s) { s.onclick = function () { setPath(s.dataset.sw, s.dataset.c); refreshInspector(); refreshCanvas(); }; });
    // Colour picker (drag) + hex field — update live without a full inspector rebuild
    // (which would lose the picker/field focus); keep the paired inputs + presets in sync.
    R.querySelectorAll('[data-cp]').forEach(function (c) {
      c.oninput = function () { setPath(c.dataset.cp, c.value); syncColor(c.dataset.cp, c.value); refreshCanvas(); };
    });
    R.querySelectorAll('[data-hex]').forEach(function (h) {
      h.oninput = function () {
        var v = h.value.trim();
        if (!/^#?[0-9a-fA-F]{6}$/.test(v)) return; // wait for a full valid hex
        if (v[0] !== '#') v = '#' + v;
        setPath(h.dataset.hex, v); syncColor(h.dataset.hex, v); refreshCanvas();
      };
    });
    R.querySelectorAll('[data-num]').forEach(function (n) {
      n.oninput = function () { setPath(n.dataset.num, +n.value); n.nextElementSibling.textContent = n.value + (n.dataset.num.indexOf('radius') >= 0 || n.dataset.num.indexOf('width') >= 0 || n.dataset.num.indexOf('size') >= 0 ? 'px' : ''); refreshCanvas(); };
    });
    R.querySelectorAll('[data-seg]').forEach(function (g) { g.onclick = function () { setPath(g.dataset.seg, g.dataset.v); refreshInspector(); refreshCanvas(); }; });
    R.querySelectorAll('[data-bool]').forEach(function (c) { c.onchange = function () { setPath(c.dataset.bool, c.checked); refreshCanvas(); }; });
    R.querySelectorAll('[data-txt]').forEach(function (t) {
      t.oninput = function () { setPath(t.dataset.txt, t.value); refreshCanvas(); refreshLeft(); };
    });
    var up = document.getElementById('ed-upload');
    if (up) up.onclick = uploadImage;
  }

  // ---------- actions ----------
  function blockById(id) { return model.blocks.find(function (b) { return b.id === id; }) || null; }
  function addBlock(type) {
    var b = { id: newId(), type: type, props: defProps(type) };
    model.blocks.push(b); selected = b.id; tab = 'content';
    refreshLeft(); refreshCanvas(); refreshInspector();
  }
  function removeBlock(id) {
    model.blocks = model.blocks.filter(function (b) { return b.id !== id; });
    if (selected === id) selected = null;
    refreshLeft(); refreshCanvas(); refreshInspector();
  }
  function moveBlock(from, to) {
    if (from === to) return;
    var b = model.blocks.splice(from, 1)[0];
    model.blocks.splice(to, 0, b);
    refreshLeft(); refreshCanvas();
  }
  function select(id) { selected = id; tab = 'content'; refreshLeft(); refreshCanvas(); refreshInspector(); }

  function uploadImage() {
    var input = document.getElementById('ed-file');
    input.value = '';
    input.onchange = function () {
      var f = input.files[0]; if (!f) return;
      var fd = new FormData(); fd.append('file', f);
      fetch('/api/assets', { method: 'POST', body: fd }).then(function (r) { return r.json(); }).then(function (res) {
        if (res.url) { var b = blockById(selected); if (b) { b.props.src = res.url; refreshCanvas(); refreshInspector(); toast('Image uploaded'); } }
        else toast(res.error || 'Upload failed', true);
      }).catch(function (e) { toast(e.message, true); });
    };
    input.click();
  }

  function save() {
    document.getElementById('ed-saved').textContent = 'saving…';
    fetch('/api/designs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: designId, name: 'Default', grapes_json: JSON.stringify(model), activate: true }),
    }).then(function (r) { return r.json(); }).then(function (res) {
      designId = res.id; document.getElementById('ed-saved').innerHTML = svg('check', 13) + ' Published';
      toast('Published — your portal page is live');
    }).catch(function (e) { document.getElementById('ed-saved').textContent = ''; toast(e.message, true); });
  }

  // ---------- boot ----------
  function boot() {
    buildShell(); refreshTop();
    Promise.all([
      fetch('/api/designs/active').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch('/api/plans').then(function (r) { return r.ok ? r.json() : { plans: [] }; }).catch(function () { return { plans: [] }; }),
      fetch('/api/setup/state').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    ]).then(function (res) {
      plans = (res[1] && res[1].plans) || [];
      if (res[2] && res[2].router && res[2].router.server_name) _host = res[2].router.server_name.split('|')[0];
      if (res[0]) {
        designId = res[0].id;
        try { var m = JSON.parse(res[0].grapes_json); if (m && m.theme && Array.isArray(m.blocks)) model = m; } catch (e) {}
      }
      if (!model.blocks.length) model = seedTemplate();
      refreshLeft(); refreshCanvas(); refreshInspector();
    });
  }
  function seedTemplate() {
    return {
      theme: { pageBg: '#0E2233', pageBg2: '#2F8CEE', accent: '#2F8CEE', radius: 10, width: 420, font: 'Helvetica' },
      blocks: [
        { id: newId(), type: 'logo', props: { src: '', text: 'Our Wi‑Fi', width: 150, alt: 'logo' } },
        { id: newId(), type: 'heading', props: { text: 'Welcome — get connected', size: 24, align: 'center' } },
        { id: newId(), type: 'text', props: { text: 'Choose how you’d like to get online.', align: 'center', muted: false } },
        { id: newId(), type: 'free-login', props: { label: 'Connect for free', plan: 'free', macRemember: false } },
        { id: newId(), type: 'voucher-login', props: { label: 'Use a voucher', placeholder: 'Enter voucher code', macRemember: false } },
        { id: newId(), type: 'text', props: { text: 'Powered by Tikspot', align: 'center', muted: true } },
      ],
    };
  }

  boot();
})();
