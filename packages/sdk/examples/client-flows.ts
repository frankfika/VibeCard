import { VibeClient, type VibeClientOptions } from '../src/index.ts';

/** A minimal owner flow shared by self-hosted and managed deployments. */
export async function runOwnerExample(options: VibeClientOptions) {
  const vibe = new VibeClient(options);
  const card = await vibe.ownerCard();
  const message = await vibe.ownerMessage('我长期偏好把隐私边界讲清楚，再开始合作。');
  const confirmedMemory = message.memoryProposalId
    ? await vibe.confirmMemory(message.memoryProposalId)
    : null;
  const draft = await vibe.createNowDraft({
    text: '最近在把一张会成长的 AI 名片做成产品。',
    topic: 'current_work',
  });
  const published = await vibe.publishNow(draft.id);
  return { card, message, confirmedMemory, published };
}

/** A minimal visitor flow; it never receives or sends an owner credential. */
export async function runVisitorExample(options: Omit<VibeClientOptions, 'ownerToken' | 'auth'>) {
  const vibe = new VibeClient(options);
  const card = await vibe.publicCard();
  const chat = await vibe.visitorChat('example-visitor', '你最近在做什么？');
  return { card, chat };
}

/** Complete visitor request → owner evidence review → owner-controlled connect. */
export async function runConnectionExample(
  ownerOptions: VibeClientOptions,
  visitorOptions: Omit<VibeClientOptions, 'ownerToken' | 'auth'>,
) {
  const visitor = new VibeClient(visitorOptions);
  const owner = new VibeClient(ownerOptions);
  const submitted = await visitor.submitConnectionRequest({
    visitorId: 'example-visitor',
    visitorSummary: 'SDK example visitor',
    reason: '我也在开发隐私优先的个人 AI，想交流公开投影和私人记忆的边界。',
    possibleSharedContext: ['隐私优先的个人 AI'],
  });
  const inbox = await owner.listConnectionRequests('pending');
  const request = inbox.find(item => item.id === submitted.id);
  if (!request) throw new Error('submitted request did not reach the owner inbox');
  const summary = await owner.summarizeConnectionRequest(request.id);
  const contact = await owner.createContact({ kind: 'email', value: 'owner@example.test', label: '示例邮箱' });
  const connected = await owner.actOnConnectionRequest(request.id, 'connect', { sharedContactMethodIds: [contact.id] });
  const archive = await owner.exportPrivate(false);
  return { submitted, request, summary, connected, archive };
}
