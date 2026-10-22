import { supabase } from '../supabase.js';
import { h, requireUser, flashFromStorage, groupCover } from '../ui.js';

function renderGroups(groups) {
  return `
<div class="page-header">
  <div class="page-head-text">
    <h1 class="page-title">Groups</h1>
    <p class="page-subtitle">Your shared expenses</p>
  </div>
  <a href="new-group.html" class="btn-primary">+ New</a>
</div>

${groups.length === 0 ? `
<div class="empty-state">
  <div class="empty-icon">🧑‍🤝‍🧑</div>
  <h2>No groups yet</h2>
  <p>Create a group to start splitting expenses with friends</p>
  <a href="new-group.html" class="btn-primary">Create Your First Group</a>
</div>
` : `
<div class="groups-list">
  ${groups.map((group, i) => `
  <a href="group.html?id=${h(group.id)}" class="group-card" style="animation-delay:${Math.min(i, 10) * 40}ms">
    ${groupCover(group.category)}
    <div class="group-info">
      <div class="group-name">${h(group.name)}</div>
    </div>
    <div class="group-total">
      <strong>₹${h(parseFloat(group.total_spent).toLocaleString('en-IN', { maximumFractionDigits: 0 }))}</strong>
      <small>${h(group.member_count)} ${Number(group.member_count) === 1 ? 'member' : 'members'}</small>
    </div>
  </a>
  `).join('')}
</div>
<div class="new-group-wrap"><a href="new-group.html" class="btn-primary">+ Start a new group</a></div>
`}`;
}

async function main() {
  const ctx = await requireUser();
  if (!ctx) return;
  flashFromStorage();

  const content = document.getElementById('content');
  const { data: groups, error } = await supabase.rpc('my_groups');
  if (error) {
    console.error(error);
    content.innerHTML = '<div class="flash flash-error">Could not load groups</div>';
    return;
  }
  content.innerHTML = renderGroups(groups || []);
}

main();