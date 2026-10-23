import { supabase } from '../supabase.js';
import { h, icon, categoryIcon, param, requireUser, flashFromStorage, setFlash, showFlash, leave } from '../ui.js';

async function main() {
  // If the person is not signed in, this sends them to login and brings them back here afterwards.
  const ctx = await requireUser();
  if (!ctx) return;
  flashFromStorage();

  const code = param('code');
  if (!code) return leave('This invite link is not valid');

  const { data: info, error } = await supabase.rpc('invite_preview', { p_code: code });
  if (error) {
    console.error(error);
    return leave('Could not open the invite link');
  }
  if (!info) return leave('This invite link is not valid any more');

  document.title = `Join ${info.name} | Hisaab`;
  const content = document.getElementById('content');

  if (info.already_member) {
    content.innerHTML = `
<div class="form-card join-card">
  <div class="empty-icon">${icon('checkCircle')}</div>
  <h2>You are already in ${h(info.name)}</h2>
  <div class="join-actions">
    <a href="group.html?id=${h(info.group_id)}" class="btn-primary">Open group ${icon('arrowRight')}</a>
  </div>
</div>`;
    return;
  }

  content.innerHTML = `
<div class="form-card join-card">
  <div class="empty-icon">${categoryIcon(info.category)}</div>
  <p class="hint-text">You have been invited to join</p>
  <h2>${h(info.name)}</h2>
  <p class="hint-text">${h(info.member_count)} ${info.member_count === 1 ? 'member' : 'members'}</p>
  <div class="join-actions">
    <button type="button" id="join-btn" class="btn-primary">Join group</button>
    <a href="groups.html" class="btn-ghost">Not now</a>
  </div>
</div>`;

  document.getElementById('join-btn').addEventListener('click', async (e) => {
    e.target.disabled = true;
    const { data: groupId, error: joinError } = await supabase.rpc('join_group', { p_code: code });
    if (joinError) {
      console.error(joinError);
      showFlash('error', joinError.message);
      e.target.disabled = false;
      return;
    }
    setFlash('success', `You joined "${info.name}"!`);
    location.href = `group.html?id=${groupId}`;
  });
}

main();
