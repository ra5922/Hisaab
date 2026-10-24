import { supabase } from '../supabase.js';
import { h, initial, param, requireUser, flashFromStorage, setFlash, showFlash, initTabs, leave, backButton, groupCover, categoryIcon, icon, confirmBox, loadScript } from '../ui.js';
import { calculateBalances, computeStats } from '../logic.js';
import { renderCharts } from '../charts.js';
import { downloadCSV, downloadPDF } from '../export.js';

const CHART_JS = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
const JSPDF = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';

const TABS = [
  ['expenses', 'card', 'Expenses'],
  ['balances', 'scale', 'Balances'],
  ['settle', 'checkCircle', 'Settle Up'],
  ['members', 'groups', 'Members'],
  ['charts', 'chart', 'Charts'],
  ['history', 'clock', 'History'],
];

function renderGroup({ group, members, expenses, balances, settlements, currentUserId, inviteLink }) {
  const isCreator = group.created_by === currentUserId;
  const totalSpent = expenses.reduce((t, e) => t + (parseFloat(e.amount) - parseFloat(e.discount || 0)), 0);
  return `
<div class="page-header">
  ${backButton('groups.html')}
  <div class="page-head-text">
    <h1 class="page-title">${h(group.name)}</h1>
  </div>
  ${isCreator ? `<button type="button" class="icon-btn danger" id="delete-group-top" aria-label="Delete group" title="Delete group">${icon('trash')}</button>` : ''}
</div>

<!-- Banner: category colour, icon, members and total -->
<div class="group-banner cover-${h(group.category || 'general')}">
  ${categoryIcon(group.category)}
  <div class="banner-text">
    <strong>₹${h(totalSpent.toLocaleString('en-IN', { maximumFractionDigits: 0 }))} <span>spent</span></strong>
    <span style="text-transform:capitalize">${h(group.category)} · ${members.length} ${members.length === 1 ? 'member' : 'members'}</span>
  </div>
</div>

<!-- One line: tabs on the left, CSV + PDF on the right -->
<div class="toolbar">
  <div class="tool-tabs" role="tablist">
    ${TABS.map(([key, ic, label], i) => `
    <button class="tab${i === 0 ? ' active' : ''}" data-tab="${key}" role="tab" aria-label="${label}" title="${label}">${icon(ic)}<span class="tab-label">${label}</span></button>`).join('')}
  </div>
  <div class="tool-actions">
    <button type="button" id="btn-csv" class="btn-ghost" aria-label="Download CSV">${icon('download')}CSV</button>
    <button type="button" id="btn-pdf" class="btn-ghost" aria-label="Download PDF">${icon('download')}PDF</button>
  </div>
</div>

<!-- EXPENSES TAB -->
<div id="tab-expenses" class="tab-content active">
  ${expenses.length === 0 ? `
  <div class="empty-state small">
    <div class="empty-icon">${icon('wallet')}</div>
    <p>No expenses yet. Tap <b>Add Expense</b> to add the first one.</p>
  </div>
` : `
  <div class="expense-list">
    ${expenses.map((exp) => `
    <div class="expense-item">
      <a class="expense-main" href="expense.html?id=${h(exp.id)}">
        <span class="expense-category-icon cat-${h(exp.category || 'general')}">${categoryIcon(exp.category)}</span>
        <div class="expense-info">
          <div class="expense-desc">${h(exp.description)}</div>
          <div class="expense-meta">
            <span>Paid by ${h(exp.paid_by === currentUserId ? 'you' : exp.paid_by_name)}</span>
            ${exp.notes ? `<span class="note-tag" title="${h(exp.notes)}">${icon('note')}</span>` : ''}
          </div>
          ${exp.discount > 0 ? `<div class="discount-tag">${icon('tag')} ₹${h(parseFloat(exp.discount).toFixed(0))} off</div>` : ''}
        </div>
      </a>
      <div class="expense-right">
        <div class="expense-amount">₹${h((parseFloat(exp.amount) - parseFloat(exp.discount)).toFixed(2))}</div>
        <div class="expense-actions">
          <span class="expense-date">${h(new Date(exp.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }))}</span>
          ${(exp.paid_by === currentUserId || exp.created_by === currentUserId) ? `
          <a href="add-expense.html?group_id=${h(group.id)}&expense_id=${h(exp.id)}" class="mini-btn" aria-label="Edit expense">${icon('edit')}</a>` : ''}
          <button type="button" class="mini-btn danger" data-delete-expense="${h(exp.id)}" aria-label="Delete expense">${icon('trash')}</button>
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
          <span class="amount-zero">${icon('check')} settled up</span>
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
        ${icon('arrowRight')}
      </div>
      <div class="transaction-to">
        <span class="avatar-dot-sm" style="background:${h(t.to.avatar_color)}">${initial(t.to.name)}</span>
        ${h(t.to.name)}
      </div>
    </div>
    `).join('')}
  </div>
  ` : `
  <div class="all-settled">${icon('checkCircle')} All settled up!</div>
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
            <option value="">Select person</option>
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
      <button type="submit" class="btn-primary">${icon('check')} Record Settlement</button>
    </form>
  </div>
</div>

<!-- MEMBERS TAB -->
<div id="tab-members" class="tab-content">
  <div class="form-card">
    <h3>Invite with a link</h3>
    <p class="hint-text">Anyone who opens this link and signs in joins the group. Send it on WhatsApp, SMS, anywhere.</p>
    <div class="invite-row">
      <input type="text" id="invite-link" value="${h(inviteLink)}" readonly>
      <button type="button" id="copy-invite" class="btn-primary">${icon('copy')} Copy link</button>
    </div>
    <div class="invite-actions">
      <a id="share-whatsapp" class="btn-ghost" target="_blank" rel="noopener"
         href="https://wa.me/?text=${encodeURIComponent('Join "' + group.name + '" on Hisaab: ' + inviteLink)}">${icon('share')} WhatsApp</a>
      <button type="button" id="share-native" class="btn-ghost" style="display:none">${icon('share')} Share</button>
      ${isCreator ? `
      <button type="button" id="reset-invite" class="btn-ghost">${icon('link')} New link</button>
      ` : ''}
    </div>
    ${isCreator ? `
    <p class="hint-text">"New link" switches off the old link, for example if it reached the wrong people.</p>
    ` : ''}
  </div>

  <div class="form-card">
    <h3>Add by email</h3>
    <form id="add-members-form">
      <div class="form-group">
        <label>Email addresses <span class="hint">(separate with commas)</span></label>
        <input type="text" name="emails" placeholder="friend@example.com, another@example.com" required>
        <p class="hint-text">They must already have a Hisaab account. If not, send them the invite link above.</p>
      </div>
      <button type="submit" class="btn-primary">${icon('userPlus')} Add to group</button>
    </form>
  </div>

  <h3 class="section-title">Members (${members.length})</h3>
  <div class="members-list">
    ${members.map((m) => `
    <div class="member-row">
      <span class="avatar-dot-sm" style="background:${h(m.avatar_color)}">${initial(m.name)}</span>
      <div class="member-info">
        <strong>${h(m.name)}</strong>${m.id === currentUserId ? ' <span class="hint">(you)</span>' : ''}
        <div class="hint-text">${h(m.email)}</div>
      </div>
      ${m.id === group.created_by ? '<span class="badge-category">creator</span>' : ''}
    </div>
    `).join('')}
  </div>

  ${isCreator ? `
  <div class="danger-zone">
    <h4>Danger zone</h4>
    <p class="hint-text">Deleting the group removes every expense and payment in it for everyone. This cannot be undone.</p>
    <button type="button" id="delete-group" class="btn-danger">${icon('trash')} Delete group</button>
  </div>
  ` : ''}
</div>

<!-- CHARTS TAB -->
<div id="tab-charts" class="tab-content">
  <div class="charts-grid">
    <div class="chart-card">
      <h3>Spending by Person</h3>
      <div class="chart-box"><canvas id="spendingChart"></canvas></div>
    </div>
    <div class="chart-card">
      <h3>By Category</h3>
      <div class="chart-box"><canvas id="categoryChart"></canvas></div>
    </div>
    <div class="chart-card wide">
      <h3>Monthly Trend</h3>
      <div class="chart-box"><canvas id="monthlyChart"></canvas></div>
    </div>
  </div>
</div>

<!-- HISTORY TAB -->
<div id="tab-history" class="tab-content">
  <h3 class="section-title" style="margin-top:0">Settlement History</h3>
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
</div>

<!-- Floating Add Expense capsule, bottom-right -->
<a href="add-expense.html?group_id=${h(group.id)}" class="btn-primary fab" aria-label="Add expense">${icon('plus')} Add Expense</a>`;
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

  document.title = `${group.name} | Hisaab`;
  const content = document.getElementById('content');
  const inviteLink = new URL('join.html?code=' + encodeURIComponent(group.invite_code), location.href).href;
  content.innerHTML = renderGroup({ group, members, expenses, balances, settlements, currentUserId, inviteLink });
  document.querySelector('.main-content').classList.add('has-fab');

  // Chart.js is big, so it is only downloaded the first time the Charts tab opens
  let chartsDrawn = false;
  initTabs((name) => {
    const active = document.querySelector('.tab.active');
    if (active && active.scrollIntoView) active.scrollIntoView({ inline: 'center', block: 'nearest' });
    if (name !== 'charts') return;
    if (chartsDrawn) {
      if (window.Chart) ['spendingChart', 'categoryChart', 'monthlyChart'].forEach((cid) => {
        const c = window.Chart.getChart(document.getElementById(cid));
        if (c) c.resize();
      });
      return;
    }
    chartsDrawn = true;
    loadScript(CHART_JS)
      .then(() => requestAnimationFrame(() => renderCharts(stats)))
      .catch(() => { chartsDrawn = false; showFlash('error', 'Could not load charts. Check your connection.'); });
  });

  // ----- Export -----
  document.getElementById('btn-csv').addEventListener('click', () => downloadCSV(group, expenses));
  document.getElementById('btn-pdf').addEventListener('click', async () => {
    try {
      await loadScript(JSPDF);
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
    if (!(await confirmBox({ title: 'Delete this expense?', message: 'It will be removed for everyone in the group.', confirmText: 'Delete', danger: true }))) return;

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

  // ----- Invite link -----
  const linkBox = document.getElementById('invite-link');
  document.getElementById('copy-invite').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(linkBox.value);
    } catch (err) {
      linkBox.select();
      document.execCommand('copy');
    }
    showFlash('success', 'Invite link copied');
  });

  if (navigator.share) {
    const shareBtn = document.getElementById('share-native');
    shareBtn.style.display = '';
    shareBtn.addEventListener('click', () => {
      navigator.share({ title: 'Hisaab', text: `Join "${group.name}" on Hisaab`, url: linkBox.value }).catch(() => {});
    });
  }

  const resetBtn = document.getElementById('reset-invite');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (!(await confirmBox({ title: 'Make a new invite link?', message: 'The old link will stop working.', confirmText: 'Make new link' }))) return;
      const { error } = await supabase.rpc('reset_invite_code', { p_group_id: Number(id) });
      if (error) {
        console.error(error);
        return showFlash('error', error.message);
      }
      setFlash('success', 'New invite link created');
      location.reload();
    });
  }

  // ----- Add members by email -----
  document.getElementById('add-members-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const emails = form.emails.value.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (emails.length === 0) return showFlash('error', 'Enter at least one email');

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const { data, error } = await supabase.rpc('add_members', { p_group_id: Number(id), p_emails: emails });
    if (error) {
      console.error(error);
      showFlash('error', error.message);
      button.disabled = false;
      return;
    }

    const parts = [];
    if (data.added > 0) parts.push(`${data.added} added`);
    if (data.already.length > 0) parts.push(`already in the group: ${data.already.join(', ')}`);
    if (data.missing.length > 0) parts.push(`no account yet: ${data.missing.join(', ')} (send them the invite link)`);
    setFlash(data.added > 0 && data.missing.length === 0 ? 'success' : 'error', parts.join(' · '));
    location.reload();
  });

  // ----- Delete the group (creator only): trash button in the header + button in the Members tab -----
  const askDeleteGroup = async () => {
    const ok = await confirmBox({
      title: `Delete "${group.name}"?`,
      message: 'This removes the group with every expense and payment in it, for everyone. It cannot be undone.',
      confirmText: 'Delete group',
      danger: true,
    });
    if (!ok) return;
    const { data, error } = await supabase.from('groups').delete().eq('id', id).select();
    if (error || !data || data.length === 0) {
      console.error(error);
      return showFlash('error', 'Only the group creator can delete it');
    }
    setFlash('success', 'Group deleted');
    location.href = 'groups.html';
  };
  ['delete-group', 'delete-group-top'].forEach((bid) => {
    const b = document.getElementById(bid);
    if (b) b.addEventListener('click', askDeleteGroup);
  });
}

main();
