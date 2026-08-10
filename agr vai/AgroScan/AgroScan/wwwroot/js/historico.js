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