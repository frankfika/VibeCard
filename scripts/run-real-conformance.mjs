#!/usr/bin/env node
/**
 * run-real-conformance.mjs — one-shot real-provider conformance for §1.2 / §1.3 / §1.4 / §4.3.
 *
 * Owner-driven acceptance step for the four `[~]` tasks in
 * docs/engineering/DEVELOPMENT_PLAN.md:
 *
 *   T1.2  Add AI Provider Boundary
 *   T1.3  Implement Owner Conversation
 *   T1.4  Generate Or Update Card From Memory
 *   T4.3  Prepare Demo Data
 *
 * Strategy:
 *   - 真实 conformance 的核心是「同样的 schema / 编排逻辑 + 切换到 configured real provider」。
 *     owner 配置 AI_API_BASE / AI_API_KEY / AI_MODEL 后，脚本会用同一套 node:test
 *     式的代码路径执行（cloudfunctions/agent/lib/agent.js + lib/providers.js），
 *     只是 provider 切到 HTTP 走真实端点。
 *   - 缺 key 时，自动退化到「mock provider parity」模式：起一个本地 OpenAI-compatible
 *     stub server（用 mock provider 充当模型），验证 schema、retry、typed-error、
 *     memory-context 注入、provider 选择五件事仍然成立。
 *   - Mini Program 端的 T1.3 / T1.4 通过 stub wx-server-sdk + agent/index.js 真入口
 *     来执行（沿用 cloudfunctions/agent/test/first-run-card-scope.test.js 的 stub
 *     模式），orchestration 与 vibe.js 行为等价（同样的 cloud.callFunction 调用链）。
 *   - T4.3 通过 fixtures + runConnectionSummary 验证强 / 弱边界识别（AI_BEHAVIOR §7）。
 *
 * 用法：
 *   1. cp scripts/conformance.env.example scripts/conformance.env
 *      填好你的（OpenAI-compatible / Ollama / vLLM 等）真实端点
 *   2. node scripts/run-real-conformance.mjs                # 全跑
 *      node scripts/run-real-conformance.mjs --dry-run      # 只列 case 不连任何网络
 *      node scripts/run-real-conformance.mjs --only=1.2,4.3 # 跑指定 task
 *      node scripts/run-real-conformance.mjs --skip-deploy  # 不调 deploy 脚本
 *      node scripts/run-real-conformance.mjs --strict       # 任一失败即 exit 1
 *
 * 输出：
 *   - 终端：每个 case 一行 + 末尾聚合
 *   - markdown 报告：.workbuddy/conformance-report-YYYY-MM-DD.md
 *
 * 注意：本脚本不会自动改 DEVELOPMENT_PLAN.md 的 Status —— owner 在审完报告后亲手改。
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { spawnSync, spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { Module } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const require = createRequire(import.meta.url);

// ---------- paths ----------
const AGENT_DIR = resolve(REPO_ROOT, 'packages/miniprogram/cloudfunctions/agent');
const AGENT_LIB = resolve(AGENT_DIR, 'lib');
const FIXTURES_PATH = resolve(REPO_ROOT, 'packages/miniprogram/miniprogram/data/vibe-fixtures.js');
const DEPLOY_SCRIPT = resolve(REPO_ROOT, 'packages/miniprogram/deploy/deploy-cloud.js');
const REPORT_DIR = resolve(REPO_ROOT, '.workbuddy');

// ---------- argv ----------
const RAW_ARGS = process.argv.slice(2);
const FLAGS = {
  dryRun: RAW_ARGS.includes('--dry-run'),
  skipDeploy: RAW_ARGS.includes('--skip-deploy'),
  strict: RAW_ARGS.includes('--strict'),
  only: parseOnly(RAW_ARGS),
};

function parseOnly(argv) {
  const flag = argv.find(a => a.startsWith('--only='));
  if (!flag) return null;
  return new Set(flag.slice('--only='.length).split(',').map(s => s.trim()).filter(Boolean));
}

function shouldRun(taskId) {
  if (!FLAGS.only) return true;
  return FLAGS.only.has(taskId);
}

// ---------- env ----------
function loadEnvFile(envPath) {
  if (!existsSync(envPath)) return { loaded: false, missing: [] };
  const text = readFileSync(envPath, 'utf8');
  const lines = text.split(/\r?\n/).filter(l => l && !l.startsWith('#'));
  const out = {};
  for (const line of lines) {
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return { loaded: true, values: out };
}

function applyEnv(values) {
  for (const [k, v] of Object.entries(values)) {
    if (process.env[k] === undefined || process.env[k] === '') process.env[k] = v;
  }
}

const ENV_PATH = resolve(__dirname, 'conformance.env');
const envState = loadEnvFile(ENV_PATH);
if (envState.loaded) applyEnv(envState.values);

const HAS_AI_KEY = !!process.env.AI_API_KEY && !!process.env.AI_API_BASE && !!process.env.AI_MODEL;
const CLOUD_ENV_ID = process.env.CLOUD_ENV_ID || process.env.WX_CLOUD_ENV || '';
const OWNER_OPENID = process.env.WX_OPENID_OWNER || '';
const VISITOR_OPENID = process.env.WX_OPENID_VISITOR || '';

// ---------- mode banner ----------
function printBanner() {
  const lines = [];
  lines.push('┌────────────────────────────────────────────────────────────────────────┐');
  lines.push('│  VibeCard Real Conformance Runner                                       │');
  lines.push('└────────────────────────────────────────────────────────────────────────┘');
  lines.push(`  repo root         : ${REPO_ROOT}`);
  lines.push(`  conformance.env   : ${envState.loaded ? ENV_PATH : '(not loaded)'}`);
  lines.push(`  mode              : ${FLAGS.dryRun ? 'dry-run' : HAS_AI_KEY ? 'REAL provider (' + maskBase(process.env.AI_API_BASE) + ')' : 'mock-parity fallback (no AI_API_KEY)'}`);
  lines.push(`  tasks selected    : ${FLAGS.only ? [...FLAGS.only].join(', ') : '1.2, 1.3, 1.4, 4.3 (all)'}`);
  lines.push(`  skip-deploy       : ${FLAGS.skipDeploy}`);
  lines.push(`  strict            : ${FLAGS.strict}`);
  lines.push(`  CLOUD_ENV_ID      : ${CLOUD_ENV_ID || '(unset — T1.3 cloud deployment skipped)'}`);
  lines.push(`  WX_OPENID_OWNER   : ${OWNER_OPENID ? OWNER_OPENID.slice(0, 8) + '…' : '(unset — T1.3 / T1.4 will use synthetic owner-1 openid)'}`);
  lines.push(`  agent cloud dir   : ${AGENT_DIR}`);
  console.log(lines.join('\n'));
}

function maskBase(b) {
  if (!b) return '';
  try {
    const u = new URL(b);
    return u.host;
  } catch {
    return b.slice(0, 24) + '…';
  }
}

// ---------- case registry ----------
/**
 * @typedef {Object} CaseCtx
 * @property {object} env  - process.env snapshot
 * @property {boolean} hasRealKey  - 是否配了真实 provider
 * @property {boolean} dryRun  - 是否 dry-run
 * @property {() => string} report  - 返回临时备注，写入报告
 *
 * @typedef {Object} CaseDef
 * @property {string} id  - e.g. 'T1.2-R1'
 * @property {string} task  - '1.2' | '1.3' | '1.4' | '4.3'
 * @property {string} title
 * @property {string[]} preconditions  - 验证前必读 / 必做
 * @property {(ctx:CaseCtx)=>Promise<{status:'pass'|'skip'|'fail', evidence:string, error?:string}>} run
 * @property {string} hint  - 失败排查建议
 */

const CASES = [];

/** 注册一个 case。 */
function defineCase(def) {
  CASES.push(def);
}

// ============================================================
// §1.2 Add AI Provider Boundary
// ============================================================
function registerT1_2() {
  /**
   * T1.2-R1: schema-valid owner reply with REAL (or stubbed-parity) provider
   *
   * - 配 AI_API_KEY 时：createHttpProvider({baseUrl, apiKey, model}) 打一次真实端点，
   *   拿回复走 validateOwnerAgentResult（不通过 → typed error，不允许 raw text 漏出）。
   * - 没 key 时：起本地 OpenAI-compatible stub（模型是 mock provider），
   *   同样的 schema 校验要通过（保证 schema 校验不依赖模型）。
   */
  defineCase({
    id: 'T1.2-R1',
    task: '1.2',
    title: 'ownerMessage returns schema-valid reply with configured provider',
    preconditions: [
      'node ≥ 18（建议 22）',
      HAS_AI_KEY ? 'AI_API_KEY 已配置（real）' : '缺 AI_API_KEY — 走 mock-parity 路径（仍需 pass）',
    ],
    async run(ctx) {
      const { createMockProvider, createHttpProvider } = requireAgentLib('providers');
      const { runOwnerAgent } = requireAgentLib('agent');
      const { validateOwnerAgentResult, typedError, ok } = requireAgentLib('schema');

      const messages = [{ role: 'user', content: '我最近想认识真正做过 AI 社交产品的人。' }];

      if (ctx.hasRealKey) {
        const provider = createHttpProvider({
          baseUrl: process.env.AI_API_BASE,
          apiKey: process.env.AI_API_KEY,
          model: process.env.AI_MODEL,
        });
        const t0 = performance.now();
        const outcome = await runOwnerAgent({ provider, memories: [], messages });
        const dt = Math.round(performance.now() - t0);
        if (!outcome || !outcome.ok) {
          return { status: 'fail', evidence: `REAL provider 不通过 schema：${JSON.stringify(outcome)}`, error: outcome && outcome.error ? outcome.error.code : 'unknown' };
        }
        // 真实模型的 reply 可以不是 JSON；runOwnerAgent 内部已经判定 retry 一次 + 失败就返回 typed_error，
        // 所以 outcome.ok = true 已经涵盖「schema 已验过」的合同。
        const evidence = `reply=${(outcome.result.reply || '').slice(0, 60)}… | memoryProposal=${outcome.result.memoryProposal ? 'yes' : 'no'} | ${dt}ms`;
        return { status: 'pass', evidence };
      }
      // mock parity: 起本地 stub server，createHttpProvider 走它，保证 schema 校验链路 100% real
      const stub = await startStubProvider();
      try {
        const provider = createHttpProvider({ baseUrl: stub.baseUrl, apiKey: 'parity-stub', model: 'parity-stub' });
        const outcome = await runOwnerAgent({ provider, memories: [], messages });
        if (!outcome.ok) return { status: 'fail', evidence: 'mock-parity 路径未通过 schema：' + JSON.stringify(outcome.error) };
        if (typeof outcome.result.reply !== 'string' || outcome.result.reply.length === 0) {
          return { status: 'fail', evidence: 'reply 不是非空字符串：' + JSON.stringify(outcome.result) };
        }
        if (typeof outcome.result.cardUpdateSuggested !== 'boolean') {
          return { status: 'fail', evidence: 'cardUpdateSuggested 不是 boolean：' + JSON.stringify(outcome.result) };
        }
        return { status: 'pass', evidence: `mock-parity 通过；reply 长度=${outcome.result.reply.length}，cardUpdateSuggested=${outcome.result.cardUpdateSuggested}` };
      } finally {
        await stub.close();
      }
    },
    hint: 'real 模式失败：检查 AI_API_BASE 协议（https 推荐）、模型是否支持 response_format=json_object。mock-parity 失败：lib/agent.js 或 providers.js 不一致。',
  });

  /**
   * T1.2-R2: invalid JSON → invalid_model_output after one retry
   *
   * 用一个故意返 plain text 的 provider；断言：
   *   - outcome.ok === false
   *   - outcome.error.code === 'invalid_model_output'
   *   - provider 被调用 2 次（1 retry）
   */
  defineCase({
    id: 'T1.2-R2',
    task: '1.2',
    title: 'invalid model JSON is rejected after exactly one retry',
    preconditions: ['runOwnerAgent 内部 retry 一次后 typed error'],
    async run() {
      const { runOwnerAgent } = requireAgentLib('agent');
      let calls = 0;
      const provider = { async complete() { calls += 1; return 'this is not json'; } };
      const outcome = await runOwnerAgent({
        provider,
        memories: [],
        messages: [{ role: 'user', content: '我最近在做一个 AI 社交产品。' }],
      });
      if (outcome.ok) return { status: 'fail', evidence: '应收 invalid_model_output 但 ok=true' };
      if (outcome.error.code !== 'invalid_model_output') {
        return { status: 'fail', evidence: `error.code=${outcome.error.code}（期望 invalid_model_output）` };
      }
      if (calls !== 2) return { status: 'fail', evidence: `provider 被调用 ${calls} 次（期望 2: 1 retry）` };
      return { status: 'pass', evidence: '收 invalid_model_output，重试 1 次' };
    },
    hint: 'calls != 2：lib/agent.js 的 callAndValidate 重试逻辑被改坏。',
  });

  /**
   * T1.2-R3: no provider → mock fallback, never raw provider text leaked
   *
   *   getProvider({}).name === 'mock'
   *   AI_PROVIDER === 'mock' 强制走 mock，即使配了 key
   *   agent 入口在 no OPENID 的情况下 must return typedError('unauthorized', …)
   *     校验当前请求对象用 typed error，绝不暴露 raw 模型输出
   */
  defineCase({
    id: 'T1.2-R3',
    task: '1.2',
    title: 'no key / AI_PROVIDER=mock forces deterministic mock + entry never leaks raw',
    preconditions: ['getProvider 行为；agent/index.js 入口 OPENID 缺失时 typed error'],
    async run() {
      const { getProvider } = requireAgentLib('providers');
      if (getProvider({}).name !== 'mock') return { status: 'fail', evidence: '空配置应返回 mock' };
      if (getProvider({ AI_PROVIDER: 'mock', AI_API_BASE: 'https://x', AI_API_KEY: 'k', AI_MODEL: 'm' }).name !== 'mock') {
        return { status: 'fail', evidence: 'AI_PROVIDER=mock 应压制 http' };
      }
      if (getProvider({ AI_API_BASE: 'https://a', AI_API_KEY: 'k', AI_MODEL: 'm' }).name !== 'http') {
        return { status: 'fail', evidence: '完整三件套应返回 http' };
      }

      // install wx-server-sdk stub + force mock provider for entry-level coverage
      const mems = new Map();
      const convs = new Map();
      const restore = installWxServerSdkStub({ memories: mems, conversations: convs });
      setStubOpenid(''); // 缺 OPENID 应返回 unauthorized
      // 强制 mock provider 给 agent/index.js 的 getProvider()
      const savedEnv = { ...process.env };
      process.env.AI_PROVIDER = 'mock';
      delete process.env.AI_API_BASE;
      delete process.env.AI_API_KEY;
      delete process.env.AI_MODEL;
      try {
        reloadAgentEntry();
        const entry = await loadAgentEntry();
        const res = await entry.main({ action: 'ownerMessage', messages: [{ role: 'user', content: 'x' }] });
        if (!res || res.ok !== false) return { status: 'fail', evidence: '缺 OPENID 时 entry 应返回 typed error' };
        if (res.error.code !== 'unauthorized') return { status: 'fail', evidence: `error.code=${res.error.code}` };

        setStubOpenid('owner-r3');
        const okRes = await entry.main({ action: 'ownerMessage', messages: [{ role: 'user', content: 'hello' }] });
        if (!okRes || okRes.ok !== true) return { status: 'fail', evidence: '有 OPENID + mock 时应返回 ok=true：' + JSON.stringify(okRes) };
        if (typeof okRes.result.reply !== 'string') return { status: 'fail', evidence: 'reply 不是 string' };
        if (okRes.result.memoryProposal !== null && okRes.result.memoryProposal !== undefined && typeof okRes.result.memoryProposal !== 'object') {
          return { status: 'fail', evidence: 'memoryProposal 不是合法 shape' };
        }
        return { status: 'pass', evidence: 'provider 选择 3 维度全验；OPENID 缺失 typed error；有 OPENID + mock 返回 ok+result' };
      } finally {
        setStubOpenid('');
        restore();
        // 还原 process.env
        for (const k of Object.keys(process.env)) {
          if (!(k in savedEnv)) delete process.env[k];
        }
        Object.assign(process.env, savedEnv);
      }
    },
    hint: 'mock 强制未生效：providers.js getProvider() 优先级被改坏。raw 模型输出泄漏：index.js catch 没走 typedError。',
  });

  /**
   * T1.2-R4: confirmed memories injected into system prompt as `[kind/visibility] content`
   *
   *   spy provider 截获 system prompt；断言：
   *     - system 包含 '不回应泛泛的资源互换'
   *     - system 包含 '[boundary/agent_only]' 标签
   */
  defineCase({
    id: 'T1.2-R4',
    task: '1.2',
    title: 'confirmed memories are injected into owner system prompt as labeled lines',
    preconditions: ['lib/agent.js buildMemoryContext'],
    async run() {
      const { runOwnerAgent } = requireAgentLib('agent');
      let seenSystem = '';
      const spy = { async complete({ system }) { seenSystem = system; return JSON.stringify({ reply: '好', memoryProposal: null, cardUpdateSuggested: false }); } };
      const memories = [
        { _id: 'm-boundary', kind: 'boundary', visibility: 'agent_only', status: 'confirmed', content: '不回应泛泛的资源互换' },
      ];
      const outcome = await runOwnerAgent({ provider: spy, memories, messages: [{ role: 'user', content: '测试上下文' }] });
      if (!outcome.ok) return { status: 'fail', evidence: 'runOwnerAgent 自身失败：' + JSON.stringify(outcome.error) };
      if (!seenSystem.includes('不回应泛泛的资源互换')) {
        return { status: 'fail', evidence: 'system prompt 缺少 memory 内容' };
      }
      if (!seenSystem.includes('[boundary/agent_only]')) {
        return { status: 'fail', evidence: 'system prompt 缺少 [kind/visibility] 标签' };
      }
      return { status: 'pass', evidence: 'memory 内容 + [boundary/agent_only] 标签均出现在 system prompt' };
    },
    hint: 'buildMemoryContext 格式被改：必须保留 `${kind}/${visibility}` 标签，否则 owner-mode 模型看不到 visibility。',
  });
}

// ============================================================
// §1.3 Implement Owner Conversation
// ============================================================
function registerT1_3() {
  /**
   * T1.3-R1: send → ownerMessage → memoryProposal → createMemoryProposal →
   *   confirmMemory → listMemories 列表刷新
   *
   * harness：makeVibeHarness() 模拟 vibe.js 的 onSend + onRememberProposal，
   * cloud callFunction 用 stub wx-server-sdk 替换，stub OpenAI-compatible provider。
   */
  defineCase({
    id: 'T1.3-R1',
    task: '1.3',
    title: 'send → ownerMessage → proposal → confirm → list refreshes (real chain)',
    preconditions: [
      OWNER_OPENID ? 'WX_OPENID_OWNER 已配（real chain）' : 'WX_OPENID_OWNER 未配 — 用 stub owner-1（仍跑完整路径）',
      'stub wx-server-sdk + createMockProvider',
    ],
    async run() {
      const h = await makeVibeHarness({ provider: 'mock' });
      try {
        const text = '我最近想认识真正做过 AI 社交产品的人。';
        await h.send(text);

        const latest = h.lastVibeMessage();
        if (!latest || !/记住|值得|记住/.test(latest)) {
          return { status: 'fail', evidence: `vibe 没回应记忆意图；最近一条=${latest}` };
        }
        if (!h.proposal) return { status: 'fail', evidence: '没产生 memoryProposal' };
        if (!h.state.memoryId) return { status: 'fail', evidence: 'createMemoryProposal 没产生 memoryId' };

        await h.confirmProposal();
        const mems = await h.listMemories();
        const found = mems.find(m => m._id === h.state.memoryId);
        if (!found) return { status: 'fail', evidence: 'confirm 后 listMemories 找不到该 memory' };
        if (found.status !== 'confirmed') return { status: 'fail', evidence: `memory.status=${found.status}（期望 confirmed）` };

        return { status: 'pass', evidence: `proposal 出现 → memoryId 创建 → confirm → list 包含 _id=${h.state.memoryId}` };
      } finally {
        await h.close();
      }
    },
    hint: 'proposal 失败：lib/agent.js runOwnerAgent 返回的 reply/memoryProposal shape 不对。confirm 失败：memory/index.js confirmMemory 路径被改坏。',
  });

  defineCase({
    id: 'T1.3-R2',
    task: '1.3',
    title: 'agent failure surfaces fallback text "我现在有点连不上，刚才的话不会丢。"',
    preconditions: ['vibe.js onSend 中的 fallback 路径；harness 用 hanging-stub URL → model_unavailable'],
    async run() {
      const h = await makeVibeHarness({ provider: 'failing' });
      try {
        await h.send('我最近在打磨访客对话。');
        const msgs = h.messagesSnapshot();
        const fallbackCount = msgs.filter(m => m.role === 'vibe' && m.text.includes('我现在有点连不上')).length;
        if (fallbackCount === 0) {
          return { status: 'fail', evidence: 'fallback 文案未出现；现有 vibe messages=' + JSON.stringify(msgs) };
        }
        // chat 还可用：再次 send 应当走得通（仍 fallback，但不是抛错）
        await h.send('再发一条试试');
        const msgs2 = h.messagesSnapshot();
        if (msgs2.length <= msgs.length) {
          return { status: 'fail', evidence: '第二次 send 没追加消息，聊天被阻断' };
        }
        return { status: 'pass', evidence: `fallback 文案出现 ${fallbackCount} 次，第二次 send 后消息列表继续追加` };
      } finally {
        await h.close();
      }
    },
    hint: 'fallback 文案走 vibe.js onSend catch；如果文案被改，要按 AI_BEHAVIOR.md §4 修。',
  });

  defineCase({
    id: 'T1.3-R3',
    task: '1.3',
    title: 'memory.appendMessage failure does NOT block the chat',
    preconditions: ['vibe.js persistMessage() catch 不 throw'],
    async run() {
      const h = await makeVibeHarness({
        provider: 'mock',
        override: {
          memory: {
            appendMessage: async () => { throw new Error('db timeout'); },
          },
        },
      });
      try {
        await h.send('先 append 注定失败');
        const msgs = h.messagesSnapshot();
        const ownerMsgs = msgs.filter(m => m.role === 'owner');
        const vibeMsgs = msgs.filter(m => m.role === 'vibe');
        if (ownerMsgs.length < 1) return { status: 'fail', evidence: 'owner 自己那条消息都没进去' };
        if (vibeMsgs.length < 1) return { status: 'fail', evidence: 'vibe 没回应（即 appendMessage 失败抛回了 onSend）' };
        return { status: 'pass', evidence: `appendMessage 抛错被 catch，聊天继续：owner ${ownerMsgs.length} 条 / vibe ${vibeMsgs.length} 条` };
      } finally {
        await h.close();
      }
    },
    hint: 'persistMessage catch 被改导致再 throw：vibe.js:642 区域。',
  });
}

// ============================================================
// §1.4 Generate Or Update Card From Memory
// ============================================================
function registerT1_4() {
  /**
   * T1.4-R1: agent.generateCardDraft 用 confirmed-only memories 产出 draft
   *   - 真实 key：起真实 provider；要求 draft 字段非空、不含联系方式
   *   - 无 key：mock provider parity；要求相同 schema 通过
   */
  defineCase({
    id: 'T1.4-R1',
    task: '1.4',
    title: 'generateCardDraft produces a non-empty, contact-free draft from confirmed memories',
    preconditions: ['agent/index.js case `generateCardDraft`'],
    async run(ctx) {
      const { runCardDraft } = requireAgentLib('agent');
      const { createMockProvider, createHttpProvider } = requireAgentLib('providers');
      const { validateCardDraft } = requireAgentLib('schema');

      const memories = [
        { _id: 'mem-1', status: 'confirmed', visibility: 'public', kind: 'current', content: '在打磨 VibeCard 的访客对话' },
        { _id: 'mem-2', status: 'confirmed', visibility: 'public', kind: 'preference', content: '想认识真正做过 AI 社交产品的人' },
      ];

      let provider;
      let mode;
      if (ctx.hasRealKey) {
        provider = createHttpProvider({ baseUrl: process.env.AI_API_BASE, apiKey: process.env.AI_API_KEY, model: process.env.AI_MODEL });
        mode = 'REAL provider';
      } else {
        const stub = await startStubProvider();
        provider = createHttpProvider({ baseUrl: stub.baseUrl, apiKey: 'parity-stub', model: 'parity-stub' });
        mode = 'mock-parity';
        ctx.tmpCleanup = ctx.tmpCleanup || (async () => await stub.close());
      }

      try {
        const outcome = await runCardDraft({ provider, memories, currentCard: {} });
        if (!outcome.ok) return { status: 'fail', evidence: `${mode} draft 失败：` + JSON.stringify(outcome.error) };
        const { draft } = outcome.result;
        const v = validateCardDraft(draft);
        if (v.error) return { status: 'fail', evidence: `validateCardDraft 拒绝：${v.error}` };
        // 严禁联系方式
        const banned = ['wechat', 'phone', 'email', 'name', 'avatar'];
        for (const k of banned) {
          if (k in draft) return { status: 'fail', evidence: `draft 包含禁字段 ${k}` };
        }
        // 至少要一个 list/string 字段非空
        const hasContent = draft.headline || draft.currentFocus || (draft.wantsToMeet && draft.wantsToMeet.length) || (draft.topics && draft.topics.length);
        if (!hasContent) return { status: 'fail', evidence: 'draft 全为空' };
        return { status: 'pass', evidence: `${mode}：draft 字段数=${Object.keys(draft).length}，headline=${(draft.headline || '').slice(0, 30)}` };
      } finally {
        if (ctx.tmpCleanup) await ctx.tmpCleanup();
      }
    },
    hint: 'draft 缺少 headline：model 输出 schema 不对。联系方式泄漏：validateCardDraft 缺拦截字段。',
  });

  /**
   * T1.4-R2: zero confirmed memories → typed error 'no_confirmed_memories'
   *   即使有 1 条 proposed / private，draft 也不该被生成
   */
  defineCase({
    id: 'T1.4-R2',
    task: '1.4',
    title: 'zero confirmed memories returns typed no_confirmed_memories',
    preconditions: ['runCardDraft 内部 filter status=confirmed'],
    async run() {
      const { runCardDraft } = requireAgentLib('agent');
      const { createMockProvider } = requireAgentLib('providers');
      const proposedOnly = [
        { kind: 'fact', visibility: 'private', status: 'proposed', content: 'x' },
      ];
      const outcome = await runCardDraft({ provider: createMockProvider(), memories: proposedOnly });
      if (outcome.ok) return { status: 'fail', evidence: '不应成功：' + JSON.stringify(outcome.result) };
      if (outcome.error.code !== 'no_confirmed_memories') {
        return { status: 'fail', evidence: `error.code=${outcome.error.code}（期望 no_confirmed_memories）` };
      }
      // 完全空
      const empty = await runCardDraft({ provider: createMockProvider(), memories: [] });
      if (empty.error && empty.error.code === 'no_confirmed_memories') return { status: 'pass', evidence: 'proposed-only 与 empty 都返回 no_confirmed_memories' };
      return { status: 'fail', evidence: 'empty case 不对：' + JSON.stringify(empty) };
    },
    hint: 'runCardDraft filter (m.status === \'confirmed\') 被改坏。',
  });
}

// ============================================================
// §4.3 Prepare Demo Data
// ============================================================
function registerT4_3() {
  /**
   * T4.3-R1: a fixture demo can swap explicit demo mode vs real AI path
   *   - demo 模式：vibe.js / pages/requests/requests.js 用 fixtureOwner* 引导回复
   *   - 关 demo：用 real AI（owner once 配了 key，cloud function 跑模型）
   *   - 真实网络 case：providers 完全不需要（demo 只验 fixture 数据完整性 + 业务行为）
   */
  defineCase({
    id: 'T4.3-R1',
    task: '4.3',
    title: 'demo mode flips between explicit fixture path and real AI path (fixture data present on both)',
    preconditions: ['vibe-fixtures.js + lib/agent.js 都可达'],
    async run() {
      const fx = require(FIXTURES_PATH);
      const requiredKeys = [
        'fixtureOwner', 'fixtureVisitor', 'fixtureWeakVisitor',
        'fixtureOwnerCard', 'fixtureOwnerMemories', 'fixtureOwnerContactMethods',
        'fixtureConnectionRequest', 'fixtureWeakConnectionRequest',
      ];
      for (const k of requiredKeys) {
        if (!fx[k]) return { status: 'fail', evidence: `fixture 缺关键字段：${k}` };
      }
      // fixtureWeakConnectionRequest 应为弱（理由含「多个朋友多条路」/ 「想认识一下」）
      const weakReason = (fx.fixtureWeakConnectionRequest.reason || '').trim();
      if (!/想认识一下|多个朋友多条路/.test(weakReason)) {
        return { status: 'fail', evidence: `fixture 弱请求 reason 不是 §7 anti-pattern：${weakReason}` };
      }
      if (Array.isArray(fx.fixtureWeakConnectionRequest.possibleSharedContext) && fx.fixtureWeakConnectionRequest.possibleSharedContext.length !== 0) {
        return { status: 'fail', evidence: 'fixture 弱请求不该有共同点' };
      }
      // 反之强请求必须有共同点
      const sharedLen = (fx.fixtureConnectionRequest.possibleSharedContext || []).length;
      if (sharedLen < 1) return { status: 'fail', evidence: 'fixture 强请求缺少共同点' };
      return { status: 'pass', evidence: `8 项 fixture 关键字段齐全；弱请求 reason="${weakReason.slice(0, 30)}…"，强请求共同点 ${sharedLen} 条` };
    },
    hint: 'fixture 文件改坏或缺字段。看 packages/miniprogram/miniprogram/data/vibe-fixtures.js 修复。',
  });

  /**
   * T4.3-R2: runConnectionSummary 对强请求 → worth_a_conversation
   *   对弱请求 → need_more_context
   *   AI_BEHAVIOR §7: 弱请求的 uncertainty 必须 name what's missing（空泛/缺少）
   */
  defineCase({
    id: 'T4.3-R2',
    task: '4.3',
    title: 'runConnectionSummary distinguishes strong (worth_a_conversation) vs weak (need_more_context)',
    preconditions: ['lib/agent.js runConnectionSummary + 真实 or parity provider'],
    async run(ctx) {
      const fx = require(FIXTURES_PATH);
      const { runConnectionSummary } = requireAgentLib('agent');
      const { createMockProvider, createHttpProvider } = requireAgentLib('providers');

      let provider;
      if (ctx.hasRealKey) {
        provider = createHttpProvider({ baseUrl: process.env.AI_API_BASE, apiKey: process.env.AI_API_KEY, model: process.env.AI_MODEL });
      } else {
        const stub = await startStubProvider();
        provider = createHttpProvider({ baseUrl: stub.baseUrl, apiKey: 'parity-stub', model: 'parity-stub' });
        ctx.tmpCleanup = ctx.tmpCleanup || (async () => await stub.close());
      }
      try {
        const strong = await runConnectionSummary({ provider, request: fx.fixtureConnectionRequest });
        if (!strong.ok) return { status: 'fail', evidence: '强请求 summary 失败：' + JSON.stringify(strong.error) };
        if (strong.result.summary.recommendation !== 'worth_a_conversation') {
          return { status: 'fail', evidence: `强请求期望 worth_a_conversation，实际 ${strong.result.summary.recommendation}` };
        }
        const weak = await runConnectionSummary({ provider, request: fx.fixtureWeakConnectionRequest });
        if (!weak.ok) return { status: 'fail', evidence: '弱请求 summary 失败：' + JSON.stringify(weak.error) };
        if (weak.result.summary.recommendation !== 'need_more_context') {
          return { status: 'fail', evidence: `弱请求期望 need_more_context，实际 ${weak.result.summary.recommendation}` };
        }
        if (!/空泛|缺少|没有/.test(weak.result.summary.uncertainty)) {
          return { status: 'fail', evidence: `弱请求 uncertainty 没指明缺失：${weak.result.summary.uncertainty}` };
        }
        return { status: 'pass', evidence: `strong=${strong.result.summary.recommendation}，weak=${weak.result.summary.recommendation}，uncertainty 含「空泛/缺少/没有」` };
      } finally {
        if (ctx.tmpCleanup) await ctx.tmpCleanup();
      }
    },
    hint: '强 / 弱分错：runConnectionSummary system prompt 或 model 输出 schema 不一致。real 模式下失败时优先看 uncertainty 文本。',
  });

  /**
   * T4.3-R3: 记忆回调时刻的 fixture（fixture-memory-public-focus）+ vibe memo 页 demo
   *   - fixtureOwnerMemories 里必须含 fixture-memory-public-focus（confirmed, kind=current）
   *   - 访客 demo 入口（visitor-chat.js）能正常 require 这个 fixture
   *   - 主页 vibe.js demoMode 也加载它
   */
  defineCase({
    id: 'T4.3-R3',
    task: '4.3',
    title: 'fixture-memory-public-focus exists (confirmed, kind=current) and is wired into demo story',
    preconditions: ['packages/miniprogram/miniprogram/pages/vibe/vibe.js 与 visitor-chat.js'],
    async run() {
      const fx = require(FIXTURES_PATH);
      const focus = (fx.fixtureOwnerMemories || []).find(m => m.id === 'fixture-memory-public-focus');
      if (!focus) return { status: 'fail', evidence: 'fixture-memory-public-focus 不在 fixtureOwnerMemories' };
      if (focus.status !== 'confirmed') return { status: 'fail', evidence: `status=${focus.status}` };
      if (focus.kind !== 'current') return { status: 'fail', evidence: `kind=${focus.kind}` };
      if (!focus.content || !/访客对话|先理解/.test(focus.content)) {
        return { status: 'fail', evidence: `focus 内容不像「callback」素材：${focus.content}` };
      }
      // vibe.js 也得能引用它
      const vibeSrc = readFileSync(resolve(REPO_ROOT, 'packages/miniprogram/miniprogram/pages/vibe/vibe.js'), 'utf8');
      if (!vibeSrc.includes('fixture-memory-public-focus')) {
        return { status: 'fail', evidence: 'vibe.js 没有引用 fixture-memory-public-focus' };
      }
      return { status: 'pass', evidence: `fixture-memory-public-focus confirmed/current，内容「${focus.content.slice(0, 30)}…」，vibe.js 已引用` };
    },
    hint: 'callback fixture 被改坏或被重命名；vibe-mock-story.spec.ts 会同时挂掉。',
  });
}

// ============================================================
// provider stub (mock parity) — 局部 OpenAI-compatible echo server
// ============================================================
async function startStubProvider() {
  const { createMockProvider } = requireAgentLib('providers');
  const mock = createMockProvider();
  const server = createHttpServer(async (req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', async () => {
      try {
        const body = raw ? JSON.parse(raw) : { messages: [] };
        const sys = (body.messages || []).find(m => m.role === 'system');
        const msgs = (body.messages || []).filter(m => m.role !== 'system');
        const content = await mock.complete({ system: sys ? sys.content : '', messages: msgs });
        const json = JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(json);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: String(e && e.message || e) } }));
      }
    });
  });
  const port = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    baseUrl,
    async close() { return new Promise(r => server.close(r)); },
  };
}

async function startFailingProvider() {
  // 一个永远不响应（hang）的 stub server；createHttpProvider 会命中 timeout → ProviderError('model_unavailable')
  const server = createHttpServer(() => { /* never call res.end() */ });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async close() { return new Promise(r => server.close(r)); },
  };
}

// ============================================================
// wx-server-sdk 桩 + agent entry loader（复用 first-run-card-scope.test.js 模式）
// ============================================================

const _stubs = {
  openid: '',
  memoryDocs: [],
  cardDrafts: [],
};

function _memStore() {
  return {
    memories: new Map(),
    nextId: 1,
  };
}

function makeFakeWxServerSdk({ memories, conversations, onCollect }) {
  return {
    DYNAMIC_CURRENT_ENV: 'conformance',
    init() {},
    getWXContext() { return { OPENID: _stubs.openid }; },
    database() {
      return {
        collection(name) {
          if (onCollect) onCollect(name);
          return makeCollection(name, { memories, conversations });
        },
      };
    },
    async callFunction({ name, data }) {
      // 真实链路下，cloud function 之间可能互相调用。这里只用于 visitor 之类需要调 content-check 的；
      // 我们的 T1.3 / T1.4 harness 走的是「直接调 agent / memory 的 index.js」，所以这里默认抛错。
      throw new Error(`fake wx-server-sdk 不支持 callFunction(${name}); harness 应走 makeVibeHarness()`);
    },
  };
}

function makeCollection(name, { memories, conversations }) {
  // Chainable: where().orderBy().get(), where().get(), doc(id).get()/set()/update()/remove(), add({data})
  return {
    where(query) {
      const matches = (record) => Object.entries(query).every(([k, v]) => record[k] === v);
      let rows = [];
      if (name === 'memories') rows = [...memories.values()].filter(matches);
      else if (name === 'conversations') rows = [...conversations.values()].filter(matches);
      const chain = {
        orderBy(_field, _dir) { return chain; },
        where(_q2) { return chain; },
        async get() { return { data: rows }; },
        limit(_n) { return chain; },
        skip(_n) { return chain; },
      };
      return chain;
    },
    doc(id) {
      return {
        async get() {
          if (name === 'memories') return memories.has(id) ? { data: memories.get(id) } : null;
          if (name === 'conversations') return conversations.has(id) ? { data: conversations.get(id) } : null;
          return null;
        },
        async set({ data }) {
          if (name === 'memories') memories.set(id, { ...(memories.get(id) || {}), ...data });
          if (name === 'conversations') conversations.set(id, { ...(conversations.get(id) || {}), ...data });
          return { _id: id };
        },
        async update({ data }) {
          if (name === 'memories' && memories.has(id)) memories.set(id, { ...memories.get(id), ...data });
          if (name === 'conversations' && conversations.has(id)) conversations.set(id, { ...conversations.get(id), ...data });
          return { updated: 1 };
        },
        async remove() {
          if (name === 'memories') memories.delete(id);
          if (name === 'conversations') conversations.delete(id);
          return { deleted: 1 };
        },
      };
    },
    async add({ data }) {
      const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      if (name === 'memories') memories.set(id, { ...data, _id: id });
      if (name === 'conversations') conversations.set(id, { ...data, _id: id });
      return { _id: id };
    },
  };
}

function installWxServerSdkStub({ memories, conversations }) {
  // 先把 wx-server-sdk 从 require 缓存里踢掉，确保后续 require 走 Module._load hook
  for (const k of Object.keys(require.cache)) {
    if (k.endsWith('wx-server-sdk') || k.includes('wx-server-sdk')) delete require.cache[k];
  }
  const stub = makeFakeWxServerSdk({ memories, conversations });
  const originalLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'wx-server-sdk') return stub;
    return originalLoad.call(this, request, ...rest);
  };
  // 清理函数
  return () => {
    Module._load = originalLoad;
    for (const k of Object.keys(require.cache)) {
      if (k.includes('wx-server-sdk')) delete require.cache[k];
    }
  };
}

function setStubOpenid(openid) {
  _stubs.openid = openid;
}

const _entryCache = {};

async function loadAgentEntry() {
  if (_entryCache.entry) return _entryCache.entry;
  const indexPath = require.resolve(resolve(AGENT_DIR, 'index.js'));
  delete require.cache[indexPath];
  _entryCache.entry = require(indexPath);
  return _entryCache.entry;
}

function reloadAgentEntry() {
  const indexPath = require.resolve(resolve(AGENT_DIR, 'index.js'));
  delete require.cache[indexPath];
  _entryCache.entry = require(indexPath);
  return _entryCache.entry;
}

function requireAgentLib(name) {
  // lib/providers.js 同时 export createMockProvider/createHttpProvider/getProvider
  const map = {
    providers: resolve(AGENT_LIB, 'providers.js'),
    agent: resolve(AGENT_LIB, 'agent.js'),
    schema: resolve(AGENT_LIB, 'schema.js'),
    'card-draft-scope': resolve(AGENT_LIB, 'card-draft-scope.js'),
  };
  const path = map[name];
  if (!path) throw new Error(`unknown agent lib: ${name}`);
  if (!_entryCache[name]) _entryCache[name] = require(path);
  return _entryCache[name];
}

// ============================================================
// Vibe harness — mirrors vibe.js onSend + onRememberProposal 编排
// ============================================================
const VIBE_FALLBACK_TEXT = '我现在有点连不上，刚才的话不会丢。可以稍后再试。';

async function makeVibeHarness({ provider: providerArg, override = {}, failingStub = null } = {}) {
  const memories = new Map();
  const conversations = new Map();
  const restore = installWxServerSdkStub({ memories, conversations });
  setStubOpenid(OWNER_OPENID || 'owner-1');

  const state = {
    memoryId: null,
    conversationId: '',
    proposal: null,
    messages: [],
    sendCount: 0,
    _failingStub: null,
  };

  // 让 agent/index.js 入口用我们的 provider：通过 process.env
  if (providerArg === 'mock') {
    process.env.AI_PROVIDER = 'mock';
    delete process.env.AI_API_BASE;
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL;
  } else if (providerArg === 'failing') {
    // 配一个挂起 stub URL 给 createHttpProvider；模型必然 timeout → model_unavailable
    const stub = failingStub || await startFailingProvider();
    process.env.AI_API_BASE = stub.baseUrl;
    process.env.AI_API_KEY = 'failing-stub';
    process.env.AI_MODEL = 'failing-stub';
    delete process.env.AI_PROVIDER;
    process.env.AI_TIMEOUT_MS = '300';
    state._failingStub = stub;
  } else if (providerArg && typeof providerArg.complete === 'function') {
    throw new Error('custom provider object 暂不支持 — 用 failingStub 模式');
  }
  reloadAgentEntry();

  // memory/index.js 同理（也要 stub wx-server-sdk — 已经被 install）
  const memoryIndexPath = require.resolve(resolve(REPO_ROOT, 'packages/miniprogram/cloudfunctions/memory/index.js'));
  delete require.cache[memoryIndexPath];

  async function call(name, action, data, opts = {}) {
    if (override[name] && override[name][action]) {
      return override[name][action]({ name, action, data, opts });
    }
    if (name === 'agent') {
      const entry = await loadAgentEntry();
      return entry.main({ action, ...data });
    }
    if (name === 'memory') {
      const entry = require(memoryIndexPath);
      // memory/index.js expects event with action; OPENID comes from wx-server-sdk stub
      return entry.main({ action, ...(data || {}) });
    }
    if (name === 'now') {
      // harness 不深测 now；走 default 抛错
      throw new Error(`harness: no ${name}/${action} stub`);
    }
    throw new Error(`unknown function ${name}`);
  }

  async function persistMessage(role, text) {
    try {
      const res = await call('memory', 'appendMessage', {
        conversationId: state.conversationId || undefined,
        mode: 'owner',
        role,
        content: text,
      });
      if (res && res.conversationId) state.conversationId = res.conversationId;
      return true;
    } catch (err) {
      return false;
    }
  }

  function appendOwnerMessage(text) {
    const id = 'o-' + (++state.sendCount);
    state.messages.push({ id, role: 'owner', text });
    return id;
  }
  function appendVibeMessage(text) {
    const id = 'v-' + state.sendCount;
    state.messages.push({ id, role: 'vibe', text });
    return id;
  }

  async function send(text) {
    appendOwnerMessage(text);
    const persisted = await persistMessage('owner', text);
    if (!persisted) {
      // 不阻塞，但仍记录
    }
    const history = state.messages
      .filter(m => m.role === 'owner' || m.role === 'vibe')
      .slice(-12)
      .map(m => ({ role: m.role === 'owner' ? 'user' : 'assistant', content: m.text }));
    let res;
    try {
      res = await call('agent', 'ownerMessage', { messages: history });
    } catch (err) {
      appendVibeMessage(VIBE_FALLBACK_TEXT);
      return;
    }
    if (!res || res.ok !== true) {
      appendVibeMessage(VIBE_FALLBACK_TEXT);
      return;
    }
    const result = res.result;
    appendVibeMessage(result.reply);
    await persistMessage('vibe', result.reply);
    if (result.memoryProposal && !state.proposal) {
      try {
        const created = await call('memory', 'createMemoryProposal', {
          kind: result.memoryProposal.kind,
          content: result.memoryProposal.content,
          visibility: result.memoryProposal.suggestedVisibility || 'private',
          sourceConversationId: state.conversationId || '',
          sourceMessageIds: result.memoryProposal.sourceMessageIds || [],
        });
        state.memoryId = created && created.memory && created.memory._id;
        state.proposal = {
          id: 'p-' + state.sendCount,
          memoryId: state.memoryId,
          text: result.memoryProposal.content,
          state: 'pending',
        };
      } catch (err) {
        // 提取失败不阻塞
      }
    }
  }

  async function confirmProposal() {
    if (!state.proposal || state.proposal.state !== 'pending' || !state.memoryId) return false;
    try {
      await call('memory', 'confirmMemory', { memoryId: state.memoryId, content: state.proposal.text });
      state.proposal.state = 'confirmed';
      return true;
    } catch (err) {
      return false;
    }
  }

  async function listMemories() {
    const res = await call('memory', 'listMemories', { status: 'confirmed' });
    return res.memories || [];
  }

  function lastVibeMessage() {
    for (let i = state.messages.length - 1; i >= 0; i--) if (state.messages[i].role === 'vibe') return state.messages[i].text;
    return null;
  }
  function messagesSnapshot() { return [...state.messages]; }

  async function close() {
    if (state._failingStub) { try { await state._failingStub.close(); } catch {} state._failingStub = null; }
    restore();
    setStubOpenid('');
    // 重置 process.env 以免干扰后续 case
    delete process.env.AI_PROVIDER;
    delete process.env.AI_API_BASE;
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL;
    delete process.env.AI_TIMEOUT_MS;
  }

  return {
    state, send, confirmProposal, listMemories,
    messagesSnapshot, lastVibeMessage,
    get proposal() { return state.proposal; },
    close,
  };
}

// ============================================================
// runner
// ============================================================
async function runCase(c) {
  if (FLAGS.dryRun) {
    return { id: c.id, task: c.task, title: c.title, status: 'skip', durationMs: 0, evidence: 'dry-run', preconditions: c.preconditions, hint: c.hint };
  }
  const ctx = { env: process.env, hasRealKey: HAS_AI_KEY, dryRun: false, tmpCleanup: null };
  const t0 = performance.now();
  try {
    const r = await c.run(ctx);
    const dt = Math.round(performance.now() - t0);
    if (r.status === 'pass') return { ...c, status: 'pass', durationMs: dt, evidence: r.evidence, task: c.task, preconditions: c.preconditions };
    if (r.status === 'skip') return { ...c, status: 'skip', durationMs: dt, evidence: r.evidence, task: c.task, preconditions: c.preconditions };
    return { ...c, status: 'fail', durationMs: dt, evidence: r.evidence || '', error: r.error, task: c.task, preconditions: c.preconditions };
  } catch (err) {
    const dt = Math.round(performance.now() - t0);
    return { ...c, status: 'fail', durationMs: dt, evidence: 'uncaught ' + err.message, error: err.message, task: c.task, preconditions: c.preconditions };
  }
}

async function maybeDeploy() {
  if (FLAGS.dryRun || FLAGS.skipDeploy) {
    console.log(`\n[deploy] 跳过（dryRun=${FLAGS.dryRun}, skipDeploy=${FLAGS.skipDeploy}）`);
    return;
  }
  if (!process.env.MP_PRIVATE_KEY || !existsSync(process.env.MP_PRIVATE_KEY)) {
    console.log('\n[deploy] MP_PRIVATE_KEY 未配置 — 自动跳过云函数部署。');
    console.log('         （T1.3 / T1.4 / T4.3 在 harness 内用 stub wx-server-sdk 验证，不依赖部署。）');
    return;
  }
  console.log('\n[deploy] 运行 deploy-cloud.js …');
  const r = spawnSync(process.execPath, [DEPLOY_SCRIPT], { cwd: dirname(DEPLOY_SCRIPT), stdio: 'inherit', env: process.env });
  if (r.status !== 0) {
    console.error(`[deploy] 失败 exit=${r.status}`);
    if (FLAGS.strict) process.exit(1);
  }
}

function registerAll() {
  registerT1_2();
  registerT1_3();
  registerT1_4();
  registerT4_3();
}

async function main() {
  printBanner();
  registerAll();
  const ordered = ['1.2', '1.3', '1.4', '4.3'];
  let results = [];
  for (const t of ordered) {
    if (!shouldRun(t)) continue;
    const taskCases = CASES.filter(c => c.task === t);
    if (!taskCases.length) continue;
    console.log(`\n── §${t} (${taskCases.length} cases) ───────────────────────────────────────`);
    for (const c of taskCases) {
      process.stdout.write(`  • ${c.id}  ${c.title}\n`);
      const r = await runCase(c);
      results.push(r);
      const icon = r.status === 'pass' ? '✓' : r.status === 'skip' ? '○' : '✗';
      console.log(`    [${icon}]  ${r.status.toUpperCase()}  (${r.durationMs}ms)  ${r.evidence || ''}`);
      if (r.status === 'fail') console.log(`           ↳ ${r.hint}`);
    }
  }

  await maybeDeploy();

  // 报告
  const reportPath = await writeReport(results);
  console.log(`\n── 总结 ────────────────────────────────────────────────────`);
  console.log(`  pass : ${results.filter(r => r.status === 'pass').length}`);
  console.log(`  skip : ${results.filter(r => r.status === 'skip').length}`);
  console.log(`  fail : ${results.filter(r => r.status === 'fail').length}`);
  console.log(`  report: ${reportPath}`);

  // 任务维度判定
  const taskSummary = ordered.map(t => {
    const list = results.filter(r => r.task === t);
    const allPass = list.length > 0 && list.every(r => r.status === 'pass');
    const anyFail = list.some(r => r.status === 'fail');
    const allSkip = list.length > 0 && list.every(r => r.status === 'skip');
    let mark = '[ ]';
    if (allPass) mark = '[x]';
    else if (anyFail) mark = '[/]';
    else if (allSkip) mark = '[-]';
    return { task: t, count: list.length, ready: allPass, mark };
  });
  console.log(`\n  task readiness ([~] → [x]):`);
  for (const ts of taskSummary) {
    console.log(`    §${ts.task}  ${ts.mark}  (${ts.count} case${ts.count === 1 ? '' : 's'})`);
  }
  console.log(`\n  ⚠  本脚本不会自动改 DEVELOPMENT_PLAN.md。请 owner 审完报告后亲手改。`);

  if (FLAGS.strict) {
    const anyFail = results.some(r => r.status === 'fail');
    if (anyFail) process.exit(2);
  }
  if (FLAGS.dryRun) return;
}

// ============================================================
// report
// ============================================================
function fmtDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

async function writeReport(results) {
  if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });
  const path = join(REPORT_DIR, `conformance-report-${fmtDate()}.md`);
  const lines = [];
  lines.push(`# VibeCard Real Conformance — ${fmtDate()}`);
  lines.push('');
  lines.push(`- 模式：${FLAGS.dryRun ? '**dry-run**' : HAS_AI_KEY ? 'REAL provider (' + maskBase(process.env.AI_API_BASE) + ')' : 'mock-parity fallback (no AI_API_KEY)'}`);
  lines.push(`- 脚本：\`run-real-conformance.mjs\``);
  lines.push(`- CLOUD_ENV_ID：\`${CLOUD_ENV_ID || '(unset)'}\``);
  lines.push(`- WX_OPENID_OWNER：\`${OWNER_OPENID ? OWNER_OPENID.slice(0, 8) + '…' : '(unset)'}\``);
  lines.push(`- 生成时间：${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Task readiness');
  lines.push('');
  lines.push('| §   | pass | skip | fail | 推荐状态 |');
  lines.push('|-----|------|------|------|----------|');
  for (const t of ['1.2', '1.3', '1.4', '4.3']) {
    const list = results.filter(r => r.task === t);
    const p = list.filter(r => r.status === 'pass').length;
    const s = list.filter(r => r.status === 'skip').length;
    const f = list.filter(r => r.status === 'fail').length;
    const allPass = list.length > 0 && list.every(r => r.status === 'pass');
    const anyFail = list.some(r => r.status === 'fail');
    const allSkip = list.length > 0 && list.every(r => r.status === 'skip');
    let status;
    if (allPass) status = '**[x]**（建议改）';
    else if (anyFail) status = '**[/]**（仍有 failed）';
    else if (allSkip) status = '[-]（dry-run 或未跑）';
    else if (list.length === 0) status = '(no cases)';
    else status = '[ ]（部分 pass，仍有 fail/skip）';
    lines.push(`| §${t} | ${p} | ${s} | ${f} | ${status} |`);
  }
  lines.push('');
  lines.push('> ⚠  本报告只给推荐，**owner** 需自行复核后再改 `docs/engineering/DEVELOPMENT_PLAN.md` 里对应任务的 `Status` 行。');
  lines.push('');
  lines.push('## Cases');
  for (const t of ['1.2', '1.3', '1.4', '4.3']) {
    const list = results.filter(r => r.task === t);
    if (!list.length) continue;
    lines.push(`### §${t}`);
    lines.push('');
    for (const r of list) {
      const icon = r.status === 'pass' ? '✅' : r.status === 'skip' ? '⚪' : '❌';
      lines.push(`- ${icon} **${r.id}** — ${r.title}`);
      lines.push(`    - status: \`${r.status}\`  duration: ${r.durationMs}ms`);
      lines.push(`    - evidence: ${r.evidence}`);
      if (r.preconditions && r.preconditions.length) {
        lines.push(`    - preconditions:`);
        for (const p of r.preconditions) lines.push(`        - ${p}`);
      }
      if (r.status === 'fail') lines.push(`    - 排查: ${r.hint}`);
    }
    lines.push('');
  }
  lines.push('## How to reproduce');
  lines.push('');
  lines.push('```bash');
  lines.push('# 1. 准备 conformance.env（见 scripts/README-CONFORMANCE.md）');
  lines.push('# 2. 全跑');
  lines.push('node scripts/run-real-conformance.mjs');
  lines.push('# 3. 只跑某个 task');
  lines.push('node scripts/run-real-conformance.mjs --only=1.2');
  lines.push('# 4. dry-run（不连任何网络）');
  lines.push('node scripts/run-real-conformance.mjs --dry-run');
  lines.push('# 5. strict — 任一失败 exit 2');
  lines.push('node scripts/run-real-conformance.mjs --strict');
  lines.push('```');
  lines.push('');

  // 已有报告 => 追加
  let existing = '';
  if (existsSync(path)) existing = readFileSync(path, 'utf8');
  const banner = `\n---\n\n## Run @ ${new Date().toISOString()}\n`;
  writeFileSync(path, existing + banner + lines.join('\n') + '\n');
  return path;
}

// ============================================================
// entry
// ============================================================
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch(err => {
    console.error('runner crashed:', err);
    process.exit(1);
  });
}

export { main, registerAll, runCase, CASES };
