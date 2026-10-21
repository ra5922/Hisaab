import { supabase } from '../supabase.js';
import { h, requireUser, flashFromStorage } from '../ui.js';

const EMOJI_MAP = { food: '🍔', travel: '✈️', entertainment: '🎬', shopping: '🛍️', utilities: '⚡', general: '📦', sports: '⚽', medical: '💊' };

function renderGroups(groups) {
  return `
<div class="page-header">
  <div>
    <h1 class="page-title">My Groups</h1>
    <p class="page-subtitle">Manage your shared expenses</p>
  </div>
  <a href="new-group.html" class="btn-primary">+ New Group</a>
</div>

${groups.length === 0 ? `
<div class="empty-state">
  <div class="empty-icon">🧑‍🤝‍🧑</div>
  <h2>No groups yet</h2>
  <p>Create a group to start splitting expenses with friends</p>
  <a href="new-group.html" class="btn-primary">Create Your First Group</a>
</div>
` : `
<div class="groups-grid">
  ${groups.map((group) => `
  <a href="group.html?id=${h(group.id)}" class="group-card">
    <div class="group-card-header">
     <span class="category-badge category-${h(group.category)}">${h(EMOJI_MAP[group.category] || '📦')} ${h(group.category)}</span>
      <span class="group-date">${h(new Date(group.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }))}</span>
    </div>
    <h3 class="group-name">${h(group.name)}</h3>
    <div class="group-stats">
      <div class="stat">
        <span class="stat-value">${h(group.member_count)}</span>
        <span class="stat-label">members</span>
      </div>
      <div class="stat">
        <span class="stat-value">${h(group.expense_count)}</span>
        <span class="stat-label">expenses</span>
      </div>
      <div class="stat">
        <span class="stat-value">₹${h(parseFloat(group.total_spent).toFixed(0))}</span>
        <span class="stat-label">total</span>
      </div>
    </div>
  </a>
  `).join('')}
</div>
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
