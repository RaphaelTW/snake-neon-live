/* Snake Neon Live — sem dependências, pronto para jogar offline. */
(() => {
  'use strict';

  const GRID = 26;
  const GOAL = 20;
  const STORAGE_RANK = 'snake-neon-live-ranking-v1';
  const STORAGE_NAME = 'snake-neon-live-name-v1';
  const STORAGE_SOUND = 'snake-neon-live-sound-v1';
  const THEMES = [
    { body: '#9a23e5', edge: '#df78ff', head: '#ff24ae', spots: '#22082e' },
    { body: '#38d7a8', edge: '#a5ffe5', head: '#ffeb5e', spots: '#073529' },
    { body: '#ff6557', edge: '#ffd09f', head: '#ffeb64', spots: '#511523' },
    { body: '#5e75ff', edge: '#b3c8ff', head: '#fb54ec', spots: '#101849' },
  ];
  const FRUIT_ICONS = ['🍎', '🍓', '🍊', '🍇', '🍒'];

  const byId = (id) => document.getElementById(id);
  const canvas = byId('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const overlay = byId('gameOverlay');
  const boardInner = document.querySelector('.board-inner');
  const toastElement = byId('boardToast');
  const soundToggle = byId('soundToggle');
  const helpDialog = byId('helpDialog');
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  const state = {
    phase: 'ready', snake: [], direction: { x: 1, y: 0 }, queuedDirection: { x: 1, y: 0 },
    fruits: [], bombs: [], score: 0, eaten: 0, level: 1, steps: 0,
    theme: 0, fruitStyle: 0, turboUntil: 0, partyUntil: 0,
    nickname: readStore(STORAGE_NAME, 'Jogador'), runId: '', endless: false,
    soundOn: readStore(STORAGE_SOUND, 'true') !== 'false',
    accumulator: 0, lastFrame: 0, lastDraw: 0, results: loadResults(),
  };

  const controller = {
    supported: typeof navigator.getGamepads === 'function',
    index: null,
    previousButtons: new Set(),
    previousDirection: '',
    statusKey: '',
  };

  // Web Audio cria todos os efeitos em tempo real: nenhum MP3 ou biblioteca necessária.
  const audio = {
    context: null,
    unlock() {
      if (!state.soundOn) return false;
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return false;
        if (!this.context) this.context = new AudioContextClass();
        if (this.context.state === 'suspended') this.context.resume().catch(() => {});
        return true;
      } catch { return false; }
    },
    note(freq, delay, duration, volume, wave = 'sine', endFreq = null) {
      if (!state.soundOn || !this.unlock()) return;
      const a = this.context;
      const t = a.currentTime + delay;
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(Math.max(20, freq), t);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
      gain.gain.setValueAtTime(.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), t + Math.min(.012, duration / 3));
      gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
      osc.connect(gain).connect(a.destination);
      osc.start(t);
      osc.stop(t + duration + .02);
    },
    play(name) {
      if (!this.unlock()) return;
      switch (name) {
        case 'move':
          this.note(135, 0, .042, .011, 'triangle', 90);
          break;
        case 'eat':
          this.note(520, 0, .095, .08, 'sine', 700);
          this.note(780, .08, .16, .09, 'triangle', 1020);
          this.note(1175, .15, .15, .055, 'sine', 1370);
          break;
        case 'death':
          this.note(300, 0, .42, .18, 'sawtooth', 65);
          this.note(160, .07, .36, .1, 'square', 45);
          break;
        case 'win':
          [[523, 0, .14], [659, .12, .14], [784, .24, .16], [1047, .38, .47], [784, .38, .47], [1318, .58, .38]].forEach(([f, t, d]) => this.note(f, t, d, .09, 'triangle'));
          break;
        case 'gameover':
          [[392, 0], [311, .2], [247, .42], [147, .67]].forEach(([f, t], i) => {
            this.note(f, t, i === 3 ? .75 : .28, .10, 'triangle', f * .8);
            this.note(f / 2, t, i === 3 ? .7 : .21, .05, 'sawtooth');
          });
          break;
        case 'power':
          this.note(440, 0, .1, .05, 'triangle', 880);
          this.note(900, .08, .17, .06, 'sine', 1250);
          break;
      }
    },
  };

  function readStore(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
  function writeStore(key, value) { try { localStorage.setItem(key, value); } catch { /* navegação privada */ } }
  function loadResults() {
    try {
      const value = JSON.parse(readStore(STORAGE_RANK, '[]'));
      if (!Array.isArray(value)) return [];
      return value.filter((item) => item && typeof item.name === 'string' && Number.isFinite(item.score))
        .slice(0, 100).sort((a, b) => b.score - a.score).slice(0, 8);
    } catch { return []; }
  }
  function recordResult() {
    if (state.score < 1) return;
    state.results = state.results.filter((entry) => entry.id !== state.runId);
    state.results.push({ id: state.runId, name: state.nickname, score: state.score, fruits: state.eaten, date: new Date().toISOString() });
    state.results.sort((a, b) => b.score - a.score || b.fruits - a.fruits);
    state.results = state.results.slice(0, 8);
    writeStore(STORAGE_RANK, JSON.stringify(state.results));
    renderLeaderboard();
  }
  function formatScore(number) { return Math.max(0, number).toString().padStart(4, '0'); }

  function renderLeaderboard() {
    const list = byId('leaderboard');
    list.replaceChildren();
    if (!state.results.length) {
      const empty = document.createElement('div');
      empty.className = 'leaderboard-empty';
      empty.innerHTML = '<span class="trophy" aria-hidden="true">🏆</span><strong>O PÓDIO AINDA ESTÁ VAZIO</strong><p>Jogue uma rodada, conquiste pontos e escreva seu nome na história.</p>';
      list.appendChild(empty);
      return;
    }
    state.results.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'rank-item' + (entry.id === state.runId ? ' is-me' : '');
      const position = document.createElement('span');
      position.className = 'rank-position';
      position.textContent = String(index + 1).padStart(2, '0');
      const avatar = document.createElement('span');
      avatar.className = 'rank-avatar';
      avatar.textContent = (entry.name.trim()[0] || 'J').toLocaleUpperCase('pt-BR');
      const detail = document.createElement('span');
      detail.className = 'rank-info';
      const name = document.createElement('span');
      name.className = 'rank-name';
      name.textContent = entry.name;
      const info = document.createElement('span');
      info.className = 'rank-small';
      info.textContent = `${entry.fruits || 0} frutas coletadas`;
      detail.append(name, info);
      const score = document.createElement('strong');
      score.className = 'rank-score';
      score.textContent = formatScore(entry.score);
      row.append(position, avatar, detail, score);
      list.appendChild(row);
    });
  }

  function demoSnake() {
    const path = [];
    for (let y = 3; y <= 20; y += 2) {
      const forward = Math.floor((y - 3) / 2) % 2 === 0;
      if (forward) for (let x = 3; x <= 22; x++) path.push({ x, y });
      else for (let x = 22; x >= 3; x--) path.push({ x, y });
      if (y + 2 <= 20) path.push({ x: forward ? 22 : 3, y: y + 1 });
    }
    return path.reverse();
  }

  function resetGame(endless = false) {
    const typedName = (byId('playerName').value || state.nickname || 'Jogador').trim().replace(/\s+/g, ' ').slice(0, 16);
    state.nickname = typedName || 'Jogador';
    byId('playerName').value = state.nickname;
    writeStore(STORAGE_NAME, state.nickname);
    state.runId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    state.snake = Array.from({ length: 6 }, (_, i) => ({ x: 13 - i, y: 13 }));
    state.direction = { x: 1, y: 0 };
    state.queuedDirection = { x: 1, y: 0 };
    state.fruits = [];
    state.bombs = [];
    state.score = 0;
    state.eaten = 0;
    state.level = 1;
    state.steps = 0;
    state.accumulator = 0;
    state.turboUntil = 0;
    state.partyUntil = 0;
    state.endless = endless;
    state.phase = 'running';
    byId('pauseButton').innerHTML = '⏸ <span>PAUSAR</span>';
    spawnFruit();
    hideOverlay();
    setStatus('EM JOGO');
    updateHud();
    renderLeaderboard();
    audio.unlock();
    canvas.focus({ preventScroll: true });
  }

  function findEmptyCell() {
    const taken = new Set([...state.snake, ...state.fruits, ...state.bombs].map((p) => `${p.x},${p.y}`));
    const free = [];
    for (let y = 1; y < GRID - 1; y++) {
      for (let x = 1; x < GRID - 1; x++) if (!taken.has(`${x},${y}`)) free.push({ x, y });
    }
    return free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }
  function spawnFruit() {
    const cell = findEmptyCell();
    if (!cell) { endRun('victory', 'Você ocupou toda a arena!'); return false; }
    state.fruits.push(cell);
    return true;
  }

  function move(dx, dy) {
    if (state.phase !== 'running') return;
    if (dx === -state.direction.x && dy === -state.direction.y) return;
    state.queuedDirection = { x: dx, y: dy };
  }
  function step() {
    state.direction = state.queuedDirection;
    const head = state.snake[0];
    const next = { x: head.x + state.direction.x, y: head.y + state.direction.y };
    const fruitIndex = state.fruits.findIndex((fruit) => fruit.x === next.x && fruit.y === next.y);
    const growing = fruitIndex !== -1;
    const body = growing ? state.snake : state.snake.slice(0, -1);
    const wall = next.x < 0 || next.x >= GRID || next.y < 0 || next.y >= GRID;
    const ownBody = body.some((p) => p.x === next.x && p.y === next.y);
    const bomb = state.bombs.some((p) => p.x === next.x && p.y === next.y);
    if (wall || ownBody || bomb) {
      endRun('gameover', wall ? 'Sua cobra bateu na parede.' : bomb ? 'Você encontrou uma bomba!' : 'Sua cobra esbarrou no próprio corpo.');
      return;
    }

    state.snake.unshift(next);
    if (growing) {
      state.fruits.splice(fruitIndex, 1);
      state.eaten++;
      state.score += state.level * 10;
      state.level = 1 + Math.floor(state.eaten / 4);
      audio.play('eat');
      if (!state.fruits.length) spawnFruit();
      if (state.eaten === GOAL && !state.endless) {
        updateHud();
        endRun('victory', 'Você coletou todas as 20 frutas e dominou o labirinto!');
        return;
      }
      if (state.eaten % 4 === 0) showToast('⚡ LEVEL UP!');
      updateHud();
    } else {
      state.snake.pop();
      audio.play('move');
    }
    state.steps++;
    state.bombs = state.bombs.filter((item) => performance.now() < item.expires);
  }

  function endRun(type, message) {
    if (state.phase !== 'running') return;
    state.phase = type;
    state.accumulator = 0;
    state.turboUntil = 0;
    recordResult();
    updateHud();
    setStatus(type === 'victory' ? 'VITÓRIA!' : 'GAME OVER');
    byId('endSymbol').textContent = type === 'victory' ? '🏆' : '💀';
    byId('endKicker').textContent = type === 'victory' ? 'MISSÃO CONCLUÍDA' : 'FIM DA RODADA';
    byId('endTitle').innerHTML = type === 'victory' ? 'VOCÊ <em>VENCEU!</em>' : 'GAME <em>OVER.</em>';
    byId('endDescription').textContent = message;
    byId('finalScore').textContent = formatScore(state.score);
    byId('endlessButton').hidden = type !== 'victory';
    showOverlay('finished');
    if (type === 'victory') { audio.play('win'); confetti(55); }
    else {
      audio.play('death');
      boardInner.classList.remove('shake');
      void boardInner.offsetWidth;
      boardInner.classList.add('shake');
      window.setTimeout(() => { if (state.phase === 'gameover') audio.play('gameover'); }, 460);
    }
  }

  function setStatus(message) { byId('statusLabel').textContent = message; }
  function updateHud() {
    const topScore = Math.max(state.score, ...state.results.map((r) => r.score), 0);
    byId('scoreValue').textContent = formatScore(state.score);
    byId('bestValue').textContent = formatScore(topScore);
    byId('fruitsValue').textContent = String(state.eaten).padStart(2, '0');
    byId('levelTicket').textContent = String(state.level).padStart(2, '0');
    const progress = Math.min(100, Math.round(state.eaten / GOAL * 100));
    byId('progressText').textContent = `${progress}%`;
    byId('progressFill').style.width = `${progress}%`;
    byId('modeIndicator').textContent = state.endless ? 'MODO INFINITO' : 'MODO CLÁSSICO';
    byId('goalText').textContent = state.endless ? `${state.eaten} FRUTAS COLETADAS` : 'OBJETIVO: 20 FRUTAS';
  }
  function showOverlay(screen) {
    overlay.hidden = false;
    document.querySelectorAll('.overlay-panel').forEach((element) => { element.hidden = element.dataset.screen !== screen; });
  }
  function hideOverlay() { overlay.hidden = true; }
  function togglePause() {
    if (state.phase === 'running') {
      state.phase = 'paused';
      state.accumulator = 0;
      showOverlay('paused');
      setStatus('PAUSADO');
      byId('pauseButton').innerHTML = '▶ <span>CONTINUAR</span>';
    } else if (state.phase === 'paused') {
      state.phase = 'running';
      state.accumulator = 0;
      hideOverlay();
      setStatus('EM JOGO');
      byId('pauseButton').innerHTML = '⏸ <span>PAUSAR</span>';
      canvas.focus({ preventScroll: true });
    } else if (state.phase === 'ready') {
      showToast('▶ COMECE UMA PARTIDA!');
    }
  }
  let toastTimeout;
  function showToast(message) {
    toastElement.textContent = message;
    toastElement.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toastElement.classList.remove('show'), 1600);
  }
  function confetti(count) {
    if (motionQuery.matches) return;
    const layer = byId('particlesLayer');
    const colors = ['#ff4dbe', '#a65cff', '#c2ff5a', '#5fe5ff', '#fce468'];
    for (let index = 0; index < count; index++) {
      const piece = document.createElement('span');
      piece.className = 'confetti';
      piece.style.setProperty('--x', `${Math.random() * 100}%`);
      piece.style.setProperty('--s', `${4 + Math.random() * 6}px`);
      piece.style.setProperty('--c', colors[index % colors.length]);
      piece.style.setProperty('--r', `${Math.random() * 360}deg`);
      piece.style.setProperty('--duration', `${1.2 + Math.random() * 2.1}s`);
      piece.style.animationDelay = `${Math.random() * .55}s`;
      layer.appendChild(piece);
      piece.addEventListener('animationend', () => piece.remove(), { once: true });
      setTimeout(() => piece.remove(), 4500);
    }
  }
  function activatePower(power) {
    if (state.phase !== 'running') { showToast('▶ COMECE O JOGO PRIMEIRO!'); return; }
    switch (power) {
      case 'snake':
        state.theme = (state.theme + 1) % THEMES.length;
        showToast('⭐ NOVA COR DA COBRA!');
        break;
      case 'fruit':
        state.fruitStyle = (state.fruitStyle + 1) % FRUIT_ICONS.length;
        showToast('🍓 FRUTA TRANSFORMADA!');
        break;
      case 'apples': {
        let added = 0;
        for (let i = 0; i < 5; i++) if (spawnFruit()) added++;
        showToast(`🍎 +${added} FRUTAS NA ARENA!`);
        break;
      }
      case 'turbo':
        state.turboUntil = performance.now() + 6500;
        showToast('⚡ TURBO ATIVADO!');
        break;
      case 'party':
        state.partyUntil = performance.now() + 5500;
        confetti(34);
        showToast('🎉 É FESTA!');
        break;
      case 'bomb': {
        const empty = findEmptyCell();
        if (empty) state.bombs.push({ ...empty, expires: performance.now() + 9500 });
        showToast('💣 CUIDADO COM A BOMBA!');
        break;
      }
      case 'rip':
        if (window.confirm('Encerrar esta rodada e mostrar Game Over?')) endRun('gameover', 'A live foi encerrada pelo jogador.');
        return;
      default: return;
    }
    audio.play('power');
  }

  // O tabuleiro desenha uma cobra tubular roxa com pintinhas, lembrando a referência.
  function drawBackground(timestamp) {
    ctx.fillStyle = '#020204';
    ctx.fillRect(0, 0, GRID, GRID);
    ctx.fillStyle = '#1b0d1f';
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      const noise = (x * 31 + y * 17 + x * y * 7) % 23;
      if (noise < 3) { ctx.globalAlpha = .18 + .05 * Math.sin(timestamp / 1100 + x); ctx.fillRect(x + .5, y + .5, .07, .07); }
    }
    ctx.globalAlpha = 1;
    const fade = ctx.createRadialGradient(13, 13, 3, 13, 13, 23);
    fade.addColorStop(0, '#51145b0b');
    fade.addColorStop(1, '#00000065');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, GRID, GRID);
    ctx.lineWidth = .028;
    ctx.strokeStyle = '#642c650e';
    ctx.beginPath();
    for (let i = 1; i < GRID; i++) { ctx.moveTo(i, 0); ctx.lineTo(i, GRID); ctx.moveTo(0, i); ctx.lineTo(GRID, i); }
    ctx.stroke();
  }
  function drawSnake(timestamp) {
    const snake = state.snake;
    if (!snake.length) return;
    const colors = THEMES[state.theme];
    const points = snake.slice().reverse();
    const paintPath = () => {
      ctx.beginPath();
      ctx.moveTo(points[0].x + .5, points[0].y + .5);
      for (let index = 1; index < points.length; index++) ctx.lineTo(points[index].x + .5, points[index].y + .5);
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    paintPath();
    ctx.strokeStyle = '#100314';
    ctx.lineWidth = 1.04;
    ctx.stroke();
    paintPath();
    ctx.strokeStyle = colors.body;
    ctx.lineWidth = .89;
    ctx.shadowColor = colors.body;
    ctx.shadowBlur = 9;
    ctx.stroke();
    ctx.shadowBlur = 0;
    paintPath();
    ctx.strokeStyle = colors.edge;
    ctx.globalAlpha = .22;
    ctx.lineWidth = .48;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Manchas pretas distribuídas sobre todo o corpo, como as escamas da imagem.
    for (let index = 1; index < snake.length; index++) {
      const segment = snake[index];
      for (let spot = 0; spot < 5; spot++) {
        const sx = (Math.sin(index * 13.71 + spot * 8.92) * .27);
        const sy = (Math.cos(index * 9.39 + spot * 11.1) * .25);
        const radius = .065 + ((index + spot * 3) % 4) * .014;
        ctx.beginPath();
        ctx.arc(segment.x + .5 + sx, segment.y + .5 + sy, radius, 0, Math.PI * 2);
        ctx.fillStyle = colors.spots;
        ctx.globalAlpha = .87;
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    const head = snake[0];
    const x = head.x + .5;
    const y = head.y + .5;
    ctx.shadowColor = colors.head;
    ctx.shadowBlur = 18 + 3 * Math.sin(timestamp / 180);
    ctx.fillStyle = colors.head;
    ctx.beginPath();
    ctx.arc(x, y, .5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    const facing = state.phase === 'ready' ? { x: 1, y: 0 } : state.direction;
    const side = { x: -facing.y, y: facing.x };
    const eye1 = { x: x + facing.x * .20 + side.x * .20, y: y + facing.y * .20 + side.y * .20 };
    const eye2 = { x: x + facing.x * .20 - side.x * .20, y: y + facing.y * .20 - side.y * .20 };
    for (const eye of [eye1, eye2]) {
      ctx.fillStyle = '#22041e';
      ctx.beginPath(); ctx.arc(eye.x, eye.y, .115, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(eye.x - .025, eye.y - .031, .028, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ff9ce7';
    ctx.beginPath(); ctx.arc(x + facing.x * .42, y + facing.y * .42, .055, 0, Math.PI * 2); ctx.fill();
  }
  function drawFruits(timestamp) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '1.08px system-ui, Apple Color Emoji, Segoe UI Emoji';
    for (const fruit of state.fruits) {
      const bounce = Math.sin(timestamp / 210 + fruit.x * 3) * .052;
      ctx.shadowColor = '#ff365a';
      ctx.shadowBlur = 14;
      ctx.fillText(FRUIT_ICONS[state.fruitStyle], fruit.x + .5, fruit.y + .52 + bounce);
      ctx.shadowBlur = 0;
    }
  }
  function drawBombs(timestamp) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '1.04px system-ui, Apple Color Emoji, Segoe UI Emoji';
    for (const bomb of state.bombs) {
      ctx.shadowColor = '#ff783c';
      ctx.shadowBlur = 10 + 8 * Math.abs(Math.sin(timestamp / 110));
      ctx.fillText('💣', bomb.x + .5, bomb.y + .5);
      ctx.shadowBlur = 0;
    }
  }
  function render(timestamp) {
    if (!ctx || timestamp - state.lastDraw < 30) return;
    state.lastDraw = timestamp;
    const pixelSize = canvas.width / GRID;
    ctx.setTransform(pixelSize, 0, 0, pixelSize, 0, 0);
    drawBackground(timestamp);
    drawFruits(timestamp);
    drawBombs(timestamp);
    drawSnake(timestamp);
    if (state.turboUntil > timestamp) {
      ctx.strokeStyle = '#f9e6609d';
      ctx.lineWidth = .18;
      ctx.strokeRect(.09, .09, GRID - .18, GRID - .18);
    }
  }
  function frame(timestamp) {
    if (!state.lastFrame) state.lastFrame = timestamp;
    const delta = Math.min(timestamp - state.lastFrame, 90);
    state.lastFrame = timestamp;
    pollGamepad();
    if (state.phase === 'running') {
      state.accumulator += delta;
      let interval = Math.max(75, 165 - (state.level - 1) * 10);
      if (timestamp < state.turboUntil) interval *= .63;
      while (state.accumulator >= interval && state.phase === 'running') {
        state.accumulator -= interval;
        step();
      }
    }
    render(timestamp);
    requestAnimationFrame(frame);
  }
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const side = Math.max(200, Math.round(rect.width * Math.min(window.devicePixelRatio || 1, 2)));
    if (canvas.width !== side || canvas.height !== side) { canvas.width = side; canvas.height = side; state.lastDraw = 0; }
  }

  // Gamepad API: funciona com controles reconhecidos pelo navegador, seja USB ou Bluetooth.
  // O pareamento Bluetooth é feito nas configurações do sistema operacional.
  function updateControllerIndicator(gamepad = null) {
    const statusKey = gamepad ? `${gamepad.index}:${gamepad.id}` : controller.supported ? 'waiting' : 'unsupported';
    if (controller.statusKey === statusKey) return;
    controller.statusKey = statusKey;
    const row = document.querySelector('.controller-status');
    const badge = byId('controllerBadge');
    const title = byId('controllerName');
    const hint = byId('controllerHint');
    row.classList.toggle('is-connected', !!gamepad);
    row.classList.toggle('is-unsupported', !controller.supported);
    if (!controller.supported) {
      badge.textContent = '🎮 INDISPONÍVEL';
      title.textContent = 'Controle não suportado neste navegador';
      hint.textContent = 'Continue usando teclado, setas na tela ou gestos de deslizar.';
    } else if (gamepad) {
      badge.textContent = '🎮 CONECTADO';
      title.textContent = (gamepad.id || `Controle ${gamepad.index + 1}`).slice(0, 60);
      hint.textContent = 'Direcional ou analógico esquerdo: mover • A: começar/retomar • START: pausar';
    } else {
      badge.textContent = '🎮 AGUARDANDO';
      title.textContent = 'Controle USB / Bluetooth';
      hint.textContent = 'Conecte pelo PC ou pareie no Bluetooth do celular, depois pressione um botão.';
    }
  }

  function pressedButton(gamepad, index) {
    const button = gamepad.buttons?.[index];
    return !!button && (button.pressed === true || button.value > 0.55);
  }

  function handleGamepadButton(index) {
    if (helpDialog.open) {
      if (index === 0 || index === 9) helpDialog.close();
      return;
    }
    if (index === 0) {
      if (state.phase === 'ready' || state.phase === 'gameover' || state.phase === 'victory') resetGame();
      else if (state.phase === 'paused') togglePause();
    } else if (index === 9) {
      if (state.phase === 'ready' || state.phase === 'gameover' || state.phase === 'victory') resetGame();
      else togglePause();
    }
  }

  function readGamepadDirection(gamepad) {
    // Mapeamento padrão de Xbox/PlayStation/Switch: D-pad botões 12-15.
    if (pressedButton(gamepad, 12)) return [0, -1];
    if (pressedButton(gamepad, 13)) return [0, 1];
    if (pressedButton(gamepad, 14)) return [-1, 0];
    if (pressedButton(gamepad, 15)) return [1, 0];
    // Analógico esquerdo, com zona morta para evitar drift involuntário.
    const horizontal = Number(gamepad.axes?.[0]) || 0;
    const vertical = Number(gamepad.axes?.[1]) || 0;
    if (Math.max(Math.abs(horizontal), Math.abs(vertical)) < 0.48) return null;
    if (Math.abs(horizontal) > Math.abs(vertical)) return [Math.sign(horizontal), 0];
    return [0, Math.sign(vertical)];
  }

  function pollGamepad() {
    if (!controller.supported || document.hidden) return;
    let pads;
    try { pads = navigator.getGamepads(); }
    catch { return; }
    if (!pads) return;
    let gamepad = controller.index === null ? null : pads[controller.index];
    if (!gamepad?.connected) gamepad = Array.from(pads).find((pad) => pad?.connected) || null;
    if (!gamepad) {
      controller.index = null;
      controller.previousButtons.clear();
      controller.previousDirection = '';
      updateControllerIndicator();
      return;
    }
    if (controller.index !== gamepad.index) {
      controller.index = gamepad.index;
      controller.previousButtons.clear();
      controller.previousDirection = '';
    }
    updateControllerIndicator(gamepad);

    // Botões são acionados apenas na transição solto -> pressionado.
    const currentButtons = new Set();
    for (const index of [0, 9]) {
      if (!pressedButton(gamepad, index)) continue;
      currentButtons.add(index);
      if (!controller.previousButtons.has(index)) handleGamepadButton(index);
    }
    controller.previousButtons = currentButtons;

    const direction = readGamepadDirection(gamepad);
    const directionKey = direction ? `${direction[0]},${direction[1]}` : '';
    if (directionKey !== controller.previousDirection) {
      controller.previousDirection = directionKey;
      if (direction) move(...direction);
    }
  }

  window.addEventListener('gamepadconnected', (event) => {
    controller.index = event.gamepad.index;
    controller.previousButtons.clear();
    controller.previousDirection = '';
    updateControllerIndicator(event.gamepad);
    showToast('🎮 CONTROLE CONECTADO!');
  });
  window.addEventListener('gamepaddisconnected', (event) => {
    if (controller.index !== event.gamepad.index) return;
    controller.index = null;
    controller.previousButtons.clear();
    controller.previousDirection = '';
    updateControllerIndicator();
    if (state.phase === 'running') togglePause();
    showToast('🎮 CONTROLE DESCONECTADO');
  });

  // Ao alternar para as configurações Bluetooth do celular, a rodada não é perdida.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.phase === 'running') togglePause();
  });

  // Entrada por teclado, swipe e controle digital para telas pequenas.
  const directions = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
  document.addEventListener('keydown', (event) => {
    if (helpDialog.open) { if (event.key === 'Escape') helpDialog.close(); return; }
    if (document.activeElement === byId('playerName')) {
      if (event.key === 'Enter' && state.phase === 'ready') { event.preventDefault(); resetGame(); }
      return;
    }
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (directions[key]) { event.preventDefault(); move(...directions[key]); return; }
    if (event.code === 'Space' || key === 'p') { event.preventDefault(); togglePause(); }
    else if (key === 'r') resetGame();
    else if (key === 'm') toggleSound();
  });
  let swipeStart = null;
  canvas.addEventListener('pointerdown', (event) => { swipeStart = { x: event.clientX, y: event.clientY }; });
  canvas.addEventListener('pointerup', (event) => {
    if (!swipeStart) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) move(Math.sign(dx), 0);
    else move(0, Math.sign(dy));
  });
  canvas.addEventListener('pointercancel', () => { swipeStart = null; });
  document.querySelectorAll('[data-direction]').forEach((button) => button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const direction = button.dataset.direction;
    const map = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    move(...map[direction]);
  }));
  document.querySelectorAll('[data-power]').forEach((button) => button.addEventListener('click', () => activatePower(button.dataset.power)));
  document.querySelectorAll('[data-sound]').forEach((button) => button.addEventListener('click', () => {
    if (!state.soundOn) { showToast('🔇 ATIVE O ÁUDIO PRIMEIRO'); return; }
    audio.play(button.dataset.sound);
  }));

  function toggleSound() {
    state.soundOn = !state.soundOn;
    writeStore(STORAGE_SOUND, String(state.soundOn));
    renderSound();
    if (state.soundOn) audio.play('power');
  }
  function renderSound() {
    byId('soundToggleIcon').textContent = state.soundOn ? '♫' : '✕';
    soundToggle.setAttribute('aria-label', state.soundOn ? 'Desativar som' : 'Ativar som');
    soundToggle.title = state.soundOn ? 'Desativar som (M)' : 'Ativar som (M)';
    const chip = document.querySelector('.mini-chip-sound');
    chip.textContent = state.soundOn ? 'SFX ON' : 'SFX OFF';
    chip.style.color = state.soundOn ? '' : '#ff9caa';
  }

  byId('startButton').addEventListener('click', () => resetGame());
  byId('restartButton').addEventListener('click', () => resetGame());
  byId('newGameButton').addEventListener('click', () => resetGame());
  byId('resumeButton').addEventListener('click', () => togglePause());
  byId('pauseButton').addEventListener('click', () => togglePause());
  byId('endlessButton').addEventListener('click', () => {
    if (state.phase !== 'victory') return;
    state.endless = true;
    state.phase = 'running';
    state.accumulator = 0;
    setStatus('MODO INFINITO');
    hideOverlay();
    updateHud();
    canvas.focus({ preventScroll: true });
  });
  soundToggle.addEventListener('click', toggleSound);
  byId('helpToggle').addEventListener('click', () => helpDialog.showModal());
  byId('helpClose').addEventListener('click', () => helpDialog.close());
  byId('helpOk').addEventListener('click', () => helpDialog.close());
  helpDialog.addEventListener('click', (event) => { if (event.target === helpDialog) helpDialog.close(); });

  byId('playerName').value = state.nickname;
  state.snake = demoSnake();
  renderLeaderboard();
  renderSound();
  updateControllerIndicator();
  updateHud();
  resizeCanvas();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resizeCanvas).observe(canvas);
  else window.addEventListener('resize', resizeCanvas);
  requestAnimationFrame(frame);
})();
