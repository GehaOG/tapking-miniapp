/* ── Telegram WebApp init ─────────────────────────────────── */
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#0d0d1a');
  tg.setBackgroundColor('#0d0d1a');
}

const TG_USER = tg?.initDataUnsafe?.user;
const API_BASE = '';  // same origin; change to full URL if hosting separately

/* ── State ───────────────────────────────────────────────── */
const state = {
  userId:   TG_USER?.id ?? 0,
  username: TG_USER?.first_name ?? TG_USER?.username ?? 'Player',
  score:    0,
  energy:   1000,
  maxEnergy: 1000,
  perTap:   1,
  totalTaps: 0,
  rank:     null,
  pendingTaps: 0,   // batched taps waiting to be sent
  syncTimer: null,
  lastSeen: Date.now(),
};

/* ── DOM refs ────────────────────────────────────────────── */
const scoreEl      = document.getElementById('scoreEl');
const energyBar    = document.getElementById('energyBar');
const energyVal    = document.getElementById('energyVal');
const tapBtn       = document.getElementById('tapBtn');
const tapGlow      = document.getElementById('tapGlow');
const usernameEl   = document.getElementById('usernameEl');
const rankEl       = document.getElementById('rankEl');
const avatarEl     = document.getElementById('avatarEl');
const statTaps     = document.getElementById('statTaps');
const statPerTap   = document.getElementById('statPerTap');
const statRank     = document.getElementById('statRank');
const overlay      = document.getElementById('overlay');
const btnLB        = document.getElementById('btnLeaderboard');
const btnClose     = document.getElementById('btnClose');
const lbList       = document.getElementById('lbList');

/* ── Particle background ─────────────────────────────────── */
(function initParticles() {
  const canvas = document.getElementById('bgCanvas');
  const ctx = canvas.getContext('2d');
  let W, H, particles;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function createParticles() {
    particles = Array.from({ length: 55 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.6 + .4,
      dx: (Math.random() - .5) * .35,
      dy: (Math.random() - .5) * .35,
      alpha: Math.random() * .5 + .1,
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,160,255,${p.alpha})`;
      ctx.fill();
      p.x += p.dx;
      p.y += p.dy;
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;
      if (p.y > H) p.y = 0;
    }
    requestAnimationFrame(draw);
  }

  resize();
  createParticles();
  draw();
  window.addEventListener('resize', () => { resize(); createParticles(); });
})();

/* ── Energy regen loop ───────────────────────────────────── */
setInterval(() => {
  const elapsed = (Date.now() - state.lastSeen) / 1000;
  if (elapsed >= 1 && state.energy < state.maxEnergy) {
    const regen = Math.min(Math.floor(elapsed), state.maxEnergy - state.energy);
    state.energy = Math.min(state.energy + regen, state.maxEnergy);
    state.lastSeen = Date.now();
    renderEnergy();
  }
}, 500);

/* ── Render helpers ──────────────────────────────────────── */
function formatNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

function renderScore() {
  scoreEl.textContent = formatNum(state.score);
  scoreEl.classList.remove('bump');
  void scoreEl.offsetWidth; // reflow
  scoreEl.classList.add('bump');
  statTaps.textContent = formatNum(state.totalTaps);
  statPerTap.textContent = state.perTap;
  statRank.textContent = state.rank ? '#' + state.rank : '—';
  rankEl.textContent = state.rank ? '#' + state.rank : '#—';
}

function renderEnergy() {
  const pct = (state.energy / state.maxEnergy) * 100;
  energyBar.style.width = pct + '%';
  energyBar.classList.toggle('low', pct < 20);
  energyVal.textContent = `${state.energy} / ${state.maxEnergy}`;
  tapBtn.disabled = state.energy < state.perTap;
}

function renderUser() {
  usernameEl.textContent = state.username;
  avatarEl.textContent = state.username.charAt(0).toUpperCase();
  if (TG_USER?.photo_url) {
    const img = document.createElement('img');
    img.src = TG_USER.photo_url;
    img.alt = '';
    avatarEl.textContent = '';
    avatarEl.appendChild(img);
  }
}

/* ── Float score popup ───────────────────────────────────── */
function spawnFloat(x, y, value) {
  const el = document.createElement('div');
  el.className = 'float-score';
  el.textContent = '+' + value;
  el.style.left = (x - 20) + 'px';
  el.style.top  = (y - 30) + 'px';
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

/* ── Pulse ring ──────────────────────────────────────────── */
const tapSection = document.getElementById('tapSection');

function spawnRing() {
  const ring = document.createElement('div');
  ring.className = 'ring';
  tapSection.appendChild(ring);
  ring.addEventListener('animationend', () => ring.remove());
}

/* ── Tap handling ─────────────────────────────────────────── */
function handleTap(clientX, clientY) {
  if (state.energy < state.perTap) {
    tg?.HapticFeedback?.notificationOccurred('error');
    return;
  }

  state.score     += state.perTap;
  state.energy    -= state.perTap;
  state.totalTaps += state.perTap;
  state.pendingTaps += state.perTap;
  state.lastSeen = Date.now();

  renderScore();
  renderEnergy();
  spawnFloat(clientX, clientY, state.perTap);
  spawnRing();
  tg?.HapticFeedback?.impactOccurred('light');

  // Batch-sync after 500ms of inactivity
  clearTimeout(state.syncTimer);
  state.syncTimer = setTimeout(syncTaps, 500);
}

tapBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  tapBtn.classList.add('pressed');
  handleTap(e.clientX, e.clientY);
});

tapBtn.addEventListener('pointerup',    () => tapBtn.classList.remove('pressed'));
tapBtn.addEventListener('pointerleave', () => tapBtn.classList.remove('pressed'));

// Multi-touch: one extra tap per additional touch
tapBtn.addEventListener('touchstart', (e) => {
  if (e.touches.length > 1) {
    for (let i = 1; i < Math.min(e.touches.length, 4); i++) {
      handleTap(e.touches[i].clientX, e.touches[i].clientY);
    }
  }
}, { passive: true });

/* ── API helpers ─────────────────────────────────────────── */
async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(API_BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function syncTaps() {
  if (!state.userId || state.pendingTaps === 0) return;
  const taps = state.pendingTaps;
  state.pendingTaps = 0;

  const data = await apiFetch('/api/tap', {
    method: 'POST',
    body: JSON.stringify({ user_id: state.userId, taps }),
  });

  if (data) {
    state.score  = data.score;
    state.energy = data.energy;
    renderScore();
    renderEnergy();
  }
}

async function loadUser() {
  if (!state.userId) return;
  const data = await apiFetch(`/api/user/${state.userId}`);
  if (data) {
    state.score  = data.score;
    state.energy = data.energy;
    if (data.username && data.username !== `user_${state.userId}`) {
      state.username = data.username;
    }
    renderScore();
    renderEnergy();
    renderUser();
  }

  // Sync username from Telegram
  if (state.userId && state.username) {
    apiFetch(`/api/user/${state.userId}/name`, {
      method: 'PATCH',
      body: JSON.stringify({ username: state.username }),
    });
  }
}

async function loadLeaderboard() {
  lbList.innerHTML = '<li class="lb-loading">Загрузка…</li>';
  const data = await apiFetch('/api/leaderboard');
  if (!data || !data.length) {
    lbList.innerHTML = '<li class="lb-loading">Список пуст</li>';
    return;
  }

  lbList.innerHTML = '';
  data.forEach((entry, i) => {
    const rank = i + 1;
    const isMe = entry.id === state.userId;

    if (isMe) state.rank = rank;

    const li = document.createElement('li');
    li.className = 'lb-item' +
      (isMe ? ' me' : '') +
      (rank === 1 ? ' top1' : rank === 2 ? ' top2' : rank === 3 ? ' top3' : '');

    li.innerHTML = `
      <span class="lb-rank">${rank <= 3 ? ['🥇','🥈','🥉'][rank-1] : rank}</span>
      <div class="lb-avatar">${entry.username.charAt(0).toUpperCase()}</div>
      <span class="lb-name">${escHtml(entry.username)}</span>
      <span class="lb-score">${formatNum(entry.score)} 🪙</span>
    `;
    lbList.appendChild(li);
  });

  renderScore(); // refresh rank display
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── Leaderboard overlay ─────────────────────────────────── */
btnLB.addEventListener('click', () => {
  overlay.classList.add('open');
  overlay.removeAttribute('aria-hidden');
  loadLeaderboard();
});

btnClose.addEventListener('click', closeOverlay);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });

function closeOverlay() {
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
}

/* ── Init ─────────────────────────────────────────────────── */
renderUser();
renderScore();
renderEnergy();
loadUser();

// Sync on page hide (browser tab/app close)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') syncTaps();
});

// Demo mode: no Telegram — use test user_id 1
if (!state.userId) {
  state.userId = 1;
  loadUser();
}
