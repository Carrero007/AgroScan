
if (!Auth.estaLogado()) {
    window.location.replace('login.html');
}

function logout() {
    Auth.logout(); // revoga o refresh token no servidor e limpa o localStorage
}
