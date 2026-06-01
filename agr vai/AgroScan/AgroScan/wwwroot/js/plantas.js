
let todasPlantas = [], todosDiags = [];

function switchTab(name, el) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    el.classList.add('active');
}

// ── Plantas ──
async function carregarPlantas() {
    try {
        const res = await fetch('/Plantas');
        if (!res.ok) throw new Error();
        todasPlantas = await res.json();
        renderPlantas(todasPlantas);
    } catch { document.getElementById('emptyPlantas').style.display = 'block'; }
}

function filtrarPlantas() {
    const q = document.getElementById('searchPlantas').value.toLowerCase();
    renderPlantas(todasPlantas.filter(p =>
        (p.nomePopular || '').toLowerCase().includes(q) ||
        (p.nomeCientifico || '').toLowerCase().includes(q) ||
        (p.tipoPlanta || '').toLowerCase().includes(q)
    ));
}

function renderPlantas(lista) {
    const grid = document.getElementById('plantasGrid');
    const empty = document.getElementById('emptyPlantas');
    document.getElementById('contador-plantas').textContent = lista.length + ' planta(s)';

    if (!lista.length) { grid.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    grid.innerHTML = lista.map(p => `
        <div class="planta-card" onclick="abrirDrawer(${p.plantaId})">
            <div class="planta-card-head">
                <div class="planta-card-icon">
                    ${p.ehToxica ? '⚠️' : p.ehComestivel ? '🍃' : p.ehMedicinal ? '🌿' : '🌱'}
                </div>
                <div>
                    <div class="planta-card-nome">${esc(p.nomePopular || p.nomeCientifico)}</div>
                    <div class="planta-card-sci">${esc(p.nomeCientifico)}</div>
                </div>
            </div>
            <div class="planta-card-info">
                ${p.tipoPlanta ? `<span>📌 ${esc(p.tipoPlanta)}</span>` : ''}
                ${p.clima ? `<span>🌤 ${esc(p.clima)}</span>` : ''}
                ${p.rega ? `<span>💧 ${esc(p.rega)}</span>` : ''}
            </div>
            <div class="planta-card-tags">
                ${p.ehMedicinal ? '<span class="tag-sm tag-med">Medicinal</span>' : ''}
                ${p.ehComestivel ? '<span class="tag-sm tag-com">Comestível</span>' : ''}
                ${p.ehToxica ? '<span class="tag-sm tag-tox">Tóxica</span>' : ''}
            </div>
        </div>`).join('');
}

function abrirDrawer(id) {
    const p = todasPlantas.find(x => x.plantaId === id);
    if (!p) return;

    document.getElementById('dr-nome').textContent = p.nomePopular || p.nomeCientifico;
    document.getElementById('dr-sci').textContent = p.nomeCientifico || '';
    document.getElementById('dr-descricao').textContent = p.descricao || '—';
    document.getElementById('dr-usos').textContent = p.usos || '—';

    document.getElementById('dr-usos-section').style.display = p.usos ? '' : 'none';

    const chips = [
        p.tipoPlanta ? ['Tipo', p.tipoPlanta] : null,
        p.cicloVida ? ['Ciclo', p.cicloVida] : null,
        p.clima ? ['Clima', p.clima] : null,
        p.luminosidade ? ['Luz', p.luminosidade] : null,
        p.rega ? ['Rega', p.rega] : null,
        p.tipoSolo ? ['Solo', p.tipoSolo] : null,
        p.familia ? ['Família', p.familia] : null,
        p.origem ? ['Origem', p.origem] : null,
    ].filter(Boolean);

    document.getElementById('dr-chips').innerHTML = chips.map(([l, v]) =>
        `<div class="info-chip"><span class="lbl">${l}</span>${esc(v)}</div>`
    ).join('');

    const tagsEl = document.getElementById('dr-tags');
    const tagsSection = document.getElementById('dr-tags-section');
    tagsEl.innerHTML = [
        p.ehMedicinal ? '<span class="tag-sm tag-med">🌿 Medicinal</span>' : '',
        p.ehComestivel ? '<span class="tag-sm tag-com">🍽️ Comestível</span>' : '',
        p.ehToxica ? '<span class="tag-sm tag-tox">⚠️ Tóxica</span>' : ''
    ].join('');
    tagsSection.style.display = (p.ehMedicinal || p.ehComestivel || p.ehToxica) ? '' : 'none';

    document.getElementById('detailOverlay').classList.add('open');
}

function fecharDrawer() { document.getElementById('detailOverlay').classList.remove('open'); }

// ── Diagnósticos ──
async function carregarDiags() {
    try {
        const res = await fetch('/Groq/diagnosticos');
        if (!res.ok) throw new Error();
        todosDiags = await res.json();
        renderDiags(todosDiags);
    } catch { document.getElementById('emptyDiags').style.display = 'block'; }
}

function filtrarDiags() {
    const q = document.getElementById('searchDiags').value.toLowerCase();
    renderDiags(todosDiags.filter(d =>
        (d.nomeDoenca || '').toLowerCase().includes(q) ||
        (d.nomeCientifico || '').toLowerCase().includes(q)
    ));
}

function renderDiags(lista) {
    const el = document.getElementById('diagsLista');
    const empty = document.getElementById('emptyDiags');
    document.getElementById('contador-diags').textContent = lista.length + ' diagnóstico(s)';

    if (!lista.length) { el.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    el.innerHTML = lista.map(d => {
        const risco = (d.riscoPropagacao || '').toLowerCase();
        const cor = risco === 'alto' ? 'risk-alto' : risco === 'medio' ? 'risk-medio' : 'risk-baixo';
        const data = new Date(d.dataDiagnostico).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
        return `
        <div class="diag-item">
            <div class="diag-item-info">
                <div class="diag-item-nome">${esc(d.nomeDoenca || '—')}</div>
                <div class="diag-item-meta">
                    ${d.nomeCientifico ? `<em>${esc(d.nomeCientifico)}</em> · ` : ''}
                    Confiança: ${d.confianca}% · ${data}
                </div>
            </div>
            <span class="badge-risk ${cor}">${risco.charAt(0).toUpperCase() + risco.slice(1) || '?'}</span>
        </div>`;
    }).join('');
}

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

carregarPlantas();
carregarDiags();
