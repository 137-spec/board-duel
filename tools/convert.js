// 同人棋盘对决 - txt 数据 → 内嵌代码转换器
// 作用：把 txt 格子数据（地图 / 技能范围）转成 JS 常量，写入 data/ 目录。
//       页面直接引用这些 JS，运行时不再读取 txt，因此无需服务器即可运行。
// 用法：双击 convert.bat，或在游戏目录运行 node tools/convert.js
const fs = require('fs');
const path = require('path');

const GAME_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(GAME_DIR, 'data');

const SOURCES = [
  {
    title: '游戏地图',
    dir: 'E:\\游戏地图',
    pattern: /^map_.*\.txt$/i,
    out: 'maps.js',
    varName: 'GAME_MAPS',
    keyOf: (name) => name.replace(/\.txt$/i, '').replace(/^map_/i, ''),
  },
  {
    title: '技能范围',
    dir: 'E:\\游戏角色技能范围临时文件',
    pattern: /\.txt$/i,
    out: 'skills.js',
    varName: 'SKILL_RANGES',
    keyOf: (name) => name.replace(/\.txt$/i, ''),
  },
];

// 把 txt 文本解析成二维数组：每格一个字符，数字字符转成数字，其它保留原字符
function parseGrid(text) {
  const rows = [];
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  for (const line of clean.split('\n')) {
    const t = line.trim();
    if (t === '') continue; // 跳过空行
    const cells = [];
    for (const ch of t) cells.push(/^[0-9]$/.test(ch) ? Number(ch) : ch);
    rows.push(cells);
  }
  if (rows.length === 0) throw new Error('文件内容为空（没有任何格子行）');
  return rows;
}

function rowsToJs(rows) {
  return '[\n' + rows.map((r) => '    [' + r.join(', ') + '],').join('\n') + '\n  ]';
}

fs.mkdirSync(DATA_DIR, { recursive: true });

console.log('=== 同人棋盘对决 数据转换 ===\n');

for (const src of SOURCES) {
  if (!fs.existsSync(src.dir)) {
    console.log('[跳过] 目录不存在: ' + src.dir + '\n');
    continue;
  }
  const files = fs.readdirSync(src.dir).filter((f) => src.pattern.test(f)).sort();
  if (files.length === 0) {
    console.log('[跳过] ' + src.title + ' 目录下没有匹配的 txt: ' + src.dir + '\n');
    continue;
  }

  const entries = [];
  console.log(src.title + ' (' + src.dir + ')');
  for (const file of files) {
    const raw = fs.readFileSync(path.join(src.dir, file), 'utf8');
    const rows = parseGrid(raw);
    const w = rows[0].length;
    const bad = rows.findIndex((r) => r.length !== w);
    if (bad >= 0) {
      throw new Error(file + ' 第 ' + (bad + 1) + ' 行宽度为 ' + rows[bad].length + '，与首行 ' + w + ' 不一致，无法转换');
    }
    entries.push({ key: src.keyOf(file), rows });
    console.log('  ✓ ' + file + ' → ' + rows.length + '×' + w);
  }

  let body = 'const ' + src.varName + ' = {\n';
  for (const e of entries) {
    body += '  ' + JSON.stringify(e.key) + ': ' + rowsToJs(e.rows) + ',\n';
  }
  body += '};\n';

  const js =
    '// 本文件由 tools/convert.js 自动生成，请勿手动修改。\n' +
    '// 数据来源: ' + src.dir + '\n' +
    '// 修改数据后：双击 convert.bat 重新生成。\n' +
    body;

  fs.writeFileSync(path.join(DATA_DIR, src.out), js, 'utf8');
  console.log('  → 已生成 data/' + src.out + '\n');
}

console.log('转换完成！当前页面重新刷新即可使用新数据。');
