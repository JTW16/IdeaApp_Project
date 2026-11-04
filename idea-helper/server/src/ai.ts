// 외부 AI: Gemini API (LLM + 임베딩). GEMINI_API_KEY가 없으면 예시 결과를 돌려주는 mock으로 동작한다.
import type { Config } from './config.js';

export interface IdeaInput {
  categoryName: string;
  words: string[];
  direction: string;
  /** 04 '다시 조합하기': 같은 단어로 이미 나온 아이디어 (이것들과 다르게 만든다) */
  avoid?: string[];
}
export interface IdeaOutput {
  title: string;
  content: string;
}
export interface RecipeInput {
  categoryName: string;
  kind: 'food' | 'plan';
  title: string;
  content: string;
  words: string[];
}
export interface RecipeOutput {
  feasible: boolean;
  summary: { time: string; difficulty: string; amount: string };
  ingredients: string[];
  steps: string[];
}

export interface AiProvider {
  name: 'gemini' | 'mock';
  /** signal: 앱이 요청을 취소하면(연결 끊김) AI 호출도 멈춘다 */
  generateIdea(input: IdeaInput, signal?: AbortSignal): Promise<IdeaOutput>;
  generateRecipe(input: RecipeInput, signal?: AbortSignal): Promise<RecipeOutput>;
  /** patient: 한도에 걸리면 기다렸다 다시 시도 (서버 시작 때 단어 벡터 계산용). 화면 요청은 기다리지 않는다. */
  embed(texts: string[], opts?: { patient?: boolean; log?: (m: string) => void }): Promise<number[][]>;
  /** 한 번에 계산할 단어 수와 묶음 사이 쉬는 시간 */
  embedPlan: { batch: number; pauseMs: number };
}

export class AiError extends Error {
  constructor(public code: 'AI_TIMEOUT' | 'AI_FAILED' | 'AI_BAD_OUTPUT' | 'AI_QUOTA', message: string) {
    super(message);
  }
}

const SYSTEM = [
  '너는 아이디어 발상을 돕는 조수다.',
  '주어진 카테고리 안에서, 주어진 단어 3개를 모두 자연스럽게 엮어 새롭고 구체적인 아이디어 하나를 만든다.',
  '진부한 표현과 과장 광고 문구를 피하고, 실제로 만들 수 있는 수준으로 쓴다.',
  '반드시 한국어로 답한다. 한자나 일본어 문자는 쓰지 않고, 같은 낱말을 연달아 반복하지 않는다.',
].join(' ');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 429 응답에서 '몇 초 뒤 다시' 값을 읽는다 */
function retryAfterMs(body: string) {
  const m = body.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/) ?? body.match(/retry in (\d+(?:\.\d+)?)s/i);
  return m ? Math.ceil(Number(m[1]) * 1000) + 1000 : 30_000;
}

const normalize = (v: number[]) => {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
};

export function createGemini(cfg: Config['gemini'], dim: number): AiProvider {
  const base = 'https://generativelanguage.googleapis.com/v1beta/models';
  const headers = { 'content-type': 'application/json', 'x-goog-api-key': cfg.apiKey };
  /** 하루 한도에 걸린 모델과 다시 쓸 수 있는 시각 */
  const exhaustedUntil = new Map<string, number>();

  /**
   * 주 모델이 붐비거나(503) 한도(429) · 지원 종료(404)면 예비 모델로, 결과가 깨졌거나 연결이 끊기면 한 번 더.
   * 전체 시간은 timeoutMs 안에서. (시연 중 한 번 실패로 화면이 멈추지 않게)
   */
  async function generate(prompt: string, schema: object, timeoutMs: number, cancel?: AbortSignal): Promise<any> {
    const generationConfig: Record<string, unknown> = {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.9,
    };
    if (cfg.thinkingBudget !== null) generationConfig.thinkingConfig = { thinkingBudget: cfg.thinkingBudget };
    const deadline = Date.now() + timeoutMs;
    const models = [cfg.model, ...cfg.fallbackModels.filter((m) => m !== cfg.model), cfg.model]
      .filter((m) => (exhaustedUntil.get(m) ?? 0) <= Date.now());
    let lastError = '';
    let quotaHits = 0;
    for (const model of models) {
      const left = deadline - Date.now();
      if (left < 1000) break;
      if ((exhaustedUntil.get(model) ?? 0) > Date.now()) continue;
      if (cancel?.aborted) throw new AiError('AI_FAILED', '앱에서 요청을 취소했습니다');
      try {
        const res = await fetch(`${base}/${model}:generateContent`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig,
          }),
          signal: cancel ? AbortSignal.any([AbortSignal.timeout(left), cancel]) : AbortSignal.timeout(left),
        });
        if (res.ok) return parse(await res.json());
        const body = await res.text();
        lastError = `${model} ${res.status}: ${body.slice(0, 200)}`;
        if (res.status === 429) {
          quotaHits++;
          // 하루 한도처럼 오래 기다려야 하면 그동안 이 모델은 건너뛴다 (매 요청마다 헛걸음하지 않게)
          const wait = retryAfterMs(body);
          if (wait > 60_000) exhaustedUntil.set(model, Date.now() + wait);
        }
        if (![404, 429, 500, 503].includes(res.status)) break;
      } catch (e: any) {
        if (cancel?.aborted) throw new AiError('AI_FAILED', '앱에서 요청을 취소했습니다');
        if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new AiError('AI_TIMEOUT', `AI 응답이 ${timeoutMs / 1000}초를 넘었습니다`);
        lastError = `${model}: ${e?.message ?? e}`;
        if (e instanceof AiError && e.code !== 'AI_BAD_OUTPUT') throw e;
      }
    }
    // 모든 모델이 한도에 걸렸거나, 주 모델이 하루 한도라 예비 모델(자주 붐빔)만 남았을 때는 한도 문제로 알린다
    const mainExhausted = (exhaustedUntil.get(cfg.model) ?? 0) > Date.now();
    if (!models.length || (quotaHits && quotaHits === models.length) || mainExhausted) {
      throw new AiError('AI_QUOTA', `Gemini 사용 한도 초과 — ${lastError || '모든 모델이 한도에 걸려 있음'}`);
    }
    throw new AiError('AI_FAILED', `AI 호출 실패 — ${lastError || '시간 부족'}`);
  }

  function parse(data: any) {
    const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
    try {
      return JSON.parse(text);
    } catch {
      const reason = data?.candidates?.[0]?.finishReason ?? data?.promptFeedback?.blockReason ?? '알 수 없음';
      throw new AiError('AI_BAD_OUTPUT', `AI 결과 형식이 올바르지 않습니다 (이유: ${reason}, 길이 ${text.length}): ${text.slice(0, 120)}`);
    }
  }

  return {
    name: 'gemini',
    async generateIdea({ categoryName, words, direction, avoid }, signal) {
      const prompt = [
        `카테고리: ${categoryName}`,
        `단어 3개: ${words.join(', ')}`,
        direction ? `방향성: ${direction} (이 방향에 맞게)` : '',
        avoid?.length
          ? `이 단어들로 이미 나온 아이디어:\n${avoid.map((a) => `- ${a}`).join('\n')}\n위 아이디어들과 겹치지 않게, 세 단어를 엮는 방식(무엇을 만드는지 · 누구를 위한 것인지 · 형태나 쓰임)을 완전히 다르게 바꿔라.`
          : '',
        '세 단어를 모두 쓴 아이디어를 만들어라. title은 20자 이내의 이름, content는 2~3문장의 설명(무엇이고, 어떻게 다르고, 누구에게 좋은지).',
      ].filter(Boolean).join('\n');
      return generate(prompt, {
        type: 'OBJECT',
        properties: { title: { type: 'STRING' }, content: { type: 'STRING' } },
        required: ['title', 'content'],
      }, cfg.timeoutMs, signal);
    },
    async generateRecipe({ categoryName, kind, title, content, words }, signal) {
      const what = kind === 'food'
        ? 'ingredients에는 재료와 분량(4~8개), steps에는 만드는 순서(4~6단계)를 쓴다. summary.time은 걸리는 시간, difficulty는 쉬움/보통/어려움, amount는 분량.'
        : 'ingredients에는 준비물 · 필요한 도구(4~8개), steps에는 실행 단계(4~6단계)를 쓴다. summary.time은 걸리는 기간, difficulty는 쉬움/보통/어려움, amount는 필요한 인원 · 규모.';
      const prompt = [
        `카테고리: ${categoryName}`,
        `아이디어: ${title}`,
        `설명: ${content}`,
        `사용한 단어: ${words.join(', ')}`,
        `이 아이디어를 실제로 만드는 법을 정리하라. ${what}`,
        '현실적으로 만들 수 없는 아이디어면 feasible을 false로 하고 나머지는 빈 값으로 둔다.',
      ].join('\n');
      return generate(prompt, {
        type: 'OBJECT',
        properties: {
          feasible: { type: 'BOOLEAN' },
          summary: {
            type: 'OBJECT',
            properties: { time: { type: 'STRING' }, difficulty: { type: 'STRING' }, amount: { type: 'STRING' } },
            required: ['time', 'difficulty', 'amount'],
          },
          ingredients: { type: 'ARRAY', items: { type: 'STRING' } },
          steps: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['feasible', 'summary', 'ingredients', 'steps'],
      }, cfg.recipeTimeoutMs, signal);
    },
    embedPlan: { batch: cfg.embedBatch, pauseMs: cfg.embedPauseMs },
    async embed(texts, opts = {}) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += 100) {
        const chunk = texts.slice(i, i + 100);
        for (let attempt = 0; ; attempt++) {
          const res = await fetch(`${base}/${cfg.embedModel}:batchEmbedContents`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              requests: chunk.map((t) => ({
                model: `models/${cfg.embedModel}`,
                content: { parts: [{ text: t }] },
                taskType: 'SEMANTIC_SIMILARITY',
                outputDimensionality: dim,
              })),
            }),
            signal: AbortSignal.timeout(30000),
          });
          if (res.ok) {
            const data: any = await res.json();
            for (const e of data.embeddings ?? []) out.push(normalize(e.values));
            break;
          }
          const body = await res.text();
          if (opts.patient && [429, 503].includes(res.status) && attempt < 8) {
            const wait = retryAfterMs(body);
            opts.log?.(`임베딩 한도에 걸려 ${Math.round(wait / 1000)}초 기다렸다 다시 시도합니다`);
            await sleep(wait);
            continue;
          }
          throw new AiError('AI_FAILED', `임베딩 호출 실패 (${res.status}): ${body.slice(0, 300)}`);
        }
      }
      if (out.length !== texts.length) throw new AiError('AI_BAD_OUTPUT', '임베딩 개수가 맞지 않습니다');
      return out;
    },
  };
}

/** 키가 없을 때 쓰는 예시 AI. 결과는 정해진 문장이고, 벡터는 글자 조각 해시라 의미 매칭은 부정확하다. */
export function createMock(dim: number): AiProvider & { calls: { idea: number; recipe: number; embed: number } } {
  const calls = { idea: 0, recipe: 0, embed: 0 };
  const hash = (s: string) => {
    let h = 2166136261;
    for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
    return h >>> 0;
  };
  const vec = (text: string) => {
    const v = new Array(dim).fill(0);
    const t = text.replace(/\s+/g, '');
    const chars = [...t];
    for (const c of chars) v[hash(c) % dim] += 1;
    for (let i = 0; i < chars.length - 1; i++) v[hash(chars[i] + chars[i + 1]) % dim] += 2;
    v[hash(t) % dim] += 0.5;
    return normalize(v);
  };
  return {
    name: 'mock',
    calls,
    embedPlan: { batch: 1000, pauseMs: 0 },
    async generateIdea({ categoryName, words, direction, avoid }) {
      calls.idea++;
      const [a, b, c] = words;
      return {
        title: `${b}을(를) 더한 ${a} ${c}${avoid?.length ? ` (조합 ${avoid.length + 1})` : ''}`,
        content: `${categoryName} 분야에서 '${a}', '${b}', '${c}'를 하나로 엮은 아이디어입니다.${direction ? ` '${direction}' 방향에 맞췄습니다.` : ''} (예시 결과 — 서버에 GEMINI_API_KEY를 넣으면 실제 AI가 만듭니다.)`,
      };
    },
    async generateRecipe({ kind, words }) {
      calls.recipe++;
      return {
        feasible: true,
        summary: kind === 'food'
          ? { time: '약 40분', difficulty: '보통', amount: '2인분' }
          : { time: '약 2주', difficulty: '보통', amount: '2~3명' },
        ingredients: [...words.map((w) => `${w} (예시)`), kind === 'food' ? '소금 약간' : '노트북'],
        steps: [
          `${words[0]}을(를) 준비해요.`,
          `${words[1]}와(과) 함께 기본 형태를 만들어요.`,
          `${words[2]}을(를) 더해 마무리해요.`,
          '맛 · 반응을 보고 조절해요. (예시 결과)',
        ],
      };
    },
    async embed(texts) {
      calls.embed++;
      return texts.map(vec);
    },
  };
}

export function createAi(cfg: Config): AiProvider {
  return cfg.gemini.apiKey ? createGemini(cfg.gemini, cfg.embedDim) : createMock(cfg.embedDim);
}
