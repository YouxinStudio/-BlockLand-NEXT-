/* =========================================================
 * BlockLand · 方块大陆 —— 共享规则配置（单一配置源）
 * ruleset_id: BL-1.0
 * ========================================================= */
const RULESET_ID = 'BL-1.0';
const CFG = {
  version: '1.0.0',
  gameTitle: '方块大陆 BlockLand',

  /* —— 世界 —— */
  chunkSize: 16,
  worldHeight: 64,        // 0..63
  seaLevel: 24,
  renderDistance: 4,      // 渲染半径（区块）
  seed: 20260828,         // 默认世界种子

  /* —— 地形参数 —— */
  terrain: {
    base: 22,
    amp: 14,
    freq: 0.006,
    treeChance: 0.012,    // 每列生成树概率
    caveChance: 0.05,     // 简单洞穴噪声阈值
    flat: false           // 超平坦世界（方便建房子）
  },

  /* —— 物理 / 移动 —— */
  move: {
    walk: 4.3,            // 步行速度 m/s
    sprint: 6.2,
    fly: 14.0,
    jump: 8.6,
    gravity: 26.0,
    reach: 6.0,           // 交互距离
    eye: 1.62,
    width: 0.6, height: 1.8
  },

  /* —— 生存参数 —— */
  survival: {
    startHealth: 20,
    fallDamageThreshold: 3.2,  // 超过该下落高度开始受伤
    fallDamagePerBlock: 1.0
  },

  /* —— 方块定义：tiles 为纹理图集索引 [top, side, bottom] 或统一值 —— */
  blocks: [
    { id: 0,  name: '空气',       solid: false, transparent: true,  opaque: false },
    { id: 1,  name: '草方块',     solid: true,  tiles: [0,1,2],  drop: 1, hardness: 0.8 },
    { id: 2,  name: '泥土',       solid: true,  tiles: 2,        drop: 2, hardness: 0.6 },
    { id: 3,  name: '石头',       solid: true,  tiles: 3,        drop: 3, hardness: 2.2 },
    { id: 4,  name: '沙',         solid: true,  tiles: 4,        drop: 4, hardness: 0.6 },
    { id: 5,  name: '水',         solid: false, tiles: 5, transparent: true, opacity: 0.65, drop: null, hardness: Infinity },
    { id: 6,  name: '原木',       solid: true,  tiles: [6,7,6],  drop: 6, hardness: 2.0 },
    { id: 7,  name: '树叶',       solid: true,  tiles: 8, transparent: true, drop: 7, hardness: 0.3 },
    { id: 8,  name: '木板',       solid: true,  tiles: 9,        drop: 8, hardness: 1.6 },
    { id: 9,  name: '圆石',       solid: true,  tiles: 10,       drop: 9, hardness: 2.4 },
    { id: 10, name: '玻璃',       solid: true,  tiles: 11, transparent: true, drop: null, hardness: 0.4 },
    { id: 11, name: '沙砾',       solid: true,  tiles: 12,       drop: 11, hardness: 0.7 },
    { id: 12, name: '基岩',       solid: true,  tiles: 13,       drop: null, hardness: Infinity },
    { id: 13, name: '雪块',       solid: true,  tiles: 14,       drop: 13, hardness: 0.4 },
    { id: 14, name: '砖块',       solid: true,  tiles: 15,       drop: 14, hardness: 2.0 },
    { id: 15, name: '红色羊毛',   solid: true,  tiles: 16,       drop: 15, hardness: 0.6 },
    { id: 16, name: '蓝色羊毛',   solid: true,  tiles: 17,       drop: 16, hardness: 0.6 },
    { id: 17, name: '绿色羊毛',   solid: true,  tiles: 18,       drop: 17, hardness: 0.6 },
    { id: 18, name: '黄色羊毛',   solid: true,  tiles: 19,       drop: 18, hardness: 0.6 },
    { id: 19, name: '黑色羊毛',   solid: true,  tiles: 20,       drop: 19, hardness: 0.6 },
    { id: 20, name: '萤石',       solid: true,  tiles: 21, emissive: true, drop: 20, hardness: 0.4 },
    { id: 21, name: '书架',       solid: true,  tiles: [22,23,22], drop: 21, hardness: 1.8 },
    { id: 22, name: '苔石',       solid: true,  tiles: 24,       drop: 22, hardness: 2.2 },
    { id: 23, name: '南瓜',       solid: true,  tiles: [25,26,25], drop: 23, hardness: 1.0 }
  ],
  /* —— 热键栏槽位（默认放行方块；100+ 为内置模组方块，可在方块面板切换）—— */
  hotbarDefaults: [1, 2, 3, 6, 8, 10, 110, 111, 112]
};
/* 农业 / 告示牌（按 id 索引存放，避免与数组下标冲突） */
CFG.blocks[110] = { id: 110, name: '耕地',   solid: true,  tiles: [27, 2, 2], drop: 2,   hardness: 0.5 };
CFG.blocks[111] = { id: 111, name: '小麦',   solid: false, plant: true, tiles: [28, 29, 30, 31], drop: 111, hardness: 0.2 };
CFG.blocks[112] = { id: 112, name: '告示牌', solid: false, sign: true, tiles: 9, drop: 112, hardness: 0.5 };

/* 工具函数：按 id 取方块定义 */
CFG.blockById = (id) => CFG.blocks[id] || null;
CFG.isSolid = (id) => CFG.blocks[id] ? !!CFG.blocks[id].solid : false;
CFG.isOpaque = (id) => CFG.blocks[id] ? (CFG.blocks[id].opaque !== false) : false;
CFG.isTransparentRender = (id) => CFG.blocks[id] ? !!CFG.blocks[id].transparent : false;
CFG.isEmissive = (id) => CFG.blocks[id] ? !!CFG.blocks[id].emissive : false;
