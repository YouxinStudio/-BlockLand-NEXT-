/* =========================================================
 * BlockLand 局域网联机服务器
 * 用法：npm install && node server.js   （默认端口 8081）
 * 玩家在游戏中输入 ws://本机IP:8081 加入
 * ========================================================= */
const { WebSocketServer } = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8081;
const MAX_EDITS = 200000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('BlockLand Server running on port ' + PORT + '\n');
});

const wss = new WebSocketServer({ server });

const players = new Map();   // id -> {name, pos, yaw, pitch, moving, onGround}
const edits = [];            // [x,y,z,id]
let nextId = 1;

function broadcast(obj, except) {
  const msg = JSON.stringify(obj);
  for (const ws of wss.clients) {
    if (except && ws.id === except) continue;
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

wss.on('connection', (ws) => {
  const id = nextId++;
  ws.id = id;
  ws.send(JSON.stringify({
    type: 'welcome',
    you: id,
    edits,
    players: [...players.entries()].map(([pid, p]) => ({ id: pid, ...p }))
  }));
  broadcast({ type: 'player-join', id, name: '新玩家', pos: [8, 40, 8], yaw: 0, pitch: 0 }, id);

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;

    switch (m.type) {
      case 'join': {
        players.set(id, {
          name: (m.name || '玩家').toString().slice(0, 12),
          pos: Array.isArray(m.pos) ? m.pos : [8, 40, 8],
          yaw: +m.yaw || 0, pitch: +m.pitch || 0,
          moving: false, onGround: true
        });
        broadcast({ type: 'player-join', id, ...players.get(id) });
        break;
      }
      case 'move': {
        const p = players.get(id);
        if (!p) break;
        p.pos = Array.isArray(m.pos) ? m.pos : p.pos;
        p.yaw = +m.yaw || p.yaw;
        p.pitch = +m.pitch || p.pitch;
        p.moving = !!m.moving;
        p.onGround = !!m.onGround;
        broadcast({ type: 'move', id, pos: p.pos, yaw: p.yaw, pitch: p.pitch, moving: p.moving }, id);
        break;
      }
      case 'edit': {
        const x = Math.floor(+m.x), y = Math.floor(+m.y), z = Math.floor(+m.z), bid = Math.floor(+m.id);
        if (y < 0 || y >= 64 || bid < 0 || bid > 255) break;
        edits.push([x, y, z, bid]);
        if (edits.length > MAX_EDITS) edits.splice(0, edits.length - MAX_EDITS);
        broadcast({ type: 'edit', x, y, z, id: bid });
        break;
      }
    }
  });

  ws.on('close', () => {
    players.delete(id);
    broadcast({ type: 'player-leave', id });
  });
});

server.listen(PORT, () => {
  console.log('====================================');
  console.log('  方块大陆 BlockLand 联机服务器已启动');
  console.log('  端口:', PORT);
  console.log('  本机地址: ws://' + getLocalIP() + ':' + PORT);
  console.log('  同一局域网玩家在游戏内输入该地址加入');
  console.log('====================================');
});

function getLocalIP() {
  const os = require('os');
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}
