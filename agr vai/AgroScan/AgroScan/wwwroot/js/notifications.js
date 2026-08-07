// wwwroot/js/notifications.js — painel de notificações compartilhado
(function () {
    async function carregarAlertas() {
        try {
            const resp = await Auth.fetchAuth('/api/diagnostico/dashboard');
            if (!resp.ok) return [];
            const data = await resp.json();
            return data.alertasCriticos || [];
        } catch { return []; }
    }

    function render(panel, alertas) {
        panel.innerHTML = alertas.length
            ? alertas.map(a => `
                <div class="notify-item">
                    <p class="notify-item-title">${a.titulo}</p>
                    <p class="notify-item-sub">${a.subtitulo}</p>
                </div>`).join('')
            : `<p class="notify-empty">Nenhuma notificação no momento.</p>`;
    }

    async function init() {
        const btn = document.getElementById('notifyBtn');
        const panel = document.getElementById('notifyPanel');
        const dot = document.getElementById('notifyDot');
        if (!btn || !panel) return;

        const alertas = await carregarAlertas();
        if (dot) dot.style.display = alertas.length ? 'block' : 'none';

        btn.addEventListener('click', e => {
            e.stopPropagation();
            render(panel, alertas);
            panel.classList.toggle('open');
        });
        document.addEventListener('click', e => {
            if (!panel.contains(e.target) && e.target !== btn) panel.classList.remove('open');
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();