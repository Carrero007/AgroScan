            const Auth = (() => {
            const KEY_TOKEN = 'as_token';
            const KEY_REFRESH = 'as_refresh';
            const KEY_NOME = 'as_nome';
            const KEY_UID = 'as_uid';
            const KEY_EXP = 'as_exp';

            function salvar(data) {
                localStorage.setItem(KEY_TOKEN, data.token);
                localStorage.setItem(KEY_REFRESH, data.refreshToken);
                localStorage.setItem(KEY_NOME, data.nome);
                localStorage.setItem(KEY_UID, data.usuarioId);
                localStorage.setItem(KEY_EXP, data.expiracao);
            }

            function limpar() {
                [KEY_TOKEN, KEY_REFRESH, KEY_NOME, KEY_UID, KEY_EXP].forEach(k => localStorage.removeItem(k));
            }

            function getToken() { return localStorage.getItem(KEY_TOKEN); }
            function getNome() { return localStorage.getItem(KEY_NOME) || 'Produtor'; }
            function estaLogado() { return !!getToken(); }

            function tokenExpirado() {
                const exp = localStorage.getItem(KEY_EXP);
                if (!exp) return true;
                // Considera expirado 60s antes para evitar requests com token vencendo
                return new Date(exp) < new Date(Date.now() + 60000);
            }

            async function renovarToken() {
                const refresh = localStorage.getItem(KEY_REFRESH);
                if (!refresh) return false;
                try {
                    const resp = await fetch('/api/auth/refresh', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refreshToken: refresh })
                    });
                    if (!resp.ok) { limpar(); return false; }
                    const data = await resp.json();
                    salvar(data);
                    return true;
                } catch {
                    return false;
                }
            }

            /** Retorna headers com Bearer válido, renovando se necessário. */
            async function getHeaders(extra = {}) {
                if (tokenExpirado()) {
                    const ok = await renovarToken();
                    if (!ok) {
                        window.location.replace('login.html');
                        return {};
                    }
                }
                return {
                    'Authorization': `Bearer ${getToken()}`,
                    'Content-Type': 'application/json',
                    ...extra
                };
            }

            /** Wrapper de fetch que injeta JWT automaticamente. */
            async function fetchAuth(url, options = {}) {
                const headers = await getHeaders(options.headers || {});
                // Remove Content-Type para multipart (o browser define o boundary)
                if (options.isMultipart) delete headers['Content-Type'];
                return fetch(url, { ...options, headers });
            }

            async function logout() {
                const refresh = localStorage.getItem(KEY_REFRESH);
                if (refresh) {
                    await fetch('/api/auth/logout', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refreshToken: refresh })
                    }).catch(() => { });
                }
                limpar();
                window.location.replace('login.html');
            }

            /** Proteção de rota — chame no topo de páginas protegidas. */
            function exigirLogin() {
                const pagina = window.location.pathname.split('/').pop() || '';
                const publicas = ['login.html', 'cadastro.html', 'index.html', ''];
                if (publicas.includes(pagina)) return;
                if (!estaLogado()) {
                    window.location.replace('login.html');
                }
            }

            return { salvar, limpar, getToken, getNome, estaLogado, fetchAuth, logout, exigirLogin };
        })();

        // Proteção automática ao carregar qualquer página
        Auth.exigirLogin();

    
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
            window._resultadoAtual = d; // guarda para o botão salvar
            const emojiPlanta = getEmoji(d.categoria);

            document.getElementById('resultPanel').innerHTML = `
            <!-- HERO -->
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

            <!-- DADOS AGRONÔMICOS -->
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

            <!-- DETALHES -->
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
