import { supabase } from '../supabase.js';
import { h, initial, param, requireUser, flashFromStorage, setFlash, showFlash, leave } from '../ui.js';
import { round2, splitEqually, splitCustom } from '../logic.js';

function renderForm(group, members, currentUserId) {
  return `
<div class="page-header">
  <div>
    <div class="breadcrumb"><a href="groups.html">Groups</a> / <a href="group.html?id=${h(group.id)}">${h(group.name)}</a> / Add Expense</div>
    <h1 class="page-title">Add Expense</h1>
  </div>
  <a href="group.html?id=${h(group.id)}" class="btn-ghost">← Back</a>
</div>

<div class="form-card">
  <form id="expenseForm">
    <div class="form-row">
      <div class="form-group">
        <label>Description <span class="hint">(separate from custom split names)</span></label>
        <input type="text" name="description" placeholder="Dinner for Niya & Ram..." required>
      </div>
      <div class="form-group">
        <label>Category</label>
        <select name="category">
          <option value="general">📦 General</option>
          <option value="food">🍔 Food</option>
          <option value="travel">✈️ Travel</option>
          <option value="entertainment">🎬 Entertainment</option>
          <option value="shopping">🛍️ Shopping</option>
          <option value="utilities">⚡ Utilities</option>
          <option value="sports">⚽ Sports</option>
          <option value="medical">💊 Medical</option>
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Total Amount (₹)</label>
        <input type="number" name="amount" id="totalAmount" step="0.01" min="1" placeholder="600" required>
      </div>
      <div class="form-group">
        <label>Discount (₹) <span class="hint">optional</span></label>
        <input type="number" name="discount" id="discountAmt" step="0.01" min="0" value="0" placeholder="0">
      </div>
    </div>

    <div class="form-group">
      <label>Paid By</label>
      <select name="paid_by" required>
        ${members.map((m) => `
        <option value="${h(m.id)}" ${m.id === currentUserId ? 'selected' : ''}>${h(m.name)}</option>
        `).join('')}
      </select>
    </div>

    <div class="form-group">
      <label>Split Type</label>
      <div class="split-toggle">
        <label class="split-option">
          <input type="radio" name="split_type" value="equal" checked>
          <span>÷ Equal Split</span>
        </label>
        <label class="split-option">
          <input type="radio" name="split_type" value="custom">
          <span>⚙️ Custom Amounts</span>
        </label>
      </div>
    </div>

    <!-- Equal Split: select members -->
    <div id="equalSplitSection" class="form-group">
      <label>Split Among</label>
      <div class="members-grid">
        ${members.map((m) => `
        <label class="member-checkbox">
          <input type="checkbox" name="split_members" value="${h(m.id)}" checked class="split-member-check">
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
    <div id="customSplitSection" class="form-group" style="display:none">
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
            value="0"
            placeholder="0"
            class="custom-amount-input">
        </div>
        `).join('')}
      </div>
      <div class="split-preview" id="customPreview"></div>
    </div>

    <div class="form-group">
      <label>Notes <span class="hint">optional</span></label>
      <textarea name="notes" rows="2" placeholder="Any additional details..."></textarea>
    </div>

    <button type="submit" class="btn-primary w-full">Add Expense →</button>
  </form>
</div>`;
}

async function main() {
  const ctx = await requireUser();
  if (!ctx) return;
  flashFromStorage();

  const groupId = param('group_id');
  if (!groupId) return leave('Group not found');

  const [groupRes, membersRes] = await Promise.all([
    supabase.from('groups').select('id, name').eq('id', groupId).maybeSingle(),
    supabase.from('group_members').select('profile:profiles!user_id(id, name, avatar_color)').eq('group_id', groupId),
  ]);
  if (groupRes.error || membersRes.error || !groupRes.data) return leave('Access denied');

  const group = groupRes.data;
  const members = membersRes.data
    .map((r) => r.profile)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  document.getElementById('content').innerHTML = renderForm(group, members, ctx.user.id);

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
    const net = netAmount();
    let sum = 0;
    customInputs().forEach((i) => { sum += parseFloat(i.value) || 0; });
    const diff = (net - sum).toFixed(2);
    const ok = Math.abs(parseFloat(diff)) < 0.02;
    document.getElementById('customPreview').innerHTML = `<span class="preview-text ${ok ? 'preview-ok' : 'preview-warn'}">
    Entered: ₹${sum.toFixed(2)} / Net: ₹${net.toFixed(2)} ${ok ? '✓ Balanced' : `(${diff > 0 ? '+' : ''}${diff} remaining)`}
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

    const { error } = await supabase.rpc('add_expense', {
      p_group_id: Number(groupId),
      p_paid_by: form.paid_by.value,
      p_amount: rawAmount,
      p_description: description,
      p_category: form.category.value || 'general',
      p_discount: discount,
      p_notes: form.notes.value.trim() || null,
      p_split_type: splitType,
      p_splits: splits,
    });

    if (error) {
      console.error(error);
      showFlash('error', error.message);
      button.disabled = false;
      return;
    }

    setFlash('success', `Expense "${description}" added! Rs.${effective.toFixed(2)}`);
    location.href = `group.html?id=${groupId}`;
  });

  updatePreview();
}

main();
