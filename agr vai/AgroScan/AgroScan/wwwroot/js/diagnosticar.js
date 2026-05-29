        // ── AUTH INLINE ────────────────────────────────────────────────
        const Auth = (() => {
            const K = { t: 'as_token', r: 'as_refresh', n: 'as_nome', u: 'as_uid', e: 'as_exp' };
            const salvar = d => { localStorage.setItem(K.t, d.token); localStorage.setItem(K.r, d.refreshToken); localStorage.setItem(K.n, d.nome); localStorage.setItem(K.u, d.usuarioId); localStorage.setItem(K.e, d.expiracao); };
            const limpar = () => Object.values(K).forEach(k => localStorage.removeItem(k));
            const getToken = () => localStorage.getItem(K.t);
            const getNome = () => localStorage.getItem(K.n) || 'Produtor';
            const estaLogado = () => !!getToken();
            const tokenExpirado = () => { const e = localStorage.getItem(K.e); return !e || new Date(e) < new Date(Date.now() + 60000); };
            const renovarToken = async () => { const r = localStorage.getItem(K.r); if (!r) return false; try { const res = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: r }) }); if (!res.ok) { limpar(); return false; } salvar(await res.json()); return true; } catch { return false; } };
            const fetchAuth = async (url, opts = {}) => { if (tokenExpirado()) { const ok = await renovarToken(); if (!ok) { window.location.replace('login.html'); return new Response(); } } const h = { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json', ...(opts.headers || {}) }; if (opts.isMultipart) delete h['Content-Type']; return fetch(url, { ...opts, headers: h }); };
            const logout = async () => { const r = localStorage.getItem(K.r); if (r) await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: r }) }).catch(() => { }); limpar(); window.location.replace('login.html'); };
            const exigirLogin = () => { const p = window.location.pathname.split('/').pop() || ''; if (!['login.html', 'cadastro.html', 'index.html', ''].includes(p) && !estaLogado()) window.location.replace('login.html'); };
            return { salvar, limpar, getToken, getNome, estaLogado, fetchAuth, logout, exigirLogin };
        })();
        Auth.exigirLogin();

        // ── ESTADO ────────────────────────────────────────────────────
        let imagemBase64 = null;
        let mimeType = 'image/jpeg';
        let nomeArquivo = null;
        let resultadoAtual = null;
        let estagioAtual = '';
        const sintomasSet = new Set();
        const climaSet = new Set();

        const HORTALICAS = ['Tomate', 'Alface', 'Cenoura', 'Pimentão', 'Pepino', 'Abobrinha', 'Cebola',
            'Alho', 'Repolho', 'Brócolis', 'Couve', 'Beterraba', 'Quiabo', 'Berinjela', 'Espinafre',
            'Chuchu', 'Batata-doce', 'Jiló', 'Mandioca', 'Rabanete', 'Ervilha', 'Feijão-vagem',
            'Milho-verde', 'Rúcula', 'Kale'];

        document.addEventListener('DOMContentLoaded', () => {
            const nome = Auth.getNome();
            document.getElementById('nomeUsuario').textContent = nome;
            document.getElementById('avatarLetra').textContent = nome.charAt(0).toUpperCase();
        });

        // ── UPLOAD / DRAG & DROP ─────────────────────────────────────
        const zona = document.getElementById('uploadZone');
        zona.addEventListener('dragover', e => { e.preventDefault(); zona.style.borderColor = 'var(--green-lt)'; });
        zona.addEventListener('dragleave', () => zona.style.borderColor = '');
        zona.addEventListener('drop', e => { e.preventDefault(); zona.style.borderColor = ''; if (e.dataTransfer.files[0]) processarArquivo(e.dataTransfer.files[0]); });

        function onImageSelecionada(e) { if (e.target.files[0]) processarArquivo(e.target.files[0]); }

        function processarArquivo(file) {
            mimeType = file.type || 'image/jpeg';
            nomeArquivo = file.name;
            const reader = new FileReader();
            reader.onload = ev => {
                imagemBase64 = ev.target.result.split(',')[1];
                const prev = document.getElementById('previewImg');
                prev.src = ev.target.result;
                prev.style.display = 'block';
                // Esconde o placeholder da zona de upload
                zona.querySelector('.upload-icon').style.display = 'none';
                zona.querySelector('.upload-label').style.display = 'none';
                zona.querySelector('.upload-hint').style.display = 'none';
                zona.style.minHeight = '0';
                document.getElementById('btnAnalisar').disabled = false;
                atualizarQualidade();
            };
            reader.readAsDataURL(file);
        }

        // ── AUTOCOMPLETE HORTALIÇAS ───────────────────────────────────
        function onAcInput(v) {
            const list = document.getElementById('acList');
            if (!v || v.length < 2) { list.classList.remove('show'); atualizarQualidade(); return; }
            const m = HORTALICAS.filter(h => h.toLowerCase().includes(v.toLowerCase())).slice(0, 6);
            if (!m.length) { list.classList.remove('show'); return; }
            list.innerHTML = m.map(h => `<div class="ac-item" onmousedown="escolherAC('${h}')">${h}</div>`).join('');
            list.classList.add('show');
            atualizarQualidade();
        }
        function escolherAC(v) {
            document.getElementById('hortalicaNome').value = v;
            document.getElementById('acList').classList.remove('show');
            // Marca o chip correspondente se existir
            document.querySelectorAll('#chipsHort .chip').forEach(c => {
                c.classList.toggle('on', c.textContent.replace(/\s/g, '').toLowerCase().includes(v.toLowerCase()));
            });
            atualizarQualidade();
        }
        function fecharAc() { setTimeout(() => document.getElementById('acList').classList.remove('show'), 200); }

        // ── CHIPS ─────────────────────────────────────────────────────
        function chipHort(el) {
            const era = el.classList.contains('on');
            document.querySelectorAll('#chipsHort .chip').forEach(c => c.classList.remove('on'));
            if (!era) {
                el.classList.add('on');
                document.getElementById('hortalicaNome').value = el.textContent.replace(/[^\w\sÀ-ÿ-]/g, '').trim();
            } else {
                document.getElementById('hortalicaNome').value = '';
            }
            atualizarQualidade();
        }

        function chipEst(el, valor) {
            const era = el.classList.contains('on');
            document.querySelectorAll('#chipsEst .chip').forEach(c => c.classList.remove('on'));
            if (!era) { el.classList.add('on'); estagioAtual = valor; }
            else estagioAtual = '';
            atualizarQualidade();
        }

        function chipToggle(el, conjunto) {
            // Extrai texto limpo do chip (remove emoji)
            const txt = el.textContent.replace(/^\S+\s/, '').trim();
            if (el.classList.toggle('on')) conjunto.add(txt);
            else conjunto.delete(txt);
            atualizarQualidade();
        }

        // ── QUALIDADE DO CONTEXTO ─────────────────────────────────────
        function atualizarQualidade() {
            let pts = 0;
            if (imagemBase64) pts += 20; // imagem é base
            if (document.getElementById('hortalicaNome').value.trim()) pts += 25;
            if (estagioAtual) pts += 15;
            if (sintomasSet.size > 0) pts += 25;
            if (climaSet.size > 0) pts += 10;
            if (document.getElementById('regiaoClima').value.trim()) pts += 5;

            const fill = document.getElementById('ctxFill');
            const label = document.getElementById('ctxLabel');
            fill.style.width = pts + '%';

            if (pts === 0) { fill.style.background = 'var(--red)'; label.textContent = 'Selecione uma foto'; }
            else if (pts < 25) { fill.style.background = 'var(--red)'; label.textContent = 'Só a foto'; }
            else if (pts < 50) { fill.style.background = 'var(--amber)'; label.textContent = 'Básico'; }
            else if (pts < 75) { fill.style.background = 'var(--green-lt)'; label.textContent = 'Bom'; }
            else { fill.style.background = 'var(--leaf)'; label.textContent = '🎯 Excelente!'; }
        }

        // ── DIAGNOSTICAR ─────────────────────────────────────────────
        async function diagnosticar() {
            if (!imagemBase64) return;

            const btn = document.getElementById('btnAnalisar');
            btn.classList.add('loading');
            btn.disabled = true;
            document.getElementById('estadoVazio').style.display = 'none';
            document.getElementById('resultPanel').innerHTML = `
            <div class="estado-vazio">
                <div class="emoji" style="animation:spin 2s linear infinite;display:inline-block;">🔬</div>
                <h3>Analisando com IA...</h3>
                <p>Nossa IA especializada em hortaliças está examinando a imagem.</p>
            </div>`;

            // Monta sintomas: chips + texto extra
            const sintomasFinal = [...sintomasSet, document.getElementById('sintomasExtra').value.trim()]
                .filter(Boolean).join('. ');
            const climaFinal = [...climaSet].join(', ');

            try {
                const body = {
                    imagemBase64,
                    mimeType,
                    nomeArquivo,
                    hortalicaNome: document.getElementById('hortalicaNome').value.trim() || null,
                    estagioPlanta: estagioAtual || null,
                    regiaoClima: document.getElementById('regiaoClima').value.trim() || null,
                    condicoesClimaticas: climaFinal || null,
                    sintomasDescricao: sintomasFinal || null,
                    tratamentosAnteriores: document.getElementById('tratamentosAnteriores').value.trim() || null,
                };

                const resp = await Auth.fetchAuth('/api/diagnostico/diagnosticar', {
                    method: 'POST',
                    body: JSON.stringify(body)
                });

                const data = await resp.json();

                if (!resp.ok) {
                    document.getElementById('resultPanel').innerHTML = `
                    <div class="estado-vazio">
                        <div class="emoji">⚠️</div>
                        <h3>Erro na análise</h3>
                        <p>${data.erro || 'Falha ao analisar. Tente novamente.'}</p>
                        ${data.detalhe ? `<pre style="font-size:10px;color:var(--text3);margin-top:10px;white-space:pre-wrap;text-align:left;max-width:400px;">${data.detalhe}</pre>` : ''}
                    </div>`;
                    return;
                }

                resultadoAtual = data;
                renderizarResultado(data);

            } catch (e) {
                document.getElementById('resultPanel').innerHTML = `
                <div class="estado-vazio">
                    <div class="emoji">⚠️</div>
                    <h3>Falha de conexão</h3>
                    <p>Verifique sua internet e tente novamente.</p>
                </div>`;
            } finally {
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        }

        // ── RENDERIZAR RESULTADO ──────────────────────────────────────
        function renderizarResultado(d) {
            const tipoCls = tipoClass(d.tipoDiagnostico);
            const confCor = d.confianca >= 75 ? 'mv-green' : d.confianca >= 50 ? 'mv-amber' : 'mv-red';
            const gravCor = d.gravidadeNivel >= 7 ? 'mv-red' : d.gravidadeNivel >= 4 ? 'mv-amber' : 'mv-green';
            const riscoCor = d.riscoPropagacaoNivel >= 7 ? 'mv-red' : d.riscoPropagacaoNivel >= 4 ? 'mv-amber' : 'mv-green';
            const urgHtml = urgBanner(d.recomendacaoUrgencia, d.diasParaAcao);

            const passos = [d.tratamentoPasso1, d.tratamentoPasso2, d.tratamentoPasso3].filter(Boolean);

            document.getElementById('resultPanel').innerHTML = `
            <div class="result-hero">
                <div class="r-badge ${tipoCls}">${d.tipoDiagnostico || 'Inconclusivo'}</div>
                <div class="r-doenca">${d.nomeDoenca || 'Não identificado'}</div>
                <div class="r-cientifico">${[d.nomeCientifico, d.agenteCausador].filter(Boolean).join(' · ')}</div>
                <div class="r-metrics">
                    <div class="r-metric"><div class="ml">Confiança</div><div class="mv ${confCor}">${d.confianca || 0}%</div></div>
                    <div class="r-metric"><div class="ml">Gravidade</div><div class="mv ${gravCor}">${d.gravidadeNivel || 0}/10</div></div>
                    <div class="r-metric"><div class="ml">Propagação</div><div class="mv ${riscoCor}">${d.riscoPropagacaoNivel || 0}/10</div></div>
                </div>
            </div>

            ${urgHtml}

            <div class="detail-grid">
                <div class="det-card">
                    <div class="det-header">🔍 Sintomas Observados</div>
                    <div class="det-body">${d.sintomasObservados || '—'}</div>
                </div>
                <div class="det-card">
                    <div class="det-header">🌡️ Condições Favoráveis</div>
                    <div class="det-body">${d.condicoesFavoraveis || '—'}</div>
                </div>
            </div>

            <div class="card">
                <div class="card-header">💊 Protocolo de Tratamento</div>
                <div class="card-body">
                    <div class="trat-steps">
                        ${passos.map((p, i) => `<div class="trat-step"><div class="step-num">${i + 1}</div><div class="step-text">${p}</div></div>`).join('')}
                    </div>
                </div>
            </div>

            <div class="detail-grid">
                <div class="det-card">
                    <div class="det-header">🌿 Tratamento Ecológico</div>
                    <div class="det-body">${d.tratamentoEcologico || '—'}</div>
                </div>
                <div class="det-card">
                    <div class="det-header">🧪 Tratamento Químico</div>
                    <div class="det-body">${d.tratamentoQuimico || '—'}</div>
                </div>
                <div class="det-card">
                    <div class="det-header">🛡️ Prevenção</div>
                    <div class="det-body">${d.prevencao || '—'}</div>
                </div>
                <div class="det-card">
                    <div class="det-header">⚠️ Risco / Plantas Afetadas</div>
                    <div class="det-body">${d.plantasAfetadas || '—'}<br><br><strong>${d.riscoPropagacaoTexto || ''}</strong></div>
                </div>
            </div>

            <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
                <button class="btn-salvar" id="btnSalvar" onclick="salvarDiagnostico()">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M13 11v2H3v-2M8 3v7M5 7l3 3 3-3"/></svg>
                    Salvar no histórico
                </button>
                <button class="btn-salvar" onclick="window.print()" style="border-color:var(--text3);color:var(--text3);">
                    🖨️ Imprimir
                </button>
            </div>
        `;
        }

        async function salvarDiagnostico() {
            if (!resultadoAtual) return;
            const btn = document.getElementById('btnSalvar');
            btn.disabled = true; btn.textContent = 'Salvando...';
            try {
                const resp = await Auth.fetchAuth('/api/diagnostico/salvar', {
                    method: 'POST',
                    body: JSON.stringify({
                        tipoDiagnostico: resultadoAtual.tipoDiagnostico,
                        nomeDoenca: resultadoAtual.nomeDoenca,
                        nomeCientifico: resultadoAtual.nomeCientifico,
                        agenteCausador: resultadoAtual.agenteCausador,
                        confianca: resultadoAtual.confianca || 0,
                        gravidadeNivel: resultadoAtual.gravidadeNivel || 0,
                        gravidade: resultadoAtual.gravidade,
                        sintomasObservados: resultadoAtual.sintomasObservados,
                        tratamento: resultadoAtual.tratamentoPasso1,
                        tratamentoEcologico: resultadoAtual.tratamentoEcologico,
                        tratamentoQuimico: resultadoAtual.tratamentoQuimico,
                        prevencao: resultadoAtual.prevencao,
                        riscoPropagacao: resultadoAtual.riscoPropagacao,
                        riscoPropagacaoNivel: resultadoAtual.riscoPropagacaoNivel || 0,
                        plantasAfetadas: resultadoAtual.plantasAfetadas,
                        condicoesFavoraveis: resultadoAtual.condicoesFavoraveis,
                    })
                });
                if (resp.ok) { btn.classList.add('salvo'); btn.textContent = '✓ Salvo no histórico!'; }
                else { btn.disabled = false; btn.textContent = 'Erro ao salvar. Tentar novamente'; }
            } catch { btn.disabled = false; btn.textContent = 'Erro de conexão'; }
        }

        function tipoClass(tipo) {
            const m = {
                'Doença Fúngica': 'rt-fungica', 'Doença Bacteriana': 'rt-bacteriana', 'Virose': 'rt-virose',
                'Praga de Inseto': 'rt-praga', 'Praga de Ácaro': 'rt-acaro',
                'Deficiência Nutricional': 'rt-defic', 'Saudável': 'rt-saudavel'
            };
            return m[tipo] || 'rt-inconcl';
        }

        function urgBanner(u, dias) {
            if (!u || u === 'nenhuma') return '';
            const cls = { imediata: 'urg-imediata', 'em 48h': 'urg-48h', 'em 7 dias': 'urg-7dias', monitorar: 'urg-monitorar' }[u] || 'urg-monitorar';
            const icon = { imediata: '🚨', 'em 48h': '⚠️', 'em 7 dias': '📅', monitorar: '👁️' }[u] || '📋';
            const lab = { imediata: 'Imediata', 'em 48h': 'Em até 48h', 'em 7 dias': 'Em até 7 dias', monitorar: 'Monitorar' }[u] || u;
            const diasTxt = dias > 0 ? ` — Agir em até ${dias} dia${dias > 1 ? 's' : ''}` : '';
            return `<div class="urg-banner ${cls}">${icon} <strong>Urgência: ${lab}</strong>${diasTxt}</div>`;
        }