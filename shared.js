/* =====================================================================
   공통 점수판 + 게임 로직 (3개 타겟 페이지가 모두 이 파일을 사용합니다)
   - 점수판은 화면 상단(1920 x 150)에 모든 타겟에서 동일한 위치/크기로 표시됩니다. 팀은 8팀 고정.
   - 점수와 되돌리기 기록은 브라우저(localStorage)에 저장되어 페이지를 이동해도 유지됩니다.
   - 모바일 연동 모드: 점수 변경(누르기/되돌리기/초기화)을 작은 메시지로 방송해 PC·휴대폰이 같은 점수를 봅니다.
   - 휴대폰(side) 배치는 점수판이 왼쪽 세로로 오고, PC(top) 배치는 기존 그대로입니다.
   ===================================================================== */
(function () {
  const { el, renderZones, fit, fmt } = window.TG_UTIL;
  const SYNC = window.TG_SYNC;
  const linked = SYNC.mode() === 'link';
  const TEAMS = [
    { n: '1팀', c: '#ffc2c7' }, { n: '2팀', c: '#ffd3a8' }, { n: '3팀', c: '#ffe9a0' },
    { n: '4팀', c: '#bff0d8' }, { n: '5팀', c: '#bfe1ff' }, { n: '6팀', c: '#d6c8f7' }, { n: '7팀', c: '#ffc9e3' },
    { n: '8팀', c: '#d9ec9f' },
  ];
  const N = TEAMS.length;                       // 8팀 고정
  const KEY = linked ? 'targetGame.link.' + SYNC.room() : 'targetGame.state.v2';   // 단독/연동(방별) 저장 공간 분리
  let state = { scores: Array(N).fill(0), hist: [], sel: -1, rev: 0 };
  const seen = new Set();                        // 이미 반영한 동작 id (중복 수신 방지)
  const mine = [], undone = new Set();           // 이 화면에서 직접 누른 동작 (접속 직후 상대 점수를 받아도 잃지 않게 다시 얹음)
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.scores) && s.scores.length === N && Array.isArray(s.hist)) {
        state = { scores: s.scores.map(Number), hist: s.hist, sel: typeof s.sel === 'number' ? s.sel : -1, rev: +s.rev || 0 };
      }
    } catch (e) { /* 저장소를 못 쓰는 환경이면 무시 */ }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  function start(index) {
    const T = window.TARGETS[index];
    const stage = document.getElementById('stage');
    load();

    stage.innerHTML = `
      <div id="board"></div>
      <div id="arena">
        <svg id="target" viewBox="0 0 1920 930" xmlns="http://www.w3.org/2000/svg"></svg>
        <div id="toast">먼저 위에서<br>팀을 선택하세요!</div>
      </div>`;
    const board = document.getElementById('board');
    const arena = document.getElementById('arena');
    const svg = document.getElementById('target');
    const toast = document.getElementById('toast');

    /* 점수판 (왼쪽: 타겟 선택 이동 / 가운데: 8팀 / 오른쪽 끝: 되돌리기·초기화) */
    board.insertAdjacentHTML('beforeend', '<a class="back" href="select.html"><span>◀</span><span>타겟 선택</span></a>');
    TEAMS.forEach((t, i) => {
      const d = document.createElement('div');
      d.className = 'team'; d.dataset.i = i; d.style.setProperty('--c', t.c);
      d.innerHTML = `<div class="tl"><span class="tname">${t.n}</span><span class="mark">선택</span></div><div class="tscore">0</div>`;
      d.addEventListener('click', () => select(i));
      board.appendChild(d);
    });
    board.insertAdjacentHTML('beforeend',
      `<div class="ctlrow">
         <button class="ctl" id="undo"><span class="ic">↶</span>되돌리기</button>
         <button class="ctl" id="reset"><span class="ic">↺</span>초기화</button>
       </div>`);
    const teamEls = [...board.querySelectorAll('.team')];
    const undoBtn = document.getElementById('undo');
    const resetBtn = document.getElementById('reset');

    /* 타겟 */
    const zoneEls = [...renderZones(svg, T, (z, ev, g) => onZone(z, ev, g, T.zones.indexOf(z))).children];
    const popsG = el('g', {}, svg);

    function renderBoard(bumpIdx) {
      teamEls.forEach((e, i) => {
        const sc = e.querySelector('.tscore');
        sc.textContent = state.scores[i];
        sc.dataset.len = String(sc.textContent.length);   // 글자 수가 많으면 CSS가 글자 크기를 줄여 칸 안에 맞춤
        sc.classList.toggle('neg', state.scores[i] < 0);
        e.classList.toggle('sel', i === state.sel);
        if (i === bumpIdx) { e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); }
      });
      undoBtn.disabled = state.hist.length === 0;
      arena.classList.toggle('locked', state.sel < 0);
    }
    let toastTimer = null;
    function showToast() {
      toast.classList.add('show'); clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('show'), 1300);
    }
    function select(i) { state.sel = i; save(); renderBoard(); toast.classList.remove('show'); }

    function popAt(x, y, score) {
      const t = el('text', { x, y, class: 'pop', fill: score > 0 ? '#7dff9b' : '#ff6b6b' }, popsG);
      t.textContent = fmt(score);
      setTimeout(() => t.remove(), 1000);
    }
    function pop(ev, score) {
      const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
      const q = p.matrixTransform(svg.getScreenCTM().inverse());
      popAt(q.x, q.y, score);
    }

    /* 모든 점수 변화는 apply()를 거칩니다. (내 동작 / 상대 기기에서 온 동작 모두 같은 방식, id로 중복 방지) */
    function apply(op) {
      if (seen.has(op.id)) return false;
      if (op.k === 'add' && state.hist.some(h => h.id === op.id)) return false;   // 이미 받은 점수판에 포함된 동작
      if (op.k === 'add') { state.scores[op.t] += op.d; state.hist.push({ id: op.id, t: op.t, d: op.d }); }
      else if (op.k === 'undo') {
        const i = state.hist.findIndex(h => h.id === op.target);
        if (i < 0) return false;
        const h = state.hist.splice(i, 1)[0]; state.scores[h.t] -= h.d; op.t = h.t;
      }
      else if (op.k === 'reset') { state.scores = Array(N).fill(0); state.hist = []; }
      else return false;
      seen.add(op.id); state.rev++; save();
      return true;
    }
    const emit = op => { if (linked) { SYNC.send('op', op); mine.push(op); if (op.k === 'undo') undone.add(op.target); } };

    function onZone(z, ev, g, zi) {
      if (state.sel < 0) {
        showToast();
        board.classList.remove('shake'); void board.offsetWidth; board.classList.add('shake');
        return;
      }
      const t = state.sel;
      const op = { id: uid(), k: 'add', t, d: z.score, tg: index, z: zi };
      apply(op); emit(op);
      renderBoard(t);
      g.classList.remove('hit'); void g.getBoundingClientRect(); g.classList.add('hit');
      pop(ev, z.score);
    }

    undoBtn.addEventListener('click', () => {
      const h = state.hist[state.hist.length - 1]; if (!h) return;
      if (!h.id) h.id = uid();                      // 예전에 저장된 기록에는 id가 없을 수 있음
      const op = { id: uid(), k: 'undo', target: h.id };
      apply(op); emit(op); renderBoard(h.t);
    });

    /* 초기화: 실수 방지를 위해 3초 안에 한 번 더 누르면 실행 */
    let resetTimer = null;
    function resetLabel(armed) {
      resetBtn.innerHTML = armed ? '<span class="ic">❗</span>한 번 더!' : '<span class="ic">↺</span>초기화';
    }
    resetBtn.addEventListener('click', () => {
      if (!resetTimer) {
        resetLabel(true);
        resetTimer = setTimeout(() => { resetTimer = null; resetLabel(false); }, 3000);
        return;
      }
      clearTimeout(resetTimer); resetTimer = null; resetLabel(false);
      const op = { id: uid(), k: 'reset' };
      apply(op); emit(op);
      renderBoard();
    });

    /* ---------- 모바일 연동: 상대 기기에서 온 메시지 처리 ---------- */
    if (linked) {
      SYNC.mountPill(arena);
      SYNC.connect((event, p) => {
        if (event === 'op') {
          if (!apply(p)) return;
          renderBoard(p.k === 'reset' ? undefined : p.t);
          if (p.k === 'add' && p.tg === index && zoneEls[p.z]) {      // 같은 타겟을 보고 있으면 눌린 구역을 깜빡이고 점수 표시
            const zg = zoneEls[p.z], zz = T.zones[p.z];
            zg.classList.remove('hit'); void zg.getBoundingClientRect(); zg.classList.add('hit');
            popAt(zz.x, zz.y, p.d);
          }
        } else if (event === 'hello') {                               // 새로 들어온 기기에 현재 점수 알려주기
          if (state.rev > 0) setTimeout(() => SYNC.send('state', { scores: state.scores, hist: state.hist, rev: state.rev }), Math.random() * 250);
        } else if (event === 'state') {                               // 더 최신 점수를 받으면 따라가기
          if (p.rev > state.rev && Array.isArray(p.scores) && p.scores.length === N) {
            state.scores = p.scores.map(Number); state.hist = p.hist || []; state.rev = p.rev;
            mine.forEach(op => {                                       // 받은 점수판에 아직 없는 내 점수는 다시 얹기
              if (op.k === 'add' && !undone.has(op.id) && !state.hist.some(h => h.id === op.id)) {
                state.scores[op.t] += op.d; state.hist.push({ id: op.id, t: op.t, d: op.d }); state.rev++;
              }
            });
            save(); renderBoard();
          }
        }
      }, () => SYNC.send('hello', {}));                               // 연결(재연결)될 때마다 최신 점수 요청
    }

    renderBoard(); fit();
  }

  window.TargetGame = { start };
})();
