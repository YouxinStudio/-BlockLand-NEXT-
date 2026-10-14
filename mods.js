/* =========================================================
 * mods.js —— 自定义方块模组（资源包）加载
 * 支持：内置示例包 + 用户上传 zip（blocks.json + textures/*.png）
 * ========================================================= */
const ModManager = (() => {
  let nextTile = Atlas.tileCount;      // 从图集现有图块数开始
  let nextId = 100;                    // 自定义方块 id 从 100 起
  const custom = [];
  const STORAGE_KEY = 'blockland_mods_v1';

  /* Uint8Array ↔ base64 互转（用于贴图持久化，同步恢复） */
  function uint8ToBase64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function base64ToUint8(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  /* 确保图集画布足够容纳 idx */
  function ensureAtlas(idx) {
    const rows = Math.floor(idx / Atlas.COLS) + 1;
    const need = rows * Atlas.CELL;
    if (Atlas.canvas.height < need) {
      const tmp = document.createElement('canvas');
      tmp.width = Atlas.canvas.width;
      tmp.height = need;
      const tctx = tmp.getContext('2d');
      tctx.drawImage(Atlas.canvas, 0, 0);
      Atlas.canvas.width = tmp.width;
      Atlas.canvas.height = need;
      Atlas.canvas.getContext('2d').drawImage(tmp, 0, 0);
      Atlas.texture.needsUpdate = true;
    }
  }

  function registerBlock(def) {
    // def: {name, tiles: {top,side,bottom} 或统一 canvas/color, drop?, hardness?}
    const id = def.id != null ? def.id : nextId++;
    let top, side, bottom;
    if (def.tiles) {
      top = def.tiles.top != null ? def.tiles.top : (def.tiles.side || def.tiles.uniform);
      side = def.tiles.side != null ? def.tiles.side : (def.tiles.top || def.tiles.uniform);
      bottom = def.tiles.bottom != null ? def.tiles.bottom : side;
    }
    // 绘制到图集
    const drawTile = (src) => {
      let canvas;
      if (src instanceof HTMLCanvasElement || src instanceof HTMLImageElement) {
        canvas = document.createElement('canvas');
        canvas.width = Atlas.CONTENT; canvas.height = Atlas.CONTENT;
        canvas.getContext('2d').drawImage(src, 0, 0, Atlas.CONTENT, Atlas.CONTENT);
      } else {
        canvas = document.createElement('canvas');
        canvas.width = Atlas.CONTENT; canvas.height = Atlas.CONTENT;
        const cx = canvas.getContext('2d'); cx.fillStyle = src; cx.fillRect(0, 0, Atlas.CONTENT, Atlas.CONTENT);
      }
      ensureAtlas(nextTile);
      Atlas.addTile(canvas, nextTile);
      // 保存原始像素用于持久化
      const imgData = canvas.getContext('2d').getImageData(0, 0, Atlas.CONTENT, Atlas.CONTENT);
      const raw = uint8ToBase64(imgData.data);
      return { idx: nextTile++, raw };
    };
    const tTop = drawTile(top), tSide = drawTile(side), tBottom = drawTile(bottom);
    const entry = {
      id, name: def.name,
      solid: def.solid !== false,
      transparent: !!def.transparent,
      opacity: def.opacity,
      tiles: [tTop.idx, tSide.idx, tBottom.idx],
      _tileRaw: { top: tTop.raw, side: tSide.raw, bottom: tBottom.raw },
      drop: def.drop != null ? def.drop : id,
      hardness: def.hardness != null ? def.hardness : 1.5,
      emissive: !!def.emissive
    };
    // 支持放自定义 id
    if (id < CFG.blocks.length && CFG.blocks[id]) {
      // 覆盖内置：保留 id
    } else if (id >= CFG.blocks.length) {
      while (CFG.blocks.length < id) CFG.blocks.push(null);
      CFG.blocks[id] = entry;
    } else {
      CFG.blocks[id] = entry;
    }
    // 按 id 去重：同 id 替换旧条目
    const existIdx = custom.findIndex(e => e.id === id);
    if (existIdx >= 0) custom[existIdx] = entry;
    else custom.push(entry);
    return entry;
  }

  function registerFromZip(zip, cb) {
    const jsonFile = zip.file('blocks.json');
    if (!jsonFile) { cb(new Error('缺少 blocks.json')); return; }
    jsonFile.async('string').then((text) => {
      let defs;
      try { defs = JSON.parse(text); } catch (e) { cb(new Error('blocks.json 解析失败')); return; }
      const defList = Array.isArray(defs) ? defs : (defs.blocks || []);
      const tasks = defList.map((def) => {
        const texName = (t) => (typeof t === 'string' && t.startsWith('textures/')) ? t : null;
        const loadTile = (t) => {
          return new Promise((res) => {
            const p = texName(t);
            if (p) {
              const f = zip.file(p);
              if (!f) { res(resolveColor(t)); return; }
              f.async('blob').then((blob) => {
                const url = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => { res(img); };
                img.onerror = () => { res(resolveColor(t)); };
                img.src = url;
              });
            } else {
              res(resolveColor(t));
            }
          });
        };
        return Promise.all([
          loadTile(def.tiles && def.tiles.top != null ? def.tiles.top : (def.tiles && (def.tiles.side || def.tiles.uniform))),
          loadTile(def.tiles && def.tiles.side != null ? def.tiles.side : (def.tiles && (def.tiles.top || def.tiles.uniform))),
          loadTile(def.tiles && def.tiles.bottom != null ? def.tiles.bottom : (def.tiles && (def.tiles.top || def.tiles.uniform)))
        ]).then(([top, side, bottom]) => {
          registerBlock({ ...def, tiles: { top, side, bottom } });
        });
      });
      Promise.all(tasks).then(() => {
        applyToWorld();
        saveToStorage();
        cb(null, custom);
      });
    });
  }

  function resolveColor(t) {
    if (typeof t === 'string') return t;
    return '#cccccc';
  }

  let worldRef = null;
  function bindWorld(world) { worldRef = world; }
  function applyToWorld() {
    if (worldRef) {
      // 重刷所有已加载区块
      for (const key of worldRef.meshes.keys()) {
        const [cx, cz] = key.split(',').map(Number);
        worldRef.dirty.add(key);
      }
    }
  }

  /* ---------- 模组持久化：导入后存 localStorage，刷新自动恢复 ---------- */
  function saveToStorage() {
    try {
      // 只存用户导入的方块（id >= 110，内置 100-105 每次启动自动加载）
      const data = custom.filter(e => e.id >= 110 && e._tileRaw).map(e => ({
        id: e.id, name: e.name, solid: e.solid, transparent: e.transparent,
        opacity: e.opacity, hardness: e.hardness, emissive: e.emissive, drop: e.drop,
        tiles: e._tileRaw
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return data.length;
    } catch (e) {
      console.warn('模组存档失败', e);
      return 0;
    }
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return 0;
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return 0;
      let count = 0;
      for (const def of data) {
        if (!def || !def.tiles) continue;
        // 已注册则跳过（避免重复）
        if (CFG.blocks[def.id]) continue;
        const toCanvas = (b64) => {
          const canvas = document.createElement('canvas');
          canvas.width = Atlas.CONTENT; canvas.height = Atlas.CONTENT;
          const bytes = base64ToUint8(b64);
          const imgData = new ImageData(new Uint8ClampedArray(bytes), Atlas.CONTENT, Atlas.CONTENT);
          canvas.getContext('2d').putImageData(imgData, 0, 0);
          return canvas;
        };
        registerBlock({
          id: def.id, name: def.name, solid: def.solid, transparent: def.transparent,
          opacity: def.opacity, hardness: def.hardness, emissive: def.emissive, drop: def.drop,
          tiles: { top: toCanvas(def.tiles.top), side: toCanvas(def.tiles.side), bottom: toCanvas(def.tiles.bottom) }
        });
        count++;
      }
      if (count > 0) applyToWorld();
      return count;
    } catch (e) {
      console.warn('模组恢复失败', e);
      return 0;
    }
  }

  function clearStorage() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  /* ---------- 模组管理：列出 + 删除单个方块 ---------- */
  function listMods() {
    // 只列用户导入且已持久化的方块（id >= 110）
    return custom.filter(e => e.id >= 110 && e._tileRaw).map(e => ({
      id: e.id, name: e.name, solid: e.solid, transparent: e.transparent,
      emissive: !!e.emissive, hardness: e.hardness
    }));
  }

  function removeMod(id) {
    const idx = custom.findIndex(e => e.id === id);
    if (idx < 0) return false;
    custom.splice(idx, 1);
    // 清除方块定义（保留内置方块不受影响）
    if (CFG.blocks[id]) CFG.blocks[id] = null;
    // 把已加载世界中所有该方块替换为空气，保持世界一致
    if (worldRef) {
      const CS = worldRef.CS, H = worldRef.H;
      for (const [key, data] of worldRef.chunks ? worldRef.chunks.entries() : []) {
        let changed = false;
        for (let i = 0; i < data.length; i++) {
          if (data[i] === id) { data[i] = 0; changed = true; }
        }
        if (changed) worldRef.dirty.add(key);
      }
    }
    saveToStorage();
    applyToWorld();
    return true;
  }

  function removeAllMods() {
    const ids = listMods().map(e => e.id);
    for (const id of ids) removeMod(id);
    clearStorage();
    return ids.length;
  }

  /* 内置示例包：额外 6 种特色方块 */
  function loadBuiltin() {
    const tile = (paint) => {
      const c = document.createElement('canvas');
      c.width = Atlas.CONTENT; c.height = Atlas.CONTENT;
      const cx = c.getContext('2d');
      paint(cx, Atlas.CONTENT);
      return c;
    };
    const noise = (cx, base, amp, seed) => {
      for (let y = 0; y < Atlas.CONTENT; y++) for (let x = 0; x < Atlas.CONTENT; x++) {
        const v = (Noise.hash2(x, y, seed) - 0.5) * amp;
        cx.fillStyle = `rgb(${Math.min(255, Math.max(0, base[0] + v))},${Math.min(255, Math.max(0, base[1] + v))},${Math.min(255, Math.max(0, base[2] + v))})`;
        cx.fillRect(x, y, 1, 1);
      }
    };
    const specs = [
      { id: 100, name: '金块', c: [245, 200, 60], emissive: false, hardness: 2.5 },
      { id: 101, name: '钻石块', c: [90, 220, 230], emissive: true, hardness: 3.5 },
      { id: 102, name: '红石灯', c: [255, 80, 40], emissive: true, hardness: 1.2 },
      { id: 103, name: '紫水晶块', c: [180, 90, 230], emissive: false, hardness: 2.0 },
      { id: 104, name: '黑曜石', c: [60, 60, 70], emissive: false, hardness: Infinity },
      { id: 105, name: '西瓜', c: [40, 180, 80], emissive: false, hardness: 1.2 }
    ];
    for (const s of specs) {
      const tex = tile((cx) => noise(cx, s.c, 26, s.id * 31 + 7));
      registerBlock({ id: s.id, name: s.name, tiles: { top: tex, side: tex, bottom: tex }, emissive: s.emissive, hardness: s.hardness });
    }
    applyToWorld();
    return custom;
  }

  return { registerBlock, registerFromZip, loadBuiltin, bindWorld, getCustom: () => custom, saveToStorage, loadFromStorage, clearStorage, listMods, removeMod, removeAllMods };
})();
