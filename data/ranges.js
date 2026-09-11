// ============================================================
// 技能范围（代码定稿版）—— 由 dsh 依据你的范围图记录写死
// 游戏运行时优先使用本文件的范围，不依赖本地 txt 文件
// 表示法：相对偏移 [dx, dy]，角色本格 = [0,0]；上 = -y，右 = +x
// 说明：以后你写出新范围，我会把结果直接补写进这个文件
// ============================================================
var RANGE_CODE = {};

(function () {
  // ---------- 通用：普攻（3×3 去中心） ----------
  RANGE_CODE['普攻范围'] = {
    cells: [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
  };

  // ---------- 生成器 ----------
  function rectCells(w, h, dyEnd) {
    // 以本体为基准：宽 w 居中，纵向从 dyEnd 起向上/向下连续 h 行（不含本体）
    var a = [];
    var x0 = -Math.floor(w / 2), x1 = x0 + w - 1;
    for (var i = 0; i < h; i++) {
      var y = dyEnd - i;
      for (var x = x0; x <= x1; x++) {
        if (x === 0 && y === 0) continue;
        a.push([x, y]);
      }
    }
    return a;
  }
  function centeredRect(w, h) { // 居中矩形去本体（用于方形范围）
    var a = [];
    var x0 = -Math.floor(w / 2), x1 = x0 + w - 1;
    var y0 = -Math.floor(h / 2), y1 = y0 + h - 1;
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        if (x === 0 && y === 0) continue;
        a.push([x, y]);
      }
    }
    return a;
  }
  // 朝上的光束（宽w 高h，紧贴本体上方）
  function beamUp(w, h) { return rectCells(w, h, -1); }

  // ---------- 五条悟（青年高专） ----------
  RANGE_CODE['五条悟（青年高专）苍'] = { cells: centeredRect(7, 5) };          // 7宽×5高 去本体（34格）
  RANGE_CODE['五条悟（青年高专）赫（自爆）'] = { cells: centeredRect(7, 5) };   // 同上
  RANGE_CODE['五条悟（青年高专）苍（定点）'] = { cells: [[0, -6], [-6, 0], [6, 0], [0, 6]] };
  RANGE_CODE['五条悟（青年高专）苍（最大功率）'] = { cells: beamUp(5, 9) };     // 朝上 5宽×9高（可转向）

  // ---------- “苍”的判定区（1=攻击 2=吸附；1与中心0也算吸附，中心0也算攻击） ----------
  (function () {
    var rows = [
      [-6, [], [[0, 0]]],
      [-5, [[0, 0]], [[-2, -1], [1, 2]]],
      [-4, [[-1, 1]], [[-3, -2], [2, 3]]],
      [-3, [[-2, 2]], [[-4, -3], [3, 4]]],
      [-2, [[-2, 2]], [[-5, -3], [3, 5]]],
      [-1, [[-3, 2]], [[-6, -4], [3, 5]]],
      [0, [[-3, -1], [1, 3]], [[-6, -4], [4, 6]]],
      [1, [[-3, 2]], [[-6, -4], [3, 5]]],
      [2, [[-2, 2]], [[-5, -3], [3, 5]]],
      [3, [[-2, 2]], [[-4, -3], [3, 4]]],
      [4, [[-1, 1]], [[-3, -2], [2, 3]]],
      [5, [[0, 0]], [[-2, -1], [1, 2]]],
      [6, [], [[0, 0]]]
    ];
    var attack = [], attractOnly = [];
    function pushSpans(target, spans, dy) {
      spans.forEach(function (s) { for (var x = s[0]; x <= s[1]; x++) target.push([x, dy]); });
    }
    rows.forEach(function (r) { pushSpans(attack, r[1], r[0]); pushSpans(attractOnly, r[2], r[0]); });
    attack.push([0, 0]);
    RANGE_CODE['五条悟（青年高专）“苍”范围'] = {
      attack: attack,
      attract: attractOnly.concat(attack)
    };
  })();

  // ============================================================
  // 宿傩（十种影法术）
  // ============================================================
  var SK = '宿傩（十种影法术）';

  // 解 / 解（咒词吟唱）：朝上光束 3宽×8高（可转向）
  RANGE_CODE[SK + '解（此技能能转向）'] = { cells: beamUp(3, 8) };
  RANGE_CODE[SK + '解（咒词吟唱）（此技能能转向）'] = { cells: beamUp(3, 8) };

  // 捌：3×3 去本体
  RANGE_CODE[SK + '捌'] = { cells: centeredRect(3, 3) };

  // 蛛网解：7×7 去本体
  RANGE_CODE[SK + '蛛网解'] = { cells: centeredRect(7, 7) };

  // 开（可转向）：本体在下方，范围向上展开；随粉尘值 5 档
  RANGE_CODE[SK + '开（此技能能转向）'] = { cells: beamUp(5, 5) };
  RANGE_CODE[SK + '开（此技能能转向） - 30'] = { cells: beamUp(7, 6) };
  RANGE_CODE[SK + '开（此技能能转向） - 50'] = { cells: beamUp(9, 7) };
  RANGE_CODE[SK + '开（此技能能转向） - 80'] = { cells: beamUp(11, 8) };
  RANGE_CODE[SK + '开（此技能能转向） - 100'] = { cells: beamUp(11, 8) };

  // 前冲解（可转向）：本体下方，先冲 3 格，再在光束区（3宽×8高）造成解伤害
  RANGE_CODE[SK + '前冲解（此技能能转向）'] = {
    path: [[0, -1], [0, -2], [0, -3]],
    attack: beamUp(3, 8).map(function (o) { return [o[0], o[1] - 3]; })
  };
  // 后撤解（可转向）：冲 3 格后向反方向打，范围+3（膨胀在代码里做）
  RANGE_CODE[SK + '后撤解（此技能能转向）'] = {
    path: [[-1, -1], [-1, -2], [-1, -3]],
    attack: (function () {
      var a = [];
      for (var y = -11; y <= -4; y++) { for (var x = -1; x <= 1; x++) a.push([x, y]); }
      return a;
    })()
  };

  // 领域展开「伏魔御厨子」：29宽×11高（本体居中）
  RANGE_CODE[SK + '伏魔御厨子'] = { cells: centeredRect(29, 11) };

  // 十种影法术：召唤范围（3×3 去本体）
  RANGE_CODE[SK + '十种影法术召唤范围'] = { cells: centeredRect(3, 3) };

  // 鵺 攻击范围：7宽×5高 去本体
  RANGE_CODE[SK + '鵺攻击范围'] = { cells: centeredRect(7, 5) };

  // 其余式神攻击范围：5宽×3高 去本体
  RANGE_CODE[SK + '其余十种影法术召唤出的式神攻击范围'] = { cells: centeredRect(5, 3) };
})();
