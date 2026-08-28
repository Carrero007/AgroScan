// js/tratamento.js — acompanhamento visual do tratamento de um diagnóstico
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
        if (!resp.ok) { renderErro('Não foi possível carregar este tratamento.'); return; }
        estadoAtual = await resp.json();
        estadoAtual.diagnosticoId = diagnosticoId;
        render();
    } catch {
        renderErro('Falha de conexão ao carregar o tratamento.');
    }
}

function renderErro(msg) {
    document.getElementById('conteudo').innerHTML = `
        <div class="estado-vazio"><div class="emoji">⚠️</div><h3>Ops</h3><p>${msg}</p>
        <a href="historico.html" style="color:var(--primary);font-weight:600;margin-top:10px;display:inline-block;">← Voltar ao histórico</a></div>`;
}

const LABEL_STATUS = {
    nao_iniciado: { texto: 'Não iniciado', icone: '⏳' },
    em_andamento: { texto: 'Em tratamento', icone: '🌱' },
    curada: { texto: 'Curada', icone: '✅' },
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
            <div class="emoji">🎉</div>
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
                ${e.concluida && e.dataConclusao ? `<div class="data-conclusao">✓ Concluído em ${formatarData(e.dataConclusao)}</div>` : ''}
            </div>
        </div>`).join('');

    const extrasHtml = (d.tratamentoEcologico || d.tratamentoQuimico || d.prevencao) ? `
        <div class="trat-extra-grid">
            ${d.tratamentoEcologico ? `<div class="trat-extra-card"><div class="h">🌿 Tratamento ecológico</div><div class="b">${d.tratamentoEcologico}</div></div>` : ''}
            ${d.tratamentoQuimico ? `<div class="trat-extra-card"><div class="h">🧪 Tratamento químico</div><div class="b">${d.tratamentoQuimico}</div></div>` : ''}
            ${d.prevencao ? `<div class="trat-extra-card" style="grid-column:1/-1"><div class="h">🛡️ Prevenção</div><div class="b">${d.prevencao}</div></div>` : ''}
        </div>` : '';

    const acoesHtml = d.statusTratamento === 'curada'
        ? `<div class="trat-actions">
             <button class="trat-btn trat-btn-outline" onclick="reabrirTratamento()">↩ Reabrir tratamento</button>
             <a class="trat-btn trat-btn-outline" href="historico.html" style="text-decoration:none;display:inline-flex;align-items:center;">← Voltar ao histórico</a>
           </div>`
        : `<div class="trat-actions">
             ${concluidas === total && total > 0 ? `<button class="trat-btn trat-btn-primary" onclick="marcarCurada()">✓ Marcar como curada</button>` : ''}
             <a class="trat-btn trat-btn-outline" href="historico.html" style="text-decoration:none;display:inline-flex;align-items:center;">← Voltar ao histórico</a>
           </div>`;

    // ── Barra de exportação (PDF / e-mail / WhatsApp) ──
    const exportHtml = `
        <div class="trat-export-bar">
            <button class="trat-export-btn" id="btnTratPdf" onclick="exportarTratamentoPDF()" title="Baixar PDF">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" width="15" height="15"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/></svg>
                PDF
            </button>
            <button class="trat-export-btn" id="btnTratEmail" onclick="enviarTratamentoEmail()" title="Enviar por e-mail">📧 E-mail</button>
            <button class="trat-export-btn" id="btnTratWhats" onclick="enviarTratamentoWhatsapp()" title="Enviar por WhatsApp">💬 WhatsApp</button>
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
            ${exportHtml}
        </div>

        <div class="trat-timeline">
            <h2>📋 Checklist do tratamento</h2>
            ${etapasHtml}
        </div>

        ${extrasHtml}

        ${acoesHtml}
    `;
}

async function alternarEtapa(etapaId, novoValor) {
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
        carregar(estadoAtual.diagnosticoId);
    }
}

async function marcarCurada() {
    if (!confirm('Confirmar que a hortaliça foi curada? Isso encerra o acompanhamento deste tratamento.')) return;
    try {
        await Auth.fetchAuth(`/api/tratamento/${estadoAtual.diagnosticoId}/concluir`, { method: 'POST' });
        carregar(estadoAtual.diagnosticoId);
    } catch { alert('Erro de conexão ao marcar como curada.'); }
}

async function reabrirTratamento() {
    try {
        await Auth.fetchAuth(`/api/tratamento/${estadoAtual.diagnosticoId}/reabrir`, { method: 'POST' });
        carregar(estadoAtual.diagnosticoId);
    } catch { alert('Erro de conexão ao reabrir tratamento.'); }
}

// ── EXPORTAR PDF (client-side, mesma lib jsPDF do histórico) ──
async function exportarTratamentoPDF() {
    const btn = document.getElementById('btnTratPdf');
    if (!btn || !window.jspdf) { alert('Gerador de PDF não carregado.'); return; }
    const d = estadoAtual;
    const original = btn.innerHTML;
    btn.disabled = true; btn.textContent = '...';

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait' });
        const x = 14; let y = 20;

        doc.setFontSize(16); doc.setTextColor(40);
        doc.text('AgroScan — Acompanhamento de Tratamento', x, y);
        doc.setDrawColor(90, 138, 106); doc.line(x, y + 4, x + 182, y + 4);

        y += 16;
        doc.setFontSize(18); doc.setTextColor(20);
        doc.text(d.nomeDoenca || 'Diagnóstico', x, y);
        y += 7;
        doc.setFontSize(11); doc.setTextColor(110); doc.setFont(undefined, 'italic');
        doc.text([d.nomeCientifico, d.hortalicaNome].filter(Boolean).join(' · '), x, y);
        doc.setFont(undefined, 'normal');

        y += 10;
        const total = d.etapas.length;
        const concluidas = d.etapas.filter(e => e.concluida).length;
        doc.setFontSize(10); doc.setTextColor(90, 138, 106);
        doc.text(`Progresso: ${concluidas}/${total} etapas concluídas · Status: ${LABEL_STATUS[d.statusTratamento]?.texto || d.statusTratamento}`, x, y);

        y += 12;
        doc.setFontSize(9.5); doc.setTextColor(90, 138, 106); doc.setFont(undefined, 'bold');
        doc.text('CHECKLIST DO TRATAMENTO', x, y); doc.setFont(undefined, 'normal');
        y += 6;

        doc.setFontSize(10.5); doc.setTextColor(50);
        d.etapas.forEach((e, i) => {
            const marca = e.concluida ? '[x]' : '[ ]';
            const linhas = doc.splitTextToSize(`${marca} ${e.descricao}`, 182);
            doc.text(linhas, x, y);
            y += linhas.length * 5 + 3;
            if (y > 265) { doc.addPage(); y = 20; }
        });

        const addSecao = (titulo, texto) => {
            if (!texto) return;
            y += 4;
            doc.setFontSize(9.5); doc.setTextColor(90, 138, 106); doc.setFont(undefined, 'bold');
            doc.text(titulo.toUpperCase(), x, y); doc.setFont(undefined, 'normal');
            doc.setFontSize(10.5); doc.setTextColor(50);
            const linhas = doc.splitTextToSize(texto, 182);
            doc.text(linhas, x, y + 6);
            y += 6 + linhas.length * 5 + 6;
            if (y > 265) { doc.addPage(); y = 20; }
        };
        addSecao('Tratamento ecológico', d.tratamentoEcologico);
        addSecao('Tratamento químico', d.tratamentoQuimico);
        addSecao('Prevenção', d.prevencao);

        doc.setFontSize(8); doc.setTextColor(150);
        doc.text(`Gerado por AgroScan em ${new Date().toLocaleString('pt-BR')} · Produtor: ${Auth.getNome()}`, x, 290);

        doc.save(`agroscan-tratamento-${d.diagnosticoId}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
        console.error(e);
        alert('Erro ao gerar o PDF.');
    } finally {
        btn.disabled = false; btn.innerHTML = original;
    }
}

// ── ENVIAR POR E-MAIL / WHATSAPP (reaproveita RelatorioController) ──
async function enviarTratamentoEmail() {
    const email = prompt('Digite o e-mail para envio do relatório:');
    if (!email || !email.includes('@')) return;
    const btn = document.getElementById('btnTratEmail');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
    try {
        const resp = await Auth.fetchAuth('/api/relatorio/enviar-email', {
            method: 'POST',
            body: JSON.stringify({ diagnosticoId: estadoAtual.diagnosticoId, email })
        });
        const data = await resp.json();
        alert(resp.ok ? `✓ ${data.mensagem}` : `Erro: ${data.erro || 'Falha ao enviar.'}`);
    } catch { alert('Erro de conexão ao enviar e-mail.'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '📧 E-mail'; } }
}

async function enviarTratamentoWhatsapp() {
    const numero = prompt('Número do WhatsApp (com DDD e código do país, só números — ex: 5511999998888). Deixe em branco para escolher o contato na hora:');
    const btn = document.getElementById('btnTratWhats');
    if (btn) { btn.disabled = true; btn.textContent = 'Gerando...'; }
    try {
        const resp = await Auth.fetchAuth('/api/relatorio/link-whatsapp', {
            method: 'POST',
            body: JSON.stringify({ diagnosticoId: estadoAtual.diagnosticoId, numeroWhatsapp: numero || null })
        });
        const data = await resp.json();
        if (resp.ok && data.linkWhatsapp) window.open(data.linkWhatsapp, '_blank');
        else alert(`Erro: ${data.erro || 'Falha ao gerar link.'}`);
    } catch { alert('Erro de conexão ao gerar link do WhatsApp.'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '💬 WhatsApp'; } }
}