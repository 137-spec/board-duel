// 战斗界面：地图棋盘 + 左侧状态/移动 + 右侧技能
// 范围规范：本格含范围→2=本体 3=范围；本格不含→1=本体 2=范围
// 苍特殊：1=攻击范围 2=吸附范围；1与中心0也为吸附范围，中心0也是攻击范围
(function () {
  var PREFIX = '《咒术回战》系列角色：';

  function displayName(key) {
    return key.indexOf(PREFIX) === 0 ? key.slice(PREFIX.length) : key;
  }
  function readyChars() {
    return Object.keys(CHARACTERS).filter(function (k) {
      var c = CHARACTERS[k];
      return c && c.kind !== 'empty';
    });
  }

  /* ---------- 读取出战配置（无配置时用默认演示数据） ---------- */
  var cfg = null;
  try { cfg = JSON.parse(sessionStorage.getItem('boardBattle') || 'null'); } catch (e) { cfg = null; }
  if (!cfg) {
    var chars = readyChars();
    var specials = Object.keys(SPECIALS).filter(function (k) { return SPECIALS[k] && SPECIALS[k].kind !== 'empty'; });
    var assists = Object.keys(ASSISTS).filter(function (k) { return ASSISTS[k] && ASSISTS[k].kind !== 'empty'; });
    cfg = {
      map: '50x50',
      player: chars[0] || null,
      enemy: chars[chars.length - 1] || null,
      special: specials[0] || null,
      assists: assists.slice(0, 2)
    };
  }
  if (!cfg.player || !cfg.enemy) { window.location.href = 'game.html'; return; }

  /* ---------- 通用规则 ---------- */
  // 每轮可移动格数 = 6 + 角色等级（最高按5级）
  function moveCapOf(key) {
    var c = CHARACTERS[key];
    var lv = (c && c.level) || 0;
    return 6 + Math.min(lv, 5);
  }
  // 代表字
  var REP_CHARS = { '五条悟': '五', '伏黑惠': '惠', '虎杖悠人': '悠', '宿傩': '傩', '乙骨优太': '乙', '伏黑甚尔': '甚' };
  function repChar(key) {
    var base = displayName(key).split('（')[0];
    return REP_CHARS[base] || base.charAt(0);
  }
  function nameShort(key) {
    return displayName(key).split('（')[0];
  }

  /* ---------- 技能效果表（数值取自角色设计 txt） ---------- */
  function rangeKeyFor(skillName) {
    if (skillName === '普攻') return '普攻范围';
    return displayName(cfg.player) + skillName; // 如 五条悟（青年高专）苍
  }
  var CANG_AREA_KEY = displayName(cfg.player) + '“苍”范围'; // 文件名使用中文弯引号
  var SKILL_EFFECTS = {
    '普攻': { type: 'attack', dmg: 25, rangeKey: '普攻范围' },
    '赫（自爆）': { type: 'hemi', dmg: 120, selfDmg: 75, rangeKey: rangeKeyFor('赫（自爆）') },
    '苍（最大功率）': { type: 'aoe', dmg: 350, rangeKey: rangeKeyFor('苍（最大功率）'), needOp: 6 },
    '苍（定点）': { type: 'placeCang', rangeKey: rangeKeyFor('苍（定点）') },
    '苍': { type: 'placeCang', rangeKey: rangeKeyFor('苍') }
  };

  /* ---------- 范围解析 ----------
     返回：{own:[x,y], cells:[[dx,dy],...]} relative to own */
  function parseRangeGrid(g) {
    if (!g || !g.length) return null;
    var ones = [], twos = [], threes = [];
    for (var y = 0; y < g.length; y++) {
      for (var x = 0; x < g[y].length; x++) {
        var v = g[y][x];
        if (v === 1) ones.push([x, y]);
        else if (v === 2) twos.push([x, y]);
        else if (v === 3) threes.push([x, y]);
      }
    }
    var own = null, range = [];
    if (threes.length) { // 本格含范围：2=本体 3=范围
      own = twos.length === 1 ? twos[0] : (twos[twos.length - 1] || null);
      range = threes;
    } else if (twos.length) { // 本格不含范围：1=本体 2=范围
      own = ones.length === 1 ? ones[0] : null;
      range = twos;
    }
    if (!own) return null;
    var seen = {};
    var cells = [];
    range.forEach(function (c) {
      var dx = c[0] - own[0], dy = c[1] - own[1];
      var k = dx + ',' + dy;
      if (!seen[k]) { seen[k] = true; cells.push([dx, dy]); }
    });
    return { own: own, cells: cells };
  }
  /* 苍特殊范围：1=攻击 2=吸附；1与中心0也算吸附；中心0也算攻击
     中心定位：取攻击区(1)的包围盒中点（图案对称，比扫内部0更可靠） */
  function parseCangArea(key) {
    var g = SKILL_RANGES[key];
    if (!g || !g.length) return null;
    var ones = [], twos = [];
    for (var y = 0; y < g.length; y++) {
      for (var x = 0; x < g[y].length; x++) {
        var v = g[y][x];
        if (v === 1) ones.push([x, y]);
        else if (v === 2) twos.push([x, y]);
      }
    }
    if (!ones.length && !twos.length) return null;
    var xs1 = ones.map(function (c) { return c[0]; });
    var ys1 = ones.map(function (c) { return c[1]; });
    var centerX, centerY;
    if (ones.length) {
      centerX = Math.round((Math.min.apply(null, xs1) + Math.max.apply(null, xs1)) / 2);
      centerY = Math.round((Math.min.apply(null, ys1) + Math.max.apply(null, ys1)) / 2);
    } else {
      var xs2 = twos.map(function (c) { return c[0]; });
      var ys2 = twos.map(function (c) { return c[1]; });
      centerX = Math.round((Math.min.apply(null, xs2) + Math.max.apply(null, xs2)) / 2);
      centerY = Math.round((Math.min.apply(null, ys2) + Math.max.apply(null, ys2)) / 2);
    }
    var center = [centerX, centerY];
    function off(c) { return [c[0] - center[0], c[1] - center[1]]; }
    var attack = [off(center)];   // 中心0也是攻击范围
    var attract = [off(center)];  // 中心0也是吸附范围
    ones.forEach(function (c) { attack.push(off(c)); attract.push(off(c)); });
    twos.forEach(function (c) { attract.push(off(c)); });
    return { center: center, attack: attack, attract: attract };
  }

  var rangeCache = {};
  function getRange(key) {
    // 严格精确匹配（文件名带“ - 副本”等前缀后缀的未写好的范围图不当作正式范围）
    if (!(key in rangeCache)) {
      rangeCache[key] = SKILL_RANGES[key] ? parseRangeGrid(SKILL_RANGES[key]) : null;
    }
    return rangeCache[key];
  }
  var cangArea = parseCangArea(CANG_AREA_KEY);

  /* ---------- 对局状态 ---------- */
  var mapData = GAME_MAPS[cfg.map] || GAME_MAPS['50x50'];
  var W = mapData[0].length, H = mapData.length;
  var state = {
    round: 1,
    ap: 1,
    sp: 1,
    op: 2,                          // 奥义点（开局2，命中+1，上限6）
    movedThisRound: 0,
    moveCap: moveCapOf(cfg.player),
    selected: 'player',
    dirIndex: 0,
    uni: { attack: false, block: false },  // 通用技能每轮各1次
    infinity: 0,                    // 「无限」状态剩余轮数（无下限术式·敌方攻击无法命中/无法靠近）
    domExtend: false,               // 「领域展延」·本轮受伤-30%·期间无法使用其余技能
    usedSkill: false,               // 使用技能后本轮不可再移动/放技能
    specialUsedRound: 0,
    assistUsedRound: {},
    turn: 'player',
    gameOver: false,
    enemyAttractNoted: false,
    maha: null,                     // 场上魔虚罗（援助召唤）
    aiming: null,                   // {name, cells:[{x,y}]}
    cang: null,                     // 场上“苍” {x,y}
    player: {
      key: cfg.player,
      x: 10, y: 10,
      hp: (CHARACTERS[cfg.player].hp || 800),
      shield: 0
    },
    enemy: {
      key: cfg.enemy,
      x: W - 11, y: H - 11,
      hp: (CHARACTERS[cfg.enemy].hp || 800),
      shield: 0
    }
  };
  var DIRS = [
    { dx: 0, dy: -1, label: '上' },  // 0 基准方向（范围文件默认朝上）
    { dx: 1, dy: 0, label: '右' },   // 1
    { dx: 0, dy: 1, label: '下' },   // 2
    { dx: -1, dy: 0, label: '左' }   // 3
  ];

  /* ---------- 工具 ---------- */
  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3000);
  }
  function isSelfSkill(name, detail) {
    if (NO_RANGE_SKILLS[name]) return true;
    var d = detail || '';
    if (/范围|格子|目标|敌人/.test(d)) return false;
    return /自[己身]/.test(d);
  }
  var NO_RANGE_SKILLS = { '苍（瞬）': true };
  function charSkillList(key) {
    var c = CHARACTERS[key];
    if (!c || c.kind === 'empty') return [];
    return c.skills.filter(function (s) {
      var n = s.name.replace(/[（(].*$/, '');
      return n !== '普攻' && n !== '格挡';
    });
  }
  function inBounds(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }

  /* ---------- 技能点消耗（按角色设定解析；六眼被动→消耗变为1） ---------- */
  var CN_NUM = { '一': 1, '两': 2, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
  function spCostOf(text) {
    if (!text) return 0;
    // 匹配“消耗两个技能点/消耗三点技能点”这类写法（个/点均可）
    var m = /消耗([一两二三四五六七八九十\d]+)[个点]?技能点/.exec(text);
    if (!m) return 0;
    var s = m[1];
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    var total = 0;
    for (var i = 0; i < s.length; i++) total += (CN_NUM[s.charAt(i)] || 0);
    return total;
  }
  function hasSixEyes(key) {
    var c = CHARACTERS[key];
    return c && c.passives && c.passives.some(function (p) { return /六眼/.test(p); });
  }
  // 一个技能的最终技能点消耗：0级规则——若技能本身有消耗且角色有六眼 → 变为1
  function costFor(name) {
    if (name === '普攻' || name === '格挡') return 0;
    if (name === '特技') return 0; // 特技消耗奥义点
    var own = charSkillList(cfg.player);
    for (var i = 0; i < own.length; i++) {
      if (own[i].name === name) {
        var c = spCostOf(own[i].detail || '');
        if (c > 0 && hasSixEyes(cfg.player)) return 1;
        return c;
      }
    }
    return 0;
  }

  function isEnemyAt(x, y) { return state.enemy.x === x && state.enemy.y === y; }
  function isPlayerAt(x, y) { return state.player.x === x && state.player.y === y; }
  function applyDamage(u, amount) {
    var dmg = Math.round(amount); // 规则：伤害存在小数时四舍五入保留个位数
    var shield = u.shield || 0;
    if (shield > 0) {
      var absorb = Math.min(shield, dmg);
      u.shield = shield - absorb;
      dmg -= absorb;
    }
    u.hp = Math.max(0, u.hp - dmg);
    return dmg;
  }
  function checkEnd() {
    if (state.gameOver) return;
    if (state.player.hp <= 0) gameOver('💀 你被击败了……（' + nameShort(cfg.enemy) + ' 获胜）');
    else if (state.enemy.hp <= 0) gameOver('🏆 胜利！' + nameShort(cfg.player) + ' 击败了 ' + nameShort(cfg.enemy) + '！');
  }
  function gameOver(msg) {
    state.gameOver = true;
    state.aiming = null;
    var box = document.getElementById('game-over');
    document.getElementById('game-over-msg').textContent = msg;
    box.classList.remove('hidden');
    draw();
    renderStatus();
    toast(msg);
  }

  /* ---------- 画布渲染（白底黑线 + 拖动平移） ---------- */
  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');
  var CELL = 26;
  var camX = 0, camY = 0;
  var mapPxW = W * CELL, mapPxH = H * CELL;
  // 小地图
  var mmCanvas = document.getElementById('minimap');
  var mmCtx = mmCanvas.getContext('2d');
  var MM = Math.max(2, Math.min(4, Math.floor(180 / Math.max(W, H))));
  mmCanvas.width = W * MM;
  mmCanvas.height = H * MM;
  function drawMinimap() {
    mmCtx.fillStyle = '#f4f4f4';
    mmCtx.fillRect(0, 0, mmCanvas.width, mmCanvas.height);
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (mapData[y][x] !== 0) {
          mmCtx.fillStyle = '#8a5a26';
          mmCtx.fillRect(x * MM, y * MM, MM, MM);
        }
      }
    }
    if (state.cang) {
      mmCtx.fillStyle = '#2b1a6b';
      mmCtx.fillRect(state.cang.x * MM, state.cang.y * MM, MM, MM);
    }
    if (state.maha) {
      mmCtx.fillStyle = '#d4a017';
      mmCtx.fillRect(state.maha.x * MM, state.maha.y * MM, MM, MM);
    }
    mmCtx.fillStyle = '#ff5252';
    mmCtx.fillRect(state.enemy.x * MM, state.enemy.y * MM, MM, MM);
    mmCtx.fillStyle = '#3f8cff';
    mmCtx.fillRect(state.player.x * MM, state.player.y * MM, MM, MM);
  }

  function resize() {
    var box = canvas.parentElement;
    canvas.width = Math.max(50, box.clientWidth - 4);
    canvas.height = Math.max(50, box.clientHeight - 4);
    centerCam();
    draw();
  }
  function clampCam() {
    var maxX = mapPxW - canvas.width, maxY = mapPxH - canvas.height;
    camX = maxX <= 0 ? (mapPxW - canvas.width) / 2 : Math.max(0, Math.min(maxX, camX));
    camY = maxY <= 0 ? (mapPxH - canvas.height) / 2 : Math.max(0, Math.min(maxY, camY));
  }
  function centerCam() {
    camX = (state.player.x + 0.5) * CELL - canvas.width / 2;
    camY = (state.player.y + 0.5) * CELL - canvas.height / 2;
    clampCam();
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    var x0 = Math.max(0, Math.floor(camX / CELL));
    var y0 = Math.max(0, Math.floor(camY / CELL));
    var x1 = Math.min(W - 1, Math.ceil((camX + canvas.width) / CELL));
    var y1 = Math.min(H - 1, Math.ceil((camY + canvas.height) / CELL));
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var v = mapData[y][x];
        if (v !== 0) {
          ctx.fillStyle = '#8a5a26';
          ctx.fillRect(x * CELL - camX + 1, y * CELL - camY + 1, CELL - 2, CELL - 2);
        }
      }
    }
    // 苍的区域提示（吸附=蓝 攻击=红）
    if (state.cang && cangArea) {
      cangArea.attract.forEach(function (o) {
        var px = (state.cang.x + o[0]) * CELL - camX, py = (state.cang.y + o[1]) * CELL - camY;
        if (px > -CELL && py > -CELL && px < canvas.width + CELL && py < canvas.height + CELL) {
          ctx.fillStyle = 'rgba(80,170,255,.22)';
          ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
        }
      });
      cangArea.attack.forEach(function (o) {
        var px = (state.cang.x + o[0]) * CELL - camX, py = (state.cang.y + o[1]) * CELL - camY;
        if (px > -CELL && py > -CELL && px < canvas.width + CELL && py < canvas.height + CELL) {
          ctx.fillStyle = 'rgba(255,80,80,.30)';
          ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
        }
      });
    }
    // 瞄准高亮
    if (state.aiming) {
      state.aiming.cells.forEach(function (c) {
        var px = c.x * CELL - camX, py = c.y * CELL - camY;
        if (px > -CELL && py > -CELL && px < canvas.width + CELL && py < canvas.height + CELL) {
          ctx.fillStyle = isEnemyAt(c.x, c.y) ? 'rgba(255,120,0,.55)' : 'rgba(60,220,120,.45)';
          ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
        }
      });
    }
    // 网格线
    ctx.strokeStyle = 'rgba(0,0,0,.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = x0; i <= x1 + 1; i++) {
      var sx = i * CELL - camX;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, canvas.height);
    }
    for (var j = y0; j <= y1 + 1; j++) {
      var sy = j * CELL - camY;
      ctx.moveTo(0, sy);
      ctx.lineTo(canvas.width, sy);
    }
    ctx.stroke();
    drawCang();
    drawUnit(state.player, '#3f8cff', '#eaf4ff');
    drawUnit(state.enemy, '#ff5252', '#ffecec');
    drawMaha();
    drawMinimap();
  }
  function drawMaha() {
    if (!state.maha) return;
    var cx = (state.maha.x + 0.5) * CELL - camX, cy = (state.maha.y + 0.5) * CELL - camY;
    if (cx < -24 || cy < -24 || cx > canvas.width + 24 || cy > canvas.height + 24) return;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = '#d4a017'; // 金色=魔虚罗
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.min(15, Math.round(CELL * 0.52)) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('魔', cx, cy);
  }
  function drawCang() {
    if (!state.cang) return;
    var cx = (state.cang.x + 0.5) * CELL - camX, cy = (state.cang.y + 0.5) * CELL - camY;
    if (cx < -24 || cy < -24 || cx > canvas.width + 24 || cy > canvas.height + 24) return;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#2b1a6b';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.max(10, Math.round(CELL * 0.5)) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('苍', cx, cy);
  }
  function drawUnit(u, fill, textColor) {
    var cx = (u.x + 0.5) * CELL - camX, cy = (u.y + 0.5) * CELL - camY;
    if (cx < -24 || cy < -24 || cx > canvas.width + 24 || cy > canvas.height + 24) return;
    var r = CELL * 0.42;
    var isSel = (state.selected === 'player' && u === state.player) ||
      (state.selected === 'enemy' && u === state.enemy);
    if (isSel) {
      ctx.beginPath();
      ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff9500';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = textColor;
    ctx.font = 'bold ' + Math.min(15, Math.round(CELL * 0.52)) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(repChar(u.key), cx, cy);
  }

  /* ---------- 状态区块 ---------- */
  function renderStatus() {
    var u = state.selected === 'player' ? state.player : state.enemy;
    var c = CHARACTERS[u.key];
    var html = '';
    html += '<div class="stat-line"><span class="label">当前角色</span><b>' + nameShort(u.key) +
      (state.selected === 'player' ? '（我方）' : '（敌方）') + '</b></div>';
    html += '<div class="stat-line"><span class="label">等级</span><b>' + (c.level || '—') + '</b></div>';
    html += '<div class="hp-bar-wrap"><div class="hp-bar' + (state.selected === 'enemy' ? ' enemy' : '') + '" style="width:' +
      Math.max(0, Math.min(100, u.hp / (c.hp || 1) * 100)) + '%"></div></div>';
    html += '<div class="stat-line"><span class="label">血量</span><b>' + u.hp + ' / ' + (c.hp || '—') + '</b></div>';
    if (state.selected === 'player') {
      html += '<div class="stat-line"><span class="label">行动点</span><span class="dots">'
        + (state.ap > 0 ? '●' : '○') + '（剩余步数 ' + Math.max(0, state.moveCap - state.movedThisRound) + '/' + state.moveCap + '）</span></div>';
      html += '<div class="stat-line"><span class="label">移动上限</span><b>6+等级' + ((c && c.level) || 0) + ' = ' + state.moveCap + ' 格</b></div>';
      html += '<div class="stat-line"><span class="label">技能点</span><span class="dots">'
        + '●'.repeat(state.sp) + '○'.repeat(3 - state.sp) + ' ' + state.sp + '/3</span></div>';
      html += '<div class="stat-line"><span class="label">奥义点</span><span class="dots">'
        + '●'.repeat(state.op) + '○'.repeat(6 - state.op) + ' ' + state.op + '/6</span></div>';
      html += '<div class="stat-line"><span class="label">回合</span><b>' + (state.turn === 'player' ? '我方行动' : '敌方行动') + '</b></div>';
    }
    html += '<div class="pad-label">目前持有状态</div><div class="chips">';
    var chips = [];
    if (u.shield > 0) chips.push('🛡 护盾 ' + u.shield);
    if (state.cang) chips.push('🌀 场上有「苍」');
    if (state.selected === 'player') {
      if (state.usedSkill) chips.push('🚫 已用技能·不可移动');
      if (state.infinity > 0) chips.push('🌀 无限（剩 ' + state.infinity + ' 轮）·敌方攻击无法命中/无法靠近');
      if (state.domExtend) chips.push('🔰 领域展延·受伤-30%·无法使用其余技能');
      if (state.maha) {
        var adText = [];
        Object.keys(state.maha.adapts).forEach(function (k) {
          var ad = state.maha.adapts[k];
          adText.push(ad.done ? ('已适应「' + k + '」') : ('适应中「' + k + '」剩' + ad.left + '轮'));
        });
        chips.push('🌀 魔虚罗 ' + state.maha.hp + '/600（剩' + state.maha.roundsLeft + '轮' + (adText.length ? ' · ' + adText.join('；') : '') + '）');
      }
      if (state.specialUsedRound > 0 && state.round - state.specialUsedRound < 2) chips.push('⏳ 特技冷却中');
      (cfg.assists || []).forEach(function (k) {
        var last = state.assistUsedRound[k] || 0;
        if (last > 0) {
          var remain = 7 - (state.round - last);
          if (remain > 0) chips.push('⏳ 「' + (ASSISTS[k] ? ASSISTS[k].name : k) + '」冷却中(剩' + remain + '轮)');
        }
      });
    }
    html += (chips.length ? chips.join('') : '<span class="chip">无额外状态</span>') + '</div>';
    var passives = c.passives || [];
    if (passives.length) {
      html += '<div class="pad-label">被动</div><div class="chips">';
      passives.forEach(function (p) {
        html += '<span class="chip" title="' + p.replace(/"/g, '&quot;') + '">' + p.slice(0, 12) + (p.length > 12 ? '…' : '') + '</span>';
      });
      html += '</div>';
    }
    document.getElementById('status-body').innerHTML = html;
    renderEnemyStrip();
  }

  /* ---------- 敌方血条（顶部常驻） ---------- */
  function renderEnemyStrip() {
    var e = state.enemy;
    var c = CHARACTERS[cfg.enemy];
    document.getElementById('enemy-name').textContent = nameShort(cfg.enemy) + '（LV' + (c.level || '—') + '）';
    document.getElementById('enemy-hp-bar').style.width =
      Math.max(0, Math.min(100, e.hp / (c.hp || 1) * 100)) + '%';
    document.getElementById('enemy-hp-text').textContent = e.hp + '/' + (c.hp || '—');
  }

  /* ---------- 移动 ---------- */
  function movePlayer(dx, dy) {
    if (state.turn !== 'player' || state.gameOver) return;
    if (state.usedSkill) { toast('🚫 使用技能后本轮不可再进行移动'); return; }
    var u = state.player;
    var nx = u.x + dx, ny = u.y + dy;
    if (!inBounds(nx, ny)) { toast('⚠ 到达地图边界'); return; }
    if (mapData[ny][nx] !== 0) { toast('⚠ 该格有障碍物'); return; }
    // 允许与敌方同格、与苍重叠（战棋可堆叠规则）
    if (state.movedThisRound >= state.moveCap || state.ap <= 0) { toast('⚠ 本轮步数已用完'); return; }
    u.x = nx; u.y = ny;
    state.movedThisRound++;
    if (state.movedThisRound >= state.moveCap) state.ap = 0;
    draw();
    renderStatus();
    toast('我方移动到 (' + nx + ',' + ny + ') 剩余 ' + Math.max(0, state.moveCap - state.movedThisRound) + ' 步');
  }

  /* ---------- 技能 ---------- */
  function useSelfSkill(name, hint) {
    toast('「' + name + '」对自身使用：直接生效，无需范围与方向' + (hint ? '（' + hint + '）' : ''));
  }
  function useRangeSkill(name, extra) {
    var dir = DIRS[state.dirIndex];
    toast('「' + name + '」技能范围尚未编写 —— 已记录释放朝向：' + dir.label + (extra ? '（' + extra + '）' : ''));
  }

  function startAiming(name) {
    var eff = SKILL_EFFECTS[name];
    if (!eff || !eff.rangeKey) { useRangeSkill(name); return; }
    var info = getRange(eff.rangeKey);
    if (!info) { toast('没有找到「' + name + '」的范围数据（请到技能范围临时文件里编写）'); return; }
    var cells = [];
    info.cells.forEach(function (o) {
      // 范围随“技能释放方向轮盘”旋转（定向技能如苍·最大功率生效）
      var dx = o[0], dy = o[1];
      for (var k = 0; k < state.dirIndex; k++) { var t = dx; dx = -dy; dy = t; }
      var x = state.player.x + dx, y = state.player.y + dy;
      if (inBounds(x, y)) cells.push({ x: x, y: y });
    });
    // 与敌方同格时，本格也算可攻击目标（堆叠规则）
    if (isEnemyAt(state.player.x, state.player.y)) cells.push({ x: state.player.x, y: state.player.y });
    state.aiming = { name: name, cells: cells, eff: eff };
    draw();
    toast('「' + name + '」瞄准中（朝向：' + DIRS[state.dirIndex].label + '）—— 点击高亮格释放，点空白处取消');
  }

  function earnOp() {
    state.op = Math.min(6, state.op + 1); // 技能命中获得奥义点
  }

  function executeCast(cell) {
    var aim = state.aiming;
    if (!aim) return;
    var eff = aim.eff;
    var name = aim.name;

    // 前置校验（不满足则保持瞄准并返回）
    if (eff.needOp && state.op < eff.needOp) {
      toast('⚠ 「' + name + '」奥义点不足（需要 ' + eff.needOp + '，当前 ' + state.op + '）');
      return;
    }
    if (name === '普攻' && state.uni.attack) {
      toast('⚠ 普攻本轮已使用过（每轮 1 次）');
      return;
    }
    if (eff.type === 'attack' && !isEnemyAt(cell.x, cell.y)) {
      toast('请瞄准敌人（范围内没有敌人）');
      return;
    }

    // 技能点结算（按角色设定；六眼→1）
    var cost = costFor(name);
    if (state.sp < cost) {
      toast('⚠ 技能点不足（「' + name + '」需要 ' + cost + ' 点，当前 ' + state.sp + '）');
      return;
    }
    state.sp -= cost;

    state.aiming = null;
    state.usedSkill = true; // 用技能后本轮不可再移动（但可继续放技能）
    if (name === '普攻') state.uni.attack = true;

    if (eff.type === 'attack') {
      if (eff.needOp) state.op = 0; // 大招消耗全部奥义点
      var dmg = applyDamage(state.enemy, eff.dmg);
      earnOp();
      toast('⚔️「' + name + '」命中！对 ' + nameShort(cfg.enemy) + ' 造成 ' + dmg + ' 点伤害（' + (state.sp > 0 ? '消耗 ' + cost + ' 技能点' : '未消耗技能点') + '）');
      checkEnd();
    } else if (eff.type === 'hemi') {
      var selfDmg = (state.infinity > 0) ? 0 : applyDamage(state.player, eff.selfDmg);
      var enemyHit = isEnemyAt(cell.x, cell.y);
      var enemyDmg = enemyHit ? applyDamage(state.enemy, eff.dmg) : 0;
      if (enemyHit) earnOp();
      toast('💥「' + name + '」自身受到 ' + selfDmg + ' 伤害' + (state.infinity > 0 ? '（「无限」使自身伤害无效）' : '') + (enemyHit ? '，对 ' + nameShort(cfg.enemy) + ' 造成 ' + enemyDmg + ' 伤害' : '（范围内没有敌人）') + '，消耗 ' + cost + ' 技能点');
      checkEnd();
    } else if (eff.type === 'aoe') {
      // 苍（最大功率）：定向范围，对范围内所有目标造成伤害
      if (eff.needOp) state.op = 0; // 大招消耗全部奥义点
      var inside = aim.cells.some(function (c) { return c.x === state.enemy.x && c.y === state.enemy.y; });
      if (inside) {
        var dd = applyDamage(state.enemy, eff.dmg);
        earnOp();
        toast('🌋「' + name + '」轰击！对范围内所有目标造成 ' + dd + ' 点伤害（' + nameShort(cfg.enemy) + ' 被命中）');
      } else {
        toast('🌋「' + name + '」轰击范围（朝向 ' + DIRS[state.dirIndex].label + '），敌人不在范围内');
      }
      checkEnd();
    } else if (eff.type === 'placeCang') {
      var replaced = !!state.cang;
      state.cang = { x: cell.x, y: cell.y };
      var msg = '🌀「' + name + '」在 (' + cell.x + ',' + cell.y + ') 生成「苍」！' + (replaced ? '（替换掉了原来的「苍」）' : '') + (cost > 0 ? '消耗 ' + cost + ' 技能点' : '');
      if (cangArea) {
        var inside = cangArea.attack.some(function (o) { return state.enemy.x === state.cang.x + o[0] && state.enemy.y === state.cang.y + o[1]; });
        if (inside) {
          var d = applyDamage(state.enemy, 75);
          earnOp();
          msg += ' 敌人刚进入伤害范围，受到 ' + d + ' 点伤害！';
        }
      }
      toast(msg);
      checkEnd();
    }
    draw();
    renderStatus();
    renderSkills();
  }

  /* ---------- 技能列表 ---------- */
  function renderSkills() {
    var list = document.getElementById('skill-list');
    var html = '';
    html += '<div class="skill-group-title">通用技能</div>';
    var atkUsed = state.uni.attack, blkUsed = state.uni.block;
    html += '<button class="skill-btn" data-skill="普攻">⚔️ 普攻<span class="cd">' + (atkUsed ? '本轮已用' : '可释放 · 25伤害') + '</span></button>';
    html += '<button class="skill-btn" data-skill="格挡">🛡 格挡<span class="cd">' + (blkUsed ? '本轮已用' : '可释放 · 25护盾') + '</span></button>';

    if (cfg.special) {
      var s = SPECIALS[cfg.special];
      var cooling = state.specialUsedRound > 0 && state.round - state.specialUsedRound < 2;
      html += '<div class="skill-group-title">特技（需要奥义点）</div>';
      html += '<button class="skill-btn" data-skill="特技">✨ ' + (s ? s.name : cfg.special) +
        '<span class="cd' + (cooling ? ' cooling' : '') + '">' + (cooling ? '冷却中' : '可用 · CD1轮') + '</span></button>';
    }
    if (cfg.assists && cfg.assists.length) {
      html += '<div class="skill-group-title">援助（不消耗奥义点）</div>';
      cfg.assists.forEach(function (k) {
        var a = ASSISTS[k];
        var last = state.assistUsedRound[k] || 0;
        var remain = last > 0 ? 7 - (state.round - last) : 0;
        html += '<button class="skill-btn" data-skill="援助" data-key="' + k + '">🛡 ' + (a ? a.name : k) +
          '<span class="cd' + (remain > 0 ? ' cooling' : '') + '">' + (remain > 0 ? '冷却中剩' + remain + '轮' : '可用 · CD7轮') + '</span></button>';
      });
    }
    var own = charSkillList(cfg.player);
    if (own.length) {
      html += '<div class="skill-group-title">角色技能（' + nameShort(cfg.player) + '）</div>';
      own.forEach(function (sk) {
        var eff = SKILL_EFFECTS[sk.name];
        var hasRange = eff && eff.rangeKey && getRange(eff.rangeKey);
        var self = isSelfSkill(sk.name, sk.detail);
        var badge;
        if (hasRange) badge = eff.needOp ? '大招·需奥义点' : '可释放';
        else if (self) badge = '无范围';
        else badge = '范围待定';
        html += '<button class="skill-btn" data-skill="char" data-name="' + sk.name.replace(/"/g, '&quot;') + '">' +
          sk.name + '<span class="cd">' + badge + '</span></button>';
      });
    }
    list.innerHTML = html;
  }

  function listClick(list) {
    list.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.skill-btn') : null;
      if (!btn) return;
      if (state.gameOver) return;
      if (state.turn !== 'player') { toast('⏳ 现在是敌方回合，请稍候'); return; }
      var kind = btn.getAttribute('data-skill');

      if (state.domExtend) {
        toast('🔰 领域展延生效中：无法使用其余技能（持续至本轮结束）');
        return;
      }

      if (kind === '格挡') {
        if (state.uni.block) { toast('⚠ 格挡本轮已使用过（每轮 1 次）'); return; }
        state.uni.block = true;
        state.usedSkill = true;
        state.player.shield = (state.player.shield || 0) + 25;
        toast('🛡 格挡生效：为自身添加 25 点护盾（无范围，直接生效）');
        renderSkills(); renderStatus();
        return;
      }
      if (kind === '普攻') {
        if (state.uni.attack) { toast('⚠ 普攻本轮已使用过（每轮 1 次）'); return; }
        startAiming('普攻');
        return;
      }      if (kind === '特技') {
        var s = SPECIALS[cfg.special];
        state.specialUsedRound = state.round;
        if (s && /自[己身]/.test(s.raw)) {
          useSelfSkill(s.name, '消耗奥义点，对自身生效');
        } else {
          useRangeSkill(s ? s.name : '特技', '特技释放');
        }
        renderSkills(); renderStatus();
        return;
      }
      if (kind === '援助') {
        var key = btn.getAttribute('data-key');
        var a = ASSISTS[key];
        // 援助不消耗技能点（援助体系独立，冷却固定7轮）
        state.assistUsedRound[key] = state.round;
        // 援助魔虚罗：真实召唤（600血 · 3轮 · AI操控）
      if (a && /魔虚罗/.test(a.name)) {
        if (state.maha) { toast('⚠ 魔虚罗已在场上，无需再召唤'); return; }
        var dir = DIRS[state.dirIndex];
        var px = state.player.x + dir.dx, py = state.player.y + dir.dy;
        if (!inBounds(px, py) || mapData[py][px] !== 0) { px = state.player.x; py = state.player.y; }
        state.maha = { x: px, y: py, hp: 600, roundsLeft: 3, adapts: {} };
        toast('🛡 援助「魔虚罗」降临！600血 · 存在3轮 · 由AI操控（适应系统启动）');
        draw(); renderStatus(); renderSkills();
        return;
      }
      if (a && /自[己身]/.test(a.raw)) {
          useSelfSkill(a.name, '援助释放');
        } else {
          useRangeSkill(a ? a.name : key, '援助释放');
        }
        renderSkills(); renderStatus();
        return;
      }
      if (kind === 'char') {
        var name = btn.getAttribute('data-name');
        var detail = '';
        var own = charSkillList(cfg.player);
        for (var i = 0; i < own.length; i++) {
          if (own[i].name === name) { detail = own[i].detail || ''; break; }
        }
        var eff = SKILL_EFFECTS[name];
        var hasRange = eff && eff.rangeKey && getRange(eff.rangeKey);
        if (hasRange) { startAiming(name); return; }
        if (isSelfSkill(name, detail)) {
          // 自身类也消耗技能点（按设定）
          var scost = costFor(name);
          if (state.sp < scost) { toast('⚠ 技能点不足（「' + name + '」需要 ' + scost + ' 点）'); return; }
          // 苍（瞬）：传送到苍的位置并使苍消失
          if (name === '苍（瞬）') {
            if (!state.cang) { toast('⚠ 场上没有「苍」，无法瞬移'); return; }
            state.player.x = state.cang.x;
            state.player.y = state.cang.y;
            state.cang = null;
            state.sp -= scost;
            state.usedSkill = true;
            toast('🌀「苍（瞬）」！已传送到苍的位置，苍随之消失' + (scost > 0 ? '，消耗 ' + scost + ' 技能点' : ''));
            draw(); renderStatus();
            return;
          }
          // 领域展延：受伤-30%·无视无限·持续至本轮结束·不能使用其余技能
          if (name === '领域展延') {
            state.sp -= scost;
            state.domExtend = true;
            state.usedSkill = true;
            toast('🔰「领域展延」：本轮受到伤害 -30%，无视「无限」效果，期间无法使用其余技能，持续至本轮结束');
            draw(); renderStatus();
            return;
          }
          // 无下限术式：获得「无限」状态（2轮）
          if (name === '无下限术式') {
            state.sp -= scost;
            state.infinity = 2;
            state.usedSkill = true;
            toast('🌀「无下限术式」：获得「无限」状态（2轮）——敌方攻击无法命中，敌方无法靠近你一格以内' + (scost > 0 ? '，消耗 ' + scost + ' 技能点' : ''));
            draw(); renderStatus();
            return;
          }
          state.sp -= scost;
          state.usedSkill = true;
          useSelfSkill(name, '消耗 ' + scost + ' 技能点' + (NO_RANGE_SKILLS[name] ? '；目标已确定（如传送至苍的位置）' : ''));
          renderStatus();
        }
        else useRangeSkill(name);
      }
    });
  }

  /* ---------- 方向选择（上下左右四向） ---------- */
  var dirButtons = ['d-n', 'd-e', 'd-s', 'd-w'];
  var dirMap = { 'd-n': 0, 'd-e': 1, 'd-s': 2, 'd-w': 3 };
  function renderDir() {
    document.getElementById('cur-dir').textContent = DIRS[state.dirIndex].label;
    dirButtons.forEach(function (id) {
      document.getElementById(id).classList.toggle('active', dirMap[id] === state.dirIndex);
    });
  }

  /* ---------- 魔虚罗（援助召唤体）AI + 适应机制 ---------- */
  function mahaInRange() {
    return Math.abs(state.enemy.x - state.maha.x) <= 1 && Math.abs(state.enemy.y - state.maha.y) <= 1;
  }
  function mahaStep() {
    var e = state.maha, p = state.enemy;
    var dx = p.x - e.x, dy = p.y - e.y;
    var tries = [];
    if (dx !== 0) tries.push([dx > 0 ? 1 : -1, 0]);
    if (dy !== 0) tries.push([0, dy > 0 ? 1 : -1]);
    for (var i = 0; i < tries.length; i++) {
      var nx = e.x + tries[i][0], ny = e.y + tries[i][1];
      if (inBounds(nx, ny) && mapData[ny][nx] === 0) { e.x = nx; e.y = ny; return true; }
    }
    return false;
  }
  function mahaAct() {
    if (!state.maha || state.gameOver) return;
    for (var i = 0; i < 8; i++) { // 最多移动8格
      if (mahaInRange()) break;
      if (!mahaStep()) break;
    }
    draw();
    if (mahaInRange()) {
      var d = applyDamage(state.enemy, 150);
      earnOp();
      toast('🌀 魔虚罗攻击 ' + nameShort(cfg.enemy) + '：造成 ' + d + ' 点正向能量伤害');
      checkEnd();
    }
  }
  // 魔虚罗被攻击：按技能适应难度登记/推进；已适应的技能伤害为0
  function hitMaha(skillName, adaptDiff, dmg) {
    var m = state.maha;
    if (!m) return 0;
    var ad = m.adapts[skillName];
    if (ad && ad.done) return 0; // 已适应：不再造成伤害
    if (adaptDiff && (!ad || !ad.done)) {
      if (!ad) m.adapts[skillName] = { left: adaptDiff, diff: adaptDiff };
      // 重复被同技能命中：不重置适应轮数
    }
    m.hp = Math.max(0, m.hp - dmg);
    if (m.hp <= 0) {
      state.maha = null;
      toast('💀 魔虚罗被击败！');
    }
    return dmg;
  }
  function enemyInMahaRange() {
    if (!state.maha) return false;
    if (state.enemy.x === state.maha.x && state.enemy.y === state.maha.y) return true;
    var info = getRange('普攻范围');
    if (!info) return Math.abs(state.enemy.x - state.maha.x) + Math.abs(state.enemy.y - state.maha.y) <= 1;
    return info.cells.some(function (o) {
      return state.maha.x === state.enemy.x + o[0] && state.maha.y === state.enemy.y + o[1];
    });
  }
  function enemyAttackTarget() {
    if (state.maha && enemyInMahaRange()) return 'maha';
    if (enemyInPlayerRange()) return 'player';
    return null;
  }
  function enemyAttacksMaha() {
    var isSukuna = /宿傩/.test(displayName(cfg.enemy));
    if (isSukuna) {
      // 宿傩用「解」（适应难度2 · 10×20指=200伤害）演示适应
      var d = hitMaha('解', 2, 200);
      toast('⚔️ ' + nameShort(cfg.enemy) + ' 使用「解」攻击魔虚罗：' + d + ' 点伤害' + (d === 0 ? '（魔虚罗已适应「解」！）' : ''));
    } else {
      var d2 = hitMaha('普攻', null, 25);
      toast('⚔️ ' + nameShort(cfg.enemy) + ' 普攻魔虚罗：' + d2 + ' 点伤害');
    }
    renderStatus();
  }

  /* ---------- 敌方 AI ---------- */
  function enemyInPlayerRange() {
    var info = getRange('普攻范围');
    // 同格也算命中（角色可堆叠）
    if (state.player.x === state.enemy.x && state.player.y === state.enemy.y) return true;
    if (!info) return Math.abs(state.player.x - state.enemy.x) + Math.abs(state.player.y - state.enemy.y) <= 1;
    return info.cells.some(function (o) {
      return state.player.x === state.enemy.x + o[0] && state.player.y === state.enemy.y + o[1];
    });
  }
  function enemyStep() {
    var e = state.enemy, p = state.player;
    var dx = p.x - e.x, dy = p.y - e.y;
    // 优先走横向或纵向（不能斜走）
    var moved = false;
    var tries = [];
    if (dx !== 0) tries.push([dx > 0 ? 1 : -1, 0]);
    if (dy !== 0) tries.push([0, dy > 0 ? 1 : -1]);
    for (var i = 0; i < tries.length; i++) {
      var nx = e.x + tries[i][0], ny = e.y + tries[i][1];
      // 「无限」：敌方无法主动靠近自身一格以内
      var blockedByInfinity = state.infinity > 0 &&
        Math.abs(nx - state.player.x) <= 1 && Math.abs(ny - state.player.y) <= 1;
      if (inBounds(nx, ny) && mapData[ny][nx] === 0 && !blockedByInfinity) { e.x = nx; e.y = ny; moved = true; break; }
    }
    return moved;
  }
  function enemyTurn() {
    if (state.gameOver) return;
    state.turn = 'enemy';
    draw();
    renderStatus();
    toast('⏳ ' + nameShort(cfg.enemy) + ' 开始行动…');
    mahaAct(); // 玩家召唤的魔虚罗先行（AI操控）
    if (state.gameOver) return;
    var cap = moveCapOf(cfg.enemy);
    var steps = 0;
    var iv = setInterval(function () {
      if (state.gameOver) { clearInterval(iv); return; }
      var target = enemyAttackTarget();
      if (target) {
        clearInterval(iv);
        if (target === 'maha') {
          enemyAttacksMaha();
        } else {
          if (state.infinity > 0) {
            // 「无限」：敌方攻击无法命中
            toast('🛡「无限」使 ' + nameShort(cfg.enemy) + ' 的攻击无法命中！');
          } else {
            var baseDmg = 25;
            if (state.domExtend) {
              // 领域展延：受到伤害减少30%（四舍五入）
              var reduced = Math.round(baseDmg * 0.7);
              applyDamage(state.player, reduced);
              toast('🔰 领域展延减伤30%：' + nameShort(cfg.enemy) + ' 对你造成 ' + reduced + ' 点伤害');
            } else {
              var dmg = applyDamage(state.player, baseDmg);
              toast('⚔️ ' + nameShort(cfg.enemy) + ' 对你普攻：造成 ' + dmg + ' 点伤害' + (state.player.hp <= 0 ? '' : '（护盾吸收剩余值已结算）'));
            }
          }
        }
        renderStatus();
        checkEnd();
        if (!state.gameOver) setTimeout(endEnemyTurn, 900);
        else { clearInterval(iv); }
        return;
      }
      if (steps < cap) {
        // 「苍」吸附范围：敌方每移动一格额外消耗1格移动力
        var inAttract = state.cang && cangArea && cangArea.attract.some(function (o) {
          return state.enemy.x === state.cang.x + o[0] && state.enemy.y === state.cang.y + o[1];
        });
        if (inAttract && !state.enemyAttractNoted) {
          state.enemyAttractNoted = true;
          toast('🌀 敌方陷入「苍」吸附范围：每移动一格额外消耗 1 格移动力');
        }
        var moved = enemyStep();
        steps += (inAttract ? 2 : 1);
        draw();
        if (!moved) { // 走不动了 → 结束
          clearInterval(iv);
          setTimeout(endEnemyTurn, 500);
        }
        return;
      }
      clearInterval(iv);
      setTimeout(endEnemyTurn, 400);
    }, 320);
  }
  function endEnemyTurn() {
    // 苍的每轮结束效果：敌人在攻击范围则75伤害
    if (state.cang && cangArea && !state.gameOver) {
      var inside = cangArea.attack.some(function (o) {
        return state.enemy.x === state.cang.x + o[0] && state.enemy.y === state.cang.y + o[1];
      });
      if (inside) {
        var d = applyDamage(state.enemy, 75);
        earnOp();
        toast('🌀「苍」每轮结束效果：' + nameShort(cfg.enemy) + ' 受到 ' + d + ' 点伤害');
        checkEnd();
      }
    }
    if (state.gameOver) return;
    // 魔虚罗：适应推进 + 每轮回血150 + 3轮时限
    if (state.maha) {
      Object.keys(state.maha.adapts).forEach(function (k) {
        var ad = state.maha.adapts[k];
        if (!ad.done) {
          ad.left--;
          if (ad.left <= 0) { ad.done = true; toast('🧠 魔虚罗已适应「' + k + '」！该技能不再造成伤害'); }
        }
      });
      state.maha.hp = Math.min(600, state.maha.hp + 150);
      state.maha.roundsLeft--;
      if (state.maha.roundsLeft <= 0) {
        state.maha = null;
        toast('⏳ 援助魔虚罗到了时限（3轮），消失');
      }
    }
    state.round++;
    state.ap = 1;
    state.sp = Math.min(3, state.sp + 1);
    state.movedThisRound = 0;
    state.uni = { attack: false, block: false };
    state.usedSkill = false;
    state.enemyAttractNoted = false;
    if (state.infinity > 0) {
      state.infinity--;
      if (state.infinity <= 0) toast('⌛「无限」状态消失');
    }
    state.domExtend = false; // 领域展延持续至本轮结束
    state.turn = 'player';
    document.getElementById('round-info').textContent = '第 ' + state.round + ' 轮';
    draw();
    renderStatus();
    toast('⏭ 第 ' + state.round + ' 轮开始：你的回合！');
  }

  /* ---------- 拖动平移 / 点击 ---------- */
  var dragState = null;
  function startDrag(clientX, clientY) {
    dragState = { sx: clientX, sy: clientY, camX: camX, camY: camY, moved: 0 };
    canvas.classList.add('dragging');
  }
  function moveDrag(clientX, clientY) {
    if (!dragState) return;
    var dx = clientX - dragState.sx, dy = clientY - dragState.sy;
    dragState.moved += Math.abs(dx) + Math.abs(dy);
    camX = dragState.camX - dx;
    camY = dragState.camY - dy;
    clampCam();
    draw();
  }
  function endDrag(clientX, clientY) {
    if (!dragState) return;
    var moved = dragState.moved;
    dragState = null;
    canvas.classList.remove('dragging');
    if (moved < 6) {
      var rect = canvas.getBoundingClientRect();
      var gx = Math.floor((clientX - rect.left + camX) / CELL);
      var gy = Math.floor((clientY - rect.top + camY) / CELL);
      if (state.aiming) {
        var hit = state.aiming.cells.some(function (c) { return c.x === gx && c.y === gy; });
        if (hit) executeCast({ x: gx, y: gy });
        else { state.aiming = null; draw(); toast('已取消瞄准'); }
        return;
      }
      if (isPlayerAt(gx, gy)) selectUnit('player');
      else if (isEnemyAt(gx, gy)) selectUnit('enemy');
    }
  }
  canvas.addEventListener('mousedown', function (e) { startDrag(e.clientX, e.clientY); e.preventDefault(); });
  canvas.addEventListener('mousemove', function (e) { moveDrag(e.clientX, e.clientY); });
  window.addEventListener('mouseup', function (e) { endDrag(e.clientX, e.clientY); });
  // 小地图点击 → 跳转视角
  mmCanvas.addEventListener('click', function (e) {
    var rect = mmCanvas.getBoundingClientRect();
    var x = Math.floor((e.clientX - rect.left) / (rect.width / W));
    var y = Math.floor((e.clientY - rect.top) / (rect.height / H));
    camX = (x + 0.5) * CELL - canvas.width / 2;
    camY = (y + 0.5) * CELL - canvas.height / 2;
    clampCam();
    draw();
  });
  canvas.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) startDrag(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  canvas.addEventListener('touchmove', function (e) {
    if (e.touches.length === 1) { moveDrag(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }
  }, { passive: false });
  canvas.addEventListener('touchend', function (e) {
    var t = e.changedTouches[0];
    endDrag(t ? t.clientX : 0, t ? t.clientY : 0);
  });

  /* ---------- 战斗事件 ---------- */
  document.getElementById('m-up').addEventListener('click', function () { movePlayer(0, -1); });
  document.getElementById('m-down').addEventListener('click', function () { movePlayer(0, 1); });
  document.getElementById('m-left').addEventListener('click', function () { movePlayer(-1, 0); });
  document.getElementById('m-right').addEventListener('click', function () { movePlayer(1, 0); });

  dirButtons.forEach(function (id) {
    document.getElementById(id).addEventListener('click', function () {
      state.dirIndex = dirMap[id];
      renderDir();
      toast('技能释放方向已设为：' + DIRS[state.dirIndex].label);
      if (state.aiming) startAiming(state.aiming.name); // 瞄准中转向 → 实时旋转范围
    });
  });

  function selectUnit(which) {
    state.selected = which;
    document.getElementById('sel-me').classList.toggle('selected', which === 'player');
    document.getElementById('sel-enemy').classList.toggle('selected', which === 'enemy');
    draw();
    renderStatus();
  }
  document.getElementById('sel-me').addEventListener('click', function () { selectUnit('player'); });
  document.getElementById('sel-enemy').addEventListener('click', function () { selectUnit('enemy'); });

  document.getElementById('btn-end-round').addEventListener('click', function () {
    if (state.gameOver) return;
    if (state.turn !== 'player') { toast('⏳ 敌方回合进行中…'); return; }
    enemyTurn();
  });
  document.getElementById('btn-toggle-left').addEventListener('click', function () {
    document.querySelector('.left-col').classList.toggle('hidden-col');
  });
  document.getElementById('btn-toggle-right').addEventListener('click', function () {
    document.querySelector('.right-col').classList.toggle('hidden-col');
  });
  window.addEventListener('resize', resize);

  /* ---------- 初始化 ---------- */
  listClick(document.getElementById('skill-list'));
  renderSkills();
  renderDir();
  renderStatus();
  resize();
  toast('第 1 轮开始！移动 · 点击技能选目标 · 结束回合后敌方会行动');
})();
