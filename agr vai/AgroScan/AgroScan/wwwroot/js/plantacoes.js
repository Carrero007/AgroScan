
const API = '/Plantas';
let todasPlantas = [], editId = null, deleteId = null;

// ── Carregar ──
async function carregar() {
    try {
        const res = await fetch(API);
        if (!res.ok) throw new Error();
        todasPlantas = await res.json();
        renderTabela(todasPlantas);
    } catch { alert('Erro ao carregar plantações.'); }
}

function renderTabela(lista) {
    const tbody = document.getElementById('tbody');
    const empty = document.getElementById('emptyState');
    if (!lista.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    tbody.innerHTML = lista.map(p => `
        <tr>
            <td>${p.plantaId}</td>
            <td><strong>${esc(p.nomePopular || '—')}</strong></td>
            <td><em>${esc(p.nomeCientifico)}</em></td>
            <td>${esc(p.tipoPlanta || '—')}</td>
            <td>${esc(p.clima || '—')}</td>
            <td>
                ${p.ehMedicinal ? '<span class="tag-sm tag-med">Medicinal</span>' : ''}
                ${p.ehComestivel ? '<span class="tag-sm tag-com">Comestível</span>' : ''}
                ${p.ehToxica ? '<span class="tag-sm tag-tox">Tóxica</span>' : ''}
            </td>
            <td>
                <button class="btn-main" onclick="abrirEdicao(${p.plantaId})" style="padding:6px 10px;font-size:12px;margin-right:4px;">✏️</button>
                <button class="danger" onclick="abrirConfirm(${p.plantaId})" style="padding:6px 10px;font-size:12px;">🗑️</button>
            </td>
        </tr>`).join('');
}

function filtrar() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    renderTabela(todasPlantas.filter(p =>
        (p.nomePopular || '').toLowerCase().includes(q) ||
        (p.nomeCientifico || '').toLowerCase().includes(q) ||
        (p.tipoPlanta || '').toLowerCase().includes(q)
    ));
}

// ── Adicionar ──
async function adicionar() {
    const nomeCientifico = document.getElementById('f-nomeCientifico').value.trim();
    if (!nomeCientifico) { alert('Nome científico é obrigatório.'); return; }
    try {
        const res = await fetch(API, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(coletarForm('f'))
        });
        if (!res.ok) throw new Error();
        limparForm();
        document.getElementById('msg-add').style.display = 'block';
        setTimeout(() => document.getElementById('msg-add').style.display = 'none', 3000);
        carregar();
    } catch { alert('Erro ao adicionar.'); }
}

function limparForm() {
    ['nomeCientifico', 'nomePopular', 'tipoPlanta', 'cicloVida', 'clima', 'luminosidade', 'rega', 'tipoSolo', 'familia', 'origem', 'usos', 'descricao']
        .forEach(f => { const el = document.getElementById('f-' + f); if (el) el.value = ''; });
    ['ehMedicinal', 'ehComestivel', 'ehToxica'].forEach(f => {
        const el = document.getElementById('f-' + f); if (el) el.checked = false;
    });
}

// ── Edição ──
function abrirEdicao(id) {
    const p = todasPlantas.find(x => x.plantaId === id);
    if (!p) return;
    editId = id;
    ['nomeCientifico', 'nomePopular', 'tipoPlanta', 'cicloVida', 'clima', 'luminosidade', 'rega', 'tipoSolo', 'familia', 'origem', 'usos', 'descricao']
        .forEach(f => { const el = document.getElementById('e-' + f); if (el) el.value = p[f] || ''; });
    ['ehMedicinal', 'ehComestivel', 'ehToxica'].forEach(f => {
        const el = document.getElementById('e-' + f); if (el) el.checked = !!p[f];
    });
    document.getElementById('modalEdit').classList.add('open');
}

function fecharModal() { document.getElementById('modalEdit').classList.remove('open'); editId = null; }

async function salvarEdicao() {
    if (!editId) return;
    try {
        const res = await fetch(`${API}/${editId}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(coletarForm('e'))
        });
        if (!res.ok) throw new Error();
        fecharModal(); carregar();
    } catch { alert('Erro ao editar.'); }
}

// ── Exclusão ──
function abrirConfirm(id) { deleteId = id; document.getElementById('confirmDelete').classList.add('open'); }
function fecharConfirm() { document.getElementById('confirmDelete').classList.remove('open'); deleteId = null; }

async function confirmarDelete() {
    if (!deleteId) return;
    try {
        const res = await fetch(`${API}/${deleteId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error();
        fecharConfirm(); carregar();
    } catch { alert('Erro ao excluir.'); }
}

// ── Helper: coleta campos do form pelo prefixo ──
function coletarForm(prefix) {
    const g = id => document.getElementById(prefix + '-' + id)?.value?.trim() || '';
    const c = id => !!document.getElementById(prefix + '-' + id)?.checked;
    return {
        nomeCientifico: g('nomeCientifico'), nomePopular: g('nomePopular'),
        tipoPlanta: g('tipoPlanta'), cicloVida: g('cicloVida'), clima: g('clima'),
        luminosidade: g('luminosidade'), rega: g('rega'), tipoSolo: g('tipoSolo'),
        familia: g('familia'), origem: g('origem'), usos: g('usos'), descricao: g('descricao'),
        ehMedicinal: c('ehMedicinal'), ehComestivel: c('ehComestivel'), ehToxica: c('ehToxica')
    };
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Fechar modal clicando fora
document.getElementById('modalEdit').addEventListener('click', e => { if (e.target === e.currentTarget) fecharModal(); });
document.getElementById('confirmDelete').addEventListener('click', e => { if (e.target === e.currentTarget) fecharConfirm(); });

carregar();
