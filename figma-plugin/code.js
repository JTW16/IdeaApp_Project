// 아이디어 보조 어플 — 화면 설계서 남은 수정 사항 일괄 적용 (Figma 개발용 플러그인)
// 대상 파일: 아이디어 보조 어플 - 화면 설계서 (IBkUP04Qj2eV6G0XD4oAsR)
// 각 단계는 독립적으로 실행되며, 이미 적용된 단계는 건너뜁니다.

const LOG = [];
const log = (s) => LOG.push(s);
const G = (id) => figma.getNodeByIdAsync(id);
let CREATED = null; // 실패 시 되돌릴 새 섹션

// ---------- 스타일 ----------
function hex(h) {
  return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 };
}
const C = {
  ink: hex('1f1f24'), grey: hex('737380'), line: hex('d6d6de'), chip: hex('f2f2f5'), white: hex('ffffff'),
  soft: hex('4a4a55'), black: hex('000000'), gBg: hex('e3f4e8'), gTx: hex('1e7a3c'),
};
const S = (c, o) => [o === undefined ? { type: 'SOLID', color: c } : { type: 'SOLID', color: c, opacity: o }];

// ---------- 아이콘 (lucide) ----------
const svg = (inner, color) =>
  `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
const IC = {
  compass: '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
};
function icon(inner, color, size) {
  const n = figma.createNodeFromSvg(svg(inner, color));
  n.name = 'icon';
  n.fills = [];
  n.rescale(size / 24);
  return n;
}

// ---------- 노드 헬퍼 ----------
function T(str, { size = 13, style = 'Regular', color = C.ink, lh } = {}) {
  const t = figma.createText();
  t.fontName = { family: 'Noto Sans KR', style };
  t.fontSize = size;
  t.characters = str;
  t.fills = S(color);
  if (lh) t.lineHeight = { unit: 'PERCENT', value: lh };
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
  if (o.align) f.primaryAxisAlignItems = o.align;
  if (o.cross) f.counterAxisAlignItems = o.cross;
  f.clipsContent = false;
  return f;
}
function put(parent, child, o = {}) {
  if (o.at === undefined) parent.appendChild(child); else parent.insertChild(o.at, child);
  if (o.w) child.layoutSizingHorizontal = o.w;
  if (o.h) child.layoutSizingVertical = o.h;
  return child;
}
function wrapText(parent, t, at) {
  put(parent, t, { w: 'FILL', at });
  t.textAutoResize = 'HEIGHT';
  return t;
}
async function setText(t, s) {
  const fonts = t.characters.length ? t.getRangeAllFontNames(0, t.characters.length) : [t.fontName];
  for (const f of fonts) await figma.loadFontAsync(f);
  t.characters = s;
}

// ---------- 컴포넌트 ----------
let K = {};
const BADGE = { Should: '1:42', Could: '1:44', '미정': '1:46' }; // 헤더 범례의 배지 복제
async function init() {
  await Promise.all(['Bold', 'Regular', 'Medium'].map((s) => figma.loadFontAsync({ family: 'Noto Sans KR', style: s })));
  const ids = {
    marker: '1:3', primary: '1:11', secondary: '1:13', chip: '1:23', skeleton: '1:25',
    nav: '11:149', tf: '11:168', feed: '11:183', tpl: '12:534', root: '1:49', frame: '1:26',
  };
  for (const [k, id] of Object.entries(ids)) {
    K[k] = await G(id);
    if (!K[k]) throw new Error(`노드 ${id}(${k})를 찾을 수 없어요. 올바른 파일에서 실행했는지 확인해 주세요.`);
  }
}
function navTag(text) {
  const i = K.nav.createInstance();
  i.setProperties({ '목적지#11:0': text });
  return i;
}
function chipInst(word) {
  const i = K.chip.createInstance();
  i.setProperties({ '단어#1:10': word });
  return i;
}

// ---------- 주석(설명) ----------
async function mkItem(num, title, desc, badge, navs) {
  const row = K.tpl.clone();
  row.children[0].setProperties({ '번호#1:0': String(num) });
  const v = row.children[1];
  for (const c of v.children.filter((c) => c.name === '이동')) c.remove();
  const tr = v.children[0];
  await setText(tr.children[0], title);
  for (const c of tr.children.slice(1)) c.remove();
  if (badge) tr.appendChild((await G(BADGE[badge])).clone());
  await setText(v.children[1], desc);
  if (navs && navs.length) {
    const w = AL('VERTICAL', { gap: 4, pad: [4, 0, 0, 0], name: '이동' });
    for (const n of navs) w.appendChild(navTag(n));
    v.appendChild(w);
  }
  return row;
}
async function rebuild(col, items, boxText) {
  const box = col.children.find((c) => c.name === '넣지 않는 것');
  for (const c of [...col.children]) if (c !== box && !items.includes(c)) c.remove();
  items.forEach((r, i) => col.insertChild(i, r));
  if (boxText && box) await setText(box.children[1], boxText);
}

// ---------- 폰 화면 ----------
function appBar(phone) {
  return phone.children.find((n) => n.type === 'INSTANCE' && n.name === 'AppBar');
}
function setAppBar(phone, title, back, right) {
  appBar(phone).setProperties({ '제목#1:1': title, '뒤로#1:2': back, '오른쪽 버튼#1:3': right });
}
function backBtn(phone) {
  return appBar(phone).findOne((n) => n.name === 'Back');
}
function place(m, phone, target, o = {}) {
  const pb = phone.absoluteBoundingBox;
  const tb = target.absoluteBoundingBox;
  if (o.left) m.x = tb.x - pb.x + (o.dx === undefined ? -10 : o.dx);
  else m.x = Math.min(tb.x - pb.x + tb.width + (o.dx === undefined ? -14 : o.dx), 330);
  m.y = Math.max(tb.y - pb.y + (o.dy === undefined ? -10 : o.dy), 2);
}
function addMarker(phone, num, target, o) {
  const m = K.marker.createInstance();
  phone.appendChild(m);
  m.layoutPositioning = 'ABSOLUTE';
  m.setProperties({ '번호#1:0': String(num) });
  place(m, phone, target, o);
  return m;
}
function markersOf(phone) {
  const r = {};
  for (const m of phone.children.filter((n) => n.type === 'INSTANCE' && n.name === 'Marker')) r[m.componentProperties['번호#1:0'].value] = m;
  return r;
}

// 기존 섹션을 복제해 새 섹션 틀을 만든다: [헤더, (폰+주석), '상태별 화면', 상태 줄]
async function newSection(srcId, num, title, keepBody) {
  const sec = (await G(srcId)).clone();
  CREATED = sec;
  sec.name = `${num} ${title}`;
  const hdr = sec.children[0];
  await setText(hdr.children[0].children[0], num);
  await setText(hdr.children[1], title);
  const pair = sec.children[1];
  const phone = pair.children[0];
  const col = pair.children[1];
  phone.name = sec.name;
  for (const m of phone.children.filter((n) => n.type === 'INSTANCE' && n.name === 'Marker')) m.remove();
  const body = phone.children.find((n) => n.name === 'Body');
  if (!keepBody) for (const c of [...body.children]) c.remove();
  const states = sec.children[3];
  for (const c of [...states.children]) c.remove();
  return { sec, phone, col, body, states };
}

// 상태별 미니 화면 (01 화면의 오류/로딩 미니를 복제해 사용)
async function stateMini(o) {
  const cont = (await G('1:167')).clone();
  const [mini, lab, ds] = cont.children;
  mini.name = o.label;
  mini.findOne((n) => n.type === 'INSTANCE' && n.name === 'AppBar').setProperties({ '제목#1:1': o.app, '뒤로#1:2': o.back, '오른쪽 버튼#1:3': o.right });
  const st = mini.findOne((n) => n.name === 'State');
  const old = st.children[0];
  st.insertChild(0, icon(o.ic, '#1F1F24', 20));
  old.remove();
  const tx = st.children.find((n) => n.type === 'TEXT');
  await setText(tx, o.msg);
  const b = st.findOne((n) => n.name === 'Button');
  if (o.btn) await setText(b.findOne((n) => n.type === 'TEXT'), o.btn);
  else b.remove();
  await setText(lab, o.label);
  await setText(ds, o.desc);
  return cont;
}
async function loadingMini(o) {
  const cont = (await G('1:145')).clone();
  const [mini, lab, ds] = cont.children;
  mini.name = o.label;
  mini.findOne((n) => n.type === 'INSTANCE' && n.name === 'AppBar').setProperties({ '제목#1:1': o.app, '뒤로#1:2': o.back, '오른쪽 버튼#1:3': o.right });
  const h = mini.findOne((n) => n.type === 'TEXT' && n.characters.indexOf('발상') >= 0);
  if (h) await setText(h, o.heading);
  await setText(lab, o.label);
  await setText(ds, o.desc);
  return cont;
}

function rowHas(row, name) {
  return row.children.some((n) => n.name === name);
}

// =====================================================================
// A. 01-1 나만의 카테고리 추가 (새 화면)
// =====================================================================
async function stepA() {
  const row1 = await G('1:51');
  if (rowHas(row1, '01-1 나만의 카테고리 추가')) return 'skip';
  const r = await newSection('1:223', '01-1', '나만의 카테고리 추가');
  row1.insertChild(1, r.sec);
  setAppBar(r.phone, '나만의 카테고리', true, false);
  const b = r.body;

  b.appendChild(T('어떤 카테고리를 만들까요?', { size: 20, style: 'Bold' }));
  wrapText(b, T('입력한 이름과 연관된 단어를 DB에서 찾아 연결해요.', { size: 14, color: C.grey }));

  const fg = put(b, AL('VERTICAL', { gap: 8, name: 'NameField' }), { w: 'FILL' });
  fg.appendChild(T('카테고리 이름', { size: 13, style: 'Bold', color: C.grey }));
  const tf = put(fg, K.tf.createInstance(), { w: 'FILL' });
  tf.setProperties({ '값#11:2': '캠핑 요리', '보조#11:3': '5/20' });

  const pg = put(b, AL('VERTICAL', { gap: 8, name: 'MatchedWords' }), { w: 'FILL' });
  const ph = put(pg, AL('HORIZONTAL', { gap: 8, cross: 'CENTER' }));
  ph.appendChild(T('연관 단어 미리보기', { size: 13, style: 'Bold', color: C.grey }));
  ph.appendChild(T('DB에서 32개 찾음', { size: 12, style: 'Medium', color: C.gTx }));
  const wrap = AL('HORIZONTAL', { gap: 8, name: 'Chips' });
  wrap.layoutWrap = 'WRAP';
  wrap.counterAxisSpacing = 8;
  put(pg, wrap, { w: 'FILL' });
  for (const w of ['모닥불', '코펠', '훈제', '바비큐', '꼬치', '휴대용', '숯불', '야외', '스모어']) wrap.appendChild(chipInst(w));

  const info = put(b, AL('HORIZONTAL', { gap: 10, pad: [12, 14, 12, 14], fill: C.chip, radius: 12, name: 'ShareNotice' }), { w: 'FILL' });
  info.appendChild(icon(IC.users, '#1F1F24', 18));
  wrapText(info, T("추가한 카테고리는 '다른 사용자가 만든 카테고리'에 올라가 누구나 쓸 수 있어요.", { size: 13, lh: 150 }));

  put(b, AL('VERTICAL', { name: 'Spacer' }), { w: 'FILL', h: 'FILL' });
  const pb = put(b, K.primary.createInstance(), { w: 'FILL' });
  pb.setProperties({ '라벨#1:5': '추가하고 시작' });

  addMarker(r.phone, 1, tf);
  addMarker(r.phone, 2, wrap);
  addMarker(r.phone, 3, info);
  addMarker(r.phone, 4, pb);
  addMarker(r.phone, 5, backBtn(r.phone), { left: true, dy: -14 });

  await rebuild(r.col, [
    await mkItem(1, '카테고리 이름 입력', '원하는 카테고리를 자유롭게 입력해요. 2~20자.', null, []),
    await mkItem(2, '연관 단어 매칭', '입력을 멈추면 DB 단어 중 연관된 것을 찾아 미리 보여줘요. 10개 미만이면 추가할 수 없어요.', null, ['→ 화면 유지 (미리보기 갱신)']),
    await mkItem(3, '공유 안내', '추가한 카테고리는 01 화면의 \'다른 사용자가 만든 카테고리\'에 공개돼 재활용돼요. 이름만 공개, 만든 사람은 비공개.', null, []),
    await mkItem(4, "'추가하고 시작' — 주인공 행동", '카테고리를 저장하고 바로 단어를 뽑아요.', null, ['→ 02 랜덤 단어']),
    await mkItem(5, '뒤로', '추가하지 않고 돌아가요.', null, ['→ 01 카테고리 선택']),
  ], '단어 직접 입력·편집, 카테고리 설명·이미지 등록, 로그인 요구');

  r.states.appendChild(await loadingMini({ label: '로딩 (매칭 중)', desc: '입력 후 연관 단어 자리에 회색 카드 + 버튼 비활성', app: '나만의 카테고리', back: true, right: false, heading: '연관 단어를 찾는 중이에요' }));
  r.states.appendChild(await stateMini({ label: '연관 단어 부족', desc: '찾은 단어가 10개 미만 + 이름 바꿔 다시 입력 (화면 유지)', app: '나만의 카테고리', back: true, right: false, ic: IC.search, msg: '연관 단어가 부족해요', btn: '이름 바꿔 입력' }));
  r.states.appendChild(await stateMini({ label: '이미 있는 카테고리', desc: '같은 이름이 있으면 그 카테고리로 시작 → 02 랜덤 단어', app: '나만의 카테고리', back: true, right: false, ic: IC.info, msg: '이미 있는 카테고리예요', btn: '그 카테고리로 시작' }));
}

// =====================================================================
// B. 02 랜덤 단어 — 방향성 입력 + 단어 고정
// =====================================================================
async function stepB() {
  const body = await G('1:206');
  if (body.findOne((n) => n.name === 'Direction')) return 'skip';
  const phone = await G('1:193');

  const dir = put(body, AL('VERTICAL', { gap: 6, name: 'Direction' }), { w: 'FILL', at: 1 });
  const dl = put(dir, AL('HORIZONTAL', { gap: 6, cross: 'CENTER' }));
  dl.appendChild(icon(IC.compass, '#737380', 14));
  dl.appendChild(T('방향성 (선택)', { size: 13, style: 'Bold', color: C.grey }));
  const tf = put(dir, K.tf.createInstance(), { w: 'FILL' });
  tf.setProperties({ '값#11:2': '매콤한 요리', '보조#11:3': '지우기' });

  (await G('1:211')).itemSpacing = 8;
  const fixedCard = await G('1:214');
  fixedCard.setProperties({ '고정': '켜짐' });
  (await G('1:218')).setProperties({ '라벨#1:6': '다시 뽑기 (고정 제외)' });
  (await G('1:220')).layoutSizingVertical = 'FILL';

  const mk = markersOf(phone);
  mk['5'].setProperties({ '번호#1:0': '7' });
  mk['4'].setProperties({ '번호#1:0': '6' });
  mk['3'].setProperties({ '번호#1:0': '5' });
  mk['2'].setProperties({ '번호#1:0': '3' });
  place(mk['2'], phone, await G('1:212'));
  place(mk['3'], phone, await G('1:218'));
  place(mk['4'], phone, await G('1:221'));
  addMarker(phone, 2, tf);
  addMarker(phone, 4, fixedCard.findOne((n) => n.name === 'PinButton'), { left: true, dx: -28, dy: 6 });

  await rebuild(await G('1:229'), [
    await mkItem(1, '선택한 카테고리 이름', '앞 화면에서 고른(또는 직접 만든) 카테고리를 보여줘요.', null, []),
    await mkItem(2, '방향성 설정', "원하는 방향을 글로 미리 정해요(예: 매콤한 요리, 튀김 요리). 그 방향과 연관된 단어 위주로 뽑고, 비워두면 카테고리 전체에서 뽑아요. 맞는 단어가 3개 미만이면 '방향을 넓혀 보세요' 안내.", null, ['→ 화면 유지 (단어 새로 뽑힘)']),
    await mkItem(3, '단어 3개', '카테고리(+방향성)와 연관된 단어 3개를 DB에서 랜덤으로 뽑아요. 직접 입력·수정은 안 돼요.', null, []),
    await mkItem(4, '고정 핀', '마음에 드는 단어를 고정해요. 고정한 단어는 다시 뽑기에서 빠지고, 다시 누르면 풀려요. 최대 2개까지.', null, ['→ 화면 유지']),
    await mkItem(5, '다시 뽑기 — 보조 행동', '고정하지 않은 단어만 새로 뽑아요. 0.5초 이내.', null, ['→ 화면 유지']),
    await mkItem(6, "'창조' 버튼 — 주인공 행동", '지금 보이는 단어 3개로 아이디어를 만들어요.', null, ['→ 03 결과 준비']),
    await mkItem(7, '뒤로', '카테고리를 다시 골라요. 고정·방향성은 초기화돼요.', null, ['→ 01 카테고리 선택']),
  ], '단어 직접 입력·수정, 광고, 추천, 단어 3개 초과 표시, 3개 모두 고정');
}

// =====================================================================
// C. 03 결과 준비 / 04 결과 — 이동 표시
// =====================================================================
async function stepC() {
  const col = await G('1:388');
  if (col.findOne((n) => n.name === '이동')) return 'skip';
  await rebuild(col, [
    await mkItem(1, '뽑힌 단어 3개', '어떤 조합으로 만드는지 보여줘요.', null, []),
    await mkItem(2, '진행 표시 — 가장 크게', '누를 것이 없어요. DB에 있는 조합이면 바로, 없으면 AI가 5초 안에 만들어요.', null, ['→ 04 결과 (완료되면 자동 이동)']),
    await mkItem(3, '취소 — 보조 행동', '만들기를 멈추고 단어 화면으로 돌아가요. 고정한 단어는 유지돼요.', null, ['→ 02 랜덤 단어']),
  ]);
}
async function stepD() {
  const col = await G('1:492');
  if (col.findOne((n) => n.name === '이동')) return 'skip';
  await rebuild(col, [
    await mkItem(1, '뽑힌 단어 3개', '이 아이디어를 만든 단어예요.', null, []),
    await mkItem(2, '아이디어 글 — 가장 크게', '생성된 아이디어 내용이에요.', null, []),
    await mkItem(3, "'확정' 버튼 — 주인공 행동", '이 아이디어로 정해요.', null, ['→ 05 아이디어 확정']),
    await mkItem(4, '다시 뽑기', '단어를 다시 뽑으러 가요.', null, ['→ 02 랜덤 단어']),
    await mkItem(5, "'새로 생성'", '같은 단어로 다시 만들어요. 허용하기로 정하면 넣어요.', '미정', ['→ 03 결과 준비']),
  ]);
}

// =====================================================================
// E. 05 아이디어 확정 — 만드는 법 버튼 + 공유 확정
// =====================================================================
async function stepE() {
  const body = await G('1:605');
  if (body.findOne((n) => n.name === 'RecipeButton')) return 'skip';
  const phone = await G('1:592');

  const rb = AL('HORIZONTAL', { gap: 12, pad: [14, 16, 14, 14], radius: 16, fill: C.white, stroke: C.ink, sw: 2, cross: 'CENTER', name: 'RecipeButton' });
  put(body, rb, { w: 'FILL', at: body.children.indexOf(await G('1:610')) + 1 });
  const ic = put(rb, AL('HORIZONTAL', { fill: C.chip, radius: 18, align: 'CENTER', cross: 'CENTER', name: 'IconCircle' }));
  ic.primaryAxisSizingMode = 'FIXED'; ic.counterAxisSizingMode = 'FIXED'; ic.resize(36, 36);
  ic.appendChild(icon(IC.book, '#1F1F24', 18));
  const tc = put(rb, AL('VERTICAL', { gap: 2 }), { w: 'FILL' });
  tc.appendChild(T('진짜 만드는 법 · 레시피', { size: 16, style: 'Bold' }));
  tc.appendChild(T('재료와 만드는 순서를 알려줘요', { size: 12, color: C.grey }));
  rb.appendChild(icon(IC.chevron, '#737380', 20));
  (await G('1:619')).layoutSizingVertical = 'FILL';

  const share = await G('1:621');
  share.swapComponent(K.secondary);
  share.setProperties({ '라벨#1:6': '공유' });

  addMarker(phone, 6, rb);

  await rebuild(await G('1:633'), [
    await mkItem(1, '확정된 아이디어 + 사용한 단어', '확정한 아이디어와 그때 쓴 단어 3개를 보여줘요.', null, []),
    await mkItem(2, "'저장' 버튼 — 주인공 행동", "기기 안에 보관하고 '저장했어요' 토스트.", 'Should', ['→ 화면 유지']),
    await mkItem(3, '공유', '링크로 보내거나 앱 안 공유 피드에 올려요.', null, ['→ 06 공유하기 (시트)']),
    await mkItem(4, '새 아이디어 시작', '처음부터 다시 시작해요.', null, ['→ 01 카테고리 선택']),
    await mkItem(5, '기록 모아보기', '보관한 아이디어를 모아봐요.', 'Could', ['→ 기록 모아보기 (미설계)']),
    await mkItem(6, '진짜 만드는 법 · 레시피', "아이디어를 실제로 만드는 법(재료·순서)을 보여줘요. 음식 외 카테고리는 '실행 방법'으로 바뀌어요.", null, ['→ 05-1 만드는 법']),
  ]);
}

// =====================================================================
// F. 05-1 만드는 법 (새 화면)
// =====================================================================
async function stepF() {
  const row3 = await G('12:165');
  if (rowHas(row3, '05-1 만드는 법')) return 'skip';
  const r = await newSection('1:223', '05-1', '만드는 법');
  row3.insertChild(0, r.sec);
  setAppBar(r.phone, '만드는 법', true, false);
  const b = r.body;

  const head = put(b, AL('VERTICAL', { gap: 4, name: 'Title' }), { w: 'FILL' });
  head.appendChild(T('확정한 아이디어', { size: 13, color: C.grey }));
  const title = wrapText(head, T('여름용 바삭한 발효 과자', { size: 20, style: 'Bold' }));

  const meta = put(b, AL('HORIZONTAL', { gap: 6, name: 'Summary' }));
  for (const w of ['약 50분', '난이도 보통', '12개 분량']) meta.appendChild(chipInst(w));

  const ing = put(b, AL('VERTICAL', { gap: 8, name: 'Ingredients' }), { w: 'FILL' });
  ing.appendChild(T('재료', { size: 15, style: 'Bold' }));
  wrapText(ing, T('· 밀가루 200g\n· 플레인 요구르트 80g\n· 설탕 30g, 소금 한 꼬집\n· 레몬즙 1큰술', { size: 14, color: C.soft, lh: 160 }));

  const dv = figma.createFrame(); dv.name = 'Divider'; dv.resize(320, 1); dv.fills = S(C.line);
  put(b, dv, { w: 'FILL' });

  const steps = put(b, AL('VERTICAL', { gap: 8, name: 'Steps' }), { w: 'FILL' });
  steps.appendChild(T('만드는 순서', { size: 15, style: 'Bold' }));
  const list = ['반죽 재료를 섞어 실온에서 30분 발효해요.', '반죽을 2mm 두께로 얇게 밀어요.', '170℃ 오븐에서 15분 구워요.', '식힌 뒤 냉장 보관하면 더 바삭해요.'];
  for (let i = 0; i < list.length; i++) {
    const row = put(steps, AL('HORIZONTAL', { gap: 10, cross: 'CENTER' }), { w: 'FILL' });
    const n = put(row, AL('HORIZONTAL', { fill: C.chip, radius: 11, align: 'CENTER', cross: 'CENTER' }));
    n.primaryAxisSizingMode = 'FIXED'; n.counterAxisSizingMode = 'FIXED'; n.resize(22, 22);
    n.appendChild(T(String(i + 1), { size: 12, style: 'Bold' }));
    wrapText(row, T(list[i], { size: 14 }));
  }

  put(b, AL('VERTICAL', { name: 'Spacer' }), { w: 'FILL', h: 'FILL' });
  const pb = put(b, K.primary.createInstance(), { w: 'FILL' });
  pb.setProperties({ '라벨#1:5': '공유하기' });

  addMarker(r.phone, 1, title);
  addMarker(r.phone, 2, meta);
  addMarker(r.phone, 3, ing.children[0], { dx: 260 - ing.children[0].width });
  addMarker(r.phone, 4, steps.children[0], { dx: 260 - steps.children[0].width });
  addMarker(r.phone, 5, pb);
  addMarker(r.phone, 6, backBtn(r.phone), { left: true, dy: -14 });

  await rebuild(r.col, [
    await mkItem(1, '아이디어 제목', '어떤 아이디어의 만드는 법인지 보여줘요.', null, []),
    await mkItem(2, '요약 정보', '걸리는 시간·난이도·분량을 한눈에 보여줘요.', null, []),
    await mkItem(3, '재료', 'AI가 아이디어 내용을 바탕으로 만들어요.', null, []),
    await mkItem(4, '만드는 순서', "4~6단계로 짧게. 음식 외 카테고리는 '실행 단계'(예: 프로그램 개발 → 구현 순서)로 보여줘요.", null, []),
    await mkItem(5, '공유하기 — 주인공 행동', '아이디어와 만드는 법을 함께 공유해요.', null, ['→ 06 공유하기 (시트)']),
    await mkItem(6, '뒤로', '아이디어 확정 화면으로 돌아가요.', null, ['→ 05 아이디어 확정']),
  ], '영양 정보·칼로리, 동영상, 재료 구매 링크, 광고');

  r.states.appendChild(await stateMini({ label: '만들 수 없음', desc: '실제로 만들기 어려운 아이디어 + 돌아가기 → 05 아이디어 확정', app: '만드는 법', back: true, right: false, ic: IC.inbox, msg: '만드는 법을 알려주기 어려운 아이디어예요', btn: '아이디어로 돌아가기' }));
  r.states.appendChild(await loadingMini({ label: '로딩', desc: '재료·순서 자리에 회색 카드', app: '만드는 법', back: true, right: false, heading: '만드는 법을 정리하는 중이에요' }));
  r.states.appendChild(await stateMini({ label: '오류', desc: '만드는 법을 불러오지 못했습니다 + 다시 시도 (화면 유지)', app: '만드는 법', back: true, right: false, ic: IC.alert, msg: '만드는 법을 불러오지 못했습니다', btn: '다시 시도' }));
}

// =====================================================================
// G. 06 공유하기 (바텀 시트)
// =====================================================================
async function stepG() {
  const row3 = await G('12:165');
  if (rowHas(row3, '06 공유하기 (시트)')) return 'skip';
  const r = await newSection('1:627', '06', '공유하기 (시트)', true);
  row3.insertChild(Math.min(1, row3.children.length), r.sec);
  const phone = r.phone;

  const ov = figma.createRectangle();
  ov.name = 'Dim'; ov.resize(phone.width, phone.height); ov.fills = S(C.black, 0.45); ov.cornerRadius = 36;
  phone.appendChild(ov); ov.layoutPositioning = 'ABSOLUTE'; ov.x = 0; ov.y = 0;

  const sh = figma.createFrame();
  sh.name = 'ShareSheet';
  sh.layoutMode = 'VERTICAL';
  sh.resize(phone.width, 100);
  sh.counterAxisSizingMode = 'FIXED';
  sh.primaryAxisSizingMode = 'AUTO';
  sh.itemSpacing = 14;
  sh.paddingTop = 10; sh.paddingRight = 20; sh.paddingBottom = 12; sh.paddingLeft = 20;
  sh.fills = S(C.white);
  sh.topLeftRadius = 24; sh.topRightRadius = 24; sh.bottomLeftRadius = 34; sh.bottomRightRadius = 34;
  sh.clipsContent = false;

  const hw = put(sh, AL('HORIZONTAL', { align: 'CENTER', name: 'Handle' }), { w: 'FILL' });
  const hd = figma.createRectangle(); hd.resize(40, 4); hd.cornerRadius = 2; hd.fills = S(C.line); hw.appendChild(hd);
  sh.appendChild(T('아이디어 공유', { size: 18, style: 'Bold' }));

  const pv = put(sh, AL('VERTICAL', { gap: 4, pad: [12, 14, 12, 14], fill: C.chip, radius: 12, name: 'Preview' }), { w: 'FILL' });
  pv.appendChild(T('여름용 바삭한 발효 과자', { size: 15, style: 'Bold' }));
  pv.appendChild(T('바삭함 · 여름 · 발효', { size: 12, color: C.grey }));

  function option(ic, title, sub, name) {
    const o = put(sh, AL('HORIZONTAL', { gap: 12, pad: [12, 14, 12, 12], radius: 14, fill: C.white, stroke: C.ink, sw: 1.5, cross: 'CENTER', name }), { w: 'FILL' });
    const c = put(o, AL('HORIZONTAL', { fill: C.chip, radius: 20, align: 'CENTER', cross: 'CENTER' }));
    c.primaryAxisSizingMode = 'FIXED'; c.counterAxisSizingMode = 'FIXED'; c.resize(40, 40);
    c.appendChild(icon(ic, '#1F1F24', 20));
    const tc = put(o, AL('VERTICAL', { gap: 2 }), { w: 'FILL' });
    tc.appendChild(T(title, { size: 16, style: 'Bold' }));
    wrapText(tc, T(sub, { size: 12, color: C.grey }));
    o.appendChild(icon(IC.chevron, '#737380', 18));
    return o;
  }
  const o1 = option(IC.link, '링크 복사', '앱이 없는 사람도 웹에서 볼 수 있어요', 'Option/링크 복사');
  const o2 = option(IC.send, '피드에 올리기', '다른 사용자들이 보고 평가해요', 'Option/피드에 올리기');
  const close = put(sh, K.secondary.createInstance(), { w: 'FILL' });
  close.setProperties({ '라벨#1:6': '닫기' });
  const iw = put(sh, AL('HORIZONTAL', { align: 'CENTER', pad: [8, 0, 0, 0], name: 'HomeIndicator' }), { w: 'FILL' });
  const ind = figma.createRectangle(); ind.resize(120, 5); ind.cornerRadius = 3; ind.fills = S(C.ink); iw.appendChild(ind);

  phone.appendChild(sh);
  sh.layoutPositioning = 'ABSOLUTE';
  sh.x = 0;
  sh.y = phone.height - sh.height;

  addMarker(phone, 1, o1);
  addMarker(phone, 2, o2);
  addMarker(phone, 3, close);

  await rebuild(r.col, [
    await mkItem(1, '링크 복사', "공유 링크를 복사하고 '링크를 복사했어요' 토스트. 링크는 웹에서 읽기 전용으로 열려요.", null, ['→ 시트 닫힘 · 05 아이디어 확정 유지']),
    await mkItem(2, '피드에 올리기 — 주인공 행동', '앱 안 공유 피드에 올려요. 익명 닉네임으로 올라가요.', null, ['→ 07 공유 피드 (내 글이 맨 위)']),
    await mkItem(3, '닫기 / 바깥 영역 누름', '공유하지 않고 시트를 닫아요.', null, ['→ 05 아이디어 확정']),
  ], 'SNS별 공유 버튼 나열, 로그인 요구, 공개 범위 설정');

  const base = { app: '아이디어 확정', back: false, right: true };
  r.states.appendChild(await stateMini({ ...base, label: '링크 복사됨', desc: '토스트 후 시트 닫힘 → 05 아이디어 확정 유지', ic: IC.check, msg: '링크를 복사했어요' }));
  r.states.appendChild(await loadingMini({ ...base, label: '올리는 중', desc: "'피드에 올리기' 비활성 + 진행 표시", heading: '피드에 올리는 중이에요' }));
  r.states.appendChild(await stateMini({ ...base, label: '오류', desc: '피드에 올리지 못했습니다 + 다시 시도 (시트 유지)', ic: IC.alert, msg: '피드에 올리지 못했습니다', btn: '다시 시도' }));
}

// =====================================================================
// H. 07 공유 피드 (새 화면)
// =====================================================================
async function stepH() {
  const row3 = await G('12:165');
  if (rowHas(row3, '07 공유 피드')) return 'skip';
  const r = await newSection('1:223', '07', '공유 피드');
  row3.appendChild(r.sec);
  setAppBar(r.phone, '공유 피드', true, false);
  const b = r.body;
  b.itemSpacing = 12;

  const tabs = put(b, AL('HORIZONTAL', { gap: 6, name: 'Sort' }));
  for (const [lab, on] of [['최신순', true], ['인기순', false]]) {
    const p = put(tabs, AL('HORIZONTAL', { pad: [6, 14, 6, 14], radius: 999, fill: on ? C.ink : C.white, stroke: on ? null : C.line, name: 'Tab/' + lab }));
    p.appendChild(T(lab, { size: 13, style: 'Medium', color: on ? C.white : C.ink }));
  }

  async function card(p, words, counts, selected) {
    const c = put(b, K.feed.createInstance(), { w: 'FILL' });
    c.setProperties(p);
    const ws = c.findOne((n) => n.name === 'Words');
    ws.children.forEach((ch, i) => ch.setProperties({ '단어#1:10': words[i] }));
    const names = ['좋아요', '그저그래요', '별로에요'];
    for (let i = 0; i < 3; i++) {
      const btn = c.findOne((n) => n.name === 'Reaction/' + names[i]);
      const t = btn.findOne((n) => n.type === 'TEXT');
      await setText(t, `${names[i]} ${counts[i]}`);
      if (names[i] === selected) {
        btn.fills = S(C.ink);
        btn.strokes = [];
        t.fills = S(C.white);
        for (const v of btn.findAll((n) => 'strokes' in n && n.strokes.length > 0)) v.strokes = S(C.white);
      }
    }
    return c;
  }
  const c1 = await card({ '닉네임#11:4': '익명의 발상가 #2381', '메타#11:5': '음식 개발 · 방금 전', '아바타#11:6': '발', '제목#11:7': '여름용 바삭한 발효 과자', '내 아이디어#11:9': true }, ['바삭함', '여름', '발효'], [0, 0, 0], null);
  const c2 = await card({ '닉네임#11:4': '익명의 발상가 #0917', '메타#11:5': '캠핑 요리 · 12분 전', '아바타#11:6': '캠', '제목#11:7': '모닥불 훈제 치즈 꼬치', '내용#11:8': '코펠 하나로 치즈를 훈연해 꼬치에 끼워 굽는 캠핑 간식. 숯불 향이 배어 맥주 안주로 좋다.', '내 아이디어#11:9': false }, ['모닥불', '훈제', '꼬치'], [31, 4, 1], '좋아요');

  addMarker(r.phone, 1, tabs);
  addMarker(r.phone, 2, c1.findOne((n) => n.name === 'MineBadge'), { dx: -6 });
  addMarker(r.phone, 3, c2.findOne((n) => n.name === 'Header'));
  addMarker(r.phone, 4, c2.findOne((n) => n.name === 'Reactions'), { dx: 4 });
  addMarker(r.phone, 5, backBtn(r.phone), { left: true, dy: -14 });

  await rebuild(r.col, [
    await mkItem(1, '정렬', '최신순 / 인기순(좋아요 많은 순).', null, ['→ 화면 유지']),
    await mkItem(2, '내 아이디어', "방금 올린 글이 맨 위에 '내 아이디어' 표시와 함께 보여요. 내 글에는 반응할 수 없어요.", null, []),
    await mkItem(3, '피드 카드', '다른 사용자가 공유한 아이디어(제목·내용·사용 단어). 카드를 누르면 글 전체가 펼쳐져요.', null, ['→ 화면 유지 (펼치기)']),
    await mkItem(4, '반응 — 좋아요 / 그저그래요 / 별로에요', '셋 중 하나만 고를 수 있어요. 다시 누르면 취소, 다른 걸 누르면 바뀌어요. 숫자는 바로 반영돼요.', null, ['→ 화면 유지']),
    await mkItem(5, '뒤로', '들어온 화면으로 돌아가요.', null, ['→ 05 아이디어 확정']),
  ], '댓글, 팔로우·프로필, 로그인 요구, 광고, 실명 표시');

  const base = { app: '공유 피드', back: true, right: false };
  r.states.appendChild(await stateMini({ ...base, label: '빈 상태', desc: '아직 공유된 아이디어가 없어요 + 새 아이디어 만들기 → 01 카테고리 선택', ic: IC.inbox, msg: '아직 공유된 아이디어가 없어요', btn: '새 아이디어 만들기' }));
  r.states.appendChild(await loadingMini({ ...base, label: '로딩', desc: '카드 자리에 회색 카드', heading: '최신순' }));
  r.states.appendChild(await stateMini({ ...base, label: '오류', desc: '피드를 불러오지 못했습니다 + 다시 시도', ic: IC.alert, msg: '피드를 불러오지 못했습니다', btn: '다시 시도' }));
}

// =====================================================================
// I. 화면 흐름 — 전체 경로 + 버튼별 이동 표
// =====================================================================
function box(label, o = {}) {
  const b = AL('HORIZONTAL', { pad: [14, 16, 14, 16], radius: 12, fill: o.dark ? C.ink : C.white, stroke: C.ink, sw: 1.5, name: 'Node', align: 'CENTER' });
  if (o.dashed) b.dashPattern = [5, 3];
  b.appendChild(T(label, { size: 15, style: o.dark ? 'Bold' : 'Medium', color: o.dark ? C.white : C.ink }));
  if (o.w) { b.primaryAxisSizingMode = 'FIXED'; b.resize(o.w, b.height); }
  return b;
}
function arrow(label, len) {
  len = len || 80;
  const g = AL('VERTICAL', { gap: 4, pad: [0, 10, label ? 18 : 0, 10], name: 'Arrow', cross: 'CENTER' });
  if (label) g.appendChild(T(label, { size: 12, style: 'Medium', color: C.grey }));
  const a = figma.createNodeFromSvg(`<svg width="${len}" height="12" viewBox="0 0 ${len} 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 6H${len - 2}M${len - 8} 1l6 5-6 5" stroke="#1F1F24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
  a.fills = [];
  g.appendChild(a);
  return g;
}
function pathRow(parent, items) {
  const r = put(parent, AL('HORIZONTAL', { cross: 'CENTER', name: 'Path' }));
  for (const it of items) r.appendChild(it);
  return r;
}
async function stepI() {
  const fs = await G('1:769');
  if (fs.findOne((n) => n.name === 'NavTable')) return 'skip';
  const title = fs.children[0];
  for (const c of [...fs.children]) if (c !== title) c.remove();
  const sub = (s) => fs.appendChild(T(s, { size: 15, style: 'Bold', color: C.grey }));

  sub('앞으로 가는 길');
  pathRow(fs, [
    box('01 카테고리 선택', { dark: true }), arrow('카테고리 누름'), box('02 랜덤 단어'), arrow("'창조'"), box('03 결과 준비'),
    arrow('준비 완료 (자동)'), box('04 결과'), arrow("'확정'"), box('05 아이디어 확정'), arrow("'공유'"),
    box('06 공유하기 (시트)'), arrow("'피드에 올리기'"), box('07 공유 피드'),
  ]);

  sub('갈래 길');
  const br = put(fs, AL('VERTICAL', { gap: 12 }));
  pathRow(br, [box('01 카테고리 선택'), arrow("'+ 나만의 카테고리 추가'"), box('01-1 나만의 카테고리 추가'), arrow("'추가하고 시작'"), box('02 랜덤 단어')]);
  pathRow(br, [box('05 아이디어 확정'), arrow("'진짜 만드는 법 · 레시피'"), box('05-1 만드는 법'), arrow("'공유하기'"), box('06 공유하기 (시트)')]);

  sub('되돌아가는 길');
  const bk = put(fs, AL('VERTICAL', { gap: 12 }));
  for (const [a, z, l] of [
    ['01-1 나만의 카테고리 추가', '01 카테고리 선택', '뒤로'],
    ['02 랜덤 단어', '01 카테고리 선택', '뒤로 (고정·방향성 초기화)'],
    ['03 결과 준비', '02 랜덤 단어', '취소 (고정 유지)'],
    ['04 결과', '02 랜덤 단어', '다시 뽑기'],
    ['05 아이디어 확정', '01 카테고리 선택', '새 아이디어 시작'],
    ['05-1 만드는 법', '05 아이디어 확정', '뒤로'],
    ['06 공유하기 (시트)', '05 아이디어 확정', '닫기 · 바깥 누름 · 링크 복사 후'],
    ['07 공유 피드', '05 아이디어 확정', '뒤로'],
  ]) {
    const r = pathRow(bk, [box(a, { w: 250 }), arrow(null, 56), box(z, { w: 250 })]);
    r.itemSpacing = 12;
    r.appendChild(T(l, { size: 14, color: C.grey }));
  }

  sub('나중에 넣을 수도 있는 길');
  const lt = put(fs, AL('VERTICAL', { gap: 12 }));
  for (const [a, z, l] of [
    ['01 카테고리 선택', '기록 모아보기', 'Could'],
    ['05 아이디어 확정', '기록 모아보기', 'Could'],
    ['04 결과', '03 결과 준비', "'새로 생성' · 미정"],
  ]) {
    const r = pathRow(lt, [box(a, { w: 250 }), arrow(null, 56), box(z, { w: 250, dashed: true })]);
    r.itemSpacing = 12;
    r.appendChild(T(l, { size: 14, color: C.grey }));
  }

  sub('버튼별 이동 표');
  fs.appendChild(T("모든 버튼이 누르면 어디로 가는지 정리했어요. '화면 유지' = 같은 화면에서 내용만 바뀜.", { size: 13, color: C.grey }));
  const W = [110, 250, 270, 260];
  const tbl = put(fs, AL('VERTICAL', { radius: 12, stroke: C.line, name: 'NavTable' }));
  tbl.clipsContent = true;
  function cellFrame(w) {
    const c = AL('HORIZONTAL', { pad: [10, 14, 10, 14], cross: 'CENTER' });
    c.resize(w, 40);
    c.primaryAxisSizingMode = 'FIXED';
    c.counterAxisSizingMode = 'AUTO';
    return c;
  }
  function trow(cells, header) {
    const r = put(tbl, AL('HORIZONTAL', { fill: header ? C.ink : C.white, name: header ? 'Header' : 'Row' }));
    r.counterAxisAlignItems = 'CENTER';
    if (!header) { r.strokes = S(C.line); r.strokeTopWeight = 0; r.strokeLeftWeight = 0; r.strokeRightWeight = 0; r.strokeBottomWeight = 1; }
    cells.forEach((v, i) => {
      const c = put(r, cellFrame(W[i]));
      if (!header && i === 2) { c.appendChild(navTag('→ ' + v)); return; }
      const t = T(v, { size: 13, style: header || i === 0 ? 'Bold' : 'Regular', color: header ? C.white : i === 3 ? C.grey : C.ink });
      wrapText(c, t);
    });
    return r;
  }
  trow(['화면', '버튼', '누르면', '비고'], true);
  for (const row of [
    ['01', '기본 카테고리', '02 랜덤 단어', ''],
    ['01', '다른 사용자가 만든 카테고리', '02 랜덤 단어', '재활용 카테고리'],
    ['01', '+ 나만의 카테고리 추가', '01-1 나만의 카테고리 추가', ''],
    ['01', '기록', '기록 모아보기', 'Could · 미설계'],
    ['01-1', '추가하고 시작', '02 랜덤 단어', '새 카테고리 저장·공개'],
    ['01-1', '뒤로', '01 카테고리 선택', ''],
    ['02', '방향성 입력', '화면 유지', '단어 3개 새로 뽑힘'],
    ['02', '고정 핀', '화면 유지', '최대 2개'],
    ['02', '다시 뽑기 (고정 제외)', '화면 유지', '고정한 단어는 그대로'],
    ['02', '창조', '03 결과 준비', ''],
    ['02', '뒤로', '01 카테고리 선택', '고정·방향성 초기화'],
    ['03', '(자동) 준비 완료', '04 결과', '5초 이내'],
    ['03', '취소', '02 랜덤 단어', '고정 유지'],
    ['04', '확정', '05 아이디어 확정', ''],
    ['04', '다시 뽑기', '02 랜덤 단어', ''],
    ['04', '새로 생성', '03 결과 준비', '미정'],
    ['05', '저장', '화면 유지', "Should · '저장했어요' 토스트"],
    ['05', '공유', '06 공유하기 (시트)', ''],
    ['05', '진짜 만드는 법 · 레시피', '05-1 만드는 법', ''],
    ['05', '새 아이디어 시작', '01 카테고리 선택', ''],
    ['05', '기록', '기록 모아보기', 'Could · 미설계'],
    ['05-1', '공유하기', '06 공유하기 (시트)', ''],
    ['05-1', '뒤로', '05 아이디어 확정', ''],
    ['06', '링크 복사', '05 아이디어 확정', '시트 닫힘 · 토스트'],
    ['06', '피드에 올리기', '07 공유 피드', '내 글이 맨 위'],
    ['06', '닫기 / 바깥 누름', '05 아이디어 확정', ''],
    ['07', '최신순 · 인기순', '화면 유지', ''],
    ['07', '반응 버튼', '화면 유지', '하나만 선택 · 다시 누르면 취소'],
    ['07', '카드', '화면 유지', '글 전체 펼치기'],
    ['07', '뒤로', '05 아이디어 확정', '들어온 화면'],
  ]) trow(row, false);
}

// ---------- 전체 배치 정리 ----------
async function relayout() {
  const f = K.frame;
  if (f.layoutMode === 'NONE') {
    const a = await G('1:49');
    const fl = await G('1:769');
    fl.y = a.y + a.height + 72;
    f.resize(Math.max(f.width, a.x + a.width + 64, fl.x + fl.width + 64), fl.y + fl.height + 64);
  } else if (f.layoutMode === 'VERTICAL') {
    f.primaryAxisSizingMode = 'AUTO';
    f.counterAxisSizingMode = 'AUTO';
  }
  const comps = await G('1:2');
  comps.y = f.y + f.height + 160;
  figma.viewport.scrollAndZoomIntoView([f]);
}

// ---------- 실행 ----------
const STEPS = [
  ['A. 01-1 나만의 카테고리 추가 (새 화면)', stepA],
  ['B. 02 랜덤 단어 — 방향성 입력·단어 고정', stepB],
  ['C. 03 결과 준비 — 이동 표시', stepC],
  ['D. 04 결과 — 이동 표시', stepD],
  ['E. 05 아이디어 확정 — 만드는 법·공유', stepE],
  ['F. 05-1 만드는 법 (새 화면)', stepF],
  ['G. 06 공유하기 시트 (새 화면)', stepG],
  ['H. 07 공유 피드 (새 화면)', stepH],
  ['I. 화면 흐름 + 버튼별 이동 표', stepI],
];

const UI = `<style>body{font:12px -apple-system,sans-serif;margin:12px;color:#1f1f24}h3{margin:0 0 8px}pre{white-space:pre-wrap;font-size:11px;background:#f4f4f6;padding:8px;border-radius:6px;max-height:300px;overflow:auto}button{margin-top:8px;padding:6px 14px}</style>
<h3 id="h">적용 중…</h3><pre id="p"></pre><button onclick="parent.postMessage({pluginMessage:'close'},'*')">닫기</button>
<script>onmessage=(e)=>{const m=e.data.pluginMessage;document.getElementById('h').textContent=m.title;document.getElementById('p').textContent=m.log;}</script>`;
figma.showUI(UI, { width: 460, height: 420 });
figma.ui.onmessage = (m) => { if (m === 'close') figma.closePlugin(); };

(async () => {
  try {
    await init();
    for (const [name, fn] of STEPS) {
      CREATED = null;
      try {
        const r = await fn();
        log(`✓ ${name}${r === 'skip' ? ' (이미 적용됨 — 건너뜀)' : ''}`);
      } catch (e) {
        log(`✗ ${name}\n   ${e && e.message}\n   ${(e && e.stack) || ''}`);
        if (CREATED) { try { CREATED.remove(); } catch (_) {} }
      }
    }
    await relayout();
  } catch (e) {
    log(`✗ 실행 중단: ${e && e.message}`);
  }
  const failed = LOG.some((l) => l.startsWith('✗'));
  figma.ui.postMessage({ title: failed ? '일부 실패 — 아래 내용을 복사해서 알려주세요' : '모두 적용됐어요', log: LOG.join('\n') });
})();
