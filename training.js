// 训练营：选双方角色 + AI 开关 → 固定 50×50 进入战斗
(function () {
  var PREFIX = '《咒术回战》系列角色：';
  var MAP_KEY = '50x50';
  var sel = { player: null, enemy: null, ai: false, enemySpecial: null, enemyAssists: [] };

  function displayName(key) { return key.indexOf(PREFIX) === 0 ? key.slice(PREFIX.length) : key; }
  function readyChars() {
    return Object.keys(CHARACTERS).filter(function (k) {
      var c = CHARACTERS[k];
      return c && c.kind !== 'empty';
    });
  }
  var ready = readyChars();

  function renderGrid(gridId, detailId, which) {
    var grid = document.getElementById(gridId);
    var detail = document.getElementById(detailId);
    grid.innerHTML = '';
    ready.forEach(function (key) {
      var c = CHARACTERS[key];
      var card = document.createElement('div');
      card.className = 'option-card' + (sel[which] === key ? ' selected' : '');
      card.innerHTML = '<span class="big">' + c.name + '</span><span class="sub">LV ' + c.level + ' · 血量 ' + c.hp + '</span>';
      card.addEventListener('click', function () {
        sel[which] = key;
        renderAll();
        var skillsHtml = c.skills.map(function (s) { return '<li>' + s.name + '</li>'; }).join('');
        var passivesHtml = c.passives.map(function (p) { return '<li>' + p + '</li>'; }).join('');
        detail.innerHTML = '<h3>' + c.name + '（LV' + c.level + ' · 血量 ' + c.hp + '）</h3>' +
          '<p><b style="color:#fff2c4;">被动：</b></p><ul>' + (passivesHtml || '<li>无</li>') + '</ul>' +
          '<p style="margin-top:6px;"><b style="color:#fff2c4;">技能（' + c.skills.length + '）：</b></p><ul>' + skillsHtml + '</ul>';
      });
      grid.appendChild(card);
    });
  }

  function renderAi() {
    var box = document.getElementById('ai-chips');
    box.innerHTML = '';
    [{ on: true, label: '🤖 AI 开启（敌方自动行动）' }, { on: false, label: '🎮 AI 关闭（手动操控敌方）' }].forEach(function (o) {
      var chip = document.createElement('span');
      chip.className = 'chip' + (sel.ai === o.on ? ' selected' : '');
      chip.textContent = o.label;
      chip.addEventListener('click', function () { sel.ai = o.on; renderAi(); renderSummary(); });
      box.appendChild(chip);
    });
  }

  // 敌方特技 / 援助
  function renderFoeLoadout() {
    var sBox = document.getElementById('foe-special-chips');
    var aBox = document.getElementById('foe-assist-chips');
    sBox.innerHTML = '';
    aBox.innerHTML = '';
    var sKeys = Object.keys(SPECIALS).filter(function (k) { return SPECIALS[k] && SPECIALS[k].kind !== 'empty'; });
    var aKeys = Object.keys(ASSISTS).filter(function (k) { return ASSISTS[k] && ASSISTS[k].kind !== 'empty'; });
    var none = document.createElement('span');
    none.className = 'chip' + (sel.enemySpecial === null ? ' selected' : '');
    none.textContent = '不带特技';
    none.addEventListener('click', function () { sel.enemySpecial = null; renderFoeLoadout(); renderSummary(); });
    sBox.appendChild(none);
    sKeys.forEach(function (key) {
      var chip = document.createElement('span');
      chip.className = 'chip' + (sel.enemySpecial === key ? ' selected' : '');
      chip.textContent = SPECIALS[key].name;
      chip.addEventListener('click', function () {
        sel.enemySpecial = (sel.enemySpecial === key) ? null : key;
        renderFoeLoadout(); renderSummary();
      });
      sBox.appendChild(chip);
    });
    aKeys.forEach(function (key) {
      var chip = document.createElement('span');
      chip.className = 'chip' + (sel.enemyAssists.indexOf(key) >= 0 ? ' selected' : '');
      chip.textContent = ASSISTS[key].name;
      chip.addEventListener('click', function () {
        var i = sel.enemyAssists.indexOf(key);
        if (i >= 0) sel.enemyAssists.splice(i, 1);
        else if (sel.enemyAssists.length < 2) sel.enemyAssists.push(key);
        else { alert('敌方援助最多 2 个'); return; }
        renderFoeLoadout(); renderSummary();
      });
      aBox.appendChild(chip);
    });
  }

  function renderSummary() {
    var el = document.getElementById('summary');
    if (!sel.player || !sel.enemy) { el.textContent = '请选择我方与敌方角色'; return; }
    el.innerHTML = '地图：<b>50×50</b> ｜ 我方：<b>' + CHARACTERS[sel.player].name + '</b> ｜ 敌方：<b>' + CHARACTERS[sel.enemy].name +
      '</b> ｜ AI：<b>' + (sel.ai ? '开启' : '关闭（手动操控）') + '</b>' +
      ' ｜ 敌方特技：<b>' + (sel.enemySpecial ? SPECIALS[sel.enemySpecial].name : '无') + '</b>' +
      ' ｜ 敌方援助：<b>' + (sel.enemyAssists.length ? sel.enemyAssists.map(function (k) { return ASSISTS[k].name; }).join('、') : '无') + '</b>';
  }

  function renderAll() { renderGrid('my-grid', 'my-detail', 'player'); renderGrid('foe-grid', 'foe-detail', 'enemy'); renderAi(); renderFoeLoadout(); renderSummary(); }
  renderAll();

  document.getElementById('btn-start').addEventListener('click', function () {
    if (!sel.player || !sel.enemy) { alert('请先选择我方和敌方角色'); return; }
    var payload = {
      mode: 'training',
      map: MAP_KEY,
      player: sel.player,
      enemy: sel.enemy,
      special: null,
      assists: [],
      enemySpecial: sel.enemySpecial,
      enemyAssists: sel.enemyAssists,
      difficulty: sel.ai ? 'normal' : 'simple',
      ai: sel.ai
    };
    try { sessionStorage.setItem('boardBattle', JSON.stringify(payload)); } catch (e) {}
    window.location.href = 'battle.html';
  });
})();
