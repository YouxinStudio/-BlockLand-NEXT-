/* =========================================================
 * net.js —— 局域网联机客户端（WebSocket）
 * ========================================================= */
class NetClient {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.ws = null;
    this.connected = false;
    this.name = '玩家' + Math.floor(Math.random() * 900 + 100);
    this.id = null;
    this.remote = new Map();   // id -> {name, group, pos, yaw, pitch}
    this.onConnect = null;
    this.onMessage = null;
    this.lastMove = 0;
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);
      } catch (e) { reject(e); return; }
      this.ws.onopen = () => { this.connected = true; if (this.onConnect) this.onConnect(); resolve(); };
      this.ws.onerror = (e) => { reject(new Error('无法连接服务器')); };
      this.ws.onclose = () => { this.connected = false; this.clearRemote(); };
      this.ws.onmessage = (ev) => this.handle(ev.data);
    });
  }

  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }

  handle(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    switch (msg.type) {
      case 'welcome':
        this.id = msg.you;
        if (msg.edits) for (const e of msg.edits) this.world.setBlock(e[0], e[1], e[2], e[3]);
        if (msg.players) for (const p of msg.players) this.addRemote(p);
        if (this.onMessage) this.onMessage(msg);
        break;
      case 'player-join': this.addRemote(msg); break;
      case 'player-leave': this.removeRemote(msg.id); break;
      case 'move': {
        const p = this.remote.get(msg.id);
        if (p) { p.pos = msg.pos; p.yaw = msg.yaw; p.pitch = msg.pitch; p.moving = msg.moving; }
        break;
      }
      case 'edit':
        this.world.setBlock(msg.x, msg.y, msg.z, msg.id);
        break;
    }
    if (this.onMessage && msg.type !== 'welcome') this.onMessage(msg);
  }

  join(name, pos, yaw, pitch) {
    this.name = name || this.name;
    this.send({ type: 'join', name: this.name, pos: [pos.x, pos.y, pos.z], yaw, pitch });
  }

  sendMove(pos, yaw, pitch, moving, onGround) {
    const now = performance.now();
    if (now - this.lastMove < 90) return;
    this.lastMove = now;
    this.send({ type: 'move', pos: [pos.x, pos.y, pos.z], yaw, pitch, moving, onGround });
  }

  sendEdit(x, y, z, id) { this.send({ type: 'edit', x, y, z, id }); }

  /* 远程玩家形象（简易方块人） */
  addRemote(p) {
    if (this.remote.has(p.id)) return;
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0xE9B45A });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat);
    head.position.y = 1.55;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.3), new THREE.MeshLambertMaterial({ color: 0x3A6EA5 }));
    body.position.y = 0.95;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.3), new THREE.MeshLambertMaterial({ color: 0x2C3E50 }));
    legs.position.y = 0.35;
    group.add(head, body, legs);
    group.position.set(p.pos[0], p.pos[1], p.pos[2]);
    this.scene.add(group);

    // 名牌
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, 256, 64);
    ctx.font = 'bold 34px sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText(p.name || '玩家', 128, 42);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.scale.set(2.2, 0.55, 1);
    sprite.position.y = 2.35;
    group.add(sprite);

    this.remote.set(p.id, { name: p.name, group, pos: new THREE.Vector3(...p.pos), yaw: p.yaw || 0, pitch: p.pitch || 0, moving: false });
  }

  removeRemote(id) {
    const r = this.remote.get(id);
    if (r) { this.scene.remove(r.group); this.remote.delete(id); }
  }
  clearRemote() {
    for (const id of [...this.remote.keys()]) this.removeRemote(id);
  }

  /* 更新远程玩家姿态（每帧） */
  update(dt) {
    for (const [, r] of this.remote) {
      r.group.position.lerp(r.pos, Math.min(1, dt * 12));
      r.group.rotation.y = r.yaw;
      // 简单行走摆动
      if (r.moving) r.group.children[1].position.y = 0.95 + Math.sin(performance.now() / 150) * 0.03;
    }
  }
}
