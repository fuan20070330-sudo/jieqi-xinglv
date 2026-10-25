/* 节气行旅 · 四季探索版 */
(function () {
  'use strict';

  const DATA = window.JOURNEY_DATA;
  const SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter'];
  const TERMS = DATA.terms;
  const TERM_BY_ID = Object.fromEntries(TERMS.map(term => [term.id, term]));
  const SAVE_KEY = 'jieqi-journey-save-v2';
  const WORLD = { width: 1900, height: 1200 };
  const MINI = { width: 960, height: 560 };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const TAU = Math.PI * 2;

  const state = {
    mode: 'menu',
    season: 'spring',
    player: { x: 920, y: 620, facing: 'down', moving: false, step: 0 },
    camera: { x: 0, y: 0 },
    keys: {},
    joystick: { x: 0, y: 0 },
    nearTerm: null,
    save: loadSave(),
    sounds: true,
    audio: null,
    lastTime: 0,
    menuTime: 0,
    weatherTime: 0,
    decorations: {},
    mini: null,
    toastTimer: null,
    miniFrame: 0,
    worldFrame: 0
  };

  const els = {};

  function defaultSave() {
    return {
      version: DATA.version,
      stations: {},
      currentSeason: 'spring',
      chapterCelebrated: {},
      sound: true,
      updatedAt: new Date().toISOString()
    };
  }

  function loadSave() {
    const fallback = defaultSave();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return {
        ...fallback,
        ...parsed,
        stations: parsed.stations && typeof parsed.stations === 'object' ? parsed.stations : {},
        chapterCelebrated: parsed.chapterCelebrated && typeof parsed.chapterCelebrated === 'object' ? parsed.chapterCelebrated : {}
      };
    } catch (error) {
      return fallback;
    }
  }

  function persist() {
    state.save.updatedAt = new Date().toISOString();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state.save)); } catch (error) { /* local file mode may restrict storage */ }
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6D2B79F5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seasonTerms(season) {
    return DATA.seasons[season].terms.map(id => TERM_BY_ID[id]);
  }

  function completedCount(season) {
    return seasonTerms(season).filter(term => state.save.stations[term.id]?.complete).length;
  }

  function seasonComplete(season) {
    return completedCount(season) === 6;
  }

  function seasonUnlocked(season) {
    const index = SEASON_ORDER.indexOf(season);
    return index === 0 || seasonComplete(SEASON_ORDER[index - 1]);
  }

  function firstUnlockedSeason() {
    return SEASON_ORDER.find(season => !seasonComplete(season) && seasonUnlocked(season)) || 'winter';
  }

  function totalStars() {
    return Object.values(state.save.stations).reduce((sum, record) => sum + (Number(record.stars) || 0), 0);
  }

  function allSeasonsComplete() {
    return SEASON_ORDER.every(seasonComplete);
  }

  function stationRecord(termId) {
    return state.save.stations[termId];
  }

  function cacheElements() {
    Object.assign(els, {
      shell: $('#gameShell'),
      canvas: $('#gameCanvas'),
      hud: $('#gameHud'),
      menu: $('#menu'),
      menuBtn: $('#menuBtn'),
      startBtn: $('#startBtn'),
      continueBtn: $('#continueBtn'),
      menuSeasons: $('#menuSeasons'),
      seasonTabs: $('#seasonTabs'),
      stationCount: $('#stationCount'),
      starCount: $('#starCount'),
      soundBtn: $('#soundBtn'),
      weatherChip: $('#weatherChip'),
      weatherLabel: $('#weatherLabel'),
      worldHelp: $('#worldHelp'),
      prompt: $('#interactionPrompt'),
      nearStationName: $('#nearStationName'),
      touchControls: $('#touchControls'),
      joystick: $('#joystick'),
      joystickStick: $('#joystickStick'),
      actionBtn: $('#actionBtn'),
      miniOverlay: $('#miniOverlay'),
      miniCanvas: $('#miniCanvas'),
      miniSeason: $('#miniSeason'),
      miniTitle: $('#miniTitle'),
      miniCustom: $('#miniCustom'),
      miniHint: $('#miniHint'),
      miniProgress: $('#miniProgress'),
      miniClose: $('#miniClose'),
      chapterOverlay: $('#chapterOverlay'),
      chapterSeal: $('#chapterSeal'),
      chapterKicker: $('#chapterKicker'),
      chapterTitle: $('#chapterTitle'),
      chapterStars: $('#chapterStars'),
      chapterCopy: $('#chapterCopy'),
      nextSeasonBtn: $('#nextSeasonBtn'),
      staySeasonBtn: $('#staySeasonBtn'),
      finalOverlay: $('#finalOverlay'),
      finalScore: $('#finalScore'),
      replayBtn: $('#replayBtn'),
      toast: $('#toast')
    });
  }

  function setupDecorations() {
    SEASON_ORDER.forEach((season, seasonIndex) => {
      const random = seededRandom(20261025 + seasonIndex * 7919);
      const items = [];
      for (let i = 0; i < 58; i += 1) {
        items.push({
          type: i < 24 ? 'tree' : i < 44 ? 'flower' : i < 52 ? 'grass' : 'stone',
          x: 90 + random() * (WORLD.width - 180),
          y: 90 + random() * (WORLD.height - 180),
          size: .65 + random() * .75,
          tone: random(),
          phase: random() * TAU
        });
      }
      state.decorations[season] = items;
    });
  }

  function setupCanvas() {
    resizeWorldCanvas();
    window.addEventListener('resize', () => {
      resizeWorldCanvas();
      if (state.mini) resizeMiniCanvas();
    });
  }

  function resizeWorldCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = els.canvas.getBoundingClientRect();
    els.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    els.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    els.canvas.dataset.dpr = String(dpr);
  }

  function worldContext() {
    const ctx = els.canvas.getContext('2d');
    const dpr = Number(els.canvas.dataset.dpr || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function setSeasonTheme(season) {
    const meta = DATA.seasons[season];
    els.shell.classList.remove('season-spring', 'season-summer', 'season-autumn', 'season-winter');
    els.shell.classList.add(`season-${season}`);
    document.documentElement.style.setProperty('--season', meta.color);
    document.documentElement.style.setProperty('--season-bright', meta.bright);
    document.documentElement.style.setProperty('--season-pale', meta.pale);
    document.documentElement.style.setProperty('--season-ink', meta.ink);
    els.weatherLabel.textContent = `${meta.weatherLabel} · ${meta.motto}`;
  }

  function renderHUD() {
    const meta = DATA.seasons[state.season];
    els.seasonTabs.innerHTML = SEASON_ORDER.map(season => {
      const item = DATA.seasons[season];
      const unlocked = seasonUnlocked(season);
      const active = season === state.season;
      return `<button class="season-tab ${active ? 'is-active' : ''}" data-season="${season}" style="--tab-color:${item.color}" ${unlocked ? '' : 'disabled'} aria-pressed="${active}">
        <span></span>${item.name} <small>${completedCount(season)}/6</small>
      </button>`;
    }).join('');
    els.stationCount.textContent = `${completedCount(state.season)} / 6`;
    els.starCount.textContent = `★ ${totalStars()}`;
    els.weatherChip.hidden = state.mode === 'menu';
    els.worldHelp.hidden = state.mode !== 'world';
    setSeasonTheme(state.season);
    renderMenuSeasons();
    updateSoundButton();
  }

  function renderMenuSeasons() {
    if (!els.menuSeasons) return;
    els.menuSeasons.innerHTML = SEASON_ORDER.map(season => {
      const item = DATA.seasons[season];
      const unlocked = seasonUnlocked(season);
      return `<button class="menu-season ${season === state.season ? 'is-current' : ''}" data-menu-season="${season}" style="--season-color:${item.color}" data-count="${completedCount(season)}/6" ${unlocked ? '' : 'disabled'}>
        <strong>${item.name}</strong><small>${unlocked ? `${completedCount(season)} / 6 节气碑` : '完成上一季解锁'}</small>
      </button>`;
    }).join('');
  }

  function updateSoundButton() {
    const enabled = Boolean(state.save.sound);
    els.soundBtn.classList.toggle('is-muted', !enabled);
    els.soundBtn.setAttribute('aria-pressed', String(enabled));
    els.soundBtn.setAttribute('aria-label', enabled ? '关闭声音' : '开启声音');
  }

  function enterWorld(season = state.season) {
    if (!seasonUnlocked(season)) {
      showToast('完成上一季的全部 6 个节气碑，才能前往下一季。');
      return;
    }
    state.season = season;
    state.mode = 'world';
    const meta = DATA.seasons[season];
    state.player = { x: meta.start.x, y: meta.start.y, facing: 'down', moving: false, step: 0 };
    state.nearTerm = null;
    state.save.currentSeason = season;
    persist();
    els.menu.hidden = true;
    els.hud.hidden = false;
    els.touchControls.hidden = !isTouchLike();
    els.chapterOverlay.hidden = true;
    els.finalOverlay.hidden = true;
    renderHUD();
    updateCamera(true);
    showToast(`${meta.title} · ${meta.motto}`);
  }

  function returnToMenu() {
    state.mode = 'menu';
    els.menu.hidden = false;
    els.hud.hidden = true;
    els.touchControls.hidden = true;
    els.worldHelp.hidden = true;
    els.prompt.hidden = true;
    renderHUD();
    els.continueBtn.hidden = Object.keys(state.save.stations).length === 0;
    els.startBtn.textContent = Object.keys(state.save.stations).length ? '重新进入四季' : '开始行旅';
  }

  function switchSeason(season) {
    if (!seasonUnlocked(season)) {
      showToast('这一季还在雪雾后面。先完成上一季吧。');
      return;
    }
    const meta = DATA.seasons[season];
    state.season = season;
    state.player = { x: meta.start.x, y: meta.start.y, facing: 'down', moving: false, step: 0 };
    state.nearTerm = null;
    state.save.currentSeason = season;
    persist();
    renderHUD();
    updateCamera(true);
    showToast(`${meta.title} · ${meta.weatherLabel}`);
  }

  function updateCamera(instant = false) {
    const width = els.canvas.clientWidth;
    const height = els.canvas.clientHeight;
    const targetX = clamp(state.player.x - width / 2, 0, Math.max(0, WORLD.width - width));
    const targetY = clamp(state.player.y - height / 2, 0, Math.max(0, WORLD.height - height));
    if (instant) {
      state.camera.x = targetX;
      state.camera.y = targetY;
    } else {
      state.camera.x += (targetX - state.camera.x) * .12;
      state.camera.y += (targetY - state.camera.y) * .12;
    }
  }

  function currentMeta() {
    return DATA.seasons[state.season];
  }

  function nearestTerm() {
    let best = null;
    let bestDistance = 130;
    seasonTerms(state.season).forEach(term => {
      const d = distance(state.player, term.position);
      if (d < bestDistance) {
        bestDistance = d;
        best = term;
      }
    });
    return best;
  }

  function interact() {
    if (state.mode === 'mini') return miniAction();
    if (state.mode !== 'world') return;
    const term = nearestTerm();
    if (!term) {
      showToast('靠近一块发光的节气碑，再按 E 互动。');
      return;
    }
    openMiniGame(term);
  }

  function roundedRect(ctx, x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawFlower(ctx, x, y, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    for (let i = 0; i < 5; i += 1) {
      const angle = i / 5 * TAU;
      ctx.beginPath();
      ctx.ellipse(Math.cos(angle) * size * .55, Math.sin(angle) * size * .55, size * .42, size * .24, angle, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,246,144,.95)';
    ctx.beginPath();
    ctx.arc(0, 0, size * .24, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawTree(ctx, item, season) {
    const x = item.x;
    const y = item.y;
    const scale = item.size;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(51,74,45,.12)';
    ctx.beginPath();
    ctx.ellipse(0, 14 * scale, 48 * scale, 16 * scale, 0, 0, TAU);
    ctx.fill();
    if (season === 'winter') {
      ctx.fillStyle = '#4f6e66';
      ctx.fillRect(-5 * scale, -34 * scale, 10 * scale, 50 * scale);
      const layers = [[0, -82, 55], [0, -58, 45], [0, -34, 34]];
      layers.forEach(([lx, ly, r]) => {
        ctx.fillStyle = '#4d8066';
        ctx.beginPath();
        ctx.moveTo(lx, ly - r * .7);
        ctx.lineTo(lx - r, ly + r * .5);
        ctx.lineTo(lx + r, ly + r * .5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.beginPath();
        ctx.moveTo(lx, ly - r * .7);
        ctx.lineTo(lx - r * .55, ly + r * .05);
        ctx.lineTo(lx + r * .25, ly + r * .06);
        ctx.closePath();
        ctx.fill();
      });
    } else {
      ctx.fillStyle = season === 'autumn' ? '#8b552e' : '#7b5a31';
      ctx.fillRect(-7 * scale, -42 * scale, 14 * scale, 60 * scale);
      const leafColors = season === 'spring'
        ? ['#f7b1bf', '#f8d0d5', '#8dce74']
        : season === 'summer'
          ? ['#4eaa5b', '#6ec775', '#3d9652']
          : ['#e58a35', '#d7642f', '#f2b643'];
      leafColors.forEach((color, index) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc((index - 1) * 24 * scale, (-72 - index % 2 * 18) * scale, (38 - index * 4) * scale, 0, TAU);
        ctx.fill();
      });
    }
    ctx.restore();
  }

  function drawStation(ctx, term, near, time) {
    const meta = DATA.seasons[term.season];
    const record = stationRecord(term.id);
    const completed = Boolean(record?.complete);
    const pulse = near ? 1 + Math.sin(time * 5) * .06 : 1;
    ctx.save();
    ctx.translate(term.position.x, term.position.y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = 'rgba(51,74,45,.14)';
    ctx.beginPath();
    ctx.ellipse(0, 28, 64, 20, 0, 0, TAU);
    ctx.fill();
    if (near) {
      ctx.strokeStyle = term.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 69 + Math.sin(time * 4) * 5, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = completed ? term.color : 'rgba(255,253,244,.96)';
    ctx.strokeStyle = completed ? '#fff' : term.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 55, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = completed ? '#fff' : term.color;
    ctx.font = '500 34px "Songti SC", "STSong", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(term.glyph, 0, -3);
    ctx.fillStyle = 'rgba(255,253,244,.92)';
    roundedRect(ctx, -68, 70, 136, 42, 14);
    ctx.fill();
    ctx.fillStyle = meta.ink;
    ctx.font = '600 17px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(term.name, 0, 84);
    ctx.fillStyle = meta.color;
    ctx.font = '600 10px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(term.custom, 0, 101);
    if (completed) {
      ctx.fillStyle = '#e3a51c';
      ctx.font = '600 14px "PingFang SC", sans-serif';
      ctx.fillText(`${'★'.repeat(record.stars || 1)}`, 0, 131);
    }
    ctx.restore();
  }

  function drawPlayer(ctx) {
    const meta = currentMeta();
    const p = state.player;
    const bob = p.moving ? Math.sin(p.step * 9) * 3 : Math.sin(state.weatherTime * 2) * 1.2;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.fillStyle = 'rgba(45,67,51,.17)';
    ctx.beginPath();
    ctx.ellipse(0, 20, 24, 9, 0, 0, TAU);
    ctx.fill();
    if (p.moving) {
      const swing = Math.sin(p.step * 10) * 6;
      ctx.strokeStyle = '#46584e';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-7, 12); ctx.lineTo(-10 + swing, 25);
      ctx.moveTo(7, 12); ctx.lineTo(10 - swing, 25);
      ctx.stroke();
    }
    ctx.fillStyle = meta.color;
    roundedRect(ctx, -17, -18, 34, 40, 14);
    ctx.fill();
    ctx.fillStyle = meta.bright;
    ctx.beginPath();
    ctx.moveTo(-17, -2); ctx.lineTo(0, 13); ctx.lineTo(17, -2); ctx.lineTo(17, 8); ctx.lineTo(0, 22); ctx.lineTo(-17, 8); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f4c9a4';
    ctx.beginPath();
    ctx.arc(0, -33, 18, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#3a423d';
    ctx.beginPath();
    ctx.arc(-7, -32, 2.2, 0, TAU); ctx.arc(7, -32, 2.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#a86152';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, -26, 5, .2, Math.PI - .2); ctx.stroke();
    ctx.fillStyle = meta.bright;
    ctx.beginPath();
    ctx.ellipse(0, -49, 28, 8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = meta.color;
    ctx.beginPath();
    ctx.ellipse(0, -55, 16, 10, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawPortal(ctx, season, time) {
    const meta = DATA.seasons[season];
    const point = meta.portal;
    const ready = seasonComplete(season) && SEASON_ORDER.indexOf(season) < SEASON_ORDER.length - 1;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.strokeStyle = ready ? meta.bright : 'rgba(255,255,255,.7)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 52 + Math.sin(time * 2) * 4, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = ready ? meta.color : 'rgba(255,253,244,.35)';
    ctx.beginPath();
    ctx.arc(0, 0, 42, 0, TAU);
    ctx.fill();
    ctx.fillStyle = ready ? '#fff' : meta.ink;
    ctx.font = '500 23px "Songti SC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ready ? '往' : '锁', 0, 2);
    ctx.restore();
  }

  function drawWorldBackground(ctx, season, time) {
    const meta = DATA.seasons[season];
    const gradient = ctx.createLinearGradient(0, 0, WORLD.width, WORLD.height);
    gradient.addColorStop(0, meta.ground);
    gradient.addColorStop(1, season === 'winter' ? '#d8edf3' : season === 'autumn' ? '#d8a344' : season === 'summer' ? '#65c157' : '#91d368');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    ctx.save();
    ctx.globalAlpha = season === 'winter' ? .18 : .14;
    ctx.strokeStyle = meta.ink;
    ctx.lineWidth = 3;
    for (let y = 120; y < WORLD.height; y += 74) {
      ctx.beginPath();
      for (let x = 0; x <= WORLD.width; x += 36) {
        const yy = y + Math.sin(x * .01 + y * .003) * 12;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    const water = ctx.createLinearGradient(0, 0, 0, WORLD.height);
    water.addColorStop(0, meta.water);
    water.addColorStop(1, season === 'winter' ? '#ccecf5' : meta.water);
    ctx.fillStyle = water;
    if (season === 'spring') {
      ctx.beginPath(); ctx.ellipse(1610, 980, 190, 95, -.25, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3; ctx.stroke();
    } else if (season === 'summer') {
      ctx.beginPath(); ctx.moveTo(0, 1060); ctx.bezierCurveTo(560, 900, 1220, 1190, WORLD.width, 940); ctx.lineTo(WORLD.width, WORLD.height); ctx.lineTo(0, WORLD.height); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.48)'; ctx.lineWidth = 4; ctx.stroke();
    } else if (season === 'autumn') {
      ctx.beginPath(); ctx.moveTo(0, 1040); ctx.bezierCurveTo(520, 900, 1230, 1120, WORLD.width, 970); ctx.lineTo(WORLD.width, WORLD.height); ctx.lineTo(0, WORLD.height); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 4; ctx.stroke();
    } else {
      ctx.beginPath(); ctx.ellipse(1600, 960, 215, 120, -.18, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = 'rgba(124,184,201,.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(1470, 950); ctx.lineTo(1730, 920); ctx.moveTo(1485, 1000); ctx.lineTo(1710, 970); ctx.stroke();
    }
    ctx.restore();

    const points = [meta.start, ...seasonTerms(season).map(term => term.position), meta.portal];
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.32)';
    ctx.lineWidth = 92;
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.strokeStyle = meta.path;
    ctx.lineWidth = 70;
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 18]);
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.restore();

    state.decorations[season].slice().sort((a, b) => a.y - b.y).forEach(item => {
      if (item.type === 'tree') drawTree(ctx, item, season);
      else if (item.type === 'flower') {
        const colors = season === 'spring' ? ['#f5a6b8', '#fff1a6', '#ffffff'] : season === 'summer' ? ['#f6c641', '#ff9b45', '#fff1a6'] : season === 'autumn' ? ['#e07b33', '#f1bd4c', '#a9572b'] : ['#d4edf5', '#ffffff', '#b9dce8'];
        drawFlower(ctx, item.x, item.y, 4 + item.tone * 4, colors[Math.floor(item.tone * colors.length) % colors.length]);
      } else if (item.type === 'grass') {
        ctx.save();
        ctx.strokeStyle = season === 'autumn' ? '#b87335' : season === 'winter' ? '#a8c6d0' : '#4d8d49';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(item.x, item.y);
        ctx.quadraticCurveTo(item.x - 6, item.y - 14 * item.size, item.x - 2, item.y - 24 * item.size);
        ctx.moveTo(item.x, item.y);
        ctx.quadraticCurveTo(item.x + 8, item.y - 12 * item.size, item.x + 5, item.y - 20 * item.size);
        ctx.stroke();
        ctx.restore();
      } else if (item.type === 'stone') {
        ctx.save();
        ctx.fillStyle = season === 'winter' ? '#c6dae1' : 'rgba(94,104,91,.32)';
        ctx.beginPath();
        ctx.ellipse(item.x, item.y, 10 * item.size, 6 * item.size, item.phase, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    });
  }

  function drawWeather(ctx, weather, time) {
    const w = els.canvas.clientWidth;
    const h = els.canvas.clientHeight;
    ctx.save();
    if (weather === 'rain') {
      ctx.strokeStyle = 'rgba(105,180,207,.46)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 90; i += 1) {
        const x = ((i * 137 + time * 160) % (w + 140)) - 70;
        const y = ((i * 97 + time * 420) % (h + 120)) - 60;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 10, y + 24); ctx.stroke();
      }
      for (let i = 0; i < 18; i += 1) {
        const x = ((i * 211 + time * 32) % (w + 90)) - 30;
        const y = ((i * 151 + time * 55) % (h + 80)) - 30;
        ctx.fillStyle = i % 3 === 0 ? 'rgba(249,174,191,.7)' : 'rgba(255,255,255,.45)';
        ctx.beginPath(); ctx.ellipse(x, y, 5, 2.5, time + i, 0, TAU); ctx.fill();
      }
    } else if (weather === 'sun') {
      const glow = ctx.createRadialGradient(w - 130, 100, 20, w - 130, 100, 190);
      glow.addColorStop(0, 'rgba(255,229,105,.85)');
      glow.addColorStop(.35, 'rgba(255,214,68,.3)');
      glow.addColorStop(1, 'rgba(255,214,68,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,226,104,.45)'; ctx.lineWidth = 2;
      for (let i = 0; i < 12; i += 1) {
        const a = i / 12 * TAU + time * .08;
        ctx.beginPath(); ctx.moveTo(w - 130 + Math.cos(a) * 62, 100 + Math.sin(a) * 62); ctx.lineTo(w - 130 + Math.cos(a) * 105, 100 + Math.sin(a) * 105); ctx.stroke();
      }
      for (let i = 0; i < 12; i += 1) {
        const x = (i * 137 + time * 18) % w;
        const y = h * .2 + ((i * 71 + time * 23) % (h * .55));
        ctx.fillStyle = 'rgba(255,241,141,.35)';
        ctx.beginPath(); ctx.arc(x, y, 2 + (i % 3), 0, TAU); ctx.fill();
      }
    } else if (weather === 'leaves') {
      for (let i = 0; i < 32; i += 1) {
        const x = ((i * 181 + time * (24 + i % 8)) % (w + 100)) - 50;
        const y = ((i * 113 + time * 55) % (h + 100)) - 50;
        const angle = time * (.5 + (i % 5) * .12) + i;
        ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
        ctx.fillStyle = ['rgba(216,99,41,.68)', 'rgba(246,179,67,.67)', 'rgba(171,86,39,.58)'][i % 3];
        ctx.beginPath(); ctx.ellipse(0, 0, 9, 4, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
    } else if (weather === 'snow') {
      for (let i = 0; i < 110; i += 1) {
        const x = ((i * 149 + Math.sin(time * .7 + i) * 26 + time * 22) % (w + 80)) - 40;
        const y = ((i * 83 + time * (25 + i % 5 * 4)) % (h + 80)) - 40;
        const r = 1.2 + (i % 4) * .7;
        ctx.fillStyle = i % 5 === 0 ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.72)';
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = 'rgba(232,250,255,.08)'; ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  function drawWorld(time) {
    const ctx = worldContext();
    const w = els.canvas.clientWidth;
    const h = els.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const meta = currentMeta();
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, meta.sky);
    sky.addColorStop(1, meta.pale);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(-state.camera.x, -state.camera.y);
    drawWorldBackground(ctx, state.season, time);
    drawPortal(ctx, state.season, time);
    seasonTerms(state.season).forEach(term => drawStation(ctx, term, term === state.nearTerm, time));
    drawPlayer(ctx);
    ctx.restore();
    drawWeather(ctx, meta.weather, time);
    ctx.fillStyle = 'rgba(255,255,255,.04)';
    ctx.fillRect(0, 0, w, h);
  }

  function updatePrompt() {
    const term = nearestTerm();
    if (state.mode !== 'world' || !term) {
      els.prompt.hidden = true;
      state.nearTerm = term;
      return;
    }
    state.nearTerm = term;
    const complete = Boolean(stationRecord(term.id)?.complete);
    els.nearStationName.textContent = `${term.name} · ${term.custom}${complete ? ' · 重玩' : ''}`;
    const key = $('.interaction-prompt__key', els.prompt);
    if (key) key.textContent = isTouchLike() ? '行' : 'E';
    els.prompt.hidden = false;
  }

  function updateWorld(dt) {
    if (state.mode !== 'world') return;
    let dx = 0;
    let dy = 0;
    if (state.keys.w || state.keys.arrowup) dy -= 1;
    if (state.keys.s || state.keys.arrowdown) dy += 1;
    if (state.keys.a || state.keys.arrowleft) dx -= 1;
    if (state.keys.d || state.keys.arrowright) dx += 1;
    if (Math.abs(state.joystick.x) > .12) dx += state.joystick.x;
    if (Math.abs(state.joystick.y) > .12) dy += state.joystick.y;
    const length = Math.hypot(dx, dy);
    if (length > 1) { dx /= length; dy /= length; }
    const moving = length > .08;
    state.player.moving = moving;
    if (moving) {
      const speed = 225;
      state.player.x = clamp(state.player.x + dx * speed * dt, 35, WORLD.width - 35);
      state.player.y = clamp(state.player.y + dy * speed * dt, 35, WORLD.height - 35);
      state.player.step += dt;
      if (Math.abs(dx) > Math.abs(dy)) state.player.facing = dx > 0 ? 'right' : 'left';
      else state.player.facing = dy > 0 ? 'down' : 'up';
    }
    updateCamera();
    updatePrompt();
  }

  /* ----------------------------- Mini games ----------------------------- */

  function resizeMiniCanvas() {
    return setupMiniCanvas();
  }

  function setupMiniCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    els.miniCanvas.width = MINI.width * dpr;
    els.miniCanvas.height = MINI.height * dpr;
    els.miniCanvas.dataset.dpr = String(dpr);
    return miniContext();
  }

  function miniContext() {
    const ctx = els.miniCanvas.getContext('2d');
    const dpr = Number(els.miniCanvas.dataset.dpr || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function openMiniGame(term) {
    if (state.mode !== 'world') return;
    state.mode = 'mini';
    const meta = DATA.seasons[term.season];
    state.mini = {
      term, game: term.game, type: term.game.type, elapsed: 0, mistakes: 0,
      finished: false, failed: false, stars: 0, score: 0,
      pointerX: MINI.width / 2, pointerY: MINI.height / 2, pointerActive: false,
      flash: '', flashTimer: 0, last: performance.now()
    };
    initializeMini(state.mini);
    els.miniSeason.textContent = `${meta.name}之章 · ${term.name}`;
    els.miniTitle.textContent = term.game.title;
    els.miniCustom.textContent = term.custom;
    els.miniHint.textContent = term.game.hint;
    els.miniOverlay.hidden = false;
    els.prompt.hidden = true;
    setupMiniCanvas();
    state.miniFrame = requestAnimationFrame(loopMini);
    playSound('open');
  }

  function initializeMini(mini) {
    mini.elapsed = 0;
    mini.mistakes = 0;
    mini.finished = false;
    mini.failed = false;
    mini.flash = '';
    mini.flashTimer = 0;
    mini.buttons = [];
    mini.closeTimer = 0;
    mini.finishAt = null;
    if (mini.type === 'collect') {
      mini.basketX = MINI.width / 2;
      mini.items = [];
      mini.spawnClock = .2;
      mini.spawnIndex = 0;
      mini.collected = 0;
      mini.targetCount = mini.game.targetCount || 6;
      mini.timeLimit = 32;
    } else if (mini.type === 'rhythm') {
      mini.beats = Array.from({ length: mini.game.beats || 5 }, (_, i) => ({ time: 1.2 + i * (mini.game.tempo || 1.1), resolved: false, good: false }));
      mini.goodHits = 0;
      mini.lastBeatPulse = 0;
    } else if (mini.type === 'timing') {
      mini.round = 0;
      mini.successes = 0;
      mini.pos = .08;
      mini.dir = 1;
      mini.delay = 0;
      mini.lastSuccess = false;
    } else if (mini.type === 'sort') {
      mini.index = 0;
      mini.correct = 0;
      mini.lockTimer = 0;
    } else if (mini.type === 'path') {
      mini.progress = 0;
      mini.playerX = MINI.width / 2;
      mini.targetX = MINI.width / 2;
      mini.objects = [];
      mini.spawnClock = .25;
      mini.spawnIndex = 0;
      mini.collected = 0;
      mini.targetCount = mini.game.targetCount || 3;
      mini.collisions = 0;
    } else if (mini.type === 'sequence') {
      mini.phase = 'show';
      mini.showIndex = 0;
      mini.showClock = 0;
      mini.currentFlash = -1;
      mini.input = [];
    }
  }

  function restartMini() {
    const mini = state.mini;
    if (!mini) return;
    initializeMini(mini);
    mini.last = performance.now();
    setupMiniCanvas();
  }

  function closeMini(completed = false) {
    if (!state.mini) return;
    const mini = state.mini;
    if (mini.closeTimer) clearTimeout(mini.closeTimer);
    cancelAnimationFrame(state.miniFrame);
    state.mini = null;
    els.miniOverlay.hidden = true;
    state.mode = 'world';
    els.touchControls.hidden = !isTouchLike();
    if (completed) setTimeout(() => maybeShowChapter(mini.term.season), 350);
  }

  function miniPoint(event) {
    const rect = els.miniCanvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width * MINI.width, y: (event.clientY - rect.top) / rect.height * MINI.height };
  }

  function miniPointerDown(event) {
    const mini = state.mini;
    if (!mini) return;
    event.preventDefault();
    const point = miniPoint(event);
    mini.pointerX = point.x; mini.pointerY = point.y; mini.pointerActive = true;
    if (mini.failed) { restartMini(); return; }
    if (mini.finished) return;
    if (mini.type === 'rhythm' || mini.type === 'timing') miniAction();
    else if (mini.type === 'sort') {
      const button = mini.buttons.find(b => point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h);
      if (button) chooseSort(button.index);
    } else if (mini.type === 'sequence') {
      const button = mini.buttons.find(b => point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h);
      if (button) chooseSequence(button.index);
    }
  }

  function miniPointerMove(event) {
    const mini = state.mini;
    if (!mini || mini.finished || mini.failed) return;
    const point = miniPoint(event);
    mini.pointerX = point.x; mini.pointerY = point.y;
    if (mini.type === 'collect' || mini.type === 'path') mini.pointerActive = true;
  }

  function miniPointerUp() {
    if (state.mini?.type === 'path') state.mini.pointerActive = false;
  }

  function miniAction() {
    const mini = state.mini;
    if (!mini) return;
    if (mini.failed) { restartMini(); return; }
    if (mini.finished) return;
    if (mini.type === 'rhythm') hitRhythm();
    else if (mini.type === 'timing') hitTiming();
  }

  function miniKey(event, key) {
    const mini = state.mini;
    if (!mini) return false;
    if (event.key === 'Escape') { closeMini(false); return true; }
    if (mini.failed) {
      if (event.key === ' ' || event.key === 'Enter') { restartMini(); return true; }
      return false;
    }
    if (mini.finished) return true;
    if (mini.type === 'rhythm' || mini.type === 'timing') {
      if (event.key === ' ' || event.key === 'Enter') { miniAction(); return true; }
    }
    if (mini.type === 'sort' && /^[1-9]$/.test(event.key)) { chooseSort(Number(event.key) - 1); return true; }
    if (mini.type === 'sequence' && /^[1-9]$/.test(event.key)) { chooseSequence(Number(event.key) - 1); return true; }
    if (mini.type === 'collect') {
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') { mini.basketX = clamp(mini.basketX - 42, 70, MINI.width - 70); mini.pointerActive = false; }
      if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') { mini.basketX = clamp(mini.basketX + 42, 70, MINI.width - 70); mini.pointerActive = false; }
    }
    if (mini.type === 'path') {
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') { mini.targetX = clamp(mini.targetX - 42, 220, MINI.width - 220); mini.pointerActive = false; }
      if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') { mini.targetX = clamp(mini.targetX + 42, 220, MINI.width - 220); mini.pointerActive = false; }
    }
    return false;
  }

  function updateMini(mini, dt) {
    mini.elapsed += dt;
    if (mini.flashTimer > 0) mini.flashTimer -= dt;
    if (mini.type === 'collect') updateCollect(mini, dt);
    else if (mini.type === 'rhythm') updateRhythm(mini, dt);
    else if (mini.type === 'timing') updateTiming(mini, dt);
    else if (mini.type === 'sort') updateSort(mini, dt);
    else if (mini.type === 'path') updatePath(mini, dt);
    else if (mini.type === 'sequence') updateSequence(mini, dt);
  }

  function failMini(message) {
    const mini = state.mini;
    if (!mini || mini.finished || mini.failed) return;
    mini.failed = true;
    mini.failedMessage = message || '再来一次';
    playSound('error');
  }

  function finishMini() {
    const mini = state.mini;
    if (!mini || mini.finished) return;
    mini.finished = true;
    const stars = mini.mistakes === 0 ? 3 : mini.mistakes <= 2 ? 2 : 1;
    const score = Math.max(250, 1000 - mini.mistakes * 120 - Math.max(0, Math.round(mini.elapsed * 2)));
    mini.stars = stars; mini.score = score;
    const term = mini.term;
    const previous = state.save.stations[term.id] || {};
    state.save.stations[term.id] = {
      complete: true,
      stars: Math.max(previous.stars || 0, stars),
      bestScore: Math.max(previous.bestScore || 0, score),
      lastScore: score,
      completedAt: previous.completedAt || new Date().toISOString()
    };
    persist(); renderHUD();
    playSound('complete');
    showToast(`${term.name} · ${term.custom}完成`);
    mini.closeTimer = setTimeout(() => { if (state.mini === mini) closeMini(true); }, 1500);
  }

  function updateCollect(mini, dt) {
    if (mini.failed || mini.finished) return;
    if (mini.elapsed > mini.timeLimit) { failMini('时间到了，再试一次'); return; }
    if (state.keys.arrowleft || state.keys.a) mini.pointerActive = false;
    if (state.keys.arrowright || state.keys.d) mini.pointerActive = false;
    let basketMove = 0;
    if (state.keys.arrowleft || state.keys.a) basketMove -= 280 * dt;
    if (state.keys.arrowright || state.keys.d) basketMove += 280 * dt;
    mini.basketX = clamp(mini.basketX + basketMove, 70, MINI.width - 70);
    if (mini.pointerActive) mini.basketX += (mini.pointerX - mini.basketX) * Math.min(1, dt * 12);
    mini.spawnClock -= dt;
    if (mini.spawnClock <= 0) {
      mini.spawnClock = .48;
      const isTarget = mini.spawnIndex % 3 !== 2;
      const pool = isTarget ? mini.game.targets : mini.game.avoid;
      const choice = pool[Math.floor(Math.random() * pool.length)];
      mini.items.push({ x: 70 + Math.random() * (MINI.width - 140), y: -50, vy: 125 + Math.random() * 55, target: isTarget, name: choice.name, glyph: choice.glyph });
      mini.spawnIndex += 1;
    }
    mini.items.forEach(item => { item.y += item.vy * dt; });
    for (let i = mini.items.length - 1; i >= 0; i -= 1) {
      const item = mini.items[i];
      if (item.y > 440 && item.y < 520 && Math.abs(item.x - mini.basketX) < 61) {
        if (item.target) {
          mini.collected += 1; mini.flash = `+ ${item.name}`; mini.flashTimer = .35; playSound('tick');
        } else {
          mini.mistakes += 1; mini.flash = '碰倒了'; mini.flashTimer = .35; playSound('error');
        }
        mini.items.splice(i, 1);
      } else if (item.y > 615) {
        if (item.target) mini.mistakes += 1;
        mini.items.splice(i, 1);
      }
    }
    if (mini.collected >= mini.targetCount) finishMini();
  }

  function hitRhythm() {
    const mini = state.mini;
    if (!mini || mini.type !== 'rhythm' || mini.finished) return;
    const candidates = mini.beats.filter(beat => !beat.resolved);
    if (!candidates.length) return;
    candidates.sort((a, b) => Math.abs(a.time - mini.elapsed) - Math.abs(b.time - mini.elapsed));
    const beat = candidates[0];
    if (Math.abs(beat.time - mini.elapsed) <= .2) {
      beat.resolved = true; beat.good = true; mini.goodHits += 1;
      mini.flash = '好拍'; mini.flashTimer = .3; playSound('tick');
    } else {
      mini.mistakes += 1; mini.flash = '早了 / 晚了'; mini.flashTimer = .3; playSound('error');
    }
  }

  function updateRhythm(mini, dt) {
    mini.beats.forEach(beat => {
      if (!beat.resolved && mini.elapsed > beat.time + .25) { beat.resolved = true; mini.mistakes += 1; }
    });
    const current = mini.beats.find(beat => !beat.resolved);
    mini.lastBeatPulse = current ? clamp(1 - Math.abs(current.time - mini.elapsed) / .5, 0, 1) : 0;
    if (mini.beats.every(beat => beat.resolved) && !mini.finishAt) mini.finishAt = mini.elapsed + .7;
    if (mini.finishAt && mini.elapsed >= mini.finishAt) finishMini();
  }

  function hitTiming() {
    const mini = state.mini;
    if (!mini || mini.type !== 'timing' || mini.finished || mini.delay > 0) return;
    const zone = .14 - mini.round * .025;
    const success = Math.abs(mini.pos - .5) <= zone;
    if (success) { mini.successes += 1; mini.flash = '稳！'; mini.flashTimer = .4; playSound('correct'); }
    else { mini.mistakes += 1; mini.flash = '再稳一点'; mini.flashTimer = .4; playSound('error'); }
    mini.lastSuccess = success;
    mini.round += 1;
    if (mini.round >= (mini.game.rounds || 3)) mini.finishAt = mini.elapsed + .8;
    else mini.delay = .65;
  }

  function updateTiming(mini, dt) {
    if (mini.delay > 0) {
      mini.delay -= dt;
      if (mini.delay <= 0) { mini.pos = .08; mini.dir = 1; }
    } else if (!mini.finishAt) {
      mini.pos += mini.dir * dt * .82;
      if (mini.pos >= 1) { mini.pos = 1; mini.dir = -1; }
      if (mini.pos <= 0) { mini.pos = 0; mini.dir = 1; }
    }
    if (mini.finishAt && mini.elapsed >= mini.finishAt) finishMini();
  }

  function chooseSort(index) {
    const mini = state.mini;
    if (!mini || mini.type !== 'sort' || mini.finished || mini.lockTimer > 0) return;
    const item = mini.game.items[mini.index];
    if (!item || index < 0 || index >= mini.game.categories.length) return;
    if (index === item.cat) { mini.correct += 1; mini.flash = '分对了'; mini.flashTimer = .35; playSound('correct'); }
    else { mini.mistakes += 1; mini.flash = '放错了'; mini.flashTimer = .35; playSound('error'); }
    mini.index += 1;
    mini.lockTimer = .42;
  }

  function updateSort(mini, dt) {
    if (mini.lockTimer > 0) mini.lockTimer -= dt;
    if (mini.index >= mini.game.items.length && mini.lockTimer <= 0) finishMini();
  }

  function updatePath(mini, dt) {
    if (mini.finished || mini.failed) return;
    if (state.keys.arrowleft || state.keys.a) { mini.targetX = clamp(mini.targetX - 300 * dt, 220, MINI.width - 220); mini.pointerActive = false; }
    if (state.keys.arrowright || state.keys.d) { mini.targetX = clamp(mini.targetX + 300 * dt, 220, MINI.width - 220); mini.pointerActive = false; }
    if (mini.pointerActive) mini.targetX = clamp(mini.pointerX, 220, MINI.width - 220);
    mini.playerX += (mini.targetX - mini.playerX) * Math.min(1, dt * 8);
    mini.progress = clamp(mini.progress + dt / 10, 0, 1);
    mini.spawnClock -= dt;
    if (mini.spawnClock <= 0) {
      mini.spawnClock = .68;
      mini.spawnIndex += 1;
      const target = mini.progress >= 1 || mini.spawnIndex % 3 === 0;
      mini.objects.push({ x: 235 + Math.random() * (MINI.width - 470), y: -45, target });
    }
    mini.objects.forEach(object => { object.y += 185 * dt + mini.progress * 35 * dt; });
    for (let i = mini.objects.length - 1; i >= 0; i -= 1) {
      const object = mini.objects[i];
      if (object.y > 425 && object.y < 515 && Math.abs(object.x - mini.playerX) < 46) {
        if (object.target) { mini.collected += 1; mini.flash = mini.game.targetName; mini.flashTimer = .35; playSound('tick'); }
        else { mini.collisions += 1; mini.mistakes += 1; mini.flash = mini.game.obstacleName; mini.flashTimer = .35; playSound('error'); }
        mini.objects.splice(i, 1);
      } else if (object.y > 620) mini.objects.splice(i, 1);
    }
    if (mini.progress >= 1 && mini.collected >= mini.targetCount) finishMini();
  }

  function updateSequence(mini, dt) {
    if (mini.phase !== 'show') return;
    mini.showClock += dt;
    if (mini.flashTimer > 0) mini.flashTimer -= dt;
    if (mini.showClock >= .7) {
      mini.showClock = 0;
      if (mini.showIndex < mini.game.sequence.length) {
        mini.currentFlash = mini.game.sequence[mini.showIndex];
        mini.flashTimer = .42;
        mini.showIndex += 1;
      } else {
        mini.phase = 'input';
        mini.currentFlash = -1;
        mini.showClock = 0;
      }
    }
  }

  function chooseSequence(index) {
    const mini = state.mini;
    if (!mini || mini.type !== 'sequence' || mini.finished || mini.phase !== 'input') return;
    const expected = mini.game.sequence[mini.input.length];
    if (index === expected) {
      mini.input.push(index); mini.flash = mini.game.symbols[index].name; mini.flashTimer = .3; playSound('tick');
      if (mini.input.length === mini.game.sequence.length) finishMini();
    } else {
      mini.mistakes += 1;
      mini.input = [];
      mini.phase = 'show';
      mini.showIndex = 0;
      mini.showClock = 0;
      mini.currentFlash = -1;
      mini.flash = '顺序乱了，再看一次';
      mini.flashTimer = .55;
      playSound('error');
    }
  }

  function drawMiniBackdrop(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    const gradient = ctx.createLinearGradient(0, 0, MINI.width, MINI.height);
    gradient.addColorStop(0, meta.pale);
    gradient.addColorStop(.55, '#fffdf4');
    gradient.addColorStop(1, meta.sky);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, MINI.width, MINI.height);
    ctx.save();
    ctx.globalAlpha = .22;
    ctx.fillStyle = meta.bright;
    ctx.beginPath(); ctx.arc(80, 80, 120, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(MINI.width - 80, MINI.height - 80, 145, 0, TAU); ctx.fill();
    ctx.globalAlpha = .12;
    ctx.strokeStyle = meta.ink;
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i += 1) {
      ctx.beginPath();
      ctx.arc(MINI.width / 2, MINI.height / 2, 80 + i * 45, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function miniBadge(ctx, text, x, y, color) {
    ctx.save();
    ctx.font = '600 17px "PingFang SC", "Microsoft YaHei", sans-serif';
    const width = ctx.measureText(text).width + 28;
    roundedRect(ctx, x - width / 2, y - 18, width, 36, 18);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
    ctx.restore();
  }

  function miniFlashText(ctx, mini) {
    if (!mini.flash || mini.flashTimer <= 0) return;
    const alpha = clamp(mini.flashTimer / .35, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '600 26px "Songti SC", "STSong", serif';
    ctx.fillStyle = DATA.seasons[mini.term.season].ink;
    ctx.textAlign = 'center';
    ctx.fillText(mini.flash, MINI.width / 2, 120);
    ctx.restore();
  }

  function drawCollect(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    const timeLeft = Math.max(0, mini.timeLimit - mini.elapsed);
    const barWidth = MINI.width - 120;
    roundedRect(ctx, 60, 38, barWidth, 10, 5);
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
    roundedRect(ctx, 60, 38, barWidth * (timeLeft / mini.timeLimit), 10, 5);
    ctx.fillStyle = mini.elapsed / mini.timeLimit > .75 ? '#d7603c' : meta.color; ctx.fill();
    ctx.fillStyle = meta.ink;
    ctx.font = '600 15px "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`收集 ${mini.collected} / ${mini.targetCount}`, 60, 76);
    mini.game.targets.forEach((target, index) => {
      const x = 650 + index * 96;
      ctx.fillStyle = 'rgba(255,255,255,.68)';
      ctx.beginPath(); ctx.arc(x, 64, 23, 0, TAU); ctx.fill();
      ctx.fillStyle = meta.ink;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '600 18px "Songti SC", serif';
      ctx.fillText(target.glyph, x, 65);
    });
    mini.items.forEach(item => {
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.fillStyle = 'rgba(51,74,45,.09)';
      ctx.beginPath(); ctx.ellipse(0, 25, 28, 8, 0, 0, TAU); ctx.fill();
      roundedRect(ctx, -30, -22, 60, 44, 13);
      ctx.fillStyle = '#fffdf4'; ctx.fill();
      ctx.strokeStyle = meta.color; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = meta.ink;
      ctx.font = '600 20px "Songti SC", serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(item.glyph, 0, -1);
      ctx.font = '600 9px "PingFang SC", sans-serif';
      ctx.fillStyle = '#69776d';
      ctx.fillText(item.name, 0, 15);
      ctx.restore();
    });
    const bx = mini.basketX;
    ctx.save();
    ctx.translate(bx, 490);
    ctx.fillStyle = 'rgba(56,73,49,.12)';
    ctx.beginPath(); ctx.ellipse(0, 54, 58, 15, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = meta.color;
    ctx.beginPath(); ctx.moveTo(-62, -12); ctx.lineTo(62, -12); ctx.lineTo(46, 48); ctx.quadraticCurveTo(0, 66, -46, 48); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(0, -12, 63, 18, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '600 20px "Songti SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText('接', 0, 20);
    ctx.restore();
    miniFlashText(ctx, mini);
  }

  function drawRhythm(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    ctx.save();
    ctx.translate(MINI.width / 2, 285);
    const pulse = 1 + (mini.lastBeatPulse || 0) * .12;
    ctx.scale(pulse, pulse);
    for (let i = 0; i < 3; i += 1) {
      ctx.strokeStyle = `rgba(255,255,255,${.55 - i * .12})`;
      ctx.lineWidth = 3 - i * .5;
      ctx.beginPath(); ctx.arc(0, 0, 116 + i * 24, 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = meta.color;
    ctx.beginPath(); ctx.arc(0, 0, 94, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '500 58px "Songti SC", serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(mini.game.instrument || '鼓', 0, 4);
    ctx.restore();
    ctx.fillStyle = meta.ink;
    ctx.textAlign = 'center';
    ctx.font = '600 18px "PingFang SC", sans-serif';
    ctx.fillText('节拍环收进鼓面时，点击 / 空格', MINI.width / 2, 448);
    ctx.font = '600 13px "PingFang SC", sans-serif';
    ctx.fillStyle = '#748178';
    ctx.fillText('命中 ' + mini.goodHits + ' / ' + mini.beats.length, MINI.width / 2, 478);
    mini.beats.forEach((beat, index) => {
      const x = 350 + index * 65;
      ctx.fillStyle = beat.good ? meta.color : beat.resolved ? 'rgba(99,111,100,.28)' : 'rgba(255,255,255,.78)';
      ctx.beginPath(); ctx.arc(x, 515, 10, 0, TAU); ctx.fill();
      ctx.strokeStyle = meta.color; ctx.lineWidth = 2; ctx.stroke();
    });
    miniFlashText(ctx, mini);
  }

  function drawTiming(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    ctx.save();
    ctx.translate(MINI.width / 2, 205);
    const wobble = Math.sin(mini.elapsed * (mini.round < 2 ? 2 : 5)) * (mini.round < 2 ? 3 : 9);
    ctx.rotate(wobble * Math.PI / 180);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.ellipse(0, 28, 66, 17, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f9e5bf';
    ctx.beginPath(); ctx.ellipse(0, -5, 44, 67, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = meta.color; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = meta.ink;
    ctx.font = '600 26px "Songti SC", serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(mini.game.objectGlyph || '蛋', 0, -8);
    ctx.restore();
    const zoneHalf = .14 - mini.round * .025;
    const zoneLeft = 100 + (MINI.width - 200) * (.5 - zoneHalf);
    const zoneWidth = (MINI.width - 200) * zoneHalf * 2;
    roundedRect(ctx, 100, 350, MINI.width - 200, 26, 13);
    ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.fill();
    ctx.fillStyle = 'rgba(81,162,92,.42)';
    ctx.fillRect(zoneLeft, 350, zoneWidth, 26);
    const markerX = 100 + (MINI.width - 200) * mini.pos;
    ctx.fillStyle = meta.color;
    ctx.beginPath(); ctx.arc(markerX, 363, 18, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = meta.ink;
    ctx.font = '600 16px "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('停在绿色区域', MINI.width / 2, 418);
    ctx.font = '600 13px "PingFang SC", sans-serif';
    ctx.fillStyle = '#748178';
    ctx.fillText(`第 ${Math.min(mini.round + 1, mini.game.rounds)} / ${mini.game.rounds} 回合 · 成功 ${mini.successes}`, MINI.width / 2, 448);
    miniFlashText(ctx, mini);
  }

  function drawSort(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    mini.buttons = [];
    const item = mini.game.items[Math.min(mini.index, mini.game.items.length - 1)];
    ctx.save();
    ctx.translate(MINI.width / 2, 230);
    roundedRect(ctx, -150, -100, 300, 200, 26);
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill();
    ctx.strokeStyle = meta.color; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = meta.ink;
    ctx.font = '600 72px "Songti SC", serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(item?.glyph || '？', 0, -15);
    ctx.font = '600 20px "PingFang SC", sans-serif';
    ctx.fillText(item?.name || '完成', 0, 62);
    ctx.restore();
    const count = mini.game.categories.length;
    const totalW = count * 210 + (count - 1) * 22;
    mini.game.categories.forEach((category, index) => {
      const x = MINI.width / 2 - totalW / 2 + index * 232;
      const y = 390;
      roundedRect(ctx, x, y, 210, 92, 20);
      ctx.fillStyle = index === 0 ? '#f7e4c1' : index === 1 ? '#dff1dc' : '#e4e8f7';
      ctx.fill();
      ctx.strokeStyle = 'rgba(45,67,51,.12)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = meta.ink;
      ctx.font = '500 24px "Songti SC", serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(category.glyph, x + 105, y + 37);
      ctx.font = '600 11px "PingFang SC", sans-serif';
      ctx.fillStyle = '#6d796f';
      ctx.fillText(category.name, x + 105, y + 70);
      mini.buttons.push({ x, y, w: 210, h: 92, index });
    });
    ctx.fillStyle = meta.ink;
    ctx.font = '600 14px "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`第 ${Math.min(mini.index + 1, mini.game.items.length)} / ${mini.game.items.length} 张`, MINI.width / 2, 360);
    miniFlashText(ctx, mini);
  }

  function drawPath(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    ctx.save();
    const river = ctx.createLinearGradient(0, 0, 0, MINI.height);
    river.addColorStop(0, meta.water);
    river.addColorStop(1, '#dff8f7');
    ctx.fillStyle = river;
    ctx.beginPath();
    ctx.moveTo(175, 0); ctx.bezierCurveTo(300, 180, 160, 390, 260, MINI.height);
    ctx.lineTo(MINI.width - 260, MINI.height); ctx.bezierCurveTo(MINI.width - 160, 390, MINI.width - 300, 180, MINI.width - 175, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3;
    for (let i = 0; i < 6; i += 1) {
      const y = ((i * 110 + mini.elapsed * 70) % (MINI.height + 100)) - 50;
      ctx.beginPath(); ctx.moveTo(230, y); ctx.bezierCurveTo(420, y - 20, 590, y + 20, 730, y); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(102,157,99,.82)';
    ctx.fillRect(0, 0, 175, MINI.height); ctx.fillRect(MINI.width - 175, 0, 175, MINI.height);
    ctx.restore();
    ctx.fillStyle = meta.ink;
    ctx.font = '600 14px "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${mini.game.targetName} ${mini.collected}/${mini.targetCount}  ·  航程 ${Math.round(mini.progress * 100)}%`, 60, 44);
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    roundedRect(ctx, 60, 58, MINI.width - 120, 9, 5); ctx.fill();
    roundedRect(ctx, 60, 58, (MINI.width - 120) * mini.progress, 9, 5);
    ctx.fillStyle = meta.color; ctx.fill();
    mini.objects.forEach(object => {
      ctx.save();
      ctx.translate(object.x, object.y);
      ctx.fillStyle = object.target ? '#fff7cc' : 'rgba(92,105,98,.65)';
      ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.fill();
      ctx.strokeStyle = object.target ? meta.color : 'rgba(255,255,255,.65)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = object.target ? meta.ink : '#fff';
      ctx.font = '600 17px "Songti SC", serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(object.target ? mini.game.targetGlyph : mini.game.obstacleGlyph, 0, 1);
      ctx.restore();
    });
    ctx.save();
    ctx.translate(mini.playerX, 475);
    ctx.fillStyle = 'rgba(36,62,60,.16)';
    ctx.beginPath(); ctx.ellipse(0, 42, 50, 12, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = meta.color;
    ctx.beginPath(); ctx.moveTo(-48, 5); ctx.lineTo(48, 5); ctx.lineTo(28, 45); ctx.lineTo(-28, 45); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '600 21px "Songti SC", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(mini.game.playerGlyph, 0, 26);
    ctx.restore();
    ctx.fillStyle = meta.ink;
    ctx.font = '600 12px "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('左右移动 · 点击 / 拖动也可以', MINI.width / 2, 540);
    miniFlashText(ctx, mini);
  }

  function drawSequence(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    mini.buttons = [];
    ctx.fillStyle = meta.ink;
    ctx.font = '600 15px "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    const status = mini.phase === 'show' ? '看一遍顺序…' : '轮到你了，按顺序点击';
    ctx.fillText(status, MINI.width / 2, 58);
    const gap = 24;
    const tileW = 170;
    const total = mini.game.symbols.length * tileW + (mini.game.symbols.length - 1) * gap;
    mini.game.symbols.forEach((symbol, index) => {
      const x = MINI.width / 2 - total / 2 + index * (tileW + gap);
      const y = 175;
      const active = mini.phase === 'show' && mini.currentFlash === index && mini.flashTimer > 0;
      const used = mini.input.includes(index);
      roundedRect(ctx, x, y, tileW, 135, 24);
      ctx.fillStyle = active ? meta.color : used ? meta.pale : 'rgba(255,255,255,.82)';
      ctx.fill();
      ctx.strokeStyle = active ? '#fff' : meta.color;
      ctx.lineWidth = active ? 5 : 2;
      ctx.stroke();
      ctx.fillStyle = active ? '#fff' : meta.ink;
      ctx.font = '600 43px "Songti SC", serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(symbol.glyph, x + tileW / 2, y + 55);
      ctx.font = '600 11px "PingFang SC", sans-serif';
      ctx.fillText(symbol.name, x + tileW / 2, y + 104);
      ctx.fillStyle = active ? 'rgba(255,255,255,.7)' : 'rgba(45,67,51,.28)';
      ctx.font = '600 10px "PingFang SC", sans-serif';
      ctx.fillText(String(index + 1), x + tileW / 2, y + 126);
      mini.buttons.push({ x, y, w: tileW, h: 135, index });
    });
    ctx.fillStyle = meta.ink;
    ctx.font = '600 14px "PingFang SC", sans-serif';
    ctx.fillText(`记忆进度 ${mini.input.length} / ${mini.game.sequence.length}`, MINI.width / 2, 365);
    const dotGap = 18;
    const dotsW = mini.game.sequence.length * dotGap;
    mini.game.sequence.forEach((_, index) => {
      const x = MINI.width / 2 - dotsW / 2 + index * dotGap;
      ctx.fillStyle = mini.input.length > index ? meta.color : 'rgba(45,67,51,.16)';
      ctx.beginPath(); ctx.arc(x, 395, 5, 0, TAU); ctx.fill();
    });
    miniFlashText(ctx, mini);
  }

  function drawMiniCompletion(ctx, mini) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,253,244,.84)';
    ctx.fillRect(0, 0, MINI.width, MINI.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (mini.failed) {
      ctx.fillStyle = DATA.seasons[mini.term.season].ink;
      ctx.font = '500 52px "Songti SC", serif';
      ctx.fillText(mini.failedMessage || '再来一次', MINI.width / 2, 245);
      ctx.font = '600 18px "PingFang SC", sans-serif';
      ctx.fillStyle = '#7a857b';
      ctx.fillText('点击画面或按空格重试', MINI.width / 2, 315);
    } else if (mini.finished) {
      ctx.fillStyle = DATA.seasons[mini.term.season].ink;
      ctx.font = '500 54px "Songti SC", serif';
      ctx.fillText(`${mini.term.custom} · 完成`, MINI.width / 2, 230);
      ctx.fillStyle = '#e0a728';
      ctx.font = '600 42px "Songti SC", serif';
      ctx.fillText(`${'★'.repeat(mini.stars)}${'☆'.repeat(3 - mini.stars)}`, MINI.width / 2, 305);
      ctx.fillStyle = '#6c786e';
      ctx.font = '600 17px "PingFang SC", sans-serif';
      ctx.fillText(mini.term.culture, MINI.width / 2, 375);
    }
    ctx.restore();
  }

  function drawMini(mini) {
    const ctx = miniContext();
    if (mini.type === 'collect') drawCollect(ctx, mini);
    else if (mini.type === 'rhythm') drawRhythm(ctx, mini);
    else if (mini.type === 'timing') drawTiming(ctx, mini);
    else if (mini.type === 'sort') drawSort(ctx, mini);
    else if (mini.type === 'path') drawPath(ctx, mini);
    else drawSequence(ctx, mini);
    if (mini.finished || mini.failed) drawMiniCompletion(ctx, mini);
    updateMiniProgress(mini);
  }

  function updateMiniProgress(mini) {
    let text = '';
    if (mini.type === 'collect') text = `${mini.collected} / ${mini.targetCount}`;
    else if (mini.type === 'rhythm') text = `命中 ${mini.goodHits} / ${mini.beats.length}`;
    else if (mini.type === 'timing') text = `回合 ${Math.min(mini.round + 1, mini.game.rounds)} / ${mini.game.rounds}`;
    else if (mini.type === 'sort') text = `${Math.min(mini.index, mini.game.items.length)} / ${mini.game.items.length}`;
    else if (mini.type === 'path') text = `${mini.collected} / ${mini.targetCount} · ${Math.round(mini.progress * 100)}%`;
    else if (mini.type === 'sequence') text = mini.phase === 'show' ? '记忆顺序' : `${mini.input.length} / ${mini.game.sequence.length}`;
    els.miniProgress.textContent = text;
  }

  function loopMini(timestamp) {
    const mini = state.mini;
    if (!mini) return;
    const dt = Math.min(.034, Math.max(0, (timestamp - mini.last) / 1000));
    mini.last = timestamp;
    if (!mini.finished && !mini.failed) updateMini(mini, dt);
    else mini.elapsed += dt;
    drawMini(mini);
    state.miniFrame = requestAnimationFrame(loopMini);
  }

  /* --------------------------- Meta / overlay --------------------------- */

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), 2600);
  }

  function isTouchLike() {
    return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 900;
  }

  function ensureAudio() {
    if (!state.audio) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      state.audio = new AudioContextClass();
    }
    if (state.audio.state === 'suspended') state.audio.resume();
    return state.audio;
  }

  function tone(frequency, duration, type = 'sine', volume = .025, delay = 0) {
    if (!state.save.sound) return;
    const context = ensureAudio();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + .03);
  }

  function playSound(name) {
    if (!state.save.sound) return;
    if (name === 'open') { tone(520, .12, 'sine', .018); tone(660, .16, 'sine', .015, .08); }
    else if (name === 'tick') tone(640, .06, 'sine', .012);
    else if (name === 'correct') { tone(590, .1, 'sine', .016); tone(760, .12, 'sine', .014, .08); }
    else if (name === 'error') { tone(220, .16, 'triangle', .02); tone(180, .18, 'triangle', .017, .08); }
    else if (name === 'complete') { [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => tone(frequency, .42, 'sine', .014, index * .09)); }
    else if (name === 'step') tone(300, .025, 'sine', .004);
  }

  function toggleSound() {
    state.save.sound = !state.save.sound;
    persist();
    updateSoundButton();
    if (state.save.sound) playSound('correct');
    showToast(state.save.sound ? '声音已开启' : '声音已关闭');
  }

  function maybeShowChapter(season) {
    if (!seasonComplete(season) || state.save.chapterCelebrated[season]) return;
    state.save.chapterCelebrated[season] = true;
    persist();
    const meta = DATA.seasons[season];
    const seasonStarCount = seasonTerms(season).reduce((sum, term) => sum + (state.save.stations[term.id]?.stars || 0), 0);
    const index = SEASON_ORDER.indexOf(season);
    els.chapterSeal.textContent = meta.name;
    els.chapterKicker.textContent = meta.title;
    els.chapterTitle.textContent = '这一季的节气碑都亮了';
    els.chapterStars.textContent = `${'★'.repeat(Math.floor(seasonStarCount / 6))}  ${seasonStarCount} / 18 星`;
    els.chapterCopy.textContent = `${meta.subtitle}。你完成了 ${meta.name}季的全部 6 个习俗小游戏。`;
    if (index < SEASON_ORDER.length - 1) {
      els.nextSeasonBtn.textContent = `前往${DATA.seasons[SEASON_ORDER[index + 1]].name}之章`;
      els.nextSeasonBtn.dataset.next = SEASON_ORDER[index + 1];
    } else {
      els.nextSeasonBtn.textContent = '展开四季总卷';
      els.nextSeasonBtn.dataset.next = 'final';
    }
    els.chapterOverlay.hidden = false;
    playSound('complete');
  }

  function showFinal() {
    els.chapterOverlay.hidden = true;
    els.finalOverlay.hidden = false;
    els.finalScore.textContent = `24 / 24 节气碑 · ${totalStars()} / 72 星`;
    playSound('complete');
  }

  function resetAndReplay() {
    state.save = defaultSave();
    persist();
    els.finalOverlay.hidden = true;
    state.season = 'spring';
    renderHUD();
    enterWorld('spring');
    showToast('四季行旅重新开始');
  }

  /* ------------------------------- Input -------------------------------- */

  function setJoystickFromEvent(event) {
    const rect = els.joystick.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const max = rect.width * .32;
    const length = Math.hypot(dx, dy);
    const scale = length > max ? max / length : 1;
    const x = dx * scale;
    const y = dy * scale;
    state.joystick.x = x / max;
    state.joystick.y = y / max;
    els.joystickStick.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }

  function resetJoystick() {
    state.joystick.x = 0;
    state.joystick.y = 0;
    els.joystickStick.style.transform = 'translate(-50%, -50%)';
  }

  function bindEvents() {
    els.startBtn.addEventListener('click', () => enterWorld(state.season));
    els.continueBtn.addEventListener('click', () => enterWorld(state.save.currentSeason || state.season));
    els.menuBtn.addEventListener('click', () => returnToMenu());
    els.soundBtn.addEventListener('click', toggleSound);
    els.actionBtn.addEventListener('pointerdown', event => { event.preventDefault(); interact(); });
    els.miniClose.addEventListener('click', () => closeMini(false));
    els.staySeasonBtn.addEventListener('click', () => { els.chapterOverlay.hidden = true; });
    els.nextSeasonBtn.addEventListener('click', () => {
      const next = els.nextSeasonBtn.dataset.next;
      els.chapterOverlay.hidden = true;
      if (next === 'final') showFinal();
      else if (next) switchSeason(next);
    });
    els.replayBtn.addEventListener('click', resetAndReplay);

    document.addEventListener('click', event => {
      const menuSeason = event.target.closest('[data-menu-season]');
      if (menuSeason && !menuSeason.disabled) {
        state.season = menuSeason.dataset.menuSeason;
        renderHUD();
        showToast(`${DATA.seasons[state.season].title} · ${DATA.seasons[state.season].motto}`);
        return;
      }
      const seasonTab = event.target.closest('[data-season]');
      if (seasonTab && !seasonTab.disabled) switchSeason(seasonTab.dataset.season);
    });

    document.addEventListener('keydown', event => {
      const key = event.key;
      if (state.mode === 'mini') {
        if (miniKey(event, key)) event.preventDefault();
        return;
      }
      if (state.mode === 'menu') {
        if (key === 'Enter') { event.preventDefault(); enterWorld(state.season); }
        return;
      }
      if (state.mode === 'world') {
        const lower = key.toLowerCase();
        if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'e'].includes(lower)) event.preventDefault();
        if (lower === 'w' || lower === 'arrowup') state.keys.w = true;
        if (lower === 's' || lower === 'arrowdown') state.keys.s = true;
        if (lower === 'a' || lower === 'arrowleft') state.keys.a = true;
        if (lower === 'd' || lower === 'arrowright') state.keys.d = true;
        if (lower === 'arrowup') state.keys.arrowup = true;
        if (lower === 'arrowdown') state.keys.arrowdown = true;
        if (lower === 'arrowleft') state.keys.arrowleft = true;
        if (lower === 'arrowright') state.keys.arrowright = true;
        if (lower === 'e' || key === ' ') interact();
        if (key === 'Escape') returnToMenu();
      }
    });
    document.addEventListener('keyup', event => {
      const lower = event.key.toLowerCase();
      if (lower === 'w' || lower === 'arrowup') { state.keys.w = false; state.keys.arrowup = false; }
      if (lower === 's' || lower === 'arrowdown') { state.keys.s = false; state.keys.arrowdown = false; }
      if (lower === 'a' || lower === 'arrowleft') { state.keys.a = false; state.keys.arrowleft = false; }
      if (lower === 'd' || lower === 'arrowright') { state.keys.d = false; state.keys.arrowright = false; }
    });

    const joystickMove = event => {
      event.preventDefault();
      setJoystickFromEvent(event);
    };
    els.joystick.addEventListener('pointerdown', event => {
      els.joystick.setPointerCapture(event.pointerId);
      joystickMove(event);
    });
    els.joystick.addEventListener('pointermove', event => { if (event.buttons) joystickMove(event); });
    els.joystick.addEventListener('pointerup', resetJoystick);
    els.joystick.addEventListener('pointercancel', resetJoystick);

    els.miniCanvas.addEventListener('pointerdown', miniPointerDown);
    els.miniCanvas.addEventListener('pointermove', miniPointerMove);
    els.miniCanvas.addEventListener('pointerup', miniPointerUp);
    els.miniCanvas.addEventListener('pointercancel', miniPointerUp);
    window.addEventListener('blur', () => { state.keys = {}; resetJoystick(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persist(); });
    window.addEventListener('resize', () => {
      els.touchControls.hidden = !isTouchLike() || state.mode !== 'world';
      if (state.mode === 'menu') renderMenuSeasons();
    });
  }

  /* -------------------------------- Loop -------------------------------- */

  function loop(timestamp) {
    if (!state.lastTime) state.lastTime = timestamp;
    const dt = Math.min(.04, Math.max(0, (timestamp - state.lastTime) / 1000));
    state.lastTime = timestamp;
    state.weatherTime += dt;
    if (state.mode === 'menu') {
      state.menuTime += dt;
      const meta = DATA.seasons[state.season];
      state.player.x = meta.start.x;
      state.player.y = meta.start.y;
      state.camera.x = clamp(meta.start.x - els.canvas.clientWidth / 2 + Math.sin(state.menuTime * .18) * 80, 0, Math.max(0, WORLD.width - els.canvas.clientWidth));
      state.camera.y = clamp(meta.start.y - els.canvas.clientHeight / 2 + Math.cos(state.menuTime * .14) * 45, 0, Math.max(0, WORLD.height - els.canvas.clientHeight));
      state.nearTerm = null;
    } else if (state.mode === 'world') {
      updateWorld(dt);
    }
    drawWorld(state.weatherTime);
    state.worldFrame = requestAnimationFrame(loop);
  }

  function init() {
    if (!window.JOURNEY_DATA) {
      console.error('节气数据未加载');
      return;
    }
    cacheElements();
    setupDecorations();
    setupCanvas();
    state.save = loadSave();
    state.season = SEASON_ORDER.includes(state.save.currentSeason) && seasonUnlocked(state.save.currentSeason) ? state.save.currentSeason : 'spring';
    state.player = { ...DATA.seasons[state.season].start, facing: 'down', moving: false, step: 0 };
    if (!isTouchLike()) els.touchControls.hidden = true;
    setSeasonTheme(state.season);
    bindEvents();
    renderHUD();
    returnToMenu();
    state.lastTime = performance.now();
    state.worldFrame = requestAnimationFrame(loop);
    console.info('节气行旅已启动：4 季 × 6 个习俗小游戏');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  // Read-only test surface for automated smoke tests.
  window.JourneyDebug = {
    state,
    completeCurrentMini: () => { if (state.mini && !state.mini.finished) finishMini(); },
    showFinalOverlay: () => showFinal(),
    enterSeason: season => { state.season = season; enterWorld(season); },
    teleportToTerm: id => {
      const term = TERM_BY_ID[id];
      if (!term) return;
      state.player.x = term.position.x;
      state.player.y = term.position.y;
      updateCamera(true);
      updatePrompt();
    },
    getData: () => DATA
  };
})();
