// The captive-portal design model. A design = a theme + an ordered list of
// blocks. This replaces the old GrapesJS html/css blob: the editor edits this
// model, and both the live portal and the editor canvas render from it, so what
// you design is exactly what guests see.

export const FONTS = ['Helvetica', 'Inter', 'Verdana', 'IBM Plex Sans', 'Georgia', 'system-ui'];
export const ACCENTS = ['#2F8CEE', '#1761B0', '#E85B9E', '#ADE84F', '#F5B544', '#9C7BFF'];
export const PAGE_BGS = ['#0E2233', '#0A0D12', '#10243A', '#1B1430', '#0C3C37', '#2A1020'];

// Block types the editor offers and the portal can render.
export const BLOCK_TYPES = [
  'logo',
  'heading',
  'text',
  'free-login',
  'voucher-login',
  'userpass-login',
  'spacer',
];

export const LOGIN_TYPES = new Set(['free-login', 'voucher-login', 'userpass-login']);

// Human labels + the icon name (we ship matching inline SVGs in the editor).
export const BLOCK_META = {
  logo: { label: 'Logo / image', icon: 'image', type: 'image' },
  heading: { label: 'Heading', icon: 'heading', type: 'text' },
  text: { label: 'Paragraph', icon: 'type', type: 'text' },
  'free-login': { label: 'Free login', icon: 'zap', type: 'login' },
  'voucher-login': { label: 'Voucher login', icon: 'ticket', type: 'login' },
  'userpass-login': { label: 'Account login', icon: 'user', type: 'login' },
  spacer: { label: 'Spacer', icon: 'move-vertical', type: 'spacer' },
};

export function defaultTheme() {
  return {
    pageBg: '#0E2233',
    pageBg2: '#2F8CEE',
    accent: '#2F8CEE',
    radius: 10,
    width: 420,
    font: 'Helvetica',
  };
}

// Sensible default props per block type (used when a block is dropped in).
export function defaultProps(type) {
  switch (type) {
    case 'logo':
      return { src: '', text: 'Welcome', width: 150, alt: 'logo' };
    case 'heading':
      return { text: 'Connect to our Wi‑Fi', size: 24, align: 'center' };
    case 'text':
      return { text: 'Tap a button below to get online.', align: 'center', muted: false };
    case 'free-login':
      return { label: 'Connect for free', plan: 'free', macRemember: false };
    case 'voucher-login':
      return { label: 'Use voucher', placeholder: 'Enter voucher code', macRemember: false };
    case 'userpass-login':
      return { label: 'Log in', userPlaceholder: 'Username', passPlaceholder: 'Password', macRemember: false };
    case 'spacer':
      return { size: 16 };
    default:
      return {};
  }
}

let counter = 0;
export function newBlock(type, idSeed) {
  const id = 'b' + (idSeed ?? `${Date.now().toString(36)}${(counter++).toString(36)}`);
  return { id, type, props: defaultProps(type) };
}

// The starter template — a polished, ready-to-use page so the editor (and /login)
// never open empty.
export function defaultDesign() {
  return {
    theme: defaultTheme(),
    blocks: [
      { id: 'b-logo', type: 'logo', props: { src: '', text: 'Our Wi‑Fi', width: 150, alt: 'logo' } },
      { id: 'b-head', type: 'heading', props: { text: 'Welcome — get connected', size: 24, align: 'center' } },
      { id: 'b-intro', type: 'text', props: { text: 'Choose how you’d like to get online.', align: 'center', muted: false } },
      { id: 'b-free', type: 'free-login', props: { label: 'Connect for free', plan: 'free', macRemember: false } },
      { id: 'b-vouch', type: 'voucher-login', props: { label: 'Use a voucher', placeholder: 'Enter voucher code', macRemember: false } },
      { id: 'b-foot', type: 'text', props: { text: 'Powered by Tikspot', align: 'center', muted: true } },
    ],
  };
}

// Validate/normalise a model coming from the editor or the DB.
export function normalizeDesign(input) {
  const base = defaultDesign();
  if (!input || typeof input !== 'object') return base;
  const theme = { ...base.theme, ...(input.theme || {}) };
  const blocks = Array.isArray(input.blocks)
    ? input.blocks
        .filter((b) => b && BLOCK_TYPES.includes(b.type))
        .map((b, i) => ({
          id: String(b.id || `b${i}`),
          type: b.type,
          props: { ...defaultProps(b.type), ...(b.props || {}) },
        }))
    : base.blocks;
  return { theme, blocks };
}
