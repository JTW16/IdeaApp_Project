# IdeaApp — 작업 인수인계 (Claude Code용)

> 이 파일은 다른 컴퓨터 · 다른 세션의 Claude가 이어서 작업할 수 있게 정리한 것이다. (마지막 갱신: 2026-10-19)
> **이 프로젝트에서는 사용자 전역 `~/.claude/CLAUDE.md`(Flutter "UniTask" 규칙 — Dart, Riverpod, dot shorthand 등)를 적용하지 않는다.**
> 이 저장소는 TypeScript(React Native + Node.js)다. 기존 코드 스타일(한국어 주석, 화면 번호 주석)을 따른다.

먼저 읽을 순서: 이 파일 → [`idea-helper/팀원_안내.md`](idea-helper/팀원_안내.md)의 '2. 남은 일과 계획'(남은 일 · 우선순위) → [`idea-helper/README.md`](idea-helper/README.md)(구조 · 실행) → 같은 파일의 '1. 시연 가이드'(시연 절차)

팀원에게 보여 줄 문서는 **`idea-helper/팀원_안내.md` 한 파일**에 모은다(사용자 결정, 10-19): 1. 시연 가이드 · 2. 남은 일과 계획 · 3. 기획서 대비 검토와 평가 · 4. 제안. 새 md 파일을 만들지 말고 이 파일에 절(##)을 추가하고 맨 위 목차에 한 줄 넣는다.

---

## 1. 프로젝트 한 줄

대학 수업 팀 프로젝트(5팀, 김민성 · 지태웅) **"아이디어 보조 어플"**: 카테고리를 고르면 랜덤 단어 3개가 나오고, AI(Gemini)가 세 단어를 엮어 아이디어를 만든다. 같은 조합(카테고리 + 정렬한 단어 3개 + 방향성)은 DB에서 꺼내 AI를 다시 부르지 않는다(기획서 목표 4).

**목표: 발표 때 PC 브라우저로 실제로 돌아가는 시연** (10-19부터 넓은 창에서는 앱이 휴대폰 크기 틀로 나와 DevTools 불필요). 스토어 배포 · 운영 품질 작업(EAS, Play 정책, Docker 등)은 사용자가 원하지 않았다 — 먼저 제안하지 말 것.

## 2. 사용자와 일하는 방식

- 한국어로 대화한다. 쉬운 말로, 결론 먼저.
- "계획부터"라고 하면 계획만 보여주고 승인 후 진행. 결정이 필요한 것(범위 · 디자인 선택)은 짧게 묻는다.
- 사용자는 **직접 화면을 보고 확인**하는 것을 좋아한다. 바꾼 뒤 서버 · 앱을 켜 두고 확인 방법을 알려준다.
- 커밋 · 푸시는 요청할 때만.
- 비밀번호 · API 키는 채팅으로 받지 않는다. 사용자가 `server/.env`에 직접 넣게 안내한다.
- Gemini 호출은 한도를 쓰므로 꼭 필요할 때만 하고, 몇 번 쓰는지 알린다.

## 3. 폴더 · 문서 지도

```
IdeaApp/
├─ CLAUDE.md                     ← 이 파일
├─ idea-helper/                  ← 코드 + README + 팀원_안내.md
│  ├─ app/      React Native (Expo SDK 57) + TypeScript, Expo Router. 웹 미리보기로 시연
│  ├─ server/   Node.js + Fastify + TypeScript, PostgreSQL + pgvector(Supabase), Gemini API
│  ├─ shared/   앱 · 서버 공용 요청 · 응답 타입 (api.ts)
│  └─ 팀원_안내.md   팀원용 문서 한 파일 (시연 가이드 · 남은 일 · 기획서 대비 검토 · 제안)
├─ 아이디어_보조_어플_기획서.docx   4주차 기획서 (목표 4개, 범위, 위험)
├─ 아이디어_보조_어플_3주차.docx    3주차 요구사항
├─ 아이디어_보조_어플_화면상세.docx  5주차 화면 상세 명세 (화면 9개)
├─ 아이디어 보조 어플 - 화면 설계서 (화살표).pdf   Figma 화면 설계서
├─ architecture_nodejs.pdf      ★ 6주차 아키텍처 "통합본" (최종: React Native + Node.js + PostgreSQL/pgvector + Gemini)
├─ 아이디어_보조_어플_아키텍처.docx  ⚠ 6주차 초안 (Flutter + Supabase 풀스택 + Claude API) — 통합본에서 바뀜. 구현과 다름
├─ 노션_정리_2-5주차.md, 노션_정리_6주차.md   주차별 정리 (6주차 = 통합본과 같음)
├─ 와이어프레임.txt, 3부_아키텍처_과제/*.png
├─ figma-plugin/, figma-plugin-arrows/   화면 설계서 수정 · 화살표 그리기용 Figma 개발 플러그인
└─ .claude/launch.json          미리보기 서버 설정 (idea-server: 4000, idea-app-web: 8081)
```

docx/pdf 읽는 법(이 환경에 도구가 없을 때): `unzip -p 파일.docx word/document.xml | sed -e 's#</w:p>#\n#g' -e 's/<[^>]*>//g'`, PDF는 `pdftotext -layout`.

## 4. 기술 스택과 결정 (왜 이렇게 됐는지)

| 계층 | 선택 | 메모 |
|---|---|---|
| 앱 | React Native + Expo SDK 57 + Expo Router, TypeScript | 웹(react-native-web)으로 시연. 저장한 기록: 웹 localStorage / 휴대폰 SQLite |
| 서버 | Node.js + Fastify + TypeScript (`tsx`로 실행) | API 키 숨김, "DB 먼저 · 없으면 AI", 익명 JWT, 호출 제한, 공유 링크 HTML |
| DB | PostgreSQL + pgvector. **Supabase를 DB로만** 사용 (10-19 연결) | `DATABASE_URL` 비우면 내장 PGlite(`server/.data/pglite`)로 동작 |
| AI 생성 | Gemini `gemini-3.5-flash` (예비 `gemini-flash-latest`), 아이디어 5초 · 만드는 법 20초 제한 | 키가 없으면 예시(mock) 모드 |
| 임베딩 | `gemini-embedding-001` 768차원, 단어 벡터는 DB에 저장, 문장 벡터는 `embed_cache` | 방향성 · 나만의 카테고리 연관 단어 |
| 인증 | 로그인 없음, 기기 ID → 서버가 익명 JWT 발급 | DB에 없는 사용자 토큰은 401 → 앱이 자동 재발급 |

사용자 결정 기록:
- 10-16 목표를 "실제 배포"에서 **"PC 브라우저 시연"**으로 좁힘.
- 10-17 **하단 탭 바(홈 · 피드 · 기록)를 모든 화면에** (추천은 탭 화면만이었으나 사용자가 "모든 화면" 선택). 04 · 05 뒤로 버튼, 02 · 04 · 05 · 05-1 '홈' 버튼.
- 10-18 **발표에도 단어를 늘림** — 직접 선별(라이선스 문제 없음), 440 → 2,311개. 50만 개 사전 전체는 하지 않기로(모르는 단어 · 조합 재사용 사라짐 · 비용).
- 10-18 **DB는 Supabase** (Session pooler, 서울). 10-19 연결 · 데이터 이동 완료.
- 10-19 **04 '다시 조합하기'** (기획서의 '새로 생성' 대신): 같은 단어로 다른 아이디어, 누를 때마다 AI(개수 제한 없음), 새 결과가 맨 위 · 이전은 아래, 버튼은 [다시 뽑기 | 다시 조합하기] 나란히. 조합 키에 `#임의값`을 붙여 저장해 '창조'의 같은 조합 재사용(목표 4)은 그대로.
- 10-19 Gemini 구독 요금제(Google AI Plus 등)는 **API 한도와 별개**라 도움 안 됨 → 사용자가 AI Studio에서 **결제 연결(유료 1등급, 선불 크레딧 ₩8,000, 자동 충전 꺼짐)**. 아이디어 1회 약 ₩10 · 만드는 법 약 ₩30이라 시연엔 충분.

## 5. 새 컴퓨터에서 시작하기

필요: Node.js 20 이상(원래 PC는 v24), Git, Chrome.

```bash
git clone https://github.com/JTW16/IdeaApp.git
cd IdeaApp/idea-helper/server && npm install
cd ../app && npm install
```

**`server/.env`는 Git에 없다(비밀).** `server/.env.example`을 복사해 `server/.env`를 만들고 채운다:
- `GEMINI_API_KEY` — 원래 PC의 `.env`에서 사용자가 직접 옮기거나 Google AI Studio에서 새로 발급
- `DATABASE_URL` — Supabase 대시보드 → Connect → **Session pooler** 주소(+ DB 비밀번호). **반드시 넣을 것**: 넣지 않으면 빈 내장 DB가 새로 생기고 단어 벡터를 처음부터 다시 계산해야 한다(무료 한도로 며칠 걸림). 단어 · 벡터 · 피드는 전부 Supabase에 있다.
- `JWT_SECRET` — 긴 임의 문자열. 원래 값과 달라도 됨(앱이 토큰을 자동 재발급)
- 나머지는 예시 값 그대로

실행(사용자가 직접 할 때는 터미널 두 개):

```bash
cd idea-helper/server && npm run dev    # 4000, 로그에 "DB: 외부 PostgreSQL (….pooler.supabase.com)" 확인
cd idea-helper/app && npm run web       # 8081 → Chrome에서 http://localhost:8081 (휴대폰 크기 틀로 나옴)
```

Claude Code 데스크톱 앱이면 `.claude/launch.json`의 `idea-server`, `idea-app-web`을 preview로 켤 수 있다.

## 6. 명령 모음 (`idea-helper/server`)

| 명령 | 하는 일 | 주의 |
|---|---|---|
| `npm run dev` / `npm start` | 서버 (dev는 파일 바뀌면 재시작) | 켤 때 새 단어 추가 + 남은 벡터를 백그라운드 계산. 발표 당일 서버 여는 법은 `idea-helper/팀원_안내.md`의 '1. 시연 가이드' |
| `npm test` | 테스트 18개 (예시 AI, 메모리 DB) | Gemini · Supabase 안 씀 |
| `npm run typecheck` | 타입 검사 | |
| `npm run check` | 시연 직전 점검(서버 · DB · 벡터 · 피드 · Gemini 1회 호출) | 서버가 켜져 있어야 함, Gemini 1회 사용 |
| `npm run demo` | **시연 데이터 초기화**: 아이디어 · 피드 · 사용자 · 나만의 카테고리를 지우고 실제 AI로 피드 7~8개 채움 | ⚠ 지금은 **Supabase 데이터를 지운다**. Gemini 약 11~14회. 서버를 끄고 실행 |
| `npm run db:copy` | 내장 PGlite → `DATABASE_URL` DB로 전부 복사 (`-- --replace`면 받는 쪽을 비우고) | 10-19에 한 번 실행 완료. 다시 쓸 일 거의 없음 |

앱(`idea-helper/app`): `npm run typecheck`, `npm run lint`. 끝내기 전에 둘 다 돌린다(`app/AGENTS.md` 규칙). Expo API를 건드리기 전에 SDK 57 문서를 확인한다.

## 7. 현재 상태 (2026-10-19)

- 서버 테스트 18개 · 타입 검사 · 앱 lint 통과.
- DB: Supabase(서울) 연결 완료. 리롤 평균 27ms(목표 0.5초), 피드 26ms.
- 단어 2,311개 (음식 개발 309 · 프로그램 개발 289 · 공모전 주제선정 265 + 매칭용 일반 단어 1,480, `server/src/seed-words.ts`). 벡터 2,311개 모두 계산 완료(10-19).
- 10-19 `npm run demo`로 다시 채움: 피드 글 8개(실제 AI), 나만의 카테고리 3개(캠핑 요리 · 여행 앱 · 카페 창업). 이전 데이터 백업은 `server/.data/supabase-backup-20261019.json`(Git에 없음, 원래 PC에만).
- PC 브라우저로 전 화면 확인 완료(10-16 · 10-17 · 10-18). 탭 바 글씨 잘림, 한글 줄바꿈, 버튼 안 버튼 오류 고침.
- **Gemini 유료 1등급**(10-19). 10-16 이후 고친 부분(창조 5초, 같은 조합 재사용, 만드는 법, 공유 링크, 취소 시 중단, 한자)을 실제 AI로 모두 확인, `npm run check` 모두 ✅. 한도 초과 안내만 실제로는 확인 못 함(테스트로만).

## 8. 남은 일 요약 (자세히는 `idea-helper/팀원_안내.md`의 '2. 남은 일과 계획')

1. ~~Gemini 한도 · 실제 AI 체크리스트 · 남은 벡터~~ → 10-19 끝. 발표 전 크레딧 잔액만 확인
2. ~~시연 데이터 · 모바일 크기 레이아웃(위치 계산)~~ → 10-19 끝. 탭 바 모양 · 아이콘만 사람 눈으로 한 번 보기
4. 발표 자료의 화면 흐름 갱신(탭 바는 Figma 설계서에 없던 것), 리허설, 백업 영상
5. 팀 결정 필요: 카테고리 사용 횟수 의미, 신고 기능(몇 회에 숨김)
6. 🟡 성능 측정 스크립트, 앱 아이콘(지금 Expo 기본), 노션 결정 기록

## 9. 알아둘 함정 (실제로 겪은 것)

- **Gemini 429**: `retryDelay`가 크면 하루 한도. `ai.ts`가 그 모델을 기억해 건너뛰고, 모두 막히면 앱에 "AI 사용 한도를 다 썼어요". 임베딩 한도는 서버 로그 `임베딩 한도에 걸려 N초 기다렸다…`.
- **lite 모델**(`gemini-flash-lite-latest`)은 `thinkingBudget: 0`을 거부(400)하고, 빼면 5초 가까이 걸려 예비 모델로 부적합.
- **PGlite는 한 프로세스만** 열 수 있다. 내장 DB를 직접 여는 스크립트는 서버를 끈 뒤 실행.
- **Supabase**: Direct connection은 무료 플랜에서 IPv6 전용 → Session pooler(IPv4, 5432) 사용. 주소에 `sslmode`가 있으면 node-postgres가 ssl 설정을 덮어써 인증서 오류 → `db.ts`가 빼고 직접 정함. 무료 프로젝트는 오래 안 쓰면 일시 정지 → 발표 전 대시보드 확인.
- **연관 단어 판단 기준**(`MATCH_MIN_SPREAD` 0.03): 단어 2,311개로 실측한 값. 단어 풀을 크게 바꾸면 다시 재야 한다(10-18 측정 방법: `embed_cache`의 문장들로 40개 거리 분포 비교). 한 글자 단어는 '허브 단어'라 매칭에서 제외.
- **웹 휴대폰 틀**: 루트 `_layout.tsx`가 창 너비 600px 이상이면 390×844 틀(높이는 창에 맞춰 줄어듦) 안에 Stack · 공유 시트 · 토스트를 넣는다. 탭 바는 넓은 창에서 기본값이 '아이콘 옆 글씨'라 `tabBarLabelPosition: 'below-icon'`으로 고정.
- **웹(react-native-web)**: `accessibilityRole="button"`인 Pressable 안에 Pressable을 넣으면 `<button>` 안 `<button>` 오류 → 형제로 겹쳐 놓기. 한글 줄바꿈은 루트 `_layout.tsx`의 `word-break: keep-all`. 하단 탭 버튼은 안쪽 여백 5px이 고정이라 탭 바 높이로 해결(`(tabs)/_layout.tsx`).
- **Expo Router 구조**: `src/app/_layout.tsx`(Stack: (tabs) + share 시트) → `(tabs)/_layout.tsx`(Tabs: (home) · feed · saved) → `(tabs)/(home)/_layout.tsx`(Stack: 01~05-1). 탭 화면은 계속 살아 있으므로 새로고침이 필요하면 `useFocusEffect`. 네비게이터 옵션을 바꾸면 핫 리로드로 안 바뀌니 페이지 새로고침.
- **브라우저 자동화(Claude 미리보기 창)**: 모바일 크기 에뮬레이션에서 좌표 클릭이 안 먹히고, 창이 숨겨져 있으면 스크린샷이 실패한다 → DOM `.click()` · `get_page_text` · `elementFromPoint`로 확인.
- **Windows**: 터미널에서 curl로 한글 JSON을 보내면 글자가 깨져 저장된 적 있음 → Node 스크립트로 요청.
- 미리보기로 켠 서버는 앱이 한동안 안 쓰면 자동으로 꺼진다. 사용자가 오래 켜 둘 땐 직접 터미널에서 실행하라고 안내.

## 10. 주요 파일

| 파일 | 내용 |
|---|---|
| `server/src/app.ts` | 모든 API(익명 인증, 카테고리, 뽑기 · 방향성, 창조(캐시), 만드는 법, 나만의 카테고리, 공유 · 피드 · 반응, 공유 웹 페이지, `/health` 집계) |
| `server/src/ai.ts` | Gemini 생성 · 임베딩, 예비 모델 · 재시도 · 한도 처리, 예시(mock) AI |
| `server/src/db.ts` | PGlite / PostgreSQL(Supabase SSL) 연결, 마이그레이션, `copyAll` |
| `server/src/seed.ts`, `seed-words.ts` | 단어 풀 동기화(새 단어만), 벡터 계산(묶음 · 이어서) |
| `server/src/schema.sql` | 테이블 (조합 키 UNIQUE, 반응 1개 등 규칙을 DB 제약으로) |
| `server/test/flow.test.ts`, `fixes.test.ts` | 핵심 흐름 7개 + 수정 사항 10개 |
| `app/src/app/` | 화면들 (README '화면 ↔ 파일' 표) |
| `app/src/lib/` | `api.ts`(서버 호출 · 토큰), `flow.ts`(화면 간 상태), `nav.ts`(홈 · 뒤로), `storage*.ts`(기록) |
| `app/src/components/ui.tsx` | 공용 컴포넌트 (`IdeaText`: 설명을 문장별 문단으로) |
