import { supabase } from './supabase.js';

// ---------- Small helpers ----------

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&#34;', "'": '&#39;' };

// Escape text before putting it into HTML
export const h = (v) => (v === undefined || v === null ? '' : String(v).replace(/[&<>"']/g, (c) => ESC[c]));

// First letter of a name, for avatar circles
export const initial = (name) => h(String(name || '?')[0].toUpperCase());

export const param = (name) => new URLSearchParams(location.search).get(name);

// ---------- Theme (dark / light) ----------

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function updateThemeButton() {
  const btn = document.querySelector('.theme-toggle');
  if (btn) btn.textContent = currentTheme() === 'dark' ? '🌙' : '☀️';
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch (e) { /* ignore */ }
  updateThemeButton();
}

export function initTheme() {
  let saved = 'dark';
  try { saved = localStorage.getItem('theme') || 'dark'; } catch (e) { /* ignore */ }
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeButton();
}

// ---------- Flash messages (shown once, can survive a page change) ----------

const FLASH_KEY = 'splitsync_flash';

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

// ---------- Navbar + sign-in check ----------

export function renderNav(profile) {
  const nav = document.getElementById('nav');
  if (!nav) return;
  nav.innerHTML = `<nav class="navbar">
    <a href="groups.html" class="nav-brand">
      <span class="brand-icon">💸</span>
      <span>SplitSync</span>
    </a>
    <div class="nav-actions">
      <button class="theme-toggle" type="button" title="Toggle dark mode">🌙</button>
      <div class="nav-user">
        <span class="avatar-dot" style="background:${h(profile.avatar_color)}">${initial(profile.name)}</span>
        <span class="nav-username">${h(profile.name)}</span>
      </div>
      <button class="btn-ghost" id="logout-btn" type="button">Logout</button>
    </div>
  </nav>`;
  nav.querySelector('.theme-toggle').addEventListener('click', toggleTheme);
  nav.querySelector('#logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.href = 'login.html';
  });
  updateThemeButton();
}

// Use on every page that needs a signed-in user.
// Sends visitors to the login page if they are not signed in.
export async function requireUser() {
  initTheme();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    location.replace('login.html');
    return null;
  }
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  const me = profile || {
    id: session.user.id,
    name: session.user.email.split('@')[0],
    email: session.user.email,
    avatar_color: '#6366f1',
  };
  renderNav(me);
  return { user: session.user, profile: me };
}

// Use on login / signup: if already signed in, go to the groups page.
export async function redirectIfSignedIn() {
  initTheme();
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    location.replace('groups.html');
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
