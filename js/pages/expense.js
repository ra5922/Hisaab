import { supabase } from '../supabase.js';
import { h, initial, icon, categoryIcon, param, requireUser, flashFromStorage, setFlash, showFlash, leave, backButton, confirmBox } from '../ui.js';

function renderExpense(expense, splits, currentUserId) {
  const effectiveAmount = parseFloat(expense.amount) - (parseFloat(expense.discount) || 0);
  const canEdit = expense.paid_by === currentUserId || expense.created_by === currentUserId;

  return `
<div class="hero">
  <div class="hero-top">
    ${backButton('group.html?id=' + expense.group_id)}
    <div class="hero-title">Expense</div>
    ${canEdit ? `<a href="add-expense.html?group_id=${h(expense.group_id)}&expense_id=${h(expense.id)}" class="icon-btn" aria-label="Edit expense">${icon('edit')}</a>` : '<span style="width:40px"></span>'}
  </div>
  <div class="hero-circle">${categoryIcon(expense.category)}</div>
  <div class="hero-amount"><small>₹</small>${h(effectiveAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}</div>
  <div class="hero-sub">${h(expense.description)}</div>
  <div class="hero-sub" style="font-weight:500">Paid by ${h(expense.paid_by_name)} · ${h(new Date(expense.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }))}</div>
</div>

<div class="detail-grid">
  <div class="detail-card">
    <h3>Expense Details</h3>
    <div class="detail-rows">
      <div class="detail-row">
        <span>Description</span>
        <span>${h(expense.description)}</span>
      </div>
      <div class="detail-row">
        <span>Category</span>
        <span class="badge-category">${h(expense.category)}</span>
      </div>
      <div class="detail-row">
        <span>Total Amount</span>
        <span>₹${h(parseFloat(expense.amount).toLocaleString('en-IN'))}</span>
      </div>
      ${parseFloat(expense.discount) > 0 ? `
      <div class="detail-row">
        <span>Discount</span>
        <span class="amount-positive">-₹${h(parseFloat(expense.discount).toLocaleString('en-IN'))}</span>
      </div>
      <div class="detail-row highlight">
        <span>Net Amount</span>
        <span class="amount-positive">₹${h(effectiveAmount.toLocaleString('en-IN'))}</span>
      </div>
      ` : ''}
      <div class="detail-row">
        <span>Paid by</span>
        <span>${h(expense.paid_by_name)}</span>
      </div>
      ${expense.notes ? `
      <div class="detail-row">
        <span>Notes</span>
        <span class="hint-text">${h(expense.notes)}</span>
      </div>
      ` : ''}
      <div class="detail-row">
        <span>Date</span>
        <span>${h(new Date(expense.created_at).toLocaleDateString('en-IN'))}</span>
      </div>
    </div>
  </div>

  <div class="detail-card">
    <h3>Split Details (${splits.length} shares)</h3>
    <div class="splits-list">
      ${splits.map((split) => `
      <div class="split-row ${split.is_settled ? 'settled' : ''}">
        <div class="split-person">
          <span class="avatar-dot-sm" style="background: ${h(split.avatar_color)}">${initial(split.name)}</span>
          ${h(split.name)}
        </div>
        <div class="split-detail">
          owes <span class="split-amount">₹${h(parseFloat(split.amount_owed).toLocaleString('en-IN'))}</span>
          ${split.is_settled ? `
            <span class="settled-badge">${icon('check')} Settled</span>
          ` : ''}
        </div>
      </div>
      `).join('')}
    </div>
  </div>
</div>

${expense.paid_by === currentUserId ? `
<div class="danger-zone">
  <h4>Delete Expense</h4>
  <button type="button" id="delete-expense" class="btn-danger">${icon('trash')} Delete expense</button>
</div>
` : ''}`;
}

document.querySelector('.main-content').classList.add('hero-page');

async function main() {
  const ctx = await requireUser();
  if (!ctx) return;
  flashFromStorage();

  const id = param('id');
  if (!id) return leave('Expense not found');

  const { data, error } = await supabase
    .from('expenses')
    .select(`*,
      payer:profiles!paid_by(name, avatar_color),
      group:groups(name),
      splits(user_id, amount_owed, is_settled, profile:profiles!user_id(name, avatar_color))`)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error(error);
    return leave('Could not load expense');
  }
  if (!data) return leave('Expense not found');

  const expense = {
    ...data,
    paid_by_name: data.payer ? data.payer.name : 'Unknown',
    group_name: data.group ? data.group.name : 'Group',
  };

  const splits = data.splits
    .map((s) => ({
      ...s,
      name: s.profile ? s.profile.name : 'Unknown',
      avatar_color: s.profile ? s.profile.avatar_color : '#6366f1',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  document.querySelector('.main-content').classList.add('hero-page');
  document.title = `${expense.description} | Hisaab`;
  document.getElementById('content').innerHTML = renderExpense(expense, splits, ctx.user.id);

  const del = document.getElementById('delete-expense');
  if (del) {
    del.addEventListener('click', async () => {
      if (!(await confirmBox({ title: 'Delete this expense?', message: 'This cannot be undone.', confirmText: 'Delete', danger: true }))) return;
      const { data: removed, error: delError } = await supabase.from('expenses').delete().eq('id', id).select();
      if (delError || !removed || removed.length === 0) {
        console.error(delError);
        return showFlash('error', 'Delete failed');
      }
      setFlash('success', 'Expense deleted');
      location.href = `group.html?id=${expense.group_id}`;
    });
  }
}

main();
