document.addEventListener('DOMContentLoaded', () => {
    const VIDEO_TUTORIAL_URL = 'https://www.youtube.com/watch?v=COLOQUE_SEU_VIDEO';

    const overlay = document.getElementById('perfilOverlay');
    const btnAbrir = document.getElementById('editPerfilBtn');
    const btnFechar = document.getElementById('perfilClose');
    const btnSalvar = document.getElementById('perfilSalvar');
    if (!overlay || !btnAbrir) return;
    btnSalvar.textContent = 'Salvar alterações';

    const secao = document.createElement('div');
    secao.id = 'geminiKeySecao';
    secao.innerHTML = `
        <div class="field">
            <label>Chave de API do Gemini</label>
            <div id="geminiKeyStatus" style="font-size:14px;margin-bottom:6px;color:var(--muted-fg)">Carregando...</div>
            <input type="text" id="geminiKeyInput" style="width:100%" placeholder="Cole sua chave (AIza...)" autocomplete="off" spellcheck="false">
            <div id="geminiKeyErro" style="display:none;color:var(--destructive);font-size:14px;margin-top:6px;"></div>
            <div style="display:flex;gap:8px;margin-top:8px;">
                <button type="button" class="btn-primary" id="geminiKeySalvar" style="flex:1;justify-content:center;">Salvar chave</button>
                <button type="button" class="btn-primary" id="geminiKeyRemover" style="display:none;justify-content:center;">Remover</button>
            </div>
            <details class="more" style="margin-top:10px;border-top:none;padding:0;">
                <summary>Como criar minha chave (grátis)</summary>
                <p style="margin:8px 0;"><a href="${VIDEO_TUTORIAL_URL}" target="_blank" rel="noopener noreferrer" style="color:var(--primary)">Assistir ao vídeo tutorial</a></p>
                <ol style="padding-left:18px;line-height:1.6;font-size:14.5px;">
                    <li>Acesse <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style="color:var(--primary)">aistudio.google.com/apikey</a>.</li>
                    <li>Entre com sua conta Google.</li>
                    <li>Clique em <strong>Criar chave de API</strong>.</li>
                    <li>Escolha um projeto ou crie um novo.</li>
                    <li>Copie a chave gerada (começa com <strong>AIza</strong>).</li>
                    <li>Cole acima e clique em <strong>Salvar chave</strong>.</li>
                </ol>
                <p style="font-size:14px;color:var(--muted-fg)">Não compartilhe sua chave. Você pode removê-la aqui quando quiser.</p>
            </details>
        </div>`;
    if (btnSalvar) btnSalvar.parentNode.insertBefore(secao, btnSalvar);

    const info = document.createElement('p');
    info.id = 'perfilInfo';
    secao.parentNode.insertBefore(info, secao);

    const elStatus = secao.querySelector('#geminiKeyStatus');
    const elInput = secao.querySelector('#geminiKeyInput');
    const elErro = secao.querySelector('#geminiKeyErro');
    const btnKeySalvar = secao.querySelector('#geminiKeySalvar');
    const btnKeyRemover = secao.querySelector('#geminiKeyRemover');

    async function carregarStatusChave() {
        try {
            const r = await Auth.fetchAuth('/api/usuario/gemini-key');
            if (!r.ok) return null;
            const d = await r.json();
            elStatus.textContent = d.possui ? `Chave cadastrada: ${d.mascara}` : 'Nenhuma chave cadastrada.';
            btnKeyRemover.style.display = d.possui ? 'inline-flex' : 'none';
            btnKeySalvar.textContent = d.possui ? 'Trocar chave' : 'Salvar chave';
            return d;
        } catch { elStatus.textContent = 'Não foi possível carregar o status.'; return null; }
    }

    btnKeySalvar.addEventListener('click', async () => {
        const chave = elInput.value.trim();
        elErro.style.display = 'none';
        if (!chave) { elErro.textContent = 'Cole sua chave.'; elErro.style.display = 'block'; return; }
        btnKeySalvar.disabled = true;
        const txt = btnKeySalvar.textContent;
        btnKeySalvar.textContent = 'Validando...';
        try {
            const r = await Auth.fetchAuth('/api/usuario/gemini-key', { method: 'PUT', body: JSON.stringify({ chave }) });
            const d = await r.json().catch(() => ({}));
            if (r.ok) { elInput.value = ''; await carregarStatusChave(); removerBanner(); }
            else { elErro.textContent = d.erro || 'Erro ao salvar.'; elErro.style.display = 'block'; btnKeySalvar.textContent = txt; }
        } catch { elErro.textContent = 'Erro de conexão.'; elErro.style.display = 'block'; btnKeySalvar.textContent = txt; }
        finally { btnKeySalvar.disabled = false; }
    });

    btnKeyRemover.addEventListener('click', async () => {
        if (!confirm('Remover sua chave de API?')) return;
        try {
            await Auth.fetchAuth('/api/usuario/gemini-key', { method: 'DELETE' });
            await carregarStatusChave();
            mostrarBanner();
        } catch { alert('Erro de conexão.'); }
    });

    function removerBanner() { document.getElementById('geminiKeyBanner')?.remove(); }
    function mostrarBanner() {
        if (!location.pathname.endsWith('dashboard.html') || document.getElementById('geminiKeyBanner')) return;
        const header = document.querySelector('.page-header');
        if (!header) return;
        const div = document.createElement('div');
        div.id = 'geminiKeyBanner';
        div.className = 'card';
        div.style.marginBottom = '16px';
        div.innerHTML = `<div class="card-content" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <span style="flex:1;min-width:220px;">Cadastre sua chave de API do Gemini para usar a IA com seu próprio limite de uso.</span>
            <button type="button" class="btn-primary" id="geminiKeyBannerBtn">Cadastrar chave</button></div>`;
        header.insertAdjacentElement('afterend', div);
        div.querySelector('#geminiKeyBannerBtn').addEventListener('click', async () => {
            await abrir();
            secao.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    }

    async function abrir() {
        overlay.classList.add('open');
        document.getElementById('perfilErro').style.display = 'none';
        elErro.style.display = 'none';
        carregarStatusChave();
        try {
            const resp = await Auth.fetchAuth('/api/usuario/me');
            if (resp.ok) {
                const d = await resp.json();
                document.getElementById('perfilNome').value = d.nome || '';
                document.getElementById('perfilCep').value = d.cep || '';
                const cpf = d.cpf || '';
                info.textContent = `CPF ***.***.${cpf.slice(6, 9)}-${cpf.slice(9)}${d.cidade ? ' · ' + d.cidade + ' / ' + d.estado : ''}`;
            }
        } catch { }
    }

    btnAbrir.addEventListener('click', abrir);
    btnFechar.addEventListener('click', () => overlay.classList.remove('open'));
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });

    document.getElementById('perfilCep').addEventListener('input', function () {
        let v = this.value.replace(/\D/g, '');
        if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5);
        this.value = v.slice(0, 9);
    });

    btnSalvar.addEventListener('click', async () => {
        const nome = document.getElementById('perfilNome').value.trim();
        const cep = document.getElementById('perfilCep').value.replace(/\D/g, '');
        const erroEl = document.getElementById('perfilErro');

        if (nome.length < 3) { erroEl.textContent = 'Nome muito curto.'; erroEl.style.display = 'block'; return; }
        if (cep.length !== 8) { erroEl.textContent = 'CEP inválido.'; erroEl.style.display = 'block'; return; }

        btnSalvar.disabled = true;
        btnSalvar.textContent = 'Salvando...';

        try {
            let cidade = '', estado = '';
            try {
                const via = await (await fetch(`https://viacep.com.br/ws/${cep}/json/`)).json();
                if (!via.erro) { cidade = via.localidade; estado = via.uf; }
            } catch { }

            const resp = await Auth.fetchAuth('/api/usuario/me', {
                method: 'PUT',
                body: JSON.stringify({ nome, cep, cidade, estado })
            });
            const data = await resp.json();

            if (resp.ok) {
                localStorage.setItem('as_nome', nome);
                localStorage.setItem('as_cep', cep);
                localStorage.removeItem('as_regiao');
                document.getElementById('nomeUsuario').textContent = nome;
                document.getElementById('avatarLetra').textContent = nome.charAt(0).toUpperCase();
                overlay.classList.remove('open');

                if (typeof initClima === 'function') {
                    const weatherJson = await initClima(cep);
                    if (typeof computeAlertasClimaticos === 'function' && typeof populateAlertasCriticos === 'function') {
                        populateAlertasCriticos(computeAlertasClimaticos(weatherJson, cultureData));
                    }
                }
            } else {
                erroEl.textContent = data.erro || 'Erro ao salvar.';
                erroEl.style.display = 'block';
            }
        } catch {
            erroEl.textContent = 'Erro de conexão.';
            erroEl.style.display = 'block';
        } finally {
            btnSalvar.disabled = false;
            btnSalvar.textContent = 'Salvar alterações';
        }
    });

    if (location.pathname.endsWith('dashboard.html')) {
        carregarStatusChave().then(d => { if (d && !d.possui) mostrarBanner(); });
    }
});
