/**
 * Core tests: v1 profile migration mapping (task 5.2, ARCHITECTURE §9).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixtureV1UserProfile } from '../fixtures/vibe';
import {
  isV1ProfileDeleted,
  sanitizeV1Namecard,
  v1ProfileToCardBase,
  V1_CONTACT_KEYS,
} from '../migration';

test('v1 fixture maps to a valid Card draft base', () => {
  const base = v1ProfileToCardBase(fixtureV1UserProfile);
  assert.equal(base.name, fixtureV1UserProfile.nickname);
  assert.equal(base.avatarUrl, fixtureV1UserProfile.avatar);
  assert.equal(base.headline, fixtureV1UserProfile.namecard.motto);
  assert.deepEqual(base.topics, fixtureV1UserProfile.namecard.interests);
});

test('owner-written text is preserved verbatim (never rewritten)', () => {
  const base = v1ProfileToCardBase(fixtureV1UserProfile);
  // motto wins over bio, and the string is carried over byte-for-byte.
  assert.equal(base.headline, '先理解，再认识。');

  const noMotto = {
    ...fixtureV1UserProfile,
    namecard: { ...fixtureV1UserProfile.namecard, motto: undefined },
  };
  assert.equal(v1ProfileToCardBase(noMotto).headline, fixtureV1UserProfile.bio);

  const noMottoNoBio = {
    nickname: 'x',
    namecard: { intro: fixtureV1UserProfile.namecard.intro },
  };
  assert.equal(v1ProfileToCardBase(noMottoNoBio).headline, fixtureV1UserProfile.namecard.intro);
});

test('contact-bearing namecard keys are stripped', () => {
  const clean = sanitizeV1Namecard(fixtureV1UserProfile.namecard);
  for (const key of V1_CONTACT_KEYS) {
    assert.ok(!(key in clean), `${key} must be stripped`);
  }
  const serialized = JSON.stringify(clean);
  assert.ok(!serialized.includes('fixture-wechat-linzhou'));
  assert.ok(!serialized.includes('socialLinks'));

  const base = v1ProfileToCardBase(fixtureV1UserProfile);
  assert.ok(!JSON.stringify(base).includes('fixture-wechat-linzhou'));
});

test('sanitize tolerates missing or malformed namecards', () => {
  assert.deepEqual(sanitizeV1Namecard(undefined), {});
  assert.deepEqual(sanitizeV1Namecard(null), {});
  assert.deepEqual(sanitizeV1Namecard('junk'), {});
  assert.deepEqual(v1ProfileToCardBase(null), { name: '', avatarUrl: '', headline: '', topics: [] });
});

test('deleted v1 profiles are flagged deleted', () => {
  assert.equal(isV1ProfileDeleted({ deleted: true }), true);
  assert.equal(isV1ProfileDeleted({ status: 'deleted' }), true);
  assert.equal(isV1ProfileDeleted(fixtureV1UserProfile), false);
  assert.equal(isV1ProfileDeleted(null), false);
});

test('interests are capped at 8 topics and non-strings dropped', () => {
  const base = v1ProfileToCardBase({
    namecard: { interests: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 7, ''] },
  });
  assert.deepEqual(base.topics, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
});
