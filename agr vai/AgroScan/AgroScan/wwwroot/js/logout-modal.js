
(function () {
    'use strict';

    var overlay = document.getElementById('aslogoutOverlay');
    if (!overlay) return;

    var btnCancel = document.getElementById('aslogoutCancel');
    var btnConfirm = document.getElementById('aslogoutConfirm');

    function openModal() {
        overlay.hidden = false;
        requestAnimationFrame(function () { overlay.classList.add('is-open'); });
        document.addEventListener('keydown', onKeydown);
    }

    function closeModal() {
        overlay.classList.remove('is-open');
        document.removeEventListener('keydown', onKeydown);
        setTimeout(function () { overlay.hidden = true; }, 200);
    }

    function onKeydown(e) {
        if (e.key === 'Escape') closeModal();
    }

    async function confirmarSaida() {
        btnConfirm.disabled = true;
        btnConfirm.textContent = 'Saindo...';
        await Auth.logout(); // revoga o refresh token no servidor, limpa localStorage e redireciona
    }

    document.querySelectorAll('[data-logout-trigger]').forEach(function (el) {
        el.addEventListener('click', function (e) {
            e.preventDefault();
            openModal();
        });
    });

    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal();
    });
    btnCancel.addEventListener('click', closeModal);
    btnConfirm.addEventListener('click', confirmarSaida);
})();