// 
// AgroScan Gerenciador de Autenticação JWT
// Responsável por: armazenar tokens, injetar Bearer em requests,
// renovar AccessToken automaticamente quando expirado.
// 

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