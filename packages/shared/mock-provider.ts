/**
 * Reference deterministic mock provider (task 5.4 Core).
 *
 * A faithful, platform-free port of the WeChat cloud-function mock
 * (`cloudfunctions/agent/lib/providers.js`). It exists so Core tests and
 * non-cloud runtimes can exercise the full agent boundary with zero keys,
 * zero network, and byte-identical outputs. Parity with the cloud mirror is
 * enforced by `test/parity.test.ts`.
 */

import {
  TEXT_STRUCTURED_CAPABILITIES,
} from './model-provider';
import type {
  ChatMessage,
  CompletionInput,
  ModelProvider,
} from './model-provider';

const MEMORY_WORTHY = ['想认识', '最近', '喜欢', '不喜欢', '不希望', '不要', '边界', '在做', '记住'];

const INJECTION_PATTERN = /ignore\s+(all\s+|previous\s+)?instructions|system\s*prompt|打印.*提示|显示.*提示词|你的提示词|忽略.*指令|我是主人/i;
const CONTACT_REQUEST_PATTERN = /微信号?|联系方式|手机号|电话|邮箱|怎么联系|contact|wechat/i;
const GROUNDED_PATTERN = /在做什么|最近|做什么|专注|方向|想了解|想认识|能帮|擅长/;

/**
 * Deterministic visitor-mode reply, keyed off the last visitor message and
 * the evidence ids present in the system prompt. The mock never quotes
 * memory content — it only cites evidence ids — so it can never leak
 * agent_only material into a reply.
 */
function mockVisitorReply(system: string, text: string): Record<string, unknown> {
  if (INJECTION_PATTERN.test(text)) {
    return {
      reply: '这个我做不到。我只是他的 AI 分身，只能聊和他有关的事。如果你想认识他，可以告诉我具体的理由。',
      evidenceRefs: [],
      nextAction: 'continue',
      boundaryCode: 'prompt_injection',
    };
  }
  if (CONTACT_REQUEST_PATTERN.test(text)) {
    return {
      reply: '联系方式我不会给，这要他本人决定。你可以告诉我为什么想认识他，我会原样转达，由他来选要不要交换。',
      evidenceRefs: [],
      nextAction: 'invite_connection_reason',
      boundaryCode: 'contact_request',
    };
  }
  // Recognition moment (task 3.3): the visitor states a concrete overlap
  // with the owner's public evidence -> the mock cites one sharedContext item.
  if (/我也/.test(text)) {
    return {
      reply: '这个交集挺具体的，值得放进你想认识他的理由里。是什么让你也开始做这件事的？',
      evidenceRefs: [],
      nextAction: 'invite_connection_reason',
      sharedContext: ['双方都在做个人 AI 分身'],
    };
  }
  if (GROUNDED_PATTERN.test(text)) {
    let refs = [...system.matchAll(/\[(now:[^\]]+|mem:[^\]]+|card:[^\]]+)\]/g)].map((m) => m[1]).slice(0, 2);
    // Recent-context questions (task 4.5): prefer Now items, then public
    // current-focus memory; if neither exists, admit uncertainty below
    // instead of citing unrelated evidence.
    if (/最近/.test(text)) {
      refs = [...system.matchAll(/\[(now:[^\]]+|card:currentFocus)\]/g)].map((m) => m[1]).slice(0, 2);
    }
    if (refs.length > 0) {
      return {
        reply: '这个我知道一些，都写在他的公开名片上。你可以顺着证据里的方向问得更具体一点，或者告诉我你为什么想认识他。',
        evidenceRefs: refs,
        nextAction: 'continue',
      };
    }
  }
  return {
    reply: '这件事他还没有告诉我，我不想替他猜。',
    evidenceRefs: [],
    nextAction: 'continue',
  };
}

/**
 * Deterministic connection summary. Strength is derived from the evidence
 * lines themselves: a specific reason plus shared context is strong;
 * anything thinner stays cautious.
 */
function mockConnectionSummary(system: string): Record<string, unknown> {
  const reason = (system.match(/理由：([^\n]*)/) || [])[1] || '';
  const context = (system.match(/可能的共同点：([^\n]*)/) || [])[1] || '';
  const strong = reason.trim().length >= 20 && context.trim().length > 0 && context.trim() !== '（无）';
  if (strong) {
    return {
      recommendation: 'worth_a_conversation',
      why: ['对方给出了具体的认识理由', '双方有明确的共同话题'],
      uncertainty: '对方更想深入合作，还是只交流一次想法',
      suggestedTopic: '从你们都关心的共同话题切入，聊聊彼此正在做的事',
      evidenceRefs: ['req:reason', 'req:shared_context'],
    };
  }
  return {
    recommendation: 'need_more_context',
    why: ['对方提交了连接请求，但写下的理由还不够具体'],
    uncertainty: '理由偏空泛、缺少共同点，无法判断真实的连接意图',
    suggestedTopic: '请对方补充一个具体想交流的话题，再作判断',
    evidenceRefs: ['req:reason'],
  };
}

function lastUserContent(messages: ChatMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  return last ? last.content : '';
}

export function createMockModelProvider(): ModelProvider {
  return {
    name: 'mock',
    capabilities: { ...TEXT_STRUCTURED_CAPABILITIES },
    async complete({ system, messages }: CompletionInput): Promise<string> {
      // Deterministic Card draft for the draft-generation path.
      if (system && system.includes('VibeCard 起草更新建议')) {
        return JSON.stringify({
          headline: '在做一张会越来越懂你的 AI 名片',
          currentFocus: '打磨访客和分身的前六轮对话，让「先理解，再认识」真的成立。',
          canHelpWith: ['AI 社交产品的取舍', '微信小程序从 0 到 1'],
          wantsToMeet: ['真正做过 AI 社交产品的人'],
          topics: ['个人 AI 分身', '隐私边界'],
          highlights: [{ title: 'VibeCard：一张会越来越懂你的 AI 名片' }],
          keptFields: [],
        });
      }
      // Deterministic connection summary for the owner-inbox path.
      if (system && system.includes('总结一个连接请求')) {
        return JSON.stringify(mockConnectionSummary(system));
      }
      // Deterministic visitor-mode replies, identified by the persona marker.
      if (system && system.includes('AI 分身')) {
        return JSON.stringify(mockVisitorReply(system, lastUserContent(messages)));
      }
      const text = lastUserContent(messages);
      const worthy = MEMORY_WORTHY.some((k) => text.includes(k));
      // Recognition moment (task 3.3): the owner talks about something they
      // said before -> the mock cites the first confirmed memory id it can
      // see in the system prompt.
      const recall = /上次|之前|还记得/.test(text);
      const memoryIds = system ? [...system.matchAll(/^- \[mem:([^\]]+)\]/gm)].map((m) => m[1]) : [];
      const result: Record<string, unknown> = {
        reply: worthy
          ? '这句话值得被记住。我大概懂你的意思了，还有别的想让我知道的吗？'
          : '嗯，我听着。说得多一点，我就更懂你一点。',
        memoryProposal: worthy
          ? {
              kind: 'preference',
              content: text.length > 40 ? `${text.slice(0, 40)}…` : text,
              suggestedVisibility: 'private',
              sourceMessageIds: [],
            }
          : null,
        cardUpdateSuggested: false,
        // Now proposal (task 4.5): a concrete recent update is proposed as a
        // draft only — never published by the agent.
        nowProposal: /最近在|刚完成|完成了/.test(text)
          ? {
              text: text.length > 60 ? `${text.slice(0, 60)}…` : text,
              topic: /刚完成|完成了/.test(text) ? 'completed_work' : 'current_work',
              expiresAt: null,
            }
          : null,
        ...(recall && memoryIds.length > 0 ? { referencedMemoryIds: memoryIds.slice(0, 1) } : {}),
      };
      return JSON.stringify(result);
    },
  };
}
