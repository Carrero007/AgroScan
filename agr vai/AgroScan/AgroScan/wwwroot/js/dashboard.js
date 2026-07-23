/* ── CONFIGURAÇÃO ──────────────────────────────────────────── */
const API_BASE_URL = ""; // ex: "https://localhost:7123" se o front não for servido pelo mesmo host/porta da API
const TOKEN_KEY = "agroscan_token"; // ajuste para a chave usada no localStorage após o login

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function getNome() { return localStorage.getItem(KEY_NOME) || 'Produtor'; }

async function fetchDashboardData() {
    const resp = await fetch(`${API_BASE_URL}/api/Diagnostico/dashboard`, {
        headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!resp.ok) throw new Error(`Erro ${resp.status} ao buscar dados do dashboard`);
    return resp.json();
}

/* ── DADOS (preenchidos após o fetch) ─────────────────────── */
let scansData = [];      // [{ d, saudaveis, alertas }]
let cultureData = [];    // [{ name, value, hex }]
let severityData = [];   // [{ label, value }]  (substitui o antigo yieldData)
let recentScans = [];    // [{ id, data, cultura, problema, severidade, confianca }]
let kpisData = null;
let alertasCriticosData = [];

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const PALETA_CULTURAS = ["#5a8a6a", "#7aaa88", "#c4b86a", "#c4844a", "#8c6fd6", "#5b8def", "#d15b5b", "#3ab6c2"];

function normalizarSeveridade(gravidade) {
    if (gravidade === "alta") return "Alta";
    if (gravidade === "media") return "Média";
    if (gravidade === "baixa") return "Baixa";
    return "—";
}

function mapearDadosApi(json) {
    kpisData = json.kpis;

    scansData = json.semanal.map(item => {
        const data = new Date(item.dia + "T00:00:00");
        return { d: DIAS_SEMANA[data.getDay()], saudaveis: item.saudaveis, alertas: item.alertas };
    });

    cultureData = json.distribuicao.map((item, i) => ({
        name: item.cultura,
        value: item.percentual,
        hex: PALETA_CULTURAS[i % PALETA_CULTURAS.length],
    }));

    const buscaSeveridade = nivel => json.severidade.find(s => s.nivel === nivel)?.total ?? 0;
    severityData = [
        { label: "Baixa", value: buscaSeveridade("baixa") },
        { label: "Média", value: buscaSeveridade("media") },
        { label: "Alta", value: buscaSeveridade("alta") },
    ];

    recentScans = json.recentes.map(r => ({
        id: `AS-${String(r.id).padStart(4, "0")}`,
        data: r.data,
        cultura: r.cultura,
        problema: r.diagnostico,
        severidade: normalizarSeveridade(r.severidade),
        confianca: r.confianca,
    }));

    alertasCriticosData = json.alertasCriticos;
}

/* ── HELPERS DE TEMA ───────────────────────────────────────── */
function isDark() {
    return document.documentElement.classList.contains("dark");
}

function getChartColors() {
    return {
        primary: isDark() ? "#4a7a58" : "#5a8a6a",
        chart4: isDark() ? "#b07040" : "#c4844a",
        gridLine: isDark() ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)",
        tick: isDark() ? "rgba(255,255,255,0.35)" : "rgba(60,50,30,0.45)",
        tooltip: isDark() ? "#111111" : "#faf7f2",
        tooltipBorder: isDark() ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)",
        titleColor: isDark() ? "#e8e8e8" : "#2a2a24",
        bodyColor: isDark() ? "#888888" : "#7a7060",
    };
}

/* ── POPULAR KPIs ──────────────────────────────────────────── */
function populateKpis() {
    if (!kpisData) return;

    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    const setBadge = (id, pct) => {
        const el = document.getElementById(id);
        if (!el) return;
        const up = pct >= 0;
        el.textContent = `${up ? "+" : ""}${pct}%`;
        el.className = `kpi-badge ${up ? "up" : "down"}`;
    };

    setText("kpiDiagnosticosHoje", kpisData.diagnosticosHoje);
    setBadge("kpiDiagnosticosBadge", kpisData.diagnosticosHojeVariacaoPct);

    setText("kpiSaudavel", `${kpisData.percentualSaudavel}%`);
    setText("kpiSaudavelHint", `${kpisData.totalUltimos30} diagnósticos nos últimos 30 dias`);

    setText("kpiAlertas", kpisData.alertasAtivos30d);
    setText("kpiAlertasCriticos", `${kpisData.alertasCriticos7d} críticos (7 dias)`);

    setText("kpiConfianca", `${kpisData.confiancaMedia}%`);
}

/* ── POPULAR TABELA ────────────────────────────────────────── */
const badgeClass = {
    Alta: "badge-high",
    Média: "badge-medium",
    Baixa: "badge-low",
    "—": "badge-ok",
};

function populateTable() {
    const tbody = document.getElementById("scansTable");
    if (!tbody) return;

    if (recentScans.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:16px">Nenhum diagnóstico ainda.</td></tr>`;
        return;
    }

    tbody.innerHTML = "";
    recentScans.forEach(s => {
        tbody.innerHTML += `
      <tr>
        <td class="td-mono">${s.id}</td>
        <td class="td-bold">${s.data}</td>
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
    if (!pieLegend) return;

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

/* ── POPULAR ALERTAS CRÍTICOS ─────────────────────────────── */
function populateAlertasCriticos() {
    const panel = document.getElementById("alertasCriticosPanel");
    if (!panel) return;

    if (alertasCriticosData.length === 0) {
        panel.innerHTML = `<p style="font-size:13px;opacity:.7">Nenhum alerta crítico no momento.</p>`;
        return;
    }

    panel.innerHTML = alertasCriticosData.map(a => `
    <div class="alert-item">
      <div class="alert-icon red">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 9l6 6m-6 0l6-6M12 3a9 9 0 1 0 0 18A9 9 0 0 0 12 3z"/>
        </svg>
      </div>
      <div>
        <p class="alert-text-title">${a.titulo}</p>
        <p class="alert-text-sub">${a.subtitulo}</p>
      </div>
    </div>`).join("");
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
                y: { grid: { color: c.gridLine }, ticks: { color: c.tick, stepSize: 1 }, border: { display: false }, beginAtZero: true },
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

    /* Gráfico de Barras — distribuição por severidade */
    const bCtx = document.getElementById("barChart").getContext("2d");
    const coresSeveridade = { Baixa: "#5a8a6a", Média: "#c4b86a", Alta: "#c4574a" };
    barChart = new Chart(bCtx, {
        type: "bar",
        data: {
            labels: severityData.map(d => d.label),
            datasets: [{
                label: "Diagnósticos",
                data: severityData.map(d => d.value),
                backgroundColor: severityData.map(d => isDark() ? coresSeveridade[d.label] : coresSeveridade[d.label]),
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
                y: { grid: { color: c.gridLine }, ticks: { color: c.tick, stepSize: 1 }, border: { display: false }, beginAtZero: true },
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
    const sunIcon = document.getElementById("sunIcon");
    const moonIcon = document.getElementById("moonIcon");

    // Começa no modo escuro
    sunIcon.style.display = "block";
    moonIcon.style.display = "none";

    themeBtn.addEventListener("click", () => {
        const nowDark = document.documentElement.classList.toggle("dark");
        sunIcon.style.display = nowDark ? "block" : "none";
        moonIcon.style.display = nowDark ? "none" : "block";
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
document.addEventListener("DOMContentLoaded", async () => {
    initTheme();
    initSidebar();

    try {
        const json = await fetchDashboardData();
        mapearDadosApi(json);
    } catch (err) {
        console.error("Erro ao carregar dados do dashboard:", err);
    }

    populateKpis();
    populateTable();
    populatePieLegend();
    populateAlertasCriticos();
    buildCharts();
});

document.addEventListener('DOMContentLoaded', () => {
    const nome = Auth.getNome();
    document.getElementById('nomeUsuario').textContent = nome;
    document.getElementById('avatarLetra').textContent = nome.charAt(0).toUpperCase();
});