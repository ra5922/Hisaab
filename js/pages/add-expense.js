import { supabase } from '../supabase.js';
import { h, initial, icon, CATEGORIES, param, requireUser, flashFromStorage, setFlash, showFlash, leave, backButton } from '../ui.js';
import { round2, splitEqually, splitCustom } from '../logic.js';

function renderForm(group, members, currentUserId, expense) {
  const editing = !!expense;
  const sharesById = {};
  if (editing) expense.splits.forEach((s) => { sharesById[s.user_id] = s; });
  const isCustom = editing && expense.split_type === 'custom';
  const selectedPayer = editing ? expense.paid_by : currentUserId;
  const categories = CATEGORIES;
  // Custom shares are typed as parts of the full amount (the discount is applied on top), so undo that here
  const rawShare = (userId) => {
    const s = sharesById[userId];
    if (!s) return 0;
    const net = parseFloat(expense.amount) - parseFloat(expense.discount || 0);
    return net > 0 ? Math.round(parseFloat(s.amount_owed) * parseFloat(expense.amount) / net * 100) / 100 : 0;
  };
  return `
<div class="page-header">
  ${backButton(editing ? 'expense.html?id=' + expense.id : 'group.html?id=' + group.id)}
  <div class="page-head-text">
    <h1 class="page-title">${editing ? 'Edit Expense' : 'Add Expense'}</h1>
    <p class="page-subtitle">${h(group.name)}</p>
  </div>
</div>

<div class="form-card">
  <form id="expenseForm">
    <div class="form-row">
      <div class="form-group">
        <label>Description <span class="hint">(separate from custom split names)</span></label>
        <input type="text" name="description" placeholder="Dinner for Niya & Ram..." value="${editing ? h(expense.description) : ''}" required>
      </div>
      <div class="form-group">
        <label>Category</label>
        <select name="category">
          ${categories.map(([value, label]) => `<option value="${value}" ${editing && expense.category === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Total Amount (₹)</label>
        <input type="number" name="amount" id="totalAmount" step="0.01" min="1" placeholder="600" value="${editing ? h(expense.amount) : ''}" required>
      </div>
      <div class="form-group">
        <label>Discount (₹) <span class="hint">optional</span></label>
        <input type="number" name="discount" id="discountAmt" step="0.01" min="0" value="${editing ? h(expense.discount || 0) : 0}" placeholder="0">
      </div>
    </div>

    <div class="form-group">
      <label>Paid By</label>
      <select name="paid_by" required>
        ${members.map((m) => `
        <option value="${h(m.id)}" ${m.id === selectedPayer ? 'selected' : ''}>${h(m.name)}</option>
        `).join('')}
      </select>
    </div>

    <div class="form-group">
      <label>Split Type</label>
      <div class="split-toggle">
        <label class="split-option">
          <input type="radio" name="split_type" value="equal" ${isCustom ? '' : 'checked'}>
          <span>Equal split</span>
        </label>
        <label class="split-option">
          <input type="radio" name="split_type" value="custom" ${isCustom ? 'checked' : ''}>
          <span>Custom amounts</span>
        </label>
      </div>
    </div>

    <!-- Equal Split: select members -->
    <div id="equalSplitSection" class="form-group" ${isCustom ? 'style="display:none"' : ''}>
      <label>Split Among</label>
      <div class="members-grid">
        ${members.map((m) => `
        <label class="member-checkbox">
          <input type="checkbox" name="split_members" value="${h(m.id)}" ${(!editing || isCustom || sharesById[m.id]) ? 'checked' : ''} ${isCustom ? 'disabled' : ''} class="split-member-check">
          <div class="member-chip">
            <span class="avatar-dot-sm" style="background:${h(m.avatar_color)}">${initial(m.name)}</span>
            <span class="member-name">${h(m.name)}</span>
          </div>
        </label>
        `).join('')}
      </div>
      <div class="split-preview" id="equalPreview"></div>
    </div>

    <!-- Custom Split -->
    <div id="customSplitSection" class="form-group" ${isCustom ? '' : 'style="display:none"'}>
      <label>Enter Each Person's Share (₹)</label>
      <div class="custom-splits">
        ${members.map((m) => `
        <div class="custom-split-row">
          <div class="member-label">
            <span class="avatar-dot-sm" style="background:${h(m.avatar_color)}">${initial(m.name)}</span>
            <span>${h(m.name)}</span>
          </div>
          <input type="number"
            data-user-id="${h(m.id)}"
            step="0.01"
            min="0"
            value="${isCustom ? rawShare(m.id) : 0}"
            placeholder="0"
            class="custom-amount-input">
        </div>
        `).join('')}
      </div>
      <div class="split-preview" id="customPreview"></div>
    </div>

    <div class="form-group">
      <label>Notes <span class="hint">optional</span></label>
      <textarea name="notes" rows="2" placeholder="Any additional details...">${editing ? h(expense.notes || '') : ''}</textarea>
    </div>

    <button type="submit" class="btn-primary w-full">${icon('check')} ${editing ? 'Save Changes' : 'Add Expense'}</button>
  </form>
</div>`;
}

async function main() {
  const ctx = await requireUser();
  if (!ctx) return;
  flashFromStorage();

  const groupId = param('group_id');
  if (!groupId) return leave('Group not found');

  const expenseId = param('expense_id');

  const [groupRes, membersRes, expenseRes] = await Promise.all([
    supabase.from('groups').select('id, name').eq('id', groupId).maybeSingle(),
    supabase.from('group_members').select('profile:profiles!user_id(id, name, avatar_color)').eq('group_id', groupId),
    expenseId
      ? supabase.from('expenses').select('*, splits(user_id, amount_owed)').eq('id', expenseId).eq('group_id', groupId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (groupRes.error || membersRes.error || expenseRes.error || !groupRes.data) return leave('Access denied');

  const expense = expenseRes.data;
  if (expenseId && !expense) return leave('Expense not found', `group.html?id=${groupId}`);
  if (expense && expense.paid_by !== ctx.user.id && expense.created_by !== ctx.user.id) {
    return leave('Only the person who added or paid for an expense can edit it', `group.html?id=${groupId}`);
  }

  const group = groupRes.data;
  const members = membersRes.data
    .map((r) => r.profile)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  document.title = `${expense ? 'Edit Expense' : 'Add Expense'} | Hisaab`;
  document.getElementById('content').innerHTML = renderForm(group, members, ctx.user.id, expense);

  const form = document.getElementById('expenseForm');
  const totalEl = document.getElementById('totalAmount');
  const discountEl = document.getElementById('discountAmt');
  const equalChecks = () => document.querySelectorAll('.split-member-check');
  const customInputs = () => document.querySelectorAll('.custom-amount-input');

  // ----- Live previews -----
  const netAmount = () => (parseFloat(totalEl.value) || 0) - (parseFloat(discountEl.value) || 0);

  function updatePreview() {
    const net = netAmount();
    const count = document.querySelectorAll('.split-member-check:checked').length;
    const preview = document.getElementById('equalPreview');
    if (count > 0 && net > 0) {
      preview.innerHTML = `<span class="preview-text">₹${net.toFixed(2)} ÷ ${count} = <strong>₹${(net / count).toFixed(2)} per person</strong></span>`;
    } else {
      preview.innerHTML = '';
    }
  }

  function updateCustomPreview() {
    // Shares are typed as parts of the full amount; the discount is then taken off each share proportionally.
    const total = parseFloat(totalEl.value) || 0;
    let sum = 0;
    customInputs().forEach((i) => { sum += parseFloat(i.value) || 0; });
    const diff = (total - sum).toFixed(2);
    const ok = Math.abs(parseFloat(diff)) < 0.02;
    const discount = parseFloat(discountEl.value) || 0;
    document.getElementById('customPreview').innerHTML = `<span class="preview-text ${ok ? 'preview-ok' : 'preview-warn'}">
    Entered: ₹${sum.toFixed(2)} / Total: ₹${total.toFixed(2)} ${ok ? '- balanced' : `(${diff > 0 ? '+' : ''}${diff} remaining)`}${discount > 0 ? ` · after ₹${discount.toFixed(2)} discount: ₹${(total - discount).toFixed(2)}` : ''}
  </span>`;
  }

  function setSplitType(type) {
    document.getElementById('equalSplitSection').style.display = type === 'equal' ? '' : 'none';
    document.getElementById('customSplitSection').style.display = type === 'custom' ? '' : 'none';
    equalChecks().forEach((el) => { el.disabled = type === 'custom'; });
  }

  totalEl.addEventListener('input', () => { updatePreview(); updateCustomPreview(); });
  discountEl.addEventListener('input', () => { updatePreview(); updateCustomPreview(); });
  equalChecks().forEach((el) => el.addEventListener('change', updatePreview));
  customInputs().forEach((el) => el.addEventListener('input', updateCustomPreview));
  form.querySelectorAll('input[name="split_type"]').forEach((el) =>
    el.addEventListener('change', () => setSplitType(el.value))
  );

  // ----- Save -----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const description = form.description.value.trim();
    if (!description) return showFlash('error', 'Description is required');

    const rawAmount = parseFloat(form.amount.value);
    const discount = parseFloat(form.discount.value) || 0;
    const effective = round2(rawAmount - discount);
    if (!(effective > 0)) return showFlash('error', 'Effective amount after discount must be positive');

    const splitType = form.split_type.value;
    let splits;

    if (splitType === 'custom') {
      const entries = [...customInputs()].map((i) => ({
        user_id: i.dataset.userId,
        value: parseFloat(i.value) || 0,
      }));
      splits = splitCustom(entries, rawAmount, discount);
      if (splits.length === 0) return showFlash('error', 'Please enter amounts for the members');
    } else {
      const chosen = [...document.querySelectorAll('.split-member-check:checked')].map((el) => el.value);
      if (chosen.length === 0) return showFlash('error', 'Select at least one member to split with');
      splits = splitEqually(chosen, effective);
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;

    const payload = {
      p_paid_by: form.paid_by.value,
      p_amount: rawAmount,
      p_description: description,
      p_category: form.category.value || 'general',
      p_discount: discount,
      p_notes: form.notes.value.trim() || null,
      p_split_type: splitType,
      p_splits: splits,
    };
    const { error } = expense
      ? await supabase.rpc('update_expense', { p_expense_id: Number(expenseId), ...payload })
      : await supabase.rpc('add_expense', { p_group_id: Number(groupId), ...payload });

    if (error) {
      console.error(error);
      showFlash('error', error.message);
      button.disabled = false;
      return;
    }

    setFlash('success', expense ? `Expense "${description}" updated` : `Expense "${description}" added! Rs.${effective.toFixed(2)}`);
    location.href = `group.html?id=${groupId}`;
  });

  updatePreview();
  updateCustomPreview();
}

main();
