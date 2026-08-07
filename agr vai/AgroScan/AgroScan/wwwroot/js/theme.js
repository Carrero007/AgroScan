// wwwroot/js/theme.js — tema global, único ponto de verdade
(function () {
    const KEY = 'as_theme'; // 'dark' | 'light'
    const getTheme = () => localStorage.getItem(KEY) || 'dark';

    function applyTheme(theme) {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        const sun = document.getElementById('sunIcon');
        const moon = document.getElementById('moonIcon');
        if (sun && moon) {
            sun.style.display = theme === 'dark' ? 'block' : 'none';
            moon.style.display = theme === 'dark' ? 'none' : 'block';
        }
    }

    applyTheme(getTheme()); // aplica imediatamente, antes do CSS pintar

    function wireToggle() {
        const btn = document.getElementById('themeBtn');
        if (!btn || btn.dataset.wired) return;
        btn.dataset.wired = '1';
        btn.addEventListener('click', () => {
            const novo = getTheme() === 'dark' ? 'light' : 'dark';
            localStorage.setItem(KEY, novo);
            applyTheme(novo);
        });
    }

    // Sincroniza instantaneamente entre abas abertas ao mesmo tempo
    window.addEventListener('storage', e => { if (e.key === KEY) applyTheme(getTheme()); });

    document.addEventListener('DOMContentLoaded', wireToggle);
    window.AgroTheme = { getTheme, applyTheme };
})();