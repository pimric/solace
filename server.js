const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { makeLogger } = require('./logger');
const log = makeLogger('server');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const db = new sqlite3.Database(path.join(__dirname, 'solace.db'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

function broadcast(type, payload) {
  const msg = JSON.stringify({ type, ...payload });
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}
global.broadcast = broadcast;

// Snapshot complet (chargement initial)
app.get('/api/garden', (req, res) => {
  db.all('SELECT * FROM plants ORDER BY created_at ASC', [], (err, plants) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all('SELECT * FROM bots', [], (err2, bots) => {
      if (err2) return res.status(500).json({ error: err2.message });
      db.all('SELECT * FROM garden_resources', [], (err3, resources) => {
        if (err3) return res.status(500).json({ error: err3.message });
        const resourceMap = {};
        resources.forEach(r => resourceMap[r.key] = r.value);
        res.json({ plants, bots, resources: resourceMap });
      });
    });
  });
});

app.get('/api/stats', (req, res) => {
  db.get(`SELECT
    COUNT(*) as total,
    SUM(CASE WHEN is_alive=1 THEN 1 ELSE 0 END) as alive,
    SUM(CASE WHEN victim_type='civilian' THEN 1 ELSE 0 END) as civilians,
    SUM(CASE WHEN victim_type='combatant' THEN 1 ELSE 0 END) as combatants,
    COUNT(DISTINCT country_code) as countries
    FROM plants`, [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});

app.get('/api/weather', (req, res) => {
  db.all('SELECT * FROM weather_conditions', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Compat legacy
app.get('/api/garden/:country/:year', (req, res) => {
  const { country, year } = req.params;
  db.all(
    `SELECT * FROM plants WHERE country_code=? AND strftime('%Y', event_date)=?`,
    [country, String(year)],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ status: 'success', country, year, count: rows.length, data: rows });
    }
  );
});

wss.on('connection', ws => {
  log.info('ws client connected', { total: wss.clients.size });
  db.all('SELECT * FROM plants ORDER BY created_at ASC', [], (err, plants) => {
    if (err) return;
    db.all('SELECT * FROM bots', [], (err2, bots) => {
      if (err2) return;
      ws.send(JSON.stringify({ type: 'snapshot', plants, bots }));
    });
  });

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'water_plant' && msg.plant_id) {
        db.run(
          `UPDATE plants SET water_level=MIN(100, water_level+15) WHERE id=?`,
          [msg.plant_id]
        );
        broadcast('plant_watered', { plant_id: msg.plant_id, source: 'visitor' });
      }
    } catch {}
  });
});

// Snapshot HTML avec data inline (pour screenshot headless)
app.get('/snapshot', (req, res) => {
  db.all('SELECT pos_x,pos_z,stem_height,stem_curve,leaf_count,petal_count,primary_color,secondary_color,victim_type,is_alive FROM plants', [], (err, plants) => {
    if (err) return res.status(500).send(err.message);
    const data = JSON.stringify(plants);
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>*{margin:0;padding:0;}body{background:#080810;}canvas{display:block;}
#lbl{position:fixed;bottom:14px;left:18px;font:12px monospace;color:#c8b89a;opacity:.5;letter-spacing:3px;}</style>
</head><body><canvas id="c"></canvas><div id="lbl">solace</div>
<script>
const plants=${data};
const c=document.getElementById('c');
const ctx=c.getContext('2d');
c.width=1280;c.height=800;
ctx.fillStyle='#080810';ctx.fillRect(0,0,1280,800);
const GEO={xmin:30,xmax:97,zmin:14,zmax:50};
function toIso(lng,lat){
  const gx=((lng-GEO.xmin)/(GEO.xmax-GEO.xmin)-0.5)*160;
  const gz=((lat-GEO.zmin)/(GEO.zmax-GEO.zmin)-0.5)*80;
  return{sx:640+(gx-gz)*16,sy:400+(gx+gz)*8};
}
const sorted=plants.slice().sort((a,b)=>(a.pos_x+a.pos_z)-(b.pos_x+b.pos_z));
for(const p of sorted){
  const{sx,sy}=toIso(p.pos_x,p.pos_z);
  const alive = Number(p.is_alive) === 1;
  const h=Math.max(3,Math.floor((p.stem_height||1)*12));
  const curve=(p.stem_curve||0)*6;
  ctx.strokeStyle=alive?(p.primary_color||'#2d4a2d'):'#4a3a2a';
  ctx.globalAlpha=alive?0.9:0.35;ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+curve,sy-h);ctx.stroke();
  if(!alive)continue;
  ctx.fillStyle=p.secondary_color||'#3a5c3a';ctx.globalAlpha=0.85;
  const lc=Math.min(p.leaf_count||4,8);
  for(let i=0;i<lc;i++){const a=(i/lc)*Math.PI*2;ctx.fillRect(sx+curve+Math.cos(a)*3,sy-h*0.6+Math.sin(a)*2,2,2);}
  if(p.victim_type==='civilian'&&p.petal_count>0){
    ctx.fillStyle=p.primary_color||'#3a5c3a';ctx.globalAlpha=0.7;
    const pc=Math.min(p.petal_count,8);
    for(let i=0;i<pc;i++){const a=(i/pc)*Math.PI*2;ctx.fillRect(sx+curve+Math.cos(a)*2,sy-h+Math.sin(a)*2,1,1);}
  }
  if(p.victim_type==='civilian'&&p.stem_height<0.5){
    ctx.fillStyle='#5a7c5a';ctx.globalAlpha=0.18;
    ctx.beginPath();ctx.arc(sx+curve,sy-h,4,0,Math.PI*2);ctx.fill();
  }
}
ctx.globalAlpha=1;
<\/script></body></html>`);
  });
});

const gardenEngine = require('./gardenEngine');
gardenEngine.start(db, wss);

const PORT = process.env.PORT || 3000;
server.on('error', (err) => log.error('server error', { code: err.code, message: err.message }));
server.listen(PORT, () => {
  log.info(`listening port=${PORT}`);
});
