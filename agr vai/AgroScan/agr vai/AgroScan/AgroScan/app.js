// Proteção de rota — bloqueia acesso sem autenticação
(function () {
    var page = window.location.pathname.split('/').pop() || '';
    var publicas = ['login.html', 'cadastro.html'];
    if (publicas.indexOf(page) !== -1) return;

    if (localStorage.getItem('authenticated') !== 'true') {
        window.location.replace('login.html');
    }
})();

// Carrega nome do usuário no dashboard
document.addEventListener('DOMContentLoaded', function () {
    var el = document.getElementById('userNome');
    if (el) {
        el.textContent = localStorage.getItem('userNome') || 'Usuário';
    }
});