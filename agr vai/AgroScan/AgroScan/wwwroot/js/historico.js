        // ══════════════════════════════════════════════════════════════
        // AgroScan — Gerenciador de Autenticação JWT
        // Responsável por: armazenar tokens, injetar Bearer em requests,
        // renovar AccessToken automaticamente quando expirado.
        // ══════════════════════════════════════════════════════════════

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

        let todosDiag = [];
        let paginaAtual = 1;
        const TAM = 15;

        document.addEventListener('DOMContentLoaded', () => {
            const nome = Auth.getNome();
            document.getElementById('nomeUsuario').textContent = nome;
            document.getElementById('avatarLetra').textContent = nome.charAt(0).toUpperCase();
            carregarPagina(1);
        });

        async function carregarPagina(pag) {
            paginaAtual = pag;
            const tbody = document.getElementById('tableBody');
            tbody.innerHTML = `<tr><td colspan="6"><div class="skeleton" style="height:13px;margin:14px 16px;"></div></td></tr>`.repeat(3);

            try {
                const resp = await Auth.fetchAuth(`/api/diagnostico/historico?pagina=${pag}&tamanhoPagina=${TAM}`);
                const data = await resp.json();
                const lista = data.dados || [];

                // Filtros client-side
                const ftipo = document.getElementById('filtroTipo').value;
                const fgrav = document.getElementById('filtroGrav').value;
                const filtrada = lista.filter(d =>
                    (!ftipo || d.tipoDiagnostico === ftipo) &&
                    (!fgrav || d.gravidade === fgrav)
                );

                if (filtrada.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">
                    <span class="emoji">🌱</span>
                    Nenhum diagnóstico encontrado. <a href="diagnosticar.html" style="color:var(--green-lt)">Faça o primeiro!</a>
                </div></td></tr>`;
                    document.getElementById('paginfoText').textContent = '0 registros';
                    document.getElementById('paginacaoBtns').innerHTML = '';
                    return;
                }

                tbody.innerHTML = filtrada.map(d => {
                    const data_ = new Date(d.dataDiagnostico).toLocaleDateString('pt-BR');
                    return `<tr onclick="abrirModal(${d.diagnosticoId})" data-id="${d.diagnosticoId}" data-json='${JSON.stringify(d).replace(/'/g, "&#39;")}'>
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
                </tr>`;
                }).join('');

                document.getElementById('paginfoText').textContent = `${filtrada.length} registro${filtrada.length !== 1 ? 's' : ''}`;

                // Paginação simples
                const btnsEl = document.getElementById('paginacaoBtns');
                btnsEl.innerHTML = `
                <button class="pag-btn" onclick="carregarPagina(${pag - 1})" ${pag <= 1 ? 'disabled' : ''}>‹</button>
                <button class="pag-btn ativo">${pag}</button>
                <button class="pag-btn" onclick="carregarPagina(${pag + 1})" ${lista.length < TAM ? 'disabled' : ''}>›</button>
            `;

            } catch (e) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--red);">Erro ao carregar histórico.</td></tr>`;
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