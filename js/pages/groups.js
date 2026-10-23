import { supabase } from '../supabase.js';
import { h, icon, requireUser, flashFromStorage, groupCover } from '../ui.js';

function renderGroups(groups) {
  return `
<div class="page-header">
  <div class="page-head-text">
    <h1 class="page-title">Groups</h1>
    <p class="page-subtitle">Your shared expenses</p>
  </div>
  <a href="new-group.html" class="btn-primary">${icon('plus')} New</a>
</div>

${groups.length === 0 ? `
<div class="empty-state">
  <div class="empty-icon">${icon('groups')}</div>
  <h2>No groups yet</h2>
  <p>Create a group to start splitting expenses with friends</p>
  <a href="new-group.html" class="btn-primary">Create Your First Group</a>
</div>
` : `
<div class="groups-list">
  ${groups.map((group) => `
  <a href="group.html?id=${h(group.id)}" class="group-card">
    ${groupCover(group.category)}
    <div class="group-info">
      <div class="group-name">${h(group.name)}</div>
      <div class="group-cat">${h(group.category || 'general')}</div>
    </div>
    <div class="group-total">
      <strong>₹${h(parseFloat(group.total_spent).toLocaleString('en-IN', { maximumFractionDigits: 0 }))}</strong>
      <small>${h(group.member_count)} ${Number(group.member_count) === 1 ? 'member' : 'members'}</small>
    </div>
  </a>
  `).join('')}
</div>
<div class="new-group-wrap"><a href="new-group.html" class="btn-primary">${icon('plus')} Start a new group</a></div>
`}`;
}

async function main() {
  const ctx = await requireUser();
  if (!ctx) return;
  flashFromStorage();

  const content = document.getElementById('content');
  const cacheKey = 'hisaab_groups_' + ctx.user.id;
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