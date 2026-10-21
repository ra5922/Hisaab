// CSV and PDF export, done in the browser (no server needed).

const fileSafe = (name) => String(name || 'group').replace(/[\\/:*?"<>|]/g, '_');
const money = (n, digits = 2) => `Rs.${parseFloat(n).toFixed(digits)}`;

// ---------- CSV ----------

const quote = (v) => `"${String(v === undefined || v === null ? '' : v).replace(/"/g, '""')}"`;

export function buildCsv(expenses) {
  const columns = ['Date', 'Description', 'Category', 'Paid By', 'Amount', 'Discount', 'Net Amount', 'Notes'];
  const rows = expenses.map((e) => [
    new Date(e.created_at).toLocaleDateString('en-IN'),
    e.description,
    e.category,
    e.paid_by_name,
    money(e.amount),
    money(e.discount),
    money(parseFloat(e.amount) - parseFloat(e.discount)),
    e.notes || '',
  ]);
  return [columns, ...rows].map((r) => r.map(quote).join(',')).join('\r\n');
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCSV(group, expenses) {
  const blob = new Blob([buildCsv(expenses)], { type: 'text/csv;charset=utf-8' });
  saveBlob(blob, `${fileSafe(group.name)}-expenses.csv`);
}

// ---------- PDF (jsPDF is loaded as a normal <script> in group.html) ----------

// Draws the report onto a jsPDF document. Same layout as the original app.
// data: { group, expenses, members, balances }  (balances = result of calculateBalances)
export function buildPdf(doc, { group, expenses, members, balances }) {
  const rect = (x, y, w, hgt, color) => {
    doc.setFillColor(color);
    doc.rect(x, y, w, hgt, 'F');
  };
  const text = (str, x, y, { size = 10, bold = false, color = '#000000' } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(color);
    doc.text(String(str), x, y, { baseline: 'top' });
  };

  // ===== HEADER =====
  rect(0, 0, 595, 80, '#6366f1');
  text('SplitSync - Expense Report', 50, 22, { size: 22, bold: true, color: '#ffffff' });
  text(
    `Group: ${group.name}  |  Category: ${group.category}  |  Exported: ${new Date().toLocaleDateString('en-IN')}`,
    50, 52, { size: 11, color: '#ffffff' }
  );

  // ===== SUMMARY =====
  const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount) - parseFloat(e.discount), 0);
  text('Summary', 50, 100, { size: 13, bold: true, color: '#1a1a2e' });
  text(`Total Expenses: ${expenses.length}`, 50, 118, { color: '#444444' });
  text(`Total Amount Spent: Rs.${total.toFixed(2)}`, 50, 133, { color: '#444444' });
  text(`Members: ${members.map((m) => m.name).join(', ')}`, 50, 148, { color: '#444444' });

  // ===== WHO PAYS WHOM =====
  let y = 175;
  text('Who Pays Whom', 50, y, { size: 13, bold: true, color: '#6366f1' });
  y += 20;

  if (balances.transactions.length === 0) {
    rect(50, y, 495, 28, '#d1fae5');
    text('All settled up! No payments needed.', 60, y + 9, { bold: true, color: '#065f46' });
    y += 38;
  } else {
    balances.transactions.forEach((t) => {
      rect(50, y, 495, 26, '#eef2ff');
      text(t.from.name, 60, y + 8, { color: '#1a1a2e' });
      text(`pays  Rs.${t.amount.toFixed(2)}  ->`, 200, y + 8, { bold: true, color: '#6366f1' });
      text(t.to.name, 360, y + 8, { color: '#1a1a2e' });
      y += 30;
    });
  }

  // ===== INDIVIDUAL BALANCES =====
  y += 10;
  text('Individual Balances', 50, y, { size: 13, bold: true, color: '#6366f1' });
  y += 20;

  rect(50, y, 495, 22, '#f1f5f9');
  text('Member', 60, y + 7, { size: 9, bold: true, color: '#374151' });
  text('Status', 300, y + 7, { size: 9, bold: true, color: '#374151' });
  text('Amount', 450, y + 7, { size: 9, bold: true, color: '#374151' });
  y += 26;

  balances.net.forEach((u, idx) => {
    if (y > 700) { doc.addPage(); y = 50; }
    if (idx % 2 === 0) rect(50, y - 2, 495, 20, '#f9fafb');
    text(u.name, 60, y, { size: 9, color: '#374151' });
    if (u.net > 0.01) {
      text('Gets back', 300, y, { size: 9, color: '#065f46' });
      text(`Rs.${u.net.toFixed(2)}`, 450, y, { size: 9, color: '#065f46' });
    } else if (u.net < -0.01) {
      text('Owes', 300, y, { size: 9, color: '#991b1b' });
      text(`Rs.${Math.abs(u.net).toFixed(2)}`, 450, y, { size: 9, color: '#991b1b' });
    } else {
      text('Settled', 300, y, { size: 9, color: '#6b7280' });
      text('Rs.0.00', 450, y, { size: 9, color: '#6b7280' });
    }
    y += 22;
  });

  // ===== EXPENSE HISTORY =====
  y += 15;
  if (y > 650) { doc.addPage(); y = 50; }
  text('Expense History', 50, y, { size: 13, bold: true, color: '#6366f1' });
  y += 20;

  rect(50, y, 495, 22, '#6366f1');
  const head = { size: 9, bold: true, color: '#ffffff' };
  text('Date', 55, y + 7, head);
  text('Description', 110, y + 7, head);
  text('Category', 250, y + 7, head);
  text('Paid By', 330, y + 7, head);
  text('Amount', 420, y + 7, head);
  text('Net', 475, y + 7, head);
  y += 26;

  expenses.forEach((e, idx) => {
    if (y > 750) { doc.addPage(); y = 50; }
    if (idx % 2 === 0) rect(50, y - 2, 495, 18, '#f9fafb');
    const cell = { size: 8, color: '#374151' };
    text(new Date(e.created_at).toLocaleDateString('en-IN'), 55, y, cell);
    text(String(e.description).substring(0, 20), 110, y, cell);
    text(e.category, 250, y, cell);
    text(e.paid_by_name, 330, y, cell);
    text(money(e.amount, 0), 420, y, cell);
    text(money(parseFloat(e.amount) - parseFloat(e.discount), 0), 475, y, cell);
    y += 20;
  });

  // Total row
  if (y > 730) { doc.addPage(); y = 50; }
  rect(50, y, 495, 24, '#6366f1');
  text('TOTAL', 55, y + 7, { bold: true, color: '#ffffff' });
  text(`Rs.${total.toFixed(2)}`, 420, y + 7, { bold: true, color: '#ffffff' });
}

export function downloadPDF(data) {
  const jsPDF = window.jspdf && window.jspdf.jsPDF;
  if (!jsPDF) throw new Error('PDF library did not load');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  buildPdf(doc, data);
  doc.save(`${fileSafe(data.group.name)}-expenses.pdf`);
}
