// 아이디어 보조 어플 — 화면별 설계에 "버튼 → 이동 화면" 화살표 그리기 (Figma 개발용 플러그인)
// 1차 플러그인(화면 설계서 수정)을 실행한 뒤에 실행합니다. 다시 실행하면 화살표를 지우고 새로 그립니다.

const LOG = [];
const log = (s) => LOG.push(s);
const G = (id) => figma.getNodeByIdAsync(id);

function hex(h) {
  return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 };
}
const C = {
  ink: hex('1f1f24'), grey: hex('737380'), back: hex('8f8f9e'), white: hex('ffffff'),
  gBg: hex('e3f4e8'), gTx: hex('1e7a3c'),
};
const S = (c) => [{ type: 'SOLID', color: c }];

// 화살표 종류
const ST = {
  fwd: { color: C.ink, w: 2, label: '앞으로 이동' },
  back: { color: C.back, w: 2, label: '되돌아가기' },
  maybe: { color: C.back, w: 1.5, dash: [6, 4], label: '미정 · 미설계' },
  stay: { color: C.gTx, w: 1.5, label: '화면 유지' },
};

const ORDER = ['01', '01-1', '02', '03', '04', '05', '05-1', '06', '07'];
const GUTTER = 100; // 섹션 사이 간격 (폰 오른쪽 여백 212 + 100 = 화살표 통로 312px)
const ROW_TOP = 120; // 위쪽 '뒤로' 통로
const LANE_GAP = 150; // 폰과 설명 사이 아래쪽 통로

// ---------- 공통 ----------
function T(str, { size = 13, style = 'Regular', color = C.ink } = {}) {
  const t = figma.createText();
  t.fontName = { family: 'Noto Sans KR', style };
  t.fontSize = size;
  t.characters = str;
  t.fills = S(color);
  return t;
}
function AL(dir, o = {}) {
  const f = figma.createFrame();
  f.name = o.name || 'Frame';
  f.layoutMode = dir;
  f.primaryAxisSizingMode = 'AUTO';
  f.counterAxisSizingMode = 'AUTO';
  f.itemSpacing = o.gap || 0;
  const p = o.pad || [0, 0, 0, 0];
  f.paddingTop = p[0]; f.paddingRight = p[1]; f.paddingBottom = p[2]; f.paddingLeft = p[3];
  f.fills = o.fill ? S(o.fill) : [];
  f.cornerRadius = o.radius || 0;
  if (o.stroke) { f.strokes = S(o.stroke); f.strokeWeight = o.sw || 1; }
  if (o.cross) f.counterAxisAlignItems = o.cross;
  f.clipsContent = false;
  return f;
}
const txt = (n) => { const t = n.type === 'TEXT' ? n : n.findOne((x) => x.type === 'TEXT'); return t ? t.characters : ''; };
function need(v, what) { if (!v) throw new Error(`${what}을(를) 찾지 못했어요`); return v; }

// ---------- 섹션 찾기 ----------
async function findRoot() {
  let r = await G('1:49');
  const ok = (n) => n && n.type === 'FRAME' && n.children[0] && n.children[0].type === 'TEXT' && n.children[0].characters === '화면별 설계';
  if (ok(r)) return r;
  r = figma.currentPage.findOne(ok);
  return need(r, "'화면별 설계' 프레임");
}
function collectSections(root) {
  const map = {};
  for (const row of root.children.filter((n) => n.type === 'FRAME')) {
    for (const sec of row.children.filter((n) => n.type === 'FRAME')) {
      const code = sec.name.split(' ')[0];
      if (ORDER.includes(code) && !map[code]) map[code] = sec;
    }
  }
  return map;
}
const phoneOf = (sec) => sec.children[1].children[0];
const appBar = (ph) => ph.children.find((n) => n.type === 'INSTANCE' && n.name === 'AppBar');
const backOf = (ph) => need(appBar(ph) && appBar(ph).findOne((n) => n.name === 'Back'), `${ph.name}의 뒤로 버튼`);
const rightOf = (ph) => need(appBar(ph) && appBar(ph).findOne((n) => n.name === 'RightButton'), `${ph.name}의 기록 버튼`);
function btn(ph, ...labels) {
  for (const l of labels) {
    const b = ph.findOne((n) => n.type === 'INSTANCE' && /Button/.test(n.name) && txt(n) === l);
    if (b) return b;
  }
  throw new Error(`${ph.name}에서 '${labels[0]}' 버튼을 찾지 못했어요`);
}

// ---------- 1) 05 버튼 순서: [새 아이디어 시작 | 공유] ----------
function swapShareButtons(sec) {
  let n = 0;
  for (const f of sec.findAll((x) => x.type === 'FRAME' && x.layoutMode === 'HORIZONTAL' && x.children.length === 2)) {
    if (txt(f.children[0]) === '공유' && txt(f.children[1]) === '새 아이디어 시작') { f.insertChild(0, f.children[1]); n++; }
  }
  return n;
}
function replaceMarkers05(ph) {
  const pb = ph.absoluteBoundingBox;
  const ms = ph.children.filter((n) => n.type === 'INSTANCE' && n.name === 'Marker');
  for (const m of ms) {
    const num = m.componentProperties['번호#1:0'].value;
    const target = num === '3' ? btn(ph, '공유') : num === '4' ? btn(ph, '새 아이디어 시작') : null;
    if (!target) continue;
    const tb = target.absoluteBoundingBox;
    m.x = Math.min(tb.x - pb.x + tb.width - 14, 330);
    m.y = tb.y - pb.y - 10;
  }
}

// ---------- 2) 배치: 한 줄 흐름 순서, 설명은 폰 아래로 ----------
function relayoutSections(root, secs) {
  const rows = root.children.filter((n) => n.type === 'FRAME');
  const row = rows[0];
  ORDER.forEach((c, i) => { if (secs[c]) row.insertChild(Math.min(i, row.children.length), secs[c]); });
  for (const r of rows.slice(1)) if (r.children.length === 0) r.remove();
  row.name = '화면별 설계 — 흐름 순서';
  row.itemSpacing = GUTTER;
  row.paddingTop = ROW_TOP;
  row.paddingBottom = 0;
  row.counterAxisAlignItems = 'MIN';
  for (const c of ORDER) {
    const sec = secs[c];
    if (!sec) continue;
    const pair = sec.children[1];
    pair.layoutMode = 'VERTICAL';
    pair.itemSpacing = LANE_GAP;
    pair.counterAxisAlignItems = 'MIN';
    const col = pair.children[1];
    if (col) col.paddingTop = 0;
  }
  return row;
}

// ---------- 3) 화살표 그리기 ----------
let OV, R;
function rel(node) {
  const b = node.absoluteBoundingBox;
  const x = b.x - R.x, y = b.y - R.y;
  return { x, y, w: b.width, h: b.height, r: x + b.width, b: y + b.height, cx: x + b.width / 2, cy: y + b.height / 2 };
}
function vec(pts, closed) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const mx = Math.min(...xs), my = Math.min(...ys);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0] - mx} ${p[1] - my}`).join(' ') + (closed ? ' Z' : '');
  const v = figma.createVector();
  OV.appendChild(v);
  v.vectorPaths = [{ windingRule: closed ? 'NONZERO' : 'NONE', data: d }];
  v.x = mx; v.y = my;
  return v;
}
function pill(text, st) {
  const p = AL('HORIZONTAL', { pad: [3, 8, 3, 8], radius: 6, fill: st === ST.stay ? C.gBg : C.white, stroke: st === ST.stay ? null : st.color, name: 'Label' });
  if (st.dash) p.dashPattern = [4, 3];
  p.appendChild(T(text, { size: 11, style: st === ST.fwd ? 'Bold' : 'Medium', color: st === ST.fwd ? C.ink : st.color }));
  OV.appendChild(p);
  return p;
}
// pts: 꺾은선 좌표(마지막 점 = 화살촉 끝). lab: {text, x, y, anchor: 'left'|'right'|'center', vAlign: 'above'|'middle'}
function arrow(name, pts, st, lab, opt = {}) {
  const nodes = [];
  const [ex, ey] = pts[pts.length - 1];
  const [px, py] = pts[pts.length - 2];
  const dir = Math.abs(ex - px) > Math.abs(ey - py) ? (ex > px ? 'R' : 'L') : (ey > py ? 'D' : 'U');
  const L = 9, H = 5;
  const back = { R: [-L, 0], L: [L, 0], D: [0, -L], U: [0, L] }[dir];
  const linePts = pts.slice(0, -1).concat([[ex + back[0], ey + back[1]]]);
  const line = vec(linePts, false);
  line.strokes = S(st.color); line.strokeWeight = st.w; line.strokeJoin = 'ROUND'; line.strokeCap = 'ROUND';
  if (st.dash) line.dashPattern = st.dash;
  line.cornerRadius = 10;
  line.name = 'line';
  nodes.push(line);
  const tri = {
    R: [[ex, ey], [ex - L, ey - H], [ex - L, ey + H]],
    L: [[ex, ey], [ex + L, ey - H], [ex + L, ey + H]],
    D: [[ex, ey], [ex - H, ey - L], [ex + H, ey - L]],
    U: [[ex, ey], [ex - H, ey + L], [ex + H, ey + L]],
  }[dir];
  const head = vec(tri, true);
  head.fills = S(st.color); head.strokes = []; head.name = 'head';
  nodes.push(head);
  if (opt.dot !== false) {
    const d = figma.createEllipse();
    OV.appendChild(d);
    d.resize(8, 8); d.x = pts[0][0] - 4; d.y = pts[0][1] - 4; d.fills = S(st.color); d.name = 'start';
    nodes.push(d);
  }
  if (lab) {
    const p = pill(lab.text, st);
    p.x = lab.anchor === 'right' ? lab.x - p.width : lab.anchor === 'center' ? lab.x - p.width / 2 : lab.x;
    p.y = lab.vAlign === 'above' ? lab.y - p.height - 5 : lab.y - p.height / 2;
    nodes.push(p);
  }
  const g = figma.group(nodes, OV);
  g.name = name;
  return g;
}
// 곧은 화살표: 폰 오른쪽 → 다음 폰 왼쪽 (버튼 높이 그대로)
function straight(name, P, Q, y, text, st = ST.fwd) {
  const x0 = P.r + 6, x1 = Q.x - 6;
  return arrow(name, [[x0, y], [x1, y]], st, { text, x: (x0 + x1) / 2, y, anchor: 'center', vAlign: 'above' });
}
// 화면 유지 / 미설계: 폰 오른쪽으로 짧은 화살표 + 이름표
function stub(name, P, y, text, st) {
  const x0 = P.r + 6, x1 = P.r + 40;
  const g = arrow(name, [[x0, y], [x1, y]], st, { text, x: x1 + 4, y, anchor: 'left', vAlign: 'middle' });
  return g;
}
// 위쪽 통로: 앱바 '뒤로' → 왼쪽 통로 → 대상 폰 위쪽으로 내려옴
function topLane(name, P, back, Q, lane, entry, text) {
  const y = P.y - 74 - lane * 24;
  const sx = P.x - 24;
  return arrow(name, [[back.x + 2, back.cy], [sx, back.cy], [sx, y], [Q.x + entry, y], [Q.x + entry, Q.y - 6]], ST.back,
    { text, x: sx - 10, y, anchor: 'right', vAlign: 'middle' });
}
// 아래쪽 통로: 폰 아래(버튼 위치)에서 내려가 → 대상 폰 아래로 올라감
function bottomLane(name, P, startX, Q, lane, entry, text, st) {
  const y = P.b + 30 + lane * 26;
  const tx = Q.x + entry;
  const goRight = tx > startX;
  return arrow(name, [[startX, P.b + 6], [startX, y], [tx, y], [tx, Q.b + 6]], st,
    { text, x: goRight ? startX + 12 : startX - 12, y, anchor: goRight ? 'left' : 'right', vAlign: 'middle' });
}

function drawAll(secs) {
  const P = {}, PH = {};
  for (const c of ORDER) if (secs[c]) { PH[c] = phoneOf(secs[c]); P[c] = rel(PH[c]); }
  const has = (...cs) => cs.every((c) => P[c]);
  const tasks = [];
  const add = (label, cs, fn) => tasks.push({ label, cs, fn });

  // 앞으로 (곧은 화살표)
  add('01 → 01-1', ['01', '01-1'], () => straight('01 + 나만의 카테고리 추가 → 01-1', P['01'], P['01-1'], rel(btn(PH['01'], '+ 나만의 카테고리 추가')).cy, "'+ 나만의 카테고리 추가'"));
  add('01-1 → 02', ['01-1', '02'], () => straight('01-1 추가하고 시작 → 02', P['01-1'], P['02'], rel(btn(PH['01-1'], '추가하고 시작')).cy, "'추가하고 시작'"));
  add('02 → 03', ['02', '03'], () => straight('02 창조 → 03', P['02'], P['03'], rel(btn(PH['02'], '창조')).cy, "'창조'"));
  add('03 → 04', ['03', '04'], () => straight('03 준비 완료 → 04', P['03'], P['04'], P['03'].y + P['03'].h * 0.45, '준비 완료 (자동)'));
  add('04 → 05', ['04', '05'], () => straight('04 확정 → 05', P['04'], P['05'], rel(btn(PH['04'], '확정')).cy, "'확정'"));
  add('05 → 05-1', ['05', '05-1'], () => straight('05 만드는 법 → 05-1', P['05'], P['05-1'], rel(need(PH['05'].findOne((n) => n.name === 'RecipeButton'), '만드는 법 버튼')).cy, "'진짜 만드는 법 · 레시피'"));
  add('05-1 → 06', ['05-1', '06'], () => straight('05-1 공유하기 → 06', P['05-1'], P['06'], rel(btn(PH['05-1'], '공유하기')).cy, "'공유하기'"));
  add('06 → 07', ['06', '07'], () => straight('06 피드에 올리기 → 07', P['06'], P['07'], rel(need(PH['06'].findOne((n) => n.name === 'Option/피드에 올리기'), '피드에 올리기 버튼')).cy, "'피드에 올리기'"));

  // 01 카테고리 → 02 (01-1을 건너뜀: 아래쪽 통로 2번)
  add('01 → 02', ['01', '02'], () => {
    const cy = rel(btn(PH['01'], '프로그램 개발', '음식 개발')).cy;
    const A = P['01'], B = P['02'];
    const x = A.r + 30, y = A.b + 30 + 2 * 26;
    return arrow('01 카테고리 누름 → 02', [[A.r + 6, cy], [x, cy], [x, y], [B.x + 60, y], [B.x + 60, B.b + 6]], ST.fwd,
      { text: '카테고리 누름 (기본 · 다른 사용자)', x: x + 8, y: cy, anchor: 'left', vAlign: 'above' });
  });
  // 05 공유 → 06 (05-1을 건너뜀: 아래쪽 통로 0번)
  add('05 → 06', ['05', '06'], () => bottomLane('05 공유 → 06', P['05'], rel(btn(PH['05'], '공유')).cx, P['06'], 0, 60, "'공유'", ST.fwd));

  // 되돌아가기 — 위쪽 통로 (앱바 뒤로)
  add('02 → 01 (뒤로)', ['02', '01'], () => topLane('02 뒤로 → 01', P['02'], rel(backOf(PH['02'])), P['01'], 1, 200, '뒤로'));
  add('01-1 → 01 (뒤로)', ['01-1', '01'], () => topLane('01-1 뒤로 → 01', P['01-1'], rel(backOf(PH['01-1'])), P['01'], 0, 236, '뒤로'));
  add('07 → 05 (뒤로)', ['07', '05'], () => topLane('07 뒤로 → 05', P['07'], rel(backOf(PH['07'])), P['05'], 1, 200, '뒤로'));
  add('05-1 → 05 (뒤로)', ['05-1', '05'], () => topLane('05-1 뒤로 → 05', P['05-1'], rel(backOf(PH['05-1'])), P['05'], 0, 236, '뒤로'));

  // 되돌아가기 — 아래쪽 통로 (아래 버튼)
  add('03 → 02 (취소)', ['03', '02'], () => bottomLane('03 취소 → 02', P['03'], rel(btn(PH['03'], '취소')).cx, P['02'], 0, 180, "'취소'", ST.back));
  add('04 → 02 (다시 뽑기)', ['04', '02'], () => bottomLane('04 다시 뽑기 → 02', P['04'], rel(btn(PH['04'], '다시 뽑기')).cx, P['02'], 1, 120, "'다시 뽑기'", ST.back));
  add('04 → 03 (새로 생성)', ['04', '03'], () => bottomLane('04 새로 생성 → 03 (미정)', P['04'], rel(btn(PH['04'], '새로 생성')).cx, P['03'], 0, 300, "'새로 생성' · 미정", ST.maybe));
  add('06 → 05 (닫기)', ['06', '05'], () => bottomLane('06 닫기 → 05', P['06'], rel(btn(PH['06'], '닫기')).cx, P['05'], 1, 180, "'닫기' · 링크 복사 후", ST.back));
  add('05 → 01 (새 아이디어)', ['05', '01'], () => bottomLane('05 새 아이디어 시작 → 01', P['05'], rel(btn(PH['05'], '새 아이디어 시작')).cx, P['01'], 3, 180, "'새 아이디어 시작'", ST.back));

  // 화면 유지 / 미설계
  add('02 다시 뽑기 (유지)', ['02'], () => stub('02 다시 뽑기 = 화면 유지', P['02'], rel(btn(PH['02'], '다시 뽑기 (고정 제외)', '다시 뽑기')).cy, '화면 유지 · 고정 제외하고 다시 뽑기', ST.stay));
  add('05 저장 (유지)', ['05'], () => stub('05 저장 = 화면 유지', P['05'], rel(btn(PH['05'], '저장')).cy, "화면 유지 · '저장했어요' 토스트", ST.stay));
  add('01 기록', ['01'], () => stub('01 기록 → 기록 모아보기', P['01'], rel(rightOf(PH['01'])).cy, "'기록' → 기록 모아보기 (미설계 · Could)", ST.maybe));
  add('05 기록', ['05'], () => stub('05 기록 → 기록 모아보기', P['05'], rel(rightOf(PH['05'])).cy, "'기록' → 기록 모아보기 (미설계 · Could)", ST.maybe));

  for (const t of tasks) {
    if (!has(...t.cs)) { log(`– ${t.label}: 화면이 없어 건너뜀`); continue; }
    try { t.fn(); } catch (e) { log(`✗ ${t.label}: ${e.message}`); }
  }
  return tasks.length;
}

// ---------- 4) 범례 ----------
async function legend() {
  const lg = await G('1:33');
  if (!lg) return;
  const old = lg.findOne((n) => n.name === 'Legend/화살표');
  if (old) old.remove();
  const box = AL('HORIZONTAL', { gap: 16, cross: 'CENTER', name: 'Legend/화살표' });
  for (const st of [ST.fwd, ST.back, ST.maybe, ST.stay]) {
    const it = AL('HORIZONTAL', { gap: 6, cross: 'CENTER' });
    const s = figma.createNodeFromSvg(`<svg width="34" height="10" viewBox="0 0 34 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 5H25" stroke="#000" stroke-width="2"${st.dash ? ' stroke-dasharray="4 3"' : ''}/><path d="M33 5 24 0V10Z" fill="#000"/></svg>`);
    s.fills = [];
    for (const v of s.findAll((n) => n.type === 'VECTOR')) {
      if (v.strokes.length) v.strokes = S(st.color);
      if (v.fills.length) v.fills = S(st.color);
    }
    it.appendChild(s);
    it.appendChild(T(st.label, { size: 13, color: C.grey }));
    box.appendChild(it);
  }
  lg.appendChild(box);
}

// ---------- 5) 화면 흐름 섹션: 그림은 화면별 설계로 옮겼으니 표만 남김 ----------
async function trimFlowSection() {
  const fs = await G('1:769');
  if (!fs) return '없음';
  const table = fs.findOne((n) => n.name === 'NavTable');
  if (!table) return '이동 표가 없어 그대로 둠';
  const title = fs.children[0];
  const note = fs.children.find((n) => n.type === 'TEXT' && n.characters.indexOf('모든 버튼이') === 0);
  for (const c of [...fs.children]) if (c !== title && c !== note && c !== table) c.remove();
  if (title.type === 'TEXT') { await figma.loadFontAsync(title.fontName); title.characters = '버튼별 이동 표 (참고)'; }
  return '흐름 그림 정리, 표만 남김';
}

// ---------- 실행 ----------
const UI = `<style>body{font:12px -apple-system,sans-serif;margin:12px;color:#1f1f24}h3{margin:0 0 8px}pre{white-space:pre-wrap;font-size:11px;background:#f4f4f6;padding:8px;border-radius:6px;max-height:300px;overflow:auto}button{margin-top:8px;padding:6px 14px}</style>
<h3 id="h">그리는 중…</h3><pre id="p"></pre><button onclick="parent.postMessage({pluginMessage:'close'},'*')">닫기</button>
<script>onmessage=(e)=>{const m=e.data.pluginMessage;document.getElementById('h').textContent=m.title;document.getElementById('p').textContent=m.log;}</script>`;
figma.showUI(UI, { width: 460, height: 420 });
figma.ui.onmessage = (m) => { if (m === 'close') figma.closePlugin(); };

(async () => {
  try {
    await Promise.all(['Bold', 'Regular', 'Medium'].map((s) => figma.loadFontAsync({ family: 'Noto Sans KR', style: s })));
    const root = await findRoot();
    const secs = collectSections(root);
    const missing = ORDER.filter((c) => !secs[c]);
    log(`화면 ${ORDER.length - missing.length}/${ORDER.length}개 찾음${missing.length ? ` (없음: ${missing.join(', ')})` : ''}`);

    let swapped = 0;
    for (const c of ['05', '06']) if (secs[c]) swapped += swapShareButtons(secs[c]);
    if (secs['05']) replaceMarkers05(phoneOf(secs['05']));
    log(`✓ 05 하단 버튼 순서 [새 아이디어 시작 | 공유] (${swapped}곳)`);

    const row = relayoutSections(root, secs);
    log('✓ 한 줄 흐름 순서로 배치, 설명은 폰 아래로');

    const frame = await G('1:26');
    if (frame && frame.layoutMode === 'VERTICAL') { frame.primaryAxisSizingMode = 'AUTO'; frame.counterAxisSizingMode = 'AUTO'; }

    const old = row.children.find((n) => n.name === '화면 이동 화살표');
    if (old) { old.locked = false; old.remove(); }
    R = row.absoluteBoundingBox;
    OV = figma.createFrame();
    OV.name = '화면 이동 화살표';
    OV.fills = [];
    OV.clipsContent = false;
    row.appendChild(OV);
    OV.layoutPositioning = 'ABSOLUTE';
    OV.x = 0; OV.y = 0;
    OV.resize(row.width, row.height);
    const n = drawAll(secs);
    OV.locked = true;
    log(`✓ 화살표 ${OV.children.length}/${n}개`);

    await legend();
    log('✓ 헤더에 화살표 범례 추가');
    log(`✓ 화면 흐름 섹션: ${await trimFlowSection()}`);

    if (frame && frame.layoutMode === 'NONE') {
      const fl = await G('1:769');
      if (fl) fl.y = root.y + root.height + 72;
      frame.resize(Math.max(frame.width, root.x + root.width + 64), (fl ? fl.y + fl.height : root.y + root.height) + 64);
    }
    const comps = await G('1:2');
    if (comps && frame) comps.y = frame.y + frame.height + 160;
    if (frame) figma.viewport.scrollAndZoomIntoView([frame]);
  } catch (e) {
    log(`✗ 실행 중단: ${e && e.message}\n${(e && e.stack) || ''}`);
  }
  const failed = LOG.some((l) => l.startsWith('✗'));
  figma.ui.postMessage({ title: failed ? '일부 실패 — 아래 내용을 복사해서 알려주세요' : '완료', log: LOG.join('\n') });
})();
