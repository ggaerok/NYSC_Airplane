/* =====================================================================
   공통 점수판 + 게임 로직 (4개 타겟 페이지가 모두 이 파일을 사용합니다)
   - 점수판은 화면 왼쪽에 모든 타겟에서 동일한 위치/크기로 표시됩니다.
   - 점수와 되돌리기 기록은 브라우저(localStorage)에 저장되어 페이지를 이동해도 유지됩니다.
   ===================================================================== */
(function () {
  const { el, renderZones, fit, fmt } = window.TG_UTIL;
  const TEAMS = [
    { n: '1팀', c: '#ff595e' }, { n: '2팀', c: '#ff9f1c' }, { n: '3팀', c: '#ffd23f' },
    { n: '4팀', c: '#3ddc84' }, { n: '5팀', c: '#3a86ff' }, { n: '6팀', c: '#a06bff' }, { n: '7팀', c: '#ff5da2' },
  ];
  const KEY = 'targetGame.state.v1';
  let state = { scores: Array(7).fill(0), hist: [], sel: -1 };

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.scores) && s.scores.length === 7 && Array.isArray(s.hist)) {
        state = { scores: s.scores.map(Number), hist: s.hist, sel: typeof s.sel === 'number' ? s.sel : -1 };
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
        <svg id="target" viewBox="0 0 1540 900" xmlns="http://www.w3.org/2000/svg"></svg>
        <div id="toast">먼저 왼쪽에서<br>팀을 선택하세요!</div>
      </div>`;
    const board = document.getElementById('board');
    const arena = document.getElementById('arena');
    const svg = document.getElementById('target');
    const toast = document.getElementById('toast');

    /* 점수판 (위: 타겟 선택 이동 / 가운데: 7팀 / 아래: 되돌리기·초기화) */
    board.insertAdjacentHTML('beforeend', '<a class="back" href="index.html">◀ 타겟 선택</a>');
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
    renderZones(svg, T, onZone);
    const popsG = el('g', {}, svg);

    function renderBoard(bumpIdx) {
      teamEls.forEach((e, i) => {
        const sc = e.querySelector('.tscore');
        sc.textContent = state.scores[i];
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

    function pop(ev, score) {
      const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
      const q = p.matrixTransform(svg.getScreenCTM().inverse());
      const t = el('text', { x: q.x, y: q.y, class: 'pop', fill: score > 0 ? '#7dff9b' : '#ff6b6b' }, popsG);
      t.textContent = fmt(score);
      setTimeout(() => t.remove(), 1000);
    }

    function onZone(z, ev, g) {
      if (state.sel < 0) {
        showToast();
        board.classList.remove('shake'); void board.offsetWidth; board.classList.add('shake');
        return;
      }
      const t = state.sel;
      state.scores[t] += z.score; state.hist.push({ t, d: z.score }); save();
      renderBoard(t);
      g.classList.remove('hit'); void g.getBoundingClientRect(); g.classList.add('hit');
      pop(ev, z.score);
    }

    undoBtn.addEventListener('click', () => {
      const h = state.hist.pop(); if (!h) return;
      state.scores[h.t] -= h.d; save(); renderBoard(h.t);
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
      state.scores = Array(7).fill(0); state.hist = []; save();
      renderBoard();
    });

    renderBoard(); fit();
  }

  window.TargetGame = { start };
})();
