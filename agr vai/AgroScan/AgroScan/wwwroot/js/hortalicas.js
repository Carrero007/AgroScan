// ── AUTH INLINE ────────────────────────────────────────────────
const Auth = (() => {
    const K = { t:'as_token', r:'as_refresh', n:'as_nome', u:'as_uid', e:'as_exp' };
    const salvar = d => {
        localStorage.setItem(K.t, d.token);
        localStorage.setItem(K.r, d.refreshToken);
        localStorage.setItem(K.n, d.nome);
        localStorage.setItem(K.u, d.usuarioId);
        localStorage.setItem(K.e, d.expiracao);
    };
    const limpar = () => Object.values(K).forEach(k => localStorage.removeItem(k));
    const getToken   = () => localStorage.getItem(K.t);
    const getNome    = () => localStorage.getItem(K.n) || 'Produtor';
    const estaLogado = () => !!getToken();
    const tokenExpirado = () => {
        const exp = localStorage.getItem(K.e);
        return !exp || new Date(exp) < new Date(Date.now() + 60000);
    };
    const renovarToken = async () => {
        const refresh = localStorage.getItem(K.r);
        if (!refresh) return false;
        try {
            const resp = await fetch('/api/auth/refresh', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({refreshToken:refresh}) });
            if (!resp.ok) { limpar(); return false; }
            salvar(await resp.json()); return true;
        } catch { return false; }
    };
    const fetchAuth = async (url, opts = {}) => {
        if (tokenExpirado()) { const ok = await renovarToken(); if (!ok) { window.location.replace('login.html'); return new Response(); } }
        const headers = { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json', ...(opts.headers||{}) };
        if (opts.isMultipart) delete headers['Content-Type'];
        return fetch(url, { ...opts, headers });
    };
    const logout = async () => {
        const refresh = localStorage.getItem(K.r);
        if (refresh) await fetch('/api/auth/logout', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({refreshToken:refresh}) }).catch(()=>{});
        limpar(); window.location.replace('login.html');
    };
    const exigirLogin = () => {
        const p = window.location.pathname.split('/').pop() || '';
        if (!['login.html','cadastro.html','index.html',''].includes(p) && !estaLogado()) window.location.replace('login.html');
    };
    return { salvar, limpar, getToken, getNome, estaLogado, fetchAuth, logout, exigirLogin };
})();
Auth.exigirLogin();

// ── DADOS ESTÁTICOS (mais dados vêm da API se cadastrados) ─────
const HORTALICAS_BASE = [
    { id:0, nome:'Tomate', cientifico:'Solanum lycopersicum', familia:'Solanaceae', categoria:'fruto',
      diasGerminacao:7, diasColheita:90, espacamento:'50-100 cm', temperaturaIdeal:'18-25°C',
      luminosidade:'Sol pleno', irrigacao:'Gotejamento', tipoSolo:'Argiloso rico em MO', phIdeal:'5.5-6.5',
      adubacao:'Alta demanda de NPK; adubação de cobertura quinzenal com nitrogênio e potássio',
      pragasPrincipais:'Traça (Tuta absoluta), Mosca-branca, Broca do fruto',
      doencasPrincipais:'Requeima (Phytophthora infestans), Pinta-preta (Alternaria solani), Murcha bacteriana',
      dicasCultivo:'Tutorar plantas acima de 30cm. Desbrotar para variedades indeterminadas. Evitar molhar folhagem.'
    },
    { id:0, nome:'Alface', cientifico:'Lactuca sativa', familia:'Asteraceae', categoria:'folhosa',
      diasGerminacao:5, diasColheita:55, espacamento:'25-30 cm', temperaturaIdeal:'15-22°C',
      luminosidade:'Sol pleno / meia sombra', irrigacao:'Aspersão', tipoSolo:'Arenoso-argiloso, fértil',
      phIdeal:'6.0-7.0', adubacao:'Moderada; adubação de base com composto orgânico e nitrogênio',
      pragasPrincipais:'Pulgão, Tripes, Lagarta-rosca',
      doencasPrincipais:'Míldio, Podridão-mole, Tip Burn (deficiência de cálcio)',
      dicasCultivo:'Prefere clima ameno. Em verão, usar variedades resistentes ao calor. Colher cedo evita amargamento.'
    },
    { id:0, nome:'Cenoura', cientifico:'Daucus carota', familia:'Apiaceae', categoria:'raiz',
      diasGerminacao:10, diasColheita:90, espacamento:'5-8 cm', temperaturaIdeal:'16-22°C',
      luminosidade:'Sol pleno', irrigacao:'Aspersão/Gotejamento', tipoSolo:'Arenoso profundo, sem pedras',
      phIdeal:'5.5-6.5', adubacao:'Evitar excesso de nitrogênio (bifurca a raiz); foco em fósforo e potássio',
      pragasPrincipais:'Mosca-da-cenoura, Pulgão',
      doencasPrincipais:'Alternariose, Cercosporiose, Oídio',
      dicasCultivo:'Solo fundo e solto é essencial. Desbaste obrigatório 3 semanas após emergência.'
    },
    { id:0, nome:'Pimentão', cientifico:'Capsicum annuum', familia:'Solanaceae', categoria:'fruto',
      diasGerminacao:10, diasColheita:120, espacamento:'50-60 cm', temperaturaIdeal:'20-30°C',
      luminosidade:'Sol pleno', irrigacao:'Gotejamento', tipoSolo:'Argiloso rico em MO',
      phIdeal:'5.5-7.0', adubacao:'Alta demanda de cálcio e potássio; adubação parcelada',
      pragasPrincipais:'Ácaro-rajado, Mosca-branca, Tripes',
      doencasPrincipais:'Podridão apical (Ca), Mancha bacteriana, Antracnose',
      dicasCultivo:'Exige tutores. Irrigação regular evita podridão apical. Colheita verde ou madura conforme uso.'
    },
    { id:0, nome:'Pepino', cientifico:'Cucumis sativus', familia:'Cucurbitaceae', categoria:'fruto',
      diasGerminacao:5, diasColheita:55, espacamento:'30-50 cm', temperaturaIdeal:'22-30°C',
      luminosidade:'Sol pleno', irrigacao:'Gotejamento', tipoSolo:'Franco-arenoso, bem drenado',
      phIdeal:'5.5-7.0', adubacao:'Alta demanda em produção; adubação nitrogenada em cobertura',
      pragasPrincipais:'Ácaro-rajado, Mosca-branca, Tripes',
      doencasPrincipais:'Míldio, Oídio, Antracnose, CMV',
      dicasCultivo:'Treliça aumenta produtividade e qualidade. Colher frequentemente estimula novas flores.'
    },
    { id:0, nome:'Abobrinha', cientifico:'Cucurbita pepo', familia:'Cucurbitaceae', categoria:'fruto',
      diasGerminacao:5, diasColheita:50, espacamento:'80-100 cm', temperaturaIdeal:'20-30°C',
      luminosidade:'Sol pleno', irrigacao:'Gotejamento/Sulco', tipoSolo:'Franco-argiloso, fértil',
      phIdeal:'5.5-7.0', adubacao:'Alta demanda; adubação completa de base e cobertura com nitrogênio',
      pragasPrincipais:'Ácaro-rajado, Mosca-branca, Broca-do-caule',
      doencasPrincipais:'Míldio, Oídio, CMV, Podridão-de-Sclerotinia',
      dicasCultivo:'Colher com 15-20cm para sabor ideal e estimular produção contínua.'
    },
    { id:0, nome:'Cebola', cientifico:'Allium cepa', familia:'Amaryllidaceae', categoria:'bulbo',
      diasGerminacao:8, diasColheita:120, espacamento:'10-15 cm', temperaturaIdeal:'15-25°C',
      luminosidade:'Sol pleno', irrigacao:'Aspersão', tipoSolo:'Franco-arenoso, bem drenado',
      phIdeal:'5.5-6.5', adubacao:'Fósforo na base; potássio e nitrogênio em cobertura',
      pragasPrincipais:'Tripes, Lagarta-rosca',
      doencasPrincipais:'Míldio, Mancha-púrpura (Alternaria), Podridão-do-colo',
      dicasCultivo:'Suspender irrigação 2 semanas antes da colheita para cura. Curar ao sol 7-10 dias após colheita.'
    },
    { id:0, nome:'Alho', cientifico:'Allium sativum', familia:'Amaryllidaceae', categoria:'bulbo',
      diasGerminacao:15, diasColheita:150, espacamento:'10-15 cm', temperaturaIdeal:'10-20°C',
      luminosidade:'Sol pleno', irrigacao:'Aspersão', tipoSolo:'Franco-argiloso, bem drenado',
      phIdeal:'5.5-7.0', adubacao:'Boa adubação orgânica de base; fósforo e potássio em cobertura',
      pragasPrincipais:'Tripes, Ácaro-rajado',
      doencasPrincipais:'Ferrugem, Podridão-branca (Sclerotium), Míldio',
      dicasCultivo:'Vernalização dos bulbilhos aumenta produtividade. Cortar escapo floral quando surgir.'
    },
    { id:0, nome:'Repolho', cientifico:'Brassica oleracea var. capitata', familia:'Brassicaceae', categoria:'brassica',
      diasGerminacao:5, diasColheita:90, espacamento:'50-60 cm', temperaturaIdeal:'15-22°C',
      luminosidade:'Sol pleno', irrigacao:'Aspersão', tipoSolo:'Argiloso fértil, bem drenado',
      phIdeal:'6.0-7.0', adubacao:'Alta demanda de nitrogênio; boa adubação de base e cobertura',
      pragasPrincipais:'Traça-das-crucíferas (Plutella), Pulgão, Lagarta-militar',
      doencasPrincipais:'Hérnia-das-crucíferas, Podridão-negra (Xanthomonas), Míldio',
      dicasCultivo:'Rotação de cultura obrigatória. Evitar solo com histórico de hérnia.'
    },
    { id:0, nome:'Brócolis', cientifico:'Brassica oleracea var. italica', familia:'Brassicaceae', categoria:'brassica',
      diasGerminacao:5, diasColheita:80, espacamento:'50-60 cm', temperaturaIdeal:'15-22°C',
      luminosidade:'Sol pleno', irrigacao:'Aspersão', tipoSolo:'Argiloso fértil',
      phIdeal:'6.0-7.0', adubacao:'Alta demanda de nitrogênio e boro; adubação de cobertura quinzenal',
      pragasPrincipais:'Traça-das-crucíferas, Pulgão-cinzento, Lagarta-da-couve',
      doencasPrincipais:'Podridão-negra, Míldio, Alternariose',
      dicasCultivo:'Colher inflorescência antes de abrir as flores. Pode produzir brotos laterais após colheita.'
    },
    { id:0, nome:'Couve', cientifico:'Brassica oleracea var. acephala', familia:'Brassicaceae', categoria:'brassica',
      diasGerminacao:5, diasColheita:60, espacamento:'50-80 cm', temperaturaIdeal:'15-25°C',
      luminosidade:'Sol pleno / meia sombra', irrigacao:'Aspersão/Manual', tipoSolo:'Argiloso fértil',
      phIdeal:'6.0-7.0', adubacao:'Alta demanda de nitrogênio; adubação frequente para produção contínua',
      pragasPrincipais:'Traça-das-crucíferas, Pulgão, Lagarta-da-couve',
      doencasPrincipais:'Podridão-negra, Míldio, Hérnia-das-crucíferas',
      dicasCultivo:'Planta perene produtiva. Colher folhas de baixo para cima. Muito rústica e adaptável.'
    },
    { id:0, nome:'Beterraba', cientifico:'Beta vulgaris', familia:'Amaranthaceae', categoria:'raiz',
      diasGerminacao:7, diasColheita:70, espacamento:'10-15 cm', temperaturaIdeal:'15-20°C',
      luminosidade:'Sol pleno', irrigacao:'Aspersão', tipoSolo:'Franco-arenoso profundo',
      phIdeal:'6.0-7.5', adubacao:'Moderada; foco em potássio e fósforo para desenvolvimento da raiz',
      pragasPrincipais:'Pulgão, Mosca-minadora',
      doencasPrincipais:'Cercosporiose (mancha-de-Cercospora), Podridão-do-colo',
      dicasCultivo:'Semear diretamente; desbaste para 8-10cm. Folhas também são comestíveis e nutritivas.'
    },
    { id:0, nome:'Quiabo', cientifico:'Abelmoschus esculentus', familia:'Malvaceae', categoria:'fruto',
      diasGerminacao:7, diasColheita:60, espacamento:'50-80 cm', temperaturaIdeal:'25-35°C',
      luminosidade:'Sol pleno', irrigacao:'Gotejamento/Sulco', tipoSolo:'Argiloso fértil e profundo',
      phIdeal:'5.5-7.0', adubacao:'Alta demanda; adubação de base completa e cobertura nitrogenada',
      pragasPrincipais:'Ácaro-rajado, Pulgão, Mosca-branca',
      doencasPrincipais:'Mosaico-do-quiabo, Podridão-de-Phytophthora, Oídio',
      dicasCultivo:'Planta tropical, exige calor. Colher frutos jovens (5-7cm) a cada 2-3 dias. Frutos velhos ficam fibrosos.'
    },
    { id:0, nome:'Berinjela', cientifico:'Solanum melongena', familia:'Solanaceae', categoria:'fruto',
      diasGerminacao:10, diasColheita:100, espacamento:'70-100 cm', temperaturaIdeal:'22-32°C',
      luminosidade:'Sol pleno', irrigacao:'Gotejamento', tipoSolo:'Argiloso rico em MO',
      phIdeal:'5.5-6.5', adubacao:'Alta demanda; similar ao tomate; adubação parcelada',
      pragasPrincipais:'Ácaro-rajado, Mosca-branca, Percevejo',
      doencasPrincipais:'Verticiliose, Podridão-de-Phytophthora, Antracnose',
      dicasCultivo:'Exige calor e tutores. Poda de formação melhora produtividade. Colher antes de amarelecer.'
    },
    { id:0, nome:'Espinafre', cientifico:'Spinacia oleracea', familia:'Amaranthaceae', categoria:'folhosa',
      diasGerminacao:7, diasColheita:40, espacamento:'15-20 cm', temperaturaIdeal:'10-18°C',
      luminosidade:'Sol pleno / meia sombra', irrigacao:'Aspersão', tipoSolo:'Franco-argiloso, rico em MO',
      phIdeal:'6.5-7.5', adubacao:'Moderada; foco em nitrogênio para folhagem exuberante',
      pragasPrincipais:'Pulgão, Minadora-de-folhas',
      doencasPrincipais:'Míldio (Peronospora), Cercosporiose',
      dicasCultivo:'Planta de clima frio. Altas temperaturas provocam florescimento precoce. Colher continuamente.'
    },
];

let dados = [...HORTALICAS_BASE];
let dadosAPI = [];
let modalAtual = null;

document.addEventListener('DOMContentLoaded', async () => {
    const nome = Auth.getNome();
    document.getElementById('nomeUsuario').textContent = nome;
    document.getElementById('avatarLetra').textContent = nome.charAt(0).toUpperCase();

    await carregarAPI();
    renderGrid(dados);
});

async function carregarAPI() {
    try {
        const resp = await Auth.fetchAuth('/api/hortalicas');
        if (!resp.ok) return;
        const lista = await resp.json();
        if (lista.length > 0) {
            dadosAPI = lista.map(h => ({
                id:             h.hortalicaId,
                nome:           h.nomePopular || h.nomeCientifico,
                cientifico:     h.nomeCientifico,
                familia:        h.familia,
                categoria:      (h.categoria || 'outro').toLowerCase(),
                diasGerminacao: h.diasGerminacao,
                diasColheita:   h.diasColheita,
                espacamento:    h.espacamento,
                temperaturaIdeal: h.tempeMin && h.tempeMax ? `${h.tempeMin}-${h.tempeMax}°C` : h.clima,
                luminosidade:   h.luminosidade,
                irrigacao:      h.irrigacao,
                tipoSolo:       h.tipoSolo,
                phIdeal:        h.phMin && h.phMax ? `${h.phMin}-${h.phMax}` : '—',
                adubacao:       h.adubacao,
                pragasPrincipais:  h.pragasPrincipais,
                doencasPrincipais: h.doencasPrincipais,
                dicasCultivo:   h.observacoes,
            }));
            // Mescla: API tem prioridade, base é fallback
            const nomesAPI = dadosAPI.map(d => d.nome.toLowerCase());
            const baseFiltrada = HORTALICAS_BASE.filter(h => !nomesAPI.includes(h.nome.toLowerCase()));
            dados = [...dadosAPI, ...baseFiltrada];
        }
    } catch { /* usa dados estáticos */ }
}

function filtrar() {
    const busca = document.getElementById('busca').value.toLowerCase().trim();
    const cat   = document.getElementById('filtroCat').value.toLowerCase();
    const filtrados = dados.filter(h => {
        const matchBusca = !busca || h.nome.toLowerCase().includes(busca) || (h.cientifico||'').toLowerCase().includes(busca);
        const matchCat   = !cat   || (h.categoria||'').toLowerCase() === cat;
        return matchBusca && matchCat;
    });
    renderGrid(filtrados);
}

function renderGrid(lista) {
    const grid = document.getElementById('grid');
    if (lista.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
            <span class="emoji">🌱</span>
            Nenhuma hortaliça encontrada para este filtro.
        </div>`;
        return;
    }
    grid.innerHTML = lista.map((h, i) => {
        const emoji   = getEmoji(h.categoria);
        const catCls  = getCatClass(h.categoria);
        const catLabel = getCatLabel(h.categoria);
        return `<div class="h-card" onclick="abrirModal(${i})">
            <div class="h-card-header">
                <div class="h-card-emoji">${emoji}</div>
                <div>
                    <div class="h-card-nome">${h.nome}</div>
                    <div class="h-card-cientifico">${h.cientifico || ''}</div>
                </div>
            </div>
            <div class="h-card-body">
                <span class="h-card-cat ${catCls}">${emoji} ${catLabel}</span>
                <div class="h-card-info">
                    <div class="info-item">
                        <label>⏱ Colheita</label>
                        <span>${h.diasColheita ? h.diasColheita + ' dias' : '—'}</span>
                    </div>
                    <div class="info-item">
                        <label>🌡️ Temp. ideal</label>
                        <span>${h.temperaturaIdeal || '—'}</span>
                    </div>
                </div>
                <div class="h-card-tags">
                    ${(h.pragasPrincipais||'').split(',').slice(0,2).map(p => `<span class="tag tag-praga">${p.trim().split('(')[0].trim()}</span>`).join('')}
                </div>
            </div>
        </div>`;
    }).join('');

    // Guarda a lista filtrada para o modal
    window._listaAtual = lista;
}

function abrirModal(idx) {
    const h = window._listaAtual[idx];
    if (!h) return;
    modalAtual = h;

    document.getElementById('mEmoji').textContent      = getEmoji(h.categoria);
    document.getElementById('mNome').textContent       = h.nome;
    document.getElementById('mCientifico').textContent = h.cientifico || '';

    document.getElementById('modalBody').innerHTML = `
        <div>
            <div class="modal-section-title">Dados agronômicos</div>
            <div class="modal-grid">
                <div class="modal-item"><label>⏱ Germinação</label><span>${h.diasGerminacao ? h.diasGerminacao+' dias' : '—'}</span></div>
                <div class="modal-item"><label>🌾 Colheita</label><span>${h.diasColheita ? h.diasColheita+' dias' : '—'}</span></div>
                <div class="modal-item"><label>🌡️ Temperatura</label><span>${h.temperaturaIdeal || '—'}</span></div>
                <div class="modal-item"><label>📐 Espaçamento</label><span>${h.espacamento || '—'}</span></div>
                <div class="modal-item"><label>☀️ Luminosidade</label><span>${h.luminosidade || '—'}</span></div>
                <div class="modal-item"><label>💧 Irrigação</label><span>${h.irrigacao || '—'}</span></div>
                <div class="modal-item"><label>🌍 Solo</label><span>${h.tipoSolo || '—'}</span></div>
                <div class="modal-item"><label>⚗️ pH Ideal</label><span>${h.phIdeal || '—'}</span></div>
                <div class="modal-item"><label>🌿 Família</label><span>${h.familia || '—'}</span></div>
            </div>
        </div>

        ${h.adubacao ? `<div class="modal-block"><label>🧪 Adubação recomendada</label><p>${h.adubacao}</p></div>` : ''}

        <div>
            <div class="modal-section-title">Sanidade</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div class="modal-block"><label>🐛 Principais pragas</label><p>${h.pragasPrincipais || '—'}</p></div>
                <div class="modal-block"><label>🦠 Principais doenças</label><p>${h.doencasPrincipais || '—'}</p></div>
            </div>
        </div>

        ${h.dicasCultivo ? `<div class="modal-block"><label>💡 Dicas de cultivo</label><p>${h.dicasCultivo}</p></div>` : ''}

        <div>
            <a href="diagnosticar.html" class="btn-diag-modal">
                🔬 Diagnosticar doença nesta hortaliça →
            </a>
        </div>
    `;

    document.getElementById('overlay').classList.add('open');
}

function fecharModal(e) {
    if (!e || e.target === document.getElementById('overlay')) {
        document.getElementById('overlay').classList.remove('open');
    }
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModal(); });

function getEmoji(cat) {
    const m = { folhosa:'🥬', fruto:'🍅', raiz:'🥕', bulbo:'🧅', legume:'🫛', brassica:'🥦', tubérculo:'🥔' };
    return m[(cat||'').toLowerCase()] || '🌱';
}

function getCatClass(cat) {
    const m = { folhosa:'cat-folhosa', fruto:'cat-fruto', raiz:'cat-raiz', bulbo:'cat-bulbo', legume:'cat-legume', brassica:'cat-brassica' };
    return m[(cat||'').toLowerCase()] || 'cat-outro';
}

function getCatLabel(cat) {
    const m = { folhosa:'Folhosa', fruto:'Fruto', raiz:'Raiz', bulbo:'Bulbo', legume:'Legume', brassica:'Brássica', tubérculo:'Tubérculo' };
    return m[(cat||'').toLowerCase()] || (cat || 'Outro');
}

function fazerLogout() { Auth.logout(); }