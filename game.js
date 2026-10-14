/* =========================================================
 * game.js —— 方块大陆 NEXT：渲染循环、输入、UI、多世界、设置、天气、模组
 * ========================================================= */
const Game = (() => {
  /* ---------- 存储键 ---------- */
  const SETTINGS_KEY = 'blockland_settings_v1';
  const WORLDS_KEY = 'blockland_worlds_v1';
  const CURRENT_WORLD_KEY = 'blockland_current_world_v1';
  const worldSaveKey = (id) => `blockland_save_world_${id}_v1`;

  /* ---------- 默认设置 ---------- */
  const DEFAULT_SETTINGS = {
    renderDistance: 4,
    sensitivity: 1.0,
    fov: 75,
    quality: 'medium',       // low / medium / high
    weather: 'auto',         // auto / clear / rain / storm
    timeMode: 'cycle',       // cycle / day / night
    showCoords: true,
    showCrosshair: true,
    dayNight: true
  };

  /* ---------- 状态 ---------- */
  let renderer, scene, camera, world, player, net;
  let solidMat, transMat, waterMat, emissiveMat, atlasTexture;
  let sunLight, hemiLight;
  let highlight = null;
  let clock = new THREE.Clock();
  let rafId = null;
  let settings = { ...DEFAULT_SETTINGS };
  let worlds = [];
  let currentWorld = null;   // {id, name, seed, biome, mode, flat, createdAt, lastPlayed}
  let inGame = false;

  /* 输入状态 */
  const input = { forward: false, back: false, left: false, right: false, jump: false, crouch: false, sprint: false, lookDX: 0, lookDY: 0 };

  /* 破坏进度 */
  let breakTarget = null, breakTime = 0;
  let cropTimer = 0;
  let signLabels = new Map();
  let pickerOpen = false;

  /* 世界时间 */
  let timeOfDay = 0.25;
  const DAY_LENGTH = 480;

  /* 天气 */
  let weather = { type: 'clear', rainDrops: [], lightningTimer: 0, lightningFlash: 0, autoTimer: 0, autoTarget: 'clear' };

  /* 区块流式 */
  let loadedChunks = new Set();
  let streamTimer = 0;
  let __dbg = { frames: 0, dt: 0, lastRun: 0 };

  /* 成就 */
  let achievements = new Set();
  let achievementTimer = null;

  let $ = (id) => document.getElementById(id);

  /* ============================================================
   *  设置系统
   * ============================================================ */
  function loadSettings() {
    try {
      const s = localStorage.getItem(SETTINGS_KEY);
      if (s) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(s) };
    } catch (e) {}
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
  }
  function applySettings() {
    // 渲染距离
    CFG.renderDistance = settings.renderDistance;
    if (scene && scene.fog) {
      scene.fog.near = CFG.move.reach * 2;
      scene.fog.far = CFG.renderDistance * CFG.chunkSize * 1.2;
    }
    // FOV
    if (camera) { camera.fov = settings.fov; camera.updateProjectionMatrix(); }
    // 画质
    if (renderer) {
      if (settings.quality === 'low') {
        renderer.setPixelRatio(1);
        renderer.antialias = false;
      } else if (settings.quality === 'high') {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.antialias = true;
      } else {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.antialias = true;
      }
    }
    // HUD 显示
    const posEl = $('pos');
    if (posEl) posEl.style.display = settings.showCoords ? 'block' : 'none';
    const crossEl = $('crosshair');
    if (crossEl) crossEl.style.display = settings.showCrosshair ? 'block' : 'none';
    // 天气
    if (settings.weather !== 'auto') setWeather(settings.weather);
    // 时间
    if (settings.timeMode === 'day') timeOfDay = 0.25;
    else if (settings.timeMode === 'night') timeOfDay = 0.75;
  }
  function setupSettingsUI() {
    // 滑块
    const rd = $('set-renderdist'); if (rd) { rd.value = settings.renderDistance; $('val-renderdist').textContent = settings.renderDistance;
      rd.addEventListener('input', () => { settings.renderDistance = +rd.value; $('val-renderdist').textContent = rd.value; applySettings(); saveSettings(); if (inGame) toast('渲染距离：' + rd.value); }); }
    const sen = $('set-sensitivity'); if (sen) { sen.value = settings.sensitivity; $('val-sensitivity').textContent = settings.sensitivity.toFixed(1);
      sen.addEventListener('input', () => { settings.sensitivity = +sen.value; $('val-sensitivity').textContent = (+sen.value).toFixed(1); saveSettings(); }); }
    const fov = $('set-fov'); if (fov) { fov.value = settings.fov; $('val-fov').textContent = settings.fov;
      fov.addEventListener('input', () => { settings.fov = +fov.value; $('val-fov').textContent = fov.value; applySettings(); saveSettings(); }); }
    // 分段选择
    bindSegGroup('set-quality', 'q', settings.quality, (v) => { settings.quality = v; applySettings(); saveSettings(); });
    bindSegGroup('set-weather', 'w', settings.weather, (v) => { settings.weather = v; applySettings(); saveSettings(); });
    bindSegGroup('set-time', 't', settings.timeMode, (v) => { settings.timeMode = v; applySettings(); saveSettings(); });
    // 开关
    const sc = $('set-showcoords'); if (sc) { sc.checked = settings.showCoords; sc.addEventListener('change', () => { settings.showCoords = sc.checked; applySettings(); saveSettings(); }); }
    const ch = $('set-crosshair'); if (ch) { ch.checked = settings.showCrosshair; ch.addEventListener('change', () => { settings.showCrosshair = ch.checked; applySettings(); saveSettings(); }); }
    const dn = $('set-daynight'); if (dn) { dn.checked = settings.dayNight; dn.addEventListener('change', () => { settings.dayNight = dn.checked; saveSettings(); }); }
    // 按钮
    $('set-close').addEventListener('click', () => { $('settings-dialog').style.display = 'none'; });
    $('set-reset').addEventListener('click', () => {
      settings = { ...DEFAULT_SETTINGS }; saveSettings(); applySettings();
      // 刷新UI
      if (rd) rd.value = settings.renderDistance;
      if ($('val-renderdist')) $('val-renderdist').textContent = settings.renderDistance;
      if (sen) sen.value = settings.sensitivity;
      if ($('val-sensitivity')) $('val-sensitivity').textContent = settings.sensitivity.toFixed(1);
      if (fov) fov.value = settings.fov;
      if ($('val-fov')) $('val-fov').textContent = settings.fov;
      setSegActive('set-quality', 'q', settings.quality);
      setSegActive('set-weather', 'w', settings.weather);
      setSegActive('set-time', 't', settings.timeMode);
      if (sc) sc.checked = settings.showCoords;
      if (ch) ch.checked = settings.showCrosshair;
      if (dn) dn.checked = settings.dayNight;
      toast('已恢复默认设置');
    });
  }
  function bindSegGroup(containerId, attr, active, cb) {
    const c = $(containerId);
    if (!c) return;
    const btns = c.querySelectorAll('.seg');
    btns.forEach(b => {
      if (b.dataset[attr] === active) b.classList.add('active');
      b.addEventListener('click', () => {
        btns.forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        cb(b.dataset[attr]);
      });
    });
  }
  function setSegActive(containerId, attr, active) {
    const c = $(containerId); if (!c) return;
    c.querySelectorAll('.seg').forEach(b => b.classList.toggle('active', b.dataset[attr] === active));
  }

  /* ============================================================
   *  多世界管理
   * ============================================================ */
  function loadWorlds() {
    try {
      const s = localStorage.getItem(WORLDS_KEY);
      worlds = s ? JSON.parse(s) : [];
    } catch (e) { worlds = []; }
  }
  function saveWorlds() {
    try { localStorage.setItem(WORLDS_KEY, JSON.stringify(worlds)); } catch (e) {}
  }
  function biomeIcon(b) {
    return b === 'desert' ? '🏜' : b === 'snow' ? '❄' : b === 'flat' ? '🟩' : '🏔';
  }
  function biomeName(b) {
    return b === 'desert' ? '沙漠' : b === 'snow' ? '雪原' : b === 'flat' ? '超平坦' : '默认';
  }
  function renderWorldList() {
    const list = $('world-list');
    list.innerHTML = '';
    if (worlds.length === 0) {
      list.innerHTML = '<div class="world-empty">还没有世界，点击"新建世界"开始吧</div>';
      return;
    }
    // 按最后游玩时间倒序
    const sorted = [...worlds].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
    for (const w of sorted) {
      const item = document.createElement('div');
      item.className = 'world-item';
      item.innerHTML = `
        <div class="wi-icon" style="background:${w.biome==='desert'?'#d4a853':w.biome==='snow'?'#a8d4e8':'#43b06a'}22">${biomeIcon(w.biome)}</div>
        <div class="wi-info">
          <div class="wi-name">${escapeHtml(w.name)}</div>
          <div class="wi-meta">${biomeName(w.biome)} · ${w.mode==='creative'?'创造':'生存'} · 种子 ${w.seed}</div>
        </div>
        <button class="wi-del" title="删除世界">🗑</button>`;
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('wi-del')) {
          if (confirm(`确定删除世界"${w.name}"？此操作不可恢复。`)) {
            deleteWorld(w.id);
          }
          return;
        }
        enterWorld(w.id);
      });
      list.appendChild(item);
    }
  }
  function escapeHtml(s) {
    const d = document.createElement('div'); d.textContent = s; return d.innerHTML;
  }
  function createWorld(name, seed, biome, mode) {
    const id = 'w_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const w = {
      id, name: name || '新世界',
      seed: seed || Math.floor(Math.random() * 999999999),
      biome: biome || 'default',
      flat: biome === 'flat',
      mode: mode || 'creative',
      createdAt: Date.now(),
      lastPlayed: Date.now()
    };
    worlds.push(w);
    saveWorlds();
    return w;
  }
  function deleteWorld(id) {
    worlds = worlds.filter(w => w.id !== id);
    saveWorlds();
    try { localStorage.removeItem(worldSaveKey(id)); } catch (e) {}
    renderWorldList();
    toast('世界已删除');
  }
  function enterWorld(id) {
    const w = worlds.find(x => x.id === id);
    if (!w) { toast('世界不存在'); return; }
    currentWorld = w;
    w.lastPlayed = Date.now();
    saveWorlds();
    try { localStorage.setItem(CURRENT_WORLD_KEY, id); } catch (e) {}

    // 清理旧世界
    if (world) cleanupWorld();

    // 创建新世界
    world = new World(w.seed);
    world.biome = w.biome;
    world.flat = w.flat;
    world.scene = scene;
    world.solidMat = solidMat;
    world.transMat = transMat;
    world.waterMat = waterMat;
    world.emissiveMat = emissiveMat;
    ModManager.bindWorld(world);

    player = new Player(world, camera);
    player.mode = w.mode;
    if (w.mode === 'creative') player.flying = true;
    net = new NetClient(world, scene);
    window.__world = world;
    window.__player = player;

    // 加载该世界存档
    loadSave();
    // 出生
    player.spawn(8, 8);
    loadedChunks.clear();
    updateChunks(1);

    // 切换界面
    $('title-screen').style.display = 'none';
    $('hud').style.display = 'flex';
    inGame = true;
    buildHotbar();
    applySettings();
    toast(`进入世界：${w.name}`);
    // 成就
    unlockAchievement('enter_world', '初次进入世界');
  }
  function cleanupWorld() {
    if (!world) return;
    for (const [, entry] of world.meshes) {
      if (entry.solid) { scene.remove(entry.solid); entry.solid.geometry.dispose(); }
      if (entry.trans) { scene.remove(entry.trans); entry.trans.geometry.dispose(); }
      if (entry.emissive) { scene.remove(entry.emissive); entry.emissive.geometry.dispose(); }
      if (entry.water) { scene.remove(entry.water); entry.water.geometry.dispose(); }
    }
    world.meshes.clear();
    world.chunks.clear();
    loadedChunks.clear();
    for (const [, div] of signLabels) div.remove();
    signLabels.clear();
  }
  function returnToTitle() {
    if (inGame) {
      saveSave();
      netDisconnect();
    }
    cleanupWorld();
    world = null; player = null; net = null;
    inGame = false;
    $('menu').style.display = 'none';
    $('hud').style.display = 'none';
    $('title-screen').style.display = 'flex';
    renderWorldList();
    updateModCount();
  }

  /* ============================================================
   *  天气系统
   * ============================================================ */
  function setWeather(type) {
    weather.type = type;
    const layer = $('weather-layer');
    if (!layer) return;
    layer.innerHTML = '';
    weather.rainDrops = [];
    if (type === 'rain' || type === 'storm') {
      const count = type === 'storm' ? 200 : 100;
      for (let i = 0; i < count; i++) {
        const d = document.createElement('div');
        d.className = 'raindrop';
        d.style.left = Math.random() * 100 + '%';
        d.style.top = Math.random() * 100 + '%';
        d.style.opacity = type === 'storm' ? 0.9 : 0.6;
        layer.appendChild(d);
        weather.rainDrops.push({ el: d, speed: 8 + Math.random() * 12, x: Math.random() * window.innerWidth });
      }
    }
    const wl = $('weather-label');
    if (wl) wl.textContent = type === 'rain' ? '🌧 雨天' : type === 'storm' ? '⛈ 雷暴' : '';
    // 天空变暗
    if (sunLight) {
      if (type === 'rain') sunLight.intensity = Math.max(0.3, sunLight.intensity * 0.7);
      if (type === 'storm') sunLight.intensity = Math.max(0.15, sunLight.intensity * 0.5);
    }
  }
  function updateWeather(dt) {
    if (settings.weather === 'auto') {
      weather.autoTimer += dt;
      if (weather.autoTimer > 60) {
        weather.autoTimer = 0;
        const r = Math.random();
        weather.autoTarget = r < 0.6 ? 'clear' : r < 0.85 ? 'rain' : 'storm';
        if (weather.autoTarget !== weather.type) setWeather(weather.autoTarget);
      }
    }
    // 雨滴动画
    if (weather.type === 'rain' || weather.type === 'storm') {
      for (const d of weather.rainDrops) {
        const top = parseFloat(d.el.style.top) || 0;
        let nt = top + d.speed * dt * 6;
        if (nt > 100) { nt = -5; d.el.style.left = Math.random() * 100 + '%'; }
        d.el.style.top = nt + '%';
      }
      // 闪电
      if (weather.type === 'storm') {
        weather.lightningTimer -= dt;
        if (weather.lightningTimer <= 0) {
          weather.lightningTimer = 3 + Math.random() * 8;
          weather.lightningFlash = 0.15;
        }
        if (weather.lightningFlash > 0) {
          weather.lightningFlash -= dt;
          scene.background = new THREE.Color(0.9, 0.95, 1);
        }
      }
    }
  }

  /* ============================================================
   *  成就系统
   * ============================================================ */
  function unlockAchievement(id, text) {
    if (achievements.has(id)) return;
    achievements.add(id);
    const el = $('achievement-toast');
    if (el) {
      el.textContent = '🏆 ' + text;
      el.classList.add('show');
      clearTimeout(achievementTimer);
      achievementTimer = setTimeout(() => el.classList.remove('show'), 2500);
    }
  }

  /* ============================================================
   *  初始化
   * ============================================================ */
  function init() {
    // 渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = false;
    document.getElementById('game-canvas').appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x8fc9f0, CFG.move.reach * 2, CFG.renderDistance * CFG.chunkSize * 1.2);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    // 材质
    atlasTexture = Atlas.makeTexture();
    solidMat = new THREE.MeshLambertMaterial({ map: atlasTexture });
    transMat = new THREE.MeshLambertMaterial({ map: atlasTexture, transparent: true, alphaTest: 0.15, side: THREE.DoubleSide, depthWrite: true });
    waterMat = new THREE.MeshLambertMaterial({ map: atlasTexture, transparent: true, opacity: 0.66, side: THREE.DoubleSide, depthWrite: false });
    emissiveMat = new THREE.MeshBasicMaterial({ map: atlasTexture });

    // 光照
    hemiLight = new THREE.HemisphereLight(0xffffff, 0x887766, 0.5);
    scene.add(hemiLight);
    sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    sunLight.position.set(50, 80, 30);
    scene.add(sunLight);

    // 高亮框
    highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 })
    );
    highlight.visible = false;
    scene.add(highlight);

    // 加载设置
    loadSettings();
    applySettings();

    // 加载模组（内置 + 持久化）
    const qp = new URLSearchParams(location.search);
    if (qp.get('nomods') !== '1') {
      try { ModManager.loadBuiltin(); atlasTexture.needsUpdate = true; } catch (e) {}
    }
    try {
      const restored = ModManager.loadFromStorage();
      if (restored > 0) atlasTexture.needsUpdate = true;
    } catch (e) {}

    // 事件
    setupInput();
    setupTouch();
    setupUI();
    setupSettingsUI();
    setupNewWorldUI();

    // 加载世界列表
    loadWorlds();
    renderWorldList();
    updateModCount();

    // 存档定时（仅在游戏中）
    setInterval(() => { if (inGame) saveSave(); }, 5000);
    window.addEventListener('beforeunload', () => { if (inGame) saveSave(); });

    // 显示标题界面
    $('title-screen').style.display = 'flex';
    $('hud').style.display = 'none';

    window.addEventListener('resize', onResize);
    animate();
  }

  function updateModCount() {
    const custom = ModManager.getCustom();
    const txt = custom.length ? `已加载 ${custom.length} 个自定义方块` : '未加载自定义方块';
    if ($('mod-count')) $('mod-count').textContent = txt;
    if ($('mod-count-menu')) $('mod-count-menu').textContent = txt;
  }

  /* ============================================================
   *  新建世界 UI
   * ============================================================ */
  let nwBiome = 'default', nwMode = 'creative';
  function setupNewWorldUI() {
    $('btn-new-world').addEventListener('click', () => {
      $('nw-name').value = '新世界';
      $('nw-seed').value = '';
      nwBiome = 'default'; nwMode = 'creative';
      setSegActive('nw-biome', 'biome', 'default');
      setSegActive('nw-mode', 'mode', 'creative');
      $('new-world-dialog').style.display = 'flex';
    });
    $('nw-cancel').addEventListener('click', () => { $('new-world-dialog').style.display = 'none'; });
    $('nw-random-seed').addEventListener('click', () => {
      $('nw-seed').value = Math.floor(Math.random() * 999999999);
    });
    // 生物群系选择
    document.querySelectorAll('#nw-biome .seg').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#nw-biome .seg').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        nwBiome = b.dataset.biome;
      });
    });
    // 模式选择
    document.querySelectorAll('#nw-mode .seg').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#nw-mode .seg').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        nwMode = b.dataset.mode;
      });
    });
    $('nw-create').addEventListener('click', () => {
      const name = $('nw-name').value.trim() || '新世界';
      const seedStr = $('nw-seed').value.trim();
      const seed = seedStr ? (parseInt(seedStr, 10) || Math.floor(Math.random() * 999999999)) : Math.floor(Math.random() * 999999999);
      const w = createWorld(name, seed, nwBiome, nwMode);
      $('new-world-dialog').style.display = 'none';
      renderWorldList();
      enterWorld(w.id);
    });
    // 标题界面按钮
    $('btn-title-settings').addEventListener('click', () => { $('settings-dialog').style.display = 'flex'; });
    $('btn-title-mod').addEventListener('click', () => $('mod-file').click());
    $('mod-file').addEventListener('change', (e) => importModPack(e.target.files[0]));
    // 模组管理
    $('btn-title-mods').addEventListener('click', openModsDialog);
    $('mods-close').addEventListener('click', () => { $('mods-dialog').style.display = 'none'; });
    $('mods-clear').addEventListener('click', () => {
      if (!confirm('确定清空全部自定义方块？世界中的这些方块会被移除。')) return;
      ModManager.removeAllMods();
      renderModList();
      updateModCount();
      if (world) for (const key of world.meshes.keys()) world.dirty.add(key);
      toast('已清空全部自定义方块');
    });
  }

  /* 模组管理：打开弹窗 + 渲染列表 */
  function openModsDialog() {
    renderModList();
    $('mods-dialog').style.display = 'flex';
  }

  function renderModList() {
    const list = ModManager.listMods();
    const box = $('mods-list');
    if (!box) return;
    if (!list.length) {
      box.innerHTML = '<div class="mods-empty">还没有导入自定义方块。<br>在标题界面点「📦 导入模组」上传 zip 模组包。</div>';
      return;
    }
    box.innerHTML = list.map(m =>
      `<div class="mods-item" data-id="${m.id}">
         <span class="mods-id">#${m.id}</span>
         <span class="mods-name">${m.name}</span>
         <span class="mods-tags">${m.emissive ? '✨发光' : ''}${m.transparent ? ' 🔹透明' : ''}${m.solid ? '' : ' 🌫不实心'}</span>
         <button class="mods-del" data-del="${m.id}">🗑 删除</button>
       </div>`
    ).join('');
    box.querySelectorAll('.mods-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.del, 10);
        if (!confirm(`确定删除方块 #${id}？已放置的这些方块会被移除。`)) return;
        ModManager.removeMod(id);
        renderModList();
        updateModCount();
        if (world) for (const key of world.meshes.keys()) world.dirty.add(key);
        toast(`已删除方块 #${id}`);
      });
    });
  }

  /* ---------------- 区块流式 ---------------- */
  function updateChunks(dt) {
    if (!world || !player) return;
    streamTimer += dt;
    if (streamTimer < 0.12) return;
    streamTimer = 0;

    const pcx = Math.floor(player.pos.x / world.CS);
    const pcz = Math.floor(player.pos.z / world.CS);
    const R = CFG.renderDistance;
    const wanted = new Set();

    try {
      for (let dx = -R; dx <= R; dx++) {
        for (let dz = -R; dz <= R; dz++) {
          const d = Math.max(Math.abs(dx), Math.abs(dz));
          if (d > R) continue;
          const cx = pcx + dx, cz = pcz + dz;
          const key = world.chunkKey(cx, cz);
          wanted.add(key);
          if (!loadedChunks.has(key)) {
            world.ensureChunk(cx, cz);
            world.refreshChunk(cx, cz);
            loadedChunks.add(key);
          } else if (world.dirty.has(key)) {
            world.refreshChunk(cx, cz);
          }
        }
      }
    } catch (e) { window.__lastErr = 'updateChunks: ' + e.message; }
    for (const key of loadedChunks) {
      if (!wanted.has(key)) {
        const [cx, cz] = key.split(',').map(Number);
        world.unloadChunk(cx, cz);
        loadedChunks.delete(key);
      }
    }
  }

  /* ---------------- 主循环 ---------------- */
  function animate() {
    rafId = requestAnimationFrame(animate);
    let dt = clock.getDelta();
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 0.05);
    __dbg.frames++; __dbg.dt = dt;

    if (inGame && world && player) {
      updateChunks(dt);
      player.update(dt, input);
      input.lookDX = 0; input.lookDY = 0;  // 重置视角增量（触屏停止拖动后不持续旋转）
      syncCamera();
      updateInteraction();
      updateTime(dt);
      updateRemote(dt);
      updateCrops(dt);
      updateSignLabels();
      updateWeather(dt);
      updateHUD();
    } else {
      // 标题界面也渲染背景（如果有世界）
      if (world) { updateChunks(dt); renderer.render(scene, camera); }
      else {
        // 纯背景色
        scene.background = new THREE.Color(0x1a2540);
        renderer.render(scene, camera);
      }
      return;
    }
    renderer.render(scene, camera);
  }

  function syncCamera() {
    camera.position.set(player.pos.x, player.eyeY, player.pos.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
  }

  function updateRemote(dt) {
    if (net && net.connected) {
      net.sendMove(player.pos, player.yaw, player.pitch,
        (input.forward || input.back || input.left || input.right), player.onGround);
      net.update(dt);
    }
  }

  /* ---------------- 昼夜 ---------------- */
  function updateTime(dt) {
    if (settings.dayNight && settings.timeMode === 'cycle') {
      timeOfDay = (timeOfDay + dt / DAY_LENGTH) % 1;
    }
    const ang = timeOfDay * Math.PI * 2;
    const elev = Math.sin(ang);
    const R = 120;
    sunLight.position.set(Math.cos(ang) * R, elev * R, 40);
    let intensity = Math.max(0, elev * 1.2);
    // 天气影响亮度
    if (weather.type === 'rain') intensity *= 0.6;
    if (weather.type === 'storm' && weather.lightningFlash <= 0) intensity *= 0.35;
    sunLight.intensity = intensity;

    let col;
    if (elev > 0.05) {
      const k = Math.min(1, elev / 0.5);
      col = new THREE.Color(0.58, 0.79, 0.96).lerp(new THREE.Color(0.45, 0.68, 0.9), 1 - k);
    } else {
      const k = Math.min(1, -elev / 0.5);
      col = new THREE.Color(0.25, 0.34, 0.55).lerp(new THREE.Color(0.02, 0.03, 0.09), k);
    }
    // 天气影响天空色
    if (weather.type === 'rain') col = col.lerp(new THREE.Color(0.4, 0.45, 0.5), 0.4);
    if (weather.type === 'storm' && weather.lightningFlash <= 0) col = col.lerp(new THREE.Color(0.2, 0.22, 0.28), 0.5);
    if (weather.lightningFlash <= 0) {
      scene.background = col;
      scene.fog.color = col;
    }

    const hour = (timeOfDay * 24) % 24;
    const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
    const ap = hh < 12 ? 'AM' : 'PM';
    const h12 = ((hh + 11) % 12) + 1;
    const el = $('clock');
    if (el) el.textContent = `${h12}:${String(mm).padStart(2, '0')} ${ap}`;
  }

  /* ---------------- 交互 ---------------- */
  function updateInteraction() {
    if (!player) return;
    const hit = player.raycast();
    if (hit.hit) {
      highlight.visible = true;
      highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else {
      highlight.visible = false;
    }
    const breaking = input.breakHeld || touchBreak;
    if (breaking && hit.hit && !player.dead) {
      if (!breakTarget || breakTarget.x !== hit.x || breakTarget.y !== hit.y || breakTarget.z !== hit.z) {
        breakTarget = { x: hit.x, y: hit.y, z: hit.z, id: hit.id };
        breakTime = 0;
      }
      const def = CFG.blockById(breakTarget.id);
      if (def && def.hardness !== Infinity) {
        if (player.mode === 'creative') {
          doBreak(breakTarget);
        } else {
          breakTime += 1 / 60;
          if (breakTime >= def.hardness) doBreak(breakTarget);
        }
      }
    } else {
      breakTarget = null; breakTime = 0;
    }
  }

  function doBreak(target) {
    const was = player.breakBlock(target);
    if (was != null) {
      unlockAchievement('first_break', '首次挖掘方块');
      if (net && net.connected) net.sendEdit(target.x, target.y, target.z, 0);
    }
    breakTarget = null; breakTime = 0;
  }

  function doPlace() {
    if (!player || player.dead) return;
    const hit = player.raycast();
    if (!hit.hit) return;
    if (hit.id === 112) {
      askSignText(world.getSignText(hit.x, hit.y, hit.z), (t) => {
        if (t) world.setSignText(hit.x, hit.y, hit.z, t);
      });
      return;
    }
    const id = player.selBlock();
    if (player.mode === 'survival') {
      const cnt = player.inventory.get(id) || 0;
      if (cnt <= 0) return;
    }
    if (player.placeBlock(hit, id)) {
      unlockAchievement('first_place', '首次放置方块');
      if (net && net.connected) {
        const nx = hit.x + hit.face[0], ny = hit.y + hit.face[1], nz = hit.z + hit.face[2];
        net.sendEdit(nx, ny, nz, id);
      }
      if (id === 112) {
        const nx = hit.x + hit.face[0], ny = hit.y + hit.face[1], nz = hit.z + hit.face[2];
        askSignText('', (t) => {
          if (t) world.setSignText(nx, ny, nz, t);
          else toast('告示牌：未输入文字，留空牌');
        });
      }
    }
  }

  /* ---------------- 输入（键鼠） ---------------- */
  let touchBreak = false;
  function setupInput() {
    const canvas = renderer.domElement;
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w') input.forward = true;
      if (k === 's') input.back = true;
      if (k === 'a') input.left = true;
      if (k === 'd') input.right = true;
      if (k === ' ') { input.jump = true; e.preventDefault(); }
      if (k === 'shift') input.crouch = true;
      if (k === 'control') input.sprint = true;
      if (k === 'f') toggleFly();
      if (k === 'e') toggleMode();
      if (k === 'p' || k === 'b') openPicker();
      if (k === 'h') buildHouse();
      if (k === 'escape') {
        if (document.pointerLockElement) document.exitPointerLock();
        else if (inGame) showMenu();
      }
      const n = parseInt(k, 10);
      if (n >= 1 && n <= 9) selectSlot(n - 1);
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w') input.forward = false;
      if (k === 's') input.back = false;
      if (k === 'a') input.left = false;
      if (k === 'd') input.right = false;
      if (k === ' ') input.jump = false;
      if (k === 'shift') input.crouch = false;
      if (k === 'control') input.sprint = false;
    });
    canvas.addEventListener('click', () => {
      if (inGame && !menuOpen) canvas.requestPointerLock && canvas.requestPointerLock();
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement && inGame && !menuOpen) {
        const sens = settings.sensitivity;
        input.lookDX = e.movementX * sens;
        input.lookDY = e.movementY * sens;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (menuOpen || !inGame || !document.pointerLockElement) return;
      if (e.button === 0) input.breakHeld = true;
      if (e.button === 2) doPlace();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) input.breakHeld = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => {
      if (!player) return;
      const idx = (player.selSlot + (e.deltaY > 0 ? 1 : -1) + 9) % 9;
      selectSlot(idx);
    });
  }

  function toggleFly() {
    if (!player) return;
    player.flying = !player.flying;
    player.vel.y = 0;
    toast(player.flying ? '飞行模式：开' : '飞行模式：关');
  }
  function toggleMode() {
    if (!player) return;
    player.mode = player.mode === 'creative' ? 'survival' : 'creative';
    if (player.mode === 'creative') { player.flying = true; player.health = CFG.survival.startHealth; }
    else player.flying = false;
    if (currentWorld) { currentWorld.mode = player.mode; saveWorlds(); }
    toast('模式：' + (player.mode === 'creative' ? '创造' : '生存'));
    updateHUD();
  }

  function selectSlot(i) {
    if (!player) return;
    player.selSlot = i;
    for (let n = 0; n < 9; n++) {
      const el = $('slot' + n);
      if (el) el.classList.toggle('sel', n === i);
    }
  }

  /* ---------------- 触控 ---------------- */
  function setupTouch() {
    const canvas = renderer.domElement;
    // 更可靠的触屏检测：ontouchstart / maxTouchPoints / coarse pointer
    const isTouch = 'ontouchstart' in window
      || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0)
      || window.matchMedia('(pointer: coarse)').matches;
    document.body.classList.toggle('touch', !!isTouch);
    // 调试：如果检测不到触屏但屏幕较窄（手机），也强制显示触控按钮
    if (!isTouch && window.innerWidth < 768 && 'ontouchstart' in window === false) {
      // 某些浏览器需要通过实际 touch 事件来激活
    }

    let joystick = null, lookId = null, lastLook = null;
    canvas.addEventListener('touchstart', (e) => {
      // 兜底：首次触摸时确保触屏 UI 已激活
      if (!document.body.classList.contains('touch')) {
        document.body.classList.add('touch');
      }
      if (menuOpen || !inGame) return;
      for (const t of e.changedTouches) {
        const x = t.clientX, y = t.clientY;
        if (x < window.innerWidth * 0.42) {
          joystick = { id: t.identifier, ox: x, oy: y, x, y };
          const js = $('joystick');
          js.style.display = 'flex';
          js.style.left = x + 'px'; js.style.top = y + 'px';
        } else if (lastLook === null) {
          lookId = t.identifier;
          lastLook = { x, y };
        }
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      if (menuOpen || !inGame) return;
      for (const t of e.changedTouches) {
        if (joystick && t.identifier === joystick.id) {
          joystick.x = t.clientX; joystick.y = t.clientY;
          const dx = t.clientX - joystick.ox, dy = t.clientY - joystick.oy;
          const len = Math.hypot(dx, dy);
          const max = 56;
          const k = Math.min(1, len / max);
          input.forward = dy < -10;
          input.back = dy > 10;
          input.right = dx > 10;
          input.left = dx < -10;
          const ball = $('joystick-ball');
          if (ball) ball.style.transform = `translate(${dx}px,${dy}px)`;
        } else if (t.identifier === lookId && lastLook) {
          const sens = settings.sensitivity;
          input.lookDX = (t.clientX - lastLook.x) * sens;
          input.lookDY = (t.clientY - lastLook.y) * sens;
          lastLook = { x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: true });

    const endTouch = (e) => {
      for (const t of e.changedTouches) {
        if (joystick && t.identifier === joystick.id) {
          joystick = null;
          input.forward = input.back = input.left = input.right = false;
          $('joystick').style.display = 'none';
        }
        if (t.identifier === lookId) { lookId = null; lastLook = null; }
      }
    };
    canvas.addEventListener('touchend', endTouch);
    canvas.addEventListener('touchcancel', endTouch);
  }

  function bindTouchButton(id, prop) {
    const el = $(id);
    if (!el) return;
    el.addEventListener('touchstart', (e) => { e.preventDefault(); input[prop] = true; }, { passive: false });
    el.addEventListener('touchend', (e) => { e.preventDefault(); input[prop] = false; }, { passive: false });
    el.addEventListener('touchcancel', (e) => { input[prop] = false; });
  }

  /* ---------------- UI ---------------- */
  let menuOpen = false;
  function setupUI() {
    // 全局触摸转点击：所有菜单按钮/分段选择/世界条目/快捷栏 触摸即触发click
    // （游戏内摇杆按钮 .tbtn 有独立 touchstart，不在此列）
    document.addEventListener('touchstart', (e) => {
      const btn = e.target.closest('.mbtn, .seg, .world-item, .wi-del, .slot, .bp-item, .dialog-x, .achievement, .mods-del, .mods-item');
      if (btn) { e.preventDefault(); btn.click(); }
    }, { passive: false });

    bindTouchButton('btn-jump', 'jump');
    bindTouchButton('btn-sprint', 'sprint');
    bindTouchButton('btn-break', 'breakHeld');
    $('btn-place').addEventListener('touchstart', (e) => { e.preventDefault(); doPlace(); }, { passive: false });
    $('btn-fly').addEventListener('touchstart', (e) => { e.preventDefault(); toggleFly(); }, { passive: false });
    $('btn-mode').addEventListener('touchstart', (e) => { e.preventDefault(); toggleMode(); }, { passive: false });
    $('btn-house').addEventListener('touchstart', (e) => { e.preventDefault(); buildHouse(); }, { passive: false });
    $('btn-house').addEventListener('click', () => buildHouse());
    $('btn-picker').addEventListener('touchstart', (e) => { e.preventDefault(); openPicker(); }, { passive: false });
    $('btn-picker').addEventListener('click', openPicker);
    $('block-picker').addEventListener('click', (e) => { if (e.target === $('block-picker')) closePicker(); });
    $('bp-close').addEventListener('click', closePicker);

    // 游戏内暂停菜单
    $('btn-resume').addEventListener('click', hideMenu);
    $('btn-menu-settings').addEventListener('click', () => { $('settings-dialog').style.display = 'flex'; });
    $('btn-menu-mod').addEventListener('click', () => $('mod-file').click());
    $('btn-reset').addEventListener('click', resetWorld);
    $('btn-to-title').addEventListener('click', () => {
      if (confirm('返回标题界面？当前进度会自动保存。')) returnToTitle();
    });
    $('btn-back-menu').addEventListener('click', () => { if (inGame) showMenu(); });
    $('btn-back-menu').addEventListener('touchstart', (e) => { e.preventDefault(); if (inGame) showMenu(); }, { passive: false });
    $('btn-server').addEventListener('click', joinServer);
    $('server-ip').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinServer(); });
  }

  function showMenu() {
    menuOpen = true;
    $('menu').style.display = 'flex';
    $('hud').style.display = 'none';
    if (document.pointerLockElement) document.exitPointerLock();
    if (currentWorld) {
      $('menu-world-name').textContent = currentWorld.name;
      $('menu-world-info').textContent = `${biomeName(currentWorld.biome)} · ${currentWorld.mode==='creative'?'创造':'生存'} · 种子 ${currentWorld.seed}`;
    }
    updateModCount();
  }
  function hideMenu() {
    menuOpen = false;
    $('menu').style.display = 'none';
    $('hud').style.display = 'flex';
  }

  /* 加入服务器 */
  function joinServer() {
    if (!world) return;
    const raw = $('server-ip').value.trim();
    if (!raw) { toast('请输入服务器地址'); return; }
    let url = raw;
    if (!/^ws:\/\//i.test(url)) url = 'ws://' + url;
    net.connect(url).then(() => {
      net.join('玩家', player.pos, player.yaw, player.pitch);
      toast('已连接到服务器');
      hideMenu();
    }).catch(() => { toast('连接失败，请确认服务器已启动'); });
  }
  function netDisconnect() {
    if (net && net.ws) { try { net.ws.close(); } catch (e) {} }
    if (net) net.clearRemote();
  }

  /* 导入模组包 */
  function importModPack(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      JSZip.loadAsync(reader.result).then((zip) => {
        ModManager.registerFromZip(zip, (err) => {
          if (err) toast('模组加载失败：' + err.message);
          else {
            toast('模组加载成功！已加入自定义方块');
            atlasTexture.needsUpdate = true;
            if (world) for (const key of world.meshes.keys()) world.dirty.add(key);
            updateModCount();
          }
        });
      }).catch(() => toast('无法解析 zip 文件'));
    };
    reader.readAsArrayBuffer(file);
    $('mod-file').value = '';
  }

  /* 重置当前世界 */
  function resetWorld() {
    if (!currentWorld) return;
    if (!confirm(`确定重置世界"${currentWorld.name}"？所有建筑和进度将丢失。`)) return;
    try { localStorage.removeItem(worldSaveKey(currentWorld.id)); } catch (e) {}
    enterWorld(currentWorld.id);
    hideMenu();
  }

  /* ---------------- 热键栏 ---------------- */
  function buildHotbar() {
    const bar = $('hotbar');
    if (!bar || !player) return;
    bar.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot' + (i === player.selSlot ? ' sel' : '');
      slot.id = 'slot' + i;
      slot.addEventListener('click', () => selectSlot(i));
      const id = player.hotbar[i];
      const icon = document.createElement('div');
      icon.className = 'icon';
      const tile = getTileCanvas(id);
      if (tile) icon.appendChild(tile);
      const count = document.createElement('div');
      count.className = 'count';
      count.id = 'cnt' + i;
      slot.appendChild(icon);
      slot.appendChild(count);
      bar.appendChild(slot);
    }
  }

  function getTileCanvas(id) {
    const def = CFG.blockById(id);
    if (!def) return null;
    let t = def.tiles;
    if (Array.isArray(t)) t = t[0];
    return Atlas.icon(t, 24);
  }

  /* ---------------- HUD 更新 ---------------- */
  function updateHUD() {
    if (!player) return;
    const p = $('pos');
    if (p) p.textContent = `X ${Math.floor(player.pos.x)}  Y ${Math.floor(player.pos.y)}  Z ${Math.floor(player.pos.z)}`;
    const mode = $('mode-label');
    if (mode) mode.textContent = player.mode === 'creative' ? '创造' : '生存';
    const fly = $('fly-label');
    if (fly) fly.textContent = player.flying ? '✈ 飞行' : '';
    const houseBtn = $('btn-house');
    if (houseBtn) houseBtn.style.display = player.mode === 'creative' ? 'flex' : 'none';
    const pickerBtn = $('btn-picker');
    if (pickerBtn) pickerBtn.style.display = player.mode === 'creative' ? 'flex' : 'none';
    const hp = $('health-fill');
    if (hp) hp.style.width = (player.health / CFG.survival.startHealth * 100) + '%';
    $('health-wrap').style.display = player.mode === 'survival' ? 'block' : 'none';
    for (let i = 0; i < 9; i++) {
      const el = $('cnt' + i);
      if (el) {
        const id = player.hotbar[i];
        const c = player.inventory.get(id) || 0;
        el.textContent = player.mode === 'survival' && c > 0 ? c : '';
      }
    }
    const prog = $('break-progress');
    if (prog) {
      if (breakTarget && player.mode === 'survival') {
        const def = CFG.blockById(breakTarget.id);
        prog.style.display = 'block';
        prog.style.width = Math.min(100, breakTime / def.hardness * 100) + '%';
      } else prog.style.display = 'none';
    }
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.style.opacity = 1;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.opacity = 0; }, 2200);
  }

  /* ---------------- 农田生长 ---------------- */
  function updateCrops(dt) {
    if (!world || !player) return;
    cropTimer += dt;
    if (cropTimer < 2.0) return;
    cropTimer = 0;
    const px = Math.floor(player.pos.x), py = Math.floor(player.pos.y), pz = Math.floor(player.pos.z);
    const R = 16;
    for (let y = py - 4; y <= py + 6; y++) {
      for (let x = px - R; x <= px + R; x++) {
        for (let z = pz - R; z <= pz + R; z++) {
          if (world.getBlock(x, y, z) !== 111) continue;
          if (world.getMeta(x, y, z) >= 3) continue;
          if (world.getBlock(x, y - 1, z) !== 110) continue;
          world.setMeta(x, y, z, world.getMeta(x, y, z) + 1);
        }
      }
    }
  }

  /* ---------------- 告示牌 ---------------- */
  function askSignText(initText, cb) {
    const inp = $('sign-text');
    inp.value = initText || '';
    $('sign-dialog').style.display = 'flex';
    inp.focus();
    const ok = () => { $('sign-dialog').style.display = 'none'; cb(inp.value.trim()); };
    const cancel = () => { $('sign-dialog').style.display = 'none'; cb(null); };
    $('sign-ok').onclick = ok;
    $('sign-cancel').onclick = cancel;
    inp.onkeydown = (e) => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') cancel(); };
  }
  function updateSignLabels() {
    if (!world || !camera) return;
    const container = $('sign-labels');
    for (const [key, text] of world.signs) {
      const p = key.split(',').map(Number);
      const v = new THREE.Vector3(p[0] + 0.5, p[1] + 1.5, p[2] + 0.5).project(camera);
      const dx = p[0] + 0.5 - camera.position.x, dy = p[1] + 1.5 - camera.position.y, dz = p[2] + 0.5 - camera.position.z;
      const dist2 = dx * dx + dy * dy + dz * dz;
      let div = signLabels.get(key);
      if (v.z > 1 || dist2 > 45 * 45) { if (div) div.style.display = 'none'; continue; }
      if (!div) {
        div = document.createElement('div');
        div.className = 'sign-label';
        container.appendChild(div);
        signLabels.set(key, div);
      }
      div.textContent = text;
      div.style.display = 'block';
      div.style.left = ((v.x * 0.5 + 0.5) * window.innerWidth) + 'px';
      div.style.top = ((-v.y * 0.5 + 0.5) * window.innerHeight) + 'px';
    }
    for (const [key, div] of signLabels) {
      if (!world.signs.has(key)) { div.remove(); signLabels.delete(key); }
    }
  }

  /* ---------------- 一键建房子 ---------------- */
  function buildHouse() {
    if (!player || player.mode !== 'creative') { toast('建房请先切换到创造模式'); return; }
    const fx = Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    const cx = Math.floor(player.pos.x + fx * 6), cz = Math.floor(player.pos.z + fz * 6);
    const g = world.findSpawn(cx, cz) - 1;
    const x0 = cx - 2, z0 = cz - 2, X1 = x0 + 4, Z1 = z0 + 4;
    const doorEdge = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 'west' : 'east') : (fz > 0 ? 'north' : 'south');
    for (let x = x0; x <= X1; x++) for (let z = z0; z <= Z1; z++) {
      for (let y = g + 1; y <= g + 5; y++) world.setBlock(x, y, z, 0);
      world.setBlock(x, g + 1, z, 8);
    }
    const isDoor = (x, z) => {
      if (doorEdge === 'south') return z === Z1 && x === cx;
      if (doorEdge === 'north') return z === z0 && x === cx;
      if (doorEdge === 'east') return x === X1 && z === cz;
      return x === x0 && z === cz;
    };
    const isWin = (x, z, y) => y === g + 2 && (
      (doorEdge === 'south' || doorEdge === 'north') ? (z === z0 + 2 && (x === x0 || x === X1)) : (x === x0 + 2 && (z === z0 || z === Z1))
    );
    for (let y = g + 2; y <= g + 3; y++) {
      for (let x = x0; x <= X1; x++) for (let z = z0; z <= Z1; z++) {
        const wall = x === x0 || x === X1 || z === z0 || z === Z1;
        if (!wall) continue;
        if (isDoor(x, z)) continue;
        const corner = (x === x0 || x === X1) && (z === z0 || z === Z1);
        if (corner) world.setBlock(x, y, z, 6);
        else if (isWin(x, z, y)) world.setBlock(x, y, z, 10);
        else world.setBlock(x, y, z, 8);
      }
    }
    for (let x = x0; x <= X1; x++) for (let z = z0; z <= Z1; z++) world.setBlock(x, g + 4, z, 8);
    const doorX = doorEdge === 'east' ? X1 + 1 : (doorEdge === 'west' ? x0 - 1 : cx);
    const doorZ = doorEdge === 'south' ? Z1 + 1 : (doorEdge === 'north' ? z0 - 1 : cz);
    for (let i = 1; i <= 2; i++) {
      const dx = doorEdge === 'east' ? X1 + i : (doorEdge === 'west' ? x0 - i : cx);
      const dz = doorEdge === 'south' ? Z1 + i : (doorEdge === 'north' ? z0 - i : cz);
      world.setBlock(dx, g + 1, dz, 8);
    }
    unlockAchievement('build_house', '建造第一座房子');
    toast('小屋已建好！');
  }

  /* ---------------- 方块面板 ---------------- */
  function buildBlockPicker() {
    const grid = $('block-grid');
    grid.innerHTML = '';
    for (const def of CFG.blocks) {
      if (!def || def.id === 0 || def.id === 5) continue;
      if (def.solid === false && !def.plant && !def.sign) continue;
      const b = document.createElement('div');
      b.className = 'bp-item';
      const icon = getTileCanvas(def.id);
      if (icon) b.appendChild(icon);
      const nm = document.createElement('span');
      nm.textContent = def.name;
      b.appendChild(nm);
      b.addEventListener('click', () => {
        player.hotbar[player.selSlot] = def.id;
        const slotEl = $('slot' + player.selSlot);
        if (slotEl) {
          const ic = slotEl.querySelector('.icon');
          if (ic) { ic.innerHTML = ''; const t = getTileCanvas(def.id); if (t) ic.appendChild(t); }
        }
        closePicker();
        toast('已选择：' + def.name);
      });
      grid.appendChild(b);
    }
  }
  function openPicker() { if (!pickerOpen) { buildBlockPicker(); $('block-picker').style.display = 'flex'; pickerOpen = true; } }
  function closePicker() { $('block-picker').style.display = 'none'; pickerOpen = false; }

  /* ---------------- 存档（按世界） ---------------- */
  function loadSave() {
    if (!currentWorld || !world || !player) return;
    const s = localStorage.getItem(worldSaveKey(currentWorld.id));
    if (!s) return;
    try {
      const d = JSON.parse(s);
      if (d.seed) world.seed = d.seed;
      if (d.flat != null) world.flat = !!d.flat;
      if (d.mode) player.mode = d.mode;
      if (d.inventory) player.inventory = new Map(d.inventory);
      if (d.hotbar) player.hotbar = d.hotbar;
      if (d.pos) { player.pos.set(d.pos[0], d.pos[1], d.pos[2]); }
      if (d.time) timeOfDay = d.time;
      if (d.edits) for (const e of d.edits) world.edits.set(e[0] + ',' + e[1] + ',' + e[2], e[3]);
      if (d.meta) world.meta = new Map(d.meta);
      if (d.signs) world.signs = new Map(d.signs);
    } catch (e) {}
  }
  function saveSave() {
    if (!currentWorld || !world || !player) return;
    try {
      const edits = [...world.edits.entries()].map(([k, v]) => {
        const [x, y, z] = k.split(',').map(Number);
        return [x, y, z, v];
      }).slice(0, 40000);
      const d = {
        seed: world.seed,
        flat: world.flat,
        mode: player.mode,
        inventory: [...player.inventory.entries()],
        hotbar: player.hotbar,
        pos: [player.pos.x, player.pos.y, player.pos.z],
        time: timeOfDay,
        edits,
        meta: [...world.meta.entries()].slice(0, 20000),
        signs: [...world.signs.entries()].slice(0, 500)
      };
      localStorage.setItem(worldSaveKey(currentWorld.id), JSON.stringify(d));
    } catch (e) {}
  }

  function onResize() {
    if (camera) {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    }
    if (renderer) renderer.setSize(window.innerWidth, window.innerHeight);
  }

  return { init, toggleMode, showMenu, returnToTitle, enterWorld, getWorlds: () => worlds, getSettings: () => settings };
})();

window.addEventListener('DOMContentLoaded', () => {
  Game.init();
});

/* 调试：运行错误显示 */
window.__lastErr = '';
window.addEventListener('error', (e) => {
  window.__lastErr = (e.message || 'unknown') + ' @' + (e.lineno || '');
});
