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
  if (bar) bar.content = next === 'light' ? '#f4f4f8' : '#0f0f17';
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

// ---------- Shared bits: back button, group cover ----------

const ICONS = {
  groups: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9" r="2.4"/><path d="M17.5 13.8c2.1.3 3.5 1.9 3.5 4.2"/></svg>',
  activity: '<svg viewBox="0 0 24 24"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
  friends: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5"/></svg>',
  profile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18c1.2-2.2 3.2-3.2 5.5-3.2s4.3 1 5.5 3.2"/></svg>',
};

// Round glass "<" button for the top-left corner. Pass the page it should go to.
export const backButton = (href) =>
  `<a href="${h(href)}" class="back-btn" aria-label="Back"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></a>`;

export const EMOJIS = { food: '🍔', travel: '✈️', entertainment: '🎬', shopping: '🛍️', utilities: '⚡', general: '📦', sports: '⚽', medical: '💊' };

// Group "image": a coloured cover tile with the category icon
export const groupCover = (category) =>
  `<div class="group-cover cover-${h(category || 'general')}"><span>${EMOJIS[category] || '📦'}</span></div>`;

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
    `<a href="${href}" class="nav-item${active === key ? ' active' : ''}"${active === key ? ' aria-current="page"' : ''}>${ICONS[key]}<span>${label}</span></a>`;
  nav.innerHTML = `<nav class="bottom-nav" aria-label="Main">
    ${item('groups', 'groups.html', 'Groups')}
    ${item('activity', 'activity.html', 'Activity')}
    ${item('friends', 'friends.html', 'Friends')}
    ${item('profile', 'profile.html', 'Profile')}
  </nav>`;
}

// Use on every page that needs a signed-in user.
// Sends visitors to the login page if they are not signed in.
export async function requireUser() {
  initTheme();
  renderNav();   // draw the bar straight away so it never blinks between pages
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const here = (location.pathname.split('/').pop() || 'groups.html') + location.search;
    location.replace('login.html?next=' + encodeURIComponent(here));
    return null;
  }
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  const me = profile || {
    id: session.user.id,
    name: session.user.email.split('@')[0],
    email: session.user.email,
    avatar_color: '#6366f1',
  };
  return { user: session.user, profile: me };
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