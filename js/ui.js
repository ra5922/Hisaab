import { supabase } from './supabase.js';

// ---------- Small helpers ----------

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&#34;', "'": '&#39;' };

// Escape text before putting it into HTML
export const h = (v) => (v === undefined || v === null ? '' : String(v).replace(/[&<>"']/g, (c) => ESC[c]));

// First letter of a name, for avatar circles
export const initial = (name) => h(String(name || '?')[0].toUpperCase());

export const param = (name) => new URLSearchParams(location.search).get(name);

// "next" = the page to open after logging in (e.g. an invite link). Only same-site pages are accepted.
export function nextPage() {
  const next = param('next');
  return next && /^[a-z0-9-]+\.html(\?[^#]*)?$/i.test(next) ? next : 'groups.html';
}

// ---------- Theme (dark / light) ----------

export function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

// Keeps the dark-mode switch on the Profile page in sync (does nothing on other pages)
function updateThemeButton() {
  const sw = document.querySelector('.switch[data-theme-switch]');
  if (sw) {
    sw.classList.toggle('on', currentTheme() === 'dark');
    sw.setAttribute('aria-checked', currentTheme() === 'dark' ? 'true' : 'false');
  }
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch (e) { /* ignore */ }
  const bar = document.querySelector('meta[name=theme-color]');
  if (bar) bar.content = next === 'light' ? '#eef5fb' : '#0b1220';
  updateThemeButton();
}

export function initTheme() {
  let saved = 'dark';
  try { saved = localStorage.getItem('theme') || 'dark'; } catch (e) { /* ignore */ }
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeButton();
}

// ---------- Flash messages (shown once, can survive a page change) ----------

const FLASH_KEY = 'hisaab_flash';

export function showFlash(type, message) {
  const box = document.getElementById('flash');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `flash flash-${type}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.5s ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 500);
  }, 4000);
}

// Remember a message to show on the next page
export function setFlash(type, message) {
  try { sessionStorage.setItem(FLASH_KEY, JSON.stringify({ type, message })); } catch (e) { /* ignore */ }
}

export function flashFromStorage() {
  try {
    const raw = sessionStorage.getItem(FLASH_KEY);
    if (!raw) return;
    sessionStorage.removeItem(FLASH_KEY);
    const f = JSON.parse(raw);
    showFlash(f.type, f.message);
  } catch (e) { /* ignore */ }
}

// ---------- Icons (inline SVG, no emojis anywhere) ----------

const PATHS = {
  groups: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9" r="2.4"/><path d="M17.5 13.8c2.1.3 3.5 1.9 3.5 4.2"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  friends: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5"/>',
  profile: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18c1.2-2.2 3.2-3.2 5.5-3.2s4.3 1 5.5 3.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  download: '<path d="M12 4v11M7.5 11L12 15.5 16.5 11M5 20h14"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>',
  edit: '<path d="M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16l-1 4z"/><path d="M14.5 6.5l3 3"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/>',
  scale: '<path d="M12 4v16M7 20h10M5 8h14"/><path d="M5 8l-3 6a3 3 0 0 0 6 0L5 8zM19 8l-3 6a3 3 0 0 0 6 0l-3-6z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
  note: '<path d="M6 3h9l4 4v14H6V3z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  logout: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3.5 7l8.5 6 8.5-6"/>',
  share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4M8.2 13.2l7.6 4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.6-2.1-.5-1.2.2-2.4 1.5-2.4H17a4 4 0 0 0 4-4C21 6.7 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
  userPlus: '<circle cx="10" cy="8" r="3.6"/><path d="M3 20c0-3.9 3.1-6.5 7-6.5 1.5 0 2.8.4 3.9 1M18 14v6M15 17h6"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  wallet: '<path d="M4 7a2 2 0 0 1 2-2h11v4"/><rect x="4" y="7" width="17" height="13" rx="3"/><circle cx="16.5" cy="13.5" r="1.1"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14.5c1 1.2 2.3 1.8 4 1.8s3-.6 4-1.8M9 9.5v.01M15 9.5v.01"/>',
  // category icons
  food: '<path d="M6 3v7a2 2 0 0 0 4 0V3M8 3v18M17 3c-2 2-3 4.5-3 7 0 1.6 1 2.6 3 2.6V21"/>',
  travel: '<path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  entertainment: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7.5 4v16M16.5 4v16M3 9h4.5M3 15h4.5M16.5 9H21M16.5 15H21"/>',
  shopping: '<path d="M6 8h12l1.2 12H4.8L6 8z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  utilities: '<path d="M13 2.5L4.5 14H11l-1 7.5L19.5 10H13l0-7.5z"/>',
  general: '<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3.3 8L12 13l8.7-5M12 13v8"/>',
  sports: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H5v1.2A3 3 0 0 0 8 10M16 6h3v1.2A3 3 0 0 1 16 10M12 13v4M8.5 21h7M10 17h4"/>',
  medical: '<path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z"/>',
};

// icon('plus') -> inline SVG that takes the colour of the surrounding text
export const icon = (name, cls = '') =>
  `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || PATHS.general}</svg>`;

export const CATEGORIES = [
  ['general', 'General'], ['food', 'Food'], ['travel', 'Travel'], ['entertainment', 'Entertainment'],
  ['shopping', 'Shopping'], ['utilities', 'Utilities'], ['sports', 'Sports'], ['medical', 'Medical'],
];

export const categoryIcon = (category) => icon(PATHS[category] ? category : 'general');

// Round glass "<" button for the top-left corner. Pass the page it should go to.
export const backButton = (href) =>
  `<a href="${h(href)}" class="back-btn" aria-label="Back">${icon('back')}</a>`;

// Group "image": a coloured cover tile with the category icon
export const groupCover = (category) =>
  `<div class="group-cover cover-${h(category || 'general')}">${categoryIcon(category)}</div>`;

// ---------- Load a big library only when it is needed (keeps pages fast) ----------

const loading = {};
export function loadScript(src) {
  if (!loading[src]) {
    loading[src] = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = () => { delete loading[src]; reject(new Error('Could not load ' + src)); };
      document.head.appendChild(el);
    });
  }
  return loading[src];
}

// ---------- Styled confirm box (replaces the browser's confirm()) ----------

export function confirmBox({ title, message, confirmText = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'modal open';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `
      <div class="modal-card">
        <div class="modal-icon ${danger ? 'danger' : ''}">${icon(danger ? 'trash' : 'info')}</div>
        <h3>${h(title)}</h3>
        <p class="hint-text">${h(message)}</p>
        <div class="modal-actions">
          <button type="button" class="btn-ghost" data-no>Cancel</button>
          <button type="button" class="${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${h(confirmText)}</button>
        </div>
      </div>`;
    const done = (v) => { el.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('[data-no]')) done(false);
      else if (e.target.closest('[data-yes]')) done(true);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(el);
    el.querySelector('[data-no]').focus();
  });
}

// ---------- Navbar + sign-in check ----------

// Which tab is lit up for the current page
function activeTab() {
  const page = location.pathname.split('/').pop() || 'groups.html';
  if (page === 'activity.html') return 'activity';
  if (page === 'friends.html') return 'friends';
  if (page === 'profile.html') return 'profile';
  return 'groups';   // groups, group, new-group, add-expense, expense, join
}

export function renderNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const active = activeTab();
  const item = (key, href, label) =>
    `<a href="${href}" class="nav-item${active === key ? ' active' : ''}"${active === key ? ' aria-current="page"' : ''}>${icon(key)}<span>${label}</span></a>`;
  nav.innerHTML = `<nav class="bottom-nav" aria-label="Main">
    ${item('groups', 'groups.html', 'Groups')}
    ${item('activity', 'activity.html', 'Activity')}
    ${item('friends', 'friends.html', 'Friends')}
    ${item('profile', 'profile.html', 'Profile')}
  </nav>`;
}

// ---------- Profile cache (saves a network round trip on every page) ----------

const PROFILE_KEY = 'hisaab_profile';
const readCachedProfile = (userId) => {
  try {
    const p = JSON.parse(sessionStorage.getItem(PROFILE_KEY) || 'null');
    return p && p.id === userId ? p : null;
  } catch (e) { return null; }
};
export function cacheProfile(p) {
  try { sessionStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
}

// Use on every page that needs a signed-in user.
// Sends visitors to the login page if they are not signed in.
export async function requireUser() {
  initTheme();
  renderNav();   // draw the bar straight away so it never blinks between pages
  const { data: { session } } = await supabase.auth.getSession();   // reads the saved session, no network
  if (!session) {
    const here = (location.pathname.split('/').pop() || 'groups.html') + location.search;
    location.replace('login.html?next=' + encodeURIComponent(here));
    return null;
  }
  const fallback = {
    id: session.user.id,
    name: (session.user.email || 'you').split('@')[0],
    email: session.user.email,
    avatar_color: '#0284c7',
  };
  let me = readCachedProfile(session.user.id);
  if (!me) {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    me = profile || fallback;
    cacheProfile(me);
  }
  return { user: session.user, profile: me };
}

export async function signOut() {
  try { sessionStorage.clear(); } catch (e) { /* ignore */ }
  await supabase.auth.signOut();
  location.href = 'login.html';
}

// Use on login / signup: if already signed in, go to the groups page.
export async function redirectIfSignedIn() {
  initTheme();
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    location.replace(nextPage());
    return true;
  }
  return false;
}

// Go to another page and show an error there
export function leave(message, page = 'groups.html') {
  setFlash('error', message);
  location.replace(page);
}

// ---------- Tabs (group page) ----------

export function initTabs(onChange) {
  const key = 'activeTab_' + location.pathname + location.search;
  const tabs = document.querySelectorAll('.tab');

  const activate = (name) => {
    document.querySelectorAll('.tab-content').forEach((el) => el.classList.remove('active'));
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    const content = document.getElementById('tab-' + name);
    if (content) content.classList.add('active');
    try { sessionStorage.setItem(key, name); } catch (e) { /* ignore */ }
    if (onChange) onChange(name);
  };

  tabs.forEach((t) => t.addEventListener('click', () => activate(t.dataset.tab)));

  let saved = null;
  try { saved = sessionStorage.getItem(key); } catch (e) { /* ignore */ }
  if (saved && document.getElementById('tab-' + saved)) activate(saved);
}