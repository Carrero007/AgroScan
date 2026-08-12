(function () {
    'use strict';

    /* ── Referências ── */
    const main = document.getElementById('main');
    const toCad = document.getElementById('toCadastro');
    const toLogin = document.getElementById('toLogin');
    const toCadMobile = document.getElementById('toCadastroMobile');
    const toLoginMobile = document.getElementById('toLoginMobile');

    function switchTo(target) {
        main.classList.toggle('right-panel-active', target === 'cadastro');
        document.title = target === 'cadastro' ? 'AgroScan · Criar Conta' : 'AgroScan · Entrar';
    }
    toCad.addEventListener('click', () => switchTo('cadastro'));
    toLogin.addEventListener('click', () => switchTo('login'));
    toCadMobile.addEventListener('click', () => switchTo('cadastro'));
    toLoginMobile.addEventListener('click', () => switchTo('login'));

    /* ── Utilitários de campo ── */
    function setError(fieldId, errId, msg) {
        const field = document.getElementById(fieldId).closest('.field');
        const err = document.getElementById(errId);
        if (msg) {
            field.classList.add('invalid');
            field.classList.remove('valid');
            err.textContent = msg;
        } else {
            field.classList.remove('invalid');
            err.textContent = '';
        }
    }
    function setValid(fieldId) {
        document.getElementById(fieldId).closest('.field').classList.add('valid');
    }

    /* ── Máscaras ── */
    function maskCpf(el) {
        el.addEventListener('input', function () {
            let v = this.value.replace(/\D/g, '');
            if (v.length > 3) v = v.slice(0, 3) + '.' + v.slice(3);
            if (v.length > 7) v = v.slice(0, 7) + '.' + v.slice(7);
            if (v.length > 11) v = v.slice(0, 11) + '-' + v.slice(11);
            this.value = v.slice(0, 14);
        });
    }
    maskCpf(document.getElementById('loginCpf'));
    maskCpf(document.getElementById('cadCpf'));

    function maskCep(el) {
        el.addEventListener('input', function () {
            let v = this.value.replace(/\D/g, '');
            if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5);
            this.value = v.slice(0, 9);
        });
    }
    maskCep(document.getElementById('cadCep'));

    /* ── Mostrar/ocultar senha ── */
    function bindPeek(btnId, inputId) {
        const btn = document.getElementById(btnId);
        const input = document.getElementById(inputId);
        btn.addEventListener('click', () => {
            const showing = input.type === 'text';
            input.type = showing ? 'password' : 'text';
            btn.innerHTML = showing
                ? '<i class="fa-regular fa-eye"></i>'
                : '<i class="fa-regular fa-eye-slash"></i>';
        });
    }
    bindPeek('peekLogin', 'loginSenha');
    bindPeek('peekCad', 'cadSenha');

    document.getElementById('loginSenha').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); fazerLogin(); }
    });

    /* ── ViaCEP ── */
    const cadCep = document.getElementById('cadCep');
    const cidadeUf = document.getElementById('cadCidadeUf');
    const cepSpin = document.getElementById('cepSpin');
    let cepValido = false;
    let cepAtual = { cidade: '', estado: '' };

    cadCep.addEventListener('blur', consultarCep);
    cadCep.addEventListener('input', () => {
        cepValido = false;
        cidadeUf.value = '';
        setError('cadCep', 'errCadCep', '');
    });

    async function consultarCep() {
        const cep = cadCep.value.replace(/\D/g, '');
        if (cep.length !== 8) {
            if (cep.length > 0) setError('cadCep', 'errCadCep', 'CEP deve ter 8 dígitos.');
            return;
        }
        cepSpin.classList.add('on');
        try {
            const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            const d = await r.json();
            if (d.erro) {
                setError('cadCep', 'errCadCep', 'CEP não encontrado.');
                cidadeUf.value = '';
                cepValido = false;
                return;
            }
            cepAtual = { cidade: d.localidade, estado: d.uf };
            cidadeUf.value = `${d.localidade} / ${d.uf}`;
            setError('cadCep', 'errCadCep', '');
            setValid('cadCep');
            cepValido = true;
        } catch {
            setError('cadCep', 'errCadCep', 'Não foi possível consultar o CEP agora.');
            cepValido = false;
        } finally {
            cepSpin.classList.remove('on');
        }
    }

    /* ── Login ── */
    async function fazerLogin() {
        const cpf = document.getElementById('loginCpf').value.replace(/\D/g, '');
        const senha = document.getElementById('loginSenha').value;
        const btn = document.getElementById('btnLogin');
        const al = document.getElementById('alLogin');

        al.className = 'alert';
        setError('loginCpf', 'errLoginCpf', '');
        setError('loginSenha', 'errLoginSenha', '');

        let ok = true;
        if (cpf.length !== 11) { setError('loginCpf', 'errLoginCpf', 'Informe um CPF válido.'); ok = false; }
        if (!senha) { setError('loginSenha', 'errLoginSenha', 'Informe sua senha.'); ok = false; }
        if (!ok) return;

        btn.classList.add('loading');
        btn.disabled = true;
        try {
            const r = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cpf, senha })
            });
            const d = await r.json();
            if (!r.ok) {
                al.className = 'alert erro';
                al.textContent = d.erro || 'CPF ou senha inválidos.';
                return;
            }
            localStorage.setItem('as_token', d.token);
            localStorage.setItem('as_refresh', d.refreshToken);
            localStorage.setItem('as_nome', d.nome);
            localStorage.setItem('as_uid', d.usuarioId);
            localStorage.setItem('as_exp', d.expiracao);
            localStorage.setItem('as_cep', d.cep || '');
            window.location.replace('dashboard.html');
        } catch {
            al.className = 'alert erro';
            al.textContent = 'Falha de conexão. Tente novamente.';
        } finally {
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    }

    /* ── Cadastro ── */
    async function cadastrar() {
        const btn = document.getElementById('btnCad');
        const al = document.getElementById('alCad');
        al.className = 'alert';

        const nome = document.getElementById('cadNome').value.trim();
        const cpf = document.getElementById('cadCpf').value.replace(/\D/g, '');
        const senha = document.getElementById('cadSenha').value;
        const cep = document.getElementById('cadCep').value.replace(/\D/g, '');

        ['cadNome', 'cadCpf', 'cadSenha', 'cadCep'].forEach(id => setError(id, 'err' + id[0].toUpperCase() + id.slice(1), ''));

        let ok = true;
        if (nome.length < 3) { setError('cadNome', 'errCadNome', 'Nome muito curto (mínimo 3 caracteres).'); ok = false; }
        if (cpf.length !== 11) { setError('cadCpf', 'errCadCpf', 'CPF deve conter 11 dígitos.'); ok = false; }
        if (senha.length < 6) { setError('cadSenha', 'errCadSenha', 'Senha muito curta (mínimo 6 caracteres).'); ok = false; }
        if (cep.length !== 8) { setError('cadCep', 'errCadCep', 'Informe um CEP válido.'); ok = false; }
        else if (!cepValido) { await consultarCep(); if (!cepValido) { ok = false; } }
        if (!ok) return;

        btn.classList.add('loading');
        btn.disabled = true;
        try {
            const body = {
                nome, cpf, senha, cep,
                cidade: cepAtual.cidade,
                estado: cepAtual.estado
            };
            const r = await fetch('/api/auth/cadastrar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const d = await r.json();
            if (!r.ok) {
                al.className = 'alert erro';
                al.textContent = d.erro || 'Erro ao cadastrar. Tente novamente.';
                return;
            }
            al.className = 'alert ok';
            al.textContent = '✓ Conta criada! Redirecionando para o login...';
            setTimeout(() => switchTo('login'), 1500);
        } catch {
            al.className = 'alert erro';
            al.textContent = 'Falha de conexão. Tente novamente.';
        } finally {
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    }

    document.getElementById('formLogin').addEventListener('submit', e => { e.preventDefault(); fazerLogin(); });
    document.getElementById('formCadastro').addEventListener('submit', e => { e.preventDefault(); cadastrar(); });
})();