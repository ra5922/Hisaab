import { supabase } from '../supabase.js';
import { h, icon, requireUser, flashFromStorage } from '../ui.js';

const money = (n) => '₹' + parseFloat(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

function dayLabel(date) {
  const d = new Date(date);
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

const time = (date) => new Date(date).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

async function main() {
  const ctx = await requireUser();
  if (!ctx) return;
  flashFromStorage();
  const me = ctx.user.id;
  const content = document.getElementById('content');
  const cacheKey = 'hisaab_activity_v2_' + me;
  let cached = null;
  try { cached = sessionStorage.getItem(cacheKey); } catch (e) { /* ignore */ }
  if (cached) content.innerHTML = cached;            // last feed, on screen instantly

  const [groupsRes, membersRes, expensesRes, settlementsRes] = await Promise.all([
    supabase.from('groups').select('id, name, created_by, created_at, creator:profiles!created_by(name)'),
    supabase.from('group_members').select('group_id, user_id, joined_at, profile:profiles!user_id(name), group:groups(name)'),
    supabase.from('expenses')
      .select('id, description, amount, discount, created_at, paid_by, group_id, payer:profiles!paid_by(name), group:groups(name), splits(user_id, amount_owed)')
      .order('created_at', { ascending: false }).limit(150),
    supabase.from('settlements')
      .select('id, amount, created_at, group_id, from_user, to_user, from_profile:profiles!from_user(name), to_profile:profiles!to_user(name), group:groups(name)')
      .order('created_at', { ascending: false }).limit(100),
  ]);

  const failure = groupsRes.error || membersRes.error || expensesRes.error || settlementsRes.error;
  if (failure) {
    console.error(failure);
    if (!cached) content.innerHTML = '<div class="flash flash-error">Could not load activity</div>';
    return;
  }

  const who = (id, name) => (id === me ? 'You' : name || 'Someone');
  const events = [];

  for (const g of groupsRes.data) {
    events.push({
      at: g.created_at, icon: 'flag', tone: 'pink', href: `group.html?id=${g.id}`,
      text: `<b>${h(who(g.created_by, g.creator && g.creator.name))}</b> created the group <b>${h(g.name)}</b>`,
    });
  }

  const createdBy = Object.fromEntries(groupsRes.data.map((g) => [g.id, g.created_by]));
  for (const m of membersRes.data) {
    if (m.user_id === createdBy[m.group_id]) continue;   // the creator is covered by "created the group"
    events.push({
      at: m.joined_at, icon: 'userPlus', tone: 'blue', href: `group.html?id=${m.group_id}`,
      text: `<b>${h(who(m.user_id, m.profile && m.profile.name))}</b> joined <b>${h(m.group ? m.group.name : 'a group')}</b>`,
    });
  }

  for (const e of expensesRes.data) {
    const net = parseFloat(e.amount) - parseFloat(e.discount || 0);
    const myShare = (e.splits || []).filter((s) => s.user_id === me).reduce((t, s) => t + parseFloat(s.amount_owed), 0);
    let sub = '';
    let cls = '';
    if (e.paid_by === me) {
      const back = net - myShare;
      if (back > 0.01) { sub = `You get back ${money(back)}`; cls = 'amount-positive'; }
    } else if (myShare > 0) {
      sub = `You owe ${money(myShare)}`; cls = 'amount-negative';
    }
    events.push({
      at: e.created_at, icon: 'card', tone: '', href: `expense.html?id=${e.id}`,
      text: `<b>${h(who(e.paid_by, e.payer && e.payer.name))}</b> added <b>“${h(e.description)}”</b> in <b>${h(e.group ? e.group.name : 'a group')}</b>`,
      sub, cls, amount: money(net),
    });
  }

  for (const s of settlementsRes.data) {
    const involvesMe = s.from_user === me || s.to_user === me;
    events.push({
      at: s.created_at, icon: 'checkCircle', tone: 'green', href: `group.html?id=${s.group_id}`,
      text: `<b>${h(who(s.from_user, s.from_profile && s.from_profile.name))}</b> paid <b>${h(who(s.to_user, s.to_profile && s.to_profile.name))}</b> in <b>${h(s.group ? s.group.name : 'a group')}</b>`,
      sub: involvesMe ? (s.to_user === me ? 'You received this' : 'You paid this') : '',
      cls: s.to_user === me ? 'amount-positive' : '', amount: money(s.amount),
    });
  }

  events.sort((a, b) => new Date(b.at) - new Date(a.at));
  const shown = events.slice(0, 120);

  let html = `
<div class="page-header">
  <div class="page-head-text">
    <h1 class="page-title">Activity</h1>
    <p class="page-subtitle">Everything happening in your groups</p>
  </div>
</div>`;

  if (shown.length === 0) {
    html += `<div class="empty-state"><div class="empty-icon">${icon('clock')}</div><h2>Nothing yet</h2><p>Create a group or add an expense and it will show up here.</p><a href="new-group.html" class="btn-primary">Create a group</a></div>`;
  } else {
    let last = '';
    html += '<div class="activity-list">';
    shown.forEach((ev) => {
      const label = dayLabel(ev.at);
      if (label !== last) { html += `</div><div class="date-label">${h(label)}</div><div class="activity-list">`; last = label; }
      html += `
      <a href="${h(ev.href)}" class="activity-item">
        <span class="activity-icon ${ev.tone}">${icon(ev.icon)}</span>
        <div class="activity-text">
          ${ev.text}
          ${ev.sub ? `<div class="activity-sub ${h(ev.cls)}">${h(ev.sub)} · ${h(time(ev.at))}</div>` : `<div class="activity-sub">${h(time(ev.at))}</div>`}
        </div>
        ${ev.amount ? `<span class="activity-amount">${h(ev.amount)}</span>` : ''}
      </a>`;
    });
    html += '</div>';
  }
  if (html !== cached) content.innerHTML = html;
  try { sessionStorage.setItem(cacheKey, html); } catch (e) { /* ignore */ }
}

main();
