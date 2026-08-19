/* ── CONFIGURAÇÃO ──────────────────────────────────────────── */
const API_BASE_URL = ""; // ex: "https://localhost:7123" se o front não for servido pelo mesmo host/porta da API

async function fetchDashboardData(dias = 30) {
    const resp = await Auth.fetchAuth(`${API_BASE_URL}/api/Diagnostico/dashboard?dias=${dias}`);
    if (!resp.ok) throw new Error(`Erro ${resp.status} ao buscar dados do dashboard`);
    return resp.json();
}

/* ── DADOS (preenchidos após o fetch) ─────────────────────── */
let scansData = [];      // [{ d, saudaveis, alertas }]
let rawSemanal = [];     // [{ dia: 'yyyy-MM-dd', saudaveis, alertas }] — cru, usado no heatmap
let cultureData = [];    // [{ name, value, hex }]
let severityData = [];   // [{ label, value }]
let recentScans = [];    // [{ id, data, cultura, problema, severidade, confianca }]
let recentScansFiltrados = []; // após busca do topbar
let kpisData = null;
let alertasCriticosData = [];
let currentDias = 30;
let sortState = { key: null, dir: 1 };

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
    rawSemanal = json.semanal || [];

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
    recentScansFiltrados = recentScans.slice();

    alertasCriticosData = json.alertasCriticos;
}

/* ── PERÍODO ──────────────────────────────────────────────── */
async function mudarPeriodo(dias) {
    currentDias = Number(dias);
    mostrarSkeletons();
    try {
        const json = await fetchDashboardData(currentDias);
        mapearDadosApi(json);
        populateKpis();
        aplicarFiltroEOrdenacao();
        populatePieLegend();
        renderEmptyStateSeNecessario();
        populateAlertasCriticos([...alertasCriticosData]);
        renderHeatmap();
        atualizarRecomendacao();
        destroyCharts();
        buildCharts();
    } catch (err) {
        console.error("Erro ao mudar período:", err);
    }
}

function mostrarSkeletons() {
    ["kpiDiagnosticosHoje", "kpiSaudavel", "kpiAlertas", "kpiConfianca"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<span class="skeleton" style="display:inline-block;width:40px;height:20px"></span>';
    });
    ["skeletonArea", "skeletonPie", "skeletonBar"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "block";
    });
}

function esconderSkeletonsGraficos() {
    ["skeletonArea", "skeletonPie", "skeletonBar"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });
}

/* ── EMPTY STATE ──────────────────────────────────────────── */
function renderEmptyStateSeNecessario() {
    const existente = document.getElementById("dashEmptyState");
    if (existente) existente.remove();

    if (kpisData && kpisData.totalUltimos30 === 0) {
        const header = document.querySelector(".page-header");
        const div = document.createElement("div");
        div.id = "dashEmptyState";
        div.className = "dash-empty";
        div.innerHTML = `
            <span class="emoji">🌱</span>
            Nenhum diagnóstico neste período ainda.
            <a href="diagnosticar.html">Fazer o primeiro diagnóstico →</a>`;
        header.insertAdjacentElement("afterend", div);
    }
}

/* ── EXPORTAR CSV ─────────────────────────────────────────── */
function exportarCsv() {
    if (!recentScans.length) { alert("Nenhum dado para exportar."); return; }
    const linhas = [["ID", "Data", "Cultura", "Diagnóstico", "Severidade", "Confiança"]];
    recentScans.forEach(s => linhas.push([s.id, s.data, s.cultura, s.problema, s.severidade, s.confianca + "%"]));
    const csv = linhas.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agroscan-dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

/* ── BUSCA NO TOPBAR (filtra a tabela de recentes, client-side) ── */
function filtrarTabelaRecentes(termo) {
    const q = (termo || "").toLowerCase().trim();
    recentScansFiltrados = !q
        ? recentScans.slice()
        : recentScans.filter(s =>
            (s.cultura || "").toLowerCase().includes(q) ||
            (s.problema || "").toLowerCase().includes(q) ||
            (s.severidade || "").toLowerCase().includes(q) ||
            (s.id || "").toLowerCase().includes(q)
        );
    aplicarOrdenacao();
    populateTable(recentScansFiltrados);
}

/* ── ORDENAÇÃO DA TABELA ──────────────────────────────────── */
function ordenarTabela(chave) {
    if (sortState.key === chave) {
        sortState.dir *= -1;
    } else {
        sortState.key = chave;
        sortState.dir = 1;
    }
    aplicarOrdenacao();
    populateTable(recentScansFiltrados);
    atualizarSetas();
}

function aplicarOrdenacao() {
    if (!sortState.key) return;
    const { key, dir } = sortState;
    recentScansFiltrados.sort((a, b) => {
        let va = a[key], vb = b[key];
        if (key === "confianca") { va = Number(va) || 0; vb = Number(vb) || 0; }
        if (typeof va === "string") va = va.toLowerCase();
        if (typeof vb === "string") vb = vb.toLowerCase();
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
    });
}

function aplicarFiltroEOrdenacao() {
    const termoAtual = document.getElementById("topSearchInput")?.value || "";
    filtrarTabelaRecentes(termoAtual);
}

function atualizarSetas() {
    document.querySelectorAll(".sort-arrow").forEach(el => el.classList.remove("asc", "desc"));
    if (!sortState.key) return;
    const el = document.getElementById(`arrow-${sortState.key}`);
    if (el) el.classList.add(sortState.dir === 1 ? "asc" : "desc");
}

/* ── HEATMAP DE ATIVIDADE (estilo GitHub contributions) ───── */
function renderHeatmap() {
    const grid = document.getElementById("heatmapGrid");
    if (!grid) return;

    const janela = Math.min(currentDias, 60);
    const mapa = {};
    rawSemanal.forEach(d => { mapa[d.dia] = (d.saudaveis || 0) + (d.alertas || 0); });

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const diasArr = [];
    for (let i = janela - 1; i >= 0; i--) {
        const dt = new Date(hoje);
        dt.setDate(dt.getDate() - i);
        const key = dt.toISOString().slice(0, 10);
        diasArr.push({ date: key, total: mapa[key] || 0, weekday: dt.getDay() });
    }

    const nivel = total => total === 0 ? 0 : total <= 2 ? 1 : total <= 4 ? 2 : 3;

    let html = "";
    // preenche células vazias antes do primeiro dia para alinhar a semana (domingo=0 no topo)
    if (diasArr.length) {
        for (let i = 0; i < diasArr[0].weekday; i++) {
            html += `<span class="heatmap-cell level-0"></span>`;
        }
    }
    diasArr.forEach(d => {
        const dataFmt = new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR");
        const titulo = d.total === 0 ? `${dataFmt}: sem diagnósticos` : `${dataFmt}: ${d.total} diagnóstico${d.total > 1 ? "s" : ""}`;
        html += `<span class="heatmap-cell filled level-${nivel(d.total)}" title="${titulo}"></span>`;
    });

    grid.innerHTML = html;
}

/* ── PRÓXIMA AÇÃO RECOMENDADA ─────────────────────────────── */
// Cruza alertas climáticos (previsão + hortaliças cadastradas), alertas
// críticos recentes (histórico) e o catálogo de culturas pra sugerir
// uma única ação concreta no topo do dashboard.
function gerarRecomendacao(alertasClima, alertasCriticos, culturas) {
    if (alertasClima && alertasClima.length > 0) {
        const a = alertasClima[0];
        let icon = "🌱";
        if (/geada/i.test(a.titulo)) icon = "❄️";
        else if (/chuva/i.test(a.titulo)) icon = "🌧️";
        else if (/calor/i.test(a.titulo)) icon = "🔥";
        return {
            icon,
            texto: `${a.titulo}. ${a.subtitulo}`,
            ctaTexto: "Diagnosticar agora →",
            ctaHref: "diagnosticar.html",
        };
    }

    if (alertasCriticos && alertasCriticos.length > 0) {
        const a = alertasCriticos[0];
        return {
            icon: "⚠️",
            texto: `Fique atento à recorrência de "${a.titulo}" em ${a.subtitulo} — diagnósticos de alta gravidade merecem acompanhamento nos próximos dias.`,
            ctaTexto: "Ver histórico →",
            ctaHref: "historico.html?gravidade=alta",
        };
    }

    if (culturas && culturas.length === 0) {
        return {
            icon: "🌿",
            texto: "Você ainda não tem hortaliças cadastradas no catálogo. Cadastre suas culturas para receber recomendações climáticas mais precisas.",
            ctaTexto: "Cadastrar hortaliça →",
            ctaHref: "hortalicas.html",
        };
    }

    return {
        icon: "✅",
        texto: "Tudo tranquilo por aqui — nenhum alerta climático ou de recorrência identificado no momento. Continue monitorando sua horta regularmente.",
        ctaTexto: "Novo diagnóstico →",
        ctaHref: "diagnosticar.html",
    };
}

function renderRecomendacao(rec) {
    const card = document.getElementById("actionCard");
    if (!card) return;
    document.getElementById("actionCardIcon").textContent = rec.icon;
    document.getElementById("actionCardText").textContent = rec.texto;
    const cta = document.getElementById("actionCardCta");
    cta.textContent = rec.ctaTexto;
    cta.href = rec.ctaHref;
    card.style.display = "block";
}

// Recalcula com os dados climáticos já resolvidos (chamado após initClima/mudarPeriodo)
let ultimoAlertasClima = [];
function atualizarRecomendacao() {
    const rec = gerarRecomendacao(ultimoAlertasClima, alertasCriticosData, cultureData);
    renderRecomendacao(rec);
}

/* ── CLIMA REAL (via CEP do cadastro → ViaCEP → Open-Meteo) ──
   Fluxo: pega o CEP salvo no login (Auth.getCep()) → ViaCEP
   converte em cidade/UF → geocoding do Open-Meteo converte a
   cidade em lat/lon → forecast do Open-Meteo traz o clima.
   Nenhuma das APIs exige chave. */
function setClimaAtualizadoTexto(msg) {
    const el = document.getElementById("climaAtualizado");
    if (el) el.textContent = msg;
}

// Deixa o subtítulo do card vermelho em caso de erro (CEP não encontrado,
// inválido, etc.) ou volta à cor normal quando tudo certo.
function setClimaAtualizadoErro(comErro) {
    const el = document.getElementById("climaAtualizado");
    if (el) el.style.color = comErro ? "#d15b5b" : "";
}

// Alterna entre o conteúdo normal do card e a mensagem de estado vazio.
function setClimaEstadoVazio(mostrar) {
    const msg = document.getElementById("climaSemDados");
    const conteudo = document.getElementById("climaConteudo");
    if (msg) msg.style.display = mostrar ? "block" : "none";
    if (conteudo) conteudo.style.display = mostrar ? "none" : "block";
}

function setClimaIndisponivel(msg) {
    setClimaEstadoVazio(false);
    setClimaAtualizadoErro(true);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("climaAtualizado", msg || "Clima indisponível");
    set("climaTemp", "—");
    set("climaUmidade", "—");
    set("climaChuva", "—");
    set("climaRiscoLabel", "—");
}

// Sigla UF → nome completo do estado, como retornado pelo campo "admin1"
// da API de geocoding do Open-Meteo. Necessário pra achar a cidade certa
// quando existem cidades com o mesmo nome em estados diferentes.
const UF_PARA_ESTADO = {
    AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
    CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
    MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
    PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
    RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
    RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
    SE: "Sergipe", TO: "Tocantins",
};

function normalizar(str) {
    return (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

// fetch com timeout — evita que uma chamada travada deixe a busca de CEP
// "carregando" pra sempre (ex: CEP inválido/rede lenta).
async function fetchComTimeout(url, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { signal: controller.signal });
    } catch (err) {
        if (err.name === "AbortError") throw new Error("Tempo esgotado ao consultar o serviço — tente novamente");
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

async function geocodeCep(cep) {
    const cepLimpo = (cep || "").replace(/\D/g, "");
    if (cepLimpo.length !== 8) throw new Error("CEP inválido");

    const viaCepResp = await fetchComTimeout(`https://viacep.com.br/ws/${cepLimpo}/json/`);
    if (!viaCepResp.ok) throw new Error(`Erro ${viaCepResp.status} ao consultar ViaCEP`);
    const endereco = await viaCepResp.json();
    if (endereco.erro) throw new Error("CEP não encontrado");

    const { localidade, uf } = endereco;
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(localidade)}` +
        `&count=20&language=pt&format=json&country_code=BR`;
    const geoResp = await fetchComTimeout(geoUrl);
    if (!geoResp.ok) throw new Error(`Erro ${geoResp.status} ao geocodificar cidade`);
    const geoJson = await geoResp.json();
    const resultados = geoJson.results || [];
    if (resultados.length === 0) throw new Error("Cidade não encontrada no geocoding");

    // Casa pelo nome completo do estado (evita pegar uma cidade homônima
    // em outro estado, que era a causa da temperatura errada).
    const nomeEstado = normalizar(UF_PARA_ESTADO[uf]);
    const match = resultados.find(r => normalizar(r.admin1) === nomeEstado)
        || resultados.find(r => normalizar(r.name) === normalizar(localidade) && normalizar(r.admin1) === nomeEstado)
        || resultados[0];

    return { lat: match.latitude, lon: match.longitude, cidade: localidade, uf };
}

async function fetchWeatherData(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m` +
        `&daily=precipitation_sum,temperature_2m_min,temperature_2m_max` +
        `&past_days=7&forecast_days=3&timezone=auto`;
    const resp = await fetchComTimeout(url);
    if (!resp.ok) throw new Error(`Erro ${resp.status} ao buscar clima`);
    return resp.json();
}

function populateClima(json, local) {
    setClimaEstadoVazio(false);
    setClimaAtualizadoErro(false);
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

    const sufixoLocal = local ? ` — ${local.cidade}/${local.uf}` : "";
    set("climaAtualizado", `Atualizado agora${sufixoLocal}`);

    populateForecastMini(json);
}

/* ── FORECAST MINI NO CARD DE CLIMA ──────────────────────── */
function populateForecastMini(json) {
    const row = document.getElementById("climaForecastRow");
    if (!row || !json?.daily) return;
    const dias = ["Amanhã", "+2 dias", "+3 dias"];
    const idx = [7, 8, 9]; // past_days=7 -> índice 7 é o próximo dia
    row.innerHTML = idx.map((i, k) => {
        const min = json.daily.temperature_2m_min[i];
        const max = json.daily.temperature_2m_max[i];
        if (min === undefined) return "";
        return `<div class="forecast-day">
            <div class="fd-label">${dias[k]}</div>
            <div class="fd-temp">${Math.round(min)}° / ${Math.round(max)}°</div>
        </div>`;
    }).join("");
}

/* Retorna o JSON do clima (ou null em caso de falha) para uso posterior
   no cálculo dos avisos climáticos. Se cepManual for informado, usa ele
   em vez do Auth.getCep() — usado pelo campo de teste no dashboard. */
async function initClima(cepManual) {
    const cep = cepManual || (typeof Auth !== "undefined" && typeof Auth.getCep === "function" ? Auth.getCep() : "");
    if (!cep) {
        setClimaEstadoVazio(true);
        setClimaAtualizadoErro(false);
        setClimaAtualizadoTexto("Nenhum CEP cadastrado");
        return null;
    }

    try {
        const local = await geocodeCep(cep);
        const json = await fetchWeatherData(local.lat, local.lon);
        populateClima(json, local);
        return json;
    } catch (err) {
        console.error("Erro ao carregar clima:", err);
        setClimaEstadoVazio(false);
        setClimaIndisponivel(err.message === "CEP não encontrado" ? "CEP não encontrado" : "Erro ao carregar clima");
        return null;
    }
}

/* Botão de lápis abre/fecha o campo de CEP; valida o CEP em tempo real
   (8 dígitos) e dá feedback de carregamento no botão Buscar enquanto
   consulta ViaCEP + Open-Meteo. */
function initCepManualInput() {
    const editBtn = document.getElementById("cepEditBtn");
    const editRow = document.getElementById("cepEditRow");
    const btn = document.getElementById("cepBuscarBtn");
    const input = document.getElementById("cepInput");
    const erro = document.getElementById("cepErro");
    if (!editBtn || !editRow || !btn || !input) return;

    editBtn.addEventListener("click", () => {
        const abrir = editRow.style.display === "none";
        editRow.style.display = abrir ? "flex" : "none";
        if (abrir) input.focus();
    });

    const cepValido = () => input.value.replace(/\D/g, "").length === 8;

    const atualizarValidacao = () => {
        const digitos = input.value.replace(/\D/g, "");
        const incompleto = digitos.length > 0 && digitos.length < 8;
        input.style.borderColor = incompleto ? "#d15b5b" : "";
        if (!incompleto && erro) erro.style.display = "none";
    };

    // Máscara 99999-999 enquanto o usuário digita.
    input.addEventListener("input", () => {
        let v = input.value.replace(/\D/g, "").slice(0, 8);
        if (v.length > 5) v = `${v.slice(0, 5)}-${v.slice(5)}`;
        input.value = v;
        atualizarValidacao();
    });

    input.addEventListener("blur", atualizarValidacao);

    const buscar = async () => {
        if (!cepValido()) {
            input.style.borderColor = "#d15b5b";
            if (erro) {
                erro.textContent = "CEP incompleto — digite os 8 números.";
                erro.style.display = "block";
            }
            input.focus();
            return;
        }

        const textoOriginal = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Buscando...";
        setClimaAtualizadoTexto("Consultando CEP...");

        try {
            const weatherJson = await initClima(input.value.trim());
            ultimoAlertasClima = computeAlertasClimaticos(weatherJson, cultureData);
            populateAlertasCriticos([...ultimoAlertasClima, ...alertasCriticosData]);
            atualizarRecomendacao();
        } finally {
            btn.disabled = false;
            btn.textContent = textoOriginal;
        }
    };

    btn.addEventListener("click", buscar);
    input.addEventListener("keydown", e => { if (e.key === "Enter") buscar(); });
}

/* ── AVISOS CLIMÁTICOS ─────────────────────────────────────────
   Cruza a previsão dos próximos dias com as hortaliças cadastradas
   pelo usuário (cultureData, vindo do dashboard da API) para gerar
   avisos de risco: geada, chuva forte e calor excessivo. */
function computeAlertasClimaticos(weatherJson, culturas) {
    if (!weatherJson || !weatherJson.daily) return [];

    const nomesCulturas = (culturas || []).map(c => c.name).filter(Boolean);
    const sufixoCulturas = nomesCulturas.length ? ` Hortaliças afetadas: ${nomesCulturas.join(", ")}.` : "";

    const minsFuturos = weatherJson.daily.temperature_2m_min.slice(7);
    const maxsFuturos = weatherJson.daily.temperature_2m_max.slice(7);
    const chuvaFutura = weatherJson.daily.precipitation_sum.slice(7);

    if (minsFuturos.length === 0) return [];

    const minPrevisto = Math.min(...minsFuturos);
    const maxPrevisto = Math.max(...maxsFuturos);
    const chuvaAcumulada = chuvaFutura.reduce((a, b) => a + (b || 0), 0);

    const alertas = [];

    if (minPrevisto <= 0) {
        alertas.push({
            titulo: "Risco de geada nos próximos dias",
            subtitulo: `Mínima prevista de ${Math.round(minPrevisto)}°C — proteja o plantio.${sufixoCulturas}`,
        });
    }

    if (chuvaAcumulada >= 40) {
        alertas.push({
            titulo: "Chuva forte prevista",
            subtitulo: `${Math.round(chuvaAcumulada)} mm acumulados nos próximos dias — atenção a fungos e apodrecimento.${sufixoCulturas}`,
        });
    }

    if (maxPrevisto >= 35) {
        alertas.push({
            titulo: "Calor excessivo previsto",
            subtitulo: `Máxima de ${Math.round(maxPrevisto)}°C — risco de estresse hídrico.${sufixoCulturas}`,
        });
    }

    return alertas;
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
    setText("kpiSaudavelHint", `${kpisData.totalUltimos30} diagnósticos no período`);

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

function populateTable(lista) {
    const tbody = document.getElementById("scansTable");
    if (!tbody) return;
    const dados = lista || recentScans;

    if (dados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:16px">Nenhum diagnóstico encontrado.</td></tr>`;
        return;
    }

    tbody.innerHTML = "";
    dados.forEach(s => {
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
function populateAlertasCriticos(lista) {
    const panel = document.getElementById("alertasCriticosPanel");
    if (!panel) return;

    const alertas = lista || alertasCriticosData;

    if (alertas.length === 0) {
        panel.innerHTML = `<p style="font-size:13px;opacity:.7">Nenhuma notificação crítico no momento.</p>`;
        return;
    }

    panel.innerHTML = alertas.map(a => `
    <div class="alert-item">
      <div class="alert-icon red">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 9l6 6m-6 0l6-6M12 3a9 9 0 1 0 0 18A9 9 0 0 0 12 3z"/>
        </svg>
      </div>
      <div>
        <p class="alert-text-title">${a.titulo}</p>
        <p class="alert-text-sub">${a.subtitulo}</p>
        <a class="alert-item-action" href="historico.html?gravidade=alta">Ver no histórico →</a>
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

    esconderSkeletonsGraficos();
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
    initCepManualInput();

    const nome = Auth.getNome();
    document.getElementById("nomeUsuario").textContent = nome;
    document.getElementById("avatarLetra").textContent = nome.charAt(0).toUpperCase();

    // Dados do dashboard e clima podem ser buscados em paralelo.
    const [, weatherJson] = await Promise.all([
        fetchDashboardData(currentDias)
            .then(json => { mapearDadosApi(json); })
            .catch(err => console.error("Erro ao carregar dados do dashboard:", err)),
        initClima(),
    ]);

    ultimoAlertasClima = computeAlertasClimaticos(weatherJson, cultureData);

    populateKpis();
    populateTable(recentScansFiltrados);
    populatePieLegend();
    renderEmptyStateSeNecessario();
    populateAlertasCriticos([...ultimoAlertasClima, ...alertasCriticosData]);
    renderHeatmap();
    atualizarRecomendacao();
    buildCharts();
});