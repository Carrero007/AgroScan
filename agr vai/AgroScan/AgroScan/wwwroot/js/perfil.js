document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('perfilOverlay');
    const btnAbrir = document.getElementById('editPerfilBtn');
    const btnFechar = document.getElementById('perfilClose');
    const btnSalvar = document.getElementById('perfilSalvar');
    if (!overlay || !btnAbrir) return;

    async function abrir() {
        overlay.classList.add('open');
        document.getElementById('perfilErro').style.display = 'none';
        try {
            const resp = await Auth.fetchAuth('/api/usuario/me');
            if (resp.ok) {
                const d = await resp.json();
                document.getElementById('perfilNome').value = d.nome || '';
                document.getElementById('perfilCep').value = d.cep || '';
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
            // busca cidade/UF no ViaCEP antes de enviar (o backend também revalida se quiser reforçar)
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
                // atualiza localStorage — nome no header e CEP usado na previsão do tempo
                localStorage.setItem('as_nome', nome);
                localStorage.setItem('as_cep', cep);
                document.getElementById('nomeUsuario').textContent = nome;
                document.getElementById('avatarLetra').textContent = nome.charAt(0).toUpperCase();
                overlay.classList.remove('open');

                // recarrega a previsão do tempo com o novo CEP, sem reload da página
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
            btnSalvar.textContent = '💾 Salvar alterações';
        }
    });
});