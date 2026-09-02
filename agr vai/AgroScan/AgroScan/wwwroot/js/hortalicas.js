// Auth vem de js/Auth.js. 100% API — sem dados fictícios/fallback.

let dados = [];
let modalAtual = null;
let modalAtualIdx = null;

function initSidebar() {
    const menuBtn = document.getElementById('menuBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (!menuBtn || !sidebar || !overlay) return;
    menuBtn.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('show'); });
    overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); });
}

document.addEventListener('DOMContentLoaded', async () => {
    initSidebar();
    const nome = Auth.getNome();
    document.getElementById('nomeUsuario').textContent = nome;
    document.getElementById('avatarLetra').textContent = nome.charAt(0).toUpperCase();

    injetarBotaoEModalAdicionar();
    await carregarAPI();
    renderGrid(dados);
});

async function carregarAPI() {
    try {
        const resp = await Auth.fetchAuth('/api/hortalicas');
        if (!resp.ok) { dados = []; return; }
        const lista = await resp.json();
        dados = lista.map(h => ({
            id: h.hortalicaId,
            nome: h.nomePopular || h.nomeCientifico,
            cientifico: h.nomeCientifico,
            familia: h.familia,
            categoria: (h.categoria || 'outro').toLowerCase(),
            diasGerminacao: h.diasGerminacao,
            diasColheita: h.diasColheita,
            espacamento: h.espacamento,
            temperaturaIdeal: h.clima,
            luminosidade: h.luminosidade,
            irrigacao: h.irrigacao,
            tipoSolo: h.tipoSolo,
            phIdeal: '—',
            adubacao: h.adubacao,
            pragasPrincipais: h.pragasPrincipais,
            doencasPrincipais: h.doencasPrincipais,
            dicasCultivo: h.observacoes,
            origem: h.origem,
            valorNutricional: h.valorNutricional,
        }));
    } catch { dados = []; }
}

function filtrar() {
    const busca = document.getElementById('busca').value.toLowerCase().trim();
    const cat = document.getElementById('filtroCat').value.toLowerCase();
    const filtrados = dados.filter(h => {
        const matchBusca = !busca || h.nome.toLowerCase().includes(busca) || (h.cientifico || '').toLowerCase().includes(busca);
        const matchCat = !cat || (h.categoria || '').toLowerCase() === cat;
        return matchBusca && matchCat;
    });
    renderGrid(filtrados);
}

function renderGrid(lista) {
    const grid = document.getElementById('grid');
    if (lista.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
            <span class="emoji">🌱</span>
            Você ainda não cadastrou nenhuma hortaliça. Clique em "+ Adicionar hortaliça" para começar.
        </div>`;
        window._listaAtual = [];
        return;
    }
    grid.innerHTML = lista.map((h, i) => {
        const emoji = getEmoji(h.categoria);
        const catCls = getCatClass(h.categoria);
        const catLabel = getCatLabel(h.categoria);
        return `<div class="h-card">
            <div class="h-card-header" onclick="abrirModal(${i})" style="cursor:pointer">
                <div class="h-card-emoji">${emoji}</div>
                <div>
                    <div class="h-card-nome">${h.nome}</div>
                    <div class="h-card-cientifico">${h.cientifico || ''}</div>
                </div>
            </div>
            <div class="h-card-body">
                <span class="h-card-cat ${catCls}">${emoji} ${catLabel}</span>
                <div class="h-card-info">
                    <div class="info-item"><label>⏱ Colheita</label><span>${h.diasColheita ? h.diasColheita + ' dias' : '—'}</span></div>
                    <div class="info-item"><label>🌡️ Clima</label><span>${h.temperaturaIdeal || '—'}</span></div>
                </div>
                <div style="display:flex;gap:6px;margin-top:10px;">
    <button class="filter-select" style="flex:1;padding:6px;font-size:11px;cursor:pointer;" onclick="event.stopPropagation();irParaDiagnostico(${i})">🔬 Diagnosticar</button>
    <button class="filter-select" style="flex:1;padding:6px;font-size:11px;cursor:pointer;" onclick="event.stopPropagation();verDiagnosticos(${i})">📋 Diagnósticos</button>
    <button class="filter-select" style="padding:6px 10px;font-size:11px;cursor:pointer;" onclick="event.stopPropagation();abrirModalEditar(${i})">✏️</button>
    <button class="filter-select" style="padding:6px 10px;font-size:11px;cursor:pointer;color:var(--destructive);" onclick="event.stopPropagation();excluirHortalica(${i})">🗑️</button>
</div>
            </div>
        </div>`;
    }).join('');
    window._listaAtual = lista;
}

function irParaDiagnostico(idx) {
    const h = window._listaAtual[idx];
    if (!h) return;
    window.location.href = `diagnosticar.html?hortalicaId=${h.id}&nome=${encodeURIComponent(h.nome)}`;
}
function verDiagnosticos(idx) {
    const h = window._listaAtual[idx];
    if (!h) return;
    window.location.href = `historico.html?hortalicaId=${h.id}&nome=${encodeURIComponent(h.nome)}`;
}

function abrirModal(idx) {
    const h = window._listaAtual[idx];
    if (!h) return;
    modalAtual = h; modalAtualIdx = idx;

    document.getElementById('mEmoji').textContent = getEmoji(h.categoria);
    document.getElementById('mNome').textContent = h.nome;
    document.getElementById('mCientifico').textContent = h.cientifico || '';

    document.getElementById('modalBody').innerHTML = `
        <div>
            <div class="modal-section-title">Dados agronômicos</div>
            <div class="modal-grid">
                <div class="modal-item"><label>⏱ Germinação</label><span>${h.diasGerminacao ? h.diasGerminacao + ' dias' : '—'}</span></div>
                <div class="modal-item"><label>🌾 Colheita</label><span>${h.diasColheita ? h.diasColheita + ' dias' : '—'}</span></div>
                <div class="modal-item"><label>🌡️ Clima</label><span>${h.temperaturaIdeal || '—'}</span></div>
                <div class="modal-item"><label>📐 Espaçamento</label><span>${h.espacamento || '—'}</span></div>
                <div class="modal-item"><label>☀️ Luminosidade</label><span>${h.luminosidade || '—'}</span></div>
                <div class="modal-item"><label>💧 Irrigação</label><span>${h.irrigacao || '—'}</span></div>
                <div class="modal-item"><label>🌍 Solo</label><span>${h.tipoSolo || '—'}</span></div>
                <div class="modal-item"><label>🌿 Família</label><span>${h.familia || '—'}</span></div>
            </div>
        </div>
        ${h.adubacao ? `<div class="modal-block"><label>🧪 Adubação</label><p>${h.adubacao}</p></div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="modal-block"><label>🐛 Pragas</label><p>${h.pragasPrincipais || '—'}</p></div>
            <div class="modal-block"><label>🦠 Doenças</label><p>${h.doencasPrincipais || '—'}</p></div>
        </div>
        ${h.dicasCultivo ? `<div class="modal-block"><label>💡 Dicas de cultivo</label><p>${h.dicasCultivo}</p></div>` : ''}
<div style="display:flex;gap:8px;">
    <a href="diagnosticar.html?hortalicaId=${h.id}&nome=${encodeURIComponent(h.nome)}" class="btn-diag-modal">🔬 Diagnosticar doença →</a>
    <a href="historico.html?hortalicaId=${h.id}&nome=${encodeURIComponent(h.nome)}" class="btn-diag-modal" style="background:var(--muted);color:var(--foreground);">📋 Ver diagnósticos</a>
    <button class="btn-diag-modal" style="background:var(--muted);color:var(--foreground);" onclick="abrirModalEditar(${idx})">✏️ Editar</button>
</div>
    `;
    document.getElementById('overlay-detalhe').classList.add('open');
}

function fecharModal(e) {
    const ov = document.getElementById('overlay-detalhe');
    if (!e || e.target === ov) ov.classList.remove('open');
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { fecharModal(); fecharModalAdicionar(); fecharModalEditar(); }
});

function getEmoji(cat) {
    const m = { folhosa: '🥬', fruto: '🍅', raiz: '🥕', bulbo: '🧅', legume: '🫛', brassica: '🥦', tubérculo: '🥔' };
    return m[(cat || '').toLowerCase()] || '🌱';
}
function getCatClass(cat) {
    const m = { folhosa: 'cat-folhosa', fruto: 'cat-fruto', raiz: 'cat-raiz', bulbo: 'cat-bulbo', legume: 'cat-legume', brassica: 'cat-brassica' };
    return m[(cat || '').toLowerCase()] || 'cat-outro';
}
function getCatLabel(cat) {
    const m = { folhosa: 'Folhosa', fruto: 'Fruto', raiz: 'Raiz', bulbo: 'Bulbo', legume: 'Legume', brassica: 'Brássica', tubérculo: 'Tubérculo' };
    return m[(cat || '').toLowerCase()] || (cat || 'Outro');
}

function fazerLogout() { Auth.logout(); }

// ═══ ADICIONAR & IDENTIFICAR ═══
function injetarBotaoEModalAdicionar() {
    const filterRow = document.querySelector('.filter-row');
    if (filterRow) {
        // Botão de Identificar Hortaliça (via IA/Foto)
        if (!document.getElementById('btnIrIdentificar')) {
            const btnIdentificar = document.createElement('a');
            btnIdentificar.id = 'btnIrIdentificar';
            btnIdentificar.href = 'identificar.html';
            btnIdentificar.className = 'filter-select';
            btnIdentificar.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;text-decoration:none;cursor:pointer;font-weight:600;color:var(--foreground);';
            btnIdentificar.textContent = '🔍 Identificar por foto';
            filterRow.appendChild(btnIdentificar);
        }

        // Botão de Adicionar Hortaliça Manualmente
        if (!document.getElementById('btnAbrirAdicionar')) {
            const btn = document.createElement('button');
            btn.id = 'btnAbrirAdicionar';
            btn.className = 'filter-select';
            btn.style.cssText = 'cursor:pointer;font-weight:700;color:var(--primary);';
            btn.textContent = '+ Adicionar hortaliça';
            btn.onclick = abrirModalAdicionar;
            filterRow.appendChild(btn);
        }
    }

    if (!document.getElementById('addOverlay')) {
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.id = 'addOverlay';
        overlay.onclick = (e) => { if (e.target === overlay) fecharModalAdicionar(); };
        overlay.innerHTML = formularioHtml('add', 'Adicionar hortaliça', 'Cadastro manual no catálogo');
        document.body.appendChild(overlay);
    }

    if (!document.getElementById('editOverlay')) {
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.id = 'editOverlay';
        overlay.onclick = (e) => { if (e.target === overlay) fecharModalEditar(); };
        overlay.innerHTML = formularioHtml('edit', 'Editar hortaliça', 'Atualizar dados do catálogo');
        document.body.appendChild(overlay);
    }
}

function formularioHtml(prefix, titulo, sub) {
    const campo = (id, label, placeholder = '', tipo = 'text') =>
        `<div class="modal-item"><label>${label}</label>
            <input id="${prefix}${id}" type="${tipo}" style="width:100%;background:transparent;border:none;color:var(--foreground);font-size:13px;outline:none;" placeholder="${placeholder}"></div>`;
    return `
        <div class="modal" id="${prefix}ModalBox">
            <div class="modal-header">
                <div class="modal-emoji">🌱</div>
                <div><div class="modal-nome">${titulo}</div><div class="modal-cientifico">${sub}</div></div>
                <button class="modal-close" onclick="${prefix === 'add' ? 'fecharModalAdicionar' : 'fecharModalEditar'}()">×</button>
            </div>
            <div class="modal-body">
                <div id="${prefix}Erro" style="display:none;color:var(--red);font-size:13px;"></div>
                <div class="modal-grid" style="grid-template-columns:1fr 1fr;">
                    ${campo('NomePopular', 'Nome popular *', 'Ex: Tomate')}
                    ${campo('NomeCientifico', 'Nome científico *', 'Ex: Solanum lycopersicum')}
                    ${campo('Familia', 'Família', 'Ex: Solanaceae')}
                    <div class="modal-item"><label>Categoria</label>
                        <select id="${prefix}Categoria" style="width:100%;background:transparent;border:none;color:var(--foreground);font-size:13px;outline:none;">
                            <option value="folhosa">Folhosa</option><option value="fruto">Fruto</option><option value="raiz">Raiz</option>
                            <option value="bulbo">Bulbo</option><option value="legume">Legume</option><option value="brassica">Brássica</option>
                        </select></div>
                    ${campo('DiasGerm', 'Dias germinação', '', 'number')}
                    ${campo('DiasColheita', 'Dias colheita', '', 'number')}
                    ${campo('Espacamento', 'Espaçamento', 'Ex: 50x100 cm')}
                    ${campo('Clima', 'Clima', 'Ex: Tropical')}
                    ${campo('Luminosidade', 'Luminosidade', 'Ex: Sol pleno')}
                    ${campo('Irrigacao', 'Irrigação', 'Ex: Gotejamento')}
                    ${campo('TipoSolo', 'Tipo de solo')}
                    ${campo('Origem', 'Origem')}
                </div>
                <div class="modal-block"><label>Adubação</label><textarea id="${prefix}Adubacao" rows="2" style="width:100%;background:transparent;border:none;color:var(--foreground);font-size:13px;outline:none;resize:vertical;"></textarea></div>
                <div class="modal-block"><label>Principais pragas</label><textarea id="${prefix}Pragas" rows="2" style="width:100%;background:transparent;border:none;color:var(--foreground);font-size:13px;outline:none;resize:vertical;"></textarea></div>
                <div class="modal-block"><label>Principais doenças</label><textarea id="${prefix}Doencas" rows="2" style="width:100%;background:transparent;border:none;color:var(--foreground);font-size:13px;outline:none;resize:vertical;"></textarea></div>
                <div class="modal-block"><label>Valor nutricional</label><textarea id="${prefix}ValorNutri" rows="2" style="width:100%;background:transparent;border:none;color:var(--foreground);font-size:13px;outline:none;resize:vertical;"></textarea></div>
                <div class="modal-block"><label>Observações / dicas de cultivo</label><textarea id="${prefix}Observacoes" rows="2" style="width:100%;background:transparent;border:none;color:var(--foreground);font-size:13px;outline:none;resize:vertical;"></textarea></div>
                <button class="btn-diag-modal" id="btnSalvar${prefix === 'add' ? 'NovaHt' : 'EditarHt'}" onclick="${prefix === 'add' ? 'salvarNovaHortalica' : 'salvarEdicaoHortalica'}()" style="width:100%;justify-content:center;margin-top:6px;">
                    💾 ${prefix === 'add' ? 'Salvar hortaliça' : 'Salvar alterações'}
                </button>
            </div>
        </div>`;
}

function abrirModalAdicionar() {
    document.getElementById('addErro').style.display = 'none';
    document.querySelectorAll('#addOverlay input, #addOverlay textarea').forEach(el => el.value = '');
    document.getElementById('addOverlay').classList.add('open');
}
function fecharModalAdicionar() { document.getElementById('addOverlay')?.classList.remove('open'); }

function abrirModalEditar(idx) {
    const h = window._listaAtual[idx];
    if (!h) return;
    modalAtualIdx = idx;
    document.getElementById('editErro').style.display = 'none';
    document.getElementById('editNomePopular').value = h.nome || '';
    document.getElementById('editNomeCientifico').value = h.cientifico || '';
    document.getElementById('editFamilia').value = h.familia || '';
    document.getElementById('editCategoria').value = h.categoria || 'folhosa';
    document.getElementById('editDiasGerm').value = h.diasGerminacao || '';
    document.getElementById('editDiasColheita').value = h.diasColheita || '';
    document.getElementById('editEspacamento').value = h.espacamento || '';
    document.getElementById('editClima').value = h.temperaturaIdeal || '';
    document.getElementById('editLuminosidade').value = h.luminosidade || '';
    document.getElementById('editIrrigacao').value = h.irrigacao || '';
    document.getElementById('editTipoSolo').value = h.tipoSolo || '';
    document.getElementById('editOrigem').value = h.origem || '';
    document.getElementById('editAdubacao').value = h.adubacao || '';
    document.getElementById('editPragas').value = h.pragasPrincipais || '';
    document.getElementById('editDoencas').value = h.doencasPrincipais || '';
    document.getElementById('editValorNutri').value = h.valorNutricional || '';
    document.getElementById('editObservacoes').value = h.dicasCultivo || '';
    fecharModal();
    document.getElementById('editOverlay').classList.add('open');
}
function fecharModalEditar() { document.getElementById('editOverlay')?.classList.remove('open'); }

function coletarBody(prefix) {
    const g = id => document.getElementById(prefix + id).value.trim() || null;
    return {
        nomeCientifico: g('NomeCientifico'),
        nomePopular: g('NomePopular'),
        familia: g('Familia'),
        categoria: document.getElementById(prefix + 'Categoria').value || null,
        diasGerminacao: parseInt(document.getElementById(prefix + 'DiasGerm').value) || null,
        diasColheita: parseInt(document.getElementById(prefix + 'DiasColheita').value) || null,
        espacamento: g('Espacamento'),
        clima: g('Clima'),
        luminosidade: g('Luminosidade'),
        irrigacao: g('Irrigacao'),
        tipoSolo: g('TipoSolo'),
        origem: g('Origem'),
        adubacao: g('Adubacao'),
        pragasPrincipais: g('Pragas'),
        doencasPrincipais: g('Doencas'),
        valorNutricional: g('ValorNutri'),
        observacoes: g('Observacoes'),
    };
}

async function salvarNovaHortalica() {
    const body = coletarBody('add');
    const erroEl = document.getElementById('addErro');
    if (!body.nomeCientifico) { erroEl.textContent = 'Nome científico é obrigatório.'; erroEl.style.display = 'block'; return; }
    const btn = document.getElementById('btnSalvarNovaHt');
    btn.disabled = true; btn.textContent = 'Salvando...';
    try {
        const resp = await Auth.fetchAuth('/api/hortalicas', { method: 'POST', body: JSON.stringify(body) });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok) {
            fecharModalAdicionar();
            await carregarAPI(); filtrar();
        } else { erroEl.textContent = data.erro || 'Erro ao salvar.'; erroEl.style.display = 'block'; }
    } catch { erroEl.textContent = 'Erro de conexão.'; erroEl.style.display = 'block'; }
    finally { btn.disabled = false; btn.textContent = '💾 Salvar hortaliça'; }
}

async function salvarEdicaoHortalica() {
    const h = window._listaAtual[modalAtualIdx];
    if (!h) return;
    const body = coletarBody('edit');
    const erroEl = document.getElementById('editErro');
    if (!body.nomeCientifico) { erroEl.textContent = 'Nome científico é obrigatório.'; erroEl.style.display = 'block'; return; }
    const btn = document.getElementById('btnSalvarEditarHt');
    btn.disabled = true; btn.textContent = 'Salvando...';
    try {
        const resp = await Auth.fetchAuth(`/api/hortalicas/${h.id}`, { method: 'PUT', body: JSON.stringify(body) });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok) {
            fecharModalEditar();
            await carregarAPI(); filtrar();
        } else { erroEl.textContent = data.erro || 'Erro ao salvar.'; erroEl.style.display = 'block'; }
    } catch { erroEl.textContent = 'Erro de conexão.'; erroEl.style.display = 'block'; }
    finally { btn.disabled = false; btn.textContent = '💾 Salvar alterações'; }
}

async function excluirHortalica(idx) {
    const h = window._listaAtual[idx];
    if (!h) return;
    if (!confirm(`Excluir "${h.nome}" do catálogo? Esta ação não pode ser desfeita.`)) return;
    try {
        const resp = await Auth.fetchAuth(`/api/hortalicas/${h.id}`, { method: 'DELETE' });
        if (resp.ok) { await carregarAPI(); filtrar(); }
        else alert('Erro ao excluir hortaliça.');
    } catch { alert('Erro de conexão ao excluir.'); }
}