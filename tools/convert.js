// 同人棋盘对决 - 数据转换器（txt → 内嵌 JS 代码）
// 数据源：E:\同人游戏制作开发（用户唯一编辑的目录）
//   ├ 游戏地图\map_*.txt                     → data/maps.js      (GAME_MAPS 格子数组)
//   ├ 游戏角色技能范围临时文件\*.txt          → data/skills.js    (SKILL_RANGES 格子数组)
//   ├ 《咒术回战》系列角色设计\*.txt          → data/characters.js (CHARACTERS 文本+解析)
//   ├ 《咒术回战》系列特技设计\*.txt          → data/specials.js  (SPECIALS 文本)
//   └ 《咒术回战》系列援助设计\*.txt          → data/assists.js   (ASSISTS 文本)
// 用法：双击 convert.bat，或 node tools/convert.js
const fs = require('fs');
const path = require('path');

const GAME_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(GAME_DIR, 'data');
const DEV_DIR = 'E:\\同人游戏制作开发';

// ---------- 通用工具 ----------
function cleanText(text) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}
function firstLine(text) {
  const l = cleanText(text).split('\n').find((x) => x.trim() !== '');
  return l ? l.trim() : '';
}
function parseGrid(text) {
  const rows = [];
  for (const line of cleanText(text).split('\n')) {
    const t = line.trim();
    if (t === '') continue;
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
function writeJs(name, header, body) {
  const js =
    '// 本文件由 tools/convert.js 自动生成，请勿手动修改。\n' +
    '// 数据来源: ' + header + '\n' +
    '// 修改数据后：双击 convert.bat 重新生成。\n' +
    body;
  fs.writeFileSync(path.join(DATA_DIR, name), js, 'utf8');
  console.log('  → 已生成 data/' + name + '\n');
}

// ---------- 角色解析 ----------
// 角色 txt 格式（示例见 五条悟（青年高专）.txt）：
// 第一行=角色名；"X级角色"、"血量：N"；"被动：" 段落；"主动技能：" 段落
function parseCharacter(raw) {
  const text = cleanText(raw).trim();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const name = lines[0];
  const levelM = /(\d+)\s*级/.exec(text);
  const hpM = /血量[:：]\s*(\d+)/.exec(text);
  const passives = [];
  const skills = [];
  let section = null;
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^被动[:：]/.test(l)) { section = 'passive'; continue; }
    if (/^主动技能[:：]/.test(l)) { section = 'skill'; continue; }
    const body = l.replace(/^[:：]\s*/, '');
    if (section === 'passive') passives.push(body);
    else if (section === 'skill') skills.push(body);
  }
  // 技能名：取第一个中文冒号前的部分（无冒号则整行）；适应难度标记（适应难度：N）
  const skillDefs = skills.map((l) => {
    const idx = l.indexOf('：');
    const name = idx >= 0 ? l.slice(0, idx).trim() : l;
    const detail = idx >= 0 ? l.slice(idx + 1).trim() : '';
    const adM = /适应难度\s*[:：]\s*(\d+)/.exec(l);
    return { name, detail, adapt: adM ? parseInt(adM[1], 10) : null };
  });
  return {
    kind: 'character',
    name,
    level: levelM ? parseInt(levelM[1], 10) : null,
    hp: hpM ? parseInt(hpM[1], 10) : null,
    passives,
    skills: skillDefs,
    raw: text,
  };
}

// ---------- 特技 / 援助解析 ----------
// 第一行=名称（可带（特技）/（援助）后缀），其余=说明
function parseEntry(raw, suffix) {
  const text = cleanText(raw).trim();
  if (!text) return null;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let name = (lines[0] || '').replace(new RegExp('（' + suffix + '）$'), '').trim();
  return { name: name || lines[0], raw: text };
}

// ---------- 转换执行 ----------
fs.mkdirSync(DATA_DIR, { recursive: true });
console.log('=== 同人棋盘对决 数据转换 ===\n');

function convertGrids(title, dir, pattern, out, varName, keyOf) {
  if (!fs.existsSync(dir)) { console.log('[跳过] 目录不存在: ' + dir + '\n'); return; }
  const files = fs.readdirSync(dir).filter((f) => pattern.test(f)).sort();
  if (files.length === 0) { console.log('[跳过] ' + title + ' 无匹配文件: ' + dir + '\n'); return; }
  console.log(title + ' (' + dir + ')');
  let body = 'const ' + varName + ' = {\n';
  for (const file of files) {
    const rows = parseGrid(fs.readFileSync(path.join(dir, file), 'utf8'));
    const w = rows[0].length;
    const bad = rows.findIndex((r) => r.length !== w);
    if (bad >= 0) throw new Error(file + ' 第 ' + (bad + 1) + ' 行宽度异常：' + rows[bad].length + ' ≠ ' + w);
    body += '  ' + JSON.stringify(keyOf(file)) + ': ' + rowsToJs(rows) + ',\n';
    console.log('  ✓ ' + file + ' → ' + rows.length + '×' + w);
  }
  body += '};\n';
  writeJs(out, dir, body);
}

function convertTexts(title, dir, pattern, out, varName, parseFn) {
  if (!fs.existsSync(dir)) { console.log('[跳过] 目录不存在: ' + dir + '\n'); return; }
  const files = fs.readdirSync(dir).filter((f) => pattern.test(f)).sort();
  if (files.length === 0) { console.log('[跳过] ' + title + ' 无匹配文件: ' + dir + '\n'); return; }
  console.log(title + ' (' + dir + ')');
  const entries = {};
  for (const file of files) {
    const key = file.replace(/\.txt$/i, '');
    const parseRes = parseFn(fs.readFileSync(path.join(dir, file), 'utf8'), key);
    entries[key] = parseRes || { kind: 'empty', raw: '' };
    console.log('  ✓ ' + file + (parseRes ? '' : ' （空文件，标记待补充）'));
  }
  writeJs(out, dir, 'const ' + varName + ' = ' + JSON.stringify(entries, null, 2) + ';\n');
}

convertGrids('游戏地图', path.join(DEV_DIR, '游戏地图'), /^map_.*\.txt$/i, 'maps.js', 'GAME_MAPS',
  (n) => n.replace(/\.txt$/i, '').replace(/^map_/i, ''));
convertGrids('技能范围', path.join(DEV_DIR, '游戏角色技能范围临时文件'), /\.txt$/i, 'skills.js', 'SKILL_RANGES',
  (n) => n.replace(/\.txt$/i, ''));
convertTexts('角色设计', path.join(DEV_DIR, '《咒术回战》系列角色设计'), /\.txt$/i, 'characters.js', 'CHARACTERS', parseCharacter);
convertTexts('特技设计', path.join(DEV_DIR, '《咒术回战》系列特技设计'), /\.txt$/i, 'specials.js', 'SPECIALS',
  (raw) => parseEntry(raw, '特技'));
convertTexts('援助设计', path.join(DEV_DIR, '《咒术回战》系列援助设计'), /\.txt$/i, 'assists.js', 'ASSISTS',
  (raw) => parseEntry(raw, '援助'));

console.log('转换完成！游戏页面刷新即可使用新数据。');
