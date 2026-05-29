/* ── DADOS ─────────────────────────────────────────────────── */
const scansData = [
    { d: "Seg", saudaveis: 124, alertas: 18 },
    { d: "Ter", saudaveis: 142, alertas: 22 },
    { d: "Qua", saudaveis: 138, alertas: 14 },
    { d: "Qui", saudaveis: 165, alertas: 31 },
    { d: "Sex", saudaveis: 178, alertas: 28 },
    { d: "Sáb", saudaveis: 156, alertas: 19 },
    { d: "Dom", saudaveis: 189, alertas: 24 },
  ];
  
  const cultureData = [
    { name: "Soja",    value: 42, hex: "#4a8c5c" },
    { name: "Milho",   value: 28, hex: "#89c95a" },
    { name: "Café",    value: 18, hex: "#c8b83a" },
    { name: "Algodão", value: 12, hex: "#d4893a" },
  ];
  
  const yieldData = [
    { m: "Jan", v: 62 }, { m: "Fev", v: 68 }, { m: "Mar", v: 74 },
    { m: "Abr", v: 71 }, { m: "Mai", v: 82 }, { m: "Jun", v: 88 },
    { m: "Jul", v: 94 }, { m: "Ago", v: 91 }, { m: "Set", v: 97 },
  ];
  
  const recentScans = [
    { id: "AS-2841", talhao: "Talhão 12-A", cultura: "Soja",    problema: "Ferrugem asiática", severidade: "Alta",  confianca: 96 },
    { id: "AS-2840", talhao: "Talhão 07-B", cultura: "Milho",   problema: "Saudável",           severidade: "—",     confianca: 99 },
    { id: "AS-2839", talhao: "Talhão 03-C", cultura: "Café",    problema: "Bicho-mineiro",      severidade: "Média", confianca: 92 },
    { id: "AS-2838", talhao: "Talhão 18-A", cultura: "Algodão", problema: "Deficiência N",      severidade: "Baixa", confianca: 88 },
    { id: "AS-2837", talhao: "Talhão 22-D", cultura: "Soja",    problema: "Mancha alvo",        severidade: "Média", confianca: 94 },
  ];
  
  /* ── HELPERS DE TEMA ───────────────────────────────────────── */
  function isDark() {
    return document.documentElement.classList.contains("dark");
  }
  
  function getChartColors() {
    return {
      primary:      isDark() ? "#6db87a" : "#4a7c59",
      chart4:       isDark() ? "#d4893a" : "#c47c2e",
      gridLine:     isDark() ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)",
      tick:         isDark() ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)",
      tooltip:      isDark() ? "#1c2e22" : "#ffffff",
      tooltipBorder:isDark() ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)",
      titleColor:   isDark() ? "#e8f5ea" : "#1a2e1e",
      bodyColor:    isDark() ? "#9fbbaa" : "#4a6b53",
    };
  }
  
  /* ── POPULAR TABELA ────────────────────────────────────────── */
  const badgeClass = {
    Alta:  "badge-high",
    Média: "badge-medium",
    Baixa: "badge-low",
    "—":   "badge-ok",
  };
  
  function populateTable() {
    const tbody = document.getElementById("scansTable");
    tbody.innerHTML = "";
    recentScans.forEach(s => {
      tbody.innerHTML += `
        <tr>
          <td class="td-mono">${s.id}</td>
          <td class="td-bold">${s.talhao}</td>
          <td>${s.cultura}</td>
          <td class="td-muted">${s.problema}</td>
          <td><span class="badge ${badgeClass[s.severidade]}">${s.severidade}</span></td>
          <td class="td-tabular">${s.confianca}%</td>
        </tr>`;
    });
  }
  
  /* ── POPULAR LEGENDA DO PIE ────────────────────────────────── */
  function populatePieLegend() {
    const pieLegend = document.getElementById("pieLegend");
    pieLegend.innerHTML = "";
    cultureData.forEach(c => {
      pieLegend.innerHTML += `
        <li class="pie-legend-item">
          <div class="pie-legend-item-left">
            <span class="pie-legend-dot" style="background:${c.hex}"></span>
            <span>${c.name}</span>
          </div>
          <span class="pie-legend-value">${c.value}%</span>
        </li>`;
    });
  }
  
  /* ── GRÁFICOS ──────────────────────────────────────────────── */
  let areaChart, pieChart, barChart;
  
  function buildCharts() {
    const c = getChartColors();
  
    Chart.defaults.font.family = "'DM Sans', sans-serif";
    Chart.defaults.font.size = 11;
  
    const tooltipDefaults = {
      backgroundColor: c.tooltip,
      borderColor: c.tooltipBorder,
      borderWidth: 1,
      titleColor: c.titleColor,
      bodyColor: c.bodyColor,
      padding: 10,
      cornerRadius: 10,
    };
  
    /* Gráfico de Área */
    const aCtx = document.getElementById("areaChart").getContext("2d");
    const gradSaud = aCtx.createLinearGradient(0, 0, 0, 260);
    gradSaud.addColorStop(0, c.primary + "66");
    gradSaud.addColorStop(1, c.primary + "00");
    const gradAlert = aCtx.createLinearGradient(0, 0, 0, 260);
    gradAlert.addColorStop(0, c.chart4 + "59");
    gradAlert.addColorStop(1, c.chart4 + "00");
  
    areaChart = new Chart(aCtx, {
      type: "line",
      data: {
        labels: scansData.map(d => d.d),
        datasets: [
          {
            label: "Saudáveis",
            data: scansData.map(d => d.saudaveis),
            borderColor: c.primary,
            backgroundColor: gradSaud,
            borderWidth: 2,
            fill: true,
            tension: .4,
            pointRadius: 3,
            pointBackgroundColor: c.primary,
          },
          {
            label: "Alertas",
            data: scansData.map(d => d.alertas),
            borderColor: c.chart4,
            backgroundColor: gradAlert,
            borderWidth: 2,
            fill: true,
            tension: .4,
            pointRadius: 3,
            pointBackgroundColor: c.chart4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: tooltipDefaults },
        scales: {
          x: { grid: { display: false }, ticks: { color: c.tick }, border: { display: false } },
          y: { grid: { color: c.gridLine }, ticks: { color: c.tick }, border: { display: false } },
        },
      },
    });
  
    /* Gráfico de Pizza */
    const pCtx = document.getElementById("pieChart").getContext("2d");
    pieChart = new Chart(pCtx, {
      type: "doughnut",
      data: {
        labels: cultureData.map(d => d.name),
        datasets: [{
          data: cultureData.map(d => d.value),
          backgroundColor: cultureData.map(d => d.hex),
          borderWidth: 0,
          hoverOffset: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipDefaults,
            callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}%` },
          },
        },
      },
    });
  
    /* Gráfico de Barras */
    const bCtx = document.getElementById("barChart").getContext("2d");
    barChart = new Chart(bCtx, {
      type: "bar",
      data: {
        labels: yieldData.map(d => d.m),
        datasets: [{
          label: "sc/ha",
          data: yieldData.map(d => d.v),
          backgroundColor: c.primary,
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: tooltipDefaults },
        scales: {
          x: { grid: { display: false }, ticks: { color: c.tick }, border: { display: false } },
          y: { grid: { color: c.gridLine }, ticks: { color: c.tick }, border: { display: false } },
        },
      },
    });
  }
  
  function destroyCharts() {
    [areaChart, pieChart, barChart].forEach(c => c && c.destroy());
  }
  
  /* ── TOGGLE DE TEMA ────────────────────────────────────────── */
  function initTheme() {
    const themeBtn = document.getElementById("themeBtn");
    const sunIcon  = document.getElementById("sunIcon");
    const moonIcon = document.getElementById("moonIcon");
  
    // Começa no modo escuro
    sunIcon.style.display  = "block";
    moonIcon.style.display = "none";
  
    themeBtn.addEventListener("click", () => {
      const nowDark = document.documentElement.classList.toggle("dark");
      sunIcon.style.display  = nowDark ? "block" : "none";
      moonIcon.style.display = nowDark ? "none"  : "block";
      destroyCharts();
      buildCharts();
    });
  }
  
  /* ── SIDEBAR MOBILE ────────────────────────────────────────── */
  function initSidebar() {
    const menuBtn = document.getElementById("menuBtn");
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("overlay");
  
    menuBtn.addEventListener("click", () => {
      sidebar.classList.toggle("open");
      overlay.classList.toggle("show");
    });
  
    overlay.addEventListener("click", () => {
      sidebar.classList.remove("open");
      overlay.classList.remove("show");
    });
  }
  
  /* ── INIT ──────────────────────────────────────────────────── */
  document.addEventListener("DOMContentLoaded", () => {
    populateTable();
    populatePieLegend();
    buildCharts();
    initTheme();
    initSidebar();
  });
  