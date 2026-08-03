// Auth vem de js/Auth.js (incluído antes deste script no HTML).
// Removida a cópia inline duplicada de Auth que existia aqui.

document.addEventListener('DOMContentLoaded', () => {
    const nome = Auth.getNome();
    document.getElementById('nomeUsuario').textContent = nome;
    document.getElementById('avatarLetra').textContent = nome.charAt(0).toUpperCase();
});

let imagemBase64 = null;
let mimeType = 'image/jpeg';

// Drag & drop
const zona = document.getElementById('uploadZone');
zona.addEventListener('dragover', e => { e.preventDefault(); zona.style.borderColor = 'var(--green-lt)'; });
zona.addEventListener('dragleave', () => zona.style.borderColor = '');
zona.addEventListener('drop', e => { e.preventDefault(); zona.style.borderColor = ''; processarArquivo(e.dataTransfer.files[0]); });

function onImageSelecionada(e) { processarArquivo(e.target.files[0]); }

function processarArquivo(file) {
    if (!file) return;
    mimeType = file.type || 'image/jpeg';
    const reader = new FileReader();
    reader.onload = ev => {
        imagemBase64 = ev.target.result.split(',')[1];
        const prev = document.getElementById('previewImg');
        prev.src = ev.target.result;
        prev.style.display = 'block';
        document.getElementById('btnIdent').disabled = false;
    };
    reader.readAsDataURL(file);
}

async function identificar() {
    if (!imagemBase64) return;
    const btn = document.getElementById('btnIdent');
    btn.classList.add('loading');
    btn.disabled = true;

    document.getElementById('resultPanel').innerHTML = `
    <div class="estado-vazio">
        <div class="emoji" style="animation:spin 2s linear infinite;display:inline-block">🔬</div>
        <h3>Identificando...</h3>
        <p>A IA está analisando características botânicas da planta.</p>
    </div>`;

    try {
        const resp = await Auth.fetchAuth('/api/diagnostico/identificar', {
            method: 'POST',
            body: JSON.stringify({
                imagemBase64,
                mimeType,
                regiaoClima: document.getElementById('regiaoClima').value.trim() || null
            })
        });

        const d = await resp.json();

        if (!resp.ok) {
            document.getElementById('resultPanel').innerHTML = `
            <div class="estado-vazio"><div class="emoji">⚠️</div><h3>Erro</h3><p>${d.erro || 'Falha na análise.'}</p></div>`;
            return;
        }

        renderizarResultado(d);

    } catch {
        document.getElementById('resultPanel').innerHTML = `
        <div class="estado-vazio"><div class="emoji">⚠️</div><h3>Falha de conexão</h3><p>Verifique sua internet e tente novamente.</p></div>`;
    } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

function renderizarResultado(d) {
    window._resultadoAtual = d;
    const emojiPlanta = getEmoji(d.categoria);

    document.getElementById('resultPanel').innerHTML = `
    <div class="result-hero">
        <div class="result-badge-circle">${emojiPlanta}</div>
        <div class="result-hero-text">
            <h2>${d.nomePopular || 'Hortaliça identificada'}</h2>
            <div class="cientifico">${d.nomeCientifico || ''}</div>
            <div class="familia">Família: <strong>${d.familia || '—'}</strong> · Categoria: <strong>${d.categoria || '—'}</strong></div>
            <div class="conf-pill">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M13 4L6 11l-3-3"/></svg>
                ${d.confiancaIdentificacao || 0}% de confiança
            </div>
        </div>
    </div>

    <div class="agro-grid">
        <div class="agro-card">
            <div class="label">⏱️ Ciclo de vida</div>
            <div class="value">${d.cicloVida || '—'}</div>
        </div>
        <div class="agro-card">
            <div class="label">🌱 Germinação</div>
            <div class="value">${d.diasGerminacao ? d.diasGerminacao + ' dias' : '—'}</div>
        </div>
        <div class="agro-card">
            <div class="label">🌾 Colheita</div>
            <div class="value">${d.diasColheita ? d.diasColheita + ' dias' : '—'}</div>
        </div>
        <div class="agro-card">
            <div class="label">☀️ Luminosidade</div>
            <div class="value">${d.luminosidade || '—'}</div>
        </div>
        <div class="agro-card">
            <div class="label">💧 Irrigação</div>
            <div class="value">${d.irrigacao || '—'}</div>
        </div>
        <div class="agro-card">
            <div class="label">🌡️ Temperatura ideal</div>
            <div class="value">${d.temperaturaIdeal || '—'}</div>
        </div>
    </div>

    <div class="detail-cards">
        <div class="detail-card">
            <div class="detail-card-header">🌍 Clima / Solo</div>
            <div class="detail-card-body">${d.clima || '—'}<br><strong>Solo:</strong> ${d.tipoSolo || '—'}<br><strong>pH:</strong> ${d.phIdeal || '—'}</div>
        </div>
        <div class="detail-card">
            <div class="detail-card-header">📐 Espaçamento</div>
            <div class="detail-card-body">${d.espacamento || '—'}</div>
        </div>
        <div class="detail-card">
            <div class="detail-card-header">🌿 Adubação recomendada</div>
            <div class="detail-card-body">${d.adubacao || '—'}</div>
        </div>
        <div class="detail-card">
            <div class="detail-card-header">🥗 Valor nutricional</div>
            <div class="detail-card-body">${d.valorNutricional || '—'}</div>
        </div>
        <div class="detail-card">
            <div class="detail-card-header">🐛 Principais pragas</div>
            <div class="detail-card-body">${d.pragasPrincipais || '—'}</div>
        </div>
        <div class="detail-card">
            <div class="detail-card-header">🦠 Principais doenças</div>
            <div class="detail-card-body">${d.doencasPrincipais || '—'}</div>
        </div>
    </div>

    ${d.dicasCultivo ? `
    <div class="card">
        <div class="card-header">💡 Dicas de cultivo</div>
        <div class="card-body" style="font-size:13px;color:var(--text2);line-height:1.7;">${d.dicasCultivo}</div>
    </div>` : ''}

    <div class="acoes-row">
        <a href="diagnosticar.html" class="btn-diag-link">
            🔬 Diagnosticar doença nesta hortaliça →
        </a>
        <button class="btn-salvar-ht" id="btnSalvarHt" onclick="salvarHortalica()">
            💾 Salvar no catálogo
        </button>
    </div>
`;
}

function getEmoji(cat) {
    const m = {
        folhosa: '🥬', fruto: '🍅', raiz: '🥕', bulbo: '🧅',
        legume: '🫛', tubérculo: '🥔', brássica: '🥦'
    };
    return m[(cat || '').toLowerCase()] || '🌱';
}

// ── SALVAR HORTALIÇA IDENTIFICADA ────────────────────────────
// Chama /api/diagnostico/salvar-hortalica (endpoint que faltava e
// agora existe no DiagnosticoController — antes dava 404).
async function salvarHortalica() {
    if (!window._resultadoAtual) return;
    const btn = document.getElementById('btnSalvarHt');
    if (!btn || btn.classList.contains('salvo')) return;

    btn.disabled = true;
    btn.textContent = 'Salvando...';

    const d = window._resultadoAtual;
    const body = {
        nomeCientifico: d.nomeCientifico || '',
        nomePopular: d.nomePopular || '',
        familia: d.familia || null,
        categoria: d.categoria || null,
        cicloVida: d.cicloVida || null,
        diasGerminacao: d.diasGerminacao || null,
        diasColheita: d.diasColheita || null,
        espacamento: d.espacamento || null,
        clima: d.clima || null,
        luminosidade: d.luminosidade || null,
        irrigacao: d.irrigacao || null,
        tipoSolo: d.tipoSolo || null,
        adubacao: d.adubacao || null,
        pragasPrincipais: d.pragasPrincipais || null,
        doencasPrincipais: d.doencasPrincipais || null,
        origem: d.clima || null,
        valorNutricional: d.valorNutricional || null,
        observacoes: d.dicasCultivo || null,
    };

    try {
        const resp = await Auth.fetchAuth('/api/diagnostico/salvar-hortalica', {
            method: 'POST',
            body: JSON.stringify(body)
        });

        const data = await resp.json();

        if (resp.ok) {
            btn.classList.add('salvo');
            btn.textContent = data.jaExistia ? '✓ Já estava no catálogo' : '✓ Salvo no catálogo!';
        } else {
            btn.classList.add('erro');
            btn.textContent = data.erro || 'Erro ao salvar';
            btn.disabled = false;
        }
    } catch {
        btn.classList.add('erro');
        btn.textContent = 'Erro de conexão';
        btn.disabled = false;
    }
}