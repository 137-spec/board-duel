// 单人对决 - 选地图/选角色/特技援助 流程
(function () {
  var PREFIX = '《咒术回战》系列角色：';
  var MAP_OPTIONS = ['32x32', '50x50', '64x64']; // 目前提供三张地图（100x100 也可加入）

  var sel = { mode: null, map: null, player: null, enemy: null, special: null, assists: [], difficulty: 'simple', enemySpecial: null, enemyAssists: [] };

  function displayName(key) {
    return key.indexOf(PREFIX) === 0 ? key.slice(PREFIX.length) : key;
  }
  function readyChars() {
    return Object.keys(CHARACTERS).filter(function (k) {
      var c = CHARACTERS[k];
      return c && c.kind !== 'empty';
    });
  }
  function isNet() { return sel.mode === 'lan' || sel.mode === 'online'; }

  var nav = document.getElementById('step-nav');
  function showStep(id, text) {
    ['step-mode', 'step-map', 'step-char', 'step-loadout'].forEach(function (s) {
      document.getElementById(s).classList.toggle('hidden', s !== id);
    });
    nav.textContent = text;
  }

  /* ---------- 第 0 步：模式 ---------- */
  var MODES = [
    { key: 'duel', icon: '⚔️', label: '单人对决', sub: '你 vs AI（四档难度）', desc: '与电脑对战，可选 AI 难度' },
    { key: 'lan', icon: '📶', label: '局域网联机', sub: '同一 WiFi 双人对战', desc: '两名玩家各操控一方，同一 WiFi 下最稳；选人流程与单人对决相同' },
    { key: 'online', icon: '🌐', label: '互联网联机', sub: '异地好友点对点直连', desc: '交换连接码即可跨网络对战（无需服务器）' }
  ];
  var modeGrid = document.getElementById('mode-grid');
  MODES.forEach(function (m) {
    var card = document.createElement('div');
    card.className = 'option-card';
    card.innerHTML = '<span class="big">' + m.icon + ' ' + m.label + '</span><span class="sub">' + m.sub + '</span>';
    card.addEventListener('click', function () {
      sel.mode = m.key;
      document.querySelectorAll('#mode-grid .option-card').forEach(function (c) { c.classList.remove('selected'); });
      card.classList.add('selected');
      var total = (m.key === 'duel') ? 3 : 3;
      renderCharacterStep();
      showStep('step-map', '第 1 步 / 共 ' + total + ' 步：选择地图（' + m.label + '）');
    });
    modeGrid.appendChild(card);
  });

  /* ---------- 第 1 步：地图 ---------- */
  var mapGrid = document.getElementById('map-grid');
  MAP_OPTIONS.forEach(function (key) {
    var card = document.createElement('div');
    var size = key.split('x');
    card.className = 'option-card map-card';
    card.innerHTML = '<span class="big">' + size[0] + ' × ' + size[1] + '</span>' +
      '<span class="sub">' + (GAME_MAPS[key] ? GAME_MAPS[key].length + ' 行 × ' + GAME_MAPS[key][0].length + ' 列' : '数据缺失') + '</span>';
    card.addEventListener('click', function () {
      sel.map = key;
      document.querySelectorAll('#map-grid .option-card').forEach(function (c) { c.classList.remove('selected'); });
      card.classList.add('selected');
      renderCharacterStep();
      showStep('step-char', '第 2 步 / 共 3 步：选择我方角色（地图 ' + key + '）');
    });
    mapGrid.appendChild(card);
  });

  /* ---------- 第 2 步：角色 ---------- */
  var charGrid = document.getElementById('char-grid');
  var detailBox = document.getElementById('char-detail');
  var btnToLoadout = document.getElementById('btn-to-loadout');
  var ready = readyChars();

  Object.keys(CHARACTERS).forEach(function (key) {
    var c = CHARACTERS[key];
    var card = document.createElement('div');
    var readyFlag = c && c.kind !== 'empty';
    card.className = 'option-card' + (readyFlag ? '' : ' disabled');
    card.innerHTML = '<span class="big">' + displayName(key) + '</span>' +
      '<span class="sub">' + (readyFlag ? 'LV ' + c.level + ' · 血量 ' + c.hp : '设定待补充') + '</span>';
    if (readyFlag) {
      card.addEventListener('click', function () {
        sel.player = key;
        document.querySelectorAll('#char-grid .option-card').forEach(function (x) { x.classList.remove('selected'); });
        card.classList.add('selected');
        btnToLoadout.disabled = false;
        var skillsHtml = c.skills.map(function (s) { return '<li>' + s.name + '</li>'; }).join('');
        var passivesHtml = c.passives.map(function (p) { return '<li>' + p + '</li>'; }).join('');
        detailBox.innerHTML = '<h3>' + c.name + '（LV' + c.level + ' · 血量 ' + c.hp + '）</h3>' +
          '<p><b style="color:#fff2c4;">被动：</b></p><ul>' + (passivesHtml || '<li>无</li>') + '</ul>' +
          '<p style="margin-top:6px;"><b style="color:#fff2c4;">技能（' + c.skills.length + '）：</b></p><ul>' + skillsHtml + '</ul>' +
          '<p class="muted" style="margin-top:6px;">注：技能范围设定尚未编写，进入战斗后点击技能仅为演示。</p>';
      });
    }
    charGrid.appendChild(card);
  });

  btnToLoadout.addEventListener('click', function () {
    if (!sel.player) return;
    renderLoadoutStep();
    showStep('step-loadout', (isNet() ? '第 3 步 / 共 3 步：配置角色（联机模式，双方各自操控）' : '第 3 步 / 共 3 步：选择敌我双方的特技与援助'));
  });

  /* ---------- 第 3 步：特技与援助 ---------- */
  var specialChips = document.getElementById('special-chips');
  var assistChips = document.getElementById('assist-chips');
  var enemyChips = document.getElementById('enemy-chips');
  var diffChips = document.getElementById('diff-chips');
  var enemySpecialChips = document.getElementById('enemy-special-chips');
  var enemyAssistChips = document.getElementById('enemy-assist-chips');
  var summary = document.getElementById('loadout-summary');
  var btnStart = document.getElementById('btn-start');
  var btnBackChar = document.getElementById('btn-back-char');

  var DIFFS = [
    { key: 'simple', label: '🙂 简单', desc: '只会追击并普攻（原版AI）' },
    { key: 'normal', label: '😐 普通', desc: '会使用解/捌等技能与格挡' },
    { key: 'hard', label: '😠 困难', desc: '会拉开距离、对齐光束、开领域' },
    { key: 'brutal', label: '💀 强化', desc: '全技能+必中领域+咒词解压制（最强）' }
  ];

  function renderDifficultyChips() {
    diffChips.innerHTML = '';
    DIFFS.forEach(function (d) {
      var chip = document.createElement('span');
      chip.className = 'chip' + (sel.difficulty === d.key ? ' selected' : '');
      chip.textContent = d.label;
      chip.title = d.desc;
      chip.addEventListener('click', function () {
        sel.difficulty = d.key;
        renderLoadoutStep();
      });
      diffChips.appendChild(chip);
    });
    var tip = document.createElement('span');
    tip.className = 'muted';
    tip.style.fontSize = '.86rem';
    var cur = DIFFS.filter(function (d) { return d.key === sel.difficulty; })[0];
    tip.textContent = cur ? '　' + cur.desc : '';
    diffChips.appendChild(tip);
  }

  function renderLoadoutStep() {
    var netMode = isNet();
    var diffWrap = document.getElementById('diff-chips');
    if (diffWrap) diffWrap.style.display = netMode ? 'none' : '';
    if (!netMode) renderDifficultyChips();
    // 敌方角色（选 1 个 或 随机）
    enemyChips.innerHTML = '';
    var randChip = document.createElement('span');
    randChip.className = 'chip' + (sel.enemy === null ? ' selected' : '');
    randChip.textContent = '🎲 随机';
    randChip.addEventListener('click', function () {
      sel.enemy = null;
      renderLoadoutStep();
    });
    enemyChips.appendChild(randChip);
    ready.forEach(function (key) {
      var chip = document.createElement('span');
      chip.className = 'chip' + (sel.enemy === key ? ' selected' : '');
      chip.textContent = CHARACTERS[key].name;
      chip.addEventListener('click', function () {
        sel.enemy = key;
        renderLoadoutStep();
      });
      enemyChips.appendChild(chip);
    });

    // 特技（选 1）
    specialChips.innerHTML = '';
    var sKeys = Object.keys(SPECIALS).filter(function (k) { return SPECIALS[k] && SPECIALS[k].kind !== 'empty'; });
    if (sKeys.length === 0) specialChips.innerHTML = '<span class="muted">暂无已编写的特技（可到特技设计目录补充）</span>';
    sKeys.forEach(function (key) {
      var chip = document.createElement('span');
      var s = SPECIALS[key];
      chip.className = 'chip' + (sel.special === key ? ' selected' : '');
      chip.textContent = s.name;
      chip.addEventListener('click', function () {
        sel.special = key;
        renderLoadoutStep();
      });
      specialChips.appendChild(chip);
    });

    // 援助（最多 2）
    assistChips.innerHTML = '';
    var aKeys = Object.keys(ASSISTS).filter(function (k) { return ASSISTS[k] && ASSISTS[k].kind !== 'empty'; });
    if (aKeys.length === 0) assistChips.innerHTML = '<span class="muted">暂无已编写的援助（可到援助设计目录补充）</span>';
    aKeys.forEach(function (key) {
      var chip = document.createElement('span');
      var a = ASSISTS[key];
      chip.className = 'chip' + (sel.assists.indexOf(key) >= 0 ? ' selected' : '');
      chip.textContent = a.name;
      chip.addEventListener('click', function () {
        var i = sel.assists.indexOf(key);
        if (i >= 0) sel.assists.splice(i, 1);
        else if (sel.assists.length < 2) sel.assists.push(key);
        else { alert('援助最多选择 2 个（当前只有 1 个已编写，后续会补充）'); return; }
        renderLoadoutStep();
      });
      assistChips.appendChild(chip);
    });

    // 敌方特技（选 1）
    enemySpecialChips.innerHTML = '';
    if (sKeys.length === 0) enemySpecialChips.innerHTML = '<span class="muted">暂无可选特技</span>';
    sKeys.forEach(function (key) {
      var chip = document.createElement('span');
      var s = SPECIALS[key];
      chip.className = 'chip' + (sel.enemySpecial === key ? ' selected' : '');
      chip.textContent = s.name;
      chip.addEventListener('click', function () {
        sel.enemySpecial = (sel.enemySpecial === key) ? null : key;
        renderLoadoutStep();
      });
      enemySpecialChips.appendChild(chip);
    });
    var enNone = document.createElement('span');
    enNone.className = 'chip' + (sel.enemySpecial === null ? ' selected' : '');
    enNone.textContent = '不带特技';
    enNone.addEventListener('click', function () { sel.enemySpecial = null; renderLoadoutStep(); });
    enemySpecialChips.insertBefore(enNone, enemySpecialChips.firstChild);

    // 敌方援助（最多 2）
    enemyAssistChips.innerHTML = '';
    if (aKeys.length === 0) enemyAssistChips.innerHTML = '<span class="muted">暂无可选援助</span>';
    aKeys.forEach(function (key) {
      var chip = document.createElement('span');
      var a = ASSISTS[key];
      chip.className = 'chip' + (sel.enemyAssists.indexOf(key) >= 0 ? ' selected' : '');
      chip.textContent = a.name;
      chip.addEventListener('click', function () {
        var i = sel.enemyAssists.indexOf(key);
        if (i >= 0) sel.enemyAssists.splice(i, 1);
        else if (sel.enemyAssists.length < 2) sel.enemyAssists.push(key);
        else { alert('敌方援助最多 2 个'); return; }
        renderLoadoutStep();
      });
      enemyAssistChips.appendChild(chip);
    });
    renderSummary();
  }

  function renderSummary() {
    var enemy = sel.enemy || ready[Math.floor(Math.random() * ready.length)];
    var sp = sel.special ? SPECIALS[sel.special].name : '未选';
    var as = sel.assists.length ? sel.assists.map(function (k) { return ASSISTS[k].name; }).join('、') : '未选';
    var diffName = (DIFFS.filter(function (d) { return d.key === sel.difficulty; })[0] || DIFFS[0]).label;
    summary.innerHTML =
      '<h3>出战配置</h3>' +
      '<p>地图：<b>' + sel.map + '</b> ｜ 我方：<b>' + CHARACTERS[sel.player].name + '</b> ｜ 特技：<b>' + sp + '</b> ｜ 援助：<b>' + as + '</b></p>' +
      '<p>敌方角色：<b>' + CHARACTERS[enemy].name + '</b>' + (sel.enemy ? '' : '（随机分配）') + ' ｜ AI 难度：<b>' + diffName + '</b></p>' +
      '<p class="muted">注：技能命中可获奥义点；敌方 AI 会在你结束回合后行动。</p>';
  }

  var enemyLocked = null;
  btnStart.addEventListener('click', function () {
    if (!sel.map || !sel.player) { alert('请先选择地图和我方角色'); return; }
    var ready = readyChars();
    var enemy = sel.enemy || ready[Math.floor(Math.random() * ready.length)];
    var payload = {
      mode: sel.mode || 'duel',
      ai: (sel.mode || 'duel') === 'duel',
      map: sel.map,
      player: sel.player,
      enemy: enemy,
      special: sel.special,
      assists: sel.assists,
      enemySpecial: sel.enemySpecial,
      enemyAssists: sel.enemyAssists,
      difficulty: sel.difficulty || 'simple'
    };
    try {
      sessionStorage.setItem('boardBattle', JSON.stringify(payload));
      if (payload.mode === 'lan' || payload.mode === 'online') sessionStorage.setItem('onlineRole', 'ask');
    } catch (e) { /* file:// 下个别浏览器限制，忽略 */ }
    window.location.href = 'battle.html';
  });

  btnBackChar.addEventListener('click', function () {
    renderCharacterStep();
    showStep('step-char', '第 2 步 / 共 3 步：选择我方角色');
  });

  function renderCharacterStep() {
    // 进入角色步骤时清空细节
    detailBox.innerHTML = '点击角色卡片查看详情';
    btnToLoadout.disabled = true;
  }
})();
