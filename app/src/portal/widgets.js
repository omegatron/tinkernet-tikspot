// Server-side block renderer: design-model block -> portal HTML (cp- classes).
// Login blocks render as real <form>s posting to the router's link-login; other
// blocks (logo/heading/text/spacer) render directly. The editor renders a close
// visual mirror client-side; both share portal.css so they look identical.

import { FREE_USERNAME, FREE_PASSWORD } from '../config.js';

export function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const alignClass = (a) => `cp-al-${a === 'left' || a === 'right' ? a : 'center'}`;

function routerFields(ctx) {
  return (
    `<input type="hidden" name="dst" value="${esc(ctx.dst ?? '')}">` +
    `<input type="hidden" name="popup" value="true">`
  );
}

function loginForm(ctx, inner) {
  return (
    `<form class="cp-form" data-tikspot-login method="post" action="${esc(ctx.linkLogin ?? '')}">` +
    inner +
    routerFields(ctx) +
    `</form>`
  );
}

// SVG icons used inside input fields (inline so the portal needs no icon CDN).
const ICO = {
  user: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  lock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  ticket: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>',
};

function field(icon, inputHtml) {
  return `<div class="cp-field"><span class="cp-field__ico">${ICO[icon] || ''}</span>${inputHtml}</div>`;
}

const RENDERERS = {
  logo(p) {
    if (p.src) {
      const w = p.width ? ` style="max-width:${esc(p.width)}px"` : '';
      return `<div class="cp-logo"><img src="${esc(p.src)}" alt="${esc(p.alt || 'logo')}"${w}></div>`;
    }
    return p.text ? `<div class="cp-logo"><span class="cp-logo__txt">${esc(p.text)}</span></div>` : '';
  },
  heading(p) {
    const sz = p.size ? ` style="font-size:${esc(p.size)}px"` : '';
    return `<h1 class="cp-heading ${alignClass(p.align)}"${sz}>${esc(p.text)}</h1>`;
  },
  text(p) {
    return `<p class="cp-text ${p.muted ? 'is-muted ' : ''}${alignClass(p.align)}">${esc(p.text)}</p>`;
  },
  spacer(p) {
    return `<div class="cp-spacer" style="height:${esc(p.size ?? 16)}px"></div>`;
  },
  'free-login'(p, ctx) {
    return loginForm(
      ctx,
      `<input type="hidden" name="username" value="${esc(FREE_USERNAME)}">` +
        `<input type="hidden" name="password" value="${esc(FREE_PASSWORD)}">` +
        `<button type="submit" class="cp-btn">${esc(p.label || 'Connect for free')}</button>`,
    );
  },
  'voucher-login'(p, ctx) {
    // The voucher code IS the password: portal.js mirrors this field into the
    // hidden password input (data-tk-mirror) — no inline handler, so a future
    // unescaped placeholder can't smuggle an event handler into the page.
    return loginForm(
      ctx,
      field(
        'ticket',
        `<input name="username" autocomplete="off" autocapitalize="characters" aria-label="Voucher code" placeholder="${esc(p.placeholder || 'Enter voucher code')}" data-tk-mirror="password" required>`,
      ) +
        `<input type="hidden" name="password" value="">` +
        `<button type="submit" class="cp-btn">${esc(p.label || 'Use voucher')}</button>`,
    );
  },
  'userpass-login'(p, ctx) {
    return loginForm(
      ctx,
      field('user', `<input name="username" aria-label="${esc(p.userPlaceholder || 'Username')}" placeholder="${esc(p.userPlaceholder || 'Username')}" autocomplete="username" required>`) +
        field('lock', `<input type="password" name="password" aria-label="${esc(p.passPlaceholder || 'Password')}" placeholder="${esc(p.passPlaceholder || 'Password')}" autocomplete="current-password" required>`) +
        `<button type="submit" class="cp-btn">${esc(p.label || 'Log in')}</button>`,
    );
  },
};

export function renderBlock(block, ctx) {
  const fn = RENDERERS[block.type];
  return fn ? fn(block.props || {}, ctx) : '';
}
