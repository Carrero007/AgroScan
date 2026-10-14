// Auth vem de js/Auth.js (incluído antes deste script no HTML).
function initSidebar() {
    const menuBtn = document.getElementById('menuBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (!menuBtn || !sidebar || !overlay) return;
    menuBtn.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('show'); });
    overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); });
}

// ── ESTADO ────────────────────────────────────────────────────
let imagemBase64 = null;
let mimeType = 'image/jpeg';
let nomeArquivo = null;
let resultadoAtual = null;
let estagioAtual = '';
const sintomasSet = new Set();
const climaSet = new Set();

let hortalicasCadastradas = [];
let hortalicaIdSelecionada = null;
window._hortalicaNomeAtual = '';

// ── PERSISTÊNCIA LOCAL ────────────────────────────────────────
const LS_DIAG_KEY = 'as_diag_estado_' + (typeof Auth !== 'undefined' && Auth.getUsuarioId ? Auth.getUsuarioId() : 'anon');

function salvarEstadoLocal() {
    try {
        localStorage.setItem(LS_DIAG_KEY, JSON.stringify({
            imagemBase64, mimeType, nomeArquivo, hortalicaIdSelecionada,
            nomeHortalica: window._hortalicaNomeAtual,
            estagioAtual,
            sintomas: [...sintomasSet],
            clima: [...climaSet],
            regiaoClima: document.getElementById('regiaoClima')?.value || '',
            tratamentosAnteriores: document.getElementById('tratamentosAnteriores')?.value || '',
            sintomasExtra: document.getElementById('sintomasExtra')?.value || '',
            resultadoAtual,
            salvoEm: Date.now()
        }));
    } catch (e) { console.warn('AgroScan: não foi possível salvar estado local.', e); }
}

function restaurarEstadoLocal() {
    let salvo;
    try { salvo = JSON.parse(localStorage.getItem(LS_DIAG_KEY)); } catch { return; }
    if (!salvo || !salvo.imagemBase64) return;
    if (salvo.salvoEm && (Date.now() - salvo.salvoEm) > 24 * 60 * 60 * 1000) { limparEstadoLocal(); return; }

    imagemBase64 = salvo.imagemBase64;
    mimeType = salvo.mimeType || 'image/jpeg';
    nomeArquivo = salvo.nomeArquivo || null;
    hortalicaIdSelecionada = salvo.hortalicaIdSelecionada || null;
    window._hortalicaNomeAtual = salvo.nomeHortalica || '';
    estagioAtual = salvo.estagioAtual || '';
    (salvo.sintomas || []).forEach(s => sintomasSet.add(s));
    (salvo.clima || []).forEach(c => climaSet.add(c));

    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    setVal('regiaoClima', salvo.regiaoClima);
    setVal('tratamentosAnteriores', salvo.tratamentosAnteriores);
    setVal('sintomasExtra', salvo.sintomasExtra);

    const prev = document.getElementById('previewImg');
    if (prev) { prev.src = `data:${mimeType};base64,${imagemBase64}`; prev.style.display = 'block'; }
    if (zona) {
        ['.upload-icon', '.upload-label', '.upload-hint'].forEach(s => { const e = zona.querySelector(s); if (e) e.style.display = 'none'; });
        zona.style.minHeight = '0';
    }
    const btnAnalisar = document.getElementById('btnAnalisar');
    if (btnAnalisar) btnAnalisar.disabled = false;

    document.querySelectorAll('#chipsEst .chip').forEach(el => {
        const valor = el.getAttribute('onclick')?.match(/chipEst\(this,'([^']*)'\)/)?.[1] ?? '';
        if (valor === estagioAtual && estagioAtual !== '') el.classList.add('on');
    });
    document.querySelectorAll('#chipsSint .chip, #chipsClima .chip').forEach(el => {
        const txt = el.textContent.trim();
        if (sintomasSet.has(txt) || climaSet.has(txt)) el.classList.add('on');
    });

    if (salvo.resultadoAtual) {
        resultadoAtual = salvo.resultadoAtual;
        const estadoVazio = document.getElementById('estadoVazio');
        if (estadoVazio) estadoVazio.style.display = 'none';
        renderizarResultado(resultadoAtual);
    }
    atualizarQualidade();
}

function limparEstadoLocal() { try { localStorage.removeItem(LS_DIAG_KEY); } catch { } }

document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
    const nome = Auth.getNome();
    document.getElementById('nomeUsuario').textContent = nome;
    document.getElementById('avatarLetra').textContent = nome.charAt(0).toUpperCase();
    carregarHortalicasUsuario().then(restaurarEstadoLocal).then(autoPreencher);
});

// ── REGIÃO + CLIMA AUTOMÁTICOS (pelo CEP do usuário; editáveis) ──
async function autoPreencher() {
    const reg = await Auth.getRegiao();
    const el = document.getElementById('regiaoClima');
    if (el && !el.value && reg) el.value = reg;
    if (!reg || climaSet.size) return;
    try {
        const cidade = reg.split(' / ')[0];
        const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cidade)}&count=1&language=pt&country_code=BR`)).json();
        const p = g.results?.[0];
        if (!p) return;
        const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&past_days=14&forecast_days=1&timezone=auto`)).json();
        const chuva = w.daily.precipitation_sum.reduce((a, b) => a + (b || 0), 0);
        const sel = [];
        if (chuva >= 100) sel.push('Muita chuva'); else if (chuva < 10) sel.push('Seca intensa');
        if (Math.max(...w.daily.temperature_2m_max) >= 33) sel.push('Muito quente');
        if (Math.min(...w.daily.temperature_2m_min) <= 8) sel.push('Frio');
        document.querySelectorAll('#chipsClima .chip').forEach(c => {
            const t = c.textContent.trim();
            if (sel.includes(t)) { c.classList.add('on'); climaSet.add(t); }
        });
        atualizarQualidade();
    } catch { }
}

// ── HORTALIÇAS DO USUÁRIO ─────────────────────────────────────
async function carregarHortalicasUsuario() {
    const select = document.getElementById('hortalicaSelect');
    if (!select) return;
    try {
        const resp = await Auth.fetchAuth('/api/hortalicas');
        const lista = resp.ok ? await resp.json() : [];
        hortalicasCadastradas = lista;
        const msgEl = document.getElementById('semHortalicasMsg');

        if (lista.length === 0) {
            select.innerHTML = `<option value="">Nenhuma cadastrada</option>`;
            if (msgEl) msgEl.style.display = 'block';
            return;
        }
        if (msgEl) msgEl.style.display = 'none';
        select.innerHTML = `<option value="">Selecione...</option>` +
            lista.map(h => `<option value="${h.hortalicaId}">${h.nomePopular || h.nomeCientifico}</option>`).join('');

        const idParam = new URLSearchParams(window.location.search).get('hortalicaId');
        if (idParam) { select.value = idParam; onHortalicaSelecionada(); }
    } catch {
        select.innerHTML = `<option value="">Erro ao carregar catálogo</option>`;
    }
}

function onHortalicaSelecionada() {
    const id = document.getElementById('hortalicaSelect').value;
    hortalicaIdSelecionada = id || null;
    const h = hortalicasCadastradas.find(x => String(x.hortalicaId) === String(id));
    window._hortalicaNomeAtual = h ? (h.nomePopular || h.nomeCientifico) : '';
    atualizarQualidade();
}

// ── UPLOAD ────────────────────────────────────────────────────
const zona = document.getElementById('uploadZone');
zona.addEventListener('dragover', e => { e.preventDefault(); zona.style.borderColor = 'var(--green-lt)'; });
zona.addEventListener('dragleave', () => zona.style.borderColor = '');
zona.addEventListener('drop', e => { e.preventDefault(); zona.style.borderColor = ''; if (e.dataTransfer.files[0]) processarArquivo(e.dataTransfer.files[0]); });

function onImageSelecionada(e) { if (e.target.files[0]) processarArquivo(e.target.files[0]); }

function processarArquivo(file) {
    mimeType = file.type || 'image/jpeg';
    nomeArquivo = file.name;
    const reader = new FileReader();
    reader.onload = ev => {
        imagemBase64 = ev.target.result.split(',')[1];
        const prev = document.getElementById('previewImg');
        prev.src = ev.target.result;
        prev.style.display = 'block';
        ['.upload-icon', '.upload-label', '.upload-hint'].forEach(s => zona.querySelector(s).style.display = 'none');
        zona.style.minHeight = '0';
        document.getElementById('btnAnalisar').disabled = false;
        atualizarQualidade();
        salvarEstadoLocal();
    };
    reader.readAsDataURL(file);
}

// ── CHIPS ─────────────────────────────────────────────────────
function chipEst(el, valor) {
    const era = el.classList.contains('on');
    document.querySelectorAll('#chipsEst .chip').forEach(c => c.classList.remove('on'));
    if (!era) { el.classList.add('on'); estagioAtual = valor; } else estagioAtual = '';
    atualizarQualidade();
    salvarEstadoLocal();
}

function chipToggle(el, conjunto) {
    const txt = el.textContent.trim();
    if (el.classList.toggle('on')) conjunto.add(txt); else conjunto.delete(txt);
    atualizarQualidade();
    salvarEstadoLocal();
}

function atualizarQualidade() {
    let pts = 0;
    if (imagemBase64) pts += 20;
    if (hortalicaIdSelecionada) pts += 25;
    if (estagioAtual) pts += 15;
    if (sintomasSet.size > 0) pts += 25;
    if (climaSet.size > 0) pts += 10;
    if (document.getElementById('regiaoClima').value.trim()) pts += 5;

    const fill = document.getElementById('ctxFill');
    const label = document.getElementById('ctxLabel');
    fill.style.width = pts + '%';
    if (pts === 0) { fill.style.background = 'var(--red)'; label.textContent = 'Selecione uma foto'; }
    else if (pts < 25) { fill.style.background = 'var(--red)'; label.textContent = 'Só a foto'; }
    else if (pts < 50) { fill.style.background = 'var(--amber)'; label.textContent = 'Básico'; }
    else if (pts < 75) { fill.style.background = 'var(--green-lt)'; label.textContent = 'Bom'; }
    else { fill.style.background = 'var(--leaf)'; label.textContent = 'Excelente'; }
    salvarEstadoLocal();
}

// ── DIAGNOSTICAR ─────────────────────────────────────────────
const SPIN = `<div class="spinner-btn" style="display:inline-block;width:28px;height:28px;border-width:3px;border-color:var(--border);border-top-color:var(--primary);margin-bottom:12px"></div>`;

function telaErro(titulo, msg, detalhe) {
    document.getElementById('resultPanel').innerHTML = `
        <div class="estado-vazio">
            <h3>${titulo}</h3>
            <p>${msg}</p>
            <button class="btn-analisar" style="margin-top:16px;max-width:220px;" onclick="diagnosticar()"><span class="lbl">Tentar novamente</span></button>
            ${detalhe ? `<pre style="font-size:13px;color:var(--text3);margin-top:14px;white-space:pre-wrap;text-align:left;max-width:400px;">${escapeHtml(String(detalhe))}</pre>` : ''}
        </div>`;
}

async function diagnosticar() {
    if (!imagemBase64) return;
    if (!hortalicaIdSelecionada) { alert('Selecione uma hortaliça do seu catálogo antes de diagnosticar.'); return; }

    const btn = document.getElementById('btnAnalisar');
    btn.classList.add('loading');
    btn.disabled = true;
    const estadoVazio = document.getElementById('estadoVazio');
    if (estadoVazio) estadoVazio.style.display = 'none';
    document.getElementById('resultPanel').innerHTML = `
        <div class="estado-vazio">${SPIN}<h3>Analisando com IA...</h3>
        <p>Nossa IA especializada em hortaliças está examinando a imagem.</p></div>`;

    const sintomasFinal = [...sintomasSet, document.getElementById('sintomasExtra').value.trim()].filter(Boolean).join('. ');
    const climaFinal = [...climaSet].join(', ');

    try {
        const resp = await Auth.fetchAuth('/api/diagnostico/diagnosticar', {
            method: 'POST',
            body: JSON.stringify({
                imagemBase64, mimeType, nomeArquivo,
                hortalicaNome: window._hortalicaNomeAtual || null,
                estagioPlanta: estagioAtual || null,
                regiaoClima: document.getElementById('regiaoClima').value.trim() || null,
                condicoesClimaticas: climaFinal || null,
                sintomasDescricao: sintomasFinal || null,
                tratamentosAnteriores: document.getElementById('tratamentosAnteriores').value.trim() || null,
            })
        });

        let data;
        try { data = await resp.json(); } catch { data = { erro: `Resposta invalida do servidor (HTTP ${resp.status}).` }; }

        if (!resp.ok) {
            const transitorio = data.transitorio || resp.status === 503 || resp.status === 429;
            telaErro(transitorio ? 'IA sobrecarregada no momento' : 'Erro na análise', data.erro || 'Falha ao analisar. Tente novamente.', data.detalhe);
            return;
        }
        if (!data.tipoDiagnostico && !data.nomeDoenca) {
            telaErro('Resposta incompleta da IA', 'O servidor respondeu, mas sem dados de diagnóstico. Tente novamente.');
            return;
        }
        resultadoAtual = data;
        renderizarResultado(data);
        salvarEstadoLocal();
    } catch (e) {
        telaErro('Falha de conexão', e?.message || 'Verifique sua internet e tente novamente.');
    } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

// ── RENDERIZAR RESULTADO ──────────────────────────────────────
function renderizarResultado(d) {
    const normalizarNivel10 = (v) => {
        let n = Number(v) || 0;
        if (n > 10 && n <= 100) n = n / 10; else if (n > 0 && n <= 1) n = n * 10;
        return Math.round(Math.max(0, Math.min(10, n)));
    };
    d.gravidadeNivel = normalizarNivel10(d.gravidadeNivel);
    d.riscoPropagacaoNivel = normalizarNivel10(d.riscoPropagacaoNivel);
    const tipoCls = tipoClass(d.tipoDiagnostico);
    const confCor = d.confianca >= 75 ? 'mv-green' : d.confianca >= 50 ? 'mv-amber' : 'mv-red';
    const gravCor = d.gravidadeNivel >= 7 ? 'mv-red' : d.gravidadeNivel >= 4 ? 'mv-amber' : 'mv-green';
    const riscoCor = d.riscoPropagacaoNivel >= 7 ? 'mv-red' : d.riscoPropagacaoNivel >= 4 ? 'mv-amber' : 'mv-green';
    const urgHtml = urgBanner(d.recomendacaoUrgencia, d.diasParaAcao);
    const passos = [d.tratamentoPasso1, d.tratamentoPasso2, d.tratamentoPasso3].filter(Boolean);

    const confNum = Number(d.confianca) || 0;
    const avisoTexto = d.recomendacaoProfissional
        || (confNum < 95 ? 'Em caso de dúvida, consulte um agrônomo de confiança antes de aplicar qualquer tratamento.' : '');

    const fonteHtml = (d.fonteNome || d.fonteUrl || avisoTexto) ? `
        <div class="det-card" style="margin-bottom:16px;">
            <div class="det-header">Fonte técnica</div>
            <div class="det-body">
                ${d.fonteNome ? `<strong>${d.fonteNome}</strong>` : 'Fonte não informada pela IA'}
                ${d.fonteUrl ? ` — <a href="${d.fonteUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--primary);text-decoration:underline;">ver fonte</a>` : ''}
                ${avisoTexto ? `<div style="margin-top:10px;padding:10px 12px;border-radius:calc(var(--radius) - 4px);background:color-mix(in oklch, var(--amber) 12%, transparent);border:1px solid color-mix(in oklch, var(--amber) 30%, transparent);color:var(--amber);font-size:14.5px;line-height:1.5;">${avisoTexto}</div>` : ''}
            </div>
        </div>` : '';

    document.getElementById('resultPanel').innerHTML = `
        <div class="result-hero">
            <div class="r-badge ${tipoCls}">${d.tipoDiagnostico || 'Inconclusivo'}</div>
            <div class="r-doenca">${d.nomeDoenca || 'Não identificado'}</div>
            <div class="r-cientifico">${[d.nomeCientifico, d.agenteCausador].filter(Boolean).join(' · ')}</div>
            <div class="r-metrics">
                <div class="r-metric"><div class="ml">Confiança</div><div class="mv ${confCor}">${d.confianca || 0}%</div></div>
                <div class="r-metric"><div class="ml">Gravidade</div><div class="mv ${gravCor}">${d.gravidadeNivel || 0}/10</div></div>
                <div class="r-metric"><div class="ml">Propagação</div><div class="mv ${riscoCor}">${d.riscoPropagacaoNivel || 0}/10</div></div>
            </div>
        </div>
        ${urgHtml}
        <div class="detail-grid">
            <div class="det-card"><div class="det-header">Sintomas observados</div><div class="det-body">${d.sintomasObservados || '—'}</div></div>
            <div class="det-card"><div class="det-header">Condições favoráveis</div><div class="det-body">${d.condicoesFavoraveis || '—'}</div></div>
        </div>
        <div class="card">
            <div class="card-header">Protocolo de tratamento</div>
            <div class="card-body"><div class="trat-steps">
                ${passos.map((p, i) => `<div class="trat-step"><div class="step-num">${i + 1}</div><div class="step-text">${p}</div></div>`).join('')}
            </div></div>
        </div>
        <div class="detail-grid">
            <div class="det-card"><div class="det-header">Tratamento ecológico</div><div class="det-body">${d.tratamentoEcologico || '—'}</div></div>
            <div class="det-card"><div class="det-header">Tratamento químico</div><div class="det-body">${d.tratamentoQuimico || '—'}</div></div>
            <div class="det-card"><div class="det-header">Prevenção</div><div class="det-body">${d.prevencao || '—'}</div></div>
            <div class="det-card"><div class="det-header">Risco / plantas afetadas</div><div class="det-body">${d.plantasAfetadas || '—'}<br><br><strong>${d.riscoPropagacaoTexto || ''}</strong></div></div>
        </div>
        ${fonteHtml}
        <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
            <button class="btn-salvar" id="btnSalvar" onclick="salvarDiagnostico()">Salvar no histórico</button>
            <button class="btn-salvar" id="btnBaixarPdf" onclick="baixarPdfDiagnostico()" style="border-color:var(--text3);color:var(--text3);">Baixar PDF</button>
        </div>`;
}

// ── BAIXAR PDF ────────────────────────────────────────────────
function baixarPdfDiagnostico() {
    const d = resultadoAtual;
    if (!d) return;
    if (!window.jspdf || !window.jspdf.jsPDF) { alert('Não foi possível carregar o gerador de PDF. Verifique sua conexão e tente novamente.'); return; }
    const btn = document.getElementById('btnBaixarPdf');
    const htmlOriginal = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Gerando PDF...'; }
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait' });
        const mx = 14, largura = 182;
        let y = 18;
        const novaPaginaSe = (h) => { if (y + h > 280) { doc.addPage(); y = 20; } };

        doc.setFontSize(16); doc.setTextColor(40);
        doc.text('AgroScan — Relatório de Diagnóstico', mx, y);
        y += 4;
        doc.setDrawColor(90, 138, 106); doc.setLineWidth(0.6);
        doc.line(mx, y, mx + largura, y);
        y += 12;

        doc.setFontSize(20); doc.setTextColor(20); doc.setFont(undefined, 'bold');
        const titulo = doc.splitTextToSize(String(d.nomeDoenca || 'Diagnóstico'), largura);
        doc.text(titulo, mx, y); y += titulo.length * 8;
        doc.setFont(undefined, 'normal');

        doc.setFontSize(11); doc.setTextColor(110); doc.setFont(undefined, 'italic');
        const sub = doc.splitTextToSize([d.nomeCientifico, d.agenteCausador].filter(Boolean).join(' · ') || '—', largura);
        doc.text(sub, mx, y); y += sub.length * 5 + 3;
        doc.setFont(undefined, 'normal');

        doc.setFontSize(10); doc.setTextColor(90, 138, 106);
        doc.text(`${d.tipoDiagnostico || '—'}   ·   Confiança: ${d.confianca || 0}%   ·   Gravidade: ${d.gravidadeNivel || 0}/10   ·   Propagação: ${d.riscoPropagacaoNivel || 0}/10`, mx, y);
        y += 10;

        const limpa = (s) => String(s == null || s === '' ? '—' : s).replace(/<[^>]+>/g, '');
        const secao = (t, texto) => {
            const linhas = doc.splitTextToSize(limpa(texto), largura);
            novaPaginaSe(14);
            doc.setFontSize(9.5); doc.setTextColor(90, 138, 106); doc.setFont(undefined, 'bold');
            doc.text(t.toUpperCase(), mx, y); y += 6;
            doc.setFont(undefined, 'normal'); doc.setFontSize(10.5); doc.setTextColor(50);
            linhas.forEach(l => { novaPaginaSe(6); doc.text(l, mx, y); y += 5; });
            y += 6;
        };

        secao('Sintomas observados', d.sintomasObservados);
        secao('Condições favoráveis', d.condicoesFavoraveis);
        const passos = [d.tratamentoPasso1, d.tratamentoPasso2, d.tratamentoPasso3].filter(Boolean);
        if (passos.length) secao('Protocolo de tratamento', passos.map((p, i) => `${i + 1}. ${limpa(p)}`).join('\n'));
        secao('Tratamento ecológico', d.tratamentoEcologico);
        secao('Tratamento químico', d.tratamentoQuimico);
        secao('Prevenção', d.prevencao);
        secao('Risco / plantas afetadas', [d.plantasAfetadas, d.riscoPropagacaoTexto].filter(Boolean).join('\n') || '—');
        if (d.fonteNome || d.fonteUrl) secao('Fonte técnica', [d.fonteNome, d.fonteUrl].filter(Boolean).join(' — '));
        const aviso = d.recomendacaoProfissional || ((Number(d.confianca) || 0) < 95
            ? 'Em caso de dúvida, consulte um agrônomo de confiança antes de aplicar qualquer tratamento.' : '');
        if (aviso) secao('Aviso', aviso);

        const total = doc.getNumberOfPages();
        let nome = '';
        try { nome = Auth.getNome() || ''; } catch (e) { }
        for (let p = 1; p <= total; p++) {
            doc.setPage(p);
            doc.setFontSize(8); doc.setTextColor(150);
            doc.text(`Gerado por AgroScan em ${new Date().toLocaleString('pt-BR')}${nome ? ' · Produtor: ' + nome : ''}  ·  Página ${p}/${total}`, mx, 290);
        }
        doc.save(`agroscan-diagnostico-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
        console.error('Erro ao gerar PDF:', e);
        alert('Erro ao gerar o PDF. Tente novamente.');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = htmlOriginal; }
    }
}

async function salvarDiagnostico() {
    if (!resultadoAtual) return;
    const btn = document.getElementById('btnSalvar');
    btn.disabled = true; btn.textContent = 'Salvando...';

    const normalizarInt = (v) => { let n = Number(v) || 0; if (n > 0 && n <= 1) n = n * 100; return Math.round(Math.max(0, Math.min(100, n))); };
    const normalizarNivel = (v) => { let n = Number(v) || 0; if (n > 0 && n <= 1) n = n * 10; return Math.round(Math.max(0, Math.min(10, n))); };

    try {
        const r = resultadoAtual;
        const resp = await Auth.fetchAuth('/api/diagnostico/salvar', {
            method: 'POST',
            body: JSON.stringify({
                hortalicaId: hortalicaIdSelecionada ? parseInt(hortalicaIdSelecionada) : null,
                tipoDiagnostico: r.tipoDiagnostico,
                nomeDoenca: r.nomeDoenca,
                nomeCientifico: r.nomeCientifico,
                agenteCausador: r.agenteCausador,
                confianca: normalizarInt(r.confianca),
                gravidadeNivel: normalizarNivel(r.gravidadeNivel),
                gravidade: r.gravidade,
                sintomasObservados: r.sintomasObservados,
                tratamento: r.tratamentoPasso1,
                tratamentoEcologico: r.tratamentoEcologico,
                tratamentoQuimico: r.tratamentoQuimico,
                prevencao: r.prevencao,
                riscoPropagacao: r.riscoPropagacao,
                riscoPropagacaoNivel: normalizarNivel(r.riscoPropagacaoNivel),
                plantasAfetadas: r.plantasAfetadas,
                condicoesFavoraveis: r.condicoesFavoraveis,
                tratamentoPassosJson: JSON.stringify([r.tratamentoPasso1, r.tratamentoPasso2, r.tratamentoPasso3].filter(Boolean)),
            })
        });
        if (resp.ok) {
            btn.classList.add('salvo');
            btn.textContent = 'Salvo no histórico';
            limparEstadoLocal();
        } else {
            const err = await resp.json().catch(() => ({}));
            btn.disabled = false;
            btn.textContent = err.erro ? `Erro: ${err.erro}` : 'Erro ao salvar. Tentar novamente';
        }
    } catch {
        btn.disabled = false;
        btn.textContent = 'Erro de conexão';
    }
}

function escapeHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function tipoClass(tipo) {
    const m = {
        'Doença Fúngica': 'rt-fungica', 'Doença Bacteriana': 'rt-bacteriana', 'Virose': 'rt-virose',
        'Praga de Inseto': 'rt-praga', 'Praga de Ácaro': 'rt-acaro',
        'Deficiência Nutricional': 'rt-defic', 'Saudável': 'rt-saudavel'
    };
    return m[tipo] || 'rt-inconcl';
}

function urgBanner(u, dias) {
    if (!u || u === 'nenhuma') return '';
    const cls = { imediata: 'urg-imediata', 'em 48h': 'urg-48h', 'em 7 dias': 'urg-7dias', monitorar: 'urg-monitorar' }[u] || 'urg-monitorar';
    const lab = { imediata: 'Imediata', 'em 48h': 'Em até 48h', 'em 7 dias': 'Em até 7 dias', monitorar: 'Monitorar' }[u] || u;
    const diasTxt = dias > 0 ? ` — agir em até ${dias} dia${dias > 1 ? 's' : ''}` : '';
    return `<div class="urg-banner ${cls}"><strong>Urgência: ${lab}</strong>${diasTxt}</div>`;
}
