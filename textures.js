/* =========================================================
 * textures.js —— 程序化生成像素纹理图集（16×16 图块，8 列）
 * 布局：每个图块 cell = 18×18（内容 16×16 + 1px 边框复制），
 *       用于消除 mipmap 采样时的图块间渗色。
 * ========================================================= */
const Atlas = (() => {
  const CONTENT = 16;   // 内容像素
  const CELL = 18;      // 单元像素（含边框）
  const B = 1;          // 边框宽度
  const COLS = 8;       // 每行图块数

  function makeCanvas(rows) {
    const c = document.createElement('canvas');
    c.width = COLS * CELL;
    c.height = rows * CELL;
    return c;
  }

  let rows = 6;   // 初始预留 6 行（27 基础 + 内置模组 18 tile），避免运行期 resize 破坏 GPU 纹理
  const canvas = makeCanvas(rows);
  const ctx = canvas.getContext('2d');

  function tileRng(idx) { return Noise.mulberry32(0xABCD + idx * 7919); }

  function setPx(d, x, y, r, g, b, a = 255) {
    if (x < 0 || y < 0 || x >= CONTENT || y >= CONTENT) return;
    const i = (y * CONTENT + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
  }

  function speckle(d, base, rng, amp = 18) {
    for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) {
      const n = Math.floor(rng() * amp) - amp / 2;
      setPx(d, x, y, base[0] + n, base[1] + n, base[2] + n, 255);
    }
  }

  function noiseTexture(d, base, rng, amp = 22) {
    for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) {
      const v = (Noise.hash2(x, y, Math.floor(rng() * 9999)) - 0.5) * amp;
      setPx(d, x, y, base[0] + v, base[1] + v, base[2] + v, 255);
    }
  }

  const TILES = {};
  TILES[0] = (d, rng) => { for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) { const v = (Noise.hash2(x, y, 77) - 0.5) * 26; setPx(d, x, y, 90 + v, 160 + v, 62 + v, 255); } };
  TILES[1] = (d, rng) => { for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) { const v = (Noise.hash2(x, y, 88) - 0.5) * 22; if (y < 3) setPx(d, x, y, 95 + v, 165 + v, 66 + v, 255); else if (y === 3) setPx(d, x, y, 118 + v, 138 + v, 70 + v, 255); else setPx(d, x, y, 130 + v, 96 + v, 60 + v, 255); } };
  TILES[2] = (d, rng) => { for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) { const v = (Noise.hash2(x, y, 99) - 0.5) * 30; setPx(d, x, y, 134 + v, 98 + v, 63 + v, 255); } };
  TILES[3] = (d, rng) => { noiseTexture(d, [120, 120, 122], rng, 26); for (let i = 0; i < 4; i++) { const x = Math.floor(rng() * CONTENT), y = Math.floor(rng() * CONTENT); setPx(d, x, y, 90, 90, 92, 255); setPx(d, (x + 1) % CONTENT, y, 92, 92, 94, 255); setPx(d, x, (y + 1) % CONTENT, 96, 96, 98, 255); } };
  TILES[4] = (d, rng) => noiseTexture(d, [219, 205, 152], rng, 20);
  TILES[5] = (d, rng) => { for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) { const v = (Noise.hash2(x, y, 555) - 0.5) * 20; setPx(d, x, y, 48 + v, 100 + v, 220 + v, 255); } };
  TILES[6] = (d, rng) => { const cx = 7.5, cy = 7.5; for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) { const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2); const ring = (Math.sin(dist * 2.2) + 1) / 2; const v = (Noise.hash2(x, y, 611) - 0.5) * 24; const b = 158 + v - ring * 40; setPx(d, x, y, b + 20, b - 10, b - 30, 255); } };
  TILES[7] = (d, rng) => { for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) { const v = (Noise.hash2(x, y, 712) - 0.5) * 28; const stripe = (Math.sin(x * 1.1 + Math.floor(y / 4)) * 0.5 + 0.5) * 30; setPx(d, x, y, 112 + v + stripe, 86 + v + stripe * 0.7, 54 + v, 255); } };
  TILES[8] = (d, rng) => { for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) { if (Noise.hash2(x, y, 813) < 0.24) { setPx(d, x, y, 0, 0, 0, 0); continue; } const v = (Noise.hash2(x, y, 814) - 0.5) * 34; setPx(d, x, y, 62 + v, 128 + v, 40 + v, 255); } };
  TILES[9] = (d, rng) => { for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) { const v = (Noise.hash2(x, y, 915) - 0.5) * 18; const plank = (Math.sin(x * 2.0 + (Math.floor(y / 4) % 2) * 0.7)) * 12; setPx(d, x, y, 186 + v + plank, 152 + v + plank * 0.6, 98 + v, 255); } };
  TILES[10] = (d, rng) => { for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) { const cell = Math.floor(x / 4) + Math.floor(y / 4) * 4; const v = (Noise.hash2(x, y, cell * 31 + 10) - 0.5) * 30; setPx(d, x, y, 122 + v, 122 + v, 124 + v, 255); } };
  TILES[11] = (d, rng) => { for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) { const edge = x === 0 || y === 0 || x === CONTENT - 1 || y === CONTENT - 1; if (edge) setPx(d, x, y, 210, 228, 235, 200); else setPx(d, x, y, 180, 210, 225, 40); } };
  TILES[12] = (d, rng) => { for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) { const g = 100 + Math.floor(rng() * 60); setPx(d, x, y, g, g - 8, g - 14, 255); } };
  TILES[13] = (d, rng) => { for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) { const v = (Noise.hash2(x, y, 1313) - 0.5) * 40; setPx(d, x, y, 62 + v, 62 + v, 66 + v, 255); } };
  TILES[14] = (d, rng) => noiseTexture(d, [244, 246, 252], rng, 14);
  TILES[15] = (d, rng) => { for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) { const row = Math.floor(y / 4), off = row % 2 ? 4 : 0; const brick = Math.floor((x + off) / 8); if ((x + off) % 8 === 0 || y % 4 === 0) setPx(d, x, y, 208, 205, 200, 255); else setPx(d, x, y, 160 + (brick % 2) * 14, 82 + (brick % 2) * 8, 60, 255); } };
  const WOOL = [[210, 60, 60], [70, 90, 220], [90, 190, 90], [240, 210, 70], [40, 40, 40]];
  for (let i = 0; i < 5; i++) TILES[16 + i] = ((col) => (d, rng) => { for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) { const v = (Noise.hash2(x, y, 1600 + col * 17) - 0.5) * 20; setPx(d, x, y, col[0] + v, col[1] + v, col[2] + v, 255); } })(WOOL[i]);
  TILES[21] = (d, rng) => { for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) { const v = (Noise.hash2(x, y, 2121) - 0.5) * 30; setPx(d, x, y, 240 + v, 220 + v, 150 + v, 255); } };
  TILES[22] = (d, rng) => { for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) { const v = (Noise.hash2(x, y, 2222) - 0.5) * 16; setPx(d, x, y, 150 + v, 116 + v, 76 + v, 255); } };
  TILES[23] = (d, rng) => { for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) { if (y < 3 || y > 12) setPx(d, x, y, 152, 120, 80, 255); else if (x < 2 || x > 13) setPx(d, x, y, 110, 84, 56, 255); else { const book = [200, 90, 70, 70, 90, 200, 200, 200, 90, 70, 90, 200][(x - 2 + y) % 12]; const v = (Noise.hash2(x, y, 2323) - 0.5) * 12; setPx(d, x, y, book + v, book * 0.4 + v, book * 0.4 + v, 255); } } };
  TILES[24] = (d, rng) => { for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) { const v = (Noise.hash2(x, y, 2424) - 0.5) * 30; if (Noise.hash2(x, y, 2425) < 0.3) setPx(d, x, y, 90 + v * 0.5, 150 + v * 0.5, 80, 255); else setPx(d, x, y, 122 + v, 122 + v, 124 + v, 255); } };
  TILES[25] = (d, rng) => { for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) { const v = (Noise.hash2(x, y, 2525) - 0.5) * 16; if ((x - 7) ** 2 + (y - 7) ** 2 < 6) setPx(d, x, y, 130 + v, 110 + v, 40 + v, 255); else setPx(d, x, y, 224 + v, 140 + v, 30 + v, 255); } };
  TILES[26] = (d, rng) => { for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) { const v = (Noise.hash2(x, y, 2626) - 0.5) * 14; const stripe = (Math.sin(x * 0.9) * 0.5 + 0.5) * 40; setPx(d, x, y, 224 - stripe * 0.3 + v, 140 + v, 30 + v, 255); } };
  /* —— 农田 / 小麦 —— */
  TILES[27] = (d, rng) => { for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) { const v = (Noise.hash2(x, y, 2727) - 0.5) * 22; const furrow = (y % 3 === 1) ? -30 : 0; setPx(d, x, y, 116 + v + furrow, 84 + v + furrow * 0.8, 52 + v, 255); } };
  /* 小麦 4 阶段：0 幼苗 1 青苗 2 抽穗 3 成熟（金色） */
  function wheatSprite(d, stage) {
    const col = stage < 3 ? [118, 200, 66] : [232, 196, 66];
    for (let y = 0; y < CONTENT; y++) for (let x = 0; x < CONTENT; x++) setPx(d, x, y, 0, 0, 0, 0);
    const h = [4, 7, 10, 14][stage];
    const stem = (ox, top) => { for (let i = 0; i < top; i++) { const y = 15 - i; if (y >= 0 && y < 16) { setPx(d, ox, y, col[0], col[1], col[2], 255); setPx(d, ox + 1, y, col[0] - 18, col[1] - 8, col[2] - 10, 255); } } };
    stem(6, h); stem(9, Math.max(2, h - 2));
    // 叶/穗
    for (let i = 1; i < h; i += 2) {
      const y = 15 - i, s = stage >= 2 ? 1 : 0;
      setPx(d, 6 - i % 2 - s, y, col[0] + 20, col[1] + 10, col[2] - 20, 255);
      setPx(d, 10 + i % 2 + s, y, col[0] + 20, col[1] + 10, col[2] - 20, 255);
    }
    if (stage >= 2) { setPx(d, 5, 15 - h + 1, col[0], col[1], col[2], 255); setPx(d, 10, 15 - h + 1, col[0], col[1], col[2], 255); }
    if (stage >= 3) { for (let dx = 4; dx <= 11; dx++) { const y = 15 - h + 2; setPx(d, dx, y, 240, 210, 80, 255); setPx(d, dx, y + 1, 210, 180, 60, 255); } }
  }
  TILES[28] = (d, rng) => wheatSprite(d, 0);
  TILES[29] = (d, rng) => wheatSprite(d, 1);
  TILES[30] = (d, rng) => wheatSprite(d, 2);
  TILES[31] = (d, rng) => wheatSprite(d, 3);

  /* 图块坐标 → cell 像素坐标 */
  function cellPos(idx) {
    return { col: idx % COLS, row: Math.floor(idx / COLS) };
  }

  /* 写入单个 tile（含边框复制）到图集 */
  function paintTile(idx, data) {
    const { col, row } = cellPos(idx);
    const ox = col * CELL, oy = row * CELL;
    // 内容区
    ctx.putImageData(data, ox + B, oy + B);
    // 边框复制
    for (let i = 0; i < CONTENT; i++) {
      const l = ctx.getImageData(ox + B + i, oy + B, 1, 1).data;
      const r = ctx.getImageData(ox + B + i, oy + B + CONTENT - 1, 1, 1).data;
      // 上/下边
      ctx.fillStyle = `rgba(${l[0]},${l[1]},${l[2]},${l[3] / 255})`; ctx.fillRect(ox + B + i, oy, 1, B);
      ctx.fillStyle = `rgba(${r[0]},${r[1]},${r[2]},${r[3] / 255})`; ctx.fillRect(ox + B + i, oy + B + CONTENT, 1, B);
      const t = ctx.getImageData(ox + B, oy + B + i, 1, 1).data;
      const b = ctx.getImageData(ox + B + CONTENT - 1, oy + B + i, 1, 1).data;
      ctx.fillStyle = `rgba(${t[0]},${t[1]},${t[2]},${t[3] / 255})`; ctx.fillRect(ox, oy + B + i, B, 1);
      ctx.fillStyle = `rgba(${b[0]},${b[1]},${b[2]},${b[3] / 255})`; ctx.fillRect(ox + B + CONTENT, oy + B + i, B, 1);
    }
    // 四角
    for (const [dx, dy] of [[0, 0], [CONTENT + B, 0], [0, CONTENT + B], [CONTENT + B, CONTENT + B]]) {
      const c = ctx.getImageData(ox + B + (dx ? CONTENT - 1 : 0), oy + B + (dy ? CONTENT - 1 : 0), 1, 1).data;
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`;
      ctx.fillRect(ox + dx, oy + dy, B, B);
    }
  }

  /* 生成全部基础图块 */
  for (const idxStr of Object.keys(TILES)) {
    const idx = parseInt(idxStr, 10);
    const rng = tileRng(idx);
    const d = ctx.createImageData(CONTENT, CONTENT);
    TILES[idx](d.data, rng);
    paintTile(idx, d);
  }

  function ensureHeight(idx) {
    const needRows = Math.floor(idx / COLS) + 1;
    if (needRows > rows) {
      rows = needRows;
      const tmp = document.createElement('canvas');
      tmp.width = canvas.width;
      tmp.height = rows * CELL;
      tmp.getContext('2d').drawImage(canvas, 0, 0);
      canvas.width = tmp.width;
      canvas.height = rows * CELL;
      ctx.drawImage(tmp, 0, 0);
    }
  }

  function makeTexture() {
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    api.texture = tex;
    return tex;
  }

  /* 给定图块索引，返回内容区 UV [u0,v0,u1,v1] */
  function tileUV(idx) {
    const { col, row } = cellPos(idx);
    const W = COLS * CELL, H = rows * CELL;
    const u0 = (col * CELL + B) / W;
    const v0 = 1 - (row * CELL + B + CONTENT) / H;
    const u1 = (col * CELL + B + CONTENT) / W;
    const v1 = 1 - (row * CELL + B) / H;
    return [u0, v0, u1, v1];
  }

  /* 动态追加自定义图块（模组），image 为 16×16 内容图 */
  function addTile(image, idx) {
    ensureHeight(idx);
    const tmp = document.createElement('canvas');
    tmp.width = CONTENT; tmp.height = CONTENT;
    const tctx = tmp.getContext('2d');
    tctx.imageSmoothingEnabled = false;
    tctx.drawImage(image, 0, 0, CONTENT, CONTENT);
    const data = tctx.getImageData(0, 0, CONTENT, CONTENT);
    paintTile(idx, data);
  }

  /* 生成快捷栏图标 canvas（24×24） */
  function icon(idx, size = 24) {
    const { col, row } = cellPos(idx);
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.drawImage(canvas, col * CELL + B, row * CELL + B, CONTENT, CONTENT, 0, 0, size, size);
    return c;
  }

  const api = {
    canvas, CONTENT, CELL, COLS, B,
    texture: null,
    tileUV, makeTexture, addTile, icon,
    tileCount: Object.keys(TILES).length
  };
  return api;
})();
