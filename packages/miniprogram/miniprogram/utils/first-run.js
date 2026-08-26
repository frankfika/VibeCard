/**
 * 首次三分钟对话的纯状态与投影规则。
 *
 * 页面只负责云调用和交互；这里保证跳过项不会进入记忆或 Card，隐私边界
 * 永远默认 private，并让中断恢复使用同一份稳定状态。
 */
const STORAGE_KEY = 'vibecard_first_run_v2';

const QUESTIONS = [
  {
    id: 'current',
    prompt: '你最近主要在做什么？',
    placeholder: '像聊天一样告诉我就好…',
    kind: 'current',
    visibility: 'public',
    memoryPrefix: '你最近主要在做：',
  },
  {
    id: 'work',
    prompt: '哪件作品或经历最像你？',
    placeholder: '一件你愿意被记住的作品或经历…',
    kind: 'fact',
    visibility: 'public',
    memoryPrefix: '最能代表你的是：',
  },
  {
    id: 'help',
    prompt: '你可以帮别人解决什么？',
    placeholder: '你最有把握帮上的一件事…',
    kind: 'fact',
    visibility: 'public',
    memoryPrefix: '你可以帮助别人：',
  },
  {
    id: 'meet',
    prompt: '你最近想认识什么样的人？',
    placeholder: '越具体，Vibe 越容易帮你判断…',
    kind: 'preference',
    // 首次 Card 明确要展示「想遇见谁」；只有主人确认这条 public 记忆后，
    // 它才有资格进入公开 Card 草稿。
    visibility: 'public',
    memoryPrefix: '你最近想认识：',
  },
  {
    id: 'boundary',
    prompt: '有什么事情不希望我对陌生人说？',
    placeholder: '这条默认只属于你，不会出现在 Card 上…',
    kind: 'boundary',
    visibility: 'private',
    memoryPrefix: '不要对陌生人提起：',
  },
];

function emptyState() {
  return {
    schemaVersion: 2,
    stage: 'intro',
    name: '',
    questionIndex: 0,
    answers: {},
    skipped: {},
    reviewIds: [],
    reviewIndex: 0,
    memoryDecisions: {},
    draft: null,
    published: false,
  };
}

function normalize(raw) {
  const base = emptyState();
  if (!raw || raw.schemaVersion !== 2 || raw.published) return base;
  const state = Object.assign(base, raw);
  state.answers = raw.answers && typeof raw.answers === 'object' ? raw.answers : {};
  state.skipped = raw.skipped && typeof raw.skipped === 'object' ? raw.skipped : {};
  state.memoryDecisions = raw.memoryDecisions && typeof raw.memoryDecisions === 'object'
    ? raw.memoryDecisions
    : {};
  state.reviewIds = Array.isArray(raw.reviewIds) ? raw.reviewIds.filter(questionById) : [];
  state.questionIndex = Math.max(0, Math.min(QUESTIONS.length - 1, Number(raw.questionIndex) || 0));
  state.reviewIndex = Math.max(0, Number(raw.reviewIndex) || 0);
  return state;
}

function load(wxApi) {
  try {
    return normalize(wxApi.getStorageSync(STORAGE_KEY));
  } catch (err) {
    return emptyState();
  }
}

function save(wxApi, state) {
  wxApi.setStorageSync(STORAGE_KEY, state);
}

function clear(wxApi) {
  try { wxApi.removeStorageSync(STORAGE_KEY); } catch (err) {}
}

function questionById(id) {
  return QUESTIONS.find((question) => question.id === id);
}

function proposalFor(id, answerOverride) {
  const question = questionById(id);
  const answer = String(answerOverride || '').trim();
  if (!question || !answer) return null;
  return {
    key: 'first-run-' + id,
    questionId: id,
    kind: question.kind,
    content: question.memoryPrefix + answer,
    visibility: question.id === 'boundary' ? 'private' : question.visibility,
    visibilityLabel: question.id === 'boundary'
      ? '仅自己可见'
      : question.visibility === 'public' ? '可以公开' : '仅分身可见',
    sourceMessageIds: ['first-run-answer-' + id],
  };
}

function reviewIdsFor(state) {
  return QUESTIONS
    .map((question) => question.id)
    .filter((id) => String(state.answers[id] || '').trim() && !state.skipped[id]);
}

function draftFromAnswers(state, confirmedOnly) {
  const answers = state.answers || {};
  const valueFor = (id) => {
    if (!confirmedOnly) return String(answers[id] || '').trim();
    const decision = state.memoryDecisions[id];
    if (!decision || decision.decision !== 'confirmed' || decision.visibility !== 'public') return '';
    const content = String(decision.content || '').trim();
    const question = questionById(id);
    if (!content || !question) return '';
    return content.startsWith(question.memoryPrefix)
      ? content.slice(question.memoryPrefix.length).trim()
      : content;
  };
  const current = valueFor('current');
  const work = valueFor('work');
  const help = valueFor('help');
  const meet = valueFor('meet');
  const draft = { name: String(state.name || '').trim() };
  if (current) draft.bio = current;
  if (work) draft.highlights = [{ id: 'first-run-work', title: work, icon: '✨', link: '' }];
  if (help) draft.canHelpWith = [help];
  if (meet) draft.lookingFor = meet;
  return draft;
}

module.exports = {
  STORAGE_KEY,
  QUESTIONS,
  emptyState,
  normalize,
  load,
  save,
  clear,
  questionById,
  proposalFor,
  reviewIdsFor,
  draftFromAnswers,
};
