// Auth vem de js/Auth.js (incluído antes deste script no HTML).

let todosDiag = [];
let paginaAtual = 1;
const TAM = 15;
let filtroHortalicaId = null;

document.addEventListener('DOMContentLoaded', () => {
    const nome = Auth.getNome();
    document.getElementById('nomeUsuario').textContent = nome;
    document.getElementById('avatarLetra').textContent = nome.charAt(0).toUpperCase();

    // Filtro vindo do catálogo (hortalicas.html?hortalicaId=...&nome=...)
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

    // Filtro de gravidade vindo do dashboard (dashboard.html -> historico.html?gravidade=alta)
    const grav = params.get('gravidade');
    if (grav) document.getElementById('filtroGrav').value = grav;

    carregarPagina(1);
});

async function carregarPagina(pag) {
    paginaAtual = pag;
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = `<tr><td colspan="7"><div class="skeleton" style="height:13px;margin:14px 16px;"></div></td></tr>`.repeat(3);

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
            tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">
            <span class="emoji">🌱</span>
            Nenhum diagnóstico encontrado. <a href="diagnosticar.html" style="color:var(--green-lt)">Faça o primeiro!</a>
        </div></td></tr>`;
            document.getElementById('paginfoText').textContent = '0 registros';
            document.getElementById('paginacaoBtns').innerHTML = '';
            return;
        }

        tbody.innerHTML = filtrada.map(d => {
            const data_ = new Date(d.dataDiagnostico).toLocaleDateString('pt-BR');
            return `<tr data-id="${d.diagnosticoId}" data-json='${JSON.stringify(d).replace(/'/g, "&#39;")}'>
            <td style="color:var(--text3);font-size:12px;">${data_}</td>
            <td style="color:var(--text);font-weight:500;">${d.nomeDoenca || '—'}<br><span style="font-size:11px;color:var(--text3);font-style:italic;">${d.nomeCientifico || ''}</span></td>
            <td>${badgeTipo(d.tipoDiagnostico)}</td>
            <td>${chipGrav(d.gravidade)}</td>
            <td>${chipRisco(d.riscoPropagacao)}</td>
            <td>
                <div class="conf-bar">
                    <div class="conf-track"><div class="conf-fill" style="width:${d.confianca || 0}%"></div></div>
                    <span style="font-size:12px;">${d.confianca || 0}%</span>
                </div>
            </td>
            <td>
                <button class="pag-btn" style="width:auto;padding:0 12px;font-size:12px;font-weight:600;color:var(--primary);border-color:var(--primary);" onclick="abrirModal(${d.diagnosticoId})">
                    👁️ Ver diagnóstico
                </button>
            </td>
        </tr>`;
        }).join('');

        document.getElementById('paginfoText').textContent = `${filtrada.length} registro${filtrada.length !== 1 ? 's' : ''}`;

        const btnsEl = document.getElementById('paginacaoBtns');
        btnsEl.innerHTML = `
        <button class="pag-btn" onclick="carregarPagina(${pag - 1})" ${pag <= 1 ? 'disabled' : ''}>‹</button>
        <button class="pag-btn ativo">${pag}</button>
        <button class="pag-btn" onclick="carregarPagina(${pag + 1})" ${lista.length < TAM ? 'disabled' : ''}>›</button>
    `;

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--red);">Erro ao carregar histórico.</td></tr>`;
    }
}

function abrirModal(id) {
    const row = document.querySelector(`tr[data-id="${id}"]`);
    if (!row) return;
    const d = JSON.parse(row.dataset.json);

    // guarda o diagnóstico atualmente aberto no modal, usado pela exportação individual em PDF
    window._diagnosticoModalAtual = d;

    document.getElementById('modalTitle').textContent = d.nomeDoenca || 'Diagnóstico';
    document.getElementById('modalBody').innerHTML = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
            ${badgeTipo(d.tipoDiagnostico)} ${chipGrav(d.gravidade)} ${chipRisco(d.riscoPropagacao)}
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
            <div class="info-block"><label>Confiança da IA</label><p style="font-size:20px;font-family:'Fraunces',serif;color:var(--green-lt)">${d.confianca || 0}%</p></div>
            <div class="info-block"><label>Data</label><p>${new Date(d.dataDiagnostico).toLocaleString('pt-BR')}</p></div>
        </div>
    `;

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
        'Doença Fúngica': ['badge-fungica', '🍄'],
        'Doença Bacteriana': ['badge-bacteriana', '🦠'],
        'Virose': ['badge-virose', '🧬'],
        'Praga de Inseto': ['badge-praga', '🐛'],
        'Praga de Ácaro': ['badge-acaro', '🕷️'],
        'Deficiência Nutricional': ['badge-defic', '🌿'],
        'Saudável': ['badge-saudavel', '✅'],
        'Inconclusivo': ['badge-inconcl', '❓'],
    };
    const [cls, icon] = m[tipo] || ['badge-inconcl', '?'];
    return `<span class="badge ${cls}">${icon} ${tipo || '—'}</span>`;
}

function chipGrav(g) {
    const m = { alta: 'chip-alta', media: 'chip-media', baixa: 'chip-baixa' };
    const labels = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
    return g ? `<span class="${m[g] || ''}">${labels[g] || g}</span>` : '<span style="color:var(--text3)">—</span>';
}

function chipRisco(r) {
    const m = { alto: 'chip-alta', medio: 'chip-media', baixo: 'chip-baixa' };
    const labels = { alto: 'Alto', medio: 'Médio', baixo: 'Baixo' };
    return r ? `<span class="${m[r] || ''}">${labels[r] || r}</span>` : '<span style="color:var(--text3)">—</span>';
}

// ── EXPORTAR HISTÓRICO COMPLETO EM PDF ─────────────────────────
// Busca TODO o histórico do usuário (paginando em blocos de 100,
// que é o teto do endpoint), aplica os mesmos filtros ativos na
// tela (tipo, gravidade, hortaliça vinda da URL) e gera um PDF
// com jsPDF + autotable.
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

        // busca todas as páginas (limite do backend é 100 por página)
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

        if (filtrada.length === 0) {
            alert('Nenhum diagnóstico encontrado para exportar.');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape' });

        doc.setFontSize(16);
        doc.setTextColor(40);
        doc.text('AgroScan — Histórico de Diagnósticos', 14, 16);

        doc.setFontSize(10);
        doc.setTextColor(120);
        const nomeUsuario = Auth.getNome();
        const dataGeracao = new Date().toLocaleString('pt-BR');
        const filtroBadge = document.getElementById('filtroHortalicaNome');
        const sufixoFiltro = (filtroHortalicaId && filtroBadge && filtroBadge.textContent)
            ? `  ·  Hortaliça: ${filtroBadge.textContent}`
            : '';
        doc.text(`Produtor: ${nomeUsuario}  ·  Gerado em: ${dataGeracao}  ·  ${filtrada.length} registro(s)${sufixoFiltro}`, 14, 22);

        const linhas = filtrada
            .slice()
            .sort((a, b) => new Date(b.dataDiagnostico) - new Date(a.dataDiagnostico))
            .map(d => [
                new Date(d.dataDiagnostico).toLocaleDateString('pt-BR'),
                d.nomeDoenca || '—',
                d.nomeCientifico || '—',
                d.tipoDiagnostico || '—',
                traduzGravidade(d.gravidade),
                traduzRisco(d.riscoPropagacao),
                `${d.confianca || 0}%`
            ]);

        doc.autoTable({
            startY: 28,
            head: [['Data', 'Doença/Praga', 'Nome científico', 'Tipo', 'Gravidade', 'Risco', 'Confiança']],
            body: linhas,
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [90, 138, 106], textColor: 255 },
            alternateRowStyles: { fillColor: [245, 240, 232] },
            margin: { left: 14, right: 14 },
        });

        const nomeArquivo = `agroscan-historico-${new Date().toISOString().slice(0, 10)}.pdf`;
        doc.save(nomeArquivo);

    } catch (e) {
        console.error('Erro ao exportar PDF:', e);
        alert('Erro ao gerar o PDF. Tente novamente.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = htmlOriginal;
    }
}

// ── EXPORTAR UM ÚNICO DIAGNÓSTICO EM PDF ───────────────────────
// Usa o diagnóstico atualmente aberto no modal (window._diagnosticoModalAtual,
// preenchido em abrirModal) e gera um relatório em PDF só com ele.
async function exportarDiagnosticoPDF() {
    const btn = document.getElementById('btnExportarDiagnosticoPdf');
    if (!btn || btn.disabled) return;

    const d = window._diagnosticoModalAtual;
    if (!d) {
        alert('Nenhum diagnóstico selecionado.');
        return;
    }

    const htmlOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span style="font-size:10px;">...</span>';

    try {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('Não foi possível carregar o gerador de PDF. Verifique sua conexão e tente novamente.');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait' });
        const margemEsq = 14;
        const largura = 182;

        // ── Cabeçalho ──
        doc.setFontSize(16);
        doc.setTextColor(40);
        doc.text('AgroScan — Relatório de Diagnóstico', margemEsq, 18);

        doc.setDrawColor(90, 138, 106);
        doc.setLineWidth(0.6);
        doc.line(margemEsq, 22, margemEsq + largura, 22);

        // ── Título / nome científico ──
        doc.setFontSize(20);
        doc.setTextColor(20);
        doc.setFont(undefined, 'bold');
        doc.text(d.nomeDoenca || 'Diagnóstico', margemEsq, 34);
        doc.setFont(undefined, 'normal');

        doc.setFontSize(11);
        doc.setTextColor(110);
        doc.setFont(undefined, 'italic');
        doc.text(d.nomeCientifico || '—', margemEsq, 41);
        doc.setFont(undefined, 'normal');

        // ── Linha de badges (tipo / gravidade / risco) ──
        doc.setFontSize(10);
        doc.setTextColor(90, 138, 106);
        doc.text(
            `${d.tipoDiagnostico || '—'}   ·   Gravidade: ${traduzGravidade(d.gravidade)}   ·   Risco de propagação: ${traduzRisco(d.riscoPropagacao)}`,
            margemEsq, 49
        );

        let y = 60;

        const addSecao = (titulo, texto) => {
            doc.setFontSize(9.5);
            doc.setTextColor(90, 138, 106);
            doc.setFont(undefined, 'bold');
            doc.text(titulo.toUpperCase(), margemEsq, y);
            doc.setFont(undefined, 'normal');

            doc.setFontSize(10.5);
            doc.setTextColor(50);
            const linhas = doc.splitTextToSize(texto || '—', largura);
            doc.text(linhas, margemEsq, y + 6);

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

        // ── Confiança da IA + Data (lado a lado) ──
        doc.setFontSize(9.5);
        doc.setTextColor(90, 138, 106);
        doc.setFont(undefined, 'bold');
        doc.text('CONFIANÇA DA IA', margemEsq, y);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(18);
        doc.setTextColor(50);
        doc.text(`${d.confianca || 0}%`, margemEsq, y + 9);

        doc.setFontSize(9.5);
        doc.setTextColor(90, 138, 106);
        doc.setFont(undefined, 'bold');
        doc.text('DATA DO DIAGNÓSTICO', 110, y);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(11);
        doc.setTextColor(50);
        doc.text(new Date(d.dataDiagnostico).toLocaleString('pt-BR'), 110, y + 9);

        // ── Rodapé ──
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(
            `Gerado por AgroScan em ${new Date().toLocaleString('pt-BR')} · Produtor: ${Auth.getNome()}`,
            margemEsq, 288
        );

        const nomeArquivo = `agroscan-diagnostico-${d.diagnosticoId || 'x'}-${new Date().toISOString().slice(0, 10)}.pdf`;
        doc.save(nomeArquivo);

    } catch (e) {
        console.error('Erro ao exportar PDF do diagnóstico:', e);
        alert('Erro ao gerar o PDF. Tente novamente.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = htmlOriginal;
    }
}

function traduzGravidade(g) {
    return { alta: 'Alta', media: 'Média', baixa: 'Baixa' }[g] || '—';
}

function traduzRisco(r) {
    return { alto: 'Alto', medio: 'Médio', baixo: 'Baixo' }[r] || '—';
}