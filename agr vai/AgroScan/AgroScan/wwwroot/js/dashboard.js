
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

        document.addEventListener('DOMContentLoaded', async () => {
            // Mostra nome do usuário
            const nome = Auth.getNome();
            const nomeEl = document.getElementById('sidebarNome');
            const avatarEl = document.getElementById('avatarLetra');
            if (nomeEl) nomeEl.textContent = nome;
            if (avatarEl) avatarEl.textContent = nome.charAt(0).toUpperCase();

            await Promise.all([carregarHistorico(), carregarEstatisticas()]);
        });

        async function carregarHistorico() {
            try {
                const resp = await Auth.fetchAuth('/api/diagnostico/historico?pagina=1&tamanhoPagina=5');
                if (!resp.ok) return;
                const data = await resp.json();
                const tbody = document.getElementById('tabelaHistorico');

                if (!data.dados || data.dados.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state">
                    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.4" width="36" height="36" style="color:var(--text3);margin-bottom:12px;display:block;margin-left:auto;margin-right:auto"><circle cx="20" cy="20" r="16"/><path d="M20 13v7l4 4"/></svg>
                    Ainda não há diagnósticos salvos.<br><a href="diagnosticar.html" style="color:var(--green-lt)">Faça o primeiro para começar a acompanhar a saúde da lavoura.</a>
                </div></td></tr>`;
                    document.getElementById('kpiTotal').textContent = '0';
                    return;
                }

                document.getElementById('kpiTotal').textContent = data.dados.length >= 5 ? '5+' : data.dados.length;

                tbody.innerHTML = data.dados.map(d => {
                    const tipo = badgeTipo(d.tipoDiagnostico);
                    const grav = chipGrav(d.gravidade);
                    const conf = d.confianca || 0;
                    return `<tr>
                    <td style="color:var(--text);font-weight:500;">${d.nomeDoenca || 'Não identificado'}</td>
                    <td>${tipo}</td>
                    <td>${grav}</td>
                    <td>
                        <div class="conf-bar">
                            <div class="conf-track"><div class="conf-fill" style="width:${conf}%"></div></div>
                            <span>${conf}%</span>
                        </div>
                    </td>
                </tr>`;
                }).join('');

                // KPI gravidade alta
                const altas = data.dados.filter(d => d.gravidade === 'alta').length;
                document.getElementById('kpiAlta').textContent = altas;

            } catch (e) {
                console.error(e);
            }
        }

        async function carregarEstatisticas() {
            try {
                const resp = await Auth.fetchAuth('/api/diagnostico/estatisticas');
                if (!resp.ok) return;
                const stats = await resp.json();

                document.getElementById('kpiDoencas').textContent = stats.length;

                const totalDiag = stats.reduce((s, x) => s + x.total, 0);
                const confMedia = stats.length
                    ? (stats.reduce((s, x) => s + x.confiancaMedia * x.total, 0) / (totalDiag || 1)).toFixed(0)
                    : '—';
                document.getElementById('kpiConf').textContent = confMedia + '%';
                if (totalDiag > 0) document.getElementById('kpiTotal').textContent = totalDiag;

                const listaEl = document.getElementById('listaTipos');
                if (stats.length === 0) {
                    listaEl.innerHTML = `<div class="empty-state"><svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.4" width="32" height="32" style="color:var(--text3);margin-bottom:10px;display:block;margin-left:auto;margin-right:auto"><path d="M8 30l8-10 6 6 8-12"/></svg>Os dados aparecem aqui conforme você for fazendo análises.</div>`;
                    return;
                }

                const max = stats[0].total;
                listaEl.innerHTML = stats.map(s => `
                <div class="disease-item">
                    <div class="disease-name">${s.tipo || 'Outros'}</div>
                    <div class="bar-mini"><div class="bar-mini-fill" style="width:${(s.total / max * 100).toFixed(0)}%"></div></div>
                    <div class="disease-count">${s.total}</div>
                </div>`).join('');

            } catch (e) { console.error(e); }
        }

        function badgeTipo(tipo) {
            const map = {
                'Doença Fúngica': ['badge-fungica', 'Fúngica'],
                'Doença Bacteriana': ['badge-bacteriana', 'Bacteriana'],
                'Virose': ['badge-red', 'Virose'],
                'Praga de Inseto': ['badge-praga', 'Inseto'],
                'Praga de Ácaro': ['badge-acaro', 'Ácaro'],
                'Deficiência Nutricional': ['badge-defic', 'Def. Nutricional'],
                'Saudável': ['badge-saudavel', 'Saudável'],
                'Inconclusivo': ['badge-inconcl', 'Inconclusivo'],
            };
            const [cls, label] = map[tipo] || ['badge-inconcl', tipo || '—'];
            return `<span class="badge ${cls}">${label}</span>`;
        }

        function chipGrav(g) {
            const map = { alta: 'chip-alta', media: 'chip-media', baixa: 'chip-baixa' };
            return `<span class="${map[g] || ''}">${g ? g.charAt(0).toUpperCase() + g.slice(1) : '—'}</span>`;
        }

        function fazerLogout() {
            Auth.logout();
        }