let todosDiag = [];
let paginaAtual = 1;
const TAM = 15;
let filtroHortalicaId = null;

document.addEventListener('DOMContentLoaded', () => {
    const nome = Auth.getNome();
    document.getElementById('nomeUsuario').textContent = nome;
    document.getElementById('avatarLetra').textContent = nome.charAt(0).toUpperCase();

    const params = new URLSearchParams(window.location.search);
    const hid = params.get('hortalicaId');
    const hnome = params.get('nome');
    if (hid) {
        filtroHortalicaId = parseInt(hid);
        const badge = document.getElementById('filtroHortalicaBadge');
        if (badge) {
            document.getElementById('filtroHortalicaNome').textContent = hnome || `ID ${hid}`;
            badge.style.display = 'block';
        }
    }

    const grav = params.get('gravidade');
    if (grav) document.getElementById('filtroGrav').value = grav;

    carregarPagina(1);
});

async function carregarPagina(pag) {
    paginaAtual = pag;
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = `<tr><td colspan="8"><div class="skeleton" style="height:13px;margin:14px 16px;"></div></td></tr>`.repeat(3);

    try {
        const resp = await Auth.fetchAuth(`/api/diagnostico/historico?pagina=${pag}&tamanhoPagina=${TAM}`);
        const data = await resp.json();
        const lista = data.dados || [];

        const ftipo = document.getElementById('filtroTipo').value;
        const fgrav = document.getElementById('filtroGrav').value;
        const filtrada = lista.filter(d =>
            (!ftipo || d.tipoDiagnostico === ftipo) &&
            (!fgrav || d.gravidade === fgrav) &&
            (!filtroHortalicaId || d.hortalicaId === filtroHortalicaId)
        );

        if (filtrada.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">
            Nenhum diagnóstico encontrado. <a href="diagnosticar.html" style="color:var(--primary)">Faça o primeiro.</a>
        </div></td></tr>`;
            document.getElementById('paginfoText').textContent = '0 registros';
            document.getElementById('paginacaoBtns').innerHTML = '';
            return;
        }

        tbody.innerHTML = filtrada.map(d => {
            const data_ = new Date(d.dataDiagnostico).toLocaleDateString('pt-BR');
            return `<tr data-id="${d.diagnosticoId}" data-json='${JSON.stringify(d).replace(/'/g, "&#39;")}'>
            <td class="c-date">${data_}</td>
            <td class="c-strong">${d.hortalicaNome || '—'}</td>
            <td><div class="c-strong">${d.nomeDoenca || '—'}</div><div class="c-sci">${d.nomeCientifico || ''}</div></td>
            <td>${badgeTipo(d.tipoDiagnostico)}</td>
            <td>${chipGrav(d.gravidade)}</td>
            <td>${chipRisco(d.riscoPropagacao)}</td>
            <td><div class="conf-bar"><div class="conf-track"><div class="conf-fill" style="width:${d.confianca || 0}%"></div></div><span style="font-size:14px;">${d.confianca || 0}%</span></div></td>
            <td class="c-actions">
                <button class="pag-btn btn-row" onclick="abrirModal(${d.diagnosticoId})">Detalhes</button>
                <a class="pag-btn btn-row btn-row-primary" href="tratamento.html?diagnosticoId=${d.diagnosticoId}">Tratamento</a>
            </td>
        </tr>`;
        }).join('');

        document.getElementById('paginfoText').textContent = `${filtrada.length} registro${filtrada.length !== 1 ? 's' : ''}`;

        document.getElementById('paginacaoBtns').innerHTML = `
        <button class="pag-btn" onclick="carregarPagina(${pag - 1})" ${pag <= 1 ? 'disabled' : ''}>‹</button>
        <button class="pag-btn ativo">${pag}</button>
        <button class="pag-btn" onclick="carregarPagina(${pag + 1})" ${lista.length < TAM ? 'disabled' : ''}>›</button>`;

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--red);">Erro ao carregar histórico.</td></tr>`;
    }
}

function abrirModal(id) {
    const row = document.querySelector(`tr[data-id="${id}"]`);
    if (!row) return;
    const d = JSON.parse(row.dataset.json);
    window._diagnosticoModalAtual = d;

    document.getElementById('modalTitle').textContent = d.nomeDoenca || 'Diagnóstico';
    document.getElementById('modalBody').innerHTML = `
        <a href="tratamento.html?diagnosticoId=${d.diagnosticoId}" class="pag-btn btn-row btn-row-primary" style="display:flex;align-items:center;justify-content:center;width:100%!important;height:38px!important;">Acompanhar tratamento</a>
        ${d.hortalicaNome ? `<div style="font-size:15px;color:var(--muted-fg);">Hortaliça: <strong style="color:var(--foreground);">${d.hortalicaNome}</strong></div>` : ''}
        <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;">
            ${badgeTipo(d.tipoDiagnostico)}
            <span class="lbl-chip">Gravidade ${chipGrav(d.gravidade)}</span>
            <span class="lbl-chip">Risco de propagação ${chipRisco(d.riscoPropagacao)}</span>
        </div>
        <div class="modal-row">
            <div class="info-block"><label>Nome científico</label><p><em>${d.nomeCientifico || '—'}</em></p></div>
            <div class="info-block"><label>Agente causador</label><p>${d.agenteCausador || '—'}</p></div>
        </div>
        <div class="info-block"><label>Sintomas observados</label><p>${d.sintomasObservados || '—'}</p></div>
        <div class="modal-row">
            <div class="info-block"><label>Tratamento ecológico</label><p>${d.tratamentoEcologico || '—'}</p></div>
            <div class="info-block"><label>Tratamento químico</label><p>${d.tratamentoQuimico || '—'}</p></div>
        </div>
        <div class="info-block"><label>Prevenção</label><p>${d.prevencao || '—'}</p></div>
        <div class="info-block"><label>Plantas afetadas / Propagação</label><p>${d.plantasAfetadas || '—'}</p></div>
        <div class="modal-row">
            <div class="info-block"><label>Confiança da IA</label><p style="font-size:20px;color:var(--primary)">${d.confianca || 0}%</p></div>
            <div class="info-block"><label>Data</label><p>${new Date(d.dataDiagnostico).toLocaleString('pt-BR')}</p></div>
        </div>`;

    document.getElementById('modalOverlay').classList.add('open');
}

function fecharModal(e) {
    if (!e || e.target === document.getElementById('modalOverlay') || !e.target) {
        document.getElementById('modalOverlay').classList.remove('open');
    }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModal(); });

function badgeTipo(tipo) {
    const m = {
        'Doença Fúngica': 'badge-fungica', 'Doença Bacteriana': 'badge-bacteriana', 'Virose': 'badge-virose',
        'Praga de Inseto': 'badge-praga', 'Praga de Ácaro': 'badge-acaro',
        'Deficiência Nutricional': 'badge-defic', 'Saudável': 'badge-saudavel', 'Inconclusivo': 'badge-inconcl',
    };
    return `<span class="badge ${m[tipo] || 'badge-inconcl'}">${tipo || '—'}</span>`;
}

// Aceita "alta/alto", "media/medio", "baixa/baixo" (gravidade e risco usam o mesmo padrão)
const NIVEL = { alta: 'Alta', alto: 'Alta', media: 'Média', medio: 'Média', baixa: 'Baixa', baixo: 'Baixa' };
const NCLS = { Alta: 'chip-alta', 'Média': 'chip-media', Baixa: 'chip-baixa' };
function chipNivel(v) {
    const l = NIVEL[(v || '').toLowerCase()];
    return l ? `<span class="${NCLS[l]}">${l}</span>` : '<span style="color:var(--text3)">—</span>';
}
function chipGrav(v) { return chipNivel(v); }
function chipRisco(v) { return chipNivel(v); }

function traduzGravidade(g) {
    return { alta: 'Alta', media: 'Média', baixa: 'Baixa' }[g] || '—';
}
function traduzRisco(r) {
    return { alto: 'Alto', alta: 'Alto', medio: 'Médio', media: 'Médio', baixo: 'Baixo', baixa: 'Baixo' }[r] || '—';
}

// ── EXPORTAR HISTÓRICO COMPLETO EM PDF ─────────────────────────
async function exportarHistoricoPDF() {
    const btn = document.getElementById('btnExportarPdf');
    if (!btn || btn.disabled) return;
    const htmlOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Gerando PDF...';

    try {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('Não foi possível carregar o gerador de PDF. Verifique sua conexão e tente novamente.');
            return;
        }
        const ftipo = document.getElementById('filtroTipo').value;
        const fgrav = document.getElementById('filtroGrav').value;

        let todos = [];
        let pagina = 1;
        while (true) {
            const resp = await Auth.fetchAuth(`/api/diagnostico/historico?pagina=${pagina}&tamanhoPagina=100`);
            if (!resp.ok) break;
            const data = await resp.json();
            const lista = data.dados || [];
            todos = todos.concat(lista);
            if (lista.length < 100) break;
            pagina++;
        }

        const filtrada = todos.filter(d =>
            (!ftipo || d.tipoDiagnostico === ftipo) &&
            (!fgrav || d.gravidade === fgrav) &&
            (!filtroHortalicaId || d.hortalicaId === filtroHortalicaId)
        );
        if (filtrada.length === 0) { alert('Nenhum diagnóstico encontrado para exportar.'); return; }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(16); doc.setTextColor(40);
        doc.text('AgroScan — Histórico de Diagnósticos', 14, 16);
        doc.setFontSize(10); doc.setTextColor(120);
        const filtroBadge = document.getElementById('filtroHortalicaNome');
        const sufixoFiltro = (filtroHortalicaId && filtroBadge && filtroBadge.textContent) ? `  ·  Hortaliça: ${filtroBadge.textContent}` : '';
        doc.text(`Produtor: ${Auth.getNome()}  ·  Gerado em: ${new Date().toLocaleString('pt-BR')}  ·  ${filtrada.length} registro(s)${sufixoFiltro}`, 14, 22);

        const linhas = filtrada.slice()
            .sort((a, b) => new Date(b.dataDiagnostico) - new Date(a.dataDiagnostico))
            .map(d => [
                new Date(d.dataDiagnostico).toLocaleDateString('pt-BR'),
                d.hortalicaNome || '—', d.nomeDoenca || '—', d.nomeCientifico || '—', d.tipoDiagnostico || '—',
                traduzGravidade(d.gravidade), traduzRisco(d.riscoPropagacao), `${d.confianca || 0}%`
            ]);

        doc.autoTable({
            startY: 28,
            head: [['Data', 'Hortaliça', 'Doença/Praga', 'Nome científico', 'Tipo', 'Gravidade', 'Risco', 'Confiança']],
            body: linhas,
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [90, 138, 106], textColor: 255 },
            alternateRowStyles: { fillColor: [245, 240, 232] },
            margin: { left: 14, right: 14 },
        });
        doc.save(`agroscan-historico-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
        console.error('Erro ao exportar PDF:', e);
        alert('Erro ao gerar o PDF. Tente novamente.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = htmlOriginal;
    }
}

// ── EXPORTAR UM ÚNICO DIAGNÓSTICO EM PDF ───────────────────────
async function exportarDiagnosticoPDF() {
    const btn = document.getElementById('btnExportarDiagnosticoPdf');
    if (!btn || btn.disabled) return;
    const d = window._diagnosticoModalAtual;
    if (!d) { alert('Nenhum diagnóstico selecionado.'); return; }

    const htmlOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span style="font-size:13px;">...</span>';

    try {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('Não foi possível carregar o gerador de PDF. Verifique sua conexão e tente novamente.');
            return;
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait' });
        const mx = 14, largura = 182;

        doc.setFontSize(16); doc.setTextColor(40);
        doc.text('AgroScan — Relatório de Diagnóstico', mx, 18);
        doc.setDrawColor(90, 138, 106); doc.setLineWidth(0.6);
        doc.line(mx, 22, mx + largura, 22);

        doc.setFontSize(20); doc.setTextColor(20); doc.setFont(undefined, 'bold');
        doc.text(d.nomeDoenca || 'Diagnóstico', mx, 34);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(11); doc.setTextColor(110); doc.setFont(undefined, 'italic');
        doc.text(d.nomeCientifico || '—', mx, 41);
        doc.setFont(undefined, 'normal');

        doc.setFontSize(10); doc.setTextColor(90, 138, 106);
        doc.text(`${d.tipoDiagnostico || '—'}   ·   Gravidade: ${traduzGravidade(d.gravidade)}   ·   Risco de propagação: ${traduzRisco(d.riscoPropagacao)}`, mx, 49);

        let y = 60;
        const addSecao = (titulo, texto) => {
            doc.setFontSize(9.5); doc.setTextColor(90, 138, 106); doc.setFont(undefined, 'bold');
            doc.text(titulo.toUpperCase(), mx, y);
            doc.setFont(undefined, 'normal');
            doc.setFontSize(10.5); doc.setTextColor(50);
            const linhas = doc.splitTextToSize(texto || '—', largura);
            doc.text(linhas, mx, y + 6);
            y += 6 + linhas.length * 5 + 8;
            if (y > 262) { doc.addPage(); y = 20; }
        };
        addSecao('Agente causador', d.agenteCausador);
        addSecao('Sintomas observados', d.sintomasObservados);
        addSecao('Tratamento ecológico', d.tratamentoEcologico);
        addSecao('Tratamento químico', d.tratamentoQuimico);
        addSecao('Prevenção', d.prevencao);
        addSecao('Plantas afetadas / Propagação', d.plantasAfetadas);
        if (y > 250) { doc.addPage(); y = 20; }

        doc.setFontSize(9.5); doc.setTextColor(90, 138, 106); doc.setFont(undefined, 'bold');
        doc.text('CONFIANÇA DA IA', mx, y);
        doc.setFont(undefined, 'normal'); doc.setFontSize(18); doc.setTextColor(50);
        doc.text(`${d.confianca || 0}%`, mx, y + 9);
        doc.setFontSize(9.5); doc.setTextColor(90, 138, 106); doc.setFont(undefined, 'bold');
        doc.text('DATA DO DIAGNÓSTICO', 110, y);
        doc.setFont(undefined, 'normal'); doc.setFontSize(11); doc.setTextColor(50);
        doc.text(new Date(d.dataDiagnostico).toLocaleString('pt-BR'), 110, y + 9);

        doc.setFontSize(8); doc.setTextColor(150);
        doc.text(`Gerado por AgroScan em ${new Date().toLocaleString('pt-BR')} · Produtor: ${Auth.getNome()}`, mx, 288);
        doc.save(`agroscan-diagnostico-${d.diagnosticoId || 'x'}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
        console.error('Erro ao exportar PDF do diagnóstico:', e);
        alert('Erro ao gerar o PDF. Tente novamente.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = htmlOriginal;
    }
}

// ── ENVIAR POR E-MAIL (Brevo) ─────────────────────────────────
async function enviarDiagnosticoEmail() {
    const d = window._diagnosticoModalAtual;
    if (!d) return;
    const email = prompt('Digite o e-mail para envio do relatório:');
    if (!email || !email.includes('@')) return;

    const btn = document.getElementById('btnEnviarEmail');
    const htmlOriginal = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span style="font-size:13px;">...</span>'; }
    try {
        const resp = await Auth.fetchAuth('/api/relatorio/enviar-email', {
            method: 'POST',
            body: JSON.stringify({ diagnosticoId: d.diagnosticoId, email })
        });
        const data = await resp.json();
        alert(resp.ok ? data.mensagem : `Erro: ${data.erro || 'Falha ao enviar.'}`);
    } catch {
        alert('Erro de conexão ao enviar e-mail.');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = htmlOriginal; }
    }
}

// ── ENVIAR POR WHATSAPP ───────────────────────────────────────
async function enviarDiagnosticoWhatsapp() {
    const d = window._diagnosticoModalAtual;
    if (!d) return;
    const numero = prompt('Número do WhatsApp (com DDD e código do país, só números — ex: 5511999998888). Deixe em branco para escolher o contato na hora:');

    const btn = document.getElementById('btnEnviarWhatsapp');
    const htmlOriginal = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span style="font-size:13px;">...</span>'; }
    try {
        const resp = await Auth.fetchAuth('/api/relatorio/link-whatsapp', {
            method: 'POST',
            body: JSON.stringify({ diagnosticoId: d.diagnosticoId, numeroWhatsapp: numero || null })
        });
        const data = await resp.json();
        if (resp.ok && data.linkWhatsapp) window.open(data.linkWhatsapp, '_blank');
        else alert(`Erro: ${data.erro || 'Falha ao gerar link.'}`);
    } catch {
        alert('Erro de conexão ao gerar link do WhatsApp.');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = htmlOriginal; }
    }
}
