/* 节气行旅 · 四季探索版 */
(function () {
  'use strict';

  const DATA = window.JOURNEY_DATA;
  const SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter'];
  const TERMS = DATA.terms;
  const TERM_BY_ID = Object.fromEntries(TERMS.map(term => [term.id, term]));
  const SAVE_KEY = 'jieqi-journey-save-v3';
  const SAVE_SCHEMA_VERSION = 3;
  const LEGACY_SAVE_KEYS = ['jieqi-journey-save-v2', 'jieqi-journey-save-v1'];
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
      schemaVersion: SAVE_SCHEMA_VERSION,
      starsMode: 'best',
      version: DATA.version,
      stations: {},
      currentSeason: 'spring',
      chapterCelebrated: {},
      sound: true,
      updatedAt: new Date().toISOString()
    };
  }

  function normalizeStars(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return clamp(Math.floor(number), 0, 3);
  }

  function normalizeStationRecord(record) {
    if (!record || typeof record !== 'object') return null;
    const complete = Boolean(record.complete);
    return {
      complete,
      stars: complete ? normalizeStars(record.stars) : 0,
      bestScore: Math.max(0, Number(record.bestScore) || 0),
      lastScore: Math.max(0, Number(record.lastScore) || 0),
      lastStars: complete ? normalizeStars(record.lastStars ?? record.stars) : 0,
      attempts: Math.max(0, Math.floor(Number(record.attempts) || 0)),
      completedAt: typeof record.completedAt === 'string' ? record.completedAt : null
    };
  }

  function loadSave() {
    const fallback = defaultSave();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      const stations = {};
      if (parsed.stations && typeof parsed.stations === 'object') {
        for (const [termId, record] of Object.entries(parsed.stations)) {
          if (!TERM_BY_ID[termId]) continue;
          const normalized = normalizeStationRecord(record);
          if (normalized) stations[termId] = normalized;
        }
      }
      return {
        ...fallback,
        ...parsed,
        schemaVersion: SAVE_SCHEMA_VERSION,
        starsMode: 'best',
        version: DATA.version,
        stations,
        chapterCelebrated: parsed.chapterCelebrated && typeof parsed.chapterCelebrated === 'object' ? parsed.chapterCelebrated : {}
      };
    } catch (error) {
      return fallback;
    }
  }

  function persist() {
    state.save.schemaVersion = SAVE_SCHEMA_VERSION;
    state.save.starsMode = 'best';
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

  function stationBestStars(termId) {
    const record = state.save.stations[termId];
    return record?.complete ? normalizeStars(record.stars) : 0;
  }

  function seasonStars(season) {
    return seasonTerms(season).reduce((sum, term) => sum + stationBestStars(term.id), 0);
  }

  function seasonGatePassed(season) {
    return seasonStars(season) > 12;
  }

  function seasonUnlocked(season) {
    const index = SEASON_ORDER.indexOf(season);
    return index === 0 || (seasonComplete(SEASON_ORDER[index - 1]) && seasonGatePassed(SEASON_ORDER[index - 1]));
  }

  function firstUnlockedSeason() {
    return SEASON_ORDER.find(season => !seasonComplete(season) && seasonUnlocked(season)) || 'winter';
  }

  function totalStars() {
    return TERMS.reduce((sum, term) => sum + stationBestStars(term.id), 0);
  }

  function hasProgress() {
    return Object.values(state.save.stations).some(record => record?.complete || normalizeStars(record?.stars) > 0);
  }

  function allSeasonsComplete() {
    return SEASON_ORDER.every(season => seasonComplete(season) && seasonGatePassed(season));
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
      resetBtn: $('#resetBtn'),
      menuSeasons: $('#menuSeasons'),
      seasonTabs: $('#seasonTabs'),
      stationCount: $('#stationCount'),
      starCount: $('#starCount'),
      soundBtn: $('#soundBtn'),
      weatherChip: $('#weatherChip'),
      weatherLabel: $('#weatherLabel'),
      worldHelp: $('#worldHelp'),
      prompt: $('#interactionPrompt'),
      promptLabel: $('#promptLabel'),
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
      miniStartBtn: $('#miniStartBtn'),
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
    els.starCount.textContent = `★ ${seasonStars(state.season)} / 18`;
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
        <strong>${item.name}</strong><small>${unlocked ? `${completedCount(season)} / 6 · ${seasonStars(season)} / 18 星` : `上一季需超过 12 星`}</small>
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
    const progressExists = hasProgress();
    els.resetBtn.hidden = !progressExists;
    els.startBtn.textContent = progressExists ? '继续行旅' : '开始行旅';
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

  function nearPortal() {
    const meta = DATA.seasons[state.season];
    return distance(state.player, meta.portal) < 145;
  }

  function usePortal() {
    const index = SEASON_ORDER.indexOf(state.season);
    if (!seasonComplete(state.season)) {
      showToast(`还有 ${6 - completedCount(state.season)} 个节气碑未完成，先完成本季全部关卡。`);
      return;
    }
    if (!seasonGatePassed(state.season)) {
      showToast(`本季还需 ${13 - seasonStars(state.season)} 颗星才能开启“往”星门。`);
      return;
    }
    if (index >= SEASON_ORDER.length - 1) {
      if (allSeasonsComplete()) showFinal();
      else showToast('先完成其他季节的全部节气碑。');
      return;
    }
    const next = SEASON_ORDER[index + 1];
    switchSeason(next);
    showToast(`穿过星门，抵达${DATA.seasons[next].name}之章`);
  }

  function interact() {
    if (state.mode === 'mini') return miniAction();
    if (state.mode !== 'world') return;
    const term = nearestTerm();
    if (term) {
      openMiniGame(term);
      return;
    }
    if (nearPortal()) {
      usePortal();
      return;
    }
    showToast('靠近发光的节气碑或“往”星门，再按 E 互动。');
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
    const isLast = SEASON_ORDER.indexOf(season) === SEASON_ORDER.length - 1;
    const ready = seasonGatePassed(season);
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
    ctx.fillText(ready ? (isLast ? '卷' : '往') : '锁', 0, 2);
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
    if (state.mode !== 'world') {
      els.prompt.hidden = true;
      state.nearTerm = null;
      return;
    }
    state.nearTerm = term;
    const key = $('.interaction-prompt__key', els.prompt);
    if (term) {
      const record = stationRecord(term.id);
      const complete = Boolean(record?.complete);
      const bestStars = stationBestStars(term.id);
      els.promptLabel.textContent = complete ? `历史最佳 ${'★'.repeat(bestStars)}` : '靠近节气碑';
      els.nearStationName.textContent = `${term.name} · ${term.custom}${complete ? ' · 重玩不累加' : ''}`;
      if (key) key.textContent = isTouchLike() ? '入' : 'E';
      els.actionBtn.textContent = '入';
      els.actionBtn.setAttribute('aria-label', `进入${term.name}${term.custom}小游戏`);
      els.prompt.hidden = false;
      return;
    }
    if (nearPortal()) {
      const index = SEASON_ORDER.indexOf(state.season);
      const passed = seasonComplete(state.season) && seasonGatePassed(state.season);
      const next = SEASON_ORDER[index + 1];
      const remainingStars = Math.max(0, 13 - seasonStars(state.season));
      const remainingTerms = 6 - completedCount(state.season);
      els.promptLabel.textContent = passed ? '星门已开启 · 点击前往' : remainingTerms > 0 ? `还需完成 ${remainingTerms} 个节气碑` : `还需 ${remainingStars} 颗星`;
      els.nearStationName.textContent = passed
        ? (next ? `前往${DATA.seasons[next].name}之章` : '展开四季总卷')
        : '在节气碑重玩，争取更高星级';
      if (key) key.textContent = '往';
      els.actionBtn.textContent = '往';
      els.actionBtn.setAttribute('aria-label', '使用星门前往下一季');
      els.prompt.hidden = false;
      return;
    }
    els.actionBtn.textContent = '行';
    els.actionBtn.setAttribute('aria-label', '互动');
    els.prompt.hidden = true;
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
      started: false, flash: '', flashTimer: 0, last: performance.now()
    };
    initializeMini(state.mini);
    els.miniSeason.textContent = `${meta.name}之章 · ${term.name}`;
    els.miniTitle.textContent = term.game.title;
    els.miniCustom.textContent = term.custom;
    els.miniHint.textContent = term.game.hint;
    els.miniOverlay.hidden = false;
    els.miniStartBtn.hidden = false;
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
      mini.timeLimit = mini.game.timeLimit || 20;
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
    } else if (mini.type === 'assemble') {
      mini.pieces = mini.game.pieces.map((piece, index) => ({ ...piece, index, x: 90 + index * 156, y: 468, placed: false }));
      mini.dragging = null;
      mini.dragX = 0;
      mini.dragY = 0;
      mini.targets = [
        { kind: 'spine', x: 480, y: 235 },
        { kind: 'spar', x: 480, y: 235 },
        { kind: 'sail', x: 480, y: 235 },
        { kind: 'ribbonLeft', x: 408, y: 360 },
        { kind: 'ribbonRight', x: 552, y: 360 },
        { kind: 'spool', x: 760, y: 430 }
      ];
      mini.assembleOrder = ['spine', 'spar', 'sail', 'ribbonLeft', 'ribbonRight', 'spool'];
      mini.nextPiece = 0;
      mini.timeLimit = mini.game.timeLimit || 45;
    } else if (mini.type === 'weather') {
      mini.round = 0;
      mini.weatherPattern = [1, 0, 1, 1, 0, 0];
      mini.weatherIndex = 0;
      mini.lockTimer = 0;
      mini.roundClock = 0;
      mini.roundLimit = 2.4;
      mini.finishAt = null;
    } else if (mini.type === 'fold') {
      mini.round = 0;
      mini.folding = false;
      mini.foldStart = null;
      mini.foldDelta = 0;
      mini.lockTimer = 0;
    } else if (mini.type === 'salt') {
      mini.coverage = new Array(mini.game.strips || 3).fill(0);
      mini.holding = false;
      mini.activeStrip = -1;
    } else if (mini.type === 'wipe') {
      mini.patches = Array.from({ length: mini.game.patches || 6 }, (_, i) => ({ x: 220 + (i % 3) * 260, y: 230 + Math.floor(i / 3) * 150, r: 58, cleared: false }));
      mini.wiping = false;
    } else if (mini.type === 'roll') {
      mini.round = 0;
      mini.rollAngle = 0;
      mini.rotations = 0;
      mini.rolling = false;
      mini.centers = [{ x: 300, y: 300 }, { x: 480, y: 300 }, { x: 660, y: 300 }];
    } else if (mini.type === 'pour') {
      mini.index = 0;
      mini.dragging = null;
      mini.dragX = 0;
      mini.dragY = 0;
      mini.pot = { x: 480, y: 330, r: 92 };
    } else if (mini.type === 'sweep') {
      const random = seededRandom(20261025 + mini.term.id.length);
      mini.spots = Array.from({ length: mini.game.spots || 8 }, () => ({ x: 180 + random() * 600, y: 150 + random() * 300, r: 28 + random() * 14, cleared: false }));
      mini.sweeping = false;
      mini.lastX = 0;
      mini.lastY = 0;
    } else if (mini.type === 'duel') {
      mini.successes = 0;
      mini.round = 0;
      mini.opponentX = 310;
      mini.opponentDir = 1;
      mini.playerX = MINI.width / 2;
      mini.lockTimer = 0;
      mini.finishAt = null;
    } else if (mini.type === 'pump') {
      mini.strokes = 0;
      mini.lastSide = null;
      mini.pumpPulse = 0;
      mini.wheelAngle = 0;
      mini.waterLevel = .18;
      mini.buttons = [
        { x: 165, y: 360, w: 190, h: 108, index: 0, label: '左脚' },
        { x: 605, y: 360, w: 190, h: 108, index: 1, label: '右脚' }
      ];
    } else if (mini.type === 'plant') {
      mini.plots = Array.from({ length: mini.game.slots || 9 }, (_, i) => ({ x: 300 + (i % 3) * 180, y: 180 + Math.floor(i / 3) * 105, planted: false }));
      mini.dragging = false;
      mini.planted = 0;
    } else if (mini.type === 'noodle') {
      const count = mini.game.points || 17;
      mini.tracePoints = Array.from({ length: count }, (_, i) => ({ x: 165 + i * (630 / (count - 1)), y: 292 + Math.sin(i * .8) * 82 }));
      mini.traceIndex = 0;
      mini.tracing = false;
      mini.traceMistakes = 0;
    } else if (mini.type === 'hang') {
      mini.items = mini.game.items.map((item, index) => ({ ...item, index, x: 155 + index * 130, y: 470, hung: false }));
      mini.dragging = null;
      mini.hung = 0;
    } else if (mini.type === 'lantern') {
      mini.progress = 0;
      mini.lanternX = MINI.width / 2;
      mini.velocity = 0;
      mini.hits = 0;
      mini.rockRows = [
        { progress: .24, x: 305, hit: false },
        { progress: .45, x: 500, hit: false },
        { progress: .66, x: 650, hit: false },
        { progress: .83, x: 380, hit: false }
      ].slice(0, mini.game.rocks || 4);
    } else if (mini.type === 'dew') {
      const count = mini.game.drops || 8;
      mini.drops = Array.from({ length: count }, (_, i) => ({
        x: 210 + (i % 4) * 180 + (i % 2) * 18,
        y: 160 + Math.floor(i / 4) * 210 + (i % 3) * 24,
        life: 4.2 + (i % 4) * .55,
        maxLife: 4.2 + (i % 4) * .55,
        caught: false
      }));
      mini.caught = 0;
      mini.respawnIndex = 0;
    } else if (mini.type === 'moon') {
      mini.offsets = [3, 6, 4];
      mini.rotations = 1;
      mini.finishAt = null;
    } else if (mini.type === 'climb') {
      mini.stones = Array.from({ length: mini.game.stones || 10 }, (_, i) => ({
        x: 165 + i * 68 + Math.sin(i * 1.2) * 24,
        y: 465 - i * 37,
        cleared: false
      }));
      mini.nextStone = 0;
      mini.finishAt = null;
    } else if (mini.type === 'shake') {
      mini.treeSway = 0;
      mini.fruits = mini.game.fruits || 5;
      mini.shakeCount = 0;
      mini.shaking = false;
      mini.lastX = MINI.width / 2;
      mini.cooldown = 0;
    }
  }

  function startMiniGame() {
    const mini = state.mini;
    if (!mini || mini.started) return;
    mini.started = true;
    mini.last = performance.now();
    els.miniStartBtn.hidden = true;
    playSound('open');
  }

  function restartMini() {
    const mini = state.mini;
    if (!mini) return;
    initializeMini(mini);
    mini.started = true;
    mini.last = performance.now();
    els.miniStartBtn.hidden = true;
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
    if (!mini.started) return;
    const point = miniPoint(event);
    try { els.miniCanvas.setPointerCapture(event.pointerId); } catch (error) {}
    mini.pointerX = point.x;
    mini.pointerY = point.y;
    mini.pointerActive = true;
    if (mini.failed) { restartMini(); return; }
    if (mini.finished) return;
    if (mini.type === 'rhythm' || mini.type === 'timing') { miniAction(); return; }
    if (mini.type === 'weather') {
      const button = mini.buttons.find(b => point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h);
      if (button) chooseWeather(button.index);
    } else if (mini.type === 'sort') {
      const button = mini.buttons.find(b => point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h);
      if (button) chooseSort(button.index);
    } else if (mini.type === 'sequence') {
      const button = mini.buttons.find(b => point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h);
      if (button) chooseSequence(button.index);
    } else if (mini.type === 'assemble') {
      const piece = mini.pieces.find(item => !item.placed && Math.abs(item.x - point.x) < 72 && Math.abs(item.y - point.y) < 40);
      if (piece) mini.dragging = piece.index;
    } else if (mini.type === 'pour') {
      const index = mini.game.ingredients.findIndex((item, i) => i >= mini.index && point.x > 140 + i * 220 && point.x < 280 + i * 220 && point.y > 408 && point.y < 500);
      if (index >= 0) mini.dragging = index;
    } else if (mini.type === 'fold') {
      if (Math.abs(point.x - MINI.width / 2) < 150 && Math.abs(point.y - 270) < 115) {
        mini.folding = true;
        mini.foldStart = point.x;
        mini.foldDelta = 0;
      }
    } else if (mini.type === 'salt') {
      mini.holding = true;
      mini.activeStrip = point.y > 145 && point.y < 465 ? clamp(Math.floor((point.y - 145) / 115), 0, mini.coverage.length - 1) : -1;
    } else if (mini.type === 'wipe') {
      mini.wiping = true;
      clearWipePatches(mini, point);
    } else if (mini.type === 'roll') {
      const center = mini.centers[Math.min(mini.round, mini.centers.length - 1)];
      if (center && distance(point, center) < 100) {
        mini.rolling = true;
        mini.lastAngle = Math.atan2(point.y - center.y, point.x - center.x);
        mini.rollTotal = 0;
      }
    } else if (mini.type === 'sweep') {
      mini.sweeping = true;
      mini.lastX = point.x;
      mini.lastY = point.y;
    } else if (mini.type === 'duel') {
      mini.playerX = clamp(point.x, 120, MINI.width - 120);
      strikeDuel();
    } else if (mini.type === 'pump') {
      const button = mini.buttons.find(item => point.x >= item.x && point.x <= item.x + item.w && point.y >= item.y && point.y <= item.y + item.h);
      if (button) pumpStroke(button.index);
    } else if (mini.type === 'plant') {
      if (point.y > 425) mini.dragging = true;
    } else if (mini.type === 'noodle') {
      const start = mini.tracePoints[0];
      if (distance(point, start) < 62) {
        mini.tracing = true;
        trailNoodle(point);
      }
    } else if (mini.type === 'hang') {
      const item = mini.items.find(piece => !piece.hung && Math.abs(piece.x - point.x) < 55 && Math.abs(piece.y - point.y) < 55);
      if (item) mini.dragging = item.index;
    } else if (mini.type === 'lantern') {
      mini.velocity += point.x < MINI.width / 2 ? -4.4 : 4.4;
      mini.flash = point.x < MINI.width / 2 ? '左岸推流' : '右岸推流';
      mini.flashTimer = .22;
    } else if (mini.type === 'dew') {
      collectDew(point);
    } else if (mini.type === 'moon') {
      const radius = distance(point, { x: MINI.width / 2, y: 286 });
      if (radius >= 28 && radius < 82) rotateMoonRing(0);
      else if (radius >= 82 && radius < 132) rotateMoonRing(1);
      else if (radius >= 132 && radius < 184) rotateMoonRing(2);
    } else if (mini.type === 'climb') {
      const stoneIndex = mini.stones.findIndex(stone => distance(point, stone) < 31);
      if (stoneIndex >= 0) stepClimb(stoneIndex);
    } else if (mini.type === 'shake') {
      if (point.x > 250 && point.x < 710 && point.y > 80 && point.y < 470) {
        mini.shaking = true;
        mini.lastX = point.x;
        mini.shakeTravel = 0;
      }
    }
  }

  function miniPointerMove(event) {
    const mini = state.mini;
    if (!mini || !mini.started || mini.finished || mini.failed) return;
    const point = miniPoint(event);
    mini.pointerX = point.x;
    mini.pointerY = point.y;
    if (mini.type === 'collect' || mini.type === 'path') mini.pointerActive = true;
    if (mini.type === 'duel') mini.playerX = clamp(point.x, 120, MINI.width - 120);
    if (mini.type === 'noodle' && mini.tracing) trailNoodle(point);
    if (mini.type === 'shake' && mini.shaking) {
      const moveX = Math.abs(point.x - mini.lastX);
      mini.shakeTravel = (mini.shakeTravel || 0) + moveX;
      mini.treeSway = Math.sin((mini.shakeTravel / 22) * Math.PI) * 5;
      mini.lastX = point.x;
      while (mini.shakeTravel >= 145 && mini.fruits > 0) {
        mini.shakeTravel -= 145;
        dropPersimmon();
      }
    }
    if (mini.type === 'fold' && mini.folding && mini.foldStart !== null) {
      mini.foldDelta = point.x - mini.foldStart;
    }
    if (mini.type === 'salt' && mini.holding) {
      mini.activeStrip = point.y > 145 && point.y < 465 ? clamp(Math.floor((point.y - 145) / 115), 0, mini.coverage.length - 1) : -1;
    }
    if (mini.type === 'wipe' && mini.wiping) clearWipePatches(mini, point);
    if (mini.type === 'roll' && mini.rolling) {
      const center = mini.centers[Math.min(mini.round, mini.centers.length - 1)];
      if (center) {
        const angle = Math.atan2(point.y - center.y, point.x - center.x);
        let delta = angle - mini.lastAngle;
        if (delta > Math.PI) delta -= TAU;
        if (delta < -Math.PI) delta += TAU;
        mini.rollTotal += Math.abs(delta);
        mini.rollAngle += delta;
        mini.lastAngle = angle;
        if (mini.rollTotal >= TAU * .86) {
          mini.round += 1;
          mini.rollTotal = 0;
          mini.flash = '汤圆圆了';
          mini.flashTimer = .35;
          playSound('correct');
          if (mini.round >= mini.game.rounds) finishMini();
        }
      }
    }
    if (mini.type === 'sweep' && mini.sweeping) {
      const move = Math.hypot(point.x - mini.lastX, point.y - mini.lastY);
      if (move > 16) {
        mini.spots.forEach(spot => {
          if (!spot.cleared && distance(point, spot) < spot.r + 24) {
            spot.hits = (spot.hits || 0) + 1;
            if (spot.hits >= 2) {
              spot.cleared = true;
              mini.flash = '扫净了';
              mini.flashTimer = .25;
              playSound('tick');
            }
          }
        });
        mini.lastX = point.x;
        mini.lastY = point.y;
      }
      if (mini.spots.every(spot => spot.cleared)) finishMini();
    }
  }

  function clearWipePatches(mini, point) {
    mini.patches.forEach(patch => {
      if (!patch.cleared && distance(point, patch) < patch.r + 22) {
        patch.cleared = true;
        mini.flash = '雪扫开了';
        mini.flashTimer = .25;
        playSound('tick');
      }
    });
    if (mini.patches.every(patch => patch.cleared)) finishMini();
  }

  function miniPointerUp(event) {
    const mini = state.mini;
    if (!mini) return;
    if (event) {
      const point = miniPoint(event);
      mini.pointerX = point.x;
      mini.pointerY = point.y;
    }
    if (mini.type === 'path') mini.pointerActive = false;
    if (mini.type === 'noodle') mini.tracing = false;
    if (mini.type === 'shake') mini.shaking = false;
    if (mini.type === 'plant' && mini.dragging) {
      const plot = mini.plots.find(item => !item.planted && distance(item, { x: mini.pointerX, y: mini.pointerY }) < 55);
      if (plot) {
        plot.planted = true;
        mini.planted += 1;
        mini.flash = '栽下一株';
        mini.flashTimer = .3;
        playSound('tick');
        if (mini.planted >= mini.plots.length) finishMini();
      } else {
        mini.mistakes += 1;
        mini.flash = '对准水田格';
        mini.flashTimer = .3;
        playSound('error');
      }
      mini.dragging = false;
    }
    if (mini.type === 'hang' && mini.dragging !== null) {
      const item = mini.items[mini.dragging];
      const rack = mini.game.categories.find((category, index) => {
        const left = index === 0 ? 110 : 540;
        return mini.pointerX >= left && mini.pointerX <= left + 310 && mini.pointerY >= 130 && mini.pointerY <= 390;
      });
      if (rack && rack.cat === item.cat) {
        item.hung = true;
        mini.hung += 1;
        mini.flash = `挂上${rack.name}`;
        mini.flashTimer = .3;
        playSound('tick');
        if (mini.hung >= mini.items.length) finishMini();
      } else {
        mini.mistakes += 1;
        mini.flash = '颜色不匹配';
        mini.flashTimer = .3;
        playSound('error');
      }
      mini.dragging = null;
    }
    if (mini.type === 'assemble' && mini.dragging !== null) {
      const piece = mini.pieces[mini.dragging];
      const target = mini.targets.find(item => item.kind === piece.kind && Math.abs(item.x - mini.pointerX) < 92 && Math.abs(item.y - mini.pointerY) < 92);
      const expected = mini.assembleOrder[mini.nextPiece];
      if (target && piece.kind === expected) {
        piece.placed = true;
        mini.nextPiece += 1;
        mini.flash = '装好了';
        mini.flashTimer = .3;
        playSound('tick');
        if (mini.pieces.every(item => item.placed)) finishMini();
      } else if (target) {
        mini.mistakes += 1;
        mini.flash = '按竹骨、纸面、尾线的顺序';
        mini.flashTimer = .5;
        playSound('error');
      } else {
        mini.mistakes += 1;
        mini.flash = '还没对准';
        mini.flashTimer = .3;
        playSound('error');
      }
      mini.dragging = null;
    }
    if (mini.type === 'pour' && mini.dragging !== null) {
      const distanceToPot = distance({ x: mini.pointerX, y: mini.pointerY }, mini.pot);
      if (distanceToPot < mini.pot.r + 24 && mini.dragging === mini.index) {
        mini.index += 1;
        mini.flash = '下锅了';
        mini.flashTimer = .3;
        playSound('tick');
        if (mini.index >= mini.game.ingredients.length) finishMini();
      } else {
        mini.mistakes += 1;
        mini.flash = '顺序不对';
        mini.flashTimer = .3;
        playSound('error');
      }
      mini.dragging = null;
    }
    if (mini.type === 'fold' && mini.folding) {
      if (mini.foldDelta > 65) {
        mini.round += 1;
        mini.flash = '包好一只';
        mini.flashTimer = .3;
        playSound('correct');
        if (mini.round >= mini.game.rounds) finishMini();
      } else if (mini.foldDelta < -20) {
        mini.mistakes += 1;
        playSound('error');
      }
      mini.folding = false;
      mini.foldStart = null;
      mini.foldDelta = 0;
    }
    if (mini.type === 'salt') mini.holding = false;
    if (mini.type === 'wipe') mini.wiping = false;
    if (mini.type === 'roll') mini.rolling = false;
    if (mini.type === 'sweep') mini.sweeping = false;
  }

  function miniAction() {
    const mini = state.mini;
    if (!mini) return;
    if (!mini.started) { startMiniGame(); return; }
    if (mini.failed) { restartMini(); return; }
    if (mini.finished) return;
    if (mini.type === 'rhythm') hitRhythm();
    else if (mini.type === 'timing') hitTiming();
    else if (mini.type === 'duel') strikeDuel();
    else if (mini.type === 'shake') dropPersimmon();
  }

  function miniKey(event, key) {
    const mini = state.mini;
    if (!mini) return false;
    if (event.key === 'Escape') { closeMini(false); return true; }
    if (!mini.started) {
      if (event.key === ' ' || event.key === 'Enter') { startMiniGame(); return true; }
      return false;
    }
    if (mini.failed) {
      if (event.key === ' ' || event.key === 'Enter') { restartMini(); return true; }
      return false;
    }
    if (mini.finished) return true;
    if (mini.type === 'rhythm' || mini.type === 'timing' || mini.type === 'duel' || mini.type === 'shake') {
      if (event.key === ' ' || event.key === 'Enter') { miniAction(); return true; }
    }
    if (mini.type === 'duel') {
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') { mini.playerX = clamp(mini.playerX - 42, 120, MINI.width - 120); return true; }
      if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') { mini.playerX = clamp(mini.playerX + 42, 120, MINI.width - 120); return true; }
    }
    if (mini.type === 'pump') {
      if (event.key === 'a' || event.key === 'A' || event.key === 'ArrowLeft') { pumpStroke(0); return true; }
      if (event.key === 'd' || event.key === 'D' || event.key === 'ArrowRight') { pumpStroke(1); return true; }
    }
    if (mini.type === 'lantern') {
      if (event.key === 'a' || event.key === 'A' || event.key === 'ArrowLeft') { mini.velocity -= 130; return true; }
      if (event.key === 'd' || event.key === 'D' || event.key === 'ArrowRight') { mini.velocity += 130; return true; }
    }
    if (mini.type === 'weather' && /^[12]$/.test(event.key)) { chooseWeather(Number(event.key) - 1); return true; }
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
    else if (mini.type === 'weather') updateWeather(mini, dt);
    else if (mini.type === 'fold') updateFold(mini, dt);
    else if (mini.type === 'salt') updateSalt(mini, dt);
    else if (mini.type === 'roll') updateRoll(mini, dt);
    else if (mini.type === 'duel') updateDuel(mini, dt);
    else if (mini.type === 'pump') updatePump(mini, dt);
    else if (mini.type === 'noodle') updateNoodle(mini, dt);
    else if (mini.type === 'lantern') updateLantern(mini, dt);
    else if (mini.type === 'dew') updateDew(mini, dt);
    else if (mini.type === 'moon') updateMoon(mini, dt);
    else if (mini.type === 'climb') updateClimb(mini, dt);
    else if (mini.type === 'shake') updateShake(mini, dt);
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
    mini.started = true;
    els.miniStartBtn.hidden = true;
    const stars = mini.mistakes === 0 ? 3 : mini.mistakes <= 2 ? 2 : 1;
    const score = Math.max(250, 1000 - mini.mistakes * 120 - Math.max(0, Math.round(mini.elapsed * 2)));
    mini.stars = stars; mini.score = score;
    const term = mini.term;
    const previous = state.save.stations[term.id] || {};
    const bestStars = Math.max(normalizeStars(previous.stars), normalizeStars(stars));
    state.save.stations[term.id] = {
      complete: true,
      stars: bestStars,
      bestScore: Math.max(Number(previous.bestScore) || 0, score),
      lastScore: score,
      lastStars: normalizeStars(stars),
      attempts: Math.max(0, Math.floor(Number(previous.attempts) || 0)) + 1,
      completedAt: previous.completedAt || new Date().toISOString()
    };
    persist(); renderHUD();
    playSound('complete');
    showToast(`${term.name} · ${term.custom}完成`);
    mini.closeTimer = setTimeout(() => { if (state.mini === mini) closeMini(true); }, 1500);
  }

  function updateAssemble(mini, dt) {
    if (mini.failed || mini.finished) return;
    if (mini.elapsed > mini.timeLimit) failMini('纸鸢还没装好，再试一次');
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
    if (mini.elapsed > mini.timeLimit) { failMini('分拣超时，再试一次'); return; }
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

  function strikeDuel() {
    const mini = state.mini;
    if (!mini || mini.type !== 'duel' || mini.finished || mini.lockTimer > 0 || mini.finishAt) return;
    if (Math.abs(mini.playerX - mini.opponentX) < 96) {
      mini.successes += 1;
      mini.round = mini.successes;
      mini.flash = '碰中了';
      mini.flashTimer = .4;
      mini.lockTimer = .5;
      playSound('correct');
      mini.opponentX = mini.opponentX < MINI.width / 2 ? MINI.width - 220 : 220;
      if (mini.successes >= (mini.game.rounds || 3)) mini.finishAt = mini.elapsed + .65;
    } else {
      mini.mistakes += 1;
      mini.flash = '差一点，再瞄准';
      mini.flashTimer = .4;
      mini.lockTimer = .24;
      playSound('error');
    }
  }

  function updateDuel(mini, dt) {
    if (mini.lockTimer > 0) mini.lockTimer -= dt;
    mini.opponentX += mini.opponentDir * dt * 265;
    if (mini.opponentX > MINI.width - 180) { mini.opponentX = MINI.width - 180; mini.opponentDir = -1; }
    if (mini.opponentX < 180) { mini.opponentX = 180; mini.opponentDir = 1; }
    if (mini.finishAt && mini.elapsed >= mini.finishAt) finishMini();
  }

  function pumpStroke(side) {
    const mini = state.mini;
    if (!mini || mini.type !== 'pump' || mini.finished || mini.finishAt) return;
    if (mini.lastSide === side) {
      mini.mistakes += 1;
      mini.flash = '换另一只脚';
      mini.flashTimer = .35;
      playSound('error');
      return;
    }
    mini.lastSide = side;
    mini.strokes += 1;
    mini.pumpPulse = 1;
    mini.wheelAngle += Math.PI / 3;
    mini.waterLevel = Math.min(1, mini.waterLevel + .09);
    mini.flash = side === 0 ? '左脚踩下' : '右脚踩下';
    mini.flashTimer = .22;
    playSound('tick');
    if (mini.strokes >= (mini.game.strokes || 8)) mini.finishAt = mini.elapsed + .55;
  }

  function updatePump(mini, dt) {
    mini.pumpPulse = Math.max(0, mini.pumpPulse - dt * 5);
    mini.wheelAngle += dt * (mini.strokes > 0 ? .75 : .12);
    if (mini.finishAt && mini.elapsed >= mini.finishAt) finishMini();
  }

  function trailNoodle(point) {
    const mini = state.mini;
    if (!mini || mini.type !== 'noodle' || !mini.tracing || mini.finished) return;
    while (mini.traceIndex < mini.tracePoints.length) {
      const next = mini.tracePoints[mini.traceIndex];
      if (distance(point, next) > 54) break;
      mini.traceIndex += 1;
    }
    if (mini.traceIndex >= mini.tracePoints.length) {
      mini.tracing = false;
      mini.flash = '面条拉成了';
      mini.flashTimer = .45;
      playSound('complete');
      mini.finishAt = mini.elapsed + .55;
    }
  }

  function updateNoodle(mini, dt) {
    if (mini.finishAt && mini.elapsed >= mini.finishAt) finishMini();
  }

  function updateLantern(mini, dt) {
    if (mini.finished || mini.failed) return;
    mini.progress = clamp(mini.progress + dt / 12, 0, 1);
    mini.velocity *= Math.pow(.2, dt);
    mini.velocity += Math.sin(mini.elapsed * 1.35) * 4 * dt;
    mini.lanternX = clamp(mini.lanternX + mini.velocity * dt, 115, MINI.width - 115);
    mini.rockRows.forEach(rock => {
      const y = 425 - (rock.progress - mini.progress) * 620;
      if (!rock.hit && Math.abs(y - 420) < 58 && Math.abs(mini.lanternX - rock.x) < 86) {
        rock.hit = true;
        mini.hits += 1;
        mini.mistakes += 1;
        mini.lanternX += mini.lanternX < rock.x ? -62 : 62;
        mini.flash = '触礁了，点岸边调流';
        mini.flashTimer = .45;
        playSound('error');
        if (mini.hits >= 3) { failMini('触礁三次，河灯熄灭，再试一次'); return; }
      }
    });
    if (mini.progress >= 1 && !mini.finishAt) mini.finishAt = mini.elapsed + .55;
    if (mini.finishAt && mini.elapsed >= mini.finishAt) finishMini();
  }

  function collectDew(point) {
    const mini = state.mini;
    if (!mini || mini.type !== 'dew' || mini.finished) return;
    const drop = mini.drops.find(item => !item.caught && item.life > 0 && distance(point, item) < 42);
    if (!drop) return;
    drop.caught = true;
    mini.caught += 1;
    mini.flash = '露水入盅';
    mini.flashTimer = .3;
    playSound('tick');
    if (mini.caught >= mini.drops.length) mini.finishAt = mini.elapsed + .5;
  }

  function updateDew(mini, dt) {
    mini.drops.forEach((drop, index) => {
      if (drop.caught) return;
      drop.life -= dt;
      if (drop.life <= 0) {
        const turn = mini.respawnIndex + index;
        mini.respawnIndex += 1;
        drop.x = 175 + ((turn * 137) % 610);
        drop.y = 150 + ((turn * 89) % 300);
        drop.life = 4.4;
        drop.maxLife = 4.4;
      }
    });
    if (mini.finishAt && mini.elapsed >= mini.finishAt) finishMini();
  }

  function rotateMoonRing(index) {
    const mini = state.mini;
    if (!mini || mini.type !== 'moon' || mini.finished || mini.finishAt) return;
    const steps = mini.game.steps || 8;
    const linkedRings = index === 0 ? [0, 1] : index === 1 ? [0, 1, 2] : [1, 2];
    linkedRings.forEach(ring => { mini.offsets[ring] = (mini.offsets[ring] + steps - 1) % steps; });
    mini.rotations += 1;
    mini.flash = ['内圈', '中圈', '外圈'][index] + '带动相邻礼盘';
    mini.flashTimer = .3;
    playSound('tick');
    if (mini.offsets.every(offset => offset === 0)) {
      mini.flash = '月纹归位';
      mini.flashTimer = .5;
      mini.finishAt = mini.elapsed + .65;
    }
  }

  function updateMoon(mini, dt) {
    if (mini.finishAt && mini.elapsed >= mini.finishAt) finishMini();
  }

  function stepClimb(index) {
    const mini = state.mini;
    if (!mini || mini.type !== 'climb' || mini.finished || mini.finishAt) return;
    if (index === mini.nextStone) {
      mini.stones[index].cleared = true;
      mini.nextStone += 1;
      mini.flash = `第 ${mini.nextStone} 级`;
      mini.flashTimer = .3;
      playSound('tick');
      if (mini.nextStone >= mini.stones.length) mini.finishAt = mini.elapsed + .65;
    } else {
      mini.mistakes += 1;
      mini.flash = '从下一块石阶开始';
      mini.flashTimer = .35;
      playSound('error');
    }
  }

  function updateClimb(mini, dt) {
    if (mini.finishAt && mini.elapsed >= mini.finishAt) finishMini();
  }

  function dropPersimmon() {
    const mini = state.mini;
    if (!mini || mini.type !== 'shake' || mini.finished || mini.finishAt || mini.fruits <= 0) return;
    mini.fruits -= 1;
    mini.shakeCount += 1;
    mini.flash = mini.fruits > 0 ? `又落下一颗 · 还剩 ${mini.fruits}` : '柿子落满竹篮';
    mini.flashTimer = .4;
    playSound('correct');
    if (mini.fruits <= 0) mini.finishAt = mini.elapsed + .7;
  }

  function updateShake(mini, dt) {
    mini.treeSway *= Math.pow(.035, dt);
    if (mini.finishAt && mini.elapsed >= mini.finishAt) finishMini();
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

  function drawObjectIcon(ctx, name, x, y, size = 64, tone = null) {
    const label = String(name || '');
    const scale = size / 64;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const outline = 'rgba(67,79,67,.34)';
    if (/春饼/.test(label)) {
      ctx.fillStyle = '#e8b85e'; ctx.beginPath(); ctx.ellipse(0, 4, 28, 21, -.12, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#a87634'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,244,196,.8)'; ctx.beginPath(); ctx.arc(-7, 1, 14, -.8, 1.8); ctx.stroke();
    } else if (/萝卜/.test(label)) {
      ctx.fillStyle = '#f2a45c'; ctx.beginPath(); ctx.moveTo(-9, -8); ctx.quadraticCurveTo(16, 8, 3, 31); ctx.quadraticCurveTo(-16, 24, -9, -8); ctx.fill();
      ctx.strokeStyle = outline; ctx.stroke();
      ctx.strokeStyle = '#5f9b58'; ctx.lineWidth = 5;
      [-10, 0, 10].forEach((dx, i) => { ctx.beginPath(); ctx.moveTo(dx * .4, -12); ctx.quadraticCurveTo(dx, -25 - i * 2, dx + 7, -30); ctx.stroke(); });
    } else if (/韭/.test(label)) {
      ctx.strokeStyle = '#8aae4f'; ctx.lineWidth = 5;
      [-13, 0, 13].forEach((dx, i) => { ctx.beginPath(); ctx.moveTo(dx * .3, 28); ctx.quadraticCurveTo(dx, -4, dx + (i - 1) * 7, -30); ctx.stroke(); });
      ctx.strokeStyle = '#d5df78'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, 26); ctx.lineTo(8, 26); ctx.stroke();
    } else if (/石|礁/.test(label)) {
      ctx.fillStyle = '#77837e'; ctx.beginPath(); ctx.moveTo(-27, 21); ctx.lineTo(-20, -9); ctx.lineTo(-4, -25); ctx.lineTo(22, -12); ctx.lineTo(29, 17); ctx.lineTo(10, 27); ctx.lineTo(-14, 27); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3; ctx.stroke();
    } else if (/枝/.test(label)) {
      ctx.strokeStyle = '#76543c'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-28, 25); ctx.lineTo(24, -24); ctx.stroke();
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-5, 4); ctx.lineTo(5, -18); ctx.moveTo(10, -10); ctx.lineTo(27, -3); ctx.stroke();
    } else if (/稻壳|米粒|米|谷花|丰收|稻谷|麦穗|油菜籽/.test(label)) {
      const isWhite = /米粒/.test(label);
      ctx.strokeStyle = isWhite ? '#c4aa66' : '#be9635'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 28); ctx.quadraticCurveTo(-5, 4, 0, -25); ctx.stroke();
      ctx.fillStyle = isWhite ? '#fffaf0' : '#e1bb4d';
      for (let i = 0; i < 7; i += 1) {
        const yy = -20 + i * 7, side = i % 2 ? 1 : -1;
        ctx.save(); ctx.translate(side * 7, yy); ctx.rotate(side * .45); ctx.beginPath(); ctx.ellipse(0, 0, 5, 10, 0, 0, TAU); ctx.fill(); ctx.restore();
      }
    } else if (/茶|芽|叶/.test(label)) {
      ctx.fillStyle = tone || '#76a65d'; ctx.beginPath(); ctx.moveTo(-27, 22); ctx.quadraticCurveTo(-4, -35, 29, -20); ctx.quadraticCurveTo(9, 30, -27, 22); ctx.fill();
      ctx.strokeStyle = '#e9f5d6'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-22, 18); ctx.quadraticCurveTo(2, 2, 24, -16); ctx.stroke();
    } else if (/辣椒/.test(label)) {
      ctx.fillStyle = '#d8543e'; ctx.beginPath(); ctx.moveTo(-19, -15); ctx.bezierCurveTo(7, -24, 25, -2, 18, 20); ctx.bezierCurveTo(10, 34, -4, 22, -8, 6); ctx.bezierCurveTo(-11, -4, -15, -8, -19, -15); ctx.fill();
      ctx.strokeStyle = '#59884f'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-17, -16); ctx.lineTo(-28, -24); ctx.stroke();
    } else if (/柿|山楂|枸杞|枣/.test(label)) {
      const color = /枣/.test(label) ? '#823b2e' : /枸杞/.test(label) ? '#c44433' : '#e47832';
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 5, 23, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6a8d4c'; ctx.beginPath(); ctx.ellipse(0, -17, 12, 6, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#715137'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(0, -30); ctx.stroke();
    } else if (/玉米/.test(label)) {
      ctx.fillStyle = '#e3b33c'; ctx.beginPath(); ctx.ellipse(0, 2, 15, 29, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(130,90,30,.38)'; ctx.lineWidth = 1.5;
      for (let i = -18; i <= 18; i += 9) { ctx.beginPath(); ctx.moveTo(-12, i); ctx.lineTo(12, i + 3); ctx.stroke(); }
      ctx.fillStyle = '#79a85d'; ctx.beginPath(); ctx.moveTo(-11, 23); ctx.quadraticCurveTo(-30, 8, -16, -20); ctx.quadraticCurveTo(-3, 3, -2, 26); ctx.fill();
    } else if (/南瓜|瓜/.test(label)) {
      ctx.fillStyle = '#df8b35'; ctx.beginPath(); ctx.ellipse(0, 6, 27, 21, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#f3be69'; ctx.lineWidth = 2;
      [-13, 0, 13].forEach(dx => { ctx.beginPath(); ctx.ellipse(dx, 5, 10, 21, 0, 0, TAU); ctx.stroke(); });
      ctx.fillStyle = '#668b4c'; ctx.fillRect(-3, -22, 6, 13);
    } else if (/书|诗集|画册/.test(label)) {
      ctx.fillStyle = '#f7e9c9'; ctx.fillRect(-28, -23, 56, 46);
      ctx.fillStyle = '#6b8ba0'; ctx.fillRect(-28, -23, 10, 46);
      ctx.strokeStyle = '#9c825d'; ctx.lineWidth = 2; ctx.strokeRect(-28, -23, 56, 46);
      ctx.beginPath(); ctx.moveTo(-14, -10); ctx.lineTo(20, -10); ctx.moveTo(-14, 0); ctx.lineTo(20, 0); ctx.moveTo(-14, 10); ctx.lineTo(14, 10); ctx.stroke();
    } else if (/衣|长衫|棉被/.test(label)) {
      ctx.fillStyle = tone || '#8cb7c8'; roundedRect(ctx, -25, -24, 50, 48, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-7, -20); ctx.lineTo(0, 16); ctx.lineTo(7, -20); ctx.stroke();
    } else if (/豆/.test(label)) {
      ctx.fillStyle = tone || '#8a9a4b';
      [[-14, -3], [10, -8], [0, 15]].forEach(([dx, dy], i) => { ctx.save(); ctx.translate(dx, dy); ctx.rotate(i * .6); ctx.beginPath(); ctx.ellipse(0, 0, 13, 8, 0, 0, TAU); ctx.fill(); ctx.restore(); });
    } else if (/果/.test(label)) {
      ctx.fillStyle = '#df7a4a'; ctx.beginPath(); ctx.arc(0, 7, 23, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6b944e'; ctx.beginPath(); ctx.ellipse(3, -17, 10, 6, -.4, 0, TAU); ctx.fill();
    } else if (/灯|心愿/.test(label)) {
      ctx.fillStyle = 'rgba(255,213,104,.25)'; ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ed7252'; ctx.beginPath(); ctx.ellipse(0, 3, 22, 25, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffe68e'; ctx.beginPath(); ctx.arc(0, 3, 8, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#8c593b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-19, 29); ctx.lineTo(19, 29); ctx.stroke();
    } else if (/蛋/.test(label)) {
      ctx.fillStyle = '#f7e5bf'; ctx.beginPath(); ctx.ellipse(0, 2, 23, 30, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#d2ab72'; ctx.lineWidth = 2; ctx.stroke();
    } else if (/船/.test(label)) {
      ctx.fillStyle = '#a9683e'; ctx.beginPath(); ctx.moveTo(-34, 8); ctx.quadraticCurveTo(0, 27, 34, 8); ctx.lineTo(23, 25); ctx.lineTo(-22, 25); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#65432f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, -28); ctx.stroke();
      ctx.fillStyle = '#f3df9c'; ctx.beginPath(); ctx.moveTo(2, -25); ctx.lineTo(24, -4); ctx.lineTo(2, -2); ctx.closePath(); ctx.fill();
    } else if (/雪/.test(label)) {
      ctx.strokeStyle = '#aaddeb'; ctx.lineWidth = 4;
      for (let i = 0; i < 3; i += 1) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(-Math.cos(a) * 27, -Math.sin(a) * 27); ctx.lineTo(Math.cos(a) * 27, Math.sin(a) * 27); ctx.stroke(); }
    } else if (/尘/.test(label)) {
      ctx.fillStyle = 'rgba(119,107,83,.68)';
      [[-15, 4, 16], [11, 0, 19], [0, 17, 13]].forEach(([dx, dy, r]) => { ctx.beginPath(); ctx.arc(dx, dy, r, 0, TAU); ctx.fill(); });
    } else if (/水|露|滴/.test(label)) {
      ctx.fillStyle = '#93dbee'; ctx.beginPath(); ctx.moveTo(0, -31); ctx.bezierCurveTo(18, -10, 25, 4, 22, 16); ctx.bezierCurveTo(18, 31, -18, 31, -22, 16); ctx.bezierCurveTo(-24, 4, -17, -10, 0, -31); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(-7, 9, 5, 0, TAU); ctx.fill();
    } else if (/鼓/.test(label)) {
      ctx.fillStyle = '#d39a4d'; ctx.beginPath(); ctx.ellipse(0, 0, 30, 23, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#8f5b2c'; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = '#f5dfb1'; ctx.beginPath(); ctx.ellipse(0, -2, 21, 15, 0, 0, TAU); ctx.fill();
    } else if (/月/.test(label)) {
      ctx.fillStyle = '#f4d16b'; ctx.beginPath(); ctx.arc(0, 0, 27, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,253,237,.9)'; ctx.beginPath(); ctx.arc(10, -4, 22, 0, TAU); ctx.fill();
    } else if (/线|轴/.test(label)) {
      ctx.fillStyle = '#f6dfaa'; ctx.beginPath(); ctx.arc(0, 0, 25, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#815b3c'; ctx.lineWidth = 4; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-33, 0); ctx.lineTo(33, 0); ctx.stroke();
    } else if (/秧|苗/.test(label)) {
      ctx.strokeStyle = '#5d9d53'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 27); ctx.lineTo(0, -11); ctx.stroke();
      ctx.fillStyle = '#7fc564'; ctx.beginPath(); ctx.ellipse(-12, -8, 13, 7, -.5, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(12, -8, 13, 7, .5, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = tone || '#e8cf77'; ctx.beginPath(); ctx.arc(0, 0, 25, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.stroke();
    }
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
      ctx.beginPath(); ctx.arc(x, 64, 28, 0, TAU); ctx.fill();
      drawObjectIcon(ctx, target.name, x, 64, 40);
    });
    mini.items.forEach(item => {
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.fillStyle = item.target ? 'rgba(255,255,255,.86)' : 'rgba(91,99,91,.18)';
      ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.fill();
      ctx.strokeStyle = item.target ? meta.color : 'rgba(86,92,83,.3)'; ctx.lineWidth = 2; ctx.stroke();
      drawObjectIcon(ctx, item.name, 0, -2, 53);
      ctx.font = '600 9px "PingFang SC", sans-serif';
      ctx.fillStyle = '#69776d'; ctx.textAlign = 'center';
      ctx.fillText(item.name, 0, 29);
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
    drawObjectIcon(ctx, mini.game.instrument || '鼓', 0, 4, 118);
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
    ctx.strokeStyle = 'rgba(160,121,64,.38)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-16, -20); ctx.lineTo(-5, -9); ctx.lineTo(-12, 1); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.ellipse(-17, -27, 7, 13, -.45, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6a5b46'; ctx.beginPath(); ctx.arc(-10, -1, 2.2, 0, TAU); ctx.arc(10, -1, 2.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#b56e55'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 5, 7, .2, Math.PI - .2); ctx.stroke();
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
    const sortTime = Math.max(0, mini.timeLimit - mini.elapsed);
    roundedRect(ctx, 64, 26, MINI.width - 128, 9, 5);
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
    roundedRect(ctx, 64, 26, (MINI.width - 128) * (sortTime / mini.timeLimit), 9, 5);
    ctx.fillStyle = sortTime < 5 ? '#d86046' : meta.color; ctx.fill();
    mini.buttons = [];
    const item = mini.game.items[Math.min(mini.index, mini.game.items.length - 1)];
    ctx.save();
    ctx.translate(MINI.width / 2, 230);
    roundedRect(ctx, -150, -100, 300, 200, 26);
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill();
    ctx.strokeStyle = meta.color; ctx.lineWidth = 3; ctx.stroke();
    drawObjectIcon(ctx, item?.name || '茶', 0, -14, 138);
    ctx.fillStyle = meta.ink;
    ctx.font = '600 20px "PingFang SC", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(item?.name || '完成', 0, 70);
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
      drawObjectIcon(ctx, category.name, x + 105, y + 34, 44);
      ctx.fillStyle = meta.ink;
      ctx.font = '600 13px "PingFang SC", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(category.name, x + 105, y + 72);
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
      ctx.fillStyle = object.target ? 'rgba(255,247,204,.9)' : 'rgba(92,105,98,.26)';
      ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill();
      ctx.strokeStyle = object.target ? meta.color : 'rgba(255,255,255,.65)'; ctx.lineWidth = 2; ctx.stroke();
      drawObjectIcon(ctx, object.target ? mini.game.targetName : mini.game.obstacleName, 0, 0, object.target ? 44 : 42);
      ctx.restore();
    });
    ctx.save();
    ctx.translate(mini.playerX, 475);
    ctx.fillStyle = 'rgba(36,62,60,.16)';
    ctx.beginPath(); ctx.ellipse(0, 42, 50, 12, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = meta.color;
    ctx.beginPath(); ctx.moveTo(-48, 5); ctx.lineTo(48, 5); ctx.lineTo(28, 45); ctx.lineTo(-28, 45); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    drawObjectIcon(ctx, mini.game.playerGlyph, 0, 6, 70);
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
      drawObjectIcon(ctx, symbol.name, x + tileW / 2, y + 58, 62, active ? '#fff7cf' : null);
      ctx.fillStyle = active ? '#fff' : meta.ink;
      ctx.font = '600 11px "PingFang SC", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(symbol.name, x + tileW / 2, y + 108);
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

  function drawDuel(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    ctx.fillStyle = meta.ink;
    ctx.textAlign = 'center';
    ctx.font = '600 15px "PingFang SC", sans-serif';
    ctx.fillText('左右移动瞄准线，点击自己的蛋撞向对手', MINI.width / 2, 62);
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    roundedRect(ctx, 95, 235, 770, 150, 72); ctx.fill();
    ctx.strokeStyle = 'rgba(86,93,66,.16)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = meta.color; ctx.lineWidth = 4; ctx.setLineDash([10, 9]);
    ctx.beginPath(); ctx.moveTo(mini.playerX, 140); ctx.lineTo(mini.playerX, 405); ctx.stroke(); ctx.setLineDash([]);
    const drawEgg = (x, color, glyph) => {
      ctx.save(); ctx.translate(x, 304);
      ctx.fillStyle = 'rgba(70,70,50,.12)'; ctx.beginPath(); ctx.ellipse(0, 47, 45, 11, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, 0, 38, 54, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '600 23px "Songti SC", serif'; ctx.textBaseline = 'middle'; ctx.fillText(glyph, 0, 2);
      ctx.restore();
    };
    drawEgg(mini.opponentX, '#fbf0d1', '对');
    drawEgg(mini.playerX, meta.color, '我');
    const close = Math.abs(mini.playerX - mini.opponentX) < 96;
    miniBadge(ctx, close ? '正对碰撞区 · 点击！' : '调整左右位置', MINI.width / 2, 430, close ? meta.color : 'rgba(72,83,69,.54)');
    ctx.fillStyle = meta.ink; ctx.font = '600 15px "PingFang SC", sans-serif';
    ctx.fillText('胜局 ' + mini.successes + ' / ' + (mini.game.rounds || 3), MINI.width / 2, 485);
    miniFlashText(ctx, mini);
  }

  function drawPump(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    ctx.fillStyle = meta.ink; ctx.textAlign = 'center'; ctx.font = '600 15px "PingFang SC", sans-serif';
    ctx.fillText('左右交替踩踏，不能连续踩同一边', MINI.width / 2, 62);
    ctx.fillStyle = 'rgba(121,203,226,.5)';
    roundedRect(ctx, 285, 210, 390, 95, 40); ctx.fill();
    ctx.save(); ctx.translate(MINI.width / 2, 245);
    ctx.rotate(mini.wheelAngle);
    ctx.strokeStyle = meta.ink; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(0, 0, 62, 0, TAU); ctx.stroke();
    for (let i = 0; i < 8; i += 1) {
      ctx.rotate(TAU / 8); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -62); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(113,197,225,.7)';
    roundedRect(ctx, 248, 320, 464, 22, 11); ctx.fill();
    ctx.fillStyle = meta.color;
    roundedRect(ctx, 248, 320, 464 * mini.waterLevel, 22, 11); ctx.fill();
    mini.buttons.forEach(button => {
      const active = mini.lastSide === button.index;
      roundedRect(ctx, button.x, button.y - mini.pumpPulse * 5, button.w, button.h, 22);
      ctx.fillStyle = active ? meta.color : 'rgba(255,253,244,.9)'; ctx.fill();
      ctx.strokeStyle = meta.color; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = active ? '#fff' : meta.ink; ctx.font = '600 21px "Songti SC", serif';
      ctx.fillText(button.label, button.x + button.w / 2, button.y + 43 - mini.pumpPulse * 5);
      ctx.font = '600 11px "PingFang SC", sans-serif';
      ctx.fillText(button.index === 0 ? 'A / 左键' : 'D / 右键', button.x + button.w / 2, button.y + 73 - mini.pumpPulse * 5);
    });
    ctx.fillStyle = meta.ink; ctx.font = '600 14px "PingFang SC", sans-serif';
    ctx.fillText('踩踏 ' + mini.strokes + ' / ' + (mini.game.strokes || 8), MINI.width / 2, 520);
    miniFlashText(ctx, mini);
  }

  function drawPlant(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    ctx.fillStyle = meta.ink; ctx.textAlign = 'center'; ctx.font = '600 15px "PingFang SC", sans-serif';
    ctx.fillText('从秧盘拖出秧苗，填满九块水田格', MINI.width / 2, 62);
    mini.plots.forEach(plot => {
      roundedRect(ctx, plot.x - 62, plot.y - 34, 124, 68, 15);
      ctx.fillStyle = plot.planted ? 'rgba(105,184,100,.9)' : 'rgba(178,230,238,.6)'; ctx.fill();
      ctx.strokeStyle = plot.planted ? '#fff' : 'rgba(72,134,131,.38)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = plot.planted ? '#fff' : '#4f7c77'; ctx.font = '600 18px "Songti SC", serif';
      ctx.fillText(plot.planted ? '秧' : '田', plot.x, plot.y + 5);
    });
    ctx.fillStyle = 'rgba(240,210,126,.84)';
    roundedRect(ctx, 295, 458, 370, 70, 22); ctx.fill();
    ctx.fillStyle = meta.ink; ctx.font = '600 18px "Songti SC", serif';
    ctx.fillText('秧  盘', MINI.width / 2, 496);
    if (mini.dragging) {
      ctx.fillStyle = meta.color; ctx.beginPath(); ctx.arc(mini.pointerX, mini.pointerY, 24, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '600 16px "Songti SC", serif'; ctx.fillText('秧', mini.pointerX, mini.pointerY + 2);
    }
    miniFlashText(ctx, mini);
  }

  function drawNoodle(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    ctx.fillStyle = meta.ink; ctx.textAlign = 'center'; ctx.font = '600 15px "PingFang SC", sans-serif';
    ctx.fillText('按住起点，沿虚线拖到终点', MINI.width / 2, 62);
    ctx.save();
    ctx.translate(MINI.width / 2, 285);
    ctx.fillStyle = 'rgba(255,253,244,.86)'; ctx.beginPath(); ctx.ellipse(0, 12, 386, 185, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = meta.color; ctx.lineWidth = 8; ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(103,112,93,.28)'; ctx.lineWidth = 9; ctx.setLineDash([7, 12]); ctx.lineCap = 'round';
    ctx.beginPath();
    mini.tracePoints.forEach((point, index) => { if (index === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y); });
    ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = meta.color; ctx.lineWidth = 10;
    ctx.beginPath();
    mini.tracePoints.slice(0, mini.traceIndex).forEach((point, index) => { if (index === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y); });
    ctx.stroke();
    const start = mini.tracePoints[0];
    ctx.fillStyle = meta.color; ctx.beginPath(); ctx.arc(start.x, start.y, 15, 0, TAU); ctx.fill();
    const end = mini.tracePoints[mini.tracePoints.length - 1];
    ctx.fillStyle = mini.traceIndex >= mini.tracePoints.length ? meta.color : 'rgba(255,255,255,.88)';
    ctx.beginPath(); ctx.arc(end.x, end.y, 20, 0, TAU); ctx.fill();
    ctx.strokeStyle = meta.color; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = meta.ink; ctx.font = '600 12px "PingFang SC", sans-serif';
    ctx.fillText('拖', start.x, start.y + 36);
    ctx.fillText('完成 ' + mini.traceIndex + ' / ' + mini.tracePoints.length, MINI.width / 2, 520);
    miniFlashText(ctx, mini);
  }

  function drawHang(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    ctx.fillStyle = meta.ink; ctx.textAlign = 'center'; ctx.font = '600 15px "PingFang SC", sans-serif';
    ctx.fillText('把作物拖进同色晒架', MINI.width / 2, 60);
    mini.game.categories.forEach((category, index) => {
      const x = index === 0 ? 110 : 540;
      ctx.fillStyle = index === 0 ? 'rgba(215,91,65,.2)' : 'rgba(232,174,61,.23)';
      roundedRect(ctx, x, 130, 310, 260, 24); ctx.fill();
      ctx.strokeStyle = index === 0 ? '#cf654c' : '#d3a13b'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = index === 0 ? '#ad4c38' : '#946d1e'; ctx.font = '600 22px "Songti SC", serif';
      ctx.fillText(category.name, x + 155, 170);
      for (let i = 0; i < 3; i += 1) {
        ctx.strokeStyle = 'rgba(100,74,42,.28)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x + 34, 220 + i * 57); ctx.lineTo(x + 276, 220 + i * 57); ctx.stroke();
      }
    });
    mini.items.forEach(item => {
      if (item.hung) {
        const side = item.cat === 0 ? 110 : 540;
        const slot = mini.items.slice(0, item.index).filter(piece => piece.cat === item.cat).length;
        ctx.fillStyle = 'rgba(255,253,244,.88)';
        ctx.beginPath(); ctx.arc(side + 90 + slot * 67, 218 + (slot % 2) * 70, 27, 0, TAU); ctx.fill();
        drawObjectIcon(ctx, item.name, side + 90 + slot * 67, 218 + (slot % 2) * 70, 40);
      }
    });
    mini.items.forEach(item => {
      if (item.hung) return;
      ctx.fillStyle = 'rgba(255,253,244,.92)';
      ctx.beginPath(); ctx.arc(item.x, item.y, 35, 0, TAU); ctx.fill();
      ctx.strokeStyle = item.cat === 0 ? '#d75b41' : '#d3a13b'; ctx.lineWidth = 2; ctx.stroke();
      drawObjectIcon(ctx, item.name, item.x, item.y - 2, 54);
      ctx.fillStyle = meta.ink; ctx.font = '600 9px "PingFang SC", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(item.name, item.x, item.y + 29);
    });
    if (mini.dragging !== null) {
      const item = mini.items[mini.dragging];
      drawObjectIcon(ctx, item.name, mini.pointerX, mini.pointerY, 64);
    }
    miniFlashText(ctx, mini);
  }

  function drawLantern(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    ctx.fillStyle = 'rgba(90,190,211,.43)';
    roundedRect(ctx, 70, 105, 820, 385, 38); ctx.fill();
    for (let i = 0; i < 6; i += 1) {
      ctx.strokeStyle = 'rgba(255,255,255,.34)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(105, 160 + i * 55 + Math.sin(mini.elapsed + i) * 8); ctx.lineTo(855, 160 + i * 55 + Math.cos(mini.elapsed + i) * 8); ctx.stroke();
    }
    mini.rockRows.forEach(rock => {
      const y = 425 - (rock.progress - mini.progress) * 620;
      if (y < 100 || y > 510) return;
      ctx.fillStyle = '#71817e'; ctx.beginPath(); ctx.ellipse(rock.x, y, 53, 30, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.font = '600 15px "Songti SC", serif'; ctx.fillText('礁', rock.x, y + 5);
    });
    ctx.save(); ctx.translate(mini.lanternX, 420);
    ctx.fillStyle = 'rgba(231,90,51,.9)'; ctx.beginPath(); ctx.ellipse(0, 0, 32, 22, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe8a7'; ctx.beginPath(); ctx.arc(0, -3, 10, 0, TAU); ctx.fill();
    ctx.strokeStyle = meta.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-20, 20); ctx.lineTo(20, 20); ctx.stroke();
    ctx.restore();
    roundedRect(ctx, 80, 458, 335, 72, 18); ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.fill();
    roundedRect(ctx, 545, 458, 335, 72, 18); ctx.fill();
    ctx.fillStyle = meta.ink; ctx.font = '600 18px "PingFang SC", sans-serif';
    ctx.fillText('← 点左岸推流', 247, 501); ctx.fillText('点右岸推流 →', 712, 501);
    ctx.fillStyle = '#748178'; ctx.font = '600 13px "PingFang SC", sans-serif';
    ctx.fillText('行程 ' + Math.round(mini.progress * 100) + '% · 触礁 ' + mini.hits, MINI.width / 2, 90);
    miniFlashText(ctx, mini);
  }

  function drawDew(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    ctx.fillStyle = meta.ink; ctx.textAlign = 'center'; ctx.font = '600 15px "PingFang SC", sans-serif';
    ctx.fillText('露珠消失前逐颗点入瓷盅', MINI.width / 2, 60);
    ctx.fillStyle = 'rgba(117,179,117,.42)';
    for (let i = 0; i < 5; i += 1) {
      ctx.save(); ctx.translate(190 + i * 155, 335 + (i % 2) * 35); ctx.rotate((i - 2) * .18);
      ctx.beginPath(); ctx.ellipse(0, 0, 105, 42, 0, 0, TAU); ctx.fill(); ctx.restore();
    }
    mini.drops.forEach(drop => {
      if (drop.caught) return;
      const alpha = .35 + Math.max(0, drop.life / drop.maxLife) * .65;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#d9f7ff'; ctx.beginPath(); ctx.arc(drop.x, drop.y, 20, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#76b9c9'; ctx.lineWidth = 2; ctx.stroke();
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = 'rgba(255,253,244,.86)'; ctx.beginPath(); ctx.ellipse(820, 460, 70, 30, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = meta.color; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = meta.ink; ctx.font = '600 15px "Songti SC", serif'; ctx.fillText('盅', 820, 465);
    ctx.fillStyle = meta.ink; ctx.font = '600 14px "PingFang SC", sans-serif';
    ctx.fillText('清露 ' + mini.caught + ' / ' + mini.drops.length, MINI.width / 2, 525);
    miniFlashText(ctx, mini);
  }

  function drawMoon(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    ctx.fillStyle = meta.ink; ctx.textAlign = 'center'; ctx.font = '600 15px "PingFang SC", sans-serif';
    ctx.fillText('点击三圈礼盘，把月纹转到正上方刻度', MINI.width / 2, 58);
    ctx.save(); ctx.translate(MINI.width / 2, 286);
    const radii = [60, 110, 160];
    radii.forEach((radius, ring) => {
      ctx.fillStyle = ring === 2 ? 'rgba(255,246,208,.72)' : 'rgba(255,255,255,.62)';
      ctx.beginPath(); ctx.arc(0, 0, radius + 24, 0, TAU); ctx.fill();
      ctx.strokeStyle = ring === 0 ? '#d3a13b' : ring === 1 ? '#bd8c36' : '#956f2b'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.stroke();
      const angle = -Math.PI / 2 + mini.offsets[ring] * (TAU / (mini.game.steps || 8));
      ctx.fillStyle = ring === 2 ? '#d5a03a' : '#b98530';
      ctx.beginPath(); ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, 15, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    });
    ctx.strokeStyle = meta.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -205); ctx.lineTo(0, -176); ctx.stroke();
    ctx.fillStyle = meta.ink; ctx.font = '600 13px "PingFang SC", sans-serif'; ctx.fillText('刻度', 0, -214);
    ctx.restore();
    ctx.fillStyle = meta.ink; ctx.font = '600 15px "PingFang SC", sans-serif';
    ctx.fillText('对准圈数 ' + mini.offsets.filter(offset => offset === 0).length + ' / 3', MINI.width / 2, 515);
    miniFlashText(ctx, mini);
  }

  function drawClimb(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    ctx.fillStyle = 'rgba(96,135,91,.34)'; ctx.beginPath(); ctx.moveTo(0, 560); ctx.lineTo(280, 80); ctx.lineTo(670, 560); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(238,219,143,.36)'; ctx.beginPath(); ctx.moveTo(410, 560); ctx.lineTo(710, 80); ctx.lineTo(960, 560); ctx.closePath(); ctx.fill();
    mini.stones.forEach((stone, index) => {
      const next = index === mini.nextStone;
      ctx.fillStyle = stone.cleared ? meta.color : next ? '#fff4c9' : 'rgba(255,253,244,.8)';
      ctx.beginPath(); ctx.ellipse(stone.x, stone.y, 29, 17, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = next ? '#b87c27' : 'rgba(83,105,78,.32)'; ctx.lineWidth = next ? 4 : 2; ctx.stroke();
      ctx.fillStyle = stone.cleared ? '#fff' : meta.ink; ctx.font = '600 12px "PingFang SC", sans-serif';
      ctx.fillText(index + 1, stone.x, stone.y + 4);
    });
    ctx.fillStyle = meta.ink; ctx.textAlign = 'center'; ctx.font = '600 15px "PingFang SC", sans-serif';
    ctx.fillText('按顺序点击发光的下一块石阶', MINI.width / 2, 520);
    miniFlashText(ctx, mini);
  }

  function drawShake(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    ctx.fillStyle = meta.ink; ctx.textAlign = 'center'; ctx.font = '600 15px "PingFang SC", sans-serif';
    ctx.fillText('按住树干左右快速摇动，让柿子落入竹篮', MINI.width / 2, 58);
    ctx.save(); ctx.translate(MINI.width / 2, 315); ctx.rotate((mini.treeSway || 0) * Math.PI / 180);
    ctx.fillStyle = '#8b6038'; roundedRect(ctx, -20, -60, 40, 265, 14); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.beginPath(); ctx.arc(-80, -90, 96, 0, TAU); ctx.fill();
    ctx.fillStyle = '#df9334';
    for (let i = 0; i < mini.fruits; i += 1) {
      const angle = -Math.PI * .88 + i * .45;
      const x = Math.cos(angle) * (82 + (i % 3) * 28); const y = -90 + Math.sin(angle) * (75 + (i % 2) * 20);
      ctx.beginPath(); ctx.arc(x, y, 18, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff3d0'; ctx.font = '600 11px "Songti SC", serif'; ctx.fillText('柿', x, y + 4); ctx.fillStyle = '#df9334';
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(240,208,123,.75)'; ctx.beginPath(); ctx.ellipse(720, 470, 90, 30, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = meta.color; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = meta.ink; ctx.font = '600 16px "PingFang SC", serif'; ctx.fillText('竹篮', 720, 476);
    ctx.fillStyle = '#748178'; ctx.font = '600 13px "PingFang SC", sans-serif';
    ctx.fillText('已摇下 ' + mini.shakeCount + ' / ' + (mini.game.fruits || 5), MINI.width / 2, 522);
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

  function drawMiniTutorial(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    const typeSteps = {
      collect: ['移动容器', '接住目标', '避开干扰'],
      sequence: ['观看亮起', '记住顺序', '依次点回'],
      rhythm: ['看节拍环', '收拢时点击', '连续命中'],
      timing: ['观察游标', '进入绿区', '点击停下'],
      sort: ['看清物件', '限时分类', '收入茶篓'],
      path: ['左右操控', '收集目标', '避开障碍'],
      assemble: ['先架竹骨', '再覆纸面', '系尾线轴'],
      weather: ['看天空变化', '限时选晒收', '连续判断'],
      fold: ['按住面皮', '向中心折合', '捏紧饺子'],
      salt: ['按住盐罐', '来回拖动', '覆盖肉条'],
      wipe: ['按住扫帚', '拖过积雪', '清出道路'],
      roll: ['按住面团', '画圈搓动', '做圆汤圆'],
      pour: ['按序选料', '拖进粥锅', '熬成暖粥'],
      sweep: ['快速划过', '扫起尘团', '清空角落'],
      duel: ['左右瞄准', '点击碰蛋', '赢下三局'],
      pump: ['交替踩踏', '推动水车', '灌满水田'],
      plant: ['拖出秧苗', '对准田格', '栽满九格'],
      noodle: ['按住面头', '沿虚线拖动', '拉出长面'],
      hang: ['分清红黄', '拖到同色架', '晒满秋色'],
      lantern: ['看准礁石', '点击两岸', '推灯到岸'],
      dew: ['露珠将散', '逐颗点击', '收满八滴'],
      moon: ['观察月纹', '点击礼盘', '三圈归位'],
      climb: ['从低到高', '依次踏石', '登上山亭'],
      shake: ['按住树干', '左右摇动', '收满柿子']
    }[mini.type] || ['观察场景', '完成动作', '点亮节气'];
    ctx.fillStyle = meta.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '500 48px "Songti SC", "STSong", serif';
    ctx.fillText(mini.term.custom, MINI.width / 2, 104);
    ctx.fillStyle = meta.color;
    ctx.font = '600 15px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(mini.game.title, MINI.width / 2, 147);
    ctx.save();
    ctx.translate(MINI.width / 2, 267);
    ctx.fillStyle = meta.pale;
    ctx.beginPath();
    ctx.arc(0, 0, 88, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = meta.color;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = meta.ink;
    ctx.font = '500 54px "Songti SC", serif';
    ctx.fillText(mini.term.glyph, 0, 5);
    ctx.restore();
    typeSteps.forEach((step, index) => {
      const x = 195 + index * 210;
      roundedRect(ctx, x, 392, 180, 76, 18);
      ctx.fillStyle = index === 2 ? meta.color : 'rgba(255,255,255,.78)';
      ctx.fill();
      ctx.strokeStyle = meta.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = index === 2 ? '#fff' : meta.ink;
      ctx.font = '600 12px "PingFang SC", sans-serif';
      ctx.fillText(`${index + 1}. ${step}`, x + 90, 430);
    });
    ctx.fillStyle = meta.ink;
    ctx.font = '600 14px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(mini.game.hint, MINI.width / 2, 344);
    ctx.fillStyle = '#7a857b';
    ctx.font = '600 11px "PingFang SC", sans-serif';
    ctx.fillText('先阅读教程，点击“确定，开始”后才计时与互动', MINI.width / 2, 500);
  }

  function drawMini(mini) {
    const ctx = miniContext();
    if (mini.type === 'collect') drawCollect(ctx, mini);
    else if (mini.type === 'rhythm') drawRhythm(ctx, mini);
    else if (mini.type === 'timing') drawTiming(ctx, mini);
    else if (mini.type === 'sort') drawSort(ctx, mini);
    else if (mini.type === 'path') drawPath(ctx, mini);
    else if (mini.type === 'sequence') drawSequence(ctx, mini);
    else if (mini.type === 'assemble') drawAssemble(ctx, mini);
    else if (mini.type === 'weather') drawWeatherGame(ctx, mini);
    else if (mini.type === 'fold') drawFold(ctx, mini);
    else if (mini.type === 'salt') drawSalt(ctx, mini);
    else if (mini.type === 'wipe') drawWipe(ctx, mini);
    else if (mini.type === 'roll') drawRoll(ctx, mini);
    else if (mini.type === 'pour') drawPour(ctx, mini);
    else if (mini.type === 'sweep') drawSweep(ctx, mini);
    else if (mini.type === 'duel') drawDuel(ctx, mini);
    else if (mini.type === 'pump') drawPump(ctx, mini);
    else if (mini.type === 'plant') drawPlant(ctx, mini);
    else if (mini.type === 'noodle') drawNoodle(ctx, mini);
    else if (mini.type === 'hang') drawHang(ctx, mini);
    else if (mini.type === 'lantern') drawLantern(ctx, mini);
    else if (mini.type === 'dew') drawDew(ctx, mini);
    else if (mini.type === 'moon') drawMoon(ctx, mini);
    else if (mini.type === 'climb') drawClimb(ctx, mini);
    else if (mini.type === 'shake') drawShake(ctx, mini);
    if (mini.finished || mini.failed) drawMiniCompletion(ctx, mini);
    updateMiniProgress(mini);
  }

  function updateMiniProgress(mini) {
    if (!mini.started) { els.miniProgress.textContent = '教程'; return; }
    let text = '';
    if (mini.type === 'collect') text = `${mini.collected} / ${mini.targetCount}`;
    else if (mini.type === 'rhythm') text = `命中 ${mini.goodHits} / ${mini.beats.length}`;
    else if (mini.type === 'timing') text = `回合 ${Math.min(mini.round + 1, mini.game.rounds)} / ${mini.game.rounds}`;
    else if (mini.type === 'sort') text = `${Math.min(mini.index, mini.game.items.length)} / ${mini.game.items.length}`;
    else if (mini.type === 'path') text = `${mini.collected} / ${mini.targetCount} · ${Math.round(mini.progress * 100)}%`;
    else if (mini.type === 'sequence') text = mini.phase === 'show' ? '记忆顺序' : `${mini.input.length} / ${mini.game.sequence.length}`;
    else if (mini.type === 'assemble') text = `${mini.pieces.filter(piece => piece.placed).length} / ${mini.pieces.length}`;
    else if (mini.type === 'weather') text = `${mini.round} / ${mini.weatherPattern.length}`;
    else if (mini.type === 'fold') text = `${mini.round} / ${mini.game.rounds}`;
    else if (mini.type === 'salt') text = `覆盖 ${Math.round(mini.coverage.reduce((a,b)=>a+b,0) / mini.coverage.length * 100)}%`;
    else if (mini.type === 'wipe') text = `${mini.patches.filter(p => p.cleared).length} / ${mini.patches.length}`;
    else if (mini.type === 'roll') text = `${mini.round} / ${mini.game.rounds}`;
    else if (mini.type === 'pour') text = `${mini.index} / ${mini.game.ingredients.length}`;
    else if (mini.type === 'sweep') text = `${mini.spots.filter(s => s.cleared).length} / ${mini.spots.length}`;
    else if (mini.type === 'duel') text = `胜局 ${mini.successes} / ${mini.game.rounds}`;
    else if (mini.type === 'pump') text = `踩踏 ${mini.strokes} / ${mini.game.strokes}`;
    else if (mini.type === 'plant') text = `秧苗 ${mini.planted} / ${mini.plots.length}`;
    else if (mini.type === 'noodle') text = `拉面 ${mini.traceIndex} / ${mini.tracePoints.length}`;
    else if (mini.type === 'hang') text = `挂晒 ${mini.hung} / ${mini.items.length}`;
    else if (mini.type === 'lantern') text = `河程 ${Math.round(mini.progress * 100)}%`;
    else if (mini.type === 'dew') text = `清露 ${mini.caught} / ${mini.drops.length}`;
    else if (mini.type === 'moon') text = `归位 ${mini.offsets.filter(offset => offset === 0).length} / 3`;
    else if (mini.type === 'climb') text = `石阶 ${mini.nextStone} / ${mini.stones.length}`;
    else if (mini.type === 'shake') text = `柿子 ${mini.shakeCount} / ${mini.game.fruits}`;
    els.miniProgress.textContent = text;
  }

  function loopMini(timestamp) {
    const mini = state.mini;
    if (!mini) return;
    const dt = Math.min(.034, Math.max(0, (timestamp - mini.last) / 1000));
    mini.last = timestamp;
    if (!mini.started) {
      drawMiniTutorial(miniContext(), mini);
      updateMiniProgress(mini);
    } else {
      if (!mini.finished && !mini.failed) updateMini(mini, dt);
      else mini.elapsed += dt;
      drawMini(mini);
    }
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
    if (!seasonComplete(season)) return;
    if (!seasonGatePassed(season)) {
      showToast(`本季 ${seasonStars(season)} / 18 星，超过 12 星才能打开“往”星门。点击节气碑可重玩提升星级。`);
      return;
    }
    if (state.save.chapterCelebrated[season]) return;
    state.save.chapterCelebrated[season] = true;
    persist();
    const meta = DATA.seasons[season];
    const stars = seasonStars(season);
    const index = SEASON_ORDER.indexOf(season);
    els.chapterSeal.textContent = meta.name;
    els.chapterKicker.textContent = meta.title;
    els.chapterTitle.textContent = '星门已经开启';
    els.chapterStars.textContent = `${'★'.repeat(Math.max(1, Math.round(stars / 6)))}  ${stars} / 18 星`;
    els.chapterCopy.textContent = `${meta.subtitle}。你完成了 ${meta.name}季的全部 6 个习俗小游戏，并取得超过三分之二的总星数。`;
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
    els.resetBtn.addEventListener('click', () => {
      if (!window.confirm('清空全部星级、完成记录和章节进度？此操作不可撤销。')) return;
      state.save = defaultSave();
      LEGACY_SAVE_KEYS.forEach(key => { try { localStorage.removeItem(key); } catch (error) {} });
      persist();
      state.season = 'spring';
      renderHUD();
      returnToMenu();
      showToast('进度已清空，可以重新开始行旅');
    });
    els.menuBtn.addEventListener('click', () => returnToMenu());
    els.soundBtn.addEventListener('click', toggleSound);
    els.actionBtn.addEventListener('pointerdown', event => { event.preventDefault(); interact(); });
    els.prompt.addEventListener('click', event => { event.preventDefault(); interact(); });
    els.miniClose.addEventListener('click', () => closeMini(false));
    els.miniStartBtn.addEventListener('click', startMiniGame);
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
    canEnterSeason: season => seasonUnlocked(season),
    enterSeason: season => enterWorld(season),
    teleportToPortal: () => {
      const meta = DATA.seasons[state.season];
      state.player.x = meta.portal.x;
      state.player.y = meta.portal.y;
      updateCamera(true);
      updatePrompt();
    },
    teleportToTerm: id => {
      const term = TERM_BY_ID[id];
      if (!term) return;
      state.player.x = term.position.x;
      state.player.y = term.position.y;
      updateCamera(true);
      updatePrompt();
    },
    getData: () => DATA,
    getSeasonStars: season => seasonStars(season),
    getTotalStars: () => totalStars(),
    getSaveKey: () => SAVE_KEY
  };


  /* New interaction modes keep each season's six stations mechanically distinct. */
  function updateWeather(mini, dt) {
    if (mini.lockTimer > 0) mini.lockTimer -= dt;
    if (mini.finishAt) {
      if (mini.elapsed >= mini.finishAt) finishMini();
      return;
    }
    if (mini.lockTimer > 0) return;
    mini.roundClock += dt;
    if (mini.roundClock >= mini.roundLimit) {
      mini.mistakes += 1;
      mini.weatherIndex += 1;
      mini.round = mini.weatherIndex;
      mini.roundClock = 0;
      mini.lockTimer = .35;
      mini.flash = '来不及了，下一阵天气';
      mini.flashTimer = .45;
      playSound('error');
      if (mini.weatherIndex >= mini.weatherPattern.length) mini.finishAt = mini.elapsed + .55;
    }
  }

  function chooseWeather(index) {
    const mini = state.mini;
    if (!mini || mini.type !== 'weather' || mini.finished || mini.lockTimer > 0 || mini.finishAt) return;
    const expected = mini.weatherPattern[mini.weatherIndex] === 1 ? 0 : 1;
    if (index === expected) { mini.flash = index === 0 ? '晒得正好' : '及时收回'; mini.flashTimer = .35; playSound('correct'); }
    else { mini.mistakes += 1; mini.flash = '再看一眼天空'; mini.flashTimer = .35; playSound('error'); }
    mini.weatherIndex += 1;
    mini.round = mini.weatherIndex;
    mini.roundClock = 0;
    mini.lockTimer = .45;
    if (mini.weatherIndex >= mini.weatherPattern.length) mini.finishAt = mini.elapsed + .55;
  }

  function updateFold(mini, dt) {
    if (mini.lockTimer > 0) mini.lockTimer -= dt;
  }

  function updateSalt(mini, dt) {
    if (mini.holding && mini.activeStrip >= 0 && mini.activeStrip < mini.coverage.length) {
      mini.coverage[mini.activeStrip] = clamp(mini.coverage[mini.activeStrip] + dt * 1.6, 0, 1);
      if (mini.coverage.every(value => value >= .82)) finishMini();
    }
  }

  function updateRoll(mini, dt) {
    // Circular gesture is tracked through pointer movement.
  }

  function drawKitePart(ctx, kind, x, y, scale = 1, ghost = false, time = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (ghost) {
      ctx.setLineDash([9, 8]);
      ctx.globalAlpha = .42;
      ctx.strokeStyle = '#47735b';
      ctx.fillStyle = 'rgba(244,236,197,.28)';
      ctx.lineWidth = 3;
    } else {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#315949';
      ctx.lineWidth = 4;
    }
    if (kind === 'sail') {
      ctx.beginPath();
      ctx.moveTo(0, -106); ctx.lineTo(98, -4); ctx.lineTo(0, 112); ctx.lineTo(-98, -4); ctx.closePath();
      if (!ghost) {
        const grad = ctx.createLinearGradient(-80, -80, 82, 92);
        grad.addColorStop(0, '#f8d66a'); grad.addColorStop(.52, '#e98262'); grad.addColorStop(1, '#7fc6a3');
        ctx.fillStyle = grad;
      }
      ctx.fill(); ctx.stroke();
      if (!ghost) {
        ctx.fillStyle = 'rgba(255,255,255,.48)';
        ctx.beginPath(); ctx.arc(0, -4, 28, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3;
        for (let i = 0; i < 8; i += 1) {
          const angle = i * TAU / 8;
          ctx.beginPath(); ctx.moveTo(Math.cos(angle) * 38, -4 + Math.sin(angle) * 38); ctx.lineTo(Math.cos(angle) * 54, -4 + Math.sin(angle) * 54); ctx.stroke();
        }
      }
    } else if (kind === 'spine') {
      ctx.strokeStyle = ghost ? '#47735b' : '#936333';
      ctx.lineWidth = ghost ? 3 : 9;
      ctx.beginPath(); ctx.moveTo(0, -111); ctx.bezierCurveTo(-7, -42, 7, 53, 0, 116); ctx.stroke();
      if (!ghost) {
        ctx.strokeStyle = '#d6ad68'; ctx.lineWidth = 2;
        [-70, -20, 30, 80].forEach(yy => { ctx.beginPath(); ctx.moveTo(-7, yy); ctx.lineTo(7, yy + 2); ctx.stroke(); });
      }
    } else if (kind === 'spar') {
      ctx.strokeStyle = ghost ? '#47735b' : '#936333';
      ctx.lineWidth = ghost ? 3 : 9;
      ctx.beginPath(); ctx.moveTo(-101, -5); ctx.quadraticCurveTo(0, 7, 101, -5); ctx.stroke();
      if (!ghost) {
        ctx.strokeStyle = '#d6ad68'; ctx.lineWidth = 2;
        [-62, -24, 24, 62].forEach(xx => { ctx.beginPath(); ctx.moveTo(xx, -4); ctx.lineTo(xx + 2, 5); ctx.stroke(); });
      }
    } else if (kind === 'ribbonLeft') {
      ctx.strokeStyle = ghost ? '#47735b' : '#e06c5a';
      ctx.lineWidth = ghost ? 3 : 8;
      ctx.beginPath(); ctx.moveTo(0, -46); ctx.bezierCurveTo(-34, 4 + Math.sin(time * 2) * 4, -5, 42, -30, 88); ctx.stroke();
      if (!ghost) {
        ctx.fillStyle = '#efae54';
        ctx.beginPath(); ctx.moveTo(-30, 88); ctx.lineTo(-18, 72); ctx.lineTo(-5, 90); ctx.closePath(); ctx.fill();
      }
    } else if (kind === 'ribbonRight') {
      ctx.strokeStyle = ghost ? '#47735b' : '#4e9dc0';
      ctx.lineWidth = ghost ? 3 : 8;
      ctx.beginPath(); ctx.moveTo(0, -46); ctx.bezierCurveTo(34, 4 + Math.cos(time * 2) * 4, 5, 42, 30, 88); ctx.stroke();
      if (!ghost) {
        ctx.fillStyle = '#f4c85b';
        ctx.beginPath(); ctx.moveTo(30, 88); ctx.lineTo(18, 72); ctx.lineTo(5, 90); ctx.closePath(); ctx.fill();
      }
    } else if (kind === 'spool') {
      ctx.fillStyle = ghost ? ctx.fillStyle : '#f6dfaa';
      ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill(); ctx.stroke();
      if (!ghost) {
        ctx.strokeStyle = '#735134'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-39, 0); ctx.lineTo(39, 0); ctx.stroke();
        ctx.strokeStyle = '#da6a55'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-28, 0); ctx.quadraticCurveTo(-110, -50, -150, -8); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawAssemble(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    const timeLeft = Math.max(0, mini.timeLimit - mini.elapsed);
    roundedRect(ctx, 64, 34, MINI.width - 128, 10, 5);
    ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.fill();
    roundedRect(ctx, 64, 34, (MINI.width - 128) * (timeLeft / mini.timeLimit), 10, 5);
    ctx.fillStyle = timeLeft < 10 ? '#d86046' : meta.color; ctx.fill();
    ctx.save();
    ctx.strokeStyle = 'rgba(55,100,78,.34)'; ctx.lineWidth = 2; ctx.setLineDash([7, 9]);
    ctx.beginPath(); ctx.moveTo(480, 118); ctx.lineTo(590, 234); ctx.lineTo(480, 354); ctx.lineTo(370, 234); ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(55,100,78,.22)';
    ctx.beginPath(); ctx.moveTo(480, 118); ctx.lineTo(480, 354); ctx.moveTo(370, 234); ctx.lineTo(590, 234); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.34)'; ctx.fill();
    ctx.restore();

    const placedKinds = new Set(mini.pieces.filter(piece => piece.placed).map(piece => piece.kind));
    const targetOf = kind => mini.targets.find(target => target.kind === kind);
    if (placedKinds.has('ribbonLeft')) { const t = targetOf('ribbonLeft'); drawKitePart(ctx, 'ribbonLeft', t.x, t.y, 1, false, mini.elapsed); }
    if (placedKinds.has('ribbonRight')) { const t = targetOf('ribbonRight'); drawKitePart(ctx, 'ribbonRight', t.x, t.y, 1, false, mini.elapsed); }
    if (placedKinds.has('sail')) { const t = targetOf('sail'); drawKitePart(ctx, 'sail', t.x, t.y, 1); }
    if (placedKinds.has('spine')) { const t = targetOf('spine'); drawKitePart(ctx, 'spine', t.x, t.y, 1); }
    if (placedKinds.has('spar')) { const t = targetOf('spar'); drawKitePart(ctx, 'spar', t.x, t.y, 1); }
    if (placedKinds.has('spool')) { const t = targetOf('spool'); drawKitePart(ctx, 'spool', t.x, t.y, 1); }

    const expectedKind = mini.assembleOrder[mini.nextPiece];
    const expectedTarget = targetOf(expectedKind);
    if (expectedTarget && !placedKinds.has(expectedKind)) {
      const pulse = .08 + (Math.sin(mini.elapsed * 4) + 1) * .05;
      ctx.save(); ctx.globalAlpha = pulse + .35;
      drawKitePart(ctx, expectedKind, expectedTarget.x, expectedTarget.y, 1, true, mini.elapsed);
      ctx.restore();
      ctx.strokeStyle = meta.color; ctx.lineWidth = 3; ctx.setLineDash([5, 7]);
      ctx.beginPath(); ctx.arc(expectedTarget.x, expectedTarget.y, expectedKind === 'sail' ? 115 : 46 + Math.sin(mini.elapsed * 3) * 3, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }

    ctx.fillStyle = 'rgba(255,253,244,.8)';
    roundedRect(ctx, 45, 405, MINI.width - 90, 117, 22); ctx.fill();
    ctx.strokeStyle = 'rgba(65,95,73,.14)'; ctx.lineWidth = 2; ctx.stroke();
    mini.pieces.forEach(piece => {
      if (piece.placed) return;
      const dragging = mini.dragging === piece.index;
      const x = dragging ? mini.pointerX : piece.x;
      const y = dragging ? mini.pointerY : piece.y;
      ctx.save();
      if (!dragging) {
        ctx.fillStyle = piece.kind === mini.assembleOrder[mini.nextPiece] ? 'rgba(255,246,207,.95)' : 'rgba(255,255,255,.78)';
        ctx.beginPath(); ctx.arc(x, y, 45, 0, TAU); ctx.fill();
        ctx.strokeStyle = piece.kind === mini.assembleOrder[mini.nextPiece] ? meta.color : 'rgba(61,91,72,.18)'; ctx.lineWidth = 2; ctx.stroke();
      }
      drawKitePart(ctx, piece.kind, x, y, dragging ? .82 : .38, false, mini.elapsed);
      ctx.restore();
    });
    ctx.fillStyle = meta.ink; ctx.font = '600 14px "PingFang SC", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('先装两根竹骨，再覆纸面，最后系飘带与线轴', MINI.width / 2, 541);
    miniFlashText(ctx, mini);
  }
  function drawWeatherGame(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    mini.buttons = [];
    const weatherTime = mini.finishAt ? 0 : Math.max(0, 1 - mini.roundClock / mini.roundLimit);
    roundedRect(ctx, 64, 26, MINI.width - 128, 9, 5);
    ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.fill();
    roundedRect(ctx, 64, 26, (MINI.width - 128) * weatherTime, 9, 5);
    ctx.fillStyle = weatherTime < .3 ? '#d86046' : '#e6b33d'; ctx.fill();
    const sunny = mini.weatherPattern[mini.weatherIndex] === 1;
    const item = mini.game.items[mini.weatherIndex] || '书';
    ctx.save();
    if (sunny) {
      const grad = ctx.createRadialGradient(MINI.width/2, 120, 14, MINI.width/2, 120, 150);
      grad.addColorStop(0, 'rgba(255,220,76,.9)'); grad.addColorStop(1, 'rgba(255,220,76,0)');
      ctx.fillStyle = grad; ctx.fillRect(0,0,MINI.width,270);
      ctx.fillStyle = '#eab128'; ctx.beginPath(); ctx.arc(MINI.width/2,120,48,0,TAU); ctx.fill();
      ctx.strokeStyle = '#eab128'; ctx.lineWidth = 4;
      for(let i=0;i<10;i++){const a=i/10*TAU;ctx.beginPath();ctx.moveTo(MINI.width/2+Math.cos(a)*66,120+Math.sin(a)*66);ctx.lineTo(MINI.width/2+Math.cos(a)*92,120+Math.sin(a)*92);ctx.stroke();}
    } else {
      ctx.fillStyle = '#8ba5b1';
      ctx.beginPath(); ctx.arc(MINI.width/2-52,118,52,0,TAU); ctx.arc(MINI.width/2+2,94,64,0,TAU); ctx.arc(MINI.width/2+62,122,46,0,TAU); ctx.fill();
      ctx.strokeStyle='rgba(93,145,181,.55)'; ctx.lineWidth=4;
      for(let i=0;i<7;i++){const x=MINI.width/2-100+i*34;ctx.beginPath();ctx.moveTo(x,205);ctx.lineTo(x-12,245);ctx.stroke();}
    }
    ctx.restore();
    ctx.fillStyle = meta.ink;
    ctx.font = '600 18px "PingFang SC", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(sunny ? '太阳出来了' : '乌云压过来了', MINI.width/2, 300);
    drawObjectIcon(ctx, item, MINI.width / 2, 346, 88);
    ctx.font = '600 13px "PingFang SC", sans-serif';
    ctx.fillStyle = meta.ink;
    ctx.fillText(item, MINI.width / 2, 397);
    const choices = [['晒一晒','晒'], ['收回屋','收']];
    choices.forEach((choice,index)=>{
      const x = index === 0 ? 250 : 510;
      roundedRect(ctx,x,410,200,84,20);
      ctx.fillStyle = index===0 ? '#f8e5ae' : '#dcecf2'; ctx.fill();
      ctx.strokeStyle = meta.color; ctx.lineWidth=2; ctx.stroke();
      ctx.fillStyle=meta.ink; ctx.font='600 24px "Songti SC", serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(choice[0],x+100,452);
      mini.buttons.push({x,y:410,w:200,h:84,index});
    });
    miniFlashText(ctx, mini);
  }

  function drawFold(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    ctx.save();
    ctx.translate(MINI.width / 2, 270);
    ctx.fillStyle = '#f6dfb1';
    ctx.beginPath(); ctx.ellipse(0, 0, 135, 92, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = meta.color; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = 'rgba(123,87,45,.35)'; ctx.lineWidth = 2; ctx.setLineDash([5,7]);
    ctx.beginPath(); ctx.moveTo(0,-88); ctx.lineTo(0,88); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#d7a15b';
    ctx.beginPath(); ctx.arc(0, 0, 28, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = meta.ink; ctx.textAlign='center'; ctx.font='600 19px "PingFang SC", sans-serif';
    ctx.fillText('按住左侧面皮，向右拖动折合', MINI.width/2, 420);
    ctx.fillStyle='#748178'; ctx.font='600 13px "PingFang SC", sans-serif';
    ctx.fillText(`已包好 ${mini.round} / ${mini.game.rounds}`, MINI.width/2, 455);
    if (mini.foldDelta > 0) {
      ctx.fillStyle = 'rgba(79,159,90,.25)';
      roundedRect(ctx, MINI.width/2 - 135, 178, Math.min(135, mini.foldDelta), 184, 80); ctx.fill();
    }
    miniFlashText(ctx, mini);
  }

  function drawSalt(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    ctx.fillStyle = meta.ink; ctx.textAlign='center'; ctx.font='600 15px "PingFang SC", sans-serif';
    ctx.fillText('按住并停留在肉条上，让盐粒铺满', MINI.width/2, 80);
    const stripNames=['上','中','下'];
    mini.coverage.forEach((cover,index)=>{
      const y=155+index*115;
      roundedRect(ctx,240,y,480,72,22);
      ctx.fillStyle='#8d4b35'; ctx.fill();
      ctx.strokeStyle=meta.color; ctx.lineWidth=2; ctx.stroke();
      ctx.fillStyle='#f8e0c4'; ctx.font='600 13px "PingFang SC", sans-serif';
      ctx.fillText(`肉条 ${stripNames[index]}`,480,y+36);
      for(let i=0;i<30;i++){
        if(i/30>=cover) continue;
        const x=252+(i*61)%450, yy=y+10+(i*29)%50;
        ctx.fillStyle='rgba(255,255,255,.92)'; ctx.beginPath(); ctx.arc(x,yy,1.8,0,TAU); ctx.fill();
      }
    });
    ctx.fillStyle=meta.ink; ctx.font='600 14px "PingFang SC", sans-serif';
    ctx.fillText(`覆盖 ${Math.round(mini.coverage.reduce((a,b)=>a+b,0) / mini.coverage.length * 100)}%`, MINI.width/2, 515);
    miniFlashText(ctx, mini);
  }

  function drawWipe(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    ctx.fillStyle = meta.ink; ctx.textAlign='center'; ctx.font='600 15px "PingFang SC", sans-serif';
    ctx.fillText('按住扫帚来回拖动，清除雪堆', MINI.width/2, 70);
    mini.patches.forEach(patch=>{
      if(patch.cleared) return;
      ctx.fillStyle='rgba(255,255,255,.95)';
      ctx.beginPath(); ctx.arc(patch.x,patch.y,patch.r,0,TAU); ctx.fill();
      ctx.strokeStyle='rgba(143,211,232,.9)'; ctx.lineWidth=3; ctx.stroke();
      ctx.fillStyle='#86a9b7'; ctx.font='600 17px "Songti SC", serif'; ctx.fillText('雪',patch.x,patch.y+6);
    });
    ctx.fillStyle='#6c8a97'; ctx.font='600 14px "PingFang SC", sans-serif';
    ctx.fillText(`已清扫 ${mini.patches.filter(p=>p.cleared).length} / ${mini.patches.length}`,MINI.width/2,520);
    miniFlashText(ctx,mini);
  }

  function drawRoll(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    ctx.fillStyle = meta.ink; ctx.textAlign='center'; ctx.font='600 15px "PingFang SC", sans-serif';
    ctx.fillText('按住当前面团，画圈把它搓圆', MINI.width/2, 78);
    mini.centers.forEach((center,index)=>{
      const active=index===mini.round;
      ctx.save(); ctx.translate(center.x,center.y);
      ctx.fillStyle=active?meta.pale:'rgba(255,255,255,.65)';
      ctx.beginPath(); ctx.arc(0,0,index<mini.round?59:55,0,TAU); ctx.fill();
      ctx.strokeStyle=index<mini.round?meta.color:'rgba(45,67,51,.18)'; ctx.lineWidth=3; ctx.stroke();
      ctx.fillStyle=index<mini.round?meta.color:meta.ink; ctx.font='500 32px "Songti SC", serif'; ctx.textBaseline='middle';
      ctx.fillText(index<mini.round?'圆':mini.term.glyph,0,3);
      ctx.restore();
    });
    ctx.fillStyle='#748178'; ctx.font='600 13px "PingFang SC", sans-serif';
    ctx.fillText(`已完成 ${mini.round} / ${mini.game.rounds}`,MINI.width/2,455);
    miniFlashText(ctx,mini);
  }

  function drawPour(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    ctx.fillStyle = meta.ink; ctx.textAlign='center'; ctx.font='600 15px "PingFang SC", sans-serif';
    ctx.fillText('按顺序把食材拖进粥锅', MINI.width/2, 72);
    ctx.fillStyle='#d9c2a0'; ctx.beginPath(); ctx.ellipse(480,335,104,66,0,0,TAU); ctx.fill();
    ctx.strokeStyle=meta.color; ctx.lineWidth=3; ctx.stroke();
    ctx.fillStyle=meta.ink; ctx.font='500 28px "Songti SC", serif'; ctx.textBaseline='middle'; ctx.fillText('粥',480,340);
    mini.game.ingredients.forEach((item,index)=>{
      const used=index<mini.index;
      const x=150+index*220, y=455;
      roundedRect(ctx,x,y-38,120,76,16);
      ctx.fillStyle=used?meta.pale:'rgba(255,255,255,.9)'; ctx.fill();
      ctx.strokeStyle=used?meta.color:'rgba(45,67,51,.18)'; ctx.lineWidth=2; ctx.stroke();
      drawObjectIcon(ctx, item.name, x + 60, y - 9, 52);
      ctx.font='600 10px "PingFang SC", sans-serif'; ctx.fillStyle='#748178'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(item.name,x+60,y+26);
    });
    if(mini.dragging!==null){const item=mini.game.ingredients[mini.dragging];ctx.fillStyle='rgba(255,253,244,.9)';ctx.beginPath();ctx.arc(mini.pointerX,mini.pointerY,34,0,TAU);ctx.fill();ctx.strokeStyle=meta.color;ctx.lineWidth=2;ctx.stroke();drawObjectIcon(ctx,item.name,mini.pointerX,mini.pointerY,58);}
    miniFlashText(ctx,mini);
  }

  function drawSweep(ctx, mini) {
    const meta = DATA.seasons[mini.term.season];
    drawMiniBackdrop(ctx, mini);
    ctx.fillStyle = meta.ink; ctx.textAlign='center'; ctx.font='600 15px "PingFang SC", sans-serif';
    ctx.fillText('快速来回划过尘团，每个角落扫两次', MINI.width/2, 70);
    mini.spots.forEach(spot=>{
      if(spot.cleared) return;
      const alpha=.28 + (spot.hits||0)*.18;
      ctx.fillStyle = 'rgba(112,104,87,' + alpha + ')';
      ctx.beginPath(); ctx.arc(spot.x,spot.y,spot.r,0,TAU); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.7)'; ctx.font='600 12px "PingFang SC", sans-serif'; ctx.fillText(spot.hits?'扫':'尘',spot.x,spot.y+4);
    });
    ctx.fillStyle='#748178'; ctx.font='600 14px "PingFang SC", sans-serif';
    ctx.fillText(`已清理 ${mini.spots.filter(s=>s.cleared).length} / ${mini.spots.length}`,MINI.width/2,520);
    miniFlashText(ctx,mini);
  }

})();
