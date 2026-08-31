# Task 4.6 → Task 4.2 Real-Device Handoff

> Generated 2026-09-01 alongside DEVELOPMENT_PLAN.md §4.6 completion.
> The cloud code, contracts, and tests are landed; the only remaining
> verification is the real-device walkthrough described below. This document
> is the exact checklist the owner (the human operator) follows once DevTools
> is logged in and the cloud functions are deployed.

The §4.6 acceptance criteria are split between the automated tests already
in the repository and the real-device walkthrough that needs an authenticated
WeChat DevTools session. The automated part:

- `packages/miniprogram/cloudfunctions/archive/{export,import,deleteAll}/test/handlers.test.js` — 25 new handler tests cover owner isolation, ownership mismatch, public/private boundary, encrypted / future-version rejection, token validation, idempotent re-import, tombstone failure → partial_cleanup.
- `packages/miniprogram/tests/settings-page.test.js` — 7 new page smoke tests cover the four acceptance states (success / permission_denied / failure / retry / partial_cleanup), refusal on missing typed `DELETE` confirmation, and refusal on ownership-mismatched import.
- Existing 145 shared tests + 84 miniprogram page tests still pass.

What still needs an owner to run (with two real OPENIDs):

## 1. Deploy the new cloud functions

From `packages/miniprogram/`:

```bash
node deploy/deploy-cloud.js   # or use miniprogram-ci.cloud.deployFunction
```

The deploy script must include `archive-export`, `archive-import`, and
`archive-delete-all`. If the existing script only knows the original 9
functions, add the three entries and re-run.

## 2. Create the new collections

In the cloud console (云开发 → 数据库 → 集合管理):

- `contact_methods` — index: `ownerId` (asc).
- `owner_export_receipts` — primary key `_id` only (id is deterministic).
- `owner_audit_log` — index: `ownerOpenid` (asc) + `createdAt` (desc).

If these collections don't exist before the first call to
`archive-delete-all`, the receipt write inside `prepareDeleteAll` fails and
the owner sees a 500.

## 3. Real-device walkthrough (two OPENIDs)

For each numbered step, capture a screenshot or short screen recording; this
is the §4.6 acceptance evidence DevTools automation cannot produce.

### Owner side (account A — yours)

1. Open the Mini Program, accept the privacy popup, complete the
   first-run-onboarding so you have at least one confirmed memory, one
   published Now item, and one contact method.
2. Navigate to `pages/settings` (e.g. via a temporary link in `pages/card`
   or by typing `pages/settings/settings` in DevTools).
3. Tap "导出我的 Vibe" with the "include conversations" toggle OFF.
   - Expect: a green success chip with `vibecard-*.vibe` file name.
   - Verify on-device: open Files (文件管理) → WeChat Mini Program data →
     `wx.env.USER_DATA_PATH`. The `.vibe` file exists and matches the
     archive size.
4. Tap "导出我的 Vibe" with the toggle ON.
   - Expect: same flow; the file is bigger and contains the conversation
     `messages` array.
5. Take the file from step 3 (or 4), store it temporarily, then tap
   "导入 Vibe" → choose it → "确认导入".
   - Expect: a per-collection table with `created`, `updated`, `skipped`
     counters.
   - Re-import the same file → all counters should be `skipped`.
6. Tap "删除我的 Vibe 数据" → wait for step 1 to finish → review the
   receipt digest / byte count → tap "下载本次归档" to verify the backup
   → type `DELETE` exactly → tap "永久删除我的 Vibe 数据".
   - Expect: green success chip; the page's nowItems / memories list
     returns to empty in any subsequent call.

### Visitor side (account B — a friend with a different real WeChat)

7. Open the owner's pre-delete share link in account B's WeChat → enter
   the visitor chat. Note the agent works.
8. Have the owner re-share after step 6's delete. Account B opens the new
   link.
   - Expect: the public Card page now shows the "card_deleted" terminal
     state ("这张名片已被主人收回"). No contact methods, no Now items
     remain visible.
9. Save the `.vibe` from step 3, send it to account B. Account B taps
   "导入 Vibe" and confirms.
   - Expect: a red error chip with `ownership_mismatch`. Nothing is
     written to account B's database.

## 4. Cross-check the audit log

In the cloud console (云开发 → 数据库 → `owner_audit_log`), filter by
`ownerOpenid = account A's openid`. Expect these entries in chronological
order:

- `exportPrivateArchive / success` (steps 3 and 4)
- `importArchive / success` (step 5; possibly twice for the idempotency test)
- `prepareDeleteAll / success` (step 6 step 1)
- `deleteAll / success` (step 6 step 3)

`meta` carries the byte / record counts and the archive digest prefix; the
archive body itself never lands in the log.

## 5. Common pitfalls

- **"未找到集合" (collection not found)**: create the three new collections
  (see step 2). This is the #1 reason the first delete-all call fails.
- **`token_expired` after a long pause**: the receipt window is 5 minutes.
  Tap step 1 again; do not paste an old `preparedAt` into the form.
- **Import says `public_boundary_violation`**: the file is a public archive
  (Card-only). Only private archives restore owner data; the public kind is
  intended for visitor share, not for owner recovery.
- **The page never opens**: confirm `app.json` lists `pages/settings/settings`
  in the pages array. The deploy script does not rewrite `app.json`.

## 6. Sign-off

Once every box above is checked and the audit log matches the expected
sequence, §4.6 can flip from `[x] (code)` to `[x] (real-device-verified)`
in `DEVELOPMENT_PLAN.md`. The audit finding from 2026-08-23 is then fully
closed and Milestone 4 is unblocked from shipping the WeChat release.