import { supabase } from '../supabase.js';
import { h, initial, requireUser, flashFromStorage, showFlash, setFlash } from '../ui.js';

const money = (n) => '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

async function main() {
  const ctx = await requireUser();
  if (!ctx) return;
  flashFromStorage();
  const me = ctx.user.id;
  const content = document.getElementById('content');

  // "Friends" = everyone you share at least one group with (that is what the database lets you see)
  const [profilesRes, membersRes, groupsRes, expensesRes, settlementsRes] = await Promise.all([
    supabase.from('profiles').select('id, name, email, avatar_color'),
    supabase.from('group_members').select('group_id, user_id'),
    supabase.from('groups').select('id, name').order('name'),
    supabase.from('expenses').select('paid_by, splits(user_id, amount_owed)'),
    supabase.from('settlements').select('from_user, to_user, amount'),
  ]);
  const failure = profilesRes.error || membersRes.error || groupsRes.error || expensesRes.error || settlementsRes.error;
  if (failure) {
    console.error(failure);
    content.innerHTML = '<div class="flash flash-error">Could not load friends</div>';
    return;
  }

  const groups = groupsRes.data;
  const sharedCount = {};
  membersRes.data.forEach((m) => { if (m.user_id !== me) sharedCount[m.user_id] = (sharedCount[m.user_id] || 0) + 1; });

  // balance with each friend: positive = they owe you
  const bal = {};
  const add = (id, amt) => { bal[id] = (bal[id] || 0) + amt; };
  expensesRes.data.forEach((e) => {
    (e.splits || []).forEach((s) => {
      const owed = parseFloat(s.amount_owed);
      if (e.paid_by === me && s.user_id !== me) add(s.user_id, owed);
      if (s.user_id === me && e.paid_by !== me) add(e.paid_by, -owed);
    });
  });
  settlementsRes.data.forEach((s) => {
    const amt = parseFloat(s.amount);
    if (s.to_user === me) add(s.from_user, -amt);
    if (s.from_user === me) add(s.to_user, amt);
  });

  const friends = profilesRes.data.filter((p) => p.id !== me).sort((a, b) => a.name.localeCompare(b.name));

  content.innerHTML = `
<div class="page-header">
  <div class="page-head-text">
    <h1 class="page-title">Friends</h1>
    <p class="page-subtitle">${friends.length} ${friends.length === 1 ? 'friend' : 'friends'}</p>
  </div>
</div>

${friends.length === 0 ? `
<div class="empty-state small"><div class="empty-icon">🙋</div><p>No friends yet. Add someone below to get started.</p></div>
` : `
<div class="friends-list">
  ${friends.map((f, i) => {
    const b = bal[f.id] || 0;
    const meta = b > 0.01 ? `<span class="amount-positive">owes you<br>${h(money(b))}</span>`
      : b < -0.01 ? `<span class="amount-negative">you owe<br>${h(money(b))}</span>`
      : `<span class="amount-zero">settled up</span>`;
    return `
  <div class="friend-row" style="animation-delay:${Math.min(i, 10) * 40}ms">
    <span class="avatar-dot" style="background:${h(f.avatar_color)}">${initial(f.name)}</span>
    <div class="friend-info">
      <strong>${h(f.name)}</strong>
      <small>${h(f.email)}</small>
    </div>
    <div class="friend-meta">${meta}</div>
  </div>`;
  }).join('')}
</div>`}

<div class="add-friend-wrap">
  <button type="button" id="add-friend" class="btn-primary add-friend-capsule">＋ Add a friend</button>
</div>

<div class="modal" id="friend-modal" role="dialog" aria-modal="true" aria-labelledby="friend-title">
  <div class="modal-card">
    <h3 id="friend-title">Add a friend</h3>
    <p class="hint-text">Add them to one of your groups using the email they signed up with.</p>
    ${groups.length === 0 ? `
      <p class="hint-text" style="margin-top:1rem">You need a group first.</p>
      <div class="modal-actions">
        <a href="new-group.html" class="btn-primary">Create a group</a>
        <button type="button" class="btn-ghost" data-close>Close</button>
      </div>
    ` : `
    <form id="friend-form">
      <div class="form-group" style="margin-top:1rem">
        <label>Friend's email</label>
        <input type="email" name="email" placeholder="friend@example.com" required autocomplete="off">
      </div>
      <div class="form-group">
        <label>Add to group</label>
        <select name="group" required>
          ${groups.map((g) => `<option value="${h(g.id)}">${h(g.name)}</option>`).join('')}
        </select>
      </div>
      <div class="modal-actions">
        <button type="submit" class="btn-primary">Add friend</button>
        <button type="button" class="btn-ghost" data-close>Cancel</button>
      </div>
    </form>`}
  </div>
</div>`;

  const modal = document.getElementById('friend-modal');
  const close = () => modal.classList.remove('open');
  document.getElementById('add-friend').addEventListener('click', () => modal.classList.add('open'));
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) close(); });

  const form = document.getElementById('friend-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = form.email.value.trim().toLowerCase();
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      const { data, error } = await supabase.rpc('add_members', { p_group_id: Number(form.group.value), p_emails: [email] });
      if (error) {
        console.error(error);
        button.disabled = false;
        close();
        return showFlash('error', error.message);
      }
      if (data.added > 0) setFlash('success', `${email} added!`);
      else if (data.already.length > 0) setFlash('success', `${email} is already in that group`);
      else setFlash('error', `${email} has no Hisaab account yet. Send them an invite link from the group's Members tab.`);
      location.reload();
    });
  }
}

main();
