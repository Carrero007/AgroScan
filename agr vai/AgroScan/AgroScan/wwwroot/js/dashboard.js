/* ── CONFIGURAÇÃO ──────────────────────────────────────────── */
const API_BASE_URL = ""; // ex: "https://localhost:7123" se o front não for servido pelo mesmo host/porta da API

async function fetchDashboardData() {
    const resp = await Auth.fetchAuth(`${API_BASE_URL}/api/Diagnostico/dashboard`);
    if (!resp.ok) throw new Error(`Erro ${resp.status} ao buscar dados do dashboard`);
    return resp.json();
}

/* ── DADOS (preenchidos após o fetch) ─────────────────────── */
let scansData = [];      // [{ d, saudaveis, alertas }]
let cultureData = [];    // [{ name, value, hex }]
let severityData = [];   // [{ label, value }]
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

/* ── CLIMA REAL (Open-Meteo, sem necessidade de chave de API) ── */
function setClimaIndisponivel(msg) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("climaAtualizado", msg || "Clima indisponível");
    set("climaTemp", "—");
    set("climaUmidade", "—");
    set("climaChuva", "—");
    set("climaRiscoLabel", "—");
}

async function fetchWeatherData(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m` +
        `&daily=precipitation_sum,temperature_2m_min` +
        `&past_days=7&forecast_days=3&timezone=auto`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Erro ${resp.status} ao buscar clima`);
    return resp.json();
}

function populateClima(json) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

    set("climaTemp", `${Math.round(json.current.temperature_2m)}°C`);
    set("climaUmidade", `${Math.round(json.current.relative_humidity_2m)}%`);

    const chuva7d = json.daily.precipitation_sum.slice(0, 7).reduce((a, b) => a + (b || 0), 0);
    set("climaChuva", `${Math.round(chuva7d)} mm`);

    const minPrevista = Math.min(...json.daily.temperature_2m_min.slice(7));
    let riscoPct, riscoLabel;
    if (minPrevista <= 0) { riscoPct = 100; riscoLabel = "Alto"; }
    else if (minPrevista <= 5) { riscoPct = 60; riscoLabel = "Médio"; }
    else { riscoPct = 15; riscoLabel = "Baixo"; }
    set("climaRiscoLabel", riscoLabel);
    const bar = document.getElementById("climaRiscoBar");
    if (bar) bar.style.width = `${riscoPct}%`;

    set("climaAtualizado", "Atualizado agora");
}

function initClima() {
    if (!("geolocation" in navigator)) {
        setClimaIndisponivel("Geolocalização não suportada");
        return;
    }
    navigator.geolocation.getCurrentPosition(
        async pos => {
            try {
                const json = await fetchWeatherData(pos.coords.latitude, pos.coords.longitude);
                populateClima(json);
            } catch (err) {
                console.error("Erro ao carregar clima:", err);
                setClimaIndisponivel("Erro ao carregar clima");
            }
        },
        () => setClimaIndisponivel("Permissão de localização negada"),
        { timeout: 10000 }
    );
}

/* ── NOTIFICAÇÕES ──────────────────────────────────────────
   NOTA: agora tratadas por js/notifications.js (compartilhado
   entre todas as páginas). As funções abaixo foram removidas
   daqui para não duplicar/conflitar com o listener do notifyBtn.
*/

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
    setBadge("kpiConfiancaBadge", kpisData.confiancaMediaVariacaoPct);
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

    const bCtx = document.getElementById("barChart").getContext("2d");
    const coresSeveridade = { Baixa: "#5a8a6a", Média: "#c4b86a", Alta: "#c4574a" };
    barChart = new Chart(bCtx, {
        type: "bar",
        data: {
            labels: severityData.map(d => d.label),
            datasets: [{
                label: "Diagnósticos",
                data: severityData.map(d => d.value),
                backgroundColor: severityData.map(d => coresSeveridade[d.label]),
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

/* ── SIDEBAR MOBILE ────────────────────────────────────────── */
function initSidebar() {
    const menuBtn = document.getElementById("menuBtn");
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("overlay");
    if (!menuBtn || !sidebar || !overlay) return;

    menuBtn.addEventListener("click", () => {
        sidebar.classList.toggle("open");
        overlay.classList.toggle("show");
    });

    overlay.addEventListener("click", () => {
        sidebar.classList.remove("open");
        overlay.classList.remove("show");
    });
}

/* ── Redesenha os gráficos quando o tema muda em QUALQUER aba
   (theme.js dispara isso via evento 'storage'; aqui só escutamos) */
window.addEventListener("storage", e => {
    if (e.key === "as_theme" && areaChart) {
        destroyCharts();
        buildCharts();
    }
});

/* ── INIT ──────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", async () => {
    initSidebar();
    initClima();

    const nome = Auth.getNome();
    document.getElementById("nomeUsuario").textContent = nome;
    document.getElementById("avatarLetra").textContent = nome.charAt(0).toUpperCase();

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