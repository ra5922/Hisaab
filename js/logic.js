// Pure calculation code (no database, no page). Easy to test.

export const round2 = (n) => Math.round(n * 100) / 100;

// Equal split. Works in paise so the shares always add up to exactly the net amount
// (e.g. ₹100 among 3 people → 33.34 + 33.33 + 33.33).
export function splitEqually(userIds, netAmount) {
  const total = Math.round(netAmount * 100);
  const base = Math.floor(total / userIds.length);
  let extra = total - base * userIds.length;
  return userIds.map((id) => {
    const cents = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
    return { user_id: id, amount: cents / 100 };
  });
}

// Custom split. Each person's share of the raw amount has the discount applied proportionally.
// entries: [{ user_id, value }]  (people with value <= 0 are skipped)
export function splitCustom(entries, rawAmount, discount) {
  return entries
    .filter((e) => e.value > 0)
    .map((e) => {
      const share = rawAmount > 0 ? e.value - discount * (e.value / rawAmount) : e.value;
      return { user_id: e.user_id, amount: round2(share) };
    });
}

// Who owes whom.
// members:     [{ id, name, avatar_color }]
// expenses:    [{ paid_by, splits: [{ user_id, amount_owed }] }]
// settlements: [{ from_user, to_user, amount }]
export function calculateBalances(members, expenses, settlements) {
  const net = {};
  members.forEach((m) => {
    net[m.id] = { id: m.id, name: m.name, avatar_color: m.avatar_color, net: 0 };
  });

  for (const exp of expenses) {
    for (const s of exp.splits || []) {
      if (s.user_id === exp.paid_by) continue; // your own share of what you paid
      const owed = parseFloat(s.amount_owed);
      if (net[s.user_id] !== undefined) net[s.user_id].net -= owed;
      if (net[exp.paid_by] !== undefined) net[exp.paid_by].net += owed;
    }
  }

  for (const row of settlements) {
    const amount = parseFloat(row.amount);
    if (net[row.from_user] !== undefined) net[row.from_user].net += amount;
    if (net[row.to_user] !== undefined) net[row.to_user].net -= amount;
  }

  const debtors = [];
  const creditors = [];
  Object.values(net).forEach((u) => {
    if (u.net < -0.01) debtors.push({ id: u.id, name: u.name, avatar_color: u.avatar_color, net: Math.abs(u.net) });
    else if (u.net > 0.01) creditors.push({ id: u.id, name: u.name, avatar_color: u.avatar_color, net: u.net });
  });
  debtors.sort((a, b) => b.net - a.net);
  creditors.sort((a, b) => b.net - a.net);

  const transactions = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].net, creditors[j].net);
    if (amount > 0.01) {
      transactions.push({ from: debtors[i], to: creditors[j], amount: round2(amount) });
    }
    debtors[i].net -= amount;
    creditors[j].net -= amount;
    if (debtors[i].net < 0.01) i++;
    if (creditors[j].net < 0.01) j++;
  }

  return { net: Object.values(net), transactions };
}

// Totals for the charts.
// expenses: [{ amount, discount, category, created_at, payer: { name } }]
export function computeStats(expenses) {
  const spending = {};
  const category = {};
  const monthly = {};

  for (const e of expenses) {
    const total = parseFloat(e.amount) - parseFloat(e.discount);
    const who = (e.payer && e.payer.name) || 'Unknown';
    spending[who] = (spending[who] || 0) + total;
    category[e.category] = (category[e.category] || 0) + total;
    const month = new Date(e.created_at).toISOString().slice(0, 7); // YYYY-MM
    monthly[month] = (monthly[month] || 0) + total;
  }

  const byTotalDesc = (obj, key) =>
    Object.entries(obj)
      .map(([k, total]) => ({ [key]: k, total }))
      .sort((a, b) => b.total - a.total);

  return {
    spendingData: byTotalDesc(spending, 'name'),
    categoryData: byTotalDesc(category, 'category'),
    monthlyData: Object.entries(monthly)
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => (a.month < b.month ? -1 : 1)),
  };
}

// The three "insight" cards on the Expenses tab.
export function computeInsights({ spendingData, categoryData, monthlyData }) {
  const inr = (n) => n.toLocaleString('en-IN');
  const topSpender = spendingData[0] ? `${spendingData[0].name} (₹${inr(spendingData[0].total)})` : 'No data';
  const topCategory = categoryData[0] ? `${categoryData[0].category} (₹${inr(categoryData[0].total)})` : 'No data';
  const totalSpent = monthlyData.reduce((sum, r) => sum + r.total, 0);

  let monthlyTrend = 'No previous data';
  if (monthlyData.length >= 2) {
    const latest = monthlyData[monthlyData.length - 1].total;
    const previous = monthlyData[monthlyData.length - 2].total;
    if (previous > 0) {
      const pct = ((latest - previous) / previous * 100).toFixed(1);
      monthlyTrend = pct > 0 ? `+${pct}% vs last month` : `${pct}% vs last month`;
    }
  } else if (monthlyData.length === 1) {
    monthlyTrend = `₹${inr(monthlyData[0].total)} this month`;
  }

  return { topSpender, topCategory, monthlyTrend, totalSpent: inr(totalSpent) };
}
