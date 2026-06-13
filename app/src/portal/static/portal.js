/* Tikspot captive-portal runtime (served at /m/portal.js).
 *
 * The page is hosted by the container, but login must be completed against the
 * MikroTik router. Each login widget is a <form data-tikspot-login> whose action
 * is the router's link-login URL (injected server-side from the redirect the
 * MikroTik shim sent us). By default we submit PAP (plaintext password over the
 * local hotspot network) — a native form POST, no JS required for correctness.
 *
 * When window.TIKSPOT.chap is enabled and the router supplied a CHAP id +
 * challenge, we hash the password client-side with md5.js before submitting
 * (HTTP-CHAP), matching MikroTik's login flow.
 *   NOTE: the CHAP path needs verification against real hardware; PAP is the
 *   tested default. login-by on the hotspot profile must include the method used.
 */
(function () {
  var T = window.TIKSPOT || {};

  function hexToStr(hex) {
    if (!hex) return '';
    var out = '';
    for (var i = 0; i + 1 < hex.length; i += 2) {
      out += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    return out;
  }

  function chapPassword(plain) {
    // MikroTik HTTP-CHAP: MD5(chap-id . password . chap-challenge), with id and
    // challenge as raw bytes. The router passes the challenge as hex here.
    var id = hexToStr(T.chapId);
    var chal = hexToStr(T.chapChallenge);
    return window.hexMD5(id + plain + chal);
  }

  // Direct-load guard: no link-login means the form can't reach the router. Stop
  // the submit and draw attention to the notice instead of silently doing nothing.
  function flashNotice() {
    var n = document.getElementById('tk-notice');
    if (!n) return;
    n.scrollIntoView({ behavior: 'smooth', block: 'center' });
    n.classList.remove('flash');
    void n.offsetWidth; // restart the animation
    n.classList.add('flash');
  }

  function wireDirect(form) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      flashNotice();
    });
    var btn = form.querySelector('[type=submit], button');
    if (btn) btn.classList.add('cp-btn-disabled');
  }

  function wire(form) {
    form.addEventListener('submit', function (ev) {
      var btn = form.querySelector('[type=submit], button');
      // CHAP: replace the password value with the hashed form before posting.
      if (T.chap && T.chapId && T.chapChallenge && typeof window.hexMD5 === 'function') {
        var pw = form.querySelector('input[name=password]');
        if (pw && !form.dataset.tikspotHashed) {
          pw.value = chapPassword(pw.value);
          form.dataset.tikspotHashed = '1';
        }
      }
      if (btn) {
        btn.disabled = true;
        if (btn.dataset.busyText) btn.textContent = btn.dataset.busyText;
      }
      // Let the native POST to the router proceed.
    });
  }

  // Mirror an input's value into another named field as the user types (used by
  // the voucher widget, where the code is both the username and the password).
  // Replaces an inline oninput handler so the rendered HTML carries no JS.
  function wireMirror(form) {
    var inputs = form.querySelectorAll('[data-tk-mirror]');
    for (var i = 0; i < inputs.length; i++) {
      (function (input) {
        var targetName = input.getAttribute('data-tk-mirror');
        input.addEventListener('input', function () {
          var target = form.querySelector('[name="' + targetName + '"]');
          if (target) target.value = input.value;
        });
      })(inputs[i]);
    }
  }

  function init() {
    var forms = document.querySelectorAll('form[data-tikspot-login]');
    for (var i = 0; i < forms.length; i++) {
      wireMirror(forms[i]);
      if (T.direct || !T.linkLogin) wireDirect(forms[i]);
      else wire(forms[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
