import { supabase } from '../supabase.js';
import { h, initial, icon, requireUser, flashFromStorage, showFlash, toggleTheme, currentTheme, confirmBox, cacheProfile, signOut } from '../ui.js';

const APP_VERSION = '1.2';
const COLORS = ['#0ea5e9', '#0284c7', '#06b6d4', '#14b8a6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

const row = (id, ic, tone, title, sub, trailing) => `
  <button type="button" class="menu-row" id="${id}">
    <span class="menu-icon ${tone}">${icon(ic)}</span>
    <span class="menu-text"><strong>${title}</strong>${sub ? `<small>${sub}</small>` : ''}</span>
    ${trailing}
  </button>`;
const chevron = `<span class="menu-chevron">${icon('chevron')}</span>`;

function openModal(html) {
  const el = document.createElement('div');
  el.className = 'modal open';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="modal-card">${html}</div>`;
  const close = () => el.remove();
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) close(); });
  document.body.appendChild(el);
  return { el, close };
}

async function main() {
  const ctx = await requireUser();
  if (!ctx) return;
  flashFromStorage();
  const me = ctx.user.id;
  let p = { ...ctx.profile };
  const content = document.getElementById('content');

  const draw = () => {
    content.innerHTML = `
<div class="page-header">
  <div class="page-head-text"><h1 class="page-title">Profile</h1></div>
</div>

<div class="profile-hero">
  <div class="avatar-wrap">
    <span class="avatar-dot avatar-lg" style="background:${h(p.avatar_color)}">${initial(p.name)}</span>
    <button type="button" class="avatar-edit" id="edit-avatar" aria-label="Edit profile">${icon('edit')}</button>
  </div>
  <h2>${h(p.name)}</h2>
  <p>${h(p.email)}</p>
  <div class="profile-actions">
    <button type="button" class="btn-ghost" id="edit-profile">${icon('edit')} Edit profile</button>
  </div>
</div>

<div class="stats-row">
  <div class="stat"><strong id="stat-groups">-</strong><small>Groups</small></div>
  <div class="stat"><strong id="stat-friends">-</strong><small>Friends</small></div>
  <div class="stat"><strong id="stat-paid">-</strong><small>Expenses</small></div>
</div>

<div class="menu-label">Preferences</div>
<div class="menu">
  <div class="menu-row" style="cursor:default">
    <span class="menu-icon blue" id="theme-icon"></span>
    <span class="menu-text"><strong id="theme-label"></strong><small>Switch the app between dark and light</small></span>
    <button type="button" class="switch" data-theme-switch role="switch" aria-label="Dark mode"></button>
  </div>
  ${row('open-color', 'palette', 'pink', 'Avatar colour', 'Pick the colour friends see next to your name', chevron)}
</div>

<div class="menu-label">Account</div>
<div class="menu">
  ${row('open-name', 'profile', '', 'Name', h(p.name), chevron)}
  <div class="menu-row" style="cursor:default">
    <span class="menu-icon green">${icon('mail')}</span>
    <span class="menu-text"><strong>Email</strong><small>${h(p.email)}</small></span>
  </div>
</div>

<div class="menu-label">Hisaab</div>
<div class="menu">
  ${row('invite-app', 'share', 'green', 'Invite friends to Hisaab', 'Share the app link', chevron)}
  <a class="menu-row" href="new-group.html">
    <span class="menu-icon">${icon('groups')}</span>
    <span class="menu-text"><strong>Start a new group</strong><small>Trips, flats, dinners</small></span>
    ${chevron}
  </a>
  <div class="menu-row" style="cursor:default">
    <span class="menu-icon blue">${icon('info')}</span>
    <span class="menu-text"><strong>About</strong><small>Hisaab v${APP_VERSION} - split expenses, not friendships</small></span>
  </div>
</div>

<div class="logout-wrap">
  <button type="button" id="logout-btn" class="btn-soft-danger">${icon('logout')} Log out</button>
</div>
<p class="app-footer">Signed in as ${h(p.email)}</p>`;

    // ----- Dark mode switch -----
    const sw = document.querySelector('[data-theme-switch]');
    const label = document.getElementById('theme-label');
    const themeIcon = document.getElementById('theme-icon');
    const syncTheme = () => {
      const dark = currentTheme() === 'dark';
      sw.classList.toggle('on', dark);
      sw.setAttribute('aria-checked', dark ? 'true' : 'false');
      label.textContent = dark ? 'Dark mode' : 'Light mode';
      themeIcon.innerHTML = icon(dark ? 'moon' : 'sun');
    };
    syncTheme();
    sw.addEventListener('click', () => { toggleTheme(); syncTheme(); });

    // ----- Edit name / colour -----
    const editProfile = () => {
      let color = p.avatar_color;
      const { el, close } = openModal(`
        <h3>Edit profile</h3>
        <p class="hint-text">This is how friends see you in groups.</p>
        <form id="profile-form">
          <div class="form-group" style="margin-top:1rem">
            <label>Name</label>
            <input type="text" name="name" value="${h(p.name)}" maxlength="40" required autocomplete="name">
          </div>
          <div class="form-group">
            <label>Avatar colour</label>
            <div class="swatches">
              ${COLORS.map((c) => `<button type="button" class="swatch${c === color ? ' selected' : ''}" data-color="${c}" style="background:${c}" aria-label="Colour ${c}">${icon('check')}</button>`).join('')}
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn-ghost" data-close>Cancel</button>
            <button type="submit" class="btn-primary">Save</button>
          </div>
        </form>`);
      el.querySelector('.swatches').addEventListener('click', (e) => {
        const b = e.target.closest('.swatch');
        if (!b) return;
        color = b.dataset.color;
        el.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('selected', s === b));
      });
      el.querySelector('#profile-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = e.target.name.value.trim();
        if (!name) return;
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        const { error } = await supabase.from('profiles').update({ name, avatar_color: color }).eq('id', me);
        if (error) {
          console.error(error);
          btn.disabled = false;
          close();
          return showFlash('error', 'Could not save your profile');
        }
        p = { ...p, name, avatar_color: color };
        cacheProfile(p);
        close();
        draw();
        loadStats();
        showFlash('success', 'Profile updated');
      });
    };
    ['edit-profile', 'edit-avatar', 'open-name', 'open-color'].forEach((bid) => document.getElementById(bid).addEventListener('click', editProfile));

    // ----- Invite friends to the app -----
    document.getElementById('invite-app').addEventListener('click', async () => {
      const url = new URL('login.html', location.href).href;
      const text = 'Split expenses with me on Hisaab';
      if (navigator.share) {
        try { await navigator.share({ title: 'Hisaab', text, url }); } catch (e) { /* cancelled */ }
        return;
      }
      try { await navigator.clipboard.writeText(`${text}: ${url}`); showFlash('success', 'App link copied'); }
      catch (e) { showFlash('error', url); }
    });

    // ----- Log out -----
    document.getElementById('logout-btn').addEventListener('click', async () => {
      const ok = await confirmBox({ title: 'Log out?', message: 'You can log back in any time with your email and password.', confirmText: 'Log out' });
      if (ok) signOut();
    });
  };

  // Little numbers under the avatar: loaded after the page is already on screen
  const loadStats = async () => {
    const count = (q) => q.then((r) => (r.error ? null : r.count));
    const [groups, people, paid] = await Promise.all([
      count(supabase.from('group_members').select('group_id', { count: 'exact', head: true }).eq('user_id', me)),
      count(supabase.from('profiles').select('id', { count: 'exact', head: true })),
      count(supabase.from('expenses').select('id', { count: 'exact', head: true }).eq('paid_by', me)),
    ]);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v === null ? '-' : v; };
    set('stat-groups', groups);
    set('stat-friends', people === null ? null : Math.max(0, people - 1));
    set('stat-paid', paid);
  };

  draw();
  loadStats();
}

main();