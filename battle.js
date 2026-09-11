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
  // 宿傩被动·诅咒之王：技能点上限+3，每轮多回复一点
  function isSukunaKey(key) { return /宿傩/.test(displayName(key)); }
  function spCapForKey(key) { return isSukunaKey(key) ? 6 : 3; }
  function spRegenForKey(key) { return isSukunaKey(key) ? 2 : 1; }
  function spCapOf() { return spCapForKey(cfg.player); }
  function spRegenOf() { return spRegenForKey(cfg.player); }

  /* ---------- AI 难度（简单=原版，其余逐级增强） ----------
     说明：通用技能（普攻/格挡）对多数角色价值有限，AI 不再主动格挡（blockAt=0）
     领域不再固定轮次秒开，而是按“时机判定”择机展开 */
  var AI_LEVELS = {
    simple: { name: '简单', useSkills: false, blockAt: 0, kiting: 0, useDomain: false, minDomainRound: 0, sureHit: false, alignBeam: false, summon: false, place: false, summonCare: 0 },
    normal: { name: '普通', useSkills: true, blockAt: 0, kiting: 0, useDomain: false, minDomainRound: 0, sureHit: false, alignBeam: false, summon: true, place: true, summonCare: 0.25 },
    hard: { name: '困难', useSkills: true, blockAt: 0, kiting: 2, useDomain: true, minDomainRound: 3, sureHit: false, alignBeam: true, summon: true, place: true, summonCare: 0.5 },
    brutal: { name: '强化', useSkills: true, blockAt: 0, kiting: 2, useDomain: true, minDomainRound: 2, sureHit: true, alignBeam: true, summon: true, place: true, summonCare: 0.7 }
  };
  var AI = AI_LEVELS[cfg.difficulty] || AI_LEVELS.simple;
  // 训练营模式：固定 50×50、双方均可操控、AI 可随时开关
  var TRAINING = cfg.mode === 'training';

  /* 领域展开时机判定：要打得中、打得值，不是到点就开
     条件：玩家在领域范围内（切比雪夫≤6） + 玩家血量还有价值（≥25%）
           + 已达最早轮次 + （自己血量健康 或 处于劣势需要领域翻盘） */
  function enemyShouldOpenDomain() {
    if (!AI.useDomain || state.enemyDomain) return false;
    if (state.round < AI.minDomainRound) return false;
    var chebDist = Math.max(Math.abs(state.enemy.x - state.player.x), Math.abs(state.enemy.y - state.player.y));
    if (chebDist > 6) return false; // 玩家不在领域内 → 开了浪费
    var pMax = CHARACTERS[cfg.player].hp || 1;
    var eMax = CHARACTERS[cfg.enemy].hp || 1;
    var pRatio = state.player.hp / pMax;
    var eRatio = state.enemy.hp / eMax;
    if (pRatio < 0.25) return false; // 玩家已是残血 → 不必动用领域
    if (eRatio >= 0.3) return true;              // 自己状态尚可，正是压制的时机
    return (pRatio - eRatio) > 0.25;             // 自己吃亏 → 用领域翻盘
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
  // 宿傩专属键（前缀=角色名，与范围文件名一致）
  var SK_PREFIX = displayName(cfg.player);
  function skKey(name, tail) { return SK_PREFIX + name + (tail ? tail : ''); }
  var SKILL_EFFECTS = {
    '普攻': { type: 'attack', dmg: 25, rangeKey: '普攻范围' },
    '赫（自爆）': { type: 'hemi', dmg: 120, selfDmg: 75, rangeKey: rangeKeyFor('赫（自爆）') },
    '苍（最大功率）': { type: 'aoe', dmg: 350, rangeKey: rangeKeyFor('苍（最大功率）'), needOp: 6, rotate: true },
    '苍（定点）': { type: 'placeCang', rangeKey: rangeKeyFor('苍（定点）') },
    '苍': { type: 'placeCang', rangeKey: rangeKeyFor('苍') },
    // ---- 宿傩 ----
    '解': { type: 'aoe', dmg: 200, rangeKey: skKey('解（此技能能转向）'), rotate: true },
    // 空间斩：魔虚罗适应「无限」后解锁，需先发动咒词吟唱；一轮前摇，回合开始时自动斩击上回合选定的范围
    '空间斩': { type: 'spatial', dmg: 300, ignoreShield: true, ignoreInfinity: true, rangeKey: skKey('空间斩（此技能能转向）'), rotate: true, needChant: true },
    '捌': { type: 'aoe', dmg: null, hpPct: 0.10, plus: 200, rangeKey: skKey('捌') },
    '开': { type: 'open', rangeKey: skKey('开（此技能能转向）'), rotate: true, dustKeys: true },
    '蛛网解': { type: 'aoe', dmg: 200, slow: 2, rangeKey: skKey('蛛网解') },
    '前冲解': { type: 'dashAoe', dmg: 200, dash: 3, rangeKey: skKey('前冲解（此技能能转向）'), rotate: true },
    '后撤解': { type: 'dashAoe', dmg: 200, dash: 3, out: true, dilate: 3, rangeKey: skKey('后撤解（此技能能转向）'), rotate: true },
    '领域展开「伏魔御厨子」': { type: 'domain', needOp: 6, rangeKey: skKey('伏魔御厨子') },
    '十种影法术（鵺）': { type: 'shikigami', key: '鵺', rangeKey: skKey('十种影法术召唤范围') },
    '十种影法术（鄂吐）': { type: 'shikigami', key: '鄂吐', rangeKey: skKey('十种影法术召唤范围') },
    '十种影法术（魔虚罗）': { type: 'shikigami', key: '魔虚罗', rangeKey: skKey('十种影法术召唤范围') }
  };
  var SHIKIGAMI = {
    '鵺': { hp: 300, atk: 100, move: 8, rangeKey: SK_PREFIX + '鵺攻击范围', dmgType: '雷电' },
    '鄂吐': { hp: 500, atk: 100, move: 8, heal: 500, rangeKey: SK_PREFIX + '其余十种影法术召唤出的式神攻击范围', dmgType: '正向能量' },
    '魔虚罗': { hp: 600, atk: 150, move: 8, heal: 450, adapt: true, rangeKey: SK_PREFIX + '其余十种影法术召唤出的式神攻击范围', dmgType: '正向能量' }
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
    // 优先使用代码定稿范围（data/ranges.js），不依赖本地 txt；没有则回退到转换出的范围图
    if (!(key in rangeCache)) {
      var rc = (typeof RANGE_CODE !== 'undefined') ? RANGE_CODE[key] : null;
      if (rc && rc.cells) {
        rangeCache[key] = { cells: rc.cells, own: [0, 0] };
      } else {
        rangeCache[key] = SKILL_RANGES[key] ? parseRangeGrid(SKILL_RANGES[key]) : null;
      }
    }
    return rangeCache[key];
  }
  var cangArea = (function () {
    var rc = (typeof RANGE_CODE !== 'undefined') ? RANGE_CODE[CANG_AREA_KEY] : null;
    if (rc && rc.attack && rc.attract) return { attack: rc.attack, attract: rc.attract };
    return parseCangArea(CANG_AREA_KEY);
  })();

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
    enemyMoved: 0,                  // 敌方本轮已移动格数（训练营手动操控用）
    aiOn: cfg.ai !== false,         // AI 开关（训练营可切换）
    selected: 'player',
    dirIndex: 0,
    uni: { attack: false, block: false },  // 通用技能每轮各1次
    infinity: 0,                    // 「无限」状态剩余轮数（无下限术式·敌方攻击无法命中/无法靠近）
    domExtend: false,               // 「领域展延」·本轮受伤-30%·期间无法使用其余技能
    dust: 0,                        // 宿傩粉尘值（领域每轮+20%）
    domain: null,                   // {rounds, cells:[{x,y}]} 领域展开
    sureHit: false,                 // 领域内必中锁定（已选目标=敌方）
    enemyDomain: null,              // 敌方宿傩的领域 {rounds, cx, cy}
    openWindup: null,               // 开·蓄力前摇 {cells, dmg}
    deadShikigami: {},              // 阵亡的式神（不可再召唤）
    breakRounds: 0,                 // 术式熔断剩余轮数（领域结束后5轮）
    shiki: null,                    // 式神 {kind,x,y,hp,heal,adapts}
    enemySlow: 0,                   // 敌方本轮可移动格数惩罚（蛛网解-2/领域-5）
    usedSkill: false,               // 使用技能后本轮不可再移动/放技能
    specialUsedRound: 0,
    assistUsedRound: {},
    turn: 'player',
    gameOver: false,
    spatialWindup: null,            // 空间斩：一轮前摇（回合开始时自动斩击选定的范围）
    enemyAttractNoted: false,
    enemyShiki: null,               // 敌方式神 {kind,x,y,hp,maxHp,atk,move,rangeKey,dmgType,heal,roundsLeft}
    infSP: false,                   // 训练营：无限技能点（不消耗、保持满值）
    enemySpecialRound: 0,           // 敌方特技上次使用轮（CD1轮）
    enemyAssistRound: {},           // 敌方援助上次使用轮（CD7轮）
    enemyCang: null,                // 敌方放置的「苍」{x,y}
    enemySummonRound: 0,            // 敌方上次召唤轮次
    enemySp: 1,                     // 敌方技能点（AI 用技能）
    enemyOp: 2,                     // 敌方奥义点（开局2，命中+1，大招消耗）
    enemyUsed: {},                  // 敌方自身增益技能使用记录
    enemyInfinity: 0,               // 敌方「无限」剩余轮数（我方攻击无法命中）
    enemyDomExtend: false,          // 敌方「领域展延」（受伤-30%）
    enemyBlockedRound: false,       // 敌方本轮是否已格挡
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
  function applyDamageBypass(u, amount) {
    var d = Math.round(amount);
    u.hp = Math.max(0, u.hp - d); // 无视护盾（如解·咒词吟唱）
    return d;
  }
  /* 我方对敌方造成伤害的统一入口：处理敌方「无限」与「领域展延」 */
  function damageEnemy(amount, ignoreInfinity) {
    if (state.enemyInfinity > 0 && !ignoreInfinity) {
      toast('🌀 敌方的「无限」使你的攻击无法命中！');
      return 0;
    }
    var amt = Math.round(amount);
    if (state.enemyDomExtend) {
      var reduced = Math.round(amt * 0.7);
      toast('🔰 敌方「领域展延」减伤30%：' + amt + ' → ' + reduced);
      amt = reduced;
    }
    return applyDamage(state.enemy, amt);
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
  var BASE_CELL = 26;         // 1× 缩放时每格像素
  var zoom = 1;               // 当前缩放倍率（0.5–3）
  var CELL = BASE_CELL;       // 实际每格像素 = BASE_CELL × zoom
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
    if (state.enemyCang) {
      mmCtx.fillStyle = '#7a2bd6';
      mmCtx.fillRect(state.enemyCang.x * MM, state.enemyCang.y * MM, MM, MM);
    }
    if (state.enemyShiki) {
      mmCtx.fillStyle = '#b8860b';
      mmCtx.fillRect(state.enemyShiki.x * MM, state.enemyShiki.y * MM, MM, MM);
    }
    if (state.maha) {
      mmCtx.fillStyle = '#d4a017';
      mmCtx.fillRect(state.maha.x * MM, state.maha.y * MM, MM, MM);
    }
    if (state.shiki) {
      mmCtx.fillStyle = '#6b8e23';
      mmCtx.fillRect(state.shiki.x * MM, state.shiki.y * MM, MM, MM);
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
  /* ---------- 地图缩放（手机模式/滚轮/双指均可） ---------- */
  function zoomLabel() {
    var el = document.getElementById('zoom-tag');
    if (el) el.textContent = '🔍 ' + Math.round(zoom * 100) + '%';
  }
  function zoomAt(factor, clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var ax = (typeof clientX === 'number') ? (clientX - rect.left) : canvas.width / 2;
    var ay = (typeof clientY === 'number') ? (clientY - rect.top) : canvas.height / 2;
    var worldX = (camX + ax) / CELL, worldY = (camY + ay) / CELL;
    var next = Math.max(0.5, Math.min(3, zoom * factor));
    if (Math.abs(next - zoom) < 0.001) return;
    zoom = next;
    CELL = Math.max(8, Math.round(BASE_CELL * zoom));
    mapPxW = W * CELL;
    mapPxH = H * CELL;
    camX = worldX * CELL - ax;
    camY = worldY * CELL - ay;
    clampCam();
    draw();
    zoomLabel();
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
    // 领域区域提示（淡紫）
    if (state.domain) {
      state.domain.cells.forEach(function (c) {
        var px = c.x * CELL - camX, py = c.y * CELL - camY;
        if (px > -CELL && py > -CELL && px < canvas.width + CELL && py < canvas.height + CELL) {
          ctx.fillStyle = 'rgba(150,90,255,.14)';
          ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
        }
      });
    }
    // 敌方领域区域提示
    if (state.enemyDomain) {
      for (var ey = Math.max(0, state.enemy.y - 7); ey <= Math.min(H - 1, state.enemy.y + 7); ey++) {
        for (var ex = Math.max(0, state.enemy.x - 7); ex <= Math.min(W - 1, state.enemy.x + 7); ex++) {
          var epx = ex * CELL - camX, epy = ey * CELL - camY;
          if (epx > -CELL && epy > -CELL && epx < canvas.width + CELL && epy < canvas.height + CELL) {
            ctx.fillStyle = 'rgba(255,120,120,.12)';
            ctx.fillRect(epx + 1, epy + 1, CELL - 2, CELL - 2);
          }
        }
      }
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
    drawEnemyObjects();
    drawUnit(state.player, '#3f8cff', '#eaf4ff');
    drawUnit(state.enemy, '#ff5252', '#ffecec');
    drawShiki();
    drawMaha();
    drawMinimap();
  }
  function drawShiki() {
    if (!state.shiki) return;
    var cx = (state.shiki.x + 0.5) * CELL - camX, cy = (state.shiki.y + 0.5) * CELL - camY;
    if (cx < -24 || cy < -24 || cx > canvas.width + 24 || cy > canvas.height + 24) return;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = '#6b8e23';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.min(15, Math.round(CELL * 0.52)) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.shiki.kind.charAt(0), cx, cy);
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
  function drawEnemyObjects() {
    // 敌方「苍」
    if (state.enemyCang) {
      var cx = (state.enemyCang.x + 0.5) * CELL - camX, cy = (state.enemyCang.y + 0.5) * CELL - camY;
      if (cx > -24 && cy > -24 && cx < canvas.width + 24 && cy < canvas.height + 24) {
        ctx.beginPath();
        ctx.arc(cx, cy, CELL * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = '#7a2bd6';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold ' + Math.min(15, Math.round(CELL * 0.5)) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('苍', cx, cy);
      }
    }
    // 敌方式神
    if (state.enemyShiki) {
      var sx = (state.enemyShiki.x + 0.5) * CELL - camX, sy = (state.enemyShiki.y + 0.5) * CELL - camY;
      if (sx > -24 && sy > -24 && sx < canvas.width + 24 && sy < canvas.height + 24) {
        ctx.beginPath();
        ctx.arc(sx, sy, CELL * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = '#b8860b';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold ' + Math.min(15, Math.round(CELL * 0.52)) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(state.enemyShiki.kind).charAt(0), sx, sy);
      }
    }
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
        + (state.ap > 0 ? '●' : '○') + '（剩余步数 ' + Math.max(0, state.moveCap - (state.playerSlow || 0) - state.movedThisRound) + '/' + Math.max(0, state.moveCap - (state.playerSlow || 0)) + '）</span></div>';
      html += '<div class="stat-line"><span class="label">移动上限</span><b>6+等级' + ((c && c.level) || 0) + ' = ' + state.moveCap + ' 格</b></div>';
      html += '<div class="stat-line"><span class="label">技能点</span><span class="dots">'
        + '●'.repeat(state.sp) + '○'.repeat(Math.max(0, spCapOf() - state.sp)) + ' ' + state.sp + '/' + spCapOf() + '</span></div>';
      html += '<div class="stat-line"><span class="label">奥义点</span><span class="dots">'
        + '●'.repeat(state.op) + '○'.repeat(6 - state.op) + ' ' + state.op + '/6</span></div>';
      if (/宿傩/.test(displayName(cfg.player))) {
        html += '<div class="stat-line"><span class="label">粉尘值</span><b>' + state.dust + '%</b></div>';
      }
      html += '<div class="stat-line"><span class="label">回合</span><b>' + (state.turn === 'player' ? '我方行动' : '敌方行动') + '</b></div>';
    }
    html += '<div class="pad-label">目前持有状态</div><div class="chips">';
    var chips = [];
    if (u.shield > 0) chips.push('🛡 护盾 ' + u.shield);
    if (state.cang) chips.push('🌀 场上有「苍」');
    if (state.enemyCang) chips.push('🌀 敌方「苍」在场上（每轮结束伤害你）');
    if (state.enemyShiki) chips.push('👹 敌方式神「' + state.enemyShiki.kind + '」 ' + state.enemyShiki.hp + '/' + state.enemyShiki.maxHp);
    if (state.shiki) chips.push('🦉 我方式神「' + state.shiki.kind + '」 ' + state.shiki.hp + '/' + state.shiki.maxHp);
    if (state.enemyInfinity > 0) chips.push('🌀 敌方「无限」（剩 ' + state.enemyInfinity + ' 轮）·你的攻击无法命中');
    if (state.enemyDomExtend) chips.push('🔰 敌方「领域展延」·你的伤害-30%');
    if (state.selected === 'player') {
      if (state.usedSkill) chips.push('🚫 已用技能·不可移动');
      if (state.infinity > 0) chips.push('🌀 无限（剩 ' + state.infinity + ' 轮）·敌方攻击无法命中/无法靠近');
      if (state.chant) chips.push('🕉 咒词吟唱待发（下一个有吟唱形态的技能将以吟唱版释放）');
      if (state.spatialWindup) chips.push('🌀 空间斩前摇中（回合开始自动斩击选定范围）');
      if (state.domExtend) chips.push('🔰 领域展延·受伤-30%·无法使用其余技能');
      if (state.domain) chips.push('🌐 领域展开中（剩 ' + state.domain.rounds + ' 轮）·每轮+20%粉尘');
      if (state.enemyDomain) chips.push('🌐 敌方领域展开中（剩 ' + state.enemyDomain.rounds + ' 轮）');
      if (state.openWindup) chips.push('🌋 「开」蓄力中（被打断则取消）');
      if (state.playerSlow > 0) chips.push('🐌 被领域减速：移动上限-5');
      if (state.breakRounds > 0) chips.push('⚡ 术式熔断：剩 ' + state.breakRounds + ' 轮（仅通用技能）');
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
    if (state.gameOver) return;
    // 训练营：移动“当前选中的单位”（我方或敌方都能操控）
    var unit = (TRAINING && state.selected === 'enemy') ? state.enemy : state.player;
    var isMySide = (unit === state.player);
    if (!TRAINING && state.turn !== 'player') return;
    if (TRAINING && state.turn === 'enemy' && state.aiOn) { toast('🤖 敌方 AI 行动中，请稍候（或关闭 AI 开关）'); return; }
    if (isMySide && state.usedSkill) { toast('🚫 使用技能后本轮不可再进行移动'); return; }
    var used = isMySide ? state.movedThisRound : state.enemyMoved;
    var cap = isMySide
      ? Math.max(0, state.moveCap - (state.playerSlow || 0))
      : Math.max(0, moveCapOf(cfg.enemy) - (state.enemySlow || 0));
    var nx = unit.x + dx, ny = unit.y + dy;
    if (!inBounds(nx, ny)) { toast('⚠ 到达地图边界'); return; }
    if (mapData[ny][nx] !== 0) { toast('⚠ 该格有障碍物'); return; }
    if (used >= cap) { toast('⚠ 该单位本轮步数已用完'); return; }
    var ec = isMySide ? state.enemyCang : state.cang;
    var inAttract = ec && cangArea && cangArea.attract.some(function (o) {
      return unit.x === ec.x + o[0] && unit.y === ec.y + o[1];
    });
    var distBefore = ec ? (Math.abs(unit.x - ec.x) + Math.abs(unit.y - ec.y)) : 0;
    unit.x = nx; unit.y = ny;
    if (isMySide) state.movedThisRound++; else state.enemyMoved++;
    var note = '';
    if (inAttract && ec) {
      var distAfter = Math.abs(nx - ec.x) + Math.abs(ny - ec.y);
      if (distAfter < distBefore) {
        var fx = nx + dx, fy = ny + dy;
        if (inBounds(fx, fy) && mapData[fy][fx] === 0) {
          unit.x = fx; unit.y = fy;
          if (isMySide) state.movedThisRound++; else state.enemyMoved++;
          note = '（被「苍」牵引：额外前进一格）';
        } else {
          note = '（被「苍」牵引，但前方受阻）';
        }
      } else if (distAfter > distBefore) {
        if (isMySide) state.movedThisRound += 1; else state.enemyMoved += 1;
        note = '（远离「苍」：额外消耗 1 格移动力）';
      }
    }
    draw();
    renderStatus();
    var left = Math.max(0, cap - (isMySide ? state.movedThisRound : state.enemyMoved));
    toast((isMySide ? '我方' : '敌方') + '移动到 (' + unit.x + ',' + unit.y + ') 剩余 ' + left + ' 步' + note);
  }

  /* ---------- 技能 ---------- */
  function useSelfSkill(name, hint) {
    toast('「' + name + '」对自身使用：直接生效，无需范围与方向' + (hint ? '（' + hint + '）' : ''));
  }
  function useRangeSkill(name, extra) {
    var dir = DIRS[state.dirIndex];
    toast('「' + name + '」技能范围尚未编写 —— 已记录释放朝向：' + dir.label + (extra ? '（' + extra + '）' : ''));
  }

  /* 冲刺类范围（前冲解/后撤解）：文件里 1=本体 2=冲刺路径 3=伤害区域 */
  function parseDashGrid(g) {
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
    if (!ones.length || !twos.length) return null;
    var own = ones[0];
    function off(c) { return [c[0] - own[0], c[1] - own[1]]; }
    return { own: own, path: twos.map(off), attack: threes.map(off) };
  }
  var dashCache = {};
  function getDash(key) {
    if (!(key in dashCache)) {
      var rc = (typeof RANGE_CODE !== 'undefined') ? RANGE_CODE[key] : null;
      if (rc && rc.path && rc.attack) dashCache[key] = { path: rc.path, attack: rc.attack };
      else dashCache[key] = parseDashGrid(SKILL_RANGES[key]);
    }
    return dashCache[key];
  }
  /* 区域膨胀（后撤解范围+3 用）：四邻域扩展 n 次 */
  function dilateCells(cells, n) {
    var set = {}, out = cells.concat();
    cells.forEach(function (c) { set[c.x + ',' + c.y] = true; });
    for (var i = 0; i < n; i++) {
      var cur = out.concat();
      cur.forEach(function (c) {
        var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        dirs.forEach(function (d) {
          var x = c.x + d[0], y = c.y + d[1];
          if (inBounds(x, y) && !set[x + ',' + y]) { set[x + ',' + y] = true; out.push({ x: x, y: y }); }
        });
      });
    }
    return out;
  }
  /* 开：按粉尘值选择档位范围 */
  function openKeyFor(dust) {
    var tier = dust >= 100 ? 4 : dust >= 80 ? 3 : dust >= 50 ? 2 : dust >= 30 ? 1 : 0;
    var base = SK_PREFIX + '开（此技能能转向）';
    if (!tier) return base;
    return base + ' - ' + [30, 50, 80, 100][tier - 1];
  }
  function openDmgFor(dust) {
    var tier = dust >= 100 ? 4 : dust >= 80 ? 3 : dust >= 50 ? 2 : dust >= 30 ? 1 : 0;
    return [200, 250, 300, 400, 500][tier];
  }

  /* ---------- 咒词吟唱（《咒术回战》系列角色专用） ---------- */
  function isJJKChar(key) { return key.indexOf('《咒术回战》系列角色：') === 0; }
  // 找到某技能的“吟唱形态”（数据里写成「XX（咒词吟唱）」）
  function findChantVariant(name) {
    var c = CHARACTERS[cfg.player];
    if (!c || !c.skills) return null;
    var found = null;
    c.skills.forEach(function (s) {
      if (found) return;
      var m = /^(.+?)（咒词吟唱）$/.exec(s.name);
      if (m && m[1] === name) found = s.name;
    });
    return found;
  }
  function hasAnyChantVariant() {
    var c = CHARACTERS[cfg.player];
    if (!c || !c.skills) return false;
    return c.skills.some(function (s) { return /（咒词吟唱）$/.test(s.name); });
  }
  // 空间斩解锁条件：魔虚罗（援助召唤体/式神）已适应「无限」类技能
  function hasUnlockedSpatial() {
    function adaptedBy(m) {
      if (!m || !m.adapts) return false;
      return Object.keys(m.adapts).some(function (k) {
        return m.adapts[k] && m.adapts[k].done && /无限|无下限/.test(k);
      });
    }
    return adaptedBy(state.maha) || adaptedBy(state.shiki);
  }

  function startAiming(name) {
    // 咒词吟唱：目标是自身，点自己发动，点空白取消
    if (name === '咒词吟唱') {
      if (!hasAnyChantVariant()) { toast('该角色暂无咒词吟唱效果'); return; }
      state.aiming = {
        name: '咒词吟唱',
        cells: [{ x: state.player.x, y: state.player.y }],
        eff: { type: 'chant' },
        rk: null
      };
      draw();
      toast('🕉 点击「自己」发动咒词吟唱（消耗 1 技能点），点空白处取消');
      return;
    }
    var eff = SKILL_EFFECTS[name];
    if (!eff || !eff.rangeKey) { useRangeSkill(name); return; }
    // 开：按当前粉尘值选档位范围
    var rk = (eff.type === 'open') ? openKeyFor(state.dust) : eff.rangeKey;
    var info = getRange(rk);
    if (!info) { toast('没有找到「' + name + '」的范围数据（请到技能范围临时文件里编写）'); return; }
    var cells = [];
    info.cells.forEach(function (o) {
      // 范围按“技能释放方向轮盘”旋转（带 rotate 标记的定向技能）
      var dx = o[0], dy = o[1];
      if (eff.rotate) {
        for (var k = 0; k < state.dirIndex; k++) { var t = dx; dx = -dy; dy = t; }
      }
      var x = state.player.x + dx, y = state.player.y + dy;
      if (inBounds(x, y)) cells.push({ x: x, y: y });
    });
    // 与敌方同格时，本格也算可攻击目标（堆叠规则）
    if (isEnemyAt(state.player.x, state.player.y)) cells.push({ x: state.player.x, y: state.player.y });
    state.aiming = { name: name, cells: cells, eff: eff, rk: rk };
    draw();
    toast('「' + name + '」瞄准中（朝向：' + DIRS[state.dirIndex].label + '）—— 点击高亮格释放，点空白处取消');
  }

  function earnOp() {
    if (state.domain) return; // 领域期间不会获得奥义点
    state.op = Math.min(6, state.op + 1); // 技能命中获得奥义点
  }

  function executeCast(cell) {
    var aim = state.aiming;
    if (!aim) return;
    var eff = aim.eff;
    var name = aim.name;

    // 咒词吟唱：点自己发动（消耗 1 技能点），之后下一个有吟唱形态的技能以吟唱版释放
    if (eff.type === 'chant') {
      if (!hasAnyChantVariant()) { toast('该角色暂无咒词吟唱效果'); state.aiming = null; draw(); return; }
      if (!(TRAINING && state.infSP) && state.sp < 1) { toast('⚠ 技能点不足（咒词吟唱需要 1 点）'); return; }
      if (!(TRAINING && state.infSP)) state.sp -= 1;
      state.chant = true;
      state.aiming = null;
      state.usedSkill = true;
      toast('🕉 咒词吟唱发动！（消耗 1 技能点）下一个有吟唱形态的技能将以吟唱版释放');
      draw(); renderStatus(); renderSkills();
      return;
    }

    // 已发动吟唱 → 该技能若有吟唱形态，自动替换为吟唱版
    var chantApplied = false;
    if (state.chant) {
      var chanted = findChantVariant(name);
      if (chanted) {
        var ce = SKILL_EFFECTS[chanted];
        if (ce && ce.rangeKey) {
          name = chanted;
          eff = ce;
          aim.eff = ce;
          aim.name = chanted;
          aim.rk = ce.rangeKey;
          state.chant = false;
          chantApplied = true;
          // 重新计算瞄准格（吟唱版范围可能不同）
          var cinfo = getRange(ce.rangeKey);
          if (cinfo) {
            var ccells = [];
            cinfo.cells.forEach(function (o) {
              var dx = o[0], dy = o[1];
              if (ce.rotate) {
                for (var k2 = 0; k2 < state.dirIndex; k2++) { var t2 = dx; dx = -dy; dy = t2; }
              }
              var x2 = state.player.x + dx, y2 = state.player.y + dy;
              if (inBounds(x2, y2)) ccells.push({ x: x2, y: y2 });
            });
            if (isEnemyAt(state.player.x, state.player.y)) ccells.push({ x: state.player.x, y: state.player.y });
            aim.cells = ccells;
          }
          if (!aim.cells.some(function (c) { return c.x === cell.x && c.y === cell.y; })) {
            toast('「' + name + '」吟唱版范围不包含该格，请重新点击目标');
            draw();
            return;
          }
          toast('🕉 咒词吟唱生效：以「' + name + '」释放！');
        }
      }
    }
    // 前置校验（不满足则保持瞄准并返回）
    if (eff.needOp && state.op < eff.needOp) {
      toast('⚠ 「' + name + '」奥义点不足（需要 ' + eff.needOp + '，当前 ' + state.op + '）');
      return;
    }
    if (name === '普攻' && state.uni.attack) {
      toast('⚠ 普攻本轮已使用过（每轮 1 次）');
      return;
    }
    if (eff.type === 'attack' && !isEnemyAt(cell.x, cell.y) && !state.sureHit) {
      toast('请瞄准敌人（范围内没有敌人）');
      return;
    }
    if (eff.type === 'shikigami') {
      if (state.deadShikigami[eff.key]) { toast('⚠ 式神「' + eff.key + '」已阵亡，无法再次召唤'); state.aiming = null; draw(); return; }
      if (state.shiki) { toast('⚠ 场上已有式神（可先收回再召唤）'); state.aiming = null; draw(); return; }
    }

    // 技能点结算（按角色设定；六眼→1）
    var cost = costFor(name);
    if (!(TRAINING && state.infSP) && state.sp < cost) {
      toast('⚠ 技能点不足（「' + name + '」需要 ' + cost + ' 点，当前 ' + state.sp + '）');
      return;
    }
    if (!(TRAINING && state.infSP)) state.sp -= cost;

    state.aiming = null;
    state.usedSkill = true; // 用技能后本轮不可再移动（但可继续放技能）
    if (name === '普攻') state.uni.attack = true;

    if (eff.type === 'attack') {
      if (eff.needOp) state.op = 0; // 大招消耗全部奥义点
      // 打到敌方召唤物
      if (state.enemyShiki && cell.x === state.enemyShiki.x && cell.y === state.enemyShiki.y) {
        state.enemyShiki.hp = Math.max(0, state.enemyShiki.hp - eff.dmg);
        var deadS = state.enemyShiki.hp <= 0;
        toast('⚔️「' + name + '」命中敌方式神「' + state.enemyShiki.kind + '」：' + eff.dmg + ' 点伤害' + (deadS ? '（击破！）' : '（剩 ' + state.enemyShiki.hp + ' 血）'));
        if (deadS) state.enemyShiki = null;
        draw(); renderStatus(); renderSkills();
        return;
      }
      var dmg = damageEnemy(eff.dmg, false);
      if (dmg === 0) { draw(); renderStatus(); return; }
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
      // 对范围内所有目标命中（解/捌/蛛网解/咒词解/苍最大功率）
      if (eff.needOp) state.op = 0;
      var inside = state.sureHit || aim.cells.some(function (c) { return c.x === state.enemy.x && c.y === state.enemy.y; });
      var base = eff.hpPct
        ? Math.round((CHARACTERS[cfg.enemy].hp || 1) * eff.hpPct) + (eff.plus || 0)
        : eff.dmg;
      if (inside) {
        var d;
        if (state.enemyInfinity > 0 && !eff.ignoreInfinity) {
          toast('🌀 敌方的「无限」使你的攻击无法命中！');
          d = 0;
        } else if (eff.ignoreShield) {
          d = applyDamageBypass(state.enemy, base);
        } else {
          d = damageEnemy(base, eff.ignoreInfinity);
        }
        if (d === 0 && state.enemyInfinity > 0 && !eff.ignoreInfinity) { draw(); renderStatus(); return; }
        earnOp();
        toast('⚔️「' + name + '」命中！对 ' + nameShort(cfg.enemy) + ' 造成 ' + d + ' 点伤害（消耗 ' + cost + ' 技能点）');
        // 范围技能同时波及敌方召唤物
        if (state.enemyShiki && aim.cells.some(function (c) { return c.x === state.enemyShiki.x && c.y === state.enemyShiki.y; })) {
          state.enemyShiki.hp = Math.max(0, state.enemyShiki.hp - base);
          var deadS2 = state.enemyShiki.hp <= 0;
          toast('💥 范围波及敌方式神「' + state.enemyShiki.kind + '」：' + base + ' 点伤害' + (deadS2 ? '（击破！）' : ''));
          if (deadS2) state.enemyShiki = null;
        }
      } else {
        toast('「' + name + '」范围内没有敌人（朝向 ' + DIRS[state.dirIndex].label + '）');
      }
      if (eff.slow) { state.enemySlow += eff.slow; toast('🕸 蛛网解：敌方本轮可移动格数-2'); }
      checkEnd();
    } else if (eff.type === 'open') {
      // 开：进入一轮蓄力前摇（期间被打断则取消并返还技能点）
      var tierLabel = state.dust >= 100 ? '100%' : state.dust >= 80 ? '80%' : state.dust >= 50 ? '50%' : state.dust >= 30 ? '30%' : '基础';
      var openDmg = openDmgFor(state.dust);
      state.openWindup = { cells: aim.cells, dmg: openDmg, tier: tierLabel };
      toast('🌋「开」蓄力中（粉尘 ' + tierLabel + '）…本轮结束时释放，期间被打断则取消（已消耗 ' + cost + ' 技能点）');
    } else if (eff.type === 'dashAoe') {
      // 前冲解/后撤解：冲刺 + 区域解（文件自带路径/范围）
      var dinfo = getDash(eff.rangeKey);
      if (!dinfo) { toast('没有「' + name + '」的冲刺范围数据'); return; }
      var dD = DIRS[state.dirIndex];
      // 前冲解：向轮盘方向冲 3 格；后撤解：向轮盘反方向后撤 3 格
      var dashVec = eff.out ? { dx: -dD.dx, dy: -dD.dy } : { dx: dD.dx, dy: dD.dy };
      var px = state.player.x, py = state.player.y;
      for (var i2 = 0; i2 < eff.dash; i2++) {
        var nx2 = px + dashVec.dx, ny2 = py + dashVec.dy;
        if (!inBounds(nx2, ny2) || mapData[ny2][nx2] !== 0) break;
        px = nx2; py = ny2;
      }
      state.player.x = px; state.player.y = py;
      var rot = state.dirIndex; // 攻击方向 = 轮盘方向（后撤解即后撤的反方向）
      var cells2 = [];
      dinfo.attack.forEach(function (o) {
        var dx = o[0], dy = o[1];
        for (var k = 0; k < rot; k++) { var t = dx; dx = -dy; dy = t; }
        var x3 = px + dx, y3 = py + dy;
        if (inBounds(x3, y3)) cells2.push({ x: x3, y: y3 });
      });
      if (eff.dilate) cells2 = dilateCells(cells2, eff.dilate);
      var hit2 = state.sureHit || cells2.some(function (c) { return c.x === state.enemy.x && c.y === state.enemy.y; });
      var moveWord = eff.out ? '后撤' : '冲刺';
      if (hit2) {
        var d4 = damageEnemy(eff.dmg, false);
        if (d4 === 0) { draw(); renderStatus(); return; }
        earnOp();
        toast('💫「' + name + '」' + moveWord + '到 (' + px + ',' + py + ')，朝' + dD.label + '打出「解」！' + nameShort(cfg.enemy) + ' 受到 ' + d4 + ' 点伤害');
      } else {
        toast('💫「' + name + '」' + moveWord + '到 (' + px + ',' + py + ')，朝' + dD.label + '打出的「解」未命中');
      }
      checkEnd();
    } else if (eff.type === 'spatial') {
      // 空间斩：需先发动咒词吟唱；一轮前摇，回合开始时自动对上回合选定的范围释放
      state.chant = false;
      state.spatialWindup = { cells: aim.cells, dmg: eff.dmg };
      toast('🌀「空间斩」蓄力完成前摇中…回合开始时自动斩击选定的范围（无视无限与护盾）');
    } else if (eff.type === 'domain') {
      // 领域展开（大招）
      state.domain = { rounds: 5, cells: aim.cells };
      state.op = 0;
      state.enemySlow += 5;
      toast('🌐 领域展开「伏魔御厨子」！持续5轮：每轮结束两次「解」伤害，敌方-5移动，粉尘每轮+20%，期间不获奥义点');
    } else if (eff.type === 'shikigami') {
      // 数值以角色数据为准（数据驱动），表里只提供攻击范围键等兜底
      var sdTable = SHIKIGAMI[eff.key] || {};
      var sDetail = '';
      var ownList = charSkillList(cfg.player);
      for (var si = 0; si < ownList.length; si++) {
        if (ownList[si].name === name) { sDetail = ownList[si].detail || ''; break; }
      }
      var sdP = parseShikiStats(eff.key, sDetail);
      var sd = {
        hp: sdP.hp || sdTable.hp || 200,
        atk: sdP.atk || sdTable.atk || 50,
        move: sdP.move || sdTable.move || 6,
        heal: sdP.heal || sdTable.heal || 0,
        dmgType: sdP.dmgType || sdTable.dmgType || '物理',
        rangeKey: sdTable.rangeKey || (displayName(cfg.player) + '其余十种影法术召唤出的式神攻击范围')
      };
      state.shiki = { kind: eff.key, x: cell.x, y: cell.y, hp: sd.hp, maxHp: sd.hp, heal: sd.heal, rangeKey: sd.rangeKey, atk: sd.atk, move: sd.move, dmgType: sd.dmgType };
      toast('🦉 召唤式神「' + eff.key + '」：' + sd.hp + ' 血 · ' + sd.move + ' 格移动 · 每轮 ' + sd.atk + ' 点' + sd.dmgType + '伤害'
        + (sd.heal ? ' · 每轮自愈 ' + sd.heal : ''));
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
    // 咒词吟唱（《咒术回战》系列角色：列表最上方）
    if (isJJKChar(cfg.player)) {
      var canChant = hasAnyChantVariant();
      var chantBadge = state.chant ? '吟唱待发' : (canChant ? '消耗 1 技能点' : '该角色暂无效果');
      html += '<button class="skill-btn" data-skill="chant" style="border-color:#b07eff;">🕉 咒词吟唱<span class="cd' +
        (state.chant ? ' cooling' : '') + '">' + chantBadge + '</span></button>';
      html += '<div class="skill-group-title">通用技能</div>';
    } else {
      html += '<div class="skill-group-title">通用技能</div>';
    }
    var atkUsed = state.uni.attack, blkUsed = state.uni.block;
    html += '<button class="skill-btn" data-skill="普攻">⚔️ 普攻<span class="cd">' + (atkUsed ? '本轮已用' : '可释放 · 25伤害') + '</span></button>';
    html += '<button class="skill-btn" data-skill="格挡">🛡 格挡<span class="cd">' + (blkUsed ? '本轮已用' : '可释放 · 25护盾') + '</span></button>';

    if (cfg.special && !(TRAINING && state.selected === 'enemy')) {
      var s = SPECIALS[cfg.special];
      var cooling = state.specialUsedRound > 0 && state.round - state.specialUsedRound < 2;
      html += '<div class="skill-group-title">特技（需要奥义点）</div>';
      html += '<button class="skill-btn" data-skill="特技">✨ ' + (s ? s.name : cfg.special) +
        '<span class="cd' + (cooling ? ' cooling' : '') + '">' + (cooling ? '冷却中' : '可用 · CD1轮') + '</span></button>';
    }
    if (cfg.assists && cfg.assists.length && !(TRAINING && state.selected === 'enemy')) {
      html += '<div class="skill-group-title">援助（不消耗奥义点）</div>';
      cfg.assists.forEach(function (k) {
        var a = ASSISTS[k];
        var last = state.assistUsedRound[k] || 0;
        var remain = last > 0 ? 7 - (state.round - last) : 0;
        html += '<button class="skill-btn" data-skill="援助" data-key="' + k + '">🛡 ' + (a ? a.name : k) +
          '<span class="cd' + (remain > 0 ? ' cooling' : '') + '">' + (remain > 0 ? '冷却中剩' + remain + '轮' : '可用 · CD7轮') + '</span></button>';
      });
    }
    var controlFoe = TRAINING && state.selected === 'enemy';
    var own = charSkillList(controlFoe ? cfg.enemy : cfg.player);
    if (controlFoe) {
      html += '<div class="skill-group-title" style="color:#ffb3b3;">操控中：' + nameShort(cfg.enemy) + '（训练营·技能点 ' + state.enemySp + '）</div>';
    }
    if (own.length) {
      html += '<div class="skill-group-title">角色技能（' + nameShort(controlFoe ? cfg.enemy : cfg.player) + '）</div>';
      own.forEach(function (sk) {
        var eff = SKILL_EFFECTS[sk.name];
        var hasRange = eff && eff.rangeKey && getRange(eff.rangeKey);
        var self = isSelfSkill(sk.name, sk.detail);
        var badge;
        if (sk.name === '空间斩') {
          badge = !hasUnlockedSpatial() ? '未解锁（需魔虚罗适应「无限」）' : (state.chant ? '吟唱已就绪' : '需先发动咒词吟唱');
        } else if (hasRange) badge = eff.needOp ? '大招·需奥义点' : '可释放';
        else if (self) badge = '无范围';
        else badge = '范围待定';
        html += '<button class="skill-btn" data-skill="char" data-name="' + sk.name.replace(/"/g, '&quot;') + '">' +
          sk.name + '<span class="cd">' + badge + '</span></button>';
      });
    }
    // 领域内必中锁定
    if (state.domain && !state.sureHit) {
      html += '<button class="skill-btn" data-skill="surehit" style="border-color:#b07eff;">🗡 必中锁定（领域内攻击必定命中敌方）</button>';
    }
    // 式神收回
    if (state.shiki) {
      html += '<button class="skill-btn" data-skill="recall-shiki">📡 收回式神「' + state.shiki.kind + '」（本轮未行动前）</button>';
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
      if (state.breakRounds > 0 && kind !== '普攻' && kind !== '格挡') {
        toast('⚡ 术式熔断中（剩 ' + state.breakRounds + ' 轮）：只能使用通用技能');
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
      if (state.domain && !state.sureHit && kind === 'surehit') {
        state.sureHit = true;
        toast('🗡 必中锁定：此后所有攻击都会打中 ' + nameShort(cfg.enemy) + '（无视范围）');
        renderSkills();
        return;
      }
      if (kind === 'recall-shiki') {
        state.shiki = null;
        toast('📡 式神已收回（未阵亡，可再次召唤）');
        renderSkills();
        return;
      }
      if (kind === 'chant') {
        startAiming('咒词吟唱');
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
        // 训练营：操控敌方释放技能（自动瞄准我方）
        if (TRAINING && state.selected === 'enemy') {
          var forced = pickEnemySkill(name);
          if (!forced) { toast('「' + name + '」当前无法释放（技能点不足 / 打不到目标 / 无范围数据）'); return; }
          executeEnemySkill(forced);
          renderStatus(); renderSkills();
          return;
        }
        var detail = '';
        var own = charSkillList(cfg.player);
        for (var i = 0; i < own.length; i++) {
          if (own[i].name === name) { detail = own[i].detail || ''; break; }
        }
        var eff = SKILL_EFFECTS[name];
        var hasRange = eff && eff.rangeKey && getRange(eff.rangeKey);
        // 空间斩：需先解锁（魔虚罗适应「无限」）+ 已发动咒词吟唱
        if (name === '空间斩') {
          if (!hasUnlockedSpatial()) { toast('⚠ 「空间斩」未解锁：需要你的魔虚罗先适应敌方的「无限」'); return; }
          if (!state.chant) { toast('⚠ 「空间斩」需要先发动咒词吟唱（技能列表最上方）'); return; }
        }
        if (hasRange) { startAiming(name); return; }
        if (isSelfSkill(name, detail)) {
          // 自身类也消耗技能点（按设定）
          var scost = costFor(name);
          if (!(TRAINING && state.infSP) && state.sp < scost) { toast('⚠ 技能点不足（「' + name + '」需要 ' + scost + ' 点）'); return; }
          // 苍（瞬）：传送到苍的位置并使苍消失
          if (name === '苍（瞬）') {
            if (!state.cang) { toast('⚠ 场上没有「苍」，无法瞬移'); return; }
            state.player.x = state.cang.x;
            state.player.y = state.cang.y;
            state.cang = null;
            if (!(TRAINING && state.infSP)) state.sp -= scost;
            state.usedSkill = true;
            toast('🌀「苍（瞬）」！已传送到苍的位置，苍随之消失' + (scost > 0 ? '，消耗 ' + scost + ' 技能点' : ''));
            draw(); renderStatus();
            return;
          }
          // 领域展延：受伤-30%·无视无限·持续至本轮结束·不能使用其余技能
          if (name === '领域展延') {
            if (!(TRAINING && state.infSP)) state.sp -= scost;
            state.domExtend = true;
            state.usedSkill = true;
            toast('🔰「领域展延」：本轮受到伤害 -30%，无视「无限」效果，期间无法使用其余技能，持续至本轮结束');
            draw(); renderStatus();
            return;
          }
          // 无下限术式：获得「无限」状态（2轮）
          if (name === '无下限术式') {
            if (!(TRAINING && state.infSP)) state.sp -= scost;
            state.infinity = 2;
            state.usedSkill = true;
            toast('🌀「无下限术式」：获得「无限」状态（2轮）——敌方攻击无法命中，敌方无法靠近你一格以内' + (scost > 0 ? '，消耗 ' + scost + ' 技能点' : ''));
            draw(); renderStatus();
            return;
          }
          if (!(TRAINING && state.infSP)) state.sp -= scost;
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
    if (state.shiki && enemyInShikiRange()) return 'shiki';
    // 强化模式：领域内必中 → 无视距离直接攻击玩家
    if (AI.sureHit && state.enemyDomain) return 'player';
    if (enemyInPlayerRange()) return 'player';
    return null;
  }
  /* ---------- 式神 AI（鵺/鄂吐/魔虚罗 十种影法术） ---------- */
  function shikiInRange() {
    var info = getRange(state.shiki.rangeKey);
    if (state.enemy.x === state.shiki.x && state.enemy.y === state.shiki.y) return true;
    if (!info) return Math.abs(state.enemy.x - state.shiki.x) + Math.abs(state.enemy.y - state.shiki.y) <= 1;
    return info.cells.some(function (o) {
      return state.enemy.x === state.shiki.x + o[0] && state.enemy.y === state.shiki.y + o[1];
    });
  }
  function shikiStep() {
    var e = state.shiki, p = state.enemy;
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
  function shikiAct() {
    if (!state.shiki || state.gameOver) return;
    var tbl = SHIKIGAMI[state.shiki.kind] || {};
    var sd = {
      move: state.shiki.move || tbl.move || 6,
      atk: state.shiki.atk || tbl.atk || 50,
      dmgType: state.shiki.dmgType || tbl.dmgType || '物理'
    };
    for (var i = 0; i < sd.move; i++) {
      if (shikiInRange()) break;
      if (!shikiStep()) break;
    }
    draw();
    if (shikiInRange()) {
      var d = applyDamage(state.enemy, sd.atk);
      earnOp();
      toast('🦉 式神「' + state.shiki.kind + '」攻击 ' + nameShort(cfg.enemy) + '：' + d + ' 点' + sd.dmgType + '伤害');
      checkEnd();
    }
  }
  function enemyInShikiRange() {
    if (!state.shiki) return false;
    if (state.enemy.x === state.shiki.x && state.enemy.y === state.shiki.y) return true;
    var info = getRange('普攻范围');
    if (!info) return Math.abs(state.enemy.x - state.shiki.x) + Math.abs(state.enemy.y - state.shiki.y) <= 1;
    return info.cells.some(function (o) {
      return state.shiki.x === state.enemy.x + o[0] && state.shiki.y === state.enemy.y + o[1];
    });
  }
  function enemyAttacksShiki() {
    state.shiki.hp = Math.max(0, state.shiki.hp - 25);
    var dead = state.shiki.hp <= 0;
    toast('⚔️ ' + nameShort(cfg.enemy) + ' 普攻式神：25 点伤害' + (dead ? '（式神被击破！）' : '（' + state.shiki.kind + ' ' + state.shiki.hp + ' 血）'));
    if (dead) {
      state.deadShikigami[state.shiki.kind] = true; // 阵亡不可再召唤
      state.shiki = null;
    }
    renderStatus();
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
  /* ============================================================
     通用 AI（所有角色共用）：从角色数据读取技能 → 解析消耗/范围/伤害
     → 自动选择能打到玩家的最优技能；自身增益类技能按需开启
     特殊角色（例如带领域的）以后再单独补充规则
     ============================================================ */
  function parseSkillDamage(detail, name) {
    var d = detail || '';
    // 血量上限百分比型（如 捌：敌人血量上限10％＋10×手指数的伤害）
    var pm = /血量上限\s*(\d+)\s*[％%]/.exec(d);
    if (pm) {
      var base = Math.round((CHARACTERS[cfg.player].hp || 1) * parseInt(pm[1], 10) / 100);
      var addM = /＋\s*(\d+)/.exec(d);
      return base + (addM ? parseInt(addM[1], 10) : 0);
    }
    // “手指”公式：按 20 根手指估算（宿傩默认 20 指）
    var fm = /(\d+)\s*×\s*手指数/.exec(d);
    if (fm) return parseInt(fm[1], 10) * 20;
    // 普通固定伤害
    var m = /造成\s*(\d+)\s*点伤害/.exec(d);
    if (m) return parseInt(m[1], 10);
    if (/近战伤害/.test(d) || name === '普攻') return 25;
    return 0;
  }
  function enemySkillCost(skill) {
    var c = spCostOf(skill.detail || '');
    if (c > 0 && hasSixEyes(cfg.enemy)) c = 1; // 六眼：消耗变为1
    return c;
  }
  // 生成候选行动（可打到玩家的技能 / 自身增益）；forceName 可强制只评估某个技能
  function pickEnemySkill(forceName) {
    var c = CHARACTERS[cfg.enemy];
    var best = null;
    var sureHit = AI.sureHit && state.enemyDomain;
    (c.skills || []).forEach(function (s) {
      if (forceName && s.name !== forceName) return;
      var short = s.name.replace(/[（(].*$/, '');
      if (short === '普攻' || short === '格挡') return;
      var d = s.detail || '';
      if (/对自身造成/.test(d)) return;            // 自伤类技能不主动用（避免 AI 自杀）
      var cost = enemySkillCost(s);
      if (!(TRAINING && state.infSP) && cost > state.enemySp) return;
      var eff = SKILL_EFFECTS[s.name];
      // 放置/召唤类技能 AI 暂不主动使用（避免误用）；领域类由领域时机逻辑处理
      if (eff && (eff.type === 'placeCang' || eff.type === 'shikigami' || eff.type === 'domain')) return;
      var selfOnly = isSelfSkill(s.name, d) && !(eff && eff.rangeKey);
      if (selfOnly) {
        var key = 'self:' + s.name;
        if (state.enemyUsed[key] && state.round - state.enemyUsed[key] < 2) return; // 每2轮最多一次
        if (!best) best = { type: 'self', name: s.name, cost: cost, dmg: 0, key: key, detail: d };
        return;
      }
      var rk = (eff && eff.rangeKey) || (displayName(cfg.enemy) + s.name);
      var info = getRange(rk);
      if (!info) return;                            // 没有范围数据 → 不乱放
      var needOp = eff && eff.needOp;
      if (needOp && state.enemyOp < needOp) return;  // 大招需奥义点
      for (var r = 0; r < 4; r++) {
        var cells = [];
        info.cells.forEach(function (o) {
          var dx = o[0], dy = o[1];
          for (var k = 0; k < r; k++) { var t = dx; dx = -dy; dy = t; }
          var x = state.enemy.x + dx, y = state.enemy.y + dy;
          if (inBounds(x, y)) cells.push({ x: x, y: y });
        });
        var hit = cells.some(function (p) { return p.x === state.player.x && p.y === state.player.y; });
        if (hit || sureHit) {
          var dmg = parseSkillDamage(d, s.name);
          if (!best || dmg > best.dmg) {
            best = { type: 'skill', name: s.name, cost: cost, dmg: dmg, rot: r, cells: cells, detail: d, needOp: needOp || 0 };
          }
          break;
        }
      }
    });
    return best;
  }
  function executeEnemySkill(act) {
    if (!(TRAINING && state.infSP)) state.enemySp -= act.cost;
    if (act.needOp) state.enemyOp = 0;
    if (act.type === 'self') {
      state.enemyUsed[act.key] = state.round;
      if (/无下限术式/.test(act.name) && !/瞬/.test(act.name)) {
        state.enemyInfinity = 2;
        toast('🌀 ' + nameShort(cfg.enemy) + ' 使用「' + act.name + '」：获得「无限」（你 2 轮内的攻击将无法命中）');
      } else if (/领域展延/.test(act.name)) {
        state.enemyDomExtend = true;
        toast('🔰 ' + nameShort(cfg.enemy) + ' 使用「领域展延」：本轮受到伤害 -30%');
      } else {
        toast('✨ ' + nameShort(cfg.enemy) + ' 使用「' + act.name + '」（自身增益，消耗 ' + act.cost + ' 技能点）');
      }
      return;
    }
    var bypassInfinity = /无视“无限”|无视"无限"|无视无限/.test(act.detail || '');
    var ignoreShield = /无视护盾/.test(act.detail || '') || /咒词/.test(act.name);
    if (state.infinity > 0 && !bypassInfinity && !(AI.sureHit && state.enemyDomain)) {
      toast('🛡「无限」使 ' + nameShort(cfg.enemy) + ' 的「' + act.name + '」无法命中！');
      return;
    }
    if (act.dmg <= 0) {
      toast('⚔️ ' + nameShort(cfg.enemy) + ' 使用「' + act.name + '」');
      return;
    }
    var d;
    if (ignoreShield) d = applyDamageBypass(state.player, act.dmg);
    else d = applyDamage(state.player, act.dmg);
    state.enemyOp = Math.min(6, state.enemyOp + 1); // 命中获得奥义点
    toast('⚔️ ' + nameShort(cfg.enemy) + ' 使用「' + act.name + '」：造成 ' + d + ' 点伤害'
      + (ignoreShield ? '（无视护盾/无限）' : '') + '（消耗 ' + act.cost + ' 技能点）');
  }
  /* 敌方玩家攻击结算：通用技能优先级 → 普攻保底 */
  /* ============================================================
     召唤类 AI：会召唤式神、并按难度决定“收回保命”或“舍弃换优势”
     放置类 AI：按场上情况选择放置位置（如「苍」压在玩家身上）
     ============================================================ */
  function parseShikiStats(name, detail) {
    var d = detail || '';
    var hp = (/具有\s*(\d+)\s*点血/.exec(d) || [])[1];
    var atk = (/造成\s*(\d+)\s*点/.exec(d) || [])[1];
    var mv = (/(\d+)\s*格的移动/.exec(d) || [])[1];
    var heal = (/回复\s*(\d+)\s*点血/.exec(d) || [])[1];
    var dmgType = /雷电/.test(d) ? '雷电' : (/正向能量/.test(d) ? '正向能量' : '物理');
    return {
      hp: hp ? parseInt(hp, 10) : 200,
      atk: atk ? parseInt(atk, 10) : 50,
      move: mv ? parseInt(mv, 10) : 6,
      heal: heal ? parseInt(heal, 10) : 0,
      dmgType: dmgType
    };
  }
  // 找一个可用的召唤技能（数据驱动）
  function findSummonSkill() {
    var c = CHARACTERS[cfg.enemy];
    var found = null;
    (c.skills || []).forEach(function (s) {
      if (found) return;
      var short = s.name.replace(/[（(].*$/, '');
      if (short !== '十种影法术') return;
      if (/光环|魔虚罗的光环/.test(s.name)) return;
      var cost = enemySkillCost(s);
      if (!(TRAINING && state.infSP) && cost > state.enemySp) return;
      var eff = SKILL_EFFECTS[s.name];
      var rk = (eff && eff.rangeKey) || (displayName(cfg.enemy) + '十种影法术召唤范围');
      var info = getRange(rk);
      if (!info) return;
      var kindM = /十种影法术（(.+?)）/.exec(s.name);
      var kind = kindM ? kindM[1] : short;
      found = { name: s.name, cost: cost, kind: kind, cells: info.cells, detail: s.detail || '' };
    });
    return found;
  }
  // 放置类技能（如 苍 / 苍（定点））
  function findPlaceSkill() {
    var c = CHARACTERS[cfg.enemy];
    var found = null;
    (c.skills || []).forEach(function (s) {
      if (found) return;
      var eff = SKILL_EFFECTS[s.name];
      if (!eff || eff.type !== 'placeCang') return;
      var cost = enemySkillCost(s);
      if (!(TRAINING && state.infSP) && cost > state.enemySp) return;
      var info = getRange(eff.rangeKey);
      if (!info) return;
      found = { name: s.name, cost: cost, cells: info.cells, detail: s.detail || '', rotate: !!eff.rotate };
    });
    return found;
  }
  // 放置：优先压玩家所在格，其次挑最接近玩家的格子
  function enemyDoPlace() {
    if (!AI.place || state.enemyCang) return false;
    if (state.player.hp <= 0) return false;
    var sk = findPlaceSkill();
    if (!sk) return false;
    var cells = [];
    sk.cells.forEach(function (o) {
      var dx = o[0], dy = o[1];
      if (sk.rotate) {
        for (var k = 0; k < state.dirIndex; k++) { var t = dx; dx = -dy; dy = t; }
      }
      var x = state.enemy.x + dx, y = state.enemy.y + dy;
      if (inBounds(x, y) && mapData[y][x] === 0) cells.push({ x: x, y: y });
    });
    if (!cells.length) return false;
    // 优先放在玩家身上；否则放在离玩家最近、且不影响自己移动的格子
    var target = null, bestD = 1e9;
    cells.forEach(function (c) {
      var d = Math.abs(c.x - state.player.x) + Math.abs(c.y - state.player.y);
      var onPlayer = (c.x === state.player.x && c.y === state.player.y);
      var score = onPlayer ? -1 : d;
      if (score < bestD) { bestD = score; target = c; }
    });
    if (!target) return false;
    if (!(TRAINING && state.infSP)) state.enemySp -= sk.cost;
    state.enemyCang = { x: target.x, y: target.y };
    var msg = '🌀 ' + nameShort(cfg.enemy) + ' 使用「' + sk.name + '」在 (' + target.x + ',' + target.y + ') 生成「苍」';
    if (cangArea) {
      var inside = cangArea.attack.some(function (o) { return state.player.x === state.enemyCang.x + o[0] && state.player.y === state.enemyCang.y + o[1]; });
      if (inside) {
        var d0 = applyDamage(state.player, 75);
        msg += '，你正处于伤害范围，受到 ' + d0 + ' 点伤害！';
      } else {
        msg += '（压制走位）';
      }
    }
    toast(msg + '（消耗 ' + sk.cost + ' 技能点）');
    return true;
  }
  // 召唤：按场上情况决定是否召唤
  function enemyDoSummon() {
    if (!AI.summon || state.enemyShiki) return false;
    if (state.round === state.enemySummonRound) return false;
    var sk = findSummonSkill();
    if (!sk) return false;
    var cheb = Math.max(Math.abs(state.enemy.x - state.player.x), Math.abs(state.enemy.y - state.player.y));
    if (cheb <= 1 && AI.summonCare >= 0.5) return false; // 困难/强化：贴身先打，不急着召唤
    var stats = parseShikiStats(sk.kind, sk.detail);
    var rangeKey = SK_PREFIX_ANY() + '其余十种影法术召唤出的式神攻击范围';
    var info = getRange((SHIKIGAMI[sk.kind] && SHIKIGAMI[sk.kind].rangeKey) || rangeKey);
    // 落点：召唤范围内离玩家最近的合法格（作为前线）
    var best = null, bestD = 1e9;
    sk.cells.forEach(function (o) {
      var x = state.enemy.x + o[0], y = state.enemy.y + o[1];
      if (!inBounds(x, y) || mapData[y][x] !== 0) return;
      if (x === state.player.x && y === state.player.y) return;
      var d = Math.abs(x - state.player.x) + Math.abs(y - state.player.y);
      if (d < bestD) { bestD = d; best = { x: x, y: y }; }
    });
    if (!best) return false;
    if (!(TRAINING && state.infSP)) state.enemySp -= sk.cost;
    state.enemySummonRound = state.round;
    state.enemyShiki = {
      kind: sk.kind, x: best.x, y: best.y,
      hp: stats.hp, maxHp: stats.hp, atk: stats.atk, move: stats.move,
      heal: stats.heal, dmgType: stats.dmgType,
      rangeKey: (SHIKIGAMI[sk.kind] && SHIKIGAMI[sk.kind].rangeKey) || (displayName(cfg.enemy) + '其余十种影法术召唤出的式神攻击范围')
    };
    toast('🦉 ' + nameShort(cfg.enemy) + ' 召唤式神「' + sk.kind + '」！（' + stats.hp + '血 · ' + stats.move + '格 · 每轮 ' + stats.atk + ' ' + stats.dmgType + '）');
    return true;
  }
  // 收回/舍弃：按难度与场上形势判断
  function enemyDecideSummonFate() {
    var s = state.enemyShiki;
    if (!s) return;
    if (!AI.summonCare) return; // 简单/普通：不操心，让它自己打
    var ratio = s.hp / s.maxHp;
    if (ratio > AI.summonCare) return;
    var pMax = CHARACTERS[cfg.player].hp || 1;
    var eMax = CHARACTERS[cfg.enemy].hp || 1;
    var pRatio = state.player.hp / pMax;
    var eRatio = state.enemy.hp / eMax;
    // 玩家已经残血 → 舍弃式神换进攻节奏；自己快被打崩 → 也留着当肉盾
    if (pRatio <= 0.35 || eRatio <= 0.3) {
      toast('⚔️ ' + nameShort(cfg.enemy) + ' 舍弃了式神「' + s.kind + '」（换取进攻优势）');
      return;
    }
    // 否则收回保命（收回后可再次召唤）
    state.enemyShiki = null;
    toast('📡 ' + nameShort(cfg.enemy) + ' 收回了式神「' + s.kind + '」（保存实力，之后可再召唤）');
  }
  function SK_PREFIX_ANY() { return displayName(cfg.enemy); }
  /* 敌方特技（消耗奥义点，CD1轮）：血量偏低时使用 */
  function enemyTrySpecial() {
    if (!cfg.enemySpecial) return false;
    var s = SPECIALS[cfg.enemySpecial];
    if (!s) return false;
    if (state.enemySpecialRound > 0 && state.round - state.enemySpecialRound < 2) return false;
    var eMax = CHARACTERS[cfg.enemy].hp || 1;
    if (state.enemy.hp / eMax > 0.6) return false;
    if (state.enemyOp < 1 && !(TRAINING && state.infSP)) return false;
    if (!(TRAINING && state.infSP)) state.enemyOp -= 1;
    state.enemySpecialRound = state.round;
    if (/反转术式/.test(s.name)) {
      var heal = Math.round(eMax * 0.1);
      state.enemy.hp = Math.min(eMax, state.enemy.hp + heal);
      toast('✨ ' + nameShort(cfg.enemy) + ' 使用特技「' + s.name + '」：回复 ' + heal + ' 点血量（消耗 1 奥义点）');
    } else {
      toast('✨ ' + nameShort(cfg.enemy) + ' 使用特技「' + s.name + '」（消耗 1 奥义点）');
    }
    return true;
  }
  /* 敌方援助（不消耗资源，固定CD7轮） */
  function enemyTryAssist() {
    var list = cfg.enemyAssists || [];
    if (!list.length) return false;
    for (var i = 0; i < list.length; i++) {
      var key = list[i];
      var a = ASSISTS[key];
      if (!a) continue;
      var last = state.enemyAssistRound[key] || 0;
      if (last > 0 && state.round - last < 7) continue;
      if (/魔虚罗/.test(a.name)) {
        if (state.enemyShiki) continue;
        if (state.round < 2 && !(TRAINING && state.infSP)) continue;   // 第一轮先观察
        state.enemyAssistRound[key] = state.round;
        var st = parseShikiStats('魔虚罗', a.raw || '');
        var sx = state.enemy.x + 1, sy = state.enemy.y;
        if (!inBounds(sx, sy) || mapData[sy][sx] !== 0) { sx = state.enemy.x; sy = state.enemy.y; }
        state.enemyShiki = {
          kind: '魔虚罗', x: sx, y: sy,
          hp: 600, maxHp: 600, atk: st.atk || 150, move: st.move || 8, heal: st.heal || 450,
          dmgType: '正向能量', roundsLeft: 3,
          rangeKey: displayName(cfg.enemy) + '其余十种影法术召唤出的式神攻击范围'
        };
        toast('🛡 ' + nameShort(cfg.enemy) + ' 使用援助「魔虚罗」！（600血 · 存在3轮 · AI操控）');
        return true;
      }
      state.enemyAssistRound[key] = state.round;
      toast('🛡 ' + nameShort(cfg.enemy) + ' 使用援助「' + a.name + '」');
      return true;
    }
    return false;
  }
  // 敌方式神行动
  function enemyShikiAct() {
    var s = state.enemyShiki;
    if (!s || state.gameOver) return;
    for (var i = 0; i < s.move; i++) {
      if (enemyShikiInRange()) break;
      var dx = state.player.x - s.x, dy = state.player.y - s.y;
      var moved = false;
      var tries = [];
      if (dx !== 0) tries.push([dx > 0 ? 1 : -1, 0]);
      if (dy !== 0) tries.push([0, dy > 0 ? 1 : -1]);
      for (var t = 0; t < tries.length; t++) {
        var nx = s.x + tries[t][0], ny = s.y + tries[t][1];
        if (inBounds(nx, ny) && mapData[ny][nx] === 0) { s.x = nx; s.y = ny; moved = true; break; }
      }
      if (!moved) break;
    }
    if (enemyShikiInRange()) {
      if (state.infinity > 0) {
        toast('🛡「无限」使敌方式神的攻击无法命中！');
      } else {
        var d = applyDamage(state.player, s.atk);
        toast('🦉 敌方式神「' + s.kind + '」攻击你：' + d + ' 点' + s.dmgType + '伤害');
        checkEnd();
      }
    }
  }
  function enemyShikiInRange() {
    var s = state.enemyShiki;
    if (!s) return false;
    if (s.x === state.player.x && s.y === state.player.y) return true;
    var info = getRange(s.rangeKey);
    if (!info) return Math.abs(s.x - state.player.x) + Math.abs(s.y - state.player.y) <= 1;
    return info.cells.some(function (o) {
      return state.player.x === s.x + o[0] && state.player.y === s.y + o[1];
    });
  }

  function enemyAttackPlayer() {
    var e = state.enemy;
    var eMax = CHARACTERS[cfg.enemy].hp || 1;
    var hpRatio = e.hp / eMax;
    var dist = Math.abs(e.x - state.player.x) + Math.abs(e.y - state.player.y);
    var sureHit = AI.sureHit && state.enemyDomain; // 强化：领域内必中

    // 「开」蓄力被打断
    if (state.openWindup) {
      state.sp = Math.min(spCapOf(), state.sp + 4);
      state.openWindup = null;
      toast('💢 「开」蓄力被 ' + nameShort(cfg.enemy) + ' 打断！技能取消（返还 4 技能点）');
      return;
    }

    // 1) 通用技能（按角色数据自动选择）
    if (AI.useSkills) {
      var act = pickEnemySkill();
      if (act) { executeEnemySkill(act); return; }
    }

    // 2) 普攻（保底）
    if (sureHit || state.infinity <= 0) {
      var baseDmg = 25;
      var passives = (CHARACTERS[cfg.enemy].passives || []).join('');
      if (/双面四臂/.test(passives)) baseDmg += 25;
      if (state.domExtend) {
        var reduced = Math.round(baseDmg * 0.7);
        applyDamage(state.player, reduced);
        toast('🔰 领域展延减伤30%：' + nameShort(cfg.enemy) + ' 对你造成 ' + reduced + ' 点伤害');
      } else {
        var dmg = applyDamage(state.player, baseDmg);
        state.enemyOp = Math.min(6, state.enemyOp + 1);
        toast('⚔️ ' + nameShort(cfg.enemy) + ' 对你普攻：造成 ' + dmg + ' 点伤害');
      }
    } else {
      toast('🛡「无限」使 ' + nameShort(cfg.enemy) + ' 的攻击无法命中！');
    }
  }

  /* 敌方走位（按难度）：
     简单/普通：直冲玩家
     困难/强化：保持距离（风筝）并使用「解」光束时先对齐同行/同列 */
  function enemySmartStep() {
    var e = state.enemy, p = state.player;
    var cheb = Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y));
    var aligned = (e.x === p.x || e.y === p.y);
    var tries = [];
    if (AI.kiting && cheb <= 1) {
      // 拉开距离：背离玩家
      if (p.x !== e.x) tries.push([e.x > p.x ? 1 : -1, 0]);
      if (p.y !== e.y) tries.push([0, e.y > p.y ? 1 : -1]);
    } else if (AI.alignBeam && !aligned) {
      // 对齐光束：优先走能对齐的轴，并保持 2 格以上
      if (e.y !== p.y) tries.push([0, e.y > p.y ? -1 : 1]);
      if (e.x !== p.x) tries.push([e.x > p.x ? -1 : 1, 0]);
    }
    // 默认接近
    if (p.x !== e.x) tries.push([e.x > p.x ? 1 : -1, 0]);
    if (p.y !== e.y) tries.push([0, e.y > p.y ? 1 : -1]);
    for (var i = 0; i < tries.length; i++) {
      var nx = e.x + tries[i][0], ny = e.y + tries[i][1];
      var blockedByInfinity = state.infinity > 0 &&
        Math.abs(nx - state.player.x) <= 1 && Math.abs(ny - state.player.y) <= 1;
      if (inBounds(nx, ny) && mapData[ny][nx] === 0 && !blockedByInfinity) { e.x = nx; e.y = ny; return true; }
    }
    return false;
  }

  function enemyTurn() {
    if (state.gameOver) return;
    state.turn = 'enemy';
    draw();
    renderStatus();
    toast('⏳ ' + nameShort(cfg.enemy) + ' 开始行动…（难度：' + AI.name + '）');
    state.playerSlow = 0; // 敌方领域减速在玩家回合生效后重置
    mahaAct(); // 玩家召唤的魔虚罗先行（AI操控）
    shikiAct(); // 式神也先行
    if (state.gameOver) return;
    // 敌方式神：先决定命运（收回保命 / 舍弃换优势），再行动；随后按需召唤与放置
    enemyDecideSummonFate();
    enemyShikiAct();
    if (state.gameOver) return;
    enemyTrySpecial();
    enemyTryAssist();
    enemyDoSummon();
    enemyDoPlace();
    draw(); renderStatus();
    if (state.gameOver) return;
    // 敌方「苍」的每轮结束效果
    if (state.enemyCang && cangArea && state.player.hp > 0) {
      var inEC = cangArea.attack.some(function (o) {
        return state.player.x === state.enemyCang.x + o[0] && state.player.y === state.enemyCang.y + o[1];
      });
      if (inEC) {
        var dEC = applyDamage(state.player, 75);
        toast('🌀 敌方「苍」每轮结束：你受到 ' + dEC + ' 点伤害');
        checkEnd();
      }
    }
    if (state.gameOver) return;
    // 敌方式神每轮自愈 + 援助召唤体的存在时限
    if (state.enemyShiki && state.enemyShiki.heal > 0) {
      state.enemyShiki.hp = Math.min(state.enemyShiki.maxHp, state.enemyShiki.hp + state.enemyShiki.heal);
    }
    if (state.enemyShiki && typeof state.enemyShiki.roundsLeft === 'number') {
      state.enemyShiki.roundsLeft--;
      if (state.enemyShiki.roundsLeft <= 0) {
        state.enemyShiki = null;
        toast('⏳ 敌方援助魔虚罗到了时限（3轮），消失');
      }
    }
    // 敌方宿傩：按“时机判定”择机展开领域（不再固定轮次秒开）
    if (isSukunaKey(cfg.enemy) && enemyShouldOpenDomain()) {
      state.enemyDomain = { rounds: 5 };
      var reason = (state.enemy.hp / (CHARACTERS[cfg.enemy].hp || 1)) >= 0.3 ? '压制时机成熟' : '劣势翻盘';
      toast('🌐 ' + nameShort(cfg.enemy) + ' 展开领域「伏魔御厨子」！（' + reason + '）' + (AI.sureHit ? ' 领域内攻击必中' : ''));
      draw(); renderStatus();
    }
    var cap = Math.max(0, moveCapOf(cfg.enemy) - state.enemySlow - (state.domain ? 5 : 0));
    var steps = 0;
    var iv = setInterval(function () {
      if (state.gameOver) { clearInterval(iv); return; }
      var target = enemyAttackTarget();
      if (target) {
        clearInterval(iv);
        if (target === 'maha') {
          enemyAttacksMaha();
        } else if (target === 'shiki') {
          enemyAttacksShiki();
        } else {
          enemyAttackPlayer();
        }
        renderStatus();
        checkEnd();
        if (!state.gameOver) setTimeout(endEnemyTurn, 900);
        else { clearInterval(iv); }
        return;
      }
      if (steps < cap) {
        // 「苍」吸附范围（新规则）：靠近苍时每次移动额外向该方向多走一格；远离苍时每格多消耗一格
        var inAttract = state.cang && cangArea && cangArea.attract.some(function (o) {
          return state.enemy.x === state.cang.x + o[0] && state.enemy.y === state.cang.y + o[1];
        });
        if (inAttract && !state.enemyAttractNoted) {
          state.enemyAttractNoted = true;
          toast('🌀 敌方陷入「苍」吸附范围：靠近被牵引，远离更费力');
        }
        var distBefore = state.cang ? (Math.abs(state.enemy.x - state.cang.x) + Math.abs(state.enemy.y - state.cang.y)) : 0;
        var moved = enemySmartStep();
        var distAfter = state.cang ? (Math.abs(state.enemy.x - state.cang.x) + Math.abs(state.enemy.y - state.cang.y)) : 0;
        if (inAttract && state.cang) {
          if (distAfter < distBefore) {
            // 靠近：被牵引，额外免费向苍移动一格（不能斜走）
            var gx = state.cang.x - state.enemy.x, gy = state.cang.y - state.enemy.y;
            var sx = gx > 0 ? 1 : (gx < 0 ? -1 : 0), sy = gy > 0 ? 1 : (gy < 0 ? -1 : 0);
            var triesFree = [];
            if (sx !== 0) triesFree.push([sx, 0]);
            if (sy !== 0) triesFree.push([0, sy]);
            for (var fi = 0; fi < triesFree.length; fi++) {
              var fx = state.enemy.x + triesFree[fi][0], fy = state.enemy.y + triesFree[fi][1];
              if (inBounds(fx, fy) && mapData[fy][fx] === 0) { state.enemy.x = fx; state.enemy.y = fy; break; }
            }
            steps += 1;
          } else if (distAfter > distBefore) {
            steps += 2; // 远离：多消耗一格
          } else {
            steps += 1;
          }
        } else {
          steps += 1;
        }
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
    // 空间斩：回合开始自动斩击上回合选定的范围
    if (state.spatialWindup) {
      var inSpat = state.spatialWindup.cells.some(function (c) { return c.x === state.enemy.x && c.y === state.enemy.y; });
      if (inSpat) {
        var dSp = applyDamageBypass(state.enemy, state.spatialWindup.dmg);
        earnOp();
        toast('🌀「空间斩」自动斩击！' + nameShort(cfg.enemy) + ' 受到 ' + dSp + ' 点伤害（无视无限与护盾）');
        checkEnd();
      } else {
        toast('🌀「空间斩」斩空（敌人已离开选定范围）');
      }
      state.spatialWindup = null;
    }
    if (state.gameOver) return;
    // 「开」蓄力完成：本轮结束时释放（若敌方仍在打击区内）
    if (state.openWindup) {
      var hitOpen = state.sureHit || state.openWindup.cells.some(function (c) { return c.x === state.enemy.x && c.y === state.enemy.y; });
      if (hitOpen) {
        var dOpen = damageEnemy(state.openWindup.dmg, false);
        if (dOpen > 0) earnOp();
        toast('🌋「开」蓄力完成！轰击（粉尘 ' + state.openWindup.tier + '）：' + nameShort(cfg.enemy) + ' 受到 ' + dOpen + ' 点伤害');
        checkEnd();
      } else {
        toast('🌋「开」蓄力完成但敌人已不在打击范围');
      }
      state.openWindup = null;
    }
    if (state.gameOver) return;
    // 敌方领域：每轮结束两次「解」+ 玩家减速
    if (state.enemyDomain) {
      state.enemyDomain.rounds--;
      var inED = Math.abs(state.player.x - state.enemy.x) <= 7 && Math.abs(state.player.y - state.enemy.y) <= 7;
      if (inED) {
        var dE1 = applyDamage(state.player, 200);
        var dE2 = applyDamage(state.player, 200);
        state.playerSlow = 5;
        toast('🌐 敌方领域每轮结束：两次「解」对你造成 ' + (dE1 + dE2) + ' 点伤害（已减速-5）');
        checkEnd();
      }
      if (state.enemyDomain && state.enemyDomain.rounds <= 0) state.enemyDomain = null;
    }
    if (state.gameOver) return;
    // 术式熔断递减
    if (state.breakRounds > 0) state.breakRounds--;
    // 领域展开：每轮结束两次「解」伤害 + 粉尘+20%
    if (state.domain) {
      state.domain.rounds--;
      state.dust = Math.min(100, state.dust + 20);
      var inDomain = state.domain.cells.some(function (c) { return c.x === state.enemy.x && c.y === state.enemy.y; });
      if (inDomain) {
        var d1 = applyDamage(state.enemy, 200);
        var d2 = applyDamage(state.enemy, 200);
        toast('🌐 领域每轮结束两次「解」：' + nameShort(cfg.enemy) + ' 受到 ' + (d1 + d2) + ' 点伤害');
        checkEnd();
      }
      if (state.domain && state.domain.rounds <= 0) {
        state.domain = null;
        state.breakRounds = 5;
        toast('🌐 领域结束！进入术式熔断 5 轮（只能使用通用技能）');
      }
    }
    if (state.gameOver) return;
    // 式神：每轮结束自愈 + 鄂吐靠近角色时额外为角色回血
    if (state.shiki && state.shiki.heal > 0) {
      state.shiki.hp = Math.min(state.shiki.maxHp, state.shiki.hp + state.shiki.heal);
    }
    if (state.shiki && state.shiki.kind === '鄂吐') {
      var nearP = Math.max(Math.abs(state.shiki.x - state.player.x), Math.abs(state.shiki.y - state.player.y)) <= 3;
      if (nearP) {
        var pMaxHp = CHARACTERS[cfg.player].hp || 1;
        var before = state.player.hp;
        state.player.hp = Math.min(pMaxHp, state.player.hp + 400);
        if (state.player.hp > before) {
          toast('🦉 鄂吐在你身边：每轮结束为你回复 ' + (state.player.hp - before) + ' 点血量');
          renderStatus();
        }
      }
    }
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
    state.sp = Math.min(spCapOf(), state.sp + spRegenOf());
    state.movedThisRound = 0;
    state.uni = { attack: false, block: false };
    state.usedSkill = false;
    state.enemyAttractNoted = false;
    state.enemySlow = 0; // 敌方减速每轮重置（蛛网解/领域）
    // 敌方技能点/奥义点回复（诅咒之王：技能点上限6、每轮+2）
    state.enemySp = Math.min(spCapForKey(cfg.enemy), state.enemySp + spRegenForKey(cfg.enemy));
    state.enemyOp = Math.min(6, state.enemyOp + 1);
    state.enemyBlockedRound = false;
    if (state.enemyInfinity > 0) state.enemyInfinity--;
    state.enemyDomExtend = false;
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
    if (TRAINING) renderSkills();
  }
  document.getElementById('sel-me').addEventListener('click', function () { selectUnit('player'); });
  document.getElementById('sel-enemy').addEventListener('click', function () { selectUnit('enemy'); });

  document.getElementById('btn-end-round').addEventListener('click', function () {
    if (state.gameOver) return;
    if (state.turn !== 'player') { toast('⏳ 敌方回合进行中…'); return; }
    if (TRAINING && !state.aiOn) {
      // 训练营（AI 关闭）：直接推进轮次，敌方由玩家手动操控
      state.round++;
      state.ap = 1;
      state.sp = Math.min(spCapOf(), state.sp + spRegenOf());
      state.movedThisRound = 0;
      state.enemyMoved = 0;
      state.enemySp = Math.min(spCapForKey(cfg.enemy), state.enemySp + spRegenForKey(cfg.enemy));
      state.uni = { attack: false, block: false };
      state.usedSkill = false;
      state.domExtend = false;
      if (state.enemyInfinity > 0) state.enemyInfinity--;
      state.enemyDomExtend = false;
      document.getElementById('round-info').textContent = '第 ' + state.round + ' 轮';
      draw(); renderStatus(); renderSkills();
      if (state.infSP) { state.sp = spCapOf(); state.enemySp = spCapForKey(cfg.enemy); state.op = 6; state.enemyOp = 6; }
      toast('⏭ 训练营：第 ' + state.round + ' 轮开始（AI 已关闭，双方都由你操控）');
      return;
    }
    enemyTurn();
  });
  // 训练营：AI 开关
  var aiToggle = document.getElementById('btn-ai-toggle');
  if (aiToggle) {
    aiToggle.textContent = '🤖 AI：' + (state.aiOn ? '开' : '关');
    aiToggle.addEventListener('click', function () {
      state.aiOn = !state.aiOn;
      aiToggle.textContent = '🤖 AI：' + (state.aiOn ? '开' : '关');
      toast('训练营：敌方 AI 已' + (state.aiOn ? '开启（敌方自动行动）' : '关闭（敌方由你操控）'));
    });
  }
  document.getElementById('btn-toggle-left').addEventListener('click', function () {
    document.querySelector('.left-col').classList.toggle('hidden-col');
  });
  document.getElementById('btn-toggle-right').addEventListener('click', function () {
    document.querySelector('.right-col').classList.toggle('hidden-col');
  });
  window.addEventListener('resize', resize);
  // 缩放按钮 / 滚轮 / 双指
  document.getElementById('zoom-in').addEventListener('click', function () { zoomAt(1.25); });
  document.getElementById('zoom-out').addEventListener('click', function () { zoomAt(1 / 1.25); });
  document.getElementById('zoom-reset').addEventListener('click', function () {
    zoom = 1; CELL = BASE_CELL; mapPxW = W * CELL; mapPxH = H * CELL;
    centerCam(); draw(); zoomLabel();
    toast('🔍 缩放已复位（100%）');
  });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
  }, { passive: false });
  // 双指缩放
  var pinchStart = 0;
  function touchDist(t) {
    var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
  canvas.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) pinchStart = touchDist(e.touches);
  }, { passive: true });
  canvas.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2 && pinchStart > 0) {
      var d = touchDist(e.touches);
      if (d > 0) zoomAt(d / pinchStart, (e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
      pinchStart = d;
      e.preventDefault();
    }
  }, { passive: false });
  canvas.addEventListener('touchend', function () { pinchStart = 0; });

  /* ---------- 初始化 ---------- */
  var diffTag = document.getElementById('diff-tag');
  if (diffTag) diffTag.textContent = TRAINING ? '训练营' : ('难度 ' + AI.name);
  var aiBtnInit = document.getElementById('btn-ai-toggle');
  if (aiBtnInit && TRAINING) aiBtnInit.style.display = '';
  // 训练营便利按钮
  var TRAIN_IDS = ['btn-reset-hp', 'btn-reset-pos', 'btn-inf-sp'];
  if (TRAINING) {
    TRAIN_IDS.forEach(function (id) {
      var el2 = document.getElementById(id);
      if (el2) el2.style.display = '';
    });
  }
  var hpBtn = document.getElementById('btn-reset-hp');
  if (hpBtn) hpBtn.addEventListener('click', function () {
    var pMax = CHARACTERS[cfg.player].hp || 1, eMax = CHARACTERS[cfg.enemy].hp || 1;
    state.player.hp = pMax; state.player.shield = 0;
    state.enemy.hp = eMax; state.enemy.shield = 0;
    if (state.shiki) { state.shiki.hp = state.shiki.maxHp; }
    if (state.enemyShiki) { state.enemyShiki.hp = state.enemyShiki.maxHp; }
    if (state.maha) { state.maha.hp = 600; }
    draw(); renderStatus();
    toast('🔄 训练营：双方血量已重置（我方 ' + pMax + ' / 敌方 ' + eMax + '）');
  });
  var posBtn = document.getElementById('btn-reset-pos');
  if (posBtn) posBtn.addEventListener('click', function () {
    state.player.x = 10; state.player.y = 10;
    state.enemy.x = W - 11; state.enemy.y = H - 11;
    state.movedThisRound = 0; state.enemyMoved = 0;
    centerCam(); draw(); renderStatus();
    toast('📍 训练营：双方位置已重置到起始格');
  });
  var infBtn = document.getElementById('btn-inf-sp');
  if (infBtn) {
    infBtn.textContent = '♾ 技能点：' + (state.infSP ? '开' : '关');
    infBtn.addEventListener('click', function () {
      state.infSP = !state.infSP;
      infBtn.textContent = '♾ 技能点：' + (state.infSP ? '开' : '关');
      if (state.infSP) {
        state.sp = spCapOf();
        state.enemySp = spCapForKey(cfg.enemy);
        state.op = 6;
        state.enemyOp = 6;
      }
      renderStatus(); renderSkills();
      toast('训练营：无限技能点已' + (state.infSP ? '开启（技能点/奥义点保持满值，不消耗）' : '关闭'));
    });
  }
  zoomLabel();
  listClick(document.getElementById('skill-list'));
  renderSkills();
  renderDir();
  renderStatus();
  resize();
  toast('第 1 轮开始！（AI 难度：' + AI.name + '）➕➖ 或滚轮/双指可缩放地图');
})();
