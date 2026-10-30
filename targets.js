/* =====================================================================
   타겟 3종 정의 파일
   - 각 구역의 점수(score)는 여기서 고정되어 있습니다. 숫자를 바꾸면 모든 페이지에 반영됩니다.
   - 좌표 기준: 타겟 영역 1540 x 900 (왼쪽 점수판 380px을 제외한 나머지 전체)
   - 모든 타겟은 이 영역 전체를 빈틈없이 채우고, 구역은 9개, 경계선은 가는 선 하나로 통일되어 있습니다.
   ===================================================================== */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const COLORS = ['#e63946', '#f4a261', '#ffd23f', '#2a9d8f', '#3a86ff', '#8338ec',
                  '#ff5da2', '#06d6a0', '#8ac926', '#00b4d8', '#b5651d', '#9b5de5'];
  const W = 1540, H = 900, CX = W / 2, CY = H / 2;

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const rad = d => d * Math.PI / 180;
  const f = n => n.toFixed(2);
  const fmt = s => (s > 0 ? '+' : '−') + Math.abs(s);
  const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join(' L') + ' Z';

  /* ---------- 1. 사각 과녁: 바깥 4 + 안쪽 4 + 중앙 1 = 9구역 (사각형 틀이 겹겹이) ---------- */
  function t1() {
    const R0 = [0, 0, W, H], R1 = [280, 165, W - 280, H - 165], R2 = [540, 320, W - 540, H - 320];
    const ring = (a, b, scores, c0, fs) => {
      const [ax0, ay0, ax1, ay1] = a, [bx0, by0, bx1, by1] = b;
      return [
        { d: poly([[ax0, ay0], [ax1, ay0], [bx1, by0], [bx0, by0]]), x: CX, y: (ay0 + by0) / 2 },            // 위
        { d: poly([[ax1, ay0], [ax1, ay1], [bx1, by1], [bx1, by0]]), x: (ax1 + bx1) / 2, y: CY },            // 오른쪽
        { d: poly([[ax1, ay1], [ax0, ay1], [bx0, by1], [bx1, by1]]), x: CX, y: (ay1 + by1) / 2 },            // 아래
        { d: poly([[ax0, ay1], [ax0, ay0], [bx0, by0], [bx0, by1]]), x: (ax0 + bx0) / 2, y: CY },            // 왼쪽
      ].map((z, i) => Object.assign(z, { score: scores[i], color: COLORS[c0 + i], fs }));
    };
    return [
      ...ring(R0, R1, [3, -1, -4, 2], 0, 112),
      ...ring(R1, R2, [-3, 4, -5, 2], 4, 112),
      { d: poly([[R2[0], R2[1]], [R2[2], R2[1]], [R2[2], R2[3]], [R2[0], R2[3]]]), x: CX, y: CY, score: 5, color: COLORS[8], fs: 120 },
    ];
  }

  /* ---------- 2. 타원 과녁: 중앙 타원(최고점) + 타원 링 4구역 + 바깥 4구역 = 9구역 ----------
        바깥 구역은 타원 밖 모서리까지 영역 전체를 채웁니다. 중심에서 멀어질수록 점수가 낮아집니다. */
  function t2() {
    const A = CX, B = CY;                                   // 영역에 꼭 맞는 타원(가로 반지름, 세로 반지름)
    const S_IN = 0.30, S_OUT = 0.68;
    const P = (s, t) => [CX + s * A * Math.cos(rad(t)), CY + s * B * Math.sin(rad(t))];
    const arc = (s, [x, y], sweep) => `A${f(s * A)} ${f(s * B)} 0 0 ${sweep} ${f(x)} ${f(y)}`;
    const Z = [];
    // 중앙 타원
    const rx = S_IN * A, ry = S_IN * B;
    Z.push({ d: `M${f(CX - rx)} ${CY} A${f(rx)} ${f(ry)} 0 1 1 ${f(CX + rx)} ${CY} A${f(rx)} ${f(ry)} 0 1 1 ${f(CX - rx)} ${CY} Z`,
             x: CX, y: CY, score: 5, color: COLORS[0], fs: 130 });
    // 타원 링 4구역 (위, 오른쪽, 아래, 왼쪽): 대각선(-135,-45,45,135)으로 분할
    [2, 4, 1, 3].forEach((sc, i) => {
      const t1_ = -135 + i * 90, t2_ = t1_ + 90, [lx, ly] = P((S_IN + S_OUT) / 2, t1_ + 45);
      const a = P(S_OUT, t1_), b = P(S_OUT, t2_), c = P(S_IN, t2_), d = P(S_IN, t1_);
      Z.push({ d: `M${f(a[0])} ${f(a[1])} ${arc(S_OUT, b, 1)} L${f(c[0])} ${f(c[1])} ${arc(S_IN, d, 0)} Z`,
               x: lx, y: ly, score: sc, color: COLORS[1 + i], fs: 112 });
    });
    // 바깥 4구역 (타원 밖 ~ 영역 가장자리)
    const o = t => P(S_OUT, t);
    const outer = [
      { d: `M0 0 L${W} 0 L${f(o(-45)[0])} ${f(o(-45)[1])} ${arc(S_OUT, o(-135), 0)} Z`, x: CX, y: 68 },
      { d: `M${W} 0 L${W} ${H} L${f(o(45)[0])} ${f(o(45)[1])} ${arc(S_OUT, o(-45), 0)} Z`, x: W - 122, y: CY },
      { d: `M${W} ${H} L0 ${H} L${f(o(135)[0])} ${f(o(135)[1])} ${arc(S_OUT, o(45), 0)} Z`, x: CX, y: H - 68 },
      { d: `M0 ${H} L0 0 L${f(o(-135)[0])} ${f(o(-135)[1])} ${arc(S_OUT, o(-225), 0)} Z`, x: 122, y: CY },
    ];
    [-3, -5, -2, -4].forEach((sc, i) => Z.push(Object.assign(outer[i], { score: sc, color: COLORS[5 + i], fs: 112 })));
    return Z;
  }

  /* ---------- 3. 사각 타일: 3 x 3 = 9구역 (영역 전체를 채움) ---------- */
  function t3() {
    const Z = [], S = [3, -5, 2, -1, 5, -3, 4, -2, 1], w = W / 3, h = H / 3;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const k = j * 3 + i;
      Z.push({ d: poly([[i * w, j * h], [(i + 1) * w, j * h], [(i + 1) * w, (j + 1) * h], [i * w, (j + 1) * h]]),
               x: (i + 0.5) * w, y: (j + 0.5) * h, score: S[k], color: COLORS[k], fs: 150 });
    }
    return Z;
  }

  const VIEW = [0, 0, W, H];
  const TARGETS = [
    { id: 1, name: '사각 과녁', desc: '중앙 + 두 겹의 사각 링\n총 9구역', file: 'target1.html', view: VIEW, zones: t1() },
    { id: 2, name: '타원 과녁', desc: '중앙이 최고점인 타원\n총 9구역', file: 'target2.html', view: VIEW, zones: t2() },
    { id: 3, name: '사각 타일', desc: '3 × 3 타일 배치\n총 9구역', file: 'target3.html', view: VIEW, zones: t3() },
  ];

  /* 구역을 SVG에 그린다. onClick이 없으면 미리보기용 */
  function renderZones(svg, T, onClick) {
    const zg = el('g', {}, svg);
    T.zones.forEach(z => {
      const g = el('g', { class: 'zone' }, zg);
      el('path', { d: z.d, fill: z.color, class: 'shape' }, g);
      const t = el('text', { x: z.x, y: z.y, class: 'zt', 'font-size': z.fs }, g);
      t.textContent = fmt(z.score);
      if (onClick) g.addEventListener('click', ev => onClick(z, ev, g));
    });
    return zg;
  }

  /* 1920 x 900 기준 화면을 창 크기에 맞춰 비율 그대로 축소/확대 */
  function fit() {
    const stage = document.getElementById('stage');
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 900);
    stage.style.transform = `translate(${(window.innerWidth - 1920 * s) / 2}px, ${(window.innerHeight - 900 * s) / 2}px) scale(${s})`;
  }
  window.addEventListener('resize', fit);

  window.TARGETS = TARGETS;
  window.TG_UTIL = { el, renderZones, fit, fmt };
})();
