
if (localStorage.getItem('authenticated') !== 'true') {
    window.location.replace('login.html');
}

function logout() {
    localStorage.clear();
    window.location.href = 'login.html';
}
