/* =========================================================
 * world.js —— 体素世界：生成、存取、网格构建
 * ========================================================= */
class World {
  constructor(seed) {
    this.seed = seed;
    this.CS = CFG.chunkSize;
    this.H = CFG.worldHeight;
    this.chunks = new Map();       // "cx,cz" -> Uint8Array
    this.meshes = new Map();       // "cx,cz" -> {solid, trans}
    this.dirty = new Set();        // "cx,cz" 待重建
    this.edits = new Map();        // "x,y,z" -> blockId（存档/联机）
    this.meta = new Map();         // "x,y,z" -> 数值（如小麦生长阶段）
    this.signs = new Map();        // "x,y,z" -> 告示牌文字
    this.flat = !!CFG.terrain.flat;
    this.biome = 'default';        // default / desert / snow
    this.scene = null;
    this.solidMat = null;
    this.transMat = null;
    this.solidGeoPool = [];
  }

  chunkKey(cx, cz) { return cx + ',' + cz; }
  posKey(x, y, z) { return x + ',' + y + ',' + z; }

  /* ---------- 地形生成 ---------- */
  generateChunkData(cx, cz) {
    const { CS, H, seed } = this;
    const data = new Uint8Array(CS * CS * H);
    const idx = (lx, ly, lz) => lx + lz * CS + ly * CS * CS;
    const biome = this.biome;

    for (let lx = 0; lx < CS; lx++) {
      for (let lz = 0; lz < CS; lz++) {
        const wx = cx * CS + lx, wz = cz * CS + lz;
        const n = Noise.fbm2(wx, wz, seed, 4, 2, 0.5);
        let h = this.flat ? CFG.seaLevel + 1 : Math.floor(CFG.terrain.base + n * CFG.terrain.amp);
        h = Math.max(1, Math.min(H - 4, h));

        // 生物群系决定表层和地下方块
        const surfaceBlock = biome === 'desert' ? 4 : (biome === 'snow' ? 13 : 1);
        const subSurfaceBlock = biome === 'desert' ? 4 : 2;
        const deepBlock = biome === 'desert' ? (h <= CFG.seaLevel + 1 ? 4 : 9) : 3;

        for (let ly = 0; ly < H; ly++) {
          const y = ly;
          if (ly === 0) { data[idx(lx, ly, lz)] = 12; continue; } // 基岩
          let id;
          if (ly < h) {
            if (!this.flat && ly < h - 4) {
              // 简单洞穴雕刻
              const cave = Noise.hash2(wx + ly * 37, wz, seed ^ 0x5a5a);
              id = (cave < 0.055 && ly > 2) ? 0 : deepBlock;
            } else if (ly < h - 1) {
              id = subSurfaceBlock;
            } else {
              id = this.flat ? 1 : (h <= CFG.seaLevel + 1 ? 4 : surfaceBlock);
            }
          } else if (ly <= CFG.seaLevel) {
            id = 5; // 水
          } else {
            id = 0;
          }
          data[idx(lx, ly, lz)] = id;
        }

        /* 植被：根据生物群系生成树/仙人掌 */
        if (h > CFG.seaLevel + 1) {
          const rng = Noise.mulberry32(wx * 73856093 ^ wz * 19349663 ^ seed);
          const treeChance = this.flat ? 0.004 : CFG.terrain.treeChance;
          if (biome === 'desert') {
            // 沙漠：仙人掌
            if (rng() < treeChance * 0.8) {
              const cactusH = 2 + Math.floor(rng() * 3);
              for (let i = 1; i <= cactusH; i++) {
                if (h + i < H - 2) data[idx(lx, h + i, lz)] = 23; // 南瓜当仙人掌（绿色）
              }
            }
          } else if (biome === 'snow') {
            // 雪原：云杉树（原木+雪叶）
            if (rng() < treeChance * 1.2) {
              const trunkH = 5 + Math.floor(rng() * 3);
              const topY = h + trunkH;
              for (let i = 1; i <= trunkH; i++) data[idx(lx, h + i, lz)] = 6;
              for (let dy = -3; dy <= 1; dy++) {
                const radius = dy < 0 ? 2 : 1;
                for (let dx = -radius; dx <= radius; dx++) {
                  for (let dz = -radius; dz <= radius; dz++) {
                    const y = topY + dy;
                    if (y >= H - 2) continue;
                    if (dx === 0 && dz === 0 && dy <= 0) continue;
                    if (Math.abs(dx) + Math.abs(dz) <= radius + 1 && rng() < 0.85) {
                      if (lx + dx >= 0 && lx + dx < CS && lz + dz >= 0 && lz + dz < CS)
                        if (data[idx(lx + dx, y, lz + dz)] === 0) data[idx(lx + dx, y, lz + dz)] = 13; // 雪块当树叶
                    }
                  }
                }
              }
            }
            // 雪原地面加雪层（表层已是雪块）
          } else {
            // 默认：橡树
            if (rng() < treeChance) {
              const trunkH = 4 + Math.floor(rng() * 3);
              const topY = h + trunkH;
              for (let i = 1; i <= trunkH; i++) data[idx(lx, h + i, lz)] = 6;
              for (let dy = -2; dy <= 1; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                  for (let dz = -2; dz <= 2; dz++) {
                    const y = topY + dy;
                    if (y >= H - 2) continue;
                    if (dx === 0 && dz === 0 && dy <= 0) continue;
                    const dist = Math.abs(dx) + Math.abs(dz) + Math.abs(dy > 0 ? dy : 0);
                    if (dist <= 3 && rng() < 0.9) {
                      if (lx + dx >= 0 && lx + dx < CS && lz + dz >= 0 && lz + dz < CS)
                        if (data[idx(lx + dx, y, lz + dz)] === 0) data[idx(lx + dx, y, lz + dz)] = 7;
                    }
                  }
                }
              }
              if (topY + 1 < H) data[idx(lx, topY + 1, lz)] = 7;
            }
          }
        }
      }
    }
    return data;
  }

  ensureChunk(cx, cz) {
    const key = this.chunkKey(cx, cz);
    let data = this.chunks.get(key);
    if (!data) {
      data = this.generateChunkData(cx, cz);
      // 应用已保存的编辑
      this.chunks.set(key, data);
      this.applyEditsToChunk(cx, cz, data);
    }
    return data;
  }

  applyEditsToChunk(cx, cz, data) {
    const { CS, H } = this;
    for (const [pk, id] of this.edits) {
      const [x, y, z] = pk.split(',').map(Number);
      const ccx = Math.floor(x / CS), ccz = Math.floor(z / CS);
      if (ccx === cx && ccz === cz && y >= 0 && y < H) {
        data[(x - cx * CS) + (z - cz * CS) * CS + y * CS * CS] = id;
      }
    }
  }

  getBlock(x, y, z) {
    if (y < 0) return 12;
    if (y >= this.H) return 0;
    const cx = Math.floor(x / this.CS), cz = Math.floor(z / this.CS);
    const data = this.ensureChunk(cx, cz);
    const lx = x - cx * this.CS, lz = z - cz * this.CS;
    return data[lx + lz * this.CS + y * this.CS * this.CS];
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= this.H) return false;
    const cx = Math.floor(x / this.CS), cz = Math.floor(z / this.CS);
    const data = this.ensureChunk(cx, cz);
    const lx = x - cx * this.CS, lz = z - cz * this.CS;
    const i = lx + lz * this.CS + y * this.CS * this.CS;
    if (data[i] === id) return false;
    data[i] = id;
    this.edits.set(this.posKey(x, y, z), id);
    this.meta.delete(this.posKey(x, y, z));
    if (id !== 112) this.signs.delete(this.posKey(x, y, z));
    this.markDirty(x, y, z);
    return true;
  }
  /* 方块元数据（小麦生长阶段等） */
  getMeta(x, y, z) { return this.meta.get(this.posKey(x, y, z)) || 0; }
  setMeta(x, y, z, v) {
    this.meta.set(this.posKey(x, y, z), v);
    this.markDirty(x, y, z);
  }
  setSignText(x, y, z, text) { if (text) this.signs.set(this.posKey(x, y, z), text); }
  getSignText(x, y, z) { return this.signs.get(this.posKey(x, y, z)) || ''; }

  removeEdit(x, y, z) { this.edits.delete(this.posKey(x, y, z)); }

  markDirty(x, y, z) {
    const cx = Math.floor(x / this.CS), cz = Math.floor(z / this.CS);
    this.dirty.add(this.chunkKey(cx, cz));
    const lx = x - cx * this.CS, lz = z - cz * this.CS;
    if (lx === 0) this.dirty.add(this.chunkKey(cx - 1, cz));
    if (lx === this.CS - 1) this.dirty.add(this.chunkKey(cx + 1, cz));
    if (lz === 0) this.dirty.add(this.chunkKey(cx, cz - 1));
    if (lz === this.CS - 1) this.dirty.add(this.chunkKey(cx, cz + 1));
  }

  /* ---------- 网格构建 ---------- */
  static faceDefs() {
    if (World._faces) return World._faces;
    // 每个面：法线，4 顶点，uv 序号
    const F = {
      px: { n: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
      nx: { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
      py: { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
      ny: { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
      pz: { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
      nz: { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] }
    };
    // 面->图块槽位（0 top, 1 side, 2 bottom）
    F.px.uv = 1; F.nx.uv = 1; F.py.uv = 0; F.ny.uv = 2; F.pz.uv = 1; F.nz.uv = 1;
    World._faces = F;
    return F;
  }

  faceVisible(me, neighbor) {
    if (neighbor === 0) return true;
    const meB = CFG.blockById(me), nbB = CFG.blockById(neighbor);
    if (!nbB) return true;
    if (nbB.opaque !== false && !nbB.transparent) return false; // 不透明邻居挡住
    if (me === neighbor) return false;  // 同类透明互相隐藏（树叶/玻璃/水）
    return true;
  }

  buildChunkMesh(cx, cz) {
    const { CS, H } = this;
    const data = this.ensureChunk(cx, cz);
    const F = World.faceDefs();
    const faceKeys = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
    const solids = { pos: [], uv: [], nor: [] };
    const trans = { pos: [], uv: [], nor: [] };
    const emissive = { pos: [], uv: [], nor: [] };
    const water = { pos: [], uv: [], nor: [] };
    const plantQuads = [
      { a: [0.15, 0, 0.15], b: [0.85, 0, 0.85], c: [0.85, 1, 0.85], d: [0.15, 1, 0.15], n: [0, 0, 1] },
      { a: [0.85, 0, 0.15], b: [0.15, 0, 0.85], c: [0.15, 1, 0.85], d: [0.85, 1, 0.15], n: [0, 0, -1] }
    ];
    const signQuads = [
      { a: [0.3, 0.32, 0.5], b: [0.7, 0.32, 0.5], c: [0.7, 1.0, 0.5], d: [0.3, 1.0, 0.5], n: [0, 0, 1] },
      { a: [0.45, 0.0, 0.5], b: [0.55, 0.0, 0.5], c: [0.55, 0.32, 0.5], d: [0.45, 0.32, 0.5], n: [0, 0, 1] }
    ];

    const offsets = {
      px: [1, 0, 0], nx: [-1, 0, 0], py: [0, 1, 0], ny: [0, -1, 0], pz: [0, 0, 1], nz: [0, 0, -1]
    };

    for (let ly = 0; ly < H; ly++) {
      for (let lz = 0; lz < CS; lz++) {
        for (let lx = 0; lx < CS; lx++) {
          const id = data[lx + lz * CS + ly * CS * CS];
          if (id === 0 || id === 5) continue; // 空气不画；水单独画
          const def = CFG.blockById(id);
          if (!def) continue;
          const wx = cx * CS + lx, wz = cz * CS + lz;
          if (!def.solid) {
            // 植物 / 告示牌：透明通道（双面 + alphaTest）
            if (def.plant || def.sign) {
              let tile = def.tiles;
              if (Array.isArray(tile)) {
                tile = def.plant ? tile[Math.min(this.getMeta(wx, ly, wz) || 0, tile.length - 1)] : tile[0];
              }
              const uv = Atlas.tileUV(tile);
              const u0 = uv[0], v0 = uv[1], u1 = uv[2], v1 = uv[3];
              const quads = def.sign ? signQuads : plantQuads;
              for (const q of quads) {
                const corners = [q.a, q.b, q.c, q.d];
                const uvc = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
                const tri = [0, 1, 2, 0, 2, 3];
                for (const ci of tri) {
                  const c = corners[ci], uc = uvc[ci];
                  trans.pos.push(wx + c[0], ly + c[1], wz + c[2]);
                  trans.uv.push(uc[0], uc[1]);
                  trans.nor.push(q.n[0], q.n[1], q.n[2]);
                }
              }
            }
            continue;
          }

          const transparent = def.transparent === true;
          const target = transparent ? trans : (def.emissive ? emissive : solids);

          for (const fk of faceKeys) {
            const off = offsets[fk];
            const nid = this.getBlock(wx + off[0], ly + off[1], wz + off[2]);
            if (!this.faceVisible(id, nid)) continue;
            const face = F[fk];
            let tile = def.tiles;
            if (Array.isArray(tile)) tile = tile[face.uv];
            const uv = Atlas.tileUV(tile);

            const uv00 = [uv[0], uv[1]];
            const uv10 = [uv[2], uv[1]];
            const uv11 = [uv[2], uv[3]];
            const uv01 = [uv[0], uv[3]];
            const corners = [
              { p: face.v[0], uv: uv00 }, { p: face.v[1], uv: uv10 },
              { p: face.v[2], uv: uv11 }, { p: face.v[3], uv: uv01 }
            ];
            const tri = [0, 1, 2, 0, 2, 3];
            for (const ci of tri) {
              const c = corners[ci];
              target.pos.push(wx + c.p[0], ly + c.p[1], wz + c.p[2]);
              target.uv.push(c.uv[0], c.uv[1]);
              target.nor.push(face.n[0], face.n[1], face.n[2]);
            }
          }
        }
      }
    }

    /* 水通道：与空气相邻的面可见 */
    for (let ly = 0; ly < H; ly++) {
      for (let lz = 0; lz < CS; lz++) {
        for (let lx = 0; lx < CS; lx++) {
          if (data[lx + lz * CS + ly * CS * CS] !== 5) continue;
          const wx = cx * CS + lx, wz = cz * CS + lz;
          const uv = Atlas.tileUV(5);
          const uv00 = [uv[0], uv[1]], uv10 = [uv[2], uv[1]], uv11 = [uv[2], uv[3]], uv01 = [uv[0], uv[3]];
          for (const fk of faceKeys) {
            const off = offsets[fk];
            const nid = this.getBlock(wx + off[0], ly + off[1], wz + off[2]);
            if (nid === 5) continue;          // 水对水隐藏
            if (nid !== 0) continue;          // 只画与空气相邻面（含水面）
            const face = F[fk];
            const corners = [
              { p: face.v[0], uv: uv00 }, { p: face.v[1], uv: uv10 },
              { p: face.v[2], uv: uv11 }, { p: face.v[3], uv: uv01 }
            ];
            const tri = [0, 1, 2, 0, 2, 3];
            for (const ci of tri) {
              const c = corners[ci];
              water.pos.push(wx + c.p[0], ly + c.p[1], wz + c.p[2]);
              water.uv.push(c.uv[0], c.uv[1]);
              water.nor.push(face.n[0], face.n[1], face.n[2]);
            }
          }
        }
      }
    }
    return {
      solidPos: solids.pos, solidUv: solids.uv, solidNor: solids.nor,
      transPos: trans.pos, transUv: trans.uv, transNor: trans.nor,
      emissivePos: emissive.pos, emissiveUv: emissive.uv, emissiveNor: emissive.nor,
      waterPos: water.pos, waterUv: water.uv, waterNor: water.nor
    };
  }

  makeGeometry(pos, uv, nor) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return g;
  }

  /* 更新一个区块的 Mesh（重建） */
  refreshChunk(cx, cz) {
    const key = this.chunkKey(cx, cz);
    const m = this.buildChunkMesh(cx, cz);

    let entry = this.meshes.get(key);
    if (!entry) {
      entry = { solid: null, trans: null, emissive: null, water: null };
      this.meshes.set(key, entry);
    }
    if (entry.solid) { this.scene.remove(entry.solid); entry.solid.geometry.dispose(); entry.solid = null; }
    if (entry.trans) { this.scene.remove(entry.trans); entry.trans.geometry.dispose(); entry.trans = null; }
    if (entry.emissive) { this.scene.remove(entry.emissive); entry.emissive.geometry.dispose(); entry.emissive = null; }
    if (entry.water) { this.scene.remove(entry.water); entry.water.geometry.dispose(); entry.water = null; }

    if (m.solidPos.length) {
      entry.solid = new THREE.Mesh(this.makeGeometry(m.solidPos, m.solidUv, m.solidNor), this.solidMat);
      this.scene.add(entry.solid);
    }
    if (m.transPos.length) {
      entry.trans = new THREE.Mesh(this.makeGeometry(m.transPos, m.transUv, m.transNor), this.transMat);
      this.scene.add(entry.trans);
    }
    if (m.emissivePos.length) {
      entry.emissive = new THREE.Mesh(this.makeGeometry(m.emissivePos, m.emissiveUv, m.emissiveNor), this.emissiveMat);
      this.scene.add(entry.emissive);
    }
    if (m.waterPos.length) {
      entry.water = new THREE.Mesh(this.makeGeometry(m.waterPos, m.waterUv, m.waterNor), this.waterMat);
      this.scene.add(entry.water);
    }
    this.dirty.delete(key);
  }

  unloadChunk(cx, cz) {
    const key = this.chunkKey(cx, cz);
    const entry = this.meshes.get(key);
    if (entry) {
      if (entry.solid) { this.scene.remove(entry.solid); entry.solid.geometry.dispose(); }
      if (entry.trans) { this.scene.remove(entry.trans); entry.trans.geometry.dispose(); }
      if (entry.emissive) { this.scene.remove(entry.emissive); entry.emissive.geometry.dispose(); }
      if (entry.water) { this.scene.remove(entry.water); entry.water.geometry.dispose(); }
      this.meshes.delete(key);
    }
    this.chunks.delete(key);
  }

  /* ---------- 玩家物理碰撞 ---------- */
  /* 判断 AABB [min,max] 是否与固体方块相交 */
  collides(px, py, pz, w, h) {
    const minX = Math.floor(px - w / 2), maxX = Math.floor(px + w / 2);
    const minY = Math.floor(py), maxY = Math.floor(py + h);
    const minZ = Math.floor(pz - w / 2), maxZ = Math.floor(pz + w / 2);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          const id = this.getBlock(x, y, z);
          if (CFG.isSolid(id)) return true;
        }
      }
    }
    return false;
  }

  /* 找到地表出生点 */
  findSpawn(x, z) {
    for (let y = this.H - 2; y > 0; y--) {
      const id = this.getBlock(Math.floor(x), y, Math.floor(z));
      if (CFG.isSolid(id)) return y + 1;
    }
    return this.H - 2;
  }
}
