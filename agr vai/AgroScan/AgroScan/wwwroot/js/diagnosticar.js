// ── AUTH INLINE (mantido para compatibilidade; Auth.js real já é carregado antes) ──
// Auth vem de js/Auth.js (incluído antes deste script no HTML).

// Menu mobile da sidebar
function initSidebar() {
    const menuBtn = document.getElementById('menuBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (!menuBtn || !sidebar || !overlay) {
        console.warn('AgroScan: controles de menu mobile não encontrados no DOM.');
        return;
    }

    menuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('show');
    });
    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
    });
}

// ── ESTADO ────────────────────────────────────────────────────
let imagemBase64 = null;
let mimeType = 'image/jpeg';
let nomeArquivo = null;
let resultadoAtual = null;
let estagioAtual = '';
const sintomasSet = new Set();
const climaSet = new Set();

// Hortaliças cadastradas pelo usuário (substituem a lista fixa antiga)
let hortalicasCadastradas = [];
let hortalicaIdSelecionada = null;
window._hortalicaNomeAtual = '';

// ── PERSISTÊNCIA LOCAL (sobrevive a F5 / fechar aba) ────────────
// Guarda tudo que o usuário já preencheu (foto, contexto, resultado
// da IA) no localStorage, para não perder o trabalho ao atualizar
// a página. Cada usuário tem sua própria chave (por UsuarioId).
const LS_DIAG_KEY = 'as_diag_estado_' + (typeof Auth !== 'undefined' && Auth.getUsuarioId ? Auth.getUsuarioId() : 'anon');

function salvarEstadoLocal() {
    try {
        localStorage.setItem(LS_DIAG_KEY, JSON.stringify({
            imagemBase64,
            mimeType,
            nomeArquivo,
            hortalicaIdSelecionada,
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
    } catch (e) {
        // localStorage cheio ou indisponível — não é crítico, apenas não persiste
        console.warn('AgroScan: não foi possível salvar estado local.', e);
    }
}

function restaurarEstadoLocal() {
    let salvo;
    try {
        salvo = JSON.parse(localStorage.getItem(LS_DIAG_KEY));
    } catch {
        return;
    }
    if (!salvo || !salvo.imagemBase64) return;

    // Descarta rascunhos muito antigos (mais de 24h) para evitar
    // reabrir contexto obsoleto sem o usuário perceber.
    if (salvo.salvoEm && (Date.now() - salvo.salvoEm) > 24 * 60 * 60 * 1000) {
        limparEstadoLocal();
        return;
    }

    imagemBase64 = salvo.imagemBase64;
    mimeType = salvo.mimeType || 'image/jpeg';
    nomeArquivo = salvo.nomeArquivo || null;
    hortalicaIdSelecionada = salvo.hortalicaIdSelecionada || null;
    window._hortalicaNomeAtual = salvo.nomeHortalica || '';
    estagioAtual = salvo.estagioAtual || '';
    (salvo.sintomas || []).forEach(s => sintomasSet.add(s));
    (salvo.clima || []).forEach(c => climaSet.add(c));

    const regiaoEl = document.getElementById('regiaoClima');
    const tratEl = document.getElementById('tratamentosAnteriores');
    const sintExtraEl = document.getElementById('sintomasExtra');
    if (regiaoEl) regiaoEl.value = salvo.regiaoClima || '';
    if (tratEl) tratEl.value = salvo.tratamentosAnteriores || '';
    if (sintExtraEl) sintExtraEl.value = salvo.sintomasExtra || '';

    // Restaura visual da foto
    const prev = document.getElementById('previewImg');
    if (prev) {
        prev.src = `data:${mimeType};base64,${imagemBase64}`;
        prev.style.display = 'block';
    }
    if (zona) {
        const icon = zona.querySelector('.upload-icon');
        const label = zona.querySelector('.upload-label');
        const hint = zona.querySelector('.upload-hint');
        if (icon) icon.style.display = 'none';
        if (label) label.style.display = 'none';
        if (hint) hint.style.display = 'none';
        zona.style.minHeight = '0';
    }
    const btnAnalisar = document.getElementById('btnAnalisar');
    if (btnAnalisar) btnAnalisar.disabled = false;

    // Restaura chips visuais (estágio, sintomas, clima)
    document.querySelectorAll('#chipsEst .chip').forEach(el => {
        const valor = el.getAttribute('onclick')?.match(/chipEst\(this,'([^']*)'\)/)?.[1] ?? '';
        if (valor === estagioAtual && estagioAtual !== '') el.classList.add('on');
    });
    document.querySelectorAll('#chipsSint .chip, #chipsClima .chip').forEach(el => {
        const txt = el.textContent.replace(/^\S+\s/, '').trim();
        if (sintomasSet.has(txt) || climaSet.has(txt)) el.classList.add('on');
    });

    // Restaura resultado do diagnóstico, se já existia
    if (salvo.resultadoAtual) {
        resultadoAtual = salvo.resultadoAtual;
        const estadoVazio = document.getElementById('estadoVazio');
        if (estadoVazio) estadoVazio.style.display = 'none';
        renderizarResultado(resultadoAtual);
    }

    atualizarQualidade();
}

function limparEstadoLocal() {
    try { localStorage.removeItem(LS_DIAG_KEY); } catch { }
}

document.addEventListener('DOMContentLoaded', () => {
    initSidebar();

    const nome = Auth.getNome();
    document.getElementById('nomeUsuario').textContent = nome;
    document.getElementById('avatarLetra').textContent = nome.charAt(0).toUpperCase();

    // Restaura o rascunho salvo somente depois que o catálogo de
    // hortaliças terminar de carregar (senão o <select> ainda não
    // tem as opções e a pré-seleção falha).
    carregarHortalicasUsuario().then(restaurarEstadoLocal);
});

// ── HORTALIÇAS DO USUÁRIO (só cadastradas — sem lista fictícia) ──
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

        // Pré-seleção vinda do catálogo (hortalicas.html -> ?hortalicaId=)
        const params = new URLSearchParams(window.location.search);
        const idParam = params.get('hortalicaId');
        if (idParam) {
            select.value = idParam;
            onHortalicaSelecionada();
        }
    } catch {
        select.innerHTML = `<option value="">Erro ao carregar catálogo</option>`;
    }
}

function onHortalicaSelecionada() {
    const select = document.getElementById('hortalicaSelect');
    const id = select.value;
    hortalicaIdSelecionada = id || null;
    const h = hortalicasCadastradas.find(x => String(x.hortalicaId) === String(id));
    window._hortalicaNomeAtual = h ? (h.nomePopular || h.nomeCientifico) : '';
    atualizarQualidade();
}

// ── UPLOAD / DRAG & DROP ─────────────────────────────────────
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
        zona.querySelector('.upload-icon').style.display = 'none';
        zona.querySelector('.upload-label').style.display = 'none';
        zona.querySelector('.upload-hint').style.display = 'none';
        zona.style.minHeight = '0';
        document.getElementById('btnAnalisar').disabled = false;
        atualizarQualidade();
        salvarEstadoLocal();
    };
    reader.readAsDataURL(file);
}

// ── CHIPS (estágio, sintomas, clima) ───────────────────────────
function chipEst(el, valor) {
    const era = el.classList.contains('on');
    document.querySelectorAll('#chipsEst .chip').forEach(c => c.classList.remove('on'));
    if (!era) { el.classList.add('on'); estagioAtual = valor; }
    else estagioAtual = '';
    atualizarQualidade();
    salvarEstadoLocal();
}

function chipToggle(el, conjunto) {
    const txt = el.textContent.replace(/^\S+\s/, '').trim();
    if (el.classList.toggle('on')) conjunto.add(txt);
    else conjunto.delete(txt);
    atualizarQualidade();
    salvarEstadoLocal();
}

// ── QUALIDADE DO CONTEXTO ─────────────────────────────────────
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
    else { fill.style.background = 'var(--leaf)'; label.textContent = '🎯 Excelente!'; }

    salvarEstadoLocal();
}

// ── DIAGNOSTICAR ─────────────────────────────────────────────
async function diagnosticar() {
    if (!imagemBase64) return;

    if (!hortalicaIdSelecionada) {
        alert('Selecione uma hortaliça do seu catálogo antes de diagnosticar.');
        return;
    }

    const btn = document.getElementById('btnAnalisar');
    btn.classList.add('loading');
    btn.disabled = true;
    const estadoVazio = document.getElementById('estadoVazio');
    if (estadoVazio) estadoVazio.style.display = 'none';
    document.getElementById('resultPanel').innerHTML = `
            <div class="estado-vazio">
                <div class="emoji" style="animation:spin 2s linear infinite;display:inline-block;">🔬</div>
                <h3>Analisando com IA...</h3>
                <p>Nossa IA especializada em hortaliças está examinando a imagem.</p>
            </div>`;

    const sintomasFinal = [...sintomasSet, document.getElementById('sintomasExtra').value.trim()]
        .filter(Boolean).join('. ');
    const climaFinal = [...climaSet].join(', ');

    try {
        const body = {
            imagemBase64,
            mimeType,
            nomeArquivo,
            hortalicaNome: window._hortalicaNomeAtual || null,
            estagioPlanta: estagioAtual || null,
            regiaoClima: document.getElementById('regiaoClima').value.trim() || null,
            condicoesClimaticas: climaFinal || null,
            sintomasDescricao: sintomasFinal || null,
            tratamentosAnteriores: document.getElementById('tratamentosAnteriores').value.trim() || null,
        };

        const resp = await Auth.fetchAuth('/api/diagnostico/diagnosticar', {
            method: 'POST',
            body: JSON.stringify(body)
        });

        let data;
        try {
            data = await resp.json();
        } catch {
            data = { erro: `Resposta invalida do servidor (HTTP ${resp.status}).` };
        }

        if (!resp.ok) {
            const transitorio = data.transitorio || resp.status === 503 || resp.status === 429;
            document.getElementById('resultPanel').innerHTML = `
                    <div class="estado-vazio">
                        <div class="emoji">${transitorio ? '⏳' : '⚠️'}</div>
                        <h3>${transitorio ? 'IA sobrecarregada no momento' : 'Erro na análise'}</h3>
                        <p>${data.erro || 'Falha ao analisar. Tente novamente.'}</p>
                        <button class="btn-analisar" style="margin-top:16px;max-width:220px;" onclick="diagnosticar()">
                            <span class="lbl">🔄 Tentar novamente</span>
                        </button>
                        ${data.detalhe ? `<pre style="font-size:10px;color:var(--text3);margin-top:14px;white-space:pre-wrap;text-align:left;max-width:400px;">${escapeHtml(String(data.detalhe))}</pre>` : ''}
                    </div>`;
            return;
        }

        if (!data.tipoDiagnostico && !data.nomeDoenca) {
            document.getElementById('resultPanel').innerHTML = `
                    <div class="estado-vazio">
                        <div class="emoji">⚠️</div>
                        <h3>Resposta incompleta da IA</h3>
                        <p>O servidor respondeu, mas sem dados de diagnóstico. Tente novamente.</p>
                        <button class="btn-analisar" style="margin-top:16px;max-width:220px;" onclick="diagnosticar()">
                            <span class="lbl">🔄 Tentar novamente</span>
                        </button>
                    </div>`;
            return;
        }

        resultadoAtual = data;
        renderizarResultado(data);
        salvarEstadoLocal();

    } catch (e) {
        document.getElementById('resultPanel').innerHTML = `
                <div class="estado-vazio">
                    <div class="emoji">⚠️</div>
                    <h3>Falha de conexão</h3>
                    <p>${e?.message || 'Verifique sua internet e tente novamente.'}</p>
                    <button class="btn-analisar" style="margin-top:16px;max-width:220px;" onclick="diagnosticar()">
                        <span class="lbl">🔄 Tentar novamente</span>
                    </button>
                </div>`;
    } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

// ── RENDERIZAR RESULTADO ──────────────────────────────────────
function renderizarResultado(d) {
    const normalizarNivel10 = (v) => {
        let n = Number(v) || 0;
        if (n > 10 && n <= 100) n = n / 10;
        else if (n > 0 && n <= 1) n = n * 10;
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

    // Fonte técnica + aviso de consulta profissional quando confiança < 95%
    const confNum = Number(d.confianca) || 0;
    const precisaAviso = confNum < 95;
    const avisoTexto = d.recomendacaoProfissional
        || (precisaAviso ? 'Em caso de dúvida, consulte um agrônomo de confiança antes de aplicar qualquer tratamento.' : '');

    const fonteHtml = (d.fonteNome || d.fonteUrl || avisoTexto) ? `
            <div class="det-card" style="margin-bottom:16px;">
                <div class="det-header">📚 Fonte técnica</div>
                <div class="det-body">
                    ${d.fonteNome ? `<strong>${d.fonteNome}</strong>` : 'Fonte não informada pela IA'}
                    ${d.fonteUrl ? ` — <a href="${d.fonteUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--primary);text-decoration:underline;">ver fonte</a>` : ''}
                    ${avisoTexto ? `
                    <div style="margin-top:10px;padding:10px 12px;border-radius:calc(var(--radius) - 4px);background:color-mix(in oklch, var(--amber) 12%, transparent);border:1px solid color-mix(in oklch, var(--amber) 30%, transparent);color:var(--amber);font-size:12.5px;line-height:1.5;">
                        ⚠️ ${avisoTexto}
                    </div>` : ''}
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
                <div class="det-card">
                    <div class="det-header">🔍 Sintomas Observados</div>
                    <div class="det-body">${d.sintomasObservados || '—'}</div>
                </div>
                <div class="det-card">
                    <div class="det-header">🌡️ Condições Favoráveis</div>
                    <div class="det-body">${d.condicoesFavoraveis || '—'}</div>
                </div>
            </div>

            <div class="card">
                <div class="card-header">💊 Protocolo de Tratamento</div>
                <div class="card-body">
                    <div class="trat-steps">
                        ${passos.map((p, i) => `<div class="trat-step"><div class="step-num">${i + 1}</div><div class="step-text">${p}</div></div>`).join('')}
                    </div>
                </div>
            </div>

            <div class="detail-grid">
                <div class="det-card">
                    <div class="det-header">🌿 Tratamento Ecológico</div>
                    <div class="det-body">${d.tratamentoEcologico || '—'}</div>
                </div>
                <div class="det-card">
                    <div class="det-header">🧪 Tratamento Químico</div>
                    <div class="det-body">${d.tratamentoQuimico || '—'}</div>
                </div>
                <div class="det-card">
                    <div class="det-header">🛡️ Prevenção</div>
                    <div class="det-body">${d.prevencao || '—'}</div>
                </div>
                <div class="det-card">
                    <div class="det-header">⚠️ Risco / Plantas Afetadas</div>
                    <div class="det-body">${d.plantasAfetadas || '—'}<br><br><strong>${d.riscoPropagacaoTexto || ''}</strong></div>
                </div>
            </div>

            ${fonteHtml}

            <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
                <button class="btn-salvar" id="btnSalvar" onclick="salvarDiagnostico()">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M13 11v2H3v-2M8 3v7M5 7l3 3 3-3"/></svg>
                    Salvar no histórico
                </button>
                <button class="btn-salvar" onclick="window.print()" style="border-color:var(--text3);color:var(--text3);">
                    🖨️ Imprimir
                </button>
            </div>
        `;
}

async function salvarDiagnostico() {
    if (!resultadoAtual) return;
    const btn = document.getElementById('btnSalvar');
    btn.disabled = true; btn.textContent = 'Salvando...';

    // Normaliza confiança/níveis que a IA às vezes retorna como fração (0.95) em vez de inteiro (95)
    const normalizarInt = (v) => {
        let n = Number(v) || 0;
        if (n > 0 && n <= 1) n = n * 100; // 0.95 -> 95
        return Math.round(Math.max(0, Math.min(100, n)));
    };
    const normalizarNivel = (v) => {
        let n = Number(v) || 0;
        if (n > 0 && n <= 1) n = n * 10; // 0.5 -> 5
        return Math.round(Math.max(0, Math.min(10, n)));
    };

    try {
        const resp = await Auth.fetchAuth('/api/diagnostico/salvar', {
            method: 'POST',
            body: JSON.stringify({
                hortalicaId: hortalicaIdSelecionada ? parseInt(hortalicaIdSelecionada) : null,
                tipoDiagnostico: resultadoAtual.tipoDiagnostico,
                nomeDoenca: resultadoAtual.nomeDoenca,
                nomeCientifico: resultadoAtual.nomeCientifico,
                agenteCausador: resultadoAtual.agenteCausador,
                confianca: normalizarInt(resultadoAtual.confianca),
                gravidadeNivel: normalizarNivel(resultadoAtual.gravidadeNivel),
                gravidade: resultadoAtual.gravidade,
                sintomasObservados: resultadoAtual.sintomasObservados,
                tratamento: resultadoAtual.tratamentoPasso1,
                tratamentoEcologico: resultadoAtual.tratamentoEcologico,
                tratamentoQuimico: resultadoAtual.tratamentoQuimico,
                prevencao: resultadoAtual.prevencao,
                riscoPropagacao: resultadoAtual.riscoPropagacao,
                riscoPropagacaoNivel: normalizarNivel(resultadoAtual.riscoPropagacaoNivel),
                plantasAfetadas: resultadoAtual.plantasAfetadas,
                condicoesFavoraveis: resultadoAtual.condicoesFavoraveis,
                tratamentoPassosJson: JSON.stringify(
                    [resultadoAtual.tratamentoPasso1, resultadoAtual.tratamentoPasso2, resultadoAtual.tratamentoPasso3].filter(Boolean)),
            })
        });

        if (resp.ok) {
            btn.classList.add('salvo');
            btn.textContent = '✓ Salvo no histórico!';
            // Diagnóstico já persistido no banco — o rascunho local não é mais necessário
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

function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
    const icon = { imediata: '🚨', 'em 48h': '⚠️', 'em 7 dias': '📅', monitorar: '👁️' }[u] || '📋';
    const lab = { imediata: 'Imediata', 'em 48h': 'Em até 48h', 'em 7 dias': 'Em até 7 dias', monitorar: 'Monitorar' }[u] || u;
    const diasTxt = dias > 0 ? ` — Agir em até ${dias} dia${dias > 1 ? 's' : ''}` : '';
    return `<div class="urg-banner ${cls}">${icon} <strong>Urgência: ${lab}</strong>${diasTxt}</div>`;
}