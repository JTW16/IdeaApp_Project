# 아이디어 보조 어플 (5팀)

카테고리를 고르면 랜덤 단어 3개가 나오고, AI가 세 단어를 조합해 새로운 아이디어를 만들어 주는 모바일 앱입니다.
기획서 · 화면 상세 명세 · Figma 화면 설계서 · 아키텍처 설계서(6주차)를 그대로 따라 만들었습니다.

```
idea-helper/
├─ app/      모바일 앱 — React Native (Expo) + TypeScript, Expo Router
├─ server/   API 서버 — Node.js (TypeScript) + Fastify, PostgreSQL + pgvector, Gemini API
├─ shared/   앱과 서버가 함께 쓰는 요청 · 응답 타입 (api.ts)
└─ 팀원_안내.md   팀원용 문서 (아래 '문서 안내')
```

## 문서 안내

| 문서 | 언제 보나 |
|---|---|
| 이 파일 (README) | 구조 · 실행 방법 · 화면 ↔ 파일 · API |
| [팀원_안내.md](팀원_안내.md) | 팀원용 한 파일: 1. 시연 가이드(발표 노트북 · 키 넘기기 · 당일 순서 · 문제 대처) · 2. 남은 일과 계획 · 3. 기획서 대비 검토와 평가 · 4. 제안 |

기획서 · 화면 상세 · 아키텍처 원본(docx · pdf)과 노션 정리는 저장소 맨 위 폴더에 있습니다.

## 팀 결정 → 구현

| 아키텍처 결정 | 구현 |
|---|---|
| 클라이언트: React Native (Expo) + TypeScript, 기기 저장은 SQLite | `app/` (Expo SDK 57). 저장한 아이디어는 `expo-sqlite`, 웹 미리보기에서는 localStorage |
| 서버: Node.js (TypeScript) + Fastify | `server/src/app.ts` |
| DB: PostgreSQL + pgvector | `server/src/schema.sql`. **Supabase**(관리형 PostgreSQL)를 DB로만 씀 — `DATABASE_URL`에 주소를 넣으면 연결, 비우면 내장 PostgreSQL(PGlite + pgvector)로 바로 실행 |
| 인증: 로그인 없음, 서버가 익명 토큰(JWT) 발급 | `POST /auth/anonymous` — 앱이 첫 실행 때 기기 ID로 자동 발급 |
| AI: Gemini Flash 계열, 같은 조합이 DB에 없을 때만 호출 | `server/src/ai.ts`. 키가 없으면 **예시 모드(mock)** 로 동작 |
| 연관 단어 매칭: 임베딩 + pgvector | 나만의 카테고리 · 방향성에 사용 (`embed_cache`로 같은 문장은 재사용) |
| 조합 키 = 카테고리 + 정렬한 단어 3개 + 방향성 (유일) | `ideas.combo_key UNIQUE` — 같은 조합은 AI 호출 0회 (기획서 목표 4) |
| 공유: '링크 복사'와 '피드에 올리기'가 공개 범위를 대신 | `posts.scope = link / feed`, 공유 링크는 `GET /s/{코드}` 읽기 전용 웹 페이지 |

## 바로 실행하기 (PC에서 웹 미리보기)

필요한 것: Node.js 20 이상 (개발 PC는 v24로 확인)

```bash
cd idea-helper/server
npm install
npm run dev
```

```bash
cd idea-helper/app
npm install
npm run web
```

- 서버: http://localhost:4000 (켤 때마다 `server/src/seed-words.ts`의 단어 중 DB에 없는 것을 넣습니다 — 기본 카테고리 3개, 단어 2,311개)
- 앱: http://localhost:8081 — PC 브라우저에서는 가운데에 휴대폰 크기(390×844) 틀로 나옵니다(개발자 도구 필요 없음, `src/app/_layout.tsx`). 창 너비가 600px보다 좁으면 틀 없이 꽉 채웁니다.
- `DATABASE_URL`이 없으면 데이터는 `server/.data/pglite`에 저장됩니다. 처음부터 다시 하려면 서버를 끄고 이 폴더를 지우면 됩니다.

## 휴대폰에서 실행하기 (Expo Go)

1. 휴대폰에 **Expo Go** 앱을 설치합니다 (Android · iOS).
2. PC와 휴대폰을 **같은 Wi-Fi**에 연결합니다.
3. 위처럼 서버를 켠 뒤, 앱 폴더에서 `npm start`를 실행하고 터미널에 나온 QR 코드를 Expo Go로 찍습니다.

```bash
cd idea-helper/app
npm start
```

앱은 Expo 개발 서버와 같은 PC의 4000번 포트로 자동 연결합니다. 연결이 안 되면:
- Windows 방화벽에서 Node.js의 4000번 포트(개인 네트워크) 접근을 허용합니다.
- 또는 `app/.env`에 `EXPO_PUBLIC_API_URL=http://<PC의 IP>:4000`을 적고 앱을 다시 시작합니다.
- 휴대폰에서 공유 링크를 열려면 `server/.env`의 `PUBLIC_BASE_URL`도 `http://<PC의 IP>:4000`으로 바꿉니다.

## 실제 AI(Gemini) 연결하기

1. Google AI Studio에서 Gemini API 키를 발급받습니다.
2. `server/.env.example`을 `server/.env`로 복사하고 `GEMINI_API_KEY`를 채웁니다.
3. 서버를 다시 시작합니다. 단어 벡터가 **백그라운드에서 Gemini 임베딩으로 다시 계산**됩니다.
   무료 등급 한도(분당 100건) 때문에 40개씩 30초 간격으로 계산해 약 5분 걸리며, 그동안에도 핵심 흐름(뽑기 · 창조)은 바로 쓸 수 있습니다.
   서버 로그에 `벡터 계산 완료`가 나오면 방향성 · 나만의 카테고리 연관 단어 매칭이 제대로 동작합니다. 중간에 꺼도 다음 실행 때 이어서 계산합니다.
4. 나만의 카테고리는 이름과 가장 가까운 단어 40개를 연결합니다(뜻이 여러 개인 한 글자 단어는 제외). 'ㅁㄴㅇㄹ'처럼 뜻을 알 수 없는 이름은
   모든 단어와 비슷하게 멀어서, 먼 10개와 가까운 5개의 평균 거리 차이가 작습니다(단어 2,311개 실측: 뜻 없는 이름 0.027 이하, 두 낱말 이름 0.031 이상).
   `MATCH_MIN_SPREAD`(기본 0.03)로 걸러냅니다. '공모전'처럼 짧고 넓은 이름은 걸릴 수 있어 "더 구체적으로" 안내가 나옵니다.
   - 무료 등급은 임베딩도 **하루 약 1,000개**에서 막힙니다(10-18 실측). 단어를 크게 늘리면 벡터 계산이 며칠에 나뉘고, 그동안은 계산된 단어만 매칭에 쓰입니다.

모델: 기본은 `gemini-3.5-flash`(실측 약 2초)이고, 붐비면(503) `GEMINI_FALLBACK_MODELS`의 모델로 넘어갑니다.
`gemini-2.5-flash`는 새 사용자에게 더 이상 제공되지 않습니다(2026-10 확인). 모델은 자주 바뀌니 404가 나면 `.env`의 `GEMINI_MODEL`만 바꾸면 됩니다.

무료 등급은 모델당 **하루 20회**만 생성할 수 있습니다. 한도에 걸린 모델은 서버가 기억해 두고 예비 모델로 넘어가며,
모두 막히면 앱에 "AI 사용 한도를 다 썼어요"가 뜹니다. 만드는 법은 답이 길어 5초가 아닌 20초 제한(`LLM_RECIPE_TIMEOUT_MS`)을 씁니다.

> 키는 서버의 `.env`에만 둡니다. 앱 코드나 Git에 올리지 마세요. (`.env`는 `.gitignore`에 들어 있습니다)

배포 때는 `JWT_SECRET`에 긴 임의 문자열을 넣습니다.

## Supabase 연결하기

Supabase는 **DB(PostgreSQL + pgvector)로만** 씁니다. 서버 코드는 그대로이고 주소 한 줄만 바꾸므로 다른 관리형 PostgreSQL로도 옮길 수 있습니다.

1. supabase.com에서 프로젝트를 만듭니다. 지역은 **Northeast Asia (Seoul)** — 응답이 빨라야 리롤 0.5초 목표에 유리합니다. DB 비밀번호는 따로 적어 둡니다.
2. 대시보드 위쪽 **Connect** → **Session pooler**의 주소를 복사합니다. (Direct connection은 무료 플랜에서 IPv6 전용이라 안 될 수 있음)
3. `server/.env`에 `DATABASE_URL=복사한 주소`를 넣고 `[YOUR-PASSWORD]`를 DB 비밀번호로 바꿉니다. (비밀번호의 `@ : / ? #`는 퍼센트 인코딩, 예: `@` → `%40`)
4. 서버를 끈 상태에서 지금까지의 데이터(단어 · 벡터 · 아이디어 · 피드)를 옮깁니다: `npm run db:copy`
5. 서버를 켜면 로그에 `DB: 외부 PostgreSQL (….pooler.supabase.com)`이 나옵니다.

- 접속은 항상 암호화합니다. 서버 인증서까지 검증하려면 Supabase Database 설정에서 인증서를 받아 `DATABASE_SSL_CA`에 경로를 넣습니다.
- 무료 프로젝트는 오래 쓰지 않으면 일시 정지됩니다. **발표 며칠 전에 대시보드에서 상태를 확인**하세요.
- 다시 내장 DB로 돌아가려면 `DATABASE_URL` 줄을 지우거나 주석 처리하면 됩니다(인터넷이 안 될 때 비상용).

## 발표 시연

[팀원_안내.md의 '1. 시연 가이드'](팀원_안내.md#1-시연-가이드)에 준비 순서 · 시연 시나리오 · 문제 대처를 정리했습니다.

```bash
cd idea-helper/server
npm run demo    # 서버를 끈 상태에서: 테스트 데이터를 지우고 실제 AI로 피드 · 카테고리 채우기
npm run check   # 서버를 켠 상태에서: 서버 · 벡터 · 피드 · Gemini 한도 점검
```

## 검사

```bash
cd idea-helper/server
npm test
npm run typecheck
```

```bash
cd idea-helper/app
npm run typecheck
npm run lint
```

서버 테스트(7개)는 핵심 흐름을 확인합니다: 카테고리당 단어 100개 이상, 토큰 없는 요청 거절, 고정 단어를 뺀 다시 뽑기,
**단어 순서만 바꾼 같은 조합은 AI 호출 0회**, 방향성이 다르면 다른 조합, 만드는 법 재사용, 나만의 카테고리 중복 처리,
링크 공유 · 피드 · 반응(하나만, 내 글 불가).
추가 테스트(11개, `test/fixes.test.ts`): 음식 판별, 금칙어, 숨긴 아이디어 교체, 뜻 없는 카테고리 이름 거절, 삭제된 사용자 토큰, 단어 추가, DB 옮기기,
AI 한도 초과 안내, 앱에서 취소하면 AI 호출 중단, `/health`의 AI 호출 · DB 재사용 집계, 04 다시 조합하기. 모두 예시 AI로 돌아 Gemini 한도를 쓰지 않습니다.

## 화면 ↔ 파일

모든 화면 아래에 **하단 탭 바**(🏠 홈 · 📣 피드 · 🗒️ 기록)가 있습니다. 탭을 바꿔도 각 탭의 화면은 그대로 남고,
지금 보고 있는 홈 탭을 한 번 더 누르면 01로 돌아갑니다. 02 · 04 · 05 · 05-1 상단 오른쪽의 '홈'은 언제나 01로 갑니다.
(화면 설계서에는 없던 구성이라 발표 자료의 화면 흐름도 함께 바뀝니다)

| 화면 설계서 | 파일 (`app/src/app/`) | 버튼 → 이동 |
|---|---|---|
| 01 카테고리 선택 | `(tabs)/(home)/index.tsx` | 카테고리 → 02 · '+ 나만의 카테고리 추가' → 01-1 |
| 01-1 나만의 카테고리 추가 | `(tabs)/(home)/category-new.tsx` | '추가하고 시작' → 02 · 뒤로 → 01 |
| 02 랜덤 단어 3개 | `(tabs)/(home)/words.tsx` | 고정 · 방향성 · 다시 뽑기 → 화면 유지 · '창조' → 03 · 뒤로 · 홈 → 01 |
| 03 결과 준비 | `(tabs)/(home)/preparing.tsx` | 완료 → 04 (자동) · '취소' → 02 (고정 유지, AI 호출도 멈춤) |
| 04 결과 | `(tabs)/(home)/result.tsx` | '다시 조합하기' → 같은 단어로 다른 아이디어를 맨 위에 추가(이전 결과는 아래, 카드를 눌러 고름) · '확정' → 05(고른 아이디어) · '다시 뽑기' · 뒤로 → 02 · 홈 → 01 |
| 05 아이디어 확정 | `(tabs)/(home)/confirm.tsx` | '저장' → 화면 유지 · '진짜 만드는 법' → 05-1 · '공유' → 06 · '새 아이디어 시작' · 홈 → 01 · 뒤로 → 04 |
| 05-1 만드는 법 | `(tabs)/(home)/recipe.tsx` | '공유하기' → 06 · 뒤로 → 05 · 홈 → 01 |
| 06 공유하기 시트 | `share.tsx` | '링크 복사' → 시트 닫힘 · '피드에 올리기' → 피드 탭 · '닫기' → 들어온 화면 |
| 07 공유 피드 | `(tabs)/feed.tsx` (피드 탭) | 정렬 · 반응 · 카드 펼치기 → 화면 유지. 탭에 올 때마다 새로 받음 |
| 기록 모아보기 (Could) | `(tabs)/saved.tsx` (기록 탭) | 저장한 아이디어 → 홈 탭의 05 · '삭제' → 기기에서 지움 |

## API (아키텍처 설계서 STEP 4)

| 요청 | 화면 |
|---|---|
| `POST /auth/anonymous` | 앱 처음 실행 |
| `GET /categories` | 01 |
| `POST /words/draw` | 02 뽑기 · 다시 뽑기 · 방향성 |
| `POST /ideas` | 02 → 03 '창조' (DB 먼저, 없을 때만 AI) |
| `POST /ideas/{id}/recombine` | 04 '다시 조합하기' (누를 때마다 AI, 이미 나온 결과와 겹치지 않게. 조합 키 뒤에 `#임의값`을 붙여 저장 → '창조'의 같은 조합 재사용은 원래 결과 그대로) |
| `POST /ideas/{id}/recipe` | 05-1 |
| `POST /categories/preview`, `POST /categories` | 01-1 |
| `POST /shares`, `GET /s/{코드}` | 06 '링크 복사', 공유 링크 웹 페이지 |
| `POST /posts`, `GET /posts`, `PUT /posts/{id}/reaction` | 06 '피드에 올리기', 07 |

## 만들지 않은 것 (문서에서 미정 · 범위 밖)

- 신고 기능 (DB 컬럼만 있음, 화면 · API 없음)
- 저장한 기록 삭제, 관리자 화면, EAS 빌드 설정 (스토어 배포용)
