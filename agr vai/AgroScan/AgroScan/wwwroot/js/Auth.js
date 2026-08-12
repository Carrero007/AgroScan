// ══════════════════════════════════════════════════════════════
// AgroScan — Gerenciador de Autenticação JWT (ÚNICA FONTE)
// Antes duplicado em historico.js, diagnosticar.js, identificar.js,
// hortalicas.js. Inclua este arquivo ANTES dos scripts de página.
// ══════════════════════════════════════════════════════════════
const Auth = (() => {
    const K = { t: 'as_token', r: 'as_refresh', n: 'as_nome', u: 'as_uid', e: 'as_exp', c: 'as_cep' };


    const salvar = d => {
        localStorage.setItem(K.t, d.token);
        localStorage.setItem(K.r, d.refreshToken);
        localStorage.setItem(K.n, d.nome);
        localStorage.setItem(K.u, d.usuarioId);
        localStorage.setItem(K.e, d.expiracao);
        if (d.cep) localStorage.setItem(K.c, d.cep); 
    };
    const limpar = () => Object.values(K).forEach(k => localStorage.removeItem(k));
    const getToken = () => localStorage.getItem(K.t);
    const getUsuarioId = () => localStorage.getItem(K.u);
    const getNome = () => localStorage.getItem(K.n) || 'Produtor';
    const estaLogado = () => !!getToken();
    const getCep = () => localStorage.getItem(K.c) || '';

    const tokenExpirado = () => {
        const exp = localStorage.getItem(K.e);
        return !exp || new Date(exp) < new Date(Date.now() + 60000);
    };

    const renovarToken = async () => {
        const refresh = localStorage.getItem(K.r);
        if (!refresh) return false;
        try {
            const resp = await fetch('/api/auth/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: refresh })
            });
            if (!resp.ok) { limpar(); return false; }
            salvar(await resp.json());
            return true;
        } catch { return false; }
    };

    const fetchAuth = async (url, opts = {}) => {
        if (tokenExpirado()) {
            const ok = await renovarToken();
            if (!ok) { window.location.replace('login.html'); return new Response(null, { status: 401 }); }
        }
        const headers = { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json', ...(opts.headers || {}) };
        if (opts.isMultipart) delete headers['Content-Type'];
        return fetch(url, { ...opts, headers });
    };

    const logout = async () => {
        const refresh = localStorage.getItem(K.r);
        if (refresh) {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: refresh })
            }).catch(() => { });
        }
        limpar();
        window.location.replace('login.html');
    };

    const exigirLogin = () => {
        const p = window.location.pathname.split('/').pop() || '';
        if (!['login.html', 'cadastro.html', 'index.html', ''].includes(p) && !estaLogado()) {
            window.location.replace('login.html');
        }
    };

    return { salvar, limpar, getToken, getUsuarioId, getNome, getCep, estaLogado, fetchAuth, logout, exigirLogin };
})();

Auth.exigirLogin();