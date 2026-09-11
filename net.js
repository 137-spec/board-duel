// 互联网点对点联机内核（WebRTC DataChannel，无需自建服务器）
// 流程：房主生成邀请码 → 对方粘贴并生成应答码 → 房主粘贴应答码 → 连接建立
(function () {
  var ICE = [
    { urls: 'stun:stun.miwifi.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ];
  function enc(obj) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  }
  function dec(code) {
    return JSON.parse(decodeURIComponent(escape(atob(String(code).replace(/\s+/g, '')))));
  }
  function waitIce(pc) {
    return new Promise(function (resolve) {
      if (pc.iceGatheringState === 'complete') return resolve();
      var done = false;
      function check() {
        if (done) return;
        if (pc.iceGatheringState === 'complete') { done = true; resolve(); }
      }
      pc.addEventListener('icegatheringstatechange', check);
      setTimeout(function () { if (!done) { done = true; resolve(); } }, 4000);
    });
  }

  var NET = {
    role: null,
    pc: null,
    dc: null,
    connected: false,
    onConnected: null,
    onMessage: null,
    log: function (msg) { if (typeof NET.onLog === 'function') NET.onLog(msg); },
    send: function (obj) {
      if (NET.dc && NET.dc.readyState === 'open') {
        try { NET.dc.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
      }
      return false;
    },
    // 房主：生成邀请码
    hostOffer: function () {
      NET.role = 'host';
      NET.pc = new RTCPeerConnection({ iceServers: ICE });
      var dc = NET.pc.createDataChannel('game');
      bindChannel(dc);
      return NET.pc.createOffer()
        .then(function (o) { return NET.pc.setLocalDescription(o); })
        .then(function () { return waitIce(NET.pc); })
        .then(function () { return enc(NET.pc.localDescription); });
    },
    // 房主：接收应答码并完成连接
    hostAccept: function (answerCode) {
      return NET.pc.setRemoteDescription(new RTCSessionDescription(dec(answerCode)))
        .then(function () { NET.log('应答码已接收，正在连接…'); });
    },
    // 加入方：粘贴邀请码 → 生成应答码
    guestAnswer: function (offerCode) {
      NET.role = 'guest';
      NET.pc = new RTCPeerConnection({ iceServers: ICE });
      NET.pc.ondatachannel = function (e) { bindChannel(e.channel); };
      return NET.pc.setRemoteDescription(new RTCSessionDescription(dec(offerCode)))
        .then(function () { return NET.pc.createAnswer(); })
        .then(function (a) { return NET.pc.setLocalDescription(a); })
        .then(function () { return waitIce(NET.pc); })
        .then(function () { return enc(NET.pc.localDescription); });
    }
  };

  function bindChannel(dc) {
    NET.dc = dc;
    dc.onopen = function () {
      NET.connected = true;
      NET.log('✅ 已连接！可以开始对战了');
      if (typeof NET.onConnected === 'function') NET.onConnected();
    };
    dc.onclose = function () {
      NET.connected = false;
      NET.log('⚠ 连接已断开');
    };
    dc.onmessage = function (e) {
      var data = null;
      try { data = JSON.parse(e.data); } catch (err) { return; }
      if (typeof NET.onMessage === 'function') NET.onMessage(data);
    };
  }

  window.DSH_NET = NET;
})();
