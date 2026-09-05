// 战斗界面：地图棋盘 + 左侧状态/移动 + 右侧技能
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

  // 每轮可移动格数 = 6 + 角色等级（等级最高按5级封顶；0级角色=6格）
  function moveCapOf(key) {
    var c = CHARACTERS[key];
    var lv = (c && c.level) || 0;
    return 6 + Math.min(lv, 5);
  }
  /* ---------- 对局状态 ---------- */
  var mapData = GAME_MAPS[cfg.map] || GAME_MAPS['50x50'];
  var W = mapData[0].length, H = mapData.length;
  var state = {
    round: 1,
    ap: 1,               // 行动点
    sp: 1,               // 技能点
    op: 2,               // 奥义点（开局2）
    movedThisRound: 0,   // 本轮已移动格数
    moveCap: moveCapOf(cfg.player), // 移动上限（随角色等级：6+Lv）
    selected: 'player',
    dirIndex: 0,         // 默认 右
    specialUsedRound: 0, // 特技上次使用轮（CD=1轮）
    assistUsedRound: {}, // 援助上次使用轮（CD=7轮）
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
    { dx: 1, dy: 0, label: '右' }, { dx: 1, dy: 1, label: '右下' },
    { dx: 0, dy: 1, label: '下' }, { dx: -1, dy: 1, label: '左下' },
    { dx: -1, dy: 0, label: '左' }, { dx: -1, dy: -1, label: '左上' },
    { dx: 0, dy: -1, label: '上' }, { dx: 1, dy: -1, label: '右上' }
  ];

  /* ---------- 工具 ---------- */
  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function nameShort(key) {
    return displayName(key).split('（')[0];
  }
  // 角色代表字：五条悟→五 伏黑惠→惠 宿傩→傩 …（未配置的取名字首字）
  var REP_CHARS = { '五条悟': '五', '伏黑惠': '惠', '虎杖悠人': '悠', '宿傩': '傩', '乙骨优太': '乙', '伏黑甚尔': '甚' };
  function repChar(key) {
    var base = nameShort(key);
    return REP_CHARS[base] || base.charAt(0);
  }
  function charSkillList(key) {
    var c = CHARACTERS[key];
    if (!c || c.kind === 'empty') return [];
    return c.skills.filter(function (s) {
      var n = s.name.replace(/[（(].*$/, '');
      return n !== '普攻' && n !== '格挡';
    });
  }

  /* ---------- 画布渲染（固定格子尺寸 + 拖动平移查看） ---------- */
  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');
  var CELL = 26;              // 每格固定像素（地图保持放大比例）
  var camX = 0, camY = 0;     // 视野左上角（地图像素坐标）
  var mapPxW = W * CELL, mapPxH = H * CELL;

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
    // 开局视野锁定我方角色
    camX = (state.player.x + 0.5) * CELL - canvas.width / 2;
    camY = (state.player.y + 0.5) * CELL - canvas.height / 2;
    clampCam();
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 白底（高对比棋盘风）
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // 只画视野内的格子（大图也流畅）
    var x0 = Math.max(0, Math.floor(camX / CELL));
    var y0 = Math.max(0, Math.floor(camY / CELL));
    var x1 = Math.min(W - 1, Math.ceil((camX + canvas.width) / CELL));
    var y1 = Math.min(H - 1, Math.ceil((camY + canvas.height) / CELL));
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var v = mapData[y][x];
        if (v !== 0) { // 障碍物（后续读障碍）
          ctx.fillStyle = '#8a5a26';
          ctx.fillRect(x * CELL - camX + 1, y * CELL - camY + 1, CELL - 2, CELL - 2);
        }
      }
    }
    // 黑网格线（增强对比）
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
    // 单位（代表字显示）
    drawUnit(state.player, '#3f8cff', '#eaf4ff');
    drawUnit(state.enemy, '#ff5252', '#ffecec');
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
      ctx.strokeStyle = '#ffd75e';
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
        + (state.ap > 0 ? '●' : '○') + '（本轮剩余移动步数 ' + Math.max(0, state.moveCap - state.movedThisRound) + '/' + state.moveCap + '）</span></div>';
      html += '<div class="stat-line"><span class="label">移动上限</span><b>6+等级' + ((CHARACTERS[cfg.player] && CHARACTERS[cfg.player].level) || 0) + ' = ' + state.moveCap + ' 格</b></div>';
      html += '<div class="stat-line"><span class="label">技能点</span><span class="dots">'
        + '●'.repeat(state.sp) + '○'.repeat(3 - state.sp) + ' ' + state.sp + '/3</span></div>';
      html += '<div class="stat-line"><span class="label">奥义点</span><span class="dots">'
        + '●'.repeat(state.op) + '○'.repeat(6 - state.op) + ' ' + state.op + '/6</span></div>';
    }
    html += '<div class="pad-label">目前持有状态</div><div class="chips">';
    var chips = [];
    if (u.shield > 0) chips.push('🛡 护盾 ' + u.shield);
    if (state.selected === 'player') {
      if (cfg.special && state.specialUsedRound > 0 && state.round - state.specialUsedRound < 2) {
        chips.push('⏳ 特技冷却中');
      }
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
  }

  /* ---------- 移动 ---------- */
  function movePlayer(dx, dy) {
    var u = state.player;
    var nx = u.x + dx, ny = u.y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) { toast('⚠ 到达地图边界，无法移动'); return; }
    if (mapData[ny][nx] !== 0) { toast('⚠ 该格有障碍物，无法移动'); return; }
    if (state.enemy.x === nx && state.enemy.y === ny) { toast('⚠ 敌方单位挡住去路'); return; }
    if (state.movedThisRound >= state.moveCap || state.ap <= 0) { toast('⚠ 本轮行动点/步数已用完'); return; }
    u.x = nx; u.y = ny;
    state.movedThisRound++;
    if (state.movedThisRound >= state.moveCap) state.ap = 0;
    draw();
    renderStatus();
    toast('我方移动到 (' + nx + ',' + ny + ') 剩余步数 ' + Math.max(0, state.moveCap - state.movedThisRound));
  }

  /* ---------- 技能（范围未制作，占位演示） ---------- */
  function useSkill(name, extra) {
    var dir = DIRS[state.dirIndex];
    toast('「' + name + '」技能范围尚未编写 —— 已记录释放朝向：' + dir.label + (extra ? '（' + extra + '）' : ''));
  }

  function renderSkills() {
    var list = document.getElementById('skill-list');
    var html = '';
    html += '<div class="skill-group-title">通用技能</div>';
    html += '<button class="skill-btn" data-skill="普攻">⚔️ 普攻<span class="cd">25 伤害 · 每轮1次</span></button>';
    html += '<button class="skill-btn" data-skill="格挡">🛡 格挡<span class="cd">25 护盾 · 每轮1次</span></button>';

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
        html += '<button class="skill-btn" data-skill="char" data-name="' + sk.name.replace(/"/g, '&quot;') + '">' +
          sk.name + '<span class="cd">范围待定</span></button>';
      });
    }
    list.innerHTML = html;
    list.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.skill-btn') : null;
      if (!btn) return;
      var kind = btn.getAttribute('data-skill');
      if (kind === '特技') {
        state.specialUsedRound = state.round;
        useSkill(SPECIALS[cfg.special] ? SPECIALS[cfg.special].name : '特技', '特技释放（消耗奥义点）');
        renderSkills(); renderStatus();
      } else if (kind === '援助') {
        var key = btn.getAttribute('data-key');
        state.assistUsedRound[key] = state.round;
        useSkill(ASSISTS[key] ? ASSISTS[key].name : key, '援助释放');
        renderSkills(); renderStatus();
      } else if (kind === 'char') {
        useSkill(btn.getAttribute('data-name'));
      } else {
        useSkill(kind, '通用技能');
      }
    });
  }

  /* ---------- 方向选择 ---------- */
  var dirButtons = ['d-nw', 'd-n', 'd-ne', 'd-w', 'd-e', 'd-sw', 'd-s', 'd-se'];
  var dirMap = { 'd-nw': 5, 'd-n': 6, 'd-ne': 7, 'd-w': 4, 'd-e': 0, 'd-sw': 3, 'd-s': 2, 'd-se': 1 };
  function renderDir() {
    document.getElementById('cur-dir').textContent = DIRS[state.dirIndex].label;
    dirButtons.forEach(function (id) {
      document.getElementById(id).classList.toggle('active', dirMap[id] === state.dirIndex);
    });
  }

  /* ---------- 回合 ---------- */
  function endRound() {
    state.round++;
    state.ap = 1;
    state.sp = Math.min(3, state.sp + 1);
    state.movedThisRound = 0;
    document.getElementById('round-info').textContent = '第 ' + state.round + ' 轮';
    draw();
    renderStatus();
    toast('⏭ 第 ' + state.round + ' 轮开始：+1 行动点，+1 技能点（' + state.sp + '/3）');
  }

  /* ---------- 事件绑定 ---------- */
  document.getElementById('m-up').addEventListener('click', function () { movePlayer(0, -1); });
  document.getElementById('m-down').addEventListener('click', function () { movePlayer(0, 1); });
  document.getElementById('m-left').addEventListener('click', function () { movePlayer(-1, 0); });
  document.getElementById('m-right').addEventListener('click', function () { movePlayer(1, 0); });

  dirButtons.forEach(function (id) {
    document.getElementById(id).addEventListener('click', function () {
      state.dirIndex = dirMap[id];
      renderDir();
      toast('技能释放方向已设为：' + DIRS[state.dirIndex].label);
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

  /* ---------- 按住拖动平移地图 / 轻点选中单位 ---------- */
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
    if (moved < 6) { // 基本没动 → 视为点击选中
      var rect = canvas.getBoundingClientRect();
      var gx = Math.floor((clientX - rect.left + camX) / CELL);
      var gy = Math.floor((clientY - rect.top + camY) / CELL);
      if (state.player.x === gx && state.player.y === gy) selectUnit('player');
      else if (state.enemy.x === gx && state.enemy.y === gy) selectUnit('enemy');
    }
  }
  canvas.addEventListener('mousedown', function (e) { startDrag(e.clientX, e.clientY); e.preventDefault(); });
  canvas.addEventListener('mousemove', function (e) { moveDrag(e.clientX, e.clientY); });
  window.addEventListener('mouseup', function (e) { endDrag(e.clientX, e.clientY); });
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

  document.getElementById('btn-end-round').addEventListener('click', endRound);
  document.getElementById('btn-toggle-left').addEventListener('click', function () {
    document.querySelector('.left-col').classList.toggle('hidden-col');
  });
  document.getElementById('btn-toggle-right').addEventListener('click', function () {
    document.querySelector('.right-col').classList.toggle('hidden-col');
  });
  window.addEventListener('resize', resize);

  /* ---------- 初始化 ---------- */
  renderSkills();
  renderDir();
  renderStatus();
  resize();
  toast('第 1 轮开始！方向键移动 · 按住中间地图拖动查看 · 右半边选择技能（范围稍后补全）');
})();
