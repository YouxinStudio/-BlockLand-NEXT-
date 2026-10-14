/* =========================================================
 * player.js —— 玩家：物理、移动、交互（射线拾取）
 * ========================================================= */
class Player {
  constructor(world, camera) {
    this.world = world;
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.flying = false;          // 创造模式飞行
    this.mode = 'creative';       // creative | survival
    this.health = CFG.survival.startHealth;
    this.fallStartY = null;
    this.inventory = new Map();   // blockId -> count（生存模式）
    this.hotbar = CFG.hotbarDefaults.slice();
    this.selSlot = 0;
    this.dead = false;

    const s = CFG.move;
    this.w = s.width; this.h = s.height;
  }

  get eyeY() { return this.pos.y + CFG.move.eye; }

  /* 设置出生点 */
  spawn(x, z) {
    const y = this.world.findSpawn(x, z);
    this.pos.set(x + 0.5, y, z + 0.5);
    this.vel.set(0, 0, 0);
    this.health = CFG.survival.startHealth;
    this.dead = false;
    this.fallStartY = this.pos.y;
  }

  /* ---------- 碰撞 ---------- */
  collides(x, y, z) { return this.world.collides(x, y, z, this.w, this.h); }

  /* ---------- 主更新 ---------- */
  update(dt, input) {
    if (this.dead) return;
    const w = this.w, h = this.h;
    const CFGm = CFG.move;

    /* 朝向 */
    this.yaw += input.lookDX * 0.0032;
    this.pitch += input.lookDY * 0.0032;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));

    /* 移动方向 */
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, Math.sin(this.yaw));
    let mx = 0, mz = 0;
    if (input.forward) { mx += forward.x; mz += forward.z; }
    if (input.back) { mx -= forward.x; mz -= forward.z; }
    if (input.right) { mx += right.x; mz += right.z; }
    if (input.left) { mx -= right.x; mz -= right.z; }
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }

    const sprint = input.sprint && (input.forward || input.back) && len > 0;
    const speed = this.flying ? CFGm.fly : (sprint ? CFGm.sprint : CFGm.walk);

    /* 水平速度平滑 */
    this.vel.x += (mx * speed - this.vel.x) * Math.min(1, dt * 12);
    this.vel.z += (mz * speed - this.vel.z) * Math.min(1, dt * 12);

    /* 垂直 */
    if (this.flying) {
      let vy = 0;
      if (input.jump) vy = CFGm.fly;
      if (input.crouch) vy = -CFGm.fly;
      this.vel.y += (vy - this.vel.y) * Math.min(1, dt * 10);
      this.onGround = false;
    } else {
      this.vel.y -= CFGm.gravity * dt;
      if (input.jump && this.onGround) { this.vel.y = CFGm.jump; this.onGround = false; }
    }

    /* 积分 + 逐轴碰撞 */
    this.moveAxis(0, this.vel.x * dt);
    this.moveAxis(1, this.vel.y * dt);
    this.moveAxis(2, this.vel.z * dt);

    /* 坠落伤害 */
    if (!this.flying) {
      if (!this.onGround) {
        if (this.fallStartY === null) this.fallStartY = this.pos.y;
      } else {
        if (this.fallStartY !== null) {
          const fall = this.fallStartY - this.pos.y;
          this.fallStartY = null;
          if (this.mode === 'survival' && fall > CFG.survival.fallDamageThreshold) {
            const dmg = Math.round((fall - CFG.survival.fallDamageThreshold) * CFG.survival.fallDamagePerBlock);
            if (dmg > 0) this.damage(dmg);
          }
        }
      }
    }
  }

  moveAxis(axis, delta) {
    const w = this.w, h = this.h;
    let x = this.pos.x, y = this.pos.y, z = this.pos.z;
    const eps = 0.001;

    if (axis === 0) {
      const nx = x + delta;
      if (!this.collides(nx, y, z)) { this.pos.x = nx; return; }
      if (delta > 0) this.pos.x = Math.floor(nx + w / 2) - w / 2 - eps;
      else this.pos.x = Math.ceil(nx - w / 2) + w / 2 + eps;
      this.vel.x = 0;
    } else if (axis === 1) {
      const ny = y + delta;
      if (!this.collides(x, ny, z)) { this.pos.y = ny; if (delta < 0) this.onGround = false; return; }
      if (delta < 0) {
        // 落地：找脚下最高的固体顶面
        let top = -Infinity;
        const minX = Math.floor(x - w / 2), maxX = Math.floor(x + w / 2);
        const minZ = Math.floor(z - w / 2), maxZ = Math.floor(z + w / 2);
        const minY = Math.floor(ny), maxY = Math.floor(ny + h);
        for (let yy = minY; yy <= maxY; yy++)
          for (let xx = minX; xx <= maxX; xx++)
            for (let zz = minZ; zz <= maxZ; zz++)
              if (CFG.isSolid(this.world.getBlock(xx, yy, zz))) top = Math.max(top, yy + 1);
        if (top > -Infinity) { this.pos.y = top; this.onGround = true; this.vel.y = 0; }
      } else {
        let bottom = Infinity;
        const minX = Math.floor(x - w / 2), maxX = Math.floor(x + w / 2);
        const minZ = Math.floor(z - w / 2), maxZ = Math.floor(z + w / 2);
        const minY = Math.floor(ny), maxY = Math.floor(ny + h);
        for (let yy = minY; yy <= maxY; yy++)
          for (let xx = minX; xx <= maxX; xx++)
            for (let zz = minZ; zz <= maxZ; zz++)
              if (CFG.isSolid(this.world.getBlock(xx, yy, zz))) bottom = Math.min(bottom, yy);
        if (bottom < Infinity) { this.pos.y = bottom - h - eps; this.vel.y = 0; }
      }
    } else {
      const nz = z + delta;
      if (!this.collides(x, y, nz)) { this.pos.z = nz; return; }
      if (delta > 0) this.pos.z = Math.floor(nz + w / 2) - w / 2 - eps;
      else this.pos.z = Math.ceil(nz - w / 2) + w / 2 + eps;
      this.vel.z = 0;
    }
  }

  /* ---------- 交互 ---------- */
  raycast(maxDist) {
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const reach = maxDist || CFG.move.reach;
    /* 体素 DDA 步进 */
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const stepX = dir.x > 0 ? 1 : -1, stepY = dir.y > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1;
    const tDeltaX = Math.abs(1 / (dir.x || 1e-9)), tDeltaY = Math.abs(1 / (dir.y || 1e-9)), tDeltaZ = Math.abs(1 / (dir.z || 1e-9));
    let tMaxX = ((dir.x > 0 ? x + 1 - origin.x : origin.x - x) || 0) * tDeltaX;
    let tMaxY = ((dir.y > 0 ? y + 1 - origin.y : origin.y - y) || 0) * tDeltaY;
    let tMaxZ = ((dir.z > 0 ? z + 1 - origin.z : origin.z - z) || 0) * tDeltaZ;
    let face = [0, 0, 0];
    let t = 0;
    for (let i = 0; i < 128 && t <= reach; i++) {
      const id = this.world.getBlock(x, y, z);
      if (id !== 0 && id !== 5) {
        return { x, y, z, id, face, t, hit: true };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; face = [-stepX, 0, 0]; }
      else if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; face = [0, -stepY, 0]; }
      else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = [0, 0, -stepZ]; }
    }
    return { hit: false };
  }

  /* 破坏方块（返回掉落方块 id 或 null） */
  breakBlock(target) {
    const def = CFG.blockById(target.id);
    if (!def || def.hardness === Infinity) return null;
    const old = target.id;
    if (this.world.setBlock(target.x, target.y, target.z, 0)) {
      if (this.mode === 'survival' && def.drop != null) this.give(def.drop, 1);
      return old;
    }
    return null;
  }

  /* 放置方块 */
  placeBlock(target, blockId) {
    const nx = target.x + target.face[0];
    const ny = target.y + target.face[1];
    const nz = target.z + target.face[2];
    if (ny < 0 || ny >= this.world.H) return false;
    // 不能放在自己身上
    const px = this.pos.x, py = this.pos.y, pz = this.pos.z;
    const overlap = nx + 1 > px - this.w / 2 && nx < px + this.w / 2 &&
      ny + 1 > py && ny < py + this.h &&
      nz + 1 > pz - this.w / 2 && nz < pz + this.w / 2;
    if (overlap) return false;
    const def = CFG.blockById(blockId);
    if (!def) return false;
    if (this.world.getBlock(nx, ny, nz) !== 0) return false;
    if (this.world.setBlock(nx, ny, nz, blockId)) {
      if (this.mode === 'survival' && !this.consume(blockId)) {
        // 无库存则撤销
        this.world.setBlock(nx, ny, nz, 0);
        return false;
      }
      return true;
    }
    return false;
  }

  give(id, n) {
    if (id == null) return;
    this.inventory.set(id, (this.inventory.get(id) || 0) + n);
  }
  consume(id) {
    const c = this.inventory.get(id) || 0;
    if (c <= 0) return false;
    if (c === 1) this.inventory.delete(id); else this.inventory.set(id, c - 1);
    return true;
  }
  selBlock() { return this.hotbar[this.selSlot]; }

  damage(n) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - n);
    if (this.health <= 0) this.dead = true;
  }
  heal(n) { if (!this.dead) this.health = Math.min(CFG.survival.startHealth, this.health + n); }
}
