import { supabase } from '../supabase.js';
import { h, initial, param, requireUser, flashFromStorage, setFlash, showFlash, initTabs, leave } from '../ui.js';
import { calculateBalances, computeStats, computeInsights } from '../logic.js';
import { renderCharts } from '../charts.js';
import { downloadCSV, downloadPDF } from '../export.js';

const EMOJIS = { food: '🍔', travel: '✈️', entertainment: '🎬', shopping: '🛍️', utilities: '⚡', general: '📦', sports: '⚽', medical: '💊' };

function renderGroup({ group, members, expenses, balances, settlements, insights, currentUserId }) {
  return `
<div class="page-header">
  <div>
    <div class="breadcrumb"><a href="groups.html">Groups</a> / ${h(group.name)}</div>
    <h1 class="page-title">${h(group.name)}</h1>
    <span class="category-badge category-${h(group.category)}">${h(group.category)}</span>
  </div>
  <div class="header-actions">
    <button type="button" id="btn-csv" class="btn-ghost">⬇ CSV</button>
    <button type="button" id="btn-pdf" class="btn-ghost">⬇ PDF</button>
    <a href="add-expense.html?group_id=${h(group.id)}" class="btn-primary">+ Add Expense</a>
  </div>
</div>

<!-- Tab Navigation -->
<div class="tabs">
  <button class="tab active" data-tab="expenses">💳 Expenses</button>
  <button class="tab" data-tab="balances">⚖️ Balances</button>
  <button class="tab" data-tab="settle">✅ Settle Up</button>
  <button class="tab" data-tab="charts">📊 Charts</button>
  <button class="tab" data-tab="history">🕒 History</button>
</div>

<!-- EXPENSES TAB -->
<div id="tab-expenses" class="tab-content active">
  ${expenses.length === 0 ? `
  <div class="empty-state small">
    <div class="empty-icon">💸</div>
    <p>No expenses yet. <a href="add-expense.html?group_id=${h(group.id)}">Add the first one!</a></p>
  </div>
` : `
  <div class="insights-grid">
    <div class="insight-card">
      <span class="insight-icon">🧑‍💼</span>
      <strong>Top spender:</strong> ${h(insights.topSpender)}
    </div>
    <div class="insight-card">
      <span class="insight-icon">🍔</span>
      <strong>Highest category:</strong> ${h(insights.topCategory)}
    </div>
    <div class="insight-card">
      <span class="insight-icon">📈</span>
      <strong>Trend:</strong> ${h(insights.monthlyTrend)} (Total: ₹${h(insights.totalSpent)})
    </div>
  </div>
  <div class="expense-list">
    ${expenses.map((exp) => `
    <div class="expense-item">
      <div class="expense-left">
        <span class="expense-category-icon">${h(EMOJIS[exp.category] || '📦')}</span>
        <div class="expense-info">
          <div class="expense-desc">${h(exp.description)}</div>
          <div class="expense-meta">
            <span class="badge-category">${h(exp.category)}</span>
            <span>paid by <strong>${h(exp.paid_by_name)}</strong></span>
            <span class="expense-date">${h(new Date(exp.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }))}</span>
            ${exp.notes ? `<span class="note-tag" title="${h(exp.notes)}">📝 note</span>` : ''}
          </div>
          ${exp.discount > 0 ? `
          <div class="discount-tag">🏷️ ₹${h(parseFloat(exp.discount).toFixed(0))} discount applied</div>
          ` : ''}
        </div>
      </div>
      <div class="expense-right">
        <div class="expense-amount">₹${h((parseFloat(exp.amount) - parseFloat(exp.discount)).toFixed(2))}</div>
        ${exp.discount > 0 ? `
        <div class="original-price">₹${h(parseFloat(exp.amount).toFixed(2))}</div>
        ` : ''}
        <div class="split-type-tag">${exp.split_type === 'custom' ? '⚙️ custom' : '÷ equal'}</div>
        <div class="expense-actions">
          <a href="expense.html?id=${h(exp.id)}" class="btn-tiny">View</a>
          <button type="button" class="btn-tiny btn-danger" data-delete-expense="${h(exp.id)}">✕</button>
        </div>
      </div>
    </div>
    `).join('')}
  </div>
  `}
</div>

<!-- BALANCES TAB -->
<div id="tab-balances" class="tab-content">
  <div class="balances-grid">
    ${balances.net.map((u) => `
    <div class="balance-card ${u.net > 0 ? 'owed' : u.net < 0 ? 'owes' : 'settled'}">
      <div class="balance-avatar" style="background:${h(u.avatar_color)}">${initial(u.name)}</div>
      <div class="balance-name">${h(u.name)}</div>
      <div class="balance-amount">
        ${u.net > 0.01 ? `
          <span class="amount-positive">gets back ₹${h(u.net.toFixed(2))}</span>
        ` : u.net < -0.01 ? `
          <span class="amount-negative">owes ₹${h(Math.abs(u.net).toFixed(2))}</span>
        ` : `
          <span class="amount-zero">settled up ✓</span>
        `}
      </div>
    </div>
    `).join('')}
  </div>

  ${balances.transactions.length > 0 ? `
  <h3 class="section-title">Suggested Payments</h3>
  <div class="transactions-list">
    ${balances.transactions.map((t) => `
    <div class="transaction-item">
      <div class="transaction-from">
        <span class="avatar-dot-sm" style="background:${h(t.from.avatar_color)}">${initial(t.from.name)}</span>
        ${h(t.from.name)}
      </div>
      <div class="transaction-arrow">
        <span>pays ₹${h(t.amount.toFixed(2))}</span>
        <span>→</span>
      </div>
      <div class="transaction-to">
        <span class="avatar-dot-sm" style="background:${h(t.to.avatar_color)}">${initial(t.to.name)}</span>
        ${h(t.to.name)}
      </div>
    </div>
    `).join('')}
  </div>
  ` : `
  <div class="all-settled"><span>🎉</span> All settled up!</div>
  `}
</div>

<!-- SETTLE UP TAB -->
<div id="tab-settle" class="tab-content">
  <div class="form-card">
    <h3>Record a Payment</h3>
    <form id="settle-form">
      <div class="form-row">
        <div class="form-group">
          <label>You are paying</label>
          <select name="to_user" required>
            <option value="">— Select person —</option>
            ${members.filter((m) => m.id !== currentUserId).map((m) => `
            <option value="${h(m.id)}">${h(m.name)}</option>
            `).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Amount (₹)</label>
          <input type="number" name="amount" step="0.01" min="1" placeholder="200" required>
        </div>
      </div>
      <div class="form-group">
        <label>Note <span class="hint">(optional)</span></label>
        <input type="text" name="note" placeholder="UPI transfer, cash, etc.">
      </div>
      <button type="submit" class="btn-primary">Record Settlement ✓</button>
    </form>
  </div>
</div>

<!-- CHARTS TAB -->
<div id="tab-charts" class="tab-content">
  <div class="charts-grid">
    <div class="chart-card">
      <h3>Spending by Person</h3>
      <canvas id="spendingChart" width="400" height="250"></canvas>
    </div>
    <div class="chart-card">
      <h3>By Category</h3>
      <canvas id="categoryChart" width="400" height="250"></canvas>
    </div>
    <div class="chart-card">
      <h3>Monthly Trend</h3>
      <canvas id="monthlyChart" width="400" height="250"></canvas>
    </div>
  </div>
</div>

<!-- HISTORY TAB -->
<div id="tab-history" class="tab-content">
  <h3 class="section-title">Settlement History</h3>
  ${settlements.length === 0 ? `
  <div class="empty-state small"><p>No settlements recorded yet.</p></div>
  ` : `
  <div class="history-list">
    ${settlements.slice(0, 20).map((s) => `
    <div class="history-item">
      <div class="history-avatars">
        <span class="avatar-dot-sm" style="background:${h(s.from_color)}">${initial(s.from_name)}</span>
      </div>
      <div class="history-info">
        <span><strong>${h(s.from_name)}</strong> paid <strong>${h(s.to_name)}</strong></span>
        ${s.note ? `<span class="note-text"> · ${h(s.note)}</span>` : ''}
        <div class="history-date">${h(new Date(s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</div>
      </div>
      <div class="history-amount">₹${h(parseFloat(s.amount).toFixed(2))}</div>
    </div>
    `).join('')}
  </div>
  `}

  ${group.created_by === currentUserId ? `
  <div class="danger-zone">
    <h4>Danger Zone</h4>
    <button type="button" id="delete-group" class="btn-danger">🗑️ Delete Group</button>
  </div>
  ` : ''}
</div>`;
}

async function main() {
  const ctx = await requireUser();
  if (!ctx) return;
  flashFromStorage();

  const id = param('id');
  if (!id) return leave('Group not found');
  const currentUserId = ctx.user.id;

  // Everything the page needs, fetched in parallel
  const [groupRes, membersRes, expensesRes, settlementsRes] = await Promise.all([
    supabase.from('groups').select('*').eq('id', id).maybeSingle(),
    supabase.from('group_members').select('profile:profiles!user_id(id, name, email, avatar_color)').eq('group_id', id),
    supabase.from('expenses')
      .select('*, payer:profiles!paid_by(name, avatar_color), splits(user_id, amount_owed, is_settled)')
      .eq('group_id', id)
      .order('created_at', { ascending: false }),
    supabase.from('settlements')
      .select('*, from_profile:profiles!from_user(name, avatar_color), to_profile:profiles!to_user(name, avatar_color)')
      .eq('group_id', id)
      .order('created_at', { ascending: false }),
  ]);

  const failure = groupRes.error || membersRes.error || expensesRes.error || settlementsRes.error;
  if (failure) {
    console.error(failure);
    return leave('Could not load group');
  }
  const group = groupRes.data;
  if (!group) return leave('Group not found or access denied');

  const members = membersRes.data
    .map((r) => r.profile)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  const expenses = expensesRes.data.map((e) => ({
    ...e,
    paid_by_name: e.payer ? e.payer.name : 'Unknown',
  }));

  const settlements = settlementsRes.data.map((s) => ({
    ...s,
    from_name: s.from_profile ? s.from_profile.name : 'Unknown',
    from_color: s.from_profile ? s.from_profile.avatar_color : '#6366f1',
    to_name: s.to_profile ? s.to_profile.name : 'Unknown',
  }));

  const balances = calculateBalances(members, expenses, settlements);
  const stats = computeStats(expenses);
  const insights = computeInsights(stats);

  document.title = `${group.name} | SplitSync`;
  const content = document.getElementById('content');
  content.innerHTML = renderGroup({ group, members, expenses, balances, settlements, insights, currentUserId });

  initTabs((name) => {
    if (name === 'charts') setTimeout(() => renderCharts(stats), 50);
  });

  // ----- Export -----
  document.getElementById('btn-csv').addEventListener('click', () => downloadCSV(group, expenses));
  document.getElementById('btn-pdf').addEventListener('click', () => {
    try {
      downloadPDF({ group, expenses, members, balances });
    } catch (err) {
      console.error(err);
      showFlash('error', 'Could not create the PDF');
    }
  });

  // ----- Delete an expense -----
  content.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete-expense]');
    if (!btn) return;
    if (!confirm('Delete this expense?')) return;

    const { data, error } = await supabase.from('expenses').delete().eq('id', btn.dataset.deleteExpense).select();
    if (error || !data || data.length === 0) {
      console.error(error);
      return showFlash('error', 'Delete failed');
    }
    setFlash('success', 'Expense deleted');
    location.reload();
  });

  // ----- Settle up -----
  document.getElementById('settle-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const amount = parseFloat(form.amount.value);
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;

    const { error } = await supabase.rpc('settle_up', {
      p_group_id: Number(id),
      p_to_user: form.to_user.value,
      p_amount: amount,
      p_note: form.note.value.trim() || null,
    });

    if (error) {
      console.error(error);
      showFlash('error', 'Settlement failed');
      button.disabled = false;
      return;
    }
    setFlash('success', `Settlement of ₹${form.amount.value} recorded!`);
    location.reload();
  });

  // ----- Delete the group (creator only) -----
  const deleteGroup = document.getElementById('delete-group');
  if (deleteGroup) {
    deleteGroup.addEventListener('click', async () => {
      if (!confirm('Delete this entire group and all its expenses? This cannot be undone.')) return;
      const { data, error } = await supabase.from('groups').delete().eq('id', id).select();
      if (error || !data || data.length === 0) {
        console.error(error);
        return showFlash('error', 'Only the group creator can delete it');
      }
      setFlash('success', 'Group deleted');
      location.href = 'groups.html';
    });
  }
}

main();
