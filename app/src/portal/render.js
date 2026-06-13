// Render a design model into the live captive-portal page.
//
// design = { theme, blocks }. Blocks render via widgets.js (login blocks become
// real forms posting to the router's link-login); the theme sets the page
// background gradient and the cp- CSS vars. The portal CSS is inlined so a
// captive client needs a single request.

import fs from 'node:fs';
import { renderBlock, esc } from './widgets.js';
import { normalizeDesign } from '../design/model.js';

const PORTAL_CSS = fs.readFileSync(new URL('./static/portal.css', import.meta.url), 'utf8');

function errorBanner(error) {
  if (!error) return '';
  return `<div class="cp-error" role="alert">${esc(error)}</div>`;
}

function directLoadNotice(host) {
  const link = host ? ` <a href="http://${esc(host)}/">Open the Wi‑Fi login</a>` : '';
  return (
    `<div class="cp-notice" id="tk-notice" role="alert">` +
    `<strong>You're not connected through the Wi‑Fi yet.</strong> ` +
    `Join the network and you'll be brought here automatically — the buttons below ` +
    `won't work until then.${link}</div>`
  );
}

/**
 * @param {{theme:object, blocks:Array}} design
 * @param {object} ctx  hotspot session + flags (linkLogin, dst, error, chap*,
 *                       preview, hotspotHost, title)
 */
export function renderPortalPage(design, ctx = {}) {
  const d = normalizeDesign(design);
  const t = d.theme;

  const directLoad = Boolean(!ctx.linkLogin && !ctx.preview);
  const useChap = Boolean(ctx.chap && ctx.chapId);

  const blocksHtml = d.blocks.map((b) => renderBlock(b, ctx)).join('\n');

  const runtime = {
    linkLogin: ctx.linkLogin ?? '',
    dst: ctx.dst ?? '',
    chapId: ctx.chapId ?? '',
    chapChallenge: ctx.chapChallenge ?? '',
    chap: useChap,
    direct: directLoad,
    hotspotHost: ctx.hotspotHost ?? '',
  };

  const scripts = useChap
    ? `<script src="/m/md5.js"></script><script src="/m/portal.js"></script>`
    : `<script src="/m/portal.js"></script>`;

  const pageStyle =
    `background:radial-gradient(120% 90% at 50% -10%, ${esc(t.pageBg2)} 0%, ${esc(t.pageBg)} 60%);` +
    `--cp-w:${esc(t.width)}px;--cp-accent:${esc(t.accent)};--cp-radius:${esc(t.radius)}px;` +
    `--cp-font:${esc(t.font)},system-ui,sans-serif;min-height:100vh`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${(ctx.title ?? 'Connect to Wi‑Fi').replace(/[<>]/g, '')}</title>
<style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0;height:100%}${PORTAL_CSS}</style>
</head>
<body>
<div class="cp-page" style="${pageStyle}">
<div class="cp-card">
${directLoad ? directLoadNotice(ctx.hotspotHost) : ''}
${errorBanner(ctx.error)}
${blocksHtml}
</div>
</div>
<script>window.TIKSPOT=${JSON.stringify(runtime)};</script>
${scripts}
</body>
</html>`;
}
