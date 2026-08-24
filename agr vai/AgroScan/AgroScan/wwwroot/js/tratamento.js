// js/tratamento.js — acompanhamento visual do tratamento de um diagnóstico
// Página aberta como tratamento.html?diagnosticoId=123

let estadoAtual = null;

function initSidebar() {
    const menuBtn = document.getElementById('menuBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (!menuBtn || !sidebar || !overlay) return;
    menuBtn.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('show'); });
    overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); });
}

document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
    const nome = Auth.getNome();
    document.getElementById('nomeUsuario').textContent = nome;
    document.getElementById('avatarLetra').textContent = nome.charAt(0).toUpperCase();

    const params = new URLSearchParams(window.location.search);
    const id = params.get('diagnosticoId');
    if (!id) {
        renderErro('Nenhum diagnóstico informado. Volte ao histórico e escolha um diagnóstico para acompanhar.');
        return;
    }
    carregar(id);
});

async function carregar(diagnosticoId) {
    try {
        const resp = await Auth.fetchAuth(`/api/tratamento/${diagnosticoId}`);
        if (!resp.ok) {
            renderErro('Não foi possível carregar este tratamento.');
            return;
        }
        estadoAtual = await resp.json();
        estadoAtual.diagnosticoId = diagnosticoId;
        render();
    } catch {
        renderErro('Falha de conexão ao carregar o tratamento.');
    }
}

function renderErro(msg) {
    document.getElementById('conteudo').innerHTML = `
        <div class="estado-vazio"><div class="emoji">??</div><h3>Ops</h3><p>${msg}</p>
        <a href="historico.html" style="color:var(--primary);font-weight:600;margin-top:10px;display:inline-block;">? Voltar ao histórico</a></div>`;
}

const LABEL_STATUS = {
    nao_iniciado: { texto: 'Não iniciado', icone: '?' },
    em_andamento: { texto: 'Em tratamento', icone: '??' },
    curada: { texto: 'Curada', icone: '?' },
};

function formatarData(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString('pt-BR');
}

function diasDesde(iso) {
    if (!iso) return null;
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    return d < 0 ? 0 : d;
}

function render() {
    const d = estadoAtual;
    const total = d.etapas.length;
    const concluidas = d.etapas.filter(e => e.concluida).length;
    const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0;
    const status = LABEL_STATUS[d.statusTratamento] || LABEL_STATUS.nao_iniciado;

    const dias = diasDesde(d.dataInicioTratamento);
    const inicioTxt = formatarData(d.dataInicioTratamento);
    const concluidoTxt = formatarData(d.dataConclusaoTratamento);

    const celebracao = d.statusTratamento === 'curada' ? `
        <div class="trat-celebracao">
            <div class="emoji">??</div>
            <h3>Hortaliça curada!</h3>
            <p>Tratamento concluído em ${concluidoTxt || 'data não registrada'}. Continue monitorando para evitar reincidência.</p>
        </div>` : '';

    const etapasHtml = d.etapas.map(e => `
        <div class="trat-step ${e.concluida ? 'done' : ''}">
            <button class="trat-checkbox ${e.concluida ? 'checked' : ''}" onclick="alternarEtapa(${e.etapaId}, ${!e.concluida})" title="${e.concluida ? 'Desmarcar' : 'Marcar como concluída'}">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 4L6 11l-3-3"/></svg>
            </button>
            <div class="trat-step-text">
                <div class="desc">${e.descricao}</div>
                ${e.concluida && e.dataConclusao ? `<div class="data-conclusao">? Concluído em ${formatarData(e.dataConclusao)}</div>` : ''}
            </div>
        </div>`).join('');

    const extrasHtml = (d.tratamentoEcologico || d.tratamentoQuimico || d.prevencao) ? `
        <div class="trat-extra-grid">
            ${d.tratamentoEcologico ? `<div class="trat-extra-card"><div class="h">?? Tratamento ecológico</div><div class="b">${d.tratamentoEcologico}</div></div>` : ''}
            ${d.tratamentoQuimico ? `<div class="trat-extra-card"><div class="h">?? Tratamento químico</div><div class="b">${d.tratamentoQuimico}</div></div>` : ''}
            ${d.prevencao ? `<div class="trat-extra-card" style="grid-column:1/-1"><div class="h">??? Prevenção</div><div class="b">${d.prevencao}</div></div>` : ''}
        </div>` : '';

    const acoesHtml = d.statusTratamento === 'curada'
        ? `<div class="trat-actions">
             <button class="trat-btn trat-btn-outline" onclick="reabrirTratamento()">? Reabrir tratamento</button>
             <a class="trat-btn trat-btn-outline" href="historico.html" style="text-decoration:none;display:inline-flex;align-items:center;">? Voltar ao histórico</a>
           </div>`
        : `<div class="trat-actions">
             ${concluidas === total && total > 0 ? `<button class="trat-btn trat-btn-primary" onclick="marcarCurada()">? Marcar como curada</button>` : ''}
             <a class="trat-btn trat-btn-outline" href="historico.html" style="text-decoration:none;display:inline-flex;align-items:center;">? Voltar ao histórico</a>
           </div>`;

    document.getElementById('conteudo').innerHTML = `
        ${celebracao}
        <div class="trat-header-card">
            <div class="trat-ring-wrap">
                <div class="trat-ring" style="--pct:${pct}">
                    <div class="trat-ring-label">
                        <div class="pct">${pct}%</div>
                        <div class="sub">${concluidas}/${total}</div>
                    </div>
                </div>
            </div>
            <div class="trat-info">
                <h1>${d.nomeDoenca || 'Diagnóstico'}</h1>
                <div class="sci">${[d.nomeCientifico, d.hortalicaNome].filter(Boolean).join(' · ')}</div>
                <span class="trat-status-badge st-${d.statusTratamento}">${status.icone} ${status.texto}</span>
                <div class="trat-meta">
                    ${inicioTxt ? `<span>Início: <strong>${inicioTxt}</strong></span>` : '<span>Tratamento ainda não iniciado</span>'}
                    ${dias !== null && d.statusTratamento !== 'curada' ? `<span><strong>${dias}</strong> dia${dias === 1 ? '' : 's'} em tratamento</span>` : ''}
                    ${concluidoTxt ? `<span>Concluído: <strong>${concluidoTxt}</strong></span>` : ''}
                </div>
            </div>
        </div>

        <div class="trat-timeline">
            <h2>?? Checklist do tratamento</h2>
            ${etapasHtml}
        </div>

        ${extrasHtml}

        ${acoesHtml}
    `;
}

async function alternarEtapa(etapaId, novoValor) {
    // Atualização otimista: reflete na tela antes da resposta do servidor
    const etapa = estadoAtual.etapas.find(e => e.etapaId === etapaId);
    if (etapa) {
        etapa.concluida = novoValor;
        etapa.dataConclusao = novoValor ? new Date().toISOString() : null;
        if (estadoAtual.statusTratamento === 'nao_iniciado' && novoValor) {
            estadoAtual.statusTratamento = 'em_andamento';
            estadoAtual.dataInicioTratamento = estadoAtual.dataInicioTratamento || new Date().toISOString();
        }
        render();
    }

    try {
        await Auth.fetchAuth(`/api/tratamento/etapa/${etapaId}`, {
            method: 'PUT',
            body: JSON.stringify({ concluida: novoValor })
        });
    } catch {
        // Falhou — recarrega do servidor para não ficar com estado divergente
        carregar(estadoAtual.diagnosticoId);
    }
}

async function marcarCurada() {
    if (!confirm('Confirmar que a hortaliça foi curada? Isso encerra o acompanhamento deste tratamento.')) return;
    try {
        await Auth.fetchAuth(`/api/tratamento/${estadoAtual.diagnosticoId}/concluir`, { method: 'POST' });
        carregar(estadoAtual.diagnosticoId);
    } catch {
        alert('Erro de conexão ao marcar como curada.');
    }
}

async function reabrirTratamento() {
    try {
        await Auth.fetchAuth(`/api/tratamento/${estadoAtual.diagnosticoId}/reabrir`, { method: 'POST' });
        carregar(estadoAtual.diagnosticoId);
    } catch {
        alert('Erro de conexão ao reabrir tratamento.');
    }
}