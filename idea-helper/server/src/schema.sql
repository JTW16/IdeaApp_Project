-- 아이디어 보조 어플 DB (PostgreSQL + pgvector). 서버 시작 때 매번 실행해도 안전하다.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS meta (
  key text PRIMARY KEY,
  value text NOT NULL
);

-- 익명 사용자: 로그인 없이 기기마다 하나. 이름 · 연락처는 받지 않는다.
CREATE TABLE IF NOT EXISTS anon_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text UNIQUE NOT NULL,
  nickname text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id serial PRIMARY KEY,
  name text UNIQUE NOT NULL,
  name_key text UNIQUE NOT NULL, -- 공백 · 대소문자를 무시한 중복 검사용
  kind text NOT NULL CHECK (kind IN ('default', 'user')),
  name_vec vector(768),
  use_count int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES anon_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS words (
  id serial PRIMARY KEY,
  text text UNIQUE NOT NULL,
  vec vector(768)
);

CREATE TABLE IF NOT EXISTS category_words (
  category_id int NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  word_id int NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  score real NOT NULL DEFAULT 1,
  PRIMARY KEY (category_id, word_id)
);

-- 조합 결과: 조합 키(카테고리 + 정렬한 단어 3개 + 방향성)가 유일 → 같은 조합은 AI 호출 0회
CREATE TABLE IF NOT EXISTS ideas (
  id serial PRIMARY KEY,
  category_id int NOT NULL REFERENCES categories(id),
  word_ids int[] NOT NULL,
  direction text NOT NULL DEFAULT '',
  combo_key text UNIQUE NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  report_count int NOT NULL DEFAULT 0,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 만드는 법: 조합 결과와 1:1, 한 번 만들면 재사용
CREATE TABLE IF NOT EXISTS recipes (
  idea_id int PRIMARY KEY REFERENCES ideas(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('food', 'plan')),
  feasible boolean NOT NULL,
  summary jsonb NOT NULL,
  ingredients jsonb NOT NULL,
  steps jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 공유 글: 링크만(link) 또는 피드(feed). '링크 복사'와 '피드에 올리기' 버튼이 공개 범위를 대신한다.
CREATE TABLE IF NOT EXISTS posts (
  id serial PRIMARY KEY,
  idea_id int NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES anon_users(id),
  scope text NOT NULL CHECK (scope IN ('link', 'feed')),
  share_code text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idea_id, user_id, scope)
);

-- 반응: (글, 익명 ID)당 1개
CREATE TABLE IF NOT EXISTS reactions (
  post_id int NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES anon_users(id),
  kind text NOT NULL CHECK (kind IN ('like', 'meh', 'dislike')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- 방향성 · 카테고리 이름 벡터 캐시: 같은 문장은 임베딩 API를 다시 부르지 않는다
CREATE TABLE IF NOT EXISTS embed_cache (
  text text PRIMARY KEY,
  vec vector(768) NOT NULL
);

CREATE INDEX IF NOT EXISTS posts_feed_idx ON posts (scope, created_at DESC);
