// ──────────────── THEME ────────────────
const root = document.documentElement;
const iconMoon = document.getElementById('icon-moon');
const iconSun = document.getElementById('icon-sun');

function getStoredTheme() {
  const stored = localStorage.getItem('agroscan-theme');
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  root.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('agroscan-theme', theme);
  if (theme === 'dark') {
    iconMoon.style.display = 'none';
    iconSun.style.display = '';
  } else {
    iconMoon.style.display = '';
    iconSun.style.display = 'none';
  }
}

applyTheme(getStoredTheme());

document.getElementById('theme-toggle').addEventListener('click', () => {
  const current = root.classList.contains('dark') ? 'dark' : 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});


// ──────────────── NAVBAR SCROLL ────────────────
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });


// ──────────────── MOBILE MENU ────────────────
const drawer = document.getElementById('mobile-drawer');
const menuToggle = document.getElementById('menu-toggle');
const iconMenu = document.getElementById('icon-menu');
const iconX = document.getElementById('icon-x');
let menuOpen = false;

function openMobileMenu() {
  menuOpen = true;
  drawer.classList.add('open');
  navbar.classList.add('menu-open');
  iconMenu.style.display = 'none';
  iconX.style.display = '';
  menuToggle.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
}

function closeMobileMenu() {
  menuOpen = false;
  drawer.classList.remove('open');
  navbar.classList.remove('menu-open');
  iconMenu.style.display = '';
  iconX.style.display = 'none';
  menuToggle.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

menuToggle.addEventListener('click', () => {
  menuOpen ? closeMobileMenu() : openMobileMenu();
});


// ──────────────── TYPEWRITER ────────────────
const phrases = [
  'Identificando míldio em folhas de tomate...',
  'Detectando oídio em pepino...',
  'Analisando mancha-bacteriana em pimentão...',
  'Reconhecendo pulgões em alface...',
  'Sugerindo calda bordalesa para a horta...',
];

const typewriterEl = document.getElementById('typewriter');
let twPIdx = 0;
let twCIdx = 0;
let twDeleting = false;

function tick() {
  const phrase = phrases[twPIdx];
  if (!twDeleting) {
    typewriterEl.textContent = phrase.slice(0, twCIdx + 1);
    twCIdx++;
    if (twCIdx === phrase.length) {
      setTimeout(() => { twDeleting = true; tick(); }, 1400);
      return;
    }
    setTimeout(tick, 55);
  } else {
    typewriterEl.textContent = phrase.slice(0, twCIdx - 1);
    twCIdx--;
    if (twCIdx === 0) {
      twDeleting = false;
      twPIdx = (twPIdx + 1) % phrases.length;
      setTimeout(tick, 55);
      return;
    }
    setTimeout(tick, 30);
  }
}
tick();


// ──────────────── ACCORDION ────────────────
function closeAllAcc() {
  document.querySelectorAll('.acc-item').forEach(i => {
    i.classList.remove('open');
    i.querySelector('.acc-trigger').setAttribute('aria-expanded', 'false');
  });
}

document.querySelectorAll('.acc-item').forEach(item => {
  const trigger = item.querySelector('.acc-trigger');
  trigger.addEventListener('click', () => {
    const isOpen = item.classList.contains('open');
    closeAllAcc();
    if (!isOpen) {
      item.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
    }
  });
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.acc-item')) closeAllAcc();
});


// ──────────────── YEAR IN FOOTER ────────────────
document.getElementById('year').textContent = new Date().getFullYear();


// ──────────────── CARD FANCY MOUSE GLOW (bonus) ────────────────
// Tracks mouse position for the radial gradient highlight effect
document.querySelectorAll('.card-fancy').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty('--mx', `${x}%`);
    card.style.setProperty('--my', `${y}%`);
  });
});