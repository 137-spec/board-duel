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

  /* ---------- 对局状态 ---------- */
  var mapData = GAME_MAPS[cfg.map] || GAME_MAPS['50x50'];
  var W = mapData[0].length, H = mapData.length;
  var state = {
    round: 1,
    ap: 1,               // 行动点
    sp: 1,               // 技能点
    op: 2,               // 奥义点（开局2）
    movedThisRound: 0,   // 本轮已移动格数（1行动点=6格）
    moveCap: 6,          // 0级角色基础6格（角色等级这里先简化）
    selected: 'player',
    dirIndex: 0,         // 默认 右
    specialUsedRound: 0, // 特技上次使用轮（CD=1轮）
    assistUsedRound: {}, // 援助上次使用轮（CD=7轮）
    player: {
      key: cfg.player,
      x: 1, y: 1,
      hp: (CHARACTERS[cfg.player].hp || 800),
      shield: 0
    },
    enemy: {
      key: cfg.enemy,
      x: W - 2, y: H - 2,
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
  function charSkillList(key) {
    var c = CHARACTERS[key];
    if (!c || c.kind === 'empty') return [];
    return c.skills.filter(function (s) {
      var n = s.name.replace(/[（(].*$/, '');
      return n !== '普攻' && n !== '格挡';
    });
  }

  /* ---------- 画布渲染 ---------- */
  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');
  function resize() {
    var box = canvas.parentElement;
    var availW = box.clientWidth - 16, availH = box.clientHeight - 16;
    var cell = Math.max(8, Math.floor(Math.min(availW / W, availH / H)));
    canvas.width = cell * W;
    canvas.height = cell * H;
    draw();
  }
  function draw() {
    var cell = canvas.width / W;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 地面
    ctx.fillStyle = '#221640';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var v = mapData[y][x];
        if (v !== 0) { // 任意非0格画障碍底色（后续读技能范围/障碍）
          ctx.fillStyle = '#4a2b12';
          ctx.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
        }
      }
    }
    // 网格线
    ctx.strokeStyle = 'rgba(255,255,255,.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i <= W; i++) { ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, canvas.height); }
    for (var j = 0; j <= H; j++) { ctx.moveTo(0, j * cell); ctx.lineTo(canvas.width, j * cell); }
    ctx.stroke();
    // 单位
    drawUnit(state.player, '#3f8cff', '#bfe0ff');
    drawUnit(state.enemy, '#ff5252', '#ffd0d0');
  }
  function drawUnit(u, fill, textColor) {
    var cell = canvas.width / W;
    var cx = (u.x + 0.5) * cell, cy = (u.y + 0.5) * cell;
    var r = cell * 0.36;
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
    ctx.strokeStyle = 'rgba(0,0,0,.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = textColor;
    ctx.font = 'bold ' + Math.max(10, cell * 0.34) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(nameShort(u.key), cx, cy);
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

  canvas.addEventListener('click', function (e) {
    var rect = canvas.getBoundingClientRect();
    var cell = canvas.width / W;
    var x = Math.floor((e.clientX - rect.left) / (rect.width / W));
    var y = Math.floor((e.clientY - rect.top) / (rect.height / H));
    if (state.player.x === x && state.player.y === y) selectUnit('player');
    else if (state.enemy.x === x && state.enemy.y === y) selectUnit('enemy');
  });

  document.getElementById('btn-end-round').addEventListener('click', endRound);
  window.addEventListener('resize', resize);

  /* ---------- 初始化 ---------- */
  renderSkills();
  renderDir();
  renderStatus();
  resize();
  toast('第 1 轮开始！点击左下方向键移动，右半边选择技能（范围稍后补全）');
})();
