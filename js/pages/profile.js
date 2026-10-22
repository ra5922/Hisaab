import { supabase } from '../supabase.js';
import { h, initial, requireUser, flashFromStorage, toggleTheme, currentTheme } from '../ui.js';

async function main() {
  const ctx = await requireUser();
  if (!ctx) return;
  flashFromStorage();
  const p = ctx.profile;

  document.getElementById('content').innerHTML = `
<div class="page-header">
  <div class="page-head-text"><h1 class="page-title">Profile</h1></div>
</div>

<div class="profile-card">
  <span class="avatar-dot avatar-lg" style="background:${h(p.avatar_color)}">${initial(p.name)}</span>
  <h2>${h(p.name)}</h2>
  <p>${h(p.email)}</p>
</div>

<div class="settings-row">
  <span id="theme-label"></span>
  <button type="button" class="switch" data-theme-switch role="switch" aria-label="Dark mode"></button>
</div>

<div class="logout-wrap">
  <button type="button" id="logout-btn" class="btn-danger">Log out</button>
</div>`;

  const sw = document.querySelector('[data-theme-switch]');
  const label = document.getElementById('theme-label');
  const sync = () => {
    const dark = currentTheme() === 'dark';
    sw.classList.toggle('on', dark);
    sw.setAttribute('aria-checked', dark ? 'true' : 'false');
    label.textContent = dark ? '🌙 Dark mode' : '☀️ Light mode';
  };
  sync();
  sw.addEventListener('click', () => { toggleTheme(); sync(); });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.href = 'login.html';
  });
}

main();
