// 显示模式：电脑模式 / 手机模式（手机模式按 9:19.5 手机比例显示画框，可横屏）
(function () {
  var MKEY = 'boardDuelMode';       // 'pc' | 'phone'
  var OKEY = 'boardDuelOrient';     // 'portrait' | 'landscape'
  var mode = 'pc';
  var orient = 'portrait';
  try {
    mode = localStorage.getItem(MKEY) || 'pc';
    orient = localStorage.getItem(OKEY) || 'portrait';
  } catch (e) { /* 个别环境禁 localStorage，忽略 */ }

  function apply() {
    var de = document.documentElement;
    de.classList.toggle('phone-mode', mode === 'phone');
    de.classList.toggle('phone-landscape', mode === 'phone' && orient === 'landscape');
  }
  apply();

  function setMode(m) {
    mode = m;
    try { localStorage.setItem(MKEY, m); } catch (e) {}
    location.reload();
  }
  function rotate() {
    orient = (orient === 'portrait') ? 'landscape' : 'portrait';
    try { localStorage.setItem(OKEY, orient); } catch (e) {}
    location.reload();
  }

  // 页面任意位置的 [data-mode] / [data-rotate] 都可以切换
  document.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== document.body) {
      if (t.getAttribute && t.getAttribute('data-mode')) { setMode(t.getAttribute('data-mode')); return; }
      if (t.getAttribute && t.getAttribute('data-rotate') !== null && t.getAttribute && t.hasAttribute('data-rotate')) { rotate(); return; }
      t = t.parentNode;
    }
  });

  // 右下角悬浮切换器（所有页面都有，手机模式下也一直可见）
  function build() {
    if (document.getElementById('mode-switcher')) return;
    var box = document.createElement('div');
    box.id = 'mode-switcher';
    var html = '<span class="ms-label">模式</span>' +
      '<button type="button" data-mode="pc" class="' + (mode === 'pc' ? 'on' : '') + '">🖥 电脑</button>' +
      '<button type="button" data-mode="phone" class="' + (mode === 'phone' ? 'on' : '') + '">📱 手机</button>';
    if (mode === 'phone') {
      html += '<button type="button" data-rotate>' + (orient === 'portrait' ? '🔄 横屏' : '🔄 竖屏') + '</button>';
    }
    box.innerHTML = html;
    document.body.appendChild(box);
    // 主界面模式选择块的状态同步
    var pick = document.querySelectorAll('.mode-picker button[data-mode]');
    for (var i = 0; i < pick.length; i++) {
      if (pick[i].getAttribute('data-mode') === mode) pick[i].classList.add('on');
      else pick[i].classList.remove('on');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
