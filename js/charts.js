// Chart.js charts for the Charts tab (same look as the original app).
// Chart.js is loaded as a normal <script> in group.html, so it is available as window.Chart.

export function renderCharts({ spendingData, categoryData, monthlyData }) {
  const Chart = window.Chart;
  if (!Chart) return;

  const SPENDING = { labels: spendingData.map((r) => r.name), values: spendingData.map((r) => r.total) };
  const CATEGORY = { labels: categoryData.map((r) => r.category), values: categoryData.map((r) => r.total) };
  const MONTHLY = { labels: monthlyData.map((r) => r.month), values: monthlyData.map((r) => r.total) };

  if (SPENDING.labels.length === 0 && CATEGORY.labels.length === 0) {
    document.querySelectorAll('.chart-box').forEach((box) => {
      box.style.height = 'auto';
      box.innerHTML = '<div class="no-data">Add expenses to see charts.</div>';
    });
    return;
  }

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const textColor = isDark ? '#e9e9ee' : '#1b1b1f';
  // charts follow the app's colour scheme (the --accent colour in css/style.css)
  const accent = (getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#fcbf2e');
  const soft = (alpha) => (/^#[0-9a-f]{6}$/i.test(accent) ? accent + alpha : accent);

  Chart.defaults.font.family = "'Urbanist', -apple-system, sans-serif";
  Chart.defaults.color = textColor;
  Chart.defaults.font.size = 12;
  Chart.defaults.maintainAspectRatio = false;   // the chart fills its .chart-box instead of keeping its own shape
  Chart.defaults.responsive = true;
  Chart.defaults.font.weight = 500;
  Chart.defaults.animation = { duration: 350 };
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.titleFont = { size: 14, weight: 600 };
  Chart.defaults.plugins.tooltip.bodyFont = { size: 13 };

  // Drawing again on the same canvas needs the old chart removed first
  const fresh = (id) => {
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    const old = Chart.getChart(canvas);
    if (old) old.destroy();
    return canvas;
  };

  const tooltip = (labelFn) => ({
    backgroundColor: 'rgba(0,0,0,0.9)',
    titleColor: 'white',
    bodyColor: 'white',
    borderColor: accent,
    borderWidth: 1,
    cornerRadius: 8,
    displayColors: false,
    callbacks: {
      title: (context) => context[0].label,
      label: labelFn,
    },
  });

  const pointer = (event, elements) => {
    event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
  };

  // 1. Spending by person (horizontal bars)
  const spendingCtx = fresh('spendingChart');
  if (spendingCtx && SPENDING.labels.length) {
    new Chart(spendingCtx, {
      type: 'bar',
      data: {
        labels: SPENDING.labels.slice(0, 8),
        datasets: [{
          label: '₹ Spent',
          data: SPENDING.values.slice(0, 8),
          backgroundColor: soft('cc'),
          borderColor: accent,
          borderRadius: 8,
          borderWidth: 2,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: tooltip((context) => '₹' + context.parsed.x.toLocaleString()),
        },
        scales: {
          x: {
            ticks: { callback: (v) => '₹' + Math.round(v), color: textColor, font: { size: 12, weight: 600 } },
            grid: { color: soft('33') },
            border: { color: soft('4d') },
          },
          y: { grid: { display: false }, ticks: { font: { size: 11 }, callback(v) { const l = String(this.getLabelForValue(v)); return l.length > 12 ? l.slice(0, 11) + '…' : l; } } },
        },
        onHover: pointer,
              },
    });
  }

  // 2. By category (doughnut)
  const categoryCtx = fresh('categoryChart');
  if (categoryCtx && CATEGORY.labels.length) {
    new Chart(categoryCtx, {
      type: 'doughnut',
      data: {
        labels: CATEGORY.labels,
        datasets: [{
          data: CATEGORY.values,
          backgroundColor: [accent, '#3b82f6', '#22c55e', '#ef4444', '#ec4899', '#8b5cf6'],
          borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim() || '#26272d',
          borderWidth: 3,
          hoverBorderWidth: 3,
          hoverOffset: 6,
          borderRadius: 8,
        }],
      },
      options: {
        responsive: true,
        cutout: '65%',
        interaction: { intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { padding: 14, boxWidth: 10, usePointStyle: true, pointStyle: 'circle' } },
          tooltip: tooltip((context) => '₹' + context.parsed.toLocaleString()),
        },
        onHover: pointer,
      },
    });
  }

  // 3. Monthly trend (line)
  const monthlyCtx = fresh('monthlyChart');
  if (monthlyCtx && MONTHLY.labels.length) {
    new Chart(monthlyCtx, {
      type: 'line',
      data: {
        labels: MONTHLY.labels,
        datasets: [{
          label: '₹ Monthly',
          data: MONTHLY.values,
          borderColor: accent,
          backgroundColor: soft('1a'),
          tension: 0.4,
          fill: true,
          borderWidth: 3,
        }],
      },
      options: {
        responsive: true,
        interaction: { intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: tooltip((context) => '₹' + context.parsed.y.toLocaleString()),
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: soft('33') },
            ticks: { color: textColor, font: { size: 12, weight: 500 } },
            border: { color: soft('4d') },
          },
          x: {
            grid: { color: soft('1a') },
            ticks: { color: textColor, font: { size: 11 } },
          },
        },
                onHover: pointer,
      },
    });
  }
}
