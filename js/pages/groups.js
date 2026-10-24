import { supabase } from '../supabase.js';
import { h, icon, requireUser, flashFromStorage, groupCover } from '../ui.js';

function renderGroups(groups) {
  const total = groups.reduce((t, g) => t + (parseFloat(g.total_spent) || 0), 0);
  const action = (href, ic, label) => `<a href="${href}" class="hero-action"><span class="circle">${icon(ic)}</span>${label}</a>`;
  return `
<div class="hero">
  <div class="hero-top">
    <div class="hero-brand"><img src="img/logo.svg" alt="" width="26" height="26">Hisaab</div>
  </div>
  <div class="hero-label">Total spent in your groups</div>
  <div class="hero-amount"><small>₹</small>${h(total.toLocaleString('en-IN', { maximumFractionDigits: 0 }))}</div>
  <div class="hero-actions">
    ${action('new-group.html', 'plus', 'New group')}
    ${action('friends.html', 'friends', 'Friends')}
    ${action('activity.html', 'activity', 'Activity')}
  </div>
</div>

<div class="section-head"><h2>Your groups</h2><span class="hint-text">${groups.length} ${groups.length === 1 ? 'group' : 'groups'}</span></div>

${groups.length === 0 ? `
<div class="empty-state">
  <div class="empty-icon">${icon('groups')}</div>
  <h2>No groups yet</h2>
  <p>Create a group to start splitting expenses with friends</p>
  <a href="new-group.html" class="btn-primary">${icon('plus')} Create your first group</a>
</div>
` : `
<div class="groups-list">
  ${groups.map((group) => `
  <a href="group.html?id=${h(group.id)}" class="group-card">
    ${groupCover(group.category)}
    <div class="group-info">
      <div class="group-name">${h(group.name)}</div>
      <div class="group-cat">${h(group.category || 'general')} · ${h(group.member_count)} ${Number(group.member_count) === 1 ? 'member' : 'members'}</div>
    </div>
    <div class="group-total">
      <strong>₹${h(parseFloat(group.total_spent).toLocaleString('en-IN', { maximumFractionDigits: 0 }))}</strong>
      <small>spent</small>
    </div>
    <span class="group-chevron">${icon('chevron')}</span>
  </a>
  `).join('')}
</div>
<a href="new-group.html" class="btn-primary fab round" aria-label="New group">${icon('plus')}</a>
`}`;
}

document.querySelector('.main-content').classList.add('hero-page', 'has-fab');

async function main() {
  const ctx = await requireUser();
  if (!ctx) return;
  flashFromStorage();

  const content = document.getElementById('content');
  const cacheKey = 'hisaab_groups_v2_' + ctx.user.id;
  let shown = null;
  try { shown = sessionStorage.getItem(cacheKey); } catch (e) { /* ignore */ }
  if (shown) content.innerHTML = shown;            // last list, on screen instantly

  const { data: groups, error } = await supabase.rpc('my_groups');
  if (error) {
    console.error(error);
    if (!shown) content.innerHTML = '<div class="flash flash-error">Could not load groups</div>';
    return;
  }
  const html = renderGroups(groups || []);
  if (html !== shown) content.innerHTML = html;
  try { sessionStorage.setItem(cacheKey, html); } catch (e) { /* ignore */ }
}

main();