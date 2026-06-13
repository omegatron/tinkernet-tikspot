/* Tikspot admin dashboard (vanilla SPA). Tabs: active users, plans, vouchers,
   accounts. Talks to the /api/* management endpoints. */
(function () {
  var view = document.getElementById('view');
  var toastEl = document.getElementById('toast');

  // ---- helpers ----
  function api(path, opts) {
    opts = opts || {};
    if (opts.body && typeof opts.body !== 'string') {
      opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers);
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
        return j;
      });
    });
  }
  function toast(msg, err) {
    toastEl.textContent = msg;
    toastEl.className = 'toast show' + (err ? ' err' : '');
    setTimeout(function () { toastEl.className = 'toast'; }, 2600);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function mb(bytes) { return bytes == null ? '∞' : (bytes / 1048576).toFixed(bytes < 1048576 ? 1 : 0) + ' MB'; }
  function octets(o) { o = o || 0; return o >= 1048576 ? (o / 1048576).toFixed(1) + ' MB' : (o / 1024).toFixed(0) + ' KB'; }
  function mins(secs) { return secs == null ? '∞' : Math.round(secs / 60) + ' min'; }
  function planLimits(p) {
    var b = [];
    if (p.rate_limit) b.push(p.rate_limit);
    if (p.total_limit_bytes != null) b.push(mb(p.total_limit_bytes));
    if (p.expiry_mode === 'midnight') b.push('renews at midnight');
    else if (p.session_timeout_secs != null) b.push(mins(p.session_timeout_secs));
    return b.join(' · ') || '—';
  }

  // ---- tabs ----
  var tabs = {};

  tabs.active = function () {
    Promise.all([api('/api/active'), api('/api/usage')]).then(function (res) {
      var act = res[0].active, usage = res[1].usage;
      var rows = act.length
        ? act.map(function (s) {
            return '<tr><td class="mono">' + esc(s.username) + '</td><td class="mono">' + esc(s.mac || '—') +
              '</td><td class="mono">' + esc(s.ip || '—') + '</td><td>' + esc(s.acctstarttime || '—') +
              '</td><td>' + octets(s.total_octets) + '</td><td><button class="btn sm danger" data-kick="' +
              esc(s.acctsessionid) + '">Kick</button></td></tr>';
          }).join('')
        : '<tr><td colspan="6" class="empty">No active sessions. (They appear here once the hotspot sends accounting.)</td></tr>';
      var usageRows = usage.length
        ? usage.map(function (u) {
            return '<tr><td class="mono">' + esc(u.username) + '</td><td>' + u.sessions + '</td><td>' +
              octets(u.total_octets) + '</td><td>' + esc(u.last_start || '—') + '</td></tr>';
          }).join('')
        : '<tr><td colspan="4" class="empty">No usage recorded yet.</td></tr>';
      view.innerHTML =
        '<h1>Active users</h1><p class="sub">Live sessions from RADIUS accounting. Kick sends a CoA Disconnect to the router.</p>' +
        '<div class="card"><table><thead><tr><th>User</th><th>MAC</th><th>IP</th><th>Started</th><th>Usage</th><th></th></tr></thead><tbody>' +
        rows + '</tbody></table></div>' +
        '<div class="card"><h2>Usage by user</h2><table><thead><tr><th>User</th><th>Sessions</th><th>Total</th><th>Last seen</th></tr></thead><tbody>' +
        usageRows + '</tbody></table></div>';
      view.querySelectorAll('[data-kick]').forEach(function (b) {
        b.onclick = function () {
          b.disabled = true;
          api('/api/active/' + encodeURIComponent(b.dataset.kick) + '/kick', { method: 'POST' })
            .then(function (r) { toast(r.ok ? 'User disconnected' : 'Kick sent (no ACK): ' + r.output, !r.ok); tabs.active(); })
            .catch(function (e) { toast(e.message, true); b.disabled = false; });
        };
      });
    }).catch(function (e) { toast(e.message, true); });
  };

  tabs.plans = function () {
    api('/api/plans').then(function (r) {
      var rows = r.plans.map(function (p) {
        var del = p.radius_groupname === 'free' ? '' :
          '<button class="btn sm danger" data-del="' + p.id + '">Delete</button>';
        return '<tr><td>' + esc(p.name) + '</td><td><span class="muted">' + esc(p.kind) + '</span></td><td>' +
          planLimits(p) + '</td><td>' + (p.mac_remember ? 'yes' : 'no') + '</td><td>' + p.members + '</td><td>' + del + '</td></tr>';
      }).join('');
      view.innerHTML =
        '<h1>Plans</h1><p class="sub">A plan = a set of MikroTik limits (speed / data / time). Vouchers and accounts attach to a plan.</p>' +
        '<div class="card"><table><thead><tr><th>Name</th><th>Kind</th><th>Limits</th><th>MAC</th><th>Members</th><th></th></tr></thead><tbody>' +
        rows + '</tbody></table></div>' +
        '<div class="card"><h2>New plan</h2><div class="row">' +
        field('p-name', 'Name', '<input id="p-name" placeholder="e.g. Day pass">') +
        field('p-rate', 'Rate limit', '<input id="p-rate" placeholder="5M/5M">') +
        field('p-data', 'Data (MB)', '<input id="p-data" type="number" placeholder="∞">') +
        field('p-time', 'Time (min)', '<input id="p-time" type="number" placeholder="∞">') +
        field('p-expiry', 'Expiry', '<select id="p-expiry"><option value="fixed">Fixed time</option><option value="midnight">At midnight (daily)</option></select>') +
        field('p-mac', 'Remember MAC', '<select id="p-mac"><option value="0">no</option><option value="1">yes</option></select>') +
        '<button class="btn primary" id="p-add">Add plan</button></div></div>';
      // "At midnight" replaces the fixed time limit, so disable the Time field for it.
      var pExpiry = view.querySelector('#p-expiry');
      pExpiry.onchange = function () {
        var t = view.querySelector('#p-time');
        t.disabled = pExpiry.value === 'midnight';
        t.placeholder = pExpiry.value === 'midnight' ? 'renews at midnight' : '∞';
      };
      view.querySelector('#p-add').onclick = function () {
        var midnight = val('p-expiry') === 'midnight';
        var body = {
          name: val('p-name'), rate_limit: val('p-rate') || null,
          total_limit_bytes: numOrNull('p-data', 1048576),
          session_timeout_secs: midnight ? null : numOrNull('p-time', 60),
          mac_remember: val('p-mac') === '1',
          expiry_mode: val('p-expiry'),
        };
        if (!body.name) return toast('Name required', true);
        api('/api/plans', { method: 'POST', body: body }).then(function () { toast('Plan added'); tabs.plans(); }).catch(function (e) { toast(e.message, true); });
      };
      view.querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = function () {
          if (!confirm('Delete this plan?')) return;
          api('/api/plans/' + b.dataset.del, { method: 'DELETE' }).then(function () { toast('Deleted'); tabs.plans(); }).catch(function (e) { toast(e.message, true); });
        };
      });
    }).catch(function (e) { toast(e.message, true); });
  };

  function voucherRows(vouchers) {
    if (!vouchers.length) return '<tr><td colspan="6" class="empty">No vouchers yet — generate a batch above.</td></tr>';
    return vouchers.map(function (v) {
      var st = v.validity || v.status;
      var rev = (st === 'unused' || st === 'active' || st === 'scheduled') ? '<button class="btn sm danger" data-rev="' + v.id + '">Revoke</button>' : '';
      var win = (v.valid_from || v.valid_until)
        ? esc((v.valid_from || '').slice(0, 10) || '∞') + ' → ' + esc((v.valid_until || '').slice(0, 10) || '∞')
        : '<span class="muted">—</span>';
      return '<tr><td class="mono">' + esc(v.code) + '</td><td>' + esc(v.plan_name || '—') + '</td><td><span class="pill ' +
        st + '">' + st + '</span></td><td class="muted">' + win + '</td><td class="muted">' + esc(v.batch_id || '') + '</td><td>' + rev + '</td></tr>';
    }).join('');
  }
  function bindRevoke() {
    view.querySelectorAll('[data-rev]').forEach(function (b) {
      b.onclick = function () {
        api('/api/vouchers/' + b.dataset.rev + '/revoke', { method: 'POST' })
          .then(function () { toast('Revoked'); tabs.vouchers(); }).catch(function (e) { toast(e.message, true); });
      };
    });
  }

  tabs.vouchers = function () {
    Promise.all([api('/api/plans'), api('/api/vouchers')]).then(function (res) {
      var plans = res[0].plans, vouchers = res[1].vouchers;
      var planOpts = plans.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('');
      view.innerHTML =
        '<h1>Vouchers</h1><p class="sub">Generate printable codes tied to a plan. Each code is a one-line login. Add a date window for time-limited campaigns.</p>' +
        '<div class="card"><h2>Generate batch</h2><div class="row">' +
        field('v-plan', 'Plan', '<select id="v-plan">' + planOpts + '</select>') +
        field('v-count', 'Count', '<input id="v-count" type="number" value="10" min="1" max="1000">') +
        field('v-len', 'Code length', '<input id="v-len" type="number" value="8" min="4" max="16">') +
        field('v-from', 'Valid from (optional)', '<input id="v-from" type="date">') +
        field('v-until', 'Valid until (optional)', '<input id="v-until" type="date">') +
        '<button class="btn primary" id="v-gen"' + (plans.length ? '' : ' disabled') + '>Generate</button></div>' +
        (plans.length ? '' : '<p class="muted" style="margin-top:10px">Create a plan first.</p>') +
        '<div id="v-out"></div></div>' +
        '<div class="card"><table><thead><tr><th>Code</th><th>Plan</th><th>Status</th><th>Valid</th><th>Batch</th><th></th></tr></thead>' +
        '<tbody id="v-tbody">' + voucherRows(vouchers) + '</tbody></table></div>';
      bindRevoke();
      var gen = view.querySelector('#v-gen');
      if (gen) gen.onclick = function () {
        gen.disabled = true;
        api('/api/vouchers/batch', { method: 'POST', body: { plan_id: Number(val('v-plan')), count: Number(val('v-count')), length: Number(val('v-len')), valid_from: val('v-from') || null, valid_until: val('v-until') || null } })
          .then(function (r) {
            var codes = r.codes.map(function (c) { return '<div class="c">' + esc(c) + '</div>'; }).join('');
            view.querySelector('#v-out').innerHTML =
              '<p class="muted" style="margin-top:14px">Batch <b>' + esc(r.batch_id) + '</b> · ' + r.count + ' codes · ' + esc(r.plan) +
              ' &nbsp;<a class="btn sm" href="/api/vouchers/print?batch=' + encodeURIComponent(r.batch_id) + '" target="_blank">Print</a></p>' +
              '<div class="codes">' + codes + '</div>';
            toast('Generated ' + r.count + ' vouchers');
            gen.disabled = false;
            api('/api/vouchers').then(function (rr) { view.querySelector('#v-tbody').innerHTML = voucherRows(rr.vouchers); bindRevoke(); });
          }).catch(function (e) { toast(e.message, true); gen.disabled = false; });
      };
    }).catch(function (e) { toast(e.message, true); });
  };

  tabs.accounts = function () {
    Promise.all([api('/api/plans'), api('/api/accounts')]).then(function (res) {
      var plans = res[0].plans, accounts = res[1].accounts;
      var planOpts = '<option value="">(no plan)</option>' + plans.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('');
      var rows = accounts.length ? accounts.map(function (a) {
        return '<tr><td class="mono">' + esc(a.username) + '</td><td>' + esc(a.plan_name || '—') + '</td><td><span class="pill ' +
          (a.enabled ? 'on">enabled' : 'off">disabled') + '</span></td><td>' +
          '<button class="btn sm" data-toggle="' + a.id + '" data-en="' + a.enabled + '">' + (a.enabled ? 'Disable' : 'Enable') + '</button> ' +
          '<button class="btn sm danger" data-del="' + a.id + '">Delete</button></td></tr>';
      }).join('') : '<tr><td colspan="4" class="empty">No accounts yet.</td></tr>';
      view.innerHTML =
        '<h1>Accounts</h1><p class="sub">Named username/password logins (e.g. staff or paid users).</p>' +
        '<div class="card"><h2>New account</h2><div class="row">' +
        field('a-user', 'Username', '<input id="a-user" autocomplete="off">') +
        field('a-pass', 'Password', '<input id="a-pass" autocomplete="off">') +
        field('a-plan', 'Plan', '<select id="a-plan">' + planOpts + '</select>') +
        '<button class="btn primary" id="a-add">Add account</button></div></div>' +
        '<div class="card"><table><thead><tr><th>Username</th><th>Plan</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
      view.querySelector('#a-add').onclick = function () {
        var body = { username: val('a-user'), password: val('a-pass'), plan_id: val('a-plan') ? Number(val('a-plan')) : null };
        if (!body.username || !body.password) return toast('Username and password required', true);
        api('/api/accounts', { method: 'POST', body: body }).then(function () { toast('Account added'); tabs.accounts(); }).catch(function (e) { toast(e.message, true); });
      };
      view.querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = function () { if (!confirm('Delete account?')) return; api('/api/accounts/' + b.dataset.del, { method: 'DELETE' }).then(function () { toast('Deleted'); tabs.accounts(); }).catch(function (e) { toast(e.message, true); }); };
      });
      view.querySelectorAll('[data-toggle]').forEach(function (b) {
        b.onclick = function () { api('/api/accounts/' + b.dataset.toggle, { method: 'PATCH', body: { enabled: b.dataset.en !== '1' } }).then(function () { tabs.accounts(); }).catch(function (e) { toast(e.message, true); }); };
      });
    }).catch(function (e) { toast(e.message, true); });
  };

  tabs.devices = function () {
    api('/api/mac').then(function (r) {
      var rows = r.mac_sessions.length ? r.mac_sessions.map(function (m) {
        return '<tr><td class="mono">' + esc(m.mac) + '</td><td class="mono">' + esc(m.identity || '—') +
          '</td><td>' + esc(m.plan_name || '—') + '</td><td>' + esc(m.expires_at) + '</td>' +
          '<td><button class="btn sm danger" data-forget="' + esc(m.mac) + '">Forget</button></td></tr>';
      }).join('') : '<tr><td colspan="5" class="empty">No remembered devices. They appear when someone logs in on a MAC-remember plan.</td></tr>';
      view.innerHTML = '<h1>Remembered devices</h1><p class="sub">Devices that auto-reconnect by MAC until their window expires. Forgetting one sends them back to the portal.</p>' +
        '<div class="card"><table><thead><tr><th>MAC</th><th>First login</th><th>Plan</th><th>Expires</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
      view.querySelectorAll('[data-forget]').forEach(function (b) {
        b.onclick = function () { api('/api/mac/' + encodeURIComponent(b.dataset.forget), { method: 'DELETE' }).then(function () { toast('Device forgotten'); tabs.devices(); }).catch(function (e) { toast(e.message, true); }); };
      });
    }).catch(function (e) { toast(e.message, true); });
  };

  // Router-config form (shared by the wizard and the Router setup tab).
  function routerFormHtml(s) {
    s = s || {};
    return '<div class="row">' +
      field('r-scheme', 'Scheme', '<select id="r-scheme"><option value="https"' + (s.scheme === 'https' ? ' selected' : '') + '>https</option><option value="http"' + (s.scheme === 'http' ? ' selected' : '') + '>http</option></select>') +
      field('r-host', 'Router host/IP', '<input id="r-host" value="' + esc(s.host || '') + '" placeholder="192.168.88.1">') +
      field('r-user', 'API user', '<input id="r-user" value="' + esc(s.username || 'admin') + '">') +
      field('r-pass', 'API password', '<input id="r-pass" type="password" placeholder="(unchanged)">') +
      '</div><div class="row" style="margin-top:10px">' +
      field('r-cip', 'Container IP', '<input id="r-cip" value="' + esc(s.container_ip || '') + '" placeholder="172.18.0.2">') +
      field('r-sn', 'Hotspot server-name', '<input id="r-sn" value="' + esc(s.server_name || '') + '" placeholder="hotspot.tikspot">') +
      field('r-sec', 'RADIUS secret', '<input id="r-sec" placeholder="shared secret">') +
      '</div>';
  }
  function saveRouter() {
    var body = { scheme: val('r-scheme'), host: val('r-host'), username: val('r-user'),
      container_ip: val('r-cip'), server_name: val('r-sn') };
    if (val('r-pass')) body.password = val('r-pass');
    if (val('r-sec')) body.nas_secret = val('r-sec');
    return api('/api/setup/router', { method: 'POST', body: body });
  }

  // Render the per-component Verify result as a pass/fail list with raw config lines.
  function renderVerify(r) {
    var checks = (r && r.checks) || [];
    if (!checks.length) return '<span class="bad">No checks returned.</span>';
    var head = '<p class="' + (r.ok ? 'ok' : 'bad') + '">' + (r.ok ? '✓ All required components are configured' : '✗ Some required components are missing') + '</p>';
    return head + checks.map(function (c) {
      var mark = c.ok ? '<span class="ok">✓</span>' : (c.required ? '<span class="bad">✗</span>' : '<span class="muted">○</span>');
      var line = '<div style="margin:8px 0"><div>' + mark + ' ' + esc(c.component) + (c.required ? '' : ' <span class="muted">(optional)</span>') + '</div>';
      if (c.ok && c.raw) line += '<pre class="cfg">' + esc(c.raw) + '</pre>';
      else if (!c.ok && c.detail) line += '<div class="muted" style="margin-left:18px">' + esc(c.detail) + '</div>';
      return line + '</div>';
    }).join('');
  }

  // Render the router objects Tikspot manages, grouped by type.
  function renderManaged(objs) {
    objs = objs || {};
    var labels = { 'radius': 'RADIUS client', 'dns-static': 'DNS static', 'hotspot-profile': 'Hotspot profile', 'walled-garden-ip': 'Walled-garden IP', 'walled-garden-host': 'Walled-garden host' };
    var order = ['radius', 'dns-static', 'hotspot-profile', 'walled-garden-ip', 'walled-garden-host'];
    var total = 0, html = '';
    order.forEach(function (key) {
      var rows = objs[key] || [];
      total += rows.length;
      if (!rows.length) return;
      html += '<h3 style="margin:14px 0 6px">' + esc(labels[key] || key) + ' <span class="muted">(' + rows.length + ')</span></h3>';
      html += '<table><tbody>' + rows.map(function (r) {
        var pairs = Object.keys(r).filter(function (k) { return k !== 'id' && k !== 'comment'; })
          .map(function (k) { return '<span class="mono">' + esc(k) + '</span>=' + esc(String(r[k] == null ? '' : r[k])); }).join(' &nbsp;·&nbsp; ');
        return '<tr><td>' + pairs + '</td></tr>';
      }).join('') + '</tbody></table>';
    });
    if (!total) return '<p class="empty">No Tikspot-tagged objects found on the router yet — run Auto-configure first.</p>';
    return html;
  }

  tabs.router = function () {
    api('/api/setup/state').then(function (st) {
      view.innerHTML = '<h1>Router setup</h1><p class="sub">Point the container at your MikroTik so it can auto-configure RADIUS, the hotspot profile, DNS and the walled-garden.</p>' +
        '<div class="card"><h2>Connection</h2>' + routerFormHtml(st.router) +
        '<div class="row" style="margin-top:14px">' +
        '<button class="btn" id="r-save">Save</button>' +
        '<button class="btn" id="r-probe">Test connection</button>' +
        '<button class="btn primary" id="r-auto">Auto-configure</button>' +
        '<button class="btn" id="r-verify">Verify</button></div>' +
        '<p class="muted" style="margin-top:10px">Tip: use a dedicated API user (group <span class="mono">full</span>) for setup. Once Auto-configure (or the manual script below) succeeds and <b>Verify</b> is green, downgrade it to read-only on the router: <span class="mono">/user set [find name=&lt;user&gt;] group=read</span>. Tikspot only needs read access afterwards (health, Verify, active users); re-running setup or pushing hotspot files needs <span class="mono">full</span> again.</p>' +
        '<div id="r-out" style="margin-top:12px"></div></div>' +
        '<div class="card"><h2>Manual setup script</h2><p class="muted">Prefer not to give the container write access? Generate the idempotent RouterOS commands and paste them into the router terminal instead of Auto-configure (safe to re-run).</p>' +
        '<button class="btn" id="r-script">Generate setup script</button><div id="r-script-out" style="margin-top:12px"></div></div>' +
        '<div class="card"><h2>Tikspot router objects</h2><p class="muted">Everything Tikspot configured on the router is tagged with a "Tikspot portal (managed…)" comment. Query it here to audit what\'s in place.</p>' +
        '<button class="btn" id="r-objs">Query router objects</button><div id="r-objs-out" style="margin-top:12px"></div></div>';
      var out = view.querySelector('#r-out');
      view.querySelector('#r-script').onclick = function () {
        var o = view.querySelector('#r-script-out');
        o.innerHTML = '<p class="muted">Generating…</p>';
        api('/api/setup/script').then(function (r) {
          var script = r.script || '';
          o.innerHTML = '<div class="row" style="gap:8px;margin-bottom:8px"><button class="btn sm" id="r-script-copy">Copy</button>' +
            '<a class="btn sm" id="r-script-dl" download="tikspot-setup.rsc">Download .rsc</a>' +
            '<span class="muted">Contains your RADIUS secret — handle accordingly.</span></div>' +
            '<pre class="cfg">' + esc(script) + '</pre>';
          view.querySelector('#r-script-dl').href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(script);
          view.querySelector('#r-script-copy').onclick = function () {
            navigator.clipboard.writeText(script).then(function () { toast('Copied'); }).catch(function () { toast('Copy failed', true); });
          };
        }).catch(function (e) { o.innerHTML = '<span class="bad">' + esc(e.message) + '</span>'; });
      };
      view.querySelector('#r-objs').onclick = function () {
        var o = view.querySelector('#r-objs-out');
        o.innerHTML = '<p class="muted">Querying…</p>';
        api('/api/setup/router-objects').then(function (r) { o.innerHTML = renderManaged(r.objects); })
          .catch(function (e) { o.innerHTML = '<span class="bad">' + esc(e.message) + '</span>'; });
      };
      view.querySelector('#r-save').onclick = function () { saveRouter().then(function () { toast('Saved'); }).catch(function (e) { toast(e.message, true); }); };
      view.querySelector('#r-probe').onclick = function () { saveRouter().then(function () { return api('/api/setup/probe', { method: 'POST' }); }).then(function (r) { out.innerHTML = '<span class="ok">Connected — RouterOS ' + esc(r.version || '') + ' ' + esc(r.board || '') + '</span>'; }).catch(function (e) { out.innerHTML = '<span class="bad">' + esc(e.message) + '</span>'; }); };
      view.querySelector('#r-auto').onclick = function () { saveRouter().then(function () { return api('/api/setup/autoconfig', { method: 'POST' }); }).then(function (r) { out.innerHTML = '<span class="ok">Configured.</span><pre class="cfg">' + esc(JSON.stringify(r.steps, null, 2)) + '</pre>'; toast('Router configured'); }).catch(function (e) { out.innerHTML = '<span class="bad">' + esc(e.message) + '</span>'; }); };
      view.querySelector('#r-verify').onclick = function () { out.innerHTML = '<p class="muted">Verifying…</p>'; api('/api/setup/verify', { method: 'POST' }).then(function (r) { out.innerHTML = renderVerify(r); }).catch(function (e) { out.innerHTML = '<span class="bad">' + esc(e.message) + '</span>'; }); };
    }).catch(function (e) { toast(e.message, true); });
  };

  // ---- system / health ----
  function card(title, body) { return '<div class="card"><h2>' + esc(title) + '</h2>' + body + '</div>'; }
  function kv(pairs) {
    return '<table>' + pairs.map(function (p) {
      return '<tr><td class="muted" style="width:170px">' + esc(p[0]) + '</td><td>' + (p[2] ? p[1] : esc(p[1])) + '</td></tr>';
    }).join('') + '</table>';
  }
  function fmtUptime(s) {
    s = Number(s) || 0; var d = Math.floor(s / 86400); s %= 86400; var h = Math.floor(s / 3600); var m = Math.floor((s % 3600) / 60);
    return (d ? d + 'd ' : '') + (h ? h + 'h ' : '') + m + 'm';
  }
  tabs.system = function () {
    view.innerHTML = '<h1>System</h1><p class="sub">Container + MikroTik health. This is also what a backup captures about the device.</p><div id="sys"><p class="muted">Loading…</p></div>';
    api('/api/system/health').then(function (h) {
      var c = h.container || {};
      var html = card('This container', kv([
        ['Tikspot version', 'v' + (c.version || '')],
        ['Node runtime', c.node || '—'],
        ['App uptime', fmtUptime(c.uptimeSecs)],
        ['/data free', c.data ? (octets(c.data.freeBytes) + ' free of ' + octets(c.data.totalBytes)) : '—'],
      ]));
      if (!h.routerConfigured) {
        html += '<div class="card"><p class="muted">No router connection configured — add it on the <a href="#router" data-tab="router">Router setup</a> tab to see MikroTik CPU/memory, clock &amp; NTP, and where this container is mounted.</p></div>';
      } else if (h.error && !h.router) {
        html += '<div class="card"><p class="bad">Couldn\'t reach the router: ' + esc(h.error) + '</p></div>';
      } else {
        var r = h.router || {};
        html += card('Router resources', kv([
          ['Board', r.board || '—'], ['RouterOS', r.version || '—'], ['Architecture', r.arch || '—'],
          ['CPU load', r.cpuLoad != null ? r.cpuLoad + '%' : '—'],
          ['Memory used', (r.totalMemory && r.freeMemory != null) ? (octets(r.totalMemory - r.freeMemory) + ' / ' + octets(r.totalMemory)) : '—'],
          ['Uptime', r.uptime || '—'],
        ]));
        html += card('Clock &amp; NTP', kv([
          ['Router time', h.clock ? (h.clock.date + ' ' + h.clock.time) : '—'],
          ['Timezone', h.clock ? h.clock.timezone : '—'],
          ['NTP enabled', h.ntp ? h.ntp.enabled : '—'],
          ['NTP status', h.ntp ? h.ntp.status : '—'],
          ['NTP servers', h.ntp ? (h.ntp.servers || '—') : '—'],
        ]));
        if (h.ntpOk === false) html += '<div class="card" style="border-color:var(--amber)"><b style="color:var(--amber)">⚠ Router NTP is not synchronised.</b> <span class="muted">Date-gated vouchers rely on the MikroTik\'s clock — enable and sync NTP on the router.</span></div>';
        var pl = h.placement || {}, pc = pl.container, pv = pl.veth;
        html += card('This container on the router', kv([
          ['Container IP', pl.containerIp || '—'],
          ['Container name', pc ? pc.name : '—'],
          ['Status', pc ? pc.status : '—'],
          ['Root dir', pc ? (pc.rootDir || '—') : '—'],
          ['Mounts', pc ? (pc.mounts || '—') : '—'],
          ['veth', pv ? (pv.name + '  ' + pv.address) : '—'],
        ]));
      }
      document.getElementById('sys').innerHTML = html;
      var rl = view.querySelector('[data-tab="router"]'); if (rl) rl.onclick = function (e) { e.preventDefault(); show('router'); };
    }).catch(function (e) { toast(e.message, true); document.getElementById('sys').innerHTML = '<p class="bad">' + esc(e.message) + '</p>'; });
  };

  tabs.logs = function () {
    view.innerHTML = '<h1>Logs</h1><p class="sub">Recent RADIUS authentication attempts (from FreeRADIUS). Use this to confirm the router is actually reaching Tikspot.</p><div id="lg"><p class="muted">Loading…</p></div><h2 style="margin-top:24px">Admin activity</h2><p class="sub">A record of state-changing admin actions on this device.</p><div id="adlg"><p class="muted">Loading…</p></div>';
    api('/api/logs/auth').then(function (r) {
      var rows = r.attempts.length ? r.attempts.map(function (a) {
        return '<tr><td class="muted">' + esc(a.authdate || '') + '</td><td class="mono">' + esc(a.username) + '</td><td><span class="pill ' + (a.accept ? 'on">accept' : 'off">reject') + '</span></td></tr>';
      }).join('') : '<tr><td colspan="3" class="empty">No RADIUS attempts logged yet — connect a client through the hotspot, or run a test login.</td></tr>';
      document.getElementById('lg').innerHTML =
        '<div class="card"><div class="row" style="gap:32px">' +
        '<div><div class="muted">Accepted (24h)</div><div style="font-size:24px;color:var(--lime)">' + r.accepts24h + '</div></div>' +
        '<div><div class="muted">Rejected (24h)</div><div style="font-size:24px;color:var(--red)">' + r.rejects24h + '</div></div>' +
        '<div><div class="muted">Total logged</div><div style="font-size:24px">' + r.total + '</div></div></div></div>' +
        '<div class="card"><table><thead><tr><th>Time</th><th>Username</th><th>Result</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }).catch(function (e) { document.getElementById('lg').innerHTML = '<p class="bad">' + esc(e.message) + '</p>'; });
    api('/api/logs/admin').then(function (r) {
      var rows = r.entries.length ? r.entries.map(function (a) {
        return '<tr><td class="muted">' + esc(a.created_at || '') + '</td><td class="mono">' + esc(a.action) + '</td><td>' + esc(a.detail || '') + '</td><td class="muted">' + esc(a.ip || '') + '</td></tr>';
      }).join('') : '<tr><td colspan="4" class="empty">No admin actions recorded yet.</td></tr>';
      document.getElementById('adlg').innerHTML =
        '<div class="card"><table><thead><tr><th>Time</th><th>Action</th><th>Detail</th><th>From</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }).catch(function (e) { document.getElementById('adlg').innerHTML = '<p class="bad">' + esc(e.message) + '</p>'; });
  };

  tabs.backup = function () {
    view.innerHTML =
      '<h1>Backup &amp; migrate</h1><p class="sub">Move this whole setup — plans, vouchers, accounts, page designs, settings and branding — to another device.</p>' +
      '<div class="card"><h2>Download backup</h2><p class="muted">A zip with the database, branding assets and a snapshot of this container\'s router placement.</p>' +
      '<label class="row" style="gap:8px;align-items:center;margin:6px 0"><input type="checkbox" id="bk-secrets"><span>Include secrets (router password, RADIUS secret, admin login) — needed for a full migration. <b style="color:var(--amber)">Store securely.</b></span></label>' +
      '<a class="btn primary" id="bk-download" href="/api/backup" download>Download backup .zip</a> <span class="muted" id="bk-mode">Secrets are excluded — safe to share.</span></div>' +
      '<div class="card"><h2>Config-only backup</h2><p class="muted">A small bundle of plans, vouchers, accounts, designs and settings — <b>no session/accounting history and no secrets</b>. Safe to store off-device. Restoring it starts accounting history fresh.</p>' +
      '<a class="btn" href="/api/backup?config=1" download>Download config-only .zip</a></div>' +
      '<div class="card"><h2>Restore</h2><p class="muted">Upload a backup zip (full or config-only) — it is staged, then applied when the container restarts.</p>' +
      '<div class="row"><input type="file" id="bk-file" accept=".zip,application/zip"><button class="btn" id="bk-restore">Restore</button></div>' +
      '<div id="bk-out" style="margin-top:12px"></div></div>';
    var bkSecrets = document.getElementById('bk-secrets');
    bkSecrets.onchange = function () {
      var on = bkSecrets.checked;
      document.getElementById('bk-download').href = on ? '/api/backup?secrets=1' : '/api/backup';
      document.getElementById('bk-mode').textContent = on
        ? 'Secrets included — keep this file private.'
        : 'Secrets are excluded — safe to share.';
    };
    document.getElementById('bk-restore').onclick = function () {
      var f = document.getElementById('bk-file').files[0];
      if (!f) return toast('Choose a backup zip first', true);
      if (!confirm('Restore from this backup? It replaces ALL current data when the container restarts.')) return;
      var fd = new FormData(); fd.append('file', f);
      fetch('/api/restore', { method: 'POST', body: fd }).then(function (r) { return r.json(); }).then(function (res) {
        if (res.ok) document.getElementById('bk-out').innerHTML = '<p class="ok">' + esc(res.message) + ' (' + res.assets_restored + ' asset(s))</p><pre class="cfg">Finish on the router:\n/container/stop [find name=app-tikspot]\n/container/start [find name=app-tikspot]</pre>';
        else toast(res.error || 'Restore failed', true);
      }).catch(function (e) { toast(e.message, true); });
    };
  };

  // ---- tiny view helpers ----
  function field(id, label, inner) { return '<div class="field"><label for="' + id + '">' + label + '</label>' + inner + '</div>'; }
  function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }
  function numOrNull(id, mult) { var v = val(id); return v === '' ? null : Math.round(Number(v) * (mult || 1)); }

  // ---- nav ----
  function show(tab) {
    document.querySelectorAll('#nav a[data-tab]').forEach(function (a) { a.classList.toggle('active', a.dataset.tab === tab); });
    (tabs[tab] || tabs.active)();
    location.hash = tab;
  }
  document.getElementById('nav').addEventListener('click', function (e) {
    var a = e.target.closest('a[data-tab]');
    if (a) { e.preventDefault(); show(a.dataset.tab); }
  });
  document.getElementById('logout').onclick = function () {
    api('/api/auth/logout', { method: 'POST' }).then(boot);
  };

  // ---- gate: login / first-run wizard / dashboard ----
  function gateOn() { document.body.classList.add('gated'); }
  function gateOff() { document.body.classList.remove('gated'); }

  function renderLogin() {
    gateOn();
    view.innerHTML = '<div class="gate"><h1>Tikspot admin</h1><p class="sub">Enter the admin password.</p>' +
      '<div class="field"><input id="lg-pw" type="password" placeholder="Password" autofocus></div>' +
      '<button class="btn primary" id="lg-go">Log in</button></div>';
    function go() {
      api('/api/auth/login', { method: 'POST', body: { password: val('lg-pw') } })
        .then(function () { boot(); }).catch(function (e) { toast(e.message, true); });
    }
    view.querySelector('#lg-go').onclick = go;
    view.querySelector('#lg-pw').addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
  }

  function renderWizard(step) {
    gateOn();
    step = step || 1;
    var steps = '<div class="steps"><span' + (step === 1 ? ' class="b"' : '') + '><b>1.</b> Password</span>' +
      '<span' + (step === 2 ? ' class="b"' : '') + '>2. Router</span><span' + (step === 3 ? ' class="b"' : '') + '>3. Done</span></div>';
    if (step === 1) {
      view.innerHTML = '<div class="gate">' + steps + '<h1>Welcome to Tikspot</h1>' +
        '<p class="sub">Set an admin password to secure this portal.</p>' +
        '<div class="field"><input id="w-pw" type="password" placeholder="New password (min 6 chars)"></div>' +
        '<div class="field"><input id="w-pw2" type="password" placeholder="Confirm password"></div>' +
        '<button class="btn primary" id="w-next">Continue</button></div>';
      view.querySelector('#w-next').onclick = function () {
        if (val('w-pw').length < 6) return toast('Password too short', true);
        if (val('w-pw') !== val('w-pw2')) return toast('Passwords do not match', true);
        api('/api/setup/admin', { method: 'POST', body: { password: val('w-pw') } })
          .then(function () { renderWizard(2); }).catch(function (e) { toast(e.message, true); });
      };
    } else if (step === 2) {
      api('/api/setup/state').then(function (st) {
        view.innerHTML = '<div class="gate" style="max-width:560px">' + steps + '<h1>Connect your MikroTik</h1>' +
          '<p class="sub">Optional, but lets Tikspot configure the router for you. You can skip and do it later.</p>' +
          routerFormHtml(st.router) +
          '<div class="row" style="margin-top:14px">' +
          '<button class="btn" id="w-probe">Test connection</button>' +
          '<button class="btn primary" id="w-auto">Auto-configure</button>' +
          '<button class="btn" id="w-skip">Skip</button></div><div id="w-out" style="margin-top:12px"></div></div>';
        var out = view.querySelector('#w-out');
        view.querySelector('#w-probe').onclick = function () { saveRouter().then(function () { return api('/api/setup/probe', { method: 'POST' }); }).then(function (r) { out.innerHTML = '<span class="ok">Connected — RouterOS ' + esc(r.version || '') + '</span>'; }).catch(function (e) { out.innerHTML = '<span class="bad">' + esc(e.message) + '</span>'; }); };
        view.querySelector('#w-auto').onclick = function () { saveRouter().then(function () { return api('/api/setup/autoconfig', { method: 'POST' }); }).then(function (r) { out.innerHTML = '<span class="ok">Configured.</span><pre class="cfg">' + esc(JSON.stringify(r.steps, null, 2)) + '</pre>'; setTimeout(function () { renderWizard(3); }, 1200); }).catch(function (e) { out.innerHTML = '<span class="bad">' + esc(e.message) + '</span>'; }); };
        view.querySelector('#w-skip').onclick = function () { saveRouter().then(function () { renderWizard(3); }).catch(function () { renderWizard(3); }); };
      });
    } else {
      view.innerHTML = '<div class="gate">' + steps + '<h1>All set 🎉</h1>' +
        '<p class="sub">Design your portal page, then download the hotspot files for your MikroTik.</p>' +
        '<div class="kvs">Next steps:<br>• <a href="/admin/editor.html">Open the portal editor</a><br>' +
        '• Download the hotspot files (from the editor)<br>• Upload them to your router’s hotspot directory</div>' +
        '<div style="margin-top:18px"><button class="btn primary" id="w-finish">Go to dashboard</button></div></div>';
      view.querySelector('#w-finish').onclick = function () {
        api('/api/setup/finish', { method: 'POST' }).then(function () { boot(); }).catch(function (e) { toast(e.message, true); });
      };
    }
  }

  function boot() {
    api('/api/auth/status').then(function (s) {
      document.getElementById('ver').textContent = ' v' + (s.version || '');
      if (!s.setup_complete) { renderWizard(1); return; }
      if (!s.authenticated) { renderLogin(); return; }
      gateOff();
      show((location.hash || '#active').slice(1));
    }).catch(function (e) { toast(e.message, true); });
  }
  boot();
})();
