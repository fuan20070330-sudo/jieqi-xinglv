/* 节气行旅 · 游戏状态机与界面 */
(function () {
  'use strict';

  const DATA = window.GAME_DATA;
  const SOLAR = window.SolarClock;
  const SAVE_KEY = 'jieqi-xinglv-save-v1';
  const TERMS = DATA.terms;
  const TERM_BY_ID = Object.fromEntries(TERMS.map(term => [term.id, term]));
  const SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter'];
  const PHASES = [
    { key: 'watch', name: '观天', note: '校准黄经仪' },
    { key: 'pentad', name: '识候', note: '重排三候' },
    { key: 'myth', name: '辨误', note: '证据天平' },
    { key: 'chain', name: '修复', note: '因果链' }
  ];
  const TRIAL_PHASES = [
    { key: 'trial-order', name: '星序', note: '排列节气' },
    { key: 'trial-match', name: '候证', note: '候牌归位' },
    { key: 'trial-truth', name: '万象', note: '综合审校' }
  ];
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const state = {
    screen: 'home',
    season: 'spring',
    codexFilter: 'all',
    run: null,
    save: loadSave(),
    toastTimer: null,
    audio: null,
    modalReturnFocus: null
  };

  function defaultSave() {
    return {
      version: DATA.version,
      startedAt: new Date().toISOString(),
      lastPlayed: new Date().toISOString(),
      levels: {},
      pentads: {},
      trials: {},
      mistakes: [],
      lastRun: null,
      settings: { sound: true }
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
        levels: parsed.levels && typeof parsed.levels === 'object' ? parsed.levels : {},
        pentads: parsed.pentads && typeof parsed.pentads === 'object' ? parsed.pentads : {},
        trials: parsed.trials && typeof parsed.trials === 'object' ? parsed.trials : {},
        mistakes: Array.isArray(parsed.mistakes) ? parsed.mistakes : [],
        settings: { ...fallback.settings, ...(parsed.settings || {}) }
      };
    } catch (error) {
      console.warn('存档读取失败，使用新存档。', error);
      return fallback;
    }
  }

  function persist() {
    state.save.lastPlayed = new Date().toISOString();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state.save));
    } catch (error) {
      console.warn('无法写入本地存档。', error);
      showToast('浏览器阻止了本地存档，本次进度可能无法保留。');
    }
  }

  function checkpointRun(run) {
    if (!run) return;
    state.save.lastRun = {
      type: run.type,
      targetId: run.targetId,
      season: run.season,
      phase: run.phase,
      awaitingNext: Boolean(run.awaitingNext),
      precision: run.precision,
      score: run.score,
      combo: run.combo,
      bestCombo: run.bestCombo,
      wrong: run.wrong,
      hints: run.hints,
      startedAt: run.startedAt
    };
    persist();
  }

  function clearLastRun() {
    state.save.lastRun = null;
    persist();
  }

  function hashString(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return function random() {
      value += 0x6D2B79F5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededShuffle(items, seedText) {
    const copy = items.slice();
    const random = seededRandom(hashString(String(seedText)));
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function escapeHTML(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function mod360(value) {
    return ((value % 360) + 360) % 360;
  }

  function angleDistance(a, b) {
    const raw = Math.abs(mod360(a) - mod360(b));
    return Math.min(raw, 360 - raw);
  }

  function starText(stars) {
    const count = Math.max(0, Math.min(3, Number(stars) || 0));
    return `<span>${'★'.repeat(count)}</span><span class="dim">${'★'.repeat(3 - count)}</span>`;
  }

  function seasonOf(term) {
    return DATA.seasons[term.season];
  }

  function completedTermCount() {
    return TERMS.filter(term => state.save.levels[term.id]?.completed).length;
  }

  function seasonTerms(season) {
    return TERMS.filter(term => term.season === season);
  }

  function seasonComplete(season) {
    return seasonTerms(season).every(term => state.save.levels[term.id]?.completed);
  }

  function chapterUnlocked(season) {
    if (season === 'spring') return true;
    const index = SEASON_ORDER.indexOf(season);
    const previous = SEASON_ORDER[index - 1];
    return Boolean(previous) && seasonComplete(previous);
  }

  function termUnlocked(term) {
    if (!chapterUnlocked(term.season)) return false;
    const list = seasonTerms(term.season);
    const index = list.findIndex(item => item.id === term.id);
    if (index <= 0) return true;
    return Boolean(state.save.levels[list[index - 1].id]?.completed);
  }

  function trialUnlocked(season) {
    return seasonComplete(season);
  }

  function totalStars() {
    let value = 0;
    Object.values(state.save.levels).forEach(record => { value += Number(record.stars) || 0; });
    Object.values(state.save.trials).forEach(record => { value += Number(record.stars) || 0; });
    return value;
  }

  function termStarsTotal() {
    return Object.values(state.save.levels).reduce((sum, record) => sum + (Number(record.stars) || 0), 0);
  }

  function totalScore() {
    return Object.values(state.save.levels).reduce((sum, record) => sum + (Number(record.bestScore) || 0), 0);
  }

  function pentadKey(termId, index) {
    return `${termId}::${index}`;
  }

  function pentadCount() {
    return Object.keys(state.save.pentads).filter(key => state.save.pentads[key]).length;
  }

  function setSeasonTheme(season) {
    const meta = DATA.seasons[season];
    if (!meta) return;
    document.documentElement.style.setProperty('--season', meta.color);
    document.documentElement.style.setProperty('--season-pale', meta.pale);
    document.documentElement.style.setProperty('--season-deep', meta.deep);
  }

  function showScreen(name) {
    state.screen = name;
    $$('.screen').forEach(screen => screen.classList.toggle('is-active', screen.id === `screen-${name}`));
    $$('.nav-btn').forEach(button => {
      const target = button.dataset.nav;
      button.classList.toggle('is-active', name === target || (name === 'game' && target === 'map'));
    });
    if (name === 'map') renderMap();
    if (name === 'codex') renderCodex();
    if (name === 'review') renderReview();
    if (name === 'card') renderTravelCard();
    window.scrollTo({ top: 0, behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
    if (name === 'game') setTimeout(() => $('#gamePanel')?.focus({ preventScroll: true }), 60);
  }

  function updateHome() {
    const done = completedTermCount();
    const stars = termStarsTotal();
    const collected = pentadCount();
    const startButton = $('#startBtn');
    if (state.save.lastRun) {
      startButton.textContent = '继续行旅';
    } else if (done > 0) {
      startButton.textContent = '重返星图';
    } else {
      startButton.textContent = '进入时轮';
    }
    const percent = Math.round((done / 24) * 100);
    $('#homeProgress').innerHTML = `
      <div><span>节气节点</span><strong>${done} / 24</strong></div>
      <div><span>物候收录</span><strong>${collected} / 72</strong></div>
      <div><span>星数</span><strong>${stars} / 72</strong></div>
      <div class="progress-meter" aria-label="主线完成度 ${percent}%"><i style="width:${percent}%"></i></div>
      ${done === 24 ? '<button class="btn btn--small btn--ghost" data-travel-card>查看时间行旅</button>' : ''}
    `;
    const now = new Date();
    const liveTerm = SOLAR.currentTerm(now, TERMS);
    const longitude = SOLAR.solarApparentLongitude(now);
    const declination = SOLAR.solarDeclination(now);
    $('#liveTerm').textContent = `今近${liveTerm.name} · ${longitude.toFixed(1)}°`;
    $('#homeLiveReading').textContent = `当前近似黄经 ${longitude.toFixed(1)}° · 直射 ${SOLAR.declinationText(declination)}`;
    const needle = $('#homeChronometer .chrono-needle');
    if (needle) needle.style.setProperty('--needle-angle', `${longitude}deg`);
  }

  function polarPoint(cx, cy, radius, angle) {
    const rad = (angle - 90) * Math.PI / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  function arcPath(cx, cy, radius, startAngle, endAngle) {
    const start = polarPoint(cx, cy, radius, startAngle);
    const end = polarPoint(cx, cy, radius, endAngle);
    const diff = mod360(endAngle - startAngle);
    const large = diff > 180 ? 1 : 0;
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  }

  function buildAmbient() {
    const holder = $('#ambientStars');
    const random = seededRandom(20260204);
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 68; i += 1) {
      const dot = document.createElement('i');
      dot.className = 'star-dot';
      dot.style.left = `${(random() * 100).toFixed(2)}%`;
      dot.style.top = `${(random() * 100).toFixed(2)}%`;
      dot.style.setProperty('--o', (0.15 + random() * 0.5).toFixed(2));
      dot.style.setProperty('--dur', `${(3.5 + random() * 6).toFixed(2)}s`);
      dot.style.setProperty('--delay', `${(-random() * 6).toFixed(2)}s`);
      fragment.appendChild(dot);
    }
    holder.appendChild(fragment);
  }

  function buildHomeDial() {
    const ticks = $('#homeDialTicks');
    const arcs = $('#homeSeasonArcs');
    const nodes = $('#homeOrbitNodes');
    let tickMarkup = '';
    for (let degree = 0; degree < 360; degree += 5) {
      const major = degree % 15 === 0;
      const outer = 266;
      const inner = major ? 246 : 254;
      const a = polarPoint(310, 310, outer, degree);
      const b = polarPoint(310, 310, inner, degree);
      tickMarkup += `<line class="chrono-tick${major ? ' chrono-tick--major' : ''}" x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}"/>`;
    }
    [['0°', 0], ['90°', 90], ['180°', 180], ['270°', 270]].forEach(([label, degree]) => {
      const p = polarPoint(310, 310, 225, degree);
      tickMarkup += `<text class="chrono-label" x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="middle">${label}</text>`;
    });
    ticks.innerHTML = tickMarkup;

    let arcMarkup = '';
    let nodeMarkup = '';
    SEASON_ORDER.forEach(season => {
      const meta = DATA.seasons[season];
      const terms = seasonTerms(season);
      const start = (terms[0].longitude + 360) % 360;
      arcMarkup += `<path class="chrono-season" d="${arcPath(310, 310, 183, start, start + 90)}" style="--arc-color:${meta.color}"/>`;
      const mid = polarPoint(310, 310, 139, start + 45);
      arcMarkup += `<text class="chrono-season-label" x="${mid.x}" y="${mid.y}" text-anchor="middle" dominant-baseline="middle" style="--arc-color:${meta.color}">${meta.name}</text>`;
      terms.forEach(term => {
        const p = polarPoint(310, 310, 206, (term.longitude + 360) % 360);
        const node = polarPoint(310, 310, 201, (term.longitude + 360) % 360);
        nodeMarkup += `<circle class="chrono-term-dot chrono-term-dot--season" cx="${node.x}" cy="${node.y}" r="4" style="--arc-color:${meta.color}"><title>${term.name}</title></circle>`;
        if (term.order % 2 === 0) {
          const label = polarPoint(310, 310, 231, (term.longitude + 360) % 360);
          nodeMarkup += `<text class="chrono-label" x="${label.x}" y="${label.y}" text-anchor="middle" dominant-baseline="middle">${term.name}</text>`;
        }
      });
    });
    arcs.innerHTML = arcMarkup;
    nodes.innerHTML = nodeMarkup;
  }

  function renderMap() {
    if (!chapterUnlocked(state.season)) {
      state.season = SEASON_ORDER.find(season => chapterUnlocked(season)) || 'spring';
    }
    setSeasonTheme(state.season);
    const done = completedTermCount();
    const stars = termStarsTotal();
    const collected = pentadCount();
    const trialsDone = Object.values(state.save.trials).filter(record => record.completed).length;
    $('#mapStats').innerHTML = `
      <div class="stat-pill"><span>主线节点</span><strong>${done} / 24</strong></div>
      <div class="stat-pill"><span>节气星数</span><strong>${stars} / 72</strong></div>
      <div class="stat-pill"><span>物候收录</span><strong>${collected} / 72</strong></div>
      <div class="stat-pill"><span>章末印记</span><strong>${trialsDone} / 4</strong></div>
    `;
    $('#seasonTabs').innerHTML = SEASON_ORDER.map(season => {
      const meta = DATA.seasons[season];
      const unlocked = chapterUnlocked(season);
      return `<button class="season-tab ${state.season === season ? 'is-active' : ''}" role="tab" aria-selected="${state.season === season}" style="--tab-color:${meta.color}" data-season="${season}" ${unlocked ? '' : 'disabled'}>${meta.title.split(' · ')[0]} · ${meta.name}</button>`;
    }).join('');

    const meta = DATA.seasons[state.season];
    const list = seasonTerms(state.season);
    const complete = list.filter(term => state.save.levels[term.id]?.completed).length;
    const progress = Math.round((complete / 6) * 100);
    const seals = list.map(term => `<span class="mini-seal ${state.save.levels[term.id]?.completed ? 'is-done' : ''}" title="${term.name}">${term.glyph}</span>`).join('');
    $('#chapterPanel').style.setProperty('--chapter', meta.color);
    $('#chapterPanel').innerHTML = `
      <div class="chapter-overview">
        <div class="chapter-orbit"><span class="chapter-orbit__char">${meta.name}</span><span class="chapter-orbit__label">SEASON CLOCK</span></div>
        <div class="chapter-copy">
          <h3>${meta.title}</h3>
          <p>${meta.motto}。本章共 6 个节气节点；依次校准黄经、辨认三候、辨析误区并修复物候因果链。章节试炼会在 6 个节点完成后开启。</p>
        </div>
        <div class="chapter-progress">
          <div class="chapter-progress__row"><span>本章修复进度</span><strong>${complete} / 6</strong></div>
          <div class="chapter-progress__bar"><i style="width:${progress}%"></i></div>
          <div class="chapter-progress__seal">${seals}</div>
        </div>
      </div>
      <div class="level-grid">
        ${list.map((term, index) => renderLevelNode(term, index)).join('')}
      </div>
    `;

    const trial = DATA.trials.find(item => item.season === state.season);
    const trialRecord = state.save.trials[trial.id];
    const unlocked = trialUnlocked(state.season);
    $('#trialPanel').style.setProperty('--season', meta.color);
    $('#trialPanel').innerHTML = `
      <div class="trial-panel__sigil">${unlocked ? '试' : '锁'}</div>
      <div class="trial-panel__copy">
        <h3>章末试炼 · ${trial.name}</h3>
        <p>${unlocked ? `综合检验${meta.name}季节气星序、物候归属与科学辨析。${trialRecord?.completed ? `最佳 ${trialRecord.bestScore} 分 · ${'★'.repeat(trialRecord.stars)}` : '尚未校准。'}` : '完成本章全部 6 个节气节点后开启。'}</p>
      </div>
      <button class="btn ${unlocked ? 'btn--primary' : 'btn--ghost'}" data-trial="${trial.id}" ${unlocked ? '' : 'disabled'}>${trialRecord?.completed ? '重试试炼' : unlocked ? '进入试炼' : '尚未解锁'}</button>
    `;
  }

  function renderLevelNode(term, index) {
    const record = state.save.levels[term.id];
    const unlocked = termUnlocked(term);
    const complete = Boolean(record?.completed);
    const classes = ['level-node', unlocked ? 'is-available' : 'is-locked', complete ? 'is-completed' : ''].join(' ');
    const stateText = complete ? '已修复' : unlocked ? '待校准' : '未解锁';
    return `
      <button class="${classes}" data-level="${term.id}" aria-label="${term.name}，${stateText}${complete ? `，${record.stars}星` : ''}">
        <span class="level-node__top">
          <span class="level-node__order">NODE ${String(index + 1).padStart(2, '0')}</span>
          <span class="level-node__gem">${unlocked ? term.glyph : '·'}</span>
        </span>
        <span class="level-node__glyph">${term.name.slice(0, 1)}</span>
        <span class="level-node__name">${term.name}</span>
        <span class="level-node__meta">黄经 ${(term.longitude + 360) % 360}° · ${term.dateHint}</span>
        ${complete ? `<span class="level-node__stars">${starText(record.stars)}</span>` : unlocked ? '<span class="level-node__stars" style="color:var(--ink-dim)">未校准</span>' : `<span class="level-node__lock"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg> 完成前一节点</span>`}
      </button>
    `;
  }

  function buildTermOptions(term) {
    const important = [term, TERMS[(term.order + 5) % 24], TERMS[(term.order + 11) % 24], TERMS[(term.order + 17) % 24]];
    return seededShuffle(important, `${term.id}-terms`);
  }

  function buildPentadOptions(term) {
    const correct = term.pentads.map((pentad, index) => ({
      key: pentadKey(term.id, index),
      termId: term.id,
      index,
      name: pentad.name,
      note: pentad.note,
      correct: true
    }));
    const distances = [5, 11, 17];
    const distractors = distances.map((distance, i) => {
      const source = TERMS[(term.order + distance) % 24];
      const index = (term.order + i + 1) % 3;
      return {
        key: pentadKey(source.id, index),
        termId: source.id,
        index,
        name: source.pentads[index].name,
        note: source.pentads[index].note,
        correct: false
      };
    });
    return seededShuffle(correct.concat(distractors), `${term.id}-pentad-options`);
  }

  function buildEvidenceOptions(term) {
    const options = [
      ...term.myth.evidence.map((item, index) => ({ ...item, ok: true, key: `e${index}` })),
      ...term.myth.traps.map((item, index) => ({ text: item.text, tag: '干扰项', why: item.why, ok: false, key: `t${index}` }))
    ];
    return seededShuffle(options, `${term.id}-evidence`);
  }

  function buildChainPool(term) {
    return seededShuffle(term.chain.map((text, index) => ({ text, index })), `${term.id}-chain`);
  }

  function initialWatchAngle(term) {
    const offset = term.order % 2 === 0 ? 25 : -25;
    return mod360(term.longitude + offset);
  }

  function createTermRun(term, checkpoint = null) {
    const base = {
      type: 'term',
      targetId: term.id,
      season: term.season,
      phase: checkpoint?.phase || 0,
      awaitingNext: Boolean(checkpoint?.awaitingNext),
      precision: checkpoint?.precision ?? 100,
      score: checkpoint?.score ?? 0,
      combo: checkpoint?.combo ?? 0,
      bestCombo: checkpoint?.bestCombo ?? 0,
      wrong: checkpoint?.wrong ?? 0,
      hints: checkpoint?.hints ?? 0,
      startedAt: checkpoint?.startedAt || new Date().toISOString(),
      phaseFeedback: null,
      watch: {
        angle: initialWatchAngle(term),
        locked: false,
        hintShown: false,
        message: ''
      },
      pentad: {
        options: buildPentadOptions(term),
        selection: [],
        stage: 'select',
        orderPool: [],
        ordered: [],
        attempts: 0,
        message: ''
      },
      myth: {
        options: buildEvidenceOptions(term),
        selected: [],
        attempts: 0,
        message: ''
      },
      chain: {
        pool: buildChainPool(term),
        placed: [],
        message: ''
      }
    };
    return base;
  }

  function createTrialRun(trial, checkpoint = null) {
    const orderOptions = seededShuffle(trial.order.map(id => TERM_BY_ID[id]), `${trial.id}-order`);
    const matchOptions = trial.match.map((pair, index) => ({
      key: `m${index}`,
      termId: pair.termId,
      pentad: pair.pentad,
      correct: true
    }));
    const usedTerms = new Set(trial.order);
    const distractorTerms = TERMS.filter(term => !usedTerms.has(term.id));
    [0, 1, 2].forEach((offset) => {
      const term = distractorTerms[(trial.season.length + offset * 7) % distractorTerms.length];
      const pentadIndex = (offset + trial.order.length) % 3;
      matchOptions.push({
        key: `d${offset}`,
        termId: term.id,
        pentad: term.pentads[pentadIndex].name,
        correct: false
      });
    });
    return {
      type: 'trial',
      targetId: trial.id,
      season: trial.season,
      phase: checkpoint?.phase || 0,
      awaitingNext: Boolean(checkpoint?.awaitingNext),
      precision: checkpoint?.precision ?? 100,
      score: checkpoint?.score ?? 0,
      combo: checkpoint?.combo ?? 0,
      bestCombo: checkpoint?.bestCombo ?? 0,
      wrong: checkpoint?.wrong ?? 0,
      hints: checkpoint?.hints ?? 0,
      startedAt: checkpoint?.startedAt || new Date().toISOString(),
      phaseFeedback: null,
      trial: {
        orderOptions,
        orderPicks: [],
        matchOptions: seededShuffle(matchOptions, `${trial.id}-match`),
        matched: {},
        statementSelection: [],
        message: ''
      }
    };
  }

  function startTerm(termId) {
    const term = TERM_BY_ID[termId];
    if (!term) return;
    if (!termUnlocked(term)) {
      showToast(termUnlocked(term) ? '该节点尚未解锁。' : '先完成前一节气，才能接入这条星轨。');
      return;
    }
    state.season = term.season;
    state.run = createTermRun(term);
    checkpointRun(state.run);
    setSeasonTheme(term.season);
    showScreen('game');
    renderGame();
  }

  function startTrial(trialId) {
    const trial = DATA.trials.find(item => item.id === trialId);
    if (!trial) return;
    if (!trialUnlocked(trial.season)) {
      showToast('完成本章 6 个节气节点后，试炼才会开启。');
      return;
    }
    state.season = trial.season;
    state.run = createTrialRun(trial);
    checkpointRun(state.run);
    setSeasonTheme(trial.season);
    showScreen('game');
    renderGame();
  }

  function resumeLastRun() {
    const checkpoint = state.save.lastRun;
    if (!checkpoint) {
      showScreen('map');
      return;
    }
    let run = null;
    if (checkpoint.type === 'trial') {
      const trial = DATA.trials.find(item => item.id === checkpoint.targetId);
      if (!trial) {
        clearLastRun();
        showScreen('map');
        return;
      }
      run = createTrialRun(trial, checkpoint);
    } else {
      const term = TERM_BY_ID[checkpoint.targetId];
      if (!term) {
        clearLastRun();
        showScreen('map');
        return;
      }
      run = createTermRun(term, checkpoint);
    }
    state.season = checkpoint.season;
    state.run = run;
    setSeasonTheme(run.season);
    showScreen('game');
    renderGame();
  }

  function currentPhases(run) {
    return run.type === 'trial' ? TRIAL_PHASES : PHASES;
  }

  function currentTarget(run) {
    return run.type === 'trial'
      ? DATA.trials.find(item => item.id === run.targetId)
      : TERM_BY_ID[run.targetId];
  }

  function renderGame() {
    const run = state.run;
    if (!run) {
      showScreen('map');
      return;
    }
    const target = currentTarget(run);
    const meta = DATA.seasons[run.season];
    const phases = currentPhases(run);
    const currentPhase = phases[Math.min(run.phase, phases.length - 1)];
    $('#screen-game').style.setProperty('--season', meta.color);
    $('#screen-game').style.setProperty('--chapter', meta.color);
    $('#gameKicker').textContent = run.type === 'trial'
      ? `${meta.name}章 · ${target.name} · 章末试炼`
      : `${meta.name}章 · 第 ${target.order + 1} 节 · ${target.pinyin}`;
    $('#gameTitle').textContent = run.awaitingNext ? '校准记录已封存' : currentPhase.name;
    $('#scoreValue').textContent = run.score;
    $('#comboValue').textContent = `×${run.combo}`;
    $('#precisionValue').textContent = `${run.precision}%`;
    $('#railTerm').innerHTML = run.type === 'trial'
      ? `<div class="rail-term__season">${meta.name}章试炼</div><div class="rail-term__name">${target.name}</div><div class="rail-term__long">综合节点</div>`
      : `<div class="rail-term__season">${meta.name}章 · 黄经 ${target.longitude}°</div><div class="rail-term__name">${target.name}</div><div class="rail-term__long">${target.dateHint}</div>`;
    $('#phaseList').innerHTML = phases.map((phase, index) => {
      const done = index < run.phase || (index === run.phase && run.awaitingNext);
      const active = index === run.phase && !run.awaitingNext;
      return `<li class="phase-item ${done ? 'is-done' : ''} ${active ? 'is-active' : ''}"><span class="phase-item__num"><span>${String(index + 1).padStart(2, '0')}</span></span><span class="phase-item__copy"><strong>${phase.name}</strong><small>${phase.note}</small></span></li>`;
    }).join('');

    if (run.awaitingNext) {
      renderPhaseComplete(run);
    } else if (run.type === 'trial') {
      renderTrialPhase(run, target, run.phase);
    } else {
      renderTermPhase(run, target, run.phase);
    }
  }

  function updateGameHud(run) {
    $('#scoreValue').textContent = run.score;
    $('#comboValue').textContent = `×${run.combo}`;
    $('#precisionValue').textContent = `${run.precision}%`;
  }

  function registerError(run) {
    run.precision = Math.max(40, run.precision - 8);
    run.combo = 0;
    run.wrong += 1;
    playSound('error');
    updateGameHud(run);
    checkpointRun(run);
  }

  function phaseBaseScore(run) {
    return run.type === 'trial' ? 334 : 250;
  }

  function awardPhase(run, title, text) {
    run.combo += 1;
    run.bestCombo = Math.max(run.bestCombo, run.combo);
    run.score = Math.min(1000, run.score + Math.round(phaseBaseScore(run) * run.precision / 100));
    run.awaitingNext = true;
    run.phaseFeedback = { title, text };
    playSound('correct');
    checkpointRun(run);
    renderGame();
  }

  function renderPhaseComplete(run) {
    const phases = currentPhases(run);
    const phase = phases[run.phase];
    const last = run.phase >= phases.length - 1;
    const feedback = run.phaseFeedback || {
      title: `${phase.name}记录已校准`,
      text: '这段校准已写入本地存档。继续下一段，修复时轮。'
    };
    $('#gamePanel').innerHTML = `
      <div class="instruction-card instruction-card--accent">
        <span class="instruction-card__label">CALIBRATION LOG</span>
        <p><strong>${escapeHTML(feedback.title)}</strong> · ${escapeHTML(feedback.text)}</p>
      </div>
      <div style="min-height:390px;display:grid;place-items:center;text-align:center">
        <div>
          <div class="result-seal" style="margin:0 auto 20px;box-shadow:none">${last ? '成' : phase.name.slice(0,1)}</div>
          <h3 style="margin:0 0 8px;color:#eee4d1;font-size:32px;font-weight:500">${escapeHTML(feedback.title)}</h3>
          <p style="max-width:520px;margin:0 auto;color:#949e9b;font-size:12px;line-height:1.9">${escapeHTML(feedback.text)}</p>
          <div class="tag-row" style="justify-content:center;margin-top:18px">
            <span class="tag tag--season">当前精度 ${run.precision}%</span>
            <span class="tag tag--season">最高连击 ×${run.bestCombo}</span>
            <span class="tag tag--season">累计时轮分 ${run.score}</span>
          </div>
        </div>
      </div>
      <div class="phase-actions">
        <span class="phase-actions__note">${last ? '完成本节点后，下一节点通常会在星图上解锁。' : `下一段：${phases[run.phase + 1].name} · ${phases[run.phase + 1].note}`}</span>
        <button class="btn btn--primary" data-action="continue-phase">${last ? (run.type === 'trial' ? '封存试炼印记' : '完成节气修复') : '继续校准'}</button>
      </div>
    `;
  }

  function continuePhase() {
    const run = state.run;
    if (!run?.awaitingNext) return;
    const phases = currentPhases(run);
    if (run.phase >= phases.length - 1) {
      finishRun(run);
      return;
    }
    run.phase += 1;
    run.awaitingNext = false;
    run.phaseFeedback = null;
    checkpointRun(run);
    renderGame();
  }

  function renderTermPhase(run, term, phaseIndex) {
    if (phaseIndex === 0) renderWatchPhase(run, term);
    else if (phaseIndex === 1) renderPentadPhase(run, term);
    else if (phaseIndex === 2) renderMythPhase(run, term);
    else renderChainPhase(run, term);
  }

  function feedbackMarkup(message, correct = false) {
    if (!message) return '';
    return `<div class="feedback-box is-visible ${correct ? 'is-correct' : 'is-wrong'}">${escapeHTML(message)}</div>`;
  }

  function dialMarkup(run, term) {
    const angle = mod360(run.watch.angle);
    const target = mod360(term.longitude);
    let tickMarkup = '';
    for (let degree = 0; degree < 360; degree += 5) {
      const major = degree % 15 === 0;
      const outer = 201;
      const inner = major ? 178 : 187;
      const a = polarPoint(210, 210, outer, degree);
      const b = polarPoint(210, 210, inner, degree);
      tickMarkup += `<line class="dial-tick${major ? ' dial-tick--major' : ''}" x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}"/>`;
    }
    let targets = '';
    const targetLineA = polarPoint(210, 210, 162, target);
    const targetLineB = polarPoint(210, 210, 199, target);
    targets += `<line class="dial-target-line" x1="${targetLineA.x}" y1="${targetLineA.y}" x2="${targetLineB.x}" y2="${targetLineB.y}"/>`;
    const targetRing = polarPoint(210, 210, 161, target);
    targets += `<circle class="dial-target" cx="${targetRing.x}" cy="${targetRing.y}" r="8"/>`;
    const targetLabel = polarPoint(210, 210, 142, target);
    targets += `<text class="dial-target-label" x="${targetLabel.x}" y="${targetLabel.y}" text-anchor="middle" dominant-baseline="middle">目标</text>`;
    let degreeLabels = '';
    [0, 90, 180, 270].forEach(degree => {
      const p = polarPoint(210, 210, 219, degree);
      degreeLabels += `<text class="dial-degree" x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="middle">${degree}°</text>`;
    });
    const aligned = angleDistance(angle, target) <= 4;
    return `
      <div class="dial-wrap">
        <svg class="dial-svg" viewBox="0 0 420 420" role="img" aria-label="可旋转太阳黄经仪，当前 ${angle} 度，目标 ${target} 度">
          <defs>
            <radialGradient id="sunDialGradient" cx="38%" cy="32%" r="72%">
              <stop offset="0" stop-color="#f2dea9"/><stop offset=".55" stop-color="#d7b466"/><stop offset="1" stop-color="#9b4d3d"/>
            </radialGradient>
          </defs>
          <circle class="dial-face" cx="210" cy="210" r="205"/>
          <circle class="dial-inner" cx="210" cy="210" r="158"/>
          <circle class="dial-inner" cx="210" cy="210" r="108"/>
          <circle class="dial-sun-arc" cx="210" cy="210" r="132"/>
          ${tickMarkup}
          ${degreeLabels}
          ${targets}
          <g transform="rotate(${angle} 210 210)">
            <line class="dial-needle-line" x1="210" y1="210" x2="210" y2="44"/>
            <circle class="dial-needle-cap" cx="210" cy="58" r="7"/>
          </g>
          <circle class="dial-axis" cx="210" cy="210" r="11"/>
          <g transform="rotate(${angle} 210 210)">
            <circle class="dial-sun-core" cx="210" cy="210" r="49"/>
            <path class="dial-sun-rays" d="M210 137v-17M210 300v-17M137 210h-17M300 210h-17M158 158l-12-12M274 274l-12-12M262 158l12-12M146 274l12-12"/>
            <text x="210" y="217" text-anchor="middle" style="font-family:var(--font-display);font-size:27px;fill:#192129">日</text>
          </g>
        </svg>
      </div>
      <div class="dial-readout">
        <button class="dial-adjust" data-action="dial-minus" aria-label="黄经减少5度">−</button>
        <strong id="dialAngleText">${Math.round(angle)}°</strong>
        <button class="dial-adjust" data-action="dial-plus" aria-label="黄经增加5度">＋</button>
        <span>拖动滑杆 · 方向键微调</span>
      </div>
      <input class="dial-range" id="dialRange" type="range" min="0" max="359" step="1" value="${Math.round(angle)}" aria-label="校准太阳黄经角度">
      <div class="alignment-state ${aligned ? 'is-aligned' : ''}" id="alignmentState"><span class="alignment-state__light"></span><span id="alignmentText">${aligned ? '指针已进入目标刻度' : `还差 ${Math.round(angleDistance(angle, target))}° 对准目标`}</span></div>
    `;
  }

  function renderWatchPhase(run, term) {
    const target = mod360(term.longitude);
    const aligned = angleDistance(run.watch.angle, target) <= 4;
    const declination = SOLAR.solarDeclination(new Date(Date.UTC(2026, 0, 1)));
    const choices = run.watch.locked ? `
      <div class="term-choice-block">
        <div class="instruction-card">
          <span class="instruction-card__label">节气印识别</span>
          <p>黄经仪已经锁定。请根据观测线索，从四枚节气印中选出当前节点。</p>
        </div>
        <h4>选择节气印</h4>
        <div class="term-choice-grid">
          ${buildTermOptions(term).map(option => `<button class="term-choice" data-term-choice="${option.id}"><small>${option.season === term.season ? '同章候选' : '跨季候选'}</small><strong>${option.name}</strong></button>`).join('')}
        </div>
      </div>
    ` : '';
    $('#gamePanel').innerHTML = `
      <div class="stage-head">
        <div>
          <div class="stage-kicker">PHASE 01 · OBSERVE THE SUN</div>
          <h3>校准黄经仪</h3>
          <p>拖动日轮指针，让太阳标记对准观测目标。黄经从春分 0° 起沿黄道计量；锁定仪器后，再辨认节气。</p>
        </div>
        <div class="stage-objective"><strong>本段目标</strong>将指针误差控制在 ±4°，并识别 ${term.name} 的黄经节点。</div>
      </div>
      <div class="watch-layout">
        <div class="watch-visual">${dialMarkup(run, term)}</div>
        <div class="watch-readout">
          <div class="instruction-card instruction-card--accent">
            <span class="instruction-card__label">今日观测记录 · 北半球</span>
            <p><strong>${term.watch.cue}</strong><br>${term.watch.detail}</p>
          </div>
          <div class="readout-main">
            <span class="readout-main__cue">${term.watch.cue}</span>
            <span class="readout-main__detail">${term.astronomy}</span>
          </div>
          <div class="readout-matrix">
            <div class="readout-cell"><span>节气序列</span><strong>${String(term.order + 1).padStart(2, '0')} / 24</strong></div>
            <div class="readout-cell"><span>公历近似</span><strong>${term.dateHint}</strong></div>
            <div class="readout-cell"><span>太阳赤纬</span><strong>${term.watch.detail.split(' · ')[0]}</strong></div>
            <div class="readout-cell"><span>观测地</span><strong>北半球通用</strong></div>
          </div>
          <div class="tag-row"><span class="tag">太阳视黄经为近似值</span><span class="tag">正式历算以权威历书为准</span></div>
          ${feedbackMarkup(run.watch.message)}
          <div class="phase-actions">
            <span class="phase-actions__note">${run.watch.hintShown ? term.watch.hint : '卡住时可查看一次校准线索，会扣除 5% 精度。'}</span>
            ${run.watch.hintShown ? '' : '<button class="btn btn--quiet btn--small" data-action="dial-hint">提示</button>'}
            <button class="btn btn--primary" data-action="lock-dial" ${aligned ? '' : 'disabled'}>${run.watch.locked ? '黄经已锁定' : '锁定黄经'}</button>
          </div>
        </div>
      </div>
      ${choices}
    `;
    bindDialRange();
  }

  function bindDialRange() {
    const range = $('#dialRange');
    if (!range) return;
    range.addEventListener('input', () => {
      if (!state.run || state.run.type !== 'term') return;
      state.run.watch.angle = mod360(Number(range.value));
      updateDialView();
    });
  }

  function updateDialView() {
    const run = state.run;
    if (!run || run.type !== 'term') return;
    const term = TERM_BY_ID[run.targetId];
    const angle = mod360(run.watch.angle);
    const target = mod360(term.longitude);
    const diff = angleDistance(angle, target);
    const aligned = diff <= 4;
    const text = $('#dialAngleText');
    const range = $('#dialRange');
    const alignment = $('#alignmentState');
    const alignmentText = $('#alignmentText');
    if (text) text.textContent = `${Math.round(angle)}°`;
    if (range) range.value = Math.round(angle);
    if (alignment) alignment.classList.toggle('is-aligned', aligned);
    if (alignmentText) alignmentText.textContent = aligned ? '指针已进入目标刻度' : `还差 ${Math.round(diff)}° 对准目标`;
    const needle = $('#gamePanel .dial-svg g[transform]');
    if (needle) needle.setAttribute('transform', `rotate(${angle} 210 210)`);
    const lock = $('[data-action="lock-dial"]');
    if (lock && !run.watch.locked) lock.disabled = !aligned;
  }

  function adjustDial(delta) {
    if (!state.run || state.run.type !== 'term') return;
    state.run.watch.angle = mod360(state.run.watch.angle + delta);
    updateDialView();
    playSound('tick');
  }

  function lockDial() {
    const run = state.run;
    if (!run || run.type !== 'term') return;
    const term = TERM_BY_ID[run.targetId];
    if (angleDistance(run.watch.angle, term.longitude) > 4) {
      showToast('指针还没有进入目标刻度。');
      return;
    }
    run.watch.locked = true;
    playSound('lock');
    renderWatchPhase(run, term);
  }

  function useDialHint() {
    const run = state.run;
    if (!run || run.type !== 'term' || run.watch.hintShown) return;
    run.watch.hintShown = true;
    run.hints += 1;
    run.precision = Math.max(40, run.precision - 5);
    checkpointRun(run);
    updateGameHud(run);
    playSound('hint');
    renderWatchPhase(run, TERM_BY_ID[run.targetId]);
  }

  function chooseTerm(termId) {
    const run = state.run;
    if (!run || run.type !== 'term' || !run.watch.locked) return;
    const term = TERM_BY_ID[run.targetId];
    if (termId === term.id) {
      awardPhase(run, `${term.name}黄经节点已识别`, `${term.watch.cue} 与 ${term.watch.detail} 相互印证，观天段完成。`);
      return;
    }
    const chosen = TERM_BY_ID[termId];
    registerError(run);
    run.watch.message = `“${chosen.name}”不是这个黄经节点。再核对目标刻度与节气顺序。`;
    renderWatchPhase(run, term);
  }

  function renderPentadPhase(run, term) {
    const pentad = run.pentad;
    const ordering = pentad.stage === 'order';
    const stepMarkup = `
      <div class="pentad-step">
        <span class="is-current">1</span><b>选出三候</b>
        <span>→</span>
        <span class="${ordering ? 'is-current' : ''}">2</span><b>按初、二、三候排序</b>
      </div>
    `;
    let board = '';
    if (!ordering) {
      board = `
        <div class="pentad-board">
          ${pentad.options.map(option => {
            const selected = pentad.selection.includes(option.key);
            return `<button class="pentad-card ${selected ? 'is-selected' : ''}" data-pentad="${option.key}" aria-pressed="${selected}">
              <span class="pentad-card__tag">候牌 · ${option.correct ? '待校验' : '时令残影'}</span>
              <strong>${option.name}</strong>
              <p>${option.note}</p>
              <span class="pentad-card__check">✓</span>
            </button>`;
          }).join('')}
        </div>
      `;
    } else {
      board = `
        <div class="order-board">
          <div class="order-tray">
            ${[0,1,2].map(index => {
              const key = pentad.ordered[index];
              const item = key ? pentad.orderPool.find(card => card.key === key) : null;
              return `<div class="order-slot ${item ? 'is-filled' : ''}"><span class="order-slot__label">${['初候','二候','三候'][index]}</span>${item ? `<strong>${item.name}</strong>` : '<span class="chain-slot__empty">等待候牌</span>'}</div>`;
            }).join('')}
          </div>
          <div class="order-card-pool">
            ${pentad.orderPool.map(card => `<button class="order-card" data-order-pick="${card.key}" ${pentad.ordered.includes(card.key) ? 'disabled' : ''}>${card.name}<small>点击按顺序放入</small></button>`).join('')}
          </div>
        </div>
      `;
    }
    $('#gamePanel').innerHTML = `
      <div class="stage-head">
        <div>
          <div class="stage-kicker">PHASE 02 · READ THE PHENOLOGY</div>
          <h3>重排七十二候</h3>
          <p>候牌中混入了其他节气的物候。先找出属于 ${term.name} 的三候，再按初候、二候、三候排入观察槽。</p>
        </div>
        <div class="stage-objective"><strong>本段目标</strong>${ordering ? '把三枚正确候牌按传统顺序排列。' : '从 6 枚候牌中选出 3 枚正确物候。'}</div>
      </div>
      ${stepMarkup}
      <div class="instruction-card instruction-card--accent">
        <span class="instruction-card__label">物候档案 · 古代观察记录</span>
        <p>七十二候是古人长期观察形成的时令记录，不等同现代气象或生物学的定量标准。游戏以传统候名作为文化线索。</p>
      </div>
      ${board}
      ${feedbackMarkup(pentad.message)}
      <div class="phase-actions">
        <span class="phase-actions__note">${ordering ? '排序错误会让连击归零，但可以重新尝试。' : `已选择 <strong class="pentad-selected-count">${pentad.selection.length}</strong> / 3 枚候牌`}</span>
        ${ordering ? '<button class="btn btn--quiet btn--small" data-action="reset-order">重排</button>' : ''}
        <button class="btn btn--primary" data-action="${ordering ? 'submit-order' : 'submit-pentads'}" ${ordering ? (pentad.ordered.length === 3 ? '' : 'disabled') : (pentad.selection.length === 3 ? '' : 'disabled')}>${ordering ? '校准三候' : '确认三候'}</button>
      </div>
    `;
  }

  function togglePentad(key) {
    const run = state.run;
    if (!run || run.type !== 'term' || run.pentad.stage !== 'select') return;
    const selected = run.pentad.selection;
    const index = selected.indexOf(key);
    if (index >= 0) selected.splice(index, 1);
    else if (selected.length < 3) selected.push(key);
    else showToast('一段观察槽只能放入三枚候牌。');
    run.pentad.message = '';
    playSound('tick');
    renderPentadPhase(run, TERM_BY_ID[run.targetId]);
  }

  function submitPentadSelection() {
    const run = state.run;
    if (!run || run.type !== 'term' || run.pentad.stage !== 'select') return;
    const term = TERM_BY_ID[run.targetId];
    const chosen = run.pentad.selection
      .map(key => run.pentad.options.find(option => option.key === key))
      .filter(Boolean);
    if (chosen.length !== 3) return;
    if (chosen.every(option => option.correct)) {
      run.pentad.stage = 'order';
      run.pentad.orderPool = seededShuffle(chosen, `${term.id}-order-${run.pentad.attempts}`);
      run.pentad.ordered = [];
      run.pentad.message = '三枚时令候牌已辨明。现在按初候、二候、三候排序。';
      playSound('correct');
      renderPentadPhase(run, term);
      return;
    }
    const wrongNames = chosen.filter(option => !option.correct).map(option => option.name);
    run.pentad.attempts += 1;
    run.pentad.selection = [];
    run.pentad.message = `候牌“${wrongNames.join('、')}”不属于 ${term.name}。注意节气之间的物候传递，不要被相邻时令残影干扰。`;
    registerError(run);
    renderPentadPhase(run, term);
  }

  function pickOrderCard(key) {
    const run = state.run;
    if (!run || run.type !== 'term' || run.pentad.stage !== 'order') return;
    if (run.pentad.ordered.includes(key) || run.pentad.ordered.length >= 3) return;
    run.pentad.ordered.push(key);
    run.pentad.message = '';
    playSound('tick');
    renderPentadPhase(run, TERM_BY_ID[run.targetId]);
  }

  function resetOrder() {
    const run = state.run;
    if (!run || run.type !== 'term') return;
    run.pentad.ordered = [];
    run.pentad.message = '';
    renderPentadPhase(run, TERM_BY_ID[run.targetId]);
  }

  function submitOrder() {
    const run = state.run;
    if (!run || run.type !== 'term' || run.pentad.ordered.length !== 3) return;
    const term = TERM_BY_ID[run.targetId];
    const result = run.pentad.ordered.map(key => run.pentad.options.find(option => option.key === key));
    const correct = result.every((option, index) => option && option.index === index);
    if (!correct) {
      run.pentad.attempts += 1;
      run.pentad.ordered = [];
      run.pentad.orderPool = seededShuffle(run.pentad.orderPool, `${term.id}-order-${run.pentad.attempts}`);
      run.pentad.message = '三候顺序尚未对齐。请回想初候、二候、三候的递进关系，再试一次。';
      registerError(run);
      renderPentadPhase(run, term);
      return;
    }
    term.pentads.forEach((pentad, index) => {
      state.save.pentads[pentadKey(term.id, index)] = true;
    });
    persist();
    awardPhase(run, `${term.name}三候已归档`, `${term.pentads.map(item => item.name).join(' · ')}。三枚候牌已收入物候档案。`);
  }

  function renderMythPhase(run, term) {
    const myth = run.myth;
    const selectedCount = myth.selected.length;
    const tilt = selectedCount === 0 ? 0 : selectedCount === 1 ? -2 : 0;
    $('#gamePanel').innerHTML = `
      <div class="stage-head">
        <div>
          <div class="stage-kicker">PHASE 03 · WEIGH THE EVIDENCE</div>
          <h3>校准证据天平</h3>
          <p>节气误区常来自把天文节点、当地天气、古代物候记录和现代生活经验混在一起。选出最能解释该误区为何不成立的两条证据。</p>
        </div>
        <div class="stage-objective"><strong>本段目标</strong>从四条材料中选出两条科学证据，让天平回到平衡。</div>
      </div>
      <div class="myth-layout">
        <div class="claim-card">
          <span class="claim-card__label">待辨析命题 · 常见误区</span>
          <blockquote>“${term.myth.claim}”</blockquote>
          <div class="balance-visual">
            <div class="balance-beam" style="--tilt:${tilt}deg"><span class="balance-pan balance-pan--left"></span><span class="balance-pan balance-pan--right"></span></div>
            <div class="balance-base"></div>
            <div class="balance-caption">${selectedCount === 0 ? '等待放入证据' : selectedCount === 1 ? '天平仍偏向未经验证的判断' : '证据槽已满，等待校准'}</div>
          </div>
          <div class="tag-row"><span class="tag">古代记录</span><span class="tag">现代解释</span><span class="tag">生活建议</span></div>
        </div>
        <div class="evidence-area">
          <div class="evidence-head"><h4>可选证据链</h4><span class="evidence-count">已选 ${selectedCount} / 2</span></div>
          <div class="evidence-grid">
            ${myth.options.map((option, index) => {
              const selected = myth.selected.includes(index);
              return `<button class="evidence-card ${selected ? 'is-selected' : ''}" data-evidence="${index}" aria-pressed="${selected}">
                <span class="evidence-card__tag">${option.tag}</span>
                <p>${option.text}</p>
                <span class="evidence-card__mark">◆</span>
              </button>`;
            }).join('')}
          </div>
          ${feedbackMarkup(myth.message)}
          <div class="phase-actions">
            <span class="phase-actions__note">误区不等于古代记录本身；要区分“古人如何观察”与“现代如何解释”。</span>
            <button class="btn btn--primary" data-action="submit-evidence" ${selectedCount === 2 ? '' : 'disabled'}>${myth.attempts > 0 ? '重新校准天平' : '校准天平'}</button>
          </div>
        </div>
      </div>
    `;
  }

  function toggleEvidence(index) {
    const run = state.run;
    if (!run || run.type !== 'term') return;
    const myth = run.myth;
    const at = myth.selected.indexOf(index);
    if (at >= 0) myth.selected.splice(at, 1);
    else if (myth.selected.length < 2) myth.selected.push(index);
    else showToast('天平只有两个证据槽。先移除一条已选证据。');
    myth.message = '';
    playSound('tick');
    renderMythPhase(run, TERM_BY_ID[run.targetId]);
  }

  function recordMistake(term, run) {
    const selected = run.myth.selected.map(index => run.myth.options[index]).filter(Boolean);
    const existing = state.save.mistakes.find(item => item.termId === term.id);
    const entry = {
      termId: term.id,
      termName: term.name,
      season: term.season,
      claim: term.myth.claim,
      truth: term.myth.truth,
      selected: selected.map(item => item.text),
      attempts: (existing?.attempts || 0) + 1,
      resolved: false,
      updatedAt: new Date().toISOString()
    };
    if (existing) Object.assign(existing, entry);
    else state.save.mistakes.push(entry);
    persist();
  }

  function resolveMistake(termId) {
    const existing = state.save.mistakes.find(item => item.termId === termId);
    if (existing) {
      existing.resolved = true;
      existing.resolvedAt = new Date().toISOString();
      persist();
    }
  }

  function submitEvidence() {
    const run = state.run;
    if (!run || run.type !== 'term' || run.myth.selected.length !== 2) return;
    const term = TERM_BY_ID[run.targetId];
    const selected = run.myth.selected.map(index => run.myth.options[index]).filter(Boolean);
    if (selected.every(option => option.ok)) {
      run.myth.attempts += 1;
      resolveMistake(term.id);
      awardPhase(run, `${term.name}误区已辨明`, term.myth.truth);
      return;
    }
    run.myth.attempts += 1;
    recordMistake(term, run);
    registerError(run);
    run.myth.message = run.myth.attempts >= 3
      ? `证据链仍有偏差。科学解释：${term.myth.truth}`
      : '证据天平仍不平衡。至少有一条材料混淆了节气节点、实际天气或古代记录的性质。';
    renderMythPhase(run, term);
  }

  function renderChainPhase(run, term) {
    const chain = run.chain;
    const placed = chain.placed;
    $('#gamePanel').innerHTML = `
      <div class="stage-head">
        <div>
          <div class="stage-kicker">PHASE 04 · REPAIR THE CAUSAL CHAIN</div>
          <h3>接通物候因果链</h3>
          <p>把打乱的事件牌依次放入四个刻度：太阳位置 → 直射与昼夜 → 地表和大气响应 → 物候表现。接通后，本节气时钟恢复运行。</p>
        </div>
        <div class="stage-objective"><strong>本段目标</strong>按因果顺序排列四条事件，完成 ${term.name} 的时轮修复。</div>
      </div>
      <div class="chain-board">
        ${[0,1,2,3].map(index => {
          const item = placed[index] !== undefined ? chain.pool.find(card => card.index === placed[index]) : null;
          return `<div class="chain-slot ${item ? 'is-filled' : ''}"><span class="chain-slot__num">0${index + 1}</span>${item ? `<p>${item.text}</p>` : '<span class="chain-slot__empty">等待事件牌</span>'}</div>`;
        }).join('')}
      </div>
      <div class="instruction-card"><span class="instruction-card__label">可用事件牌</span><p>点击事件牌会将其放入下一个空刻度。若顺序有误，可清空重排。</p></div>
      <div class="chain-pool">
        ${chain.pool.map(card => `<button class="chain-card" data-chain-pick="${card.index}" ${placed.includes(card.index) ? 'disabled' : ''}><span class="chain-card__index">${String(card.index + 1).padStart(2, '0')}</span>${card.text}</button>`).join('')}
      </div>
      ${feedbackMarkup(chain.message)}
      <div class="phase-actions">
        <span class="phase-actions__note">${placed.length} / 4 条事件已接入</span>
        <button class="btn btn--quiet btn--small" data-action="reset-chain" ${placed.length ? '' : 'disabled'}>清空重排</button>
        <button class="btn btn--primary" data-action="submit-chain" ${placed.length === 4 ? '' : 'disabled'}>启动时轮</button>
      </div>
    `;
  }

  function pickChainCard(index) {
    const run = state.run;
    if (!run || run.type !== 'term') return;
    if (run.chain.placed.includes(index) || run.chain.placed.length >= 4) return;
    run.chain.placed.push(index);
    run.chain.message = '';
    playSound('tick');
    renderChainPhase(run, TERM_BY_ID[run.targetId]);
  }

  function resetChain() {
    const run = state.run;
    if (!run || run.type !== 'term') return;
    run.chain.placed = [];
    run.chain.message = '';
    renderChainPhase(run, TERM_BY_ID[run.targetId]);
  }

  function submitChain() {
    const run = state.run;
    if (!run || run.type !== 'term' || run.chain.placed.length !== 4) return;
    const term = TERM_BY_ID[run.targetId];
    const correct = run.chain.placed.every((value, index) => value === index);
    if (!correct) {
      registerError(run);
      run.chain.placed = [];
      run.chain.message = '因果链没有闭合。先确定太阳位置，再判断直射点、昼夜与地表热量的变化，最后才落到物候。';
      renderChainPhase(run, term);
      return;
    }
    awardPhase(run, `${term.name}时轮已修复`, term.chain.join(' → '));
  }

  function renderTrialPhase(run, trial, phaseIndex) {
    if (phaseIndex === 0) renderTrialOrder(run, trial);
    else if (phaseIndex === 1) renderTrialMatch(run, trial);
    else renderTrialTruth(run, trial);
  }

  function trialBadge(run) {
    return `<div class="trial-round-badge">${TRIAL_PHASES.map((phase, index) => `<span class="${index < run.phase ? 'is-done' : index === run.phase ? 'is-active' : ''}">${index + 1}</span><b style="font-weight:400;font-size:9px">${phase.name}</b>`).join('')}</div>`;
  }

  function renderTrialOrder(run, trial) {
    const picked = run.trial.orderPicks;
    const meta = DATA.seasons[run.season];
    $('#gamePanel').innerHTML = `
      <div class="stage-head">
        <div>
          <div class="stage-kicker">TRIAL 01 · SEASONAL ORBIT</div>
          <h3>重连${meta.name}季星序</h3>
          <p>六枚节气印被打散。按照太阳视黄经依次增加 15° 的顺序，把它们重新接回星轨。</p>
        </div>
        <div class="stage-objective"><strong>试炼目标</strong>按节气先后顺序点击 6 枚节气印。</div>
      </div>
      <div class="trial-brief">
        <div><h4>${trial.name}</h4><p>${trial.subtitle} · 综合检验本章天文、物候与文化。</p></div>
        ${trialBadge(run)}
      </div>
      <div class="instruction-card instruction-card--accent"><span class="instruction-card__label">星轨规则</span><p>第一枚应为本季第一节气。点击错误会扣除精度并重置连击；已接入的节气不会掉落。</p></div>
      <div class="order-term-grid">
        ${run.trial.orderOptions.map(term => {
          const index = picked.indexOf(term.id);
          return `<button class="order-term-card ${index >= 0 ? 'is-picked' : ''}" data-trial-order="${term.id}" data-step="${index + 1}" ${index >= 0 ? 'disabled' : ''}><strong>${term.name}</strong><small>${index >= 0 ? `第 ${index + 1} 位` : '点击接入星轨'}</small></button>`;
        }).join('')}
      </div>
      ${feedbackMarkup(run.trial.message)}
      <div class="phase-actions"><span class="phase-actions__note">已接入 ${picked.length} / 6</span><span class="tag tag--season">当前应接第 ${picked.length + 1} 个节点</span></div>
    `;
  }

  function pickTrialOrder(termId) {
    const run = state.run;
    if (!run || run.type !== 'trial' || run.phase !== 0) return;
    const trial = currentTarget(run);
    if (run.trial.orderPicks.includes(termId)) return;
    const expected = trial.order[run.trial.orderPicks.length];
    if (termId !== expected) {
      const expectedTerm = TERM_BY_ID[expected];
      run.trial.message = `星轨顺序不对。当前应接入的是黄经更小的下一节点（方位提示：${expectedTerm.season === 'spring' ? '春' : expectedTerm.season === 'summer' ? '夏' : expectedTerm.season === 'autumn' ? '秋' : '冬'}季段）。`;
      registerError(run);
      renderTrialOrder(run, trial);
      return;
    }
    run.trial.orderPicks.push(termId);
    run.trial.message = '';
    playSound('tick');
    if (run.trial.orderPicks.length === 6) {
      awardPhase(run, '章节气星序已接通', `${trial.order.map(id => TERM_BY_ID[id].name).join(' → ')}。`);
    } else {
      renderTrialOrder(run, trial);
    }
  }

  function renderTrialMatch(run, trial) {
    const matched = run.trial.matched;
    const active = trial.match.find(pair => !matched[pair.termId]);
    const usedPentads = Object.values(matched).filter(Boolean);
    $('#gamePanel').innerHTML = `
      <div class="stage-head">
        <div>
          <div class="stage-kicker">TRIAL 02 · PHENOLOGY TRACE</div>
          <h3>让候牌归位</h3>
          <p>为三个章内节点各找一枚正确候牌。先看高亮节点，再从右侧候牌中选出对应物候。</p>
        </div>
        <div class="stage-objective"><strong>试炼目标</strong>完成三组“节气—物候”配对。</div>
      </div>
      <div class="trial-brief">
        <div><h4>${trial.name}</h4><p>候牌中混入了章外时令残影，需要跨节点辨认。</p></div>
        ${trialBadge(run)}
      </div>
      <div class="match-layout">
        <div class="match-targets">
          ${trial.match.map(pair => {
            const term = TERM_BY_ID[pair.termId];
            const done = Boolean(matched[pair.termId]);
            return `<div class="match-target ${active?.termId === pair.termId ? 'is-active' : ''} ${done ? 'is-filled' : ''}">
              <span class="match-target__char">${term.glyph}</span>
              <span><strong>${term.name}</strong><small>${done ? '候牌已归位' : active?.termId === pair.termId ? '当前校准节点' : '等待校准'}</small></span>
              <span class="match-target__result">${done ? matched[pair.termId] : ''}</span>
            </div>`;
          }).join('')}
        </div>
        <div class="match-pentad-grid">
          ${run.trial.matchOptions.map(option => {
            const used = usedPentads.includes(option.pentad);
            return `<button class="match-pentad" data-trial-pentad="${option.key}" ${used ? 'disabled' : ''}><strong>${option.pentad}</strong><small>${used ? '已归位' : '点击放入当前节点'}</small></button>`;
          }).join('')}
        </div>
      </div>
      ${feedbackMarkup(run.trial.message)}
      <div class="phase-actions"><span class="phase-actions__note">${Object.keys(matched).length} / 3 组已配对</span><span class="tag tag--season">${active ? `当前节点：${TERM_BY_ID[active.termId].name}` : '全部候牌已归位'}</span></div>
    `;
  }

  function pickTrialPentad(key) {
    const run = state.run;
    if (!run || run.type !== 'trial' || run.phase !== 1) return;
    const trial = currentTarget(run);
    const option = run.trial.matchOptions.find(item => item.key === key);
    if (!option) return;
    const active = trial.match.find(pair => !run.trial.matched[pair.termId]);
    if (!active) return;
    if (option.termId !== active.termId) {
      run.trial.message = `“${option.pentad}”不属于当前的 ${TERM_BY_ID[active.termId].name} 节点。重新阅读候名中的物候线索。`;
      registerError(run);
      renderTrialMatch(run, trial);
      return;
    }
    run.trial.matched[active.termId] = option.pentad;
    run.trial.message = '';
    playSound('correct');
    if (Object.keys(run.trial.matched).length === trial.match.length) {
      awardPhase(run, '本章候证已复原', `${trial.match.map(pair => `${TERM_BY_ID[pair.termId].name} · ${pair.pentad}`).join('；')}。`);
    } else {
      renderTrialMatch(run, trial);
    }
  }

  function renderTrialTruth(run, trial) {
    const selected = run.trial.statementSelection;
    $('#gamePanel').innerHTML = `
      <div class="stage-head">
        <div>
          <div class="stage-kicker">TRIAL 03 · SCIENTIFIC REVIEW</div>
          <h3>审校万象记录</h3>
          <p>以下五条陈述中，有三条符合现代科学解释或对传统材料的使用边界。选出三条，提交本章最终审校。</p>
        </div>
        <div class="stage-objective"><strong>试炼目标</strong>找出三条可靠陈述，封存本章时轮印记。</div>
      </div>
      <div class="trial-brief">
        <div><h4>${trial.name}</h4><p>综合检验天文机制、七十二候性质与常见误区。</p></div>
        ${trialBadge(run)}
      </div>
      <div class="statement-grid">
        ${trial.statements.map((statement, index) => `<button class="statement-card ${selected.includes(index) ? 'is-selected' : ''}" data-trial-statement="${index}" aria-pressed="${selected.includes(index)}">${statement.text}</button>`).join('')}
      </div>
      ${feedbackMarkup(run.trial.message)}
      <div class="phase-actions">
        <span class="phase-actions__note">已选 ${selected.length} / 3</span>
        <button class="btn btn--primary" data-action="submit-trial-truth" ${selected.length === 3 ? '' : 'disabled'}>提交最终审校</button>
      </div>
    `;
  }

  function toggleTrialStatement(index) {
    const run = state.run;
    if (!run || run.type !== 'trial' || run.phase !== 2) return;
    const selected = run.trial.statementSelection;
    const at = selected.indexOf(index);
    if (at >= 0) selected.splice(at, 1);
    else if (selected.length < 3) selected.push(index);
    else showToast('请先移除一条已选陈述。');
    run.trial.message = '';
    playSound('tick');
    renderTrialTruth(run, currentTarget(run));
  }

  function submitTrialTruth() {
    const run = state.run;
    if (!run || run.type !== 'trial' || run.trial.statementSelection.length !== 3) return;
    const trial = currentTarget(run);
    const selected = run.trial.statementSelection.map(index => trial.statements[index]);
    if (selected.every(statement => statement.ok)) {
      awardPhase(run, '章末审校已通过', '天文机制、物候记录和科学解释之间的边界已经厘清，本章试炼完成。');
      return;
    }
    run.trial.statementSelection = [];
    run.trial.message = '审校未通过。至少有一条陈述把节气节点、实际天气或古代观察记录混为一谈。';
    registerError(run);
    renderTrialTruth(run, trial);
  }

  function scoreToStars(score) {
    if (score >= 900) return 3;
    if (score >= 760) return 2;
    return 1;
  }

  function finishRun(run) {
    const target = currentTarget(run);
    const stars = scoreToStars(run.score);
    if (run.type === 'term') {
      const previous = state.save.levels[target.id] || {};
      state.save.levels[target.id] = {
        completed: true,
        bestScore: Math.max(Number(previous.bestScore) || 0, run.score),
        stars: Math.max(Number(previous.stars) || 0, stars),
        bestCombo: Math.max(Number(previous.bestCombo) || 0, run.bestCombo),
        attempts: (Number(previous.attempts) || 0) + 1,
        completedAt: previous.completedAt || new Date().toISOString(),
        lastPlayedAt: new Date().toISOString()
      };
    } else {
      const previous = state.save.trials[target.id] || {};
      state.save.trials[target.id] = {
        completed: true,
        bestScore: Math.max(Number(previous.bestScore) || 0, run.score),
        stars: Math.max(Number(previous.stars) || 0, stars),
        bestCombo: Math.max(Number(previous.bestCombo) || 0, run.bestCombo),
        attempts: (Number(previous.attempts) || 0) + 1,
        completedAt: previous.completedAt || new Date().toISOString(),
        lastPlayedAt: new Date().toISOString()
      };
    }
    state.save.lastRun = null;
    persist();
    playSound('complete');
    renderMap();
    showResult(run, target, stars);
  }

  function showResult(run, target, stars) {
    const allDone = completedTermCount() === 24;
    const isTrial = run.type === 'trial';
    $('#resultSeal').textContent = isTrial ? '印' : target.glyph;
    $('#resultTitle').textContent = isTrial ? `${target.name}已完成` : `${target.name}时轮已归位`;
    $('#resultStars').innerHTML = starText(stars);
    $('#resultStars').setAttribute('aria-label', `${stars} 星`);
    $('#resultScore').textContent = `${run.score} 时轮分 · 最高连击 ×${run.bestCombo}`;
    $('#resultCopy').textContent = isTrial
      ? `${target.subtitle}。你已完成星序、候证与万象审校，章末印记已写入存档。`
      : `${target.summary} ${target.culture}`;
    $('#resultCollect').innerHTML = isTrial
      ? `本章试炼印记 ${stars} 星 · 全章知识完成一次综合校准`
      : `已收录：${target.pentads.map(item => item.name).join(' · ')}<br>物候档案 ${pentadCount()} / 72 · 主线 ${completedTermCount()} / 24`;
    const next = TERMS[target.order + 1];
    const canNext = !isTrial && next && termUnlocked(next);
    const actions = [
      `<button class="btn btn--ghost" data-result-action="map">返回星图</button>`,
      `<button class="btn btn--ghost" data-result-action="retry">${isTrial ? '重试试炼' : '再次校准'}</button>`
    ];
    if (canNext) actions.push(`<button class="btn btn--primary" data-result-action="next" data-next-id="${next.id}">下一节点 · ${next.name}</button>`);
    if (allDone) actions.push(`<button class="btn btn--primary" data-result-action="card">查看时间行旅</button>`);
    $('#resultActions').innerHTML = actions.join('');
    $('#resultOverlay').classList.add('is-open');
    $('#resultOverlay').setAttribute('aria-hidden', 'false');
    setTimeout(() => $('#resultActions .btn--primary, #resultActions .btn')?.focus(), 50);
  }

  function closeResult() {
    $('#resultOverlay').classList.remove('is-open');
    $('#resultOverlay').setAttribute('aria-hidden', 'true');
    showScreen('map');
  }

  function handleResultAction(action, button) {
    const run = state.run;
    if (action === 'map') {
      closeResult();
    } else if (action === 'retry') {
      closeResult();
      if (run?.type === 'trial') startTrial(run.targetId);
      else if (run) startTerm(run.targetId);
    } else if (action === 'next') {
      const nextId = button.dataset.nextId;
      closeResult();
      startTerm(nextId);
    } else if (action === 'card') {
      closeResult();
      if (completedTermCount() === 24) showScreen('card');
      else showToast('完成 24 个节气节点后，时间行旅卡才会完全展开。');
    }
  }

  function renderCodex() {
    const filters = [
      ['all', '全部'], ['spring', '春'], ['summer', '夏'], ['autumn', '秋'], ['winter', '冬'], ['collected', '已收录']
    ];
    $('#codexCount').innerHTML = `<strong>${pentadCount()}</strong><span> / 72</span>`;
    $('#codexToolbar').innerHTML = filters.map(([key, label]) => {
      const disabled = key === 'collected' && pentadCount() === 0;
      return `<button class="filter-btn ${state.codexFilter === key ? 'is-active' : ''}" data-filter="${key}" ${disabled ? 'disabled' : ''}>${label}</button>`;
    }).join('');
    $('#codexIntro').innerHTML = '<strong>记录边界：</strong>候名与候应属于传统物候观察体系。卡片中的“古人记录”与现代科学解释分开呈现，不把传统物候直接当作现代气象或生物学标准。';
    let cards = [];
    TERMS.forEach(term => {
      term.pentads.forEach((pentad, index) => {
        const key = pentadKey(term.id, index);
        const collected = Boolean(state.save.pentads[key]);
        if (state.codexFilter === 'collected' && !collected) return;
        if (SEASON_ORDER.includes(state.codexFilter) && term.season !== state.codexFilter) return;
        const meta = DATA.seasons[term.season];
        const flatIndex = term.order * 3 + index + 1;
        cards.push(`
          <article class="codex-card ${collected ? '' : 'is-locked'}" data-index="${String(flatIndex).padStart(2, '0')}" style="--card-season:${meta.color}">
            <div class="codex-card__meta"><span class="codex-card__season">${meta.name} · ${term.name}</span><span class="codex-card__state">${collected ? `第${index + 1}候` : '未收录'}</span></div>
            <h3>${collected ? pentad.name : '未收录候牌'}</h3>
            <div class="codex-card__term">${collected ? `黄经 ${(term.longitude + 360) % 360}° · ${term.dateHint}` : '完成识候段后显现'}</div>
            <p>${collected ? pentad.note : '在对应节气关卡中完成三候辨识与排序，这张候牌会收入档案。'}</p>
            ${collected ? '' : '<span class="codex-card__lock"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg> 待观测</span>'}
          </article>
        `);
      });
    });
    $('#codexGrid').innerHTML = cards.length
      ? cards.join('')
      : '<div class="codex-empty"><strong>还没有候牌</strong>进入任一节气关卡，在“识候”段完成三候辨认。</div>';
  }

  function renderReview() {
    const mistakes = state.save.mistakes.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const unresolved = mistakes.filter(item => !item.resolved).length;
    const resolved = mistakes.length - unresolved;
    $('#clearReviewBtn').disabled = mistakes.length === 0;
    $('#reviewSummary').innerHTML = `
      <div class="review-stat"><span>已记录辨析</span><strong>${mistakes.length}</strong></div>
      <div class="review-stat"><span>仍待重看</span><strong>${unresolved}</strong></div>
      <div class="review-stat"><span>已经校正</span><strong>${resolved}</strong></div>
      <div class="review-stat"><span>复盘边界</span><strong>古今分层</strong></div>
    `;
    if (!mistakes.length) {
      $('#reviewList').innerHTML = '<div class="review-empty"><strong>证据回廊尚空</strong>在“辨误”段选错证据后，这里会保留命题、你的选择与科学解释。</div>';
      return;
    }
    $('#reviewList').innerHTML = mistakes.map(item => {
      const term = TERM_BY_ID[item.termId];
      const meta = DATA.seasons[item.season];
      return `<article class="review-card ${item.resolved ? 'is-resolved' : ''}">
        <div class="review-card__term" style="color:${meta.color}">${item.termName}<small>${meta.name}章 · 辨析记录</small></div>
        <div class="review-card__body">
          <h4>“${item.claim}”</h4>
          <p><strong>科学解释：</strong>${item.truth}</p>
          <p><strong>当时所选：</strong>${item.selected.length ? item.selected.join('；') : '未记录'}</p>
          <p><strong>复盘动作：</strong>区分天文节点、实际天气、古代物候观察与现代生活建议。</p>
        </div>
        <div>
          <span class="review-card__status">${item.resolved ? '已校正' : '待重看'}</span>
          ${term && termUnlocked(term) ? `<button class="btn btn--small btn--quiet" style="margin-top:10px" data-review-level="${term.id}">重看此关</button>` : ''}
        </div>
      </article>`;
    }).join('');
  }

  function openModal(content, focusSelector = '') {
    state.modalReturnFocus = document.activeElement;
    $('#modalContent').innerHTML = content;
    $('#modal').classList.add('is-open');
    $('#modal').setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      const focusTarget = focusSelector ? $(focusSelector, $('#modal')) : $('#modal .modal__close');
      focusTarget?.focus();
    }, 40);
  }

  function closeModal() {
    $('#modal').classList.remove('is-open');
    $('#modal').setAttribute('aria-hidden', 'true');
    $('#modalContent').innerHTML = '';
    state.modalReturnFocus?.focus?.();
  }

  function showHelp() {
    openModal(`
      <p class="eyebrow"><span></span>观测员手册</p>
      <h2>如何修复四季时钟</h2>
      <p>每关包含四个连续阶段。每一阶段都有目标、操作、即时反馈与评分。错误会降低精度并打断连击，但不会把玩家挡在关卡外。</p>
      <div class="help-steps">
        <div class="help-step"><span>观</span><strong>校准黄经仪</strong><p>拖动滑杆、点击加减按钮或使用方向键，将指针对准目标刻度，再选择节气印。</p></div>
        <div class="help-step"><span>候</span><strong>重排三候</strong><p>从混入其他节气的候牌中找出三枚正确物候，再按初候、二候、三候排序。</p></div>
        <div class="help-step"><span>辨</span><strong>校准证据天平</strong><p>选择两条能解释命题为何是误区的证据；古代记录与现代解释需分开理解。</p></div>
        <div class="help-step"><span>修</span><strong>接通因果链</strong><p>按太阳位置、直射与昼夜、地表响应、物候表现排列四张事件牌。</p></div>
      </div>
      <h3>评分与存档</h3>
      <p>每段完成时按当前精度获得时轮分。单关满分 1000，900 分以上为三星。进度、最佳成绩、72 候图鉴与错题记录保存在当前浏览器的 localStorage 中。刷新后可从上次完成的阶段继续。</p>
      <h3>科学说明</h3>
      <p>前端太阳视黄经使用低阶近似算法，仅用于互动演示。正式交节时刻和历算应以中国科学院紫金山天文台等权威机构发布的历书为准。游戏中的农事、健康和生活内容不构成专业建议。</p>
      <h3>资料分类</h3>
      <ul>
        ${DATA.sourceGroups.map(group => `<li><strong>${group.id} · ${group.label}：</strong>${group.note}</li>`).join('')}
      </ul>
      <div class="modal__actions">
        <button class="btn btn--quiet btn--small" data-modal-action="reset">清除全部进度</button>
        <button class="btn btn--primary btn--small" data-close-modal>继续观测</button>
      </div>
    `, '[data-close-modal]');
  }

  function showResetPrompt() {
    openModal(`
      <p class="eyebrow"><span></span>危险操作</p>
      <h2>清除全部进度？</h2>
      <p>这会删除 24 关成绩、72 候收集、章末试炼、错题记录与未完成的关卡状态，且无法撤销。浏览器中原有的《时间之书》项目数据不会被触碰。</p>
      <div class="modal__actions">
        <button class="btn btn--ghost btn--small" data-close-modal>保留进度</button>
        <button class="btn btn--danger btn--small" data-modal-action="confirm-reset">确认清除</button>
      </div>
    `, '[data-modal-action="confirm-reset"]');
  }

  function showClearReviewPrompt() {
    openModal(`
      <p class="eyebrow"><span></span>证据回廊</p>
      <h2>清空辨析记录？</h2>
      <p>只会清除错题复盘记录；关卡星级、物候收集与章末试炼成绩不受影响。</p>
      <div class="modal__actions">
        <button class="btn btn--ghost btn--small" data-close-modal>取消</button>
        <button class="btn btn--danger btn--small" data-modal-action="confirm-clear-review">清空记录</button>
      </div>
    `, '[data-modal-action="confirm-clear-review"]');
  }

  function resetAllProgress() {
    try { localStorage.removeItem(SAVE_KEY); } catch (error) { console.warn(error); }
    state.save = defaultSave();
    state.run = null;
    state.season = 'spring';
    closeModal();
    closeResult();
    updateHome();
    renderMap();
    showScreen('map');
    showToast('进度已清除，四季时钟重新开始运转。');
  }

  function clearReviewRecords() {
    state.save.mistakes = [];
    persist();
    closeModal();
    renderReview();
    showToast('辨析记录已清空。');
  }

  function drawRoundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function renderTravelCard() {
    if (completedTermCount() !== 24) {
      showScreen('map');
      showToast('完成 24 个节气节点后，才能生成完整的时间行旅卡。');
      return;
    }
    const canvas = $('#travelCanvas');
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const stars = termStarsTotal();
    const trialStars = Object.values(state.save.trials).reduce((sum, record) => sum + (Number(record.stars) || 0), 0);

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#0d2231');
    bg.addColorStop(.55, '#071520');
    bg.addColorStop(1, '#102b36');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(540, 420, 30, 540, 420, 500);
    glow.addColorStop(0, 'rgba(216,181,107,.17)');
    glow.addColorStop(1, 'rgba(216,181,107,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    const random = seededRandom(20261025);
    for (let i = 0; i < 150; i += 1) {
      const x = random() * width;
      const y = random() * height;
      const alpha = .05 + random() * .25;
      ctx.fillStyle = `rgba(239,218,165,${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, random() * 1.6 + .35, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(216,181,107,.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(42, 42, width - 84, height - 84);
    ctx.strokeStyle = 'rgba(216,181,107,.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(57, 57, width - 114, height - 114);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#d8b56b';
    ctx.font = '500 22px "PingFang SC", sans-serif';
    ctx.fillText('节气行旅 · TIME TRAVELER', width / 2, 118);
    ctx.fillStyle = '#efe5d0';
    ctx.font = '500 80px "Songti SC", "STSong", serif';
    ctx.fillText('时间行旅', width / 2, 218);
    ctx.fillStyle = 'rgba(232,226,211,.55)';
    ctx.font = '20px "PingFang SC", sans-serif';
    ctx.fillText('二十四节气的物候解谜 · 四季时钟复原纪念', width / 2, 262);

    const cx = width / 2;
    const cy = 520;
    const ringRadius = 188;
    ctx.strokeStyle = 'rgba(216,181,107,.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius + 31, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius - 30, 0, Math.PI * 2);
    ctx.stroke();

    SEASON_ORDER.forEach((season, seasonIndex) => {
      const meta = DATA.seasons[season];
      const start = -Math.PI / 2 + seasonIndex * Math.PI / 2;
      const end = start + Math.PI / 2;
      ctx.strokeStyle = meta.color;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, ringRadius, start + .05, end - .05);
      ctx.stroke();
      const labelAngle = start + Math.PI / 4;
      ctx.fillStyle = meta.color;
      ctx.font = '500 35px "Songti SC", serif';
      ctx.fillText(meta.name, cx + Math.cos(labelAngle) * (ringRadius - 67), cy + Math.sin(labelAngle) * (ringRadius - 67) + 12);
    });

    TERMS.forEach((term, index) => {
      const meta = DATA.seasons[term.season];
      const angle = -Math.PI / 2 + (term.order / 24) * Math.PI * 2;
      const x = cx + Math.cos(angle) * (ringRadius + 12);
      const y = cy + Math.sin(angle) * (ringRadius + 12);
      ctx.fillStyle = meta.color;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,244,214,.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    const sunGradient = ctx.createRadialGradient(cx - 22, cy - 25, 10, cx, cy, 84);
    sunGradient.addColorStop(0, '#f4e2b3');
    sunGradient.addColorStop(.58, '#d8b56b');
    sunGradient.addColorStop(1, '#a84b39');
    ctx.fillStyle = sunGradient;
    ctx.beginPath();
    ctx.arc(cx, cy, 79, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16232a';
    ctx.font = '500 52px "Songti SC", serif';
    ctx.fillText('时', cx, cy + 19);

    const statY = 790;
    const statWidth = 258;
    const gap = 32;
    const statX = (width - statWidth * 3 - gap * 2) / 2;
    const stats = [
      ['主线节点', '24 / 24'],
      ['物候收录', `${pentadCount()} / 72`],
      ['节气星数', `${stars} / 72`]
    ];
    stats.forEach(([label, value], index) => {
      const x = statX + index * (statWidth + gap);
      ctx.fillStyle = 'rgba(255,255,255,.025)';
      drawRoundRect(ctx, x, statY, statWidth, 112, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(216,181,107,.17)';
      ctx.lineWidth = 1;
      drawRoundRect(ctx, x, statY, statWidth, 112, 18);
      ctx.stroke();
      ctx.fillStyle = 'rgba(232,226,211,.5)';
      ctx.font = '18px "PingFang SC", sans-serif';
      ctx.fillText(label, x + statWidth / 2, statY + 37);
      ctx.fillStyle = '#efdaa5';
      ctx.font = '500 42px "Songti SC", serif';
      ctx.fillText(value, x + statWidth / 2, statY + 82);
    });

    const chapterY = 967;
    ctx.fillStyle = 'rgba(232,226,211,.45)';
    ctx.font = '17px "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('四季印记', 116, chapterY);
    ctx.textAlign = 'right';
    ctx.fillText(`章末试炼 ${Object.values(state.save.trials).filter(item => item.completed).length} / 4 · ${trialStars} 星`, width - 116, chapterY);
    ctx.textAlign = 'center';
    SEASON_ORDER.forEach((season, index) => {
      const meta = DATA.seasons[season];
      const x = 166 + index * 249;
      ctx.fillStyle = meta.color;
      ctx.beginPath();
      ctx.arc(x, chapterY + 66, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e9e1cf';
      ctx.font = '500 27px "Songti SC", serif';
      ctx.fillText(meta.name, x, chapterY + 111);
      ctx.fillStyle = 'rgba(232,226,211,.45)';
      ctx.font = '16px "PingFang SC", sans-serif';
      ctx.fillText(meta.motto.slice(0, 6), x, chapterY + 141);
    });

    ctx.strokeStyle = 'rgba(216,181,107,.22)';
    ctx.beginPath();
    ctx.moveTo(116, 1198);
    ctx.lineTo(width - 116, 1198);
    ctx.stroke();

    ctx.fillStyle = '#dfd6c4';
    ctx.font = '500 27px "Songti SC", serif';
    ctx.fillText('观天有度，识候有信，辨误有据。', width / 2, 1252);
    ctx.fillStyle = 'rgba(232,226,211,.42)';
    ctx.font = '17px "PingFang SC", sans-serif';
    const date = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    ctx.fillText(`完成于 ${date} · 本卡不包含任何身份信息`, width / 2, 1292);
    ctx.fillStyle = '#b94d3b';
    ctx.strokeStyle = 'rgba(185,77,59,.65)';
    ctx.lineWidth = 2;
    drawRoundRect(ctx, width / 2 - 46, 1323, 92, 62, 7);
    ctx.stroke();
    ctx.font = '500 31px "Songti SC", serif';
    ctx.fillText('行旅', width / 2, 1363);

    $('#travelStats').innerHTML = `
      <div class="travel-stat"><span>主线</span><strong>24 / 24</strong></div>
      <div class="travel-stat"><span>物候</span><strong>${pentadCount()} / 72</strong></div>
      <div class="travel-stat"><span>节气星数</span><strong>${stars} / 72</strong></div>
      <div class="travel-stat"><span>章末试炼</span><strong>${Object.values(state.save.trials).filter(item => item.completed).length} / 4</strong></div>
    `;
  }

  function downloadTravelCard() {
    const canvas = $('#travelCanvas');
    if (!canvas) return;
    canvas.toBlob(blob => {
      if (!blob) {
        showToast('成果卡生成失败，请更换浏览器重试。');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = '节气行旅_时间行旅成果卡.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      showToast('时间行旅卡已生成 PNG。');
    }, 'image/png');
  }

  async function copyWorkName() {
    const text = '《节气行旅：二十四节气的物候解谜》';
    try {
      await navigator.clipboard.writeText(text);
      showToast('作品名已复制。');
    } catch (error) {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy'); showToast('作品名已复制。'); }
      catch (copyError) { showToast('无法自动复制，请手动记录作品名。'); }
      area.remove();
    }
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  function ensureAudio() {
    if (!state.audio) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      state.audio = new AudioContext();
    }
    if (state.audio.state === 'suspended') state.audio.resume();
    return state.audio;
  }

  function tone(frequency, duration, type = 'sine', volume = 0.035, delay = 0) {
    const context = ensureAudio();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  function playSound(name) {
    if (!state.save.settings.sound) return;
    if (name === 'tick') tone(520, .05, 'sine', .012);
    else if (name === 'lock') { tone(440, .08, 'triangle', .02); tone(660, .12, 'triangle', .02, .06); }
    else if (name === 'hint') tone(360, .16, 'sine', .018);
    else if (name === 'correct') { tone(523.25, .12, 'sine', .02); tone(659.25, .14, 'sine', .018, .08); }
    else if (name === 'error') { tone(210, .16, 'triangle', .022); tone(170, .2, 'triangle', .018, .08); }
    else if (name === 'complete') { [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => tone(frequency, .5, 'sine', .02, index * .1)); }
  }

  function toggleSound() {
    state.save.settings.sound = !state.save.settings.sound;
    persist();
    updateSoundButton();
    if (state.save.settings.sound) playSound('lock');
    showToast(state.save.settings.sound ? '观测音效已开启。' : '观测音效已关闭。');
  }

  function updateSoundButton() {
    const button = $('#soundBtn');
    const enabled = Boolean(state.save.settings.sound);
    button.classList.toggle('is-muted', !enabled);
    button.setAttribute('aria-label', enabled ? '关闭声音' : '开启声音');
    button.setAttribute('aria-pressed', String(enabled));
  }

  function handleGameAction(action) {
    const run = state.run;
    if (!run) return;
    switch (action) {
      case 'continue-phase': continuePhase(); break;
      case 'dial-minus': adjustDial(-5); break;
      case 'dial-plus': adjustDial(5); break;
      case 'dial-hint': useDialHint(); break;
      case 'lock-dial': lockDial(); break;
      case 'submit-pentads': submitPentadSelection(); break;
      case 'submit-order': submitOrder(); break;
      case 'reset-order': resetOrder(); break;
      case 'submit-evidence': submitEvidence(); break;
      case 'reset-chain': resetChain(); break;
      case 'submit-chain': submitChain(); break;
      case 'submit-trial-truth': submitTrialTruth(); break;
      default: break;
    }
  }

  function bindEvents() {
    $('#brandHome').addEventListener('click', () => {
      updateHome();
      showScreen('home');
    });
    $('#startBtn').addEventListener('click', () => {
      if (state.save.lastRun) resumeLastRun();
      else showScreen('map');
    });
    $('#homeHelpBtn').addEventListener('click', showHelp);
    $('#helpBtn').addEventListener('click', showHelp);
    $('#soundBtn').addEventListener('click', toggleSound);
    $('#gameBackBtn').addEventListener('click', () => {
      renderMap();
      showScreen('map');
    });
    $('#codexBackBtn').addEventListener('click', () => showScreen('map'));
    $('#reviewBackBtn').addEventListener('click', () => showScreen('map'));
    $('#cardBackBtn').addEventListener('click', () => {
      updateHome();
      showScreen('home');
    });
    $('#downloadCardBtn').addEventListener('click', downloadTravelCard);
    $('#shareCardBtn').addEventListener('click', copyWorkName);
    $('#clearReviewBtn').addEventListener('click', () => {
      if (state.save.mistakes.length) showClearReviewPrompt();
    });

    document.addEventListener('click', event => {
      const closeControl = event.target.closest('[data-close-modal]');
      if (closeControl) {
        closeModal();
        return;
      }

      const nav = event.target.closest('[data-nav]');
      if (nav) {
        const target = nav.dataset.nav;
        if (target === 'map') renderMap();
        showScreen(target);
        return;
      }

      const seasonTab = event.target.closest('[data-season]');
      if (seasonTab && !seasonTab.disabled) {
        state.season = seasonTab.dataset.season;
        renderMap();
        return;
      }

      const level = event.target.closest('[data-level]');
      if (level) {
        const term = TERM_BY_ID[level.dataset.level];
        if (!term) return;
        if (!termUnlocked(term)) {
          showToast('先完成前一节气，才能接入这条星轨。');
          return;
        }
        startTerm(term.id);
        return;
      }

      const trial = event.target.closest('[data-trial]');
      if (trial && !trial.disabled) {
        startTrial(trial.dataset.trial);
        return;
      }

      const filter = event.target.closest('[data-filter]');
      if (filter) {
        state.codexFilter = filter.dataset.filter;
        renderCodex();
        return;
      }

      const travel = event.target.closest('[data-travel-card]');
      if (travel) {
        if (completedTermCount() === 24) showScreen('card');
        else showToast('完成 24 个节气节点后，才能生成完整成果卡。');
        return;
      }

      const termChoice = event.target.closest('[data-term-choice]');
      if (termChoice) {
        chooseTerm(termChoice.dataset.termChoice);
        return;
      }

      const pentad = event.target.closest('[data-pentad]');
      if (pentad) {
        togglePentad(pentad.dataset.pentad);
        return;
      }

      const order = event.target.closest('[data-order-pick]');
      if (order) {
        pickOrderCard(order.dataset.orderPick);
        return;
      }

      const evidence = event.target.closest('[data-evidence]');
      if (evidence) {
        toggleEvidence(Number(evidence.dataset.evidence));
        return;
      }

      const chain = event.target.closest('[data-chain-pick]');
      if (chain) {
        pickChainCard(Number(chain.dataset.chainPick));
        return;
      }

      const trialOrder = event.target.closest('[data-trial-order]');
      if (trialOrder) {
        pickTrialOrder(trialOrder.dataset.trialOrder);
        return;
      }

      const trialPentad = event.target.closest('[data-trial-pentad]');
      if (trialPentad) {
        pickTrialPentad(trialPentad.dataset.trialPentad);
        return;
      }

      const statement = event.target.closest('[data-trial-statement]');
      if (statement) {
        toggleTrialStatement(Number(statement.dataset.trialStatement));
        return;
      }

      const action = event.target.closest('[data-action]');
      if (action) {
        handleGameAction(action.dataset.action);
        return;
      }

      const resultAction = event.target.closest('[data-result-action]');
      if (resultAction) {
        handleResultAction(resultAction.dataset.resultAction, resultAction);
        return;
      }

      const reviewLevel = event.target.closest('[data-review-level]');
      if (reviewLevel) {
        const term = TERM_BY_ID[reviewLevel.dataset.reviewLevel];
        if (term && termUnlocked(term)) startTerm(term.id);
        return;
      }

      const modalAction = event.target.closest('[data-modal-action]');
      if (modalAction) {
        const value = modalAction.dataset.modalAction;
        if (value === 'reset') showResetPrompt();
        else if (value === 'confirm-reset') resetAllProgress();
        else if (value === 'confirm-clear-review') clearReviewRecords();
        return;
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if ($('#resultOverlay').classList.contains('is-open')) closeResult();
        else if ($('#modal').classList.contains('is-open')) closeModal();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persist();
    });
  }

  function init() {
    if (!DATA || !SOLAR) {
      console.error('游戏数据或太阳黄经模块未加载。');
      return;
    }
    buildAmbient();
    buildHomeDial();
    setSeasonTheme('spring');
    updateSoundButton();
    updateHome();
    bindEvents();
    renderMap();
    showScreen('home');
    setInterval(() => {
      if (state.screen === 'home') updateHome();
    }, 60000);
    console.info('节气行旅已就绪：24 节气 / 72 候 / 4 章试炼');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
