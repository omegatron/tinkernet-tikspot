// The starter design seeded on first boot, so /login renders something useful
// immediately and the editor opens onto a real page. It uses the same
// [data-tikspot] placeholders the editor's custom blocks emit, so it round-trips
// through the editor cleanly.

export const DEFAULT_DESIGN = {
  name: 'Default',
  html: `<div class="tk-card">
  <h1>Welcome to our Wi-Fi</h1>
  <p>Tap the button below to get connected.</p>
  <div data-tikspot="free-login" data-text="Connect for free" data-busy-text="Connecting…"></div>
  <div class="tk-or"><span>or</span></div>
  <div data-tikspot="voucher-login" data-text="Use voucher" data-placeholder="Enter voucher code"></div>
  <p class="tk-muted">Powered by Tikspot</p>
</div>`,
  css: `.tk-or{display:flex;align-items:center;gap:10px;color:#9aa0ab;font-size:12px;margin:18px 0 4px}
.tk-or::before,.tk-or::after{content:"";flex:1;height:1px;background:#e6e8ec}`,
};
