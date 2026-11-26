/* =====================================================================
   모드 / 방 / 실시간 연결 (모든 페이지 공통, <head>에서 가장 먼저 불러옵니다)
   - 모드: 'solo' = PC 단독(브라우저에만 저장), 'link' = 모바일 연동(Supabase Realtime Broadcast)
   - 화면 배치: 'top' = PC(점수판 상단), 'side' = 모바일 가로(점수판 왼쪽)
   - 점수 변경은 "누를 때만" 작은 메시지 1건으로 전송합니다. (주기적 조회 없음)
   ===================================================================== */
(function () {
  const SS = window.sessionStorage, LS = window.localStorage;
  const qs = new URLSearchParams(location.search);
  const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  /* QR로 들어온 ?room=코드 → 연동 모드로 전환 */
  const urlRoom = (qs.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (urlRoom.length === 6) { try { SS.setItem('tg.mode', 'link'); SS.setItem('tg.room', urlRoom); LS.setItem('tg.lastRoom', urlRoom); } catch (e) {} }
  const lq = qs.get('layout');
  if (lq === 'side' || lq === 'top') { try { SS.setItem('tg.layout', lq); } catch (e) {} }

  /* 화면 배치: 터치 기기(휴대폰)는 가로 모드 + 왼쪽 점수판, 그 외(PC)는 기존 상단 점수판 */
  let layout = null; try { layout = SS.getItem('tg.layout'); } catch (e) {}
  if (!layout) {
    const phone = window.matchMedia && matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 900;
    layout = phone ? 'side' : 'top';
  }
  document.documentElement.setAttribute('data-layout', layout);

  function get(k) { try { return SS.getItem(k); } catch (e) { return null; } }
  function mode() { return get('tg.mode') === 'link' && /^[A-Z0-9]{6}$/.test(get('tg.room') || '') ? 'link' : 'solo'; }
  function room() { return mode() === 'link' ? get('tg.room') : null; }
  function genRoom() { let s = ''; const a = new Uint8Array(6); crypto.getRandomValues(a); a.forEach(v => s += ALPHA[v % ALPHA.length]); return s; }
  function setSolo() { try { SS.setItem('tg.mode', 'solo'); SS.removeItem('tg.room'); } catch (e) {} }
  function setLink(code) { try { SS.setItem('tg.mode', 'link'); SS.setItem('tg.room', code); LS.setItem('tg.lastRoom', code); } catch (e) {} }
  function lastRoom() { try { const r = LS.getItem('tg.lastRoom'); return /^[A-Z0-9]{6}$/.test(r || '') ? r : null; } catch (e) { return null; } }
  function joinUrl(code) { return new URL('index.html?room=' + code, location.href).href; }

  /* ---------- 실시간 연결 ---------- */
  let client = null, channel = null, status = 'idle', peers = 0;
  const statusCbs = [];
  function setStatus(s) { status = s; statusCbs.forEach(f => f(s)); }
  function onStatus(f) { statusCbs.push(f); f(status); }
  const peerCbs = [];
  function onPeers(f) { peerCbs.push(f); f(peers); }

  function connect(onMsg, onOpen) {
    const code = room(); if (!code) return;
    const C = window.TG_CONFIG || {};
    if (!window.RealtimeClient || !C.url) { setStatus('offline'); return; }
    setStatus('connecting');
    client = new window.RealtimeClient(C.url.replace(/^http/, 'ws') + '/realtime/v1', { params: { apikey: C.key, eventsPerSecond: 30 } });
    channel = client.channel('tg-' + code, { config: { broadcast: { self: false, ack: false } } });
    channel.on('broadcast', { event: '*' }, m => { try { onMsg(m.event, m.payload || {}); } catch (e) { console.error(e); } });
    channel.on('presence', { event: 'sync' }, () => {            // 같은 방에 접속한 기기 수
      peers = Object.keys(channel.presenceState()).length; peerCbs.forEach(f => f(peers));
    });
    channel.subscribe(s => {
      if (s === 'SUBSCRIBED') { setStatus('online'); try { channel.track({ t: Date.now() }); } catch (e) {} onOpen && onOpen(); }
      else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('offline');
    });
  }
  function disconnect() { try { if (channel) channel.unsubscribe(); if (client) client.disconnect(); } catch (e) {} channel = null; client = null; setStatus('offline'); }
  function wipeStorage() {                         // 이 브라우저에 저장된 점수/기록/방 정보를 모두 삭제
    try {
      Object.keys(LS).filter(k => k.indexOf('targetGame.') === 0 || k.indexOf('tg.') === 0).forEach(k => LS.removeItem(k));
      Object.keys(SS).filter(k => k.indexOf('tg.') === 0).forEach(k => SS.removeItem(k));
    } catch (e) {}
  }
  function send(event, payload) {
    if (!channel) return;
    try { channel.send({ type: 'broadcast', event, payload }); } catch (e) { setStatus('offline'); }
  }

  /* ---------- 연결 표시(알약) + QR 안내창 ---------- */
  function mountPill(parent) {
    if (mode() !== 'link') return;
    const code = room();
    const pill = document.createElement('div');
    pill.className = 'lk-pill';
    pill.innerHTML = '<i class="dot"></i><span class="lbl"></span><b>방 ' + code + '</b><span class="peers"></span><span class="qr">📱 QR</span>';
    parent.appendChild(pill);
    const lbl = pill.querySelector('.lbl');
    const names = { idle: '', connecting: '연결 중', online: '연결됨', offline: '끊김' };
    onStatus(s => { pill.dataset.s = s; lbl.textContent = names[s] || ''; lbl.style.display = names[s] ? '' : 'none'; });
    const pe = pill.querySelector('.peers');
    onPeers(n => { pe.textContent = n > 0 ? '기기 ' + n + '대' : ''; pe.style.display = n > 0 ? '' : 'none'; });
    pill.addEventListener('click', openModal);
    window.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

    function closeModal() { const m = document.getElementById('lk-modal'); if (m) m.remove(); }
    function openModal() {
      closeModal();
      const url = joinUrl(code);
      let svg = '';
      try { const q = qrcode(0, 'M'); q.addData(url); q.make(); svg = q.createSvgTag({ cellSize: 10, margin: 2, scalable: true }); } catch (e) {}
      const m = document.createElement('div');
      m.id = 'lk-modal';
      m.innerHTML = '<div class="box"><div class="h">📱 모바일 연동</div>' +
        '<div class="qrbox">' + svg + '</div>' +
        '<div class="code">' + code + '</div>' +
        '<div class="url">' + url + '</div>' +
        '<div class="tip">휴대폰 카메라로 QR을 찍거나, 휴대폰 첫 화면에서 방 코드를 입력하세요.<br>양쪽 화면의 <b>방 코드가 같아야</b> 점수가 연동됩니다.</div>' +
        '<div class="btns"><button id="lk-close" class="pri">닫기</button></div></div>';
      document.getElementById('stage').appendChild(m);
      m.addEventListener('click', e => { if (e.target === m) closeModal(); });
      m.querySelector('#lk-close').onclick = closeModal;
    }
    if (get('tg.showqr') === '1') { try { SS.removeItem('tg.showqr'); } catch (e) {} setTimeout(openModal, 0); }
  }

  window.TG_SYNC = { mode, room, layout, genRoom, setSolo, setLink, lastRoom, joinUrl, connect, send, disconnect, wipeStorage, onStatus, onPeers, mountPill,
    showQrNext() { try { SS.setItem('tg.showqr', '1'); } catch (e) {} } };
})();
