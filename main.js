// 同人棋盘对决 - 主菜单脚本
(function () {
  // 数据加载情况（F12 控制台可见）
  if (typeof GAME_MAPS !== 'undefined') {
    console.log('[同人棋盘对决] 已加载地图: ' + Object.keys(GAME_MAPS).join(', '));
  }
  if (typeof SKILL_RANGES !== 'undefined') {
    console.log('[同人棋盘对决] 已加载技能范围: ' + Object.keys(SKILL_RANGES).join(', '));
  }

  var modal = document.getElementById('modal');
  var closeBtn = document.getElementById('modal-close');

  function openModal() {
    if (modal) modal.classList.remove('hidden');
  }
  function closeModal() {
    if (modal) modal.classList.add('hidden');
  }

  // 未开发完成的按钮：弹出提示
  document.querySelectorAll('[data-action="soon"]').forEach(function (btn) {
    btn.addEventListener('click', openModal);
  });

  if (closeBtn) closeBtn.addEventListener('click', closeModal);

  // 点击遮罩关闭弹窗
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });
  }

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });
})();
