# Code Review — PR #3110 · `feat: stateless MCP server for location maps`

| | |
|---|---|
| **Repo** | `Visual-Elements/everviz` |
| **PR** | [#3110](https://github.com/Visual-Elements/everviz/pull/3110) — closes #3109 |
| **Author** | Awsaf Mahmood (`@Awsaf780`) |
| **Head** | `7f6f2f059fe4c1cf098970acb8b792290df45a1b` |
| **Size** | +5,883 / 71 files changed |
| **Stated base** | `enhancement/location-map-shared-headless-core` (**not** `master` — the PR is currently opened against `master`) |
| **Reviewed** | 2026-09-03 |

---

## Severity legend

| Tag | Meaning |
|---|---|
| 🔴 **URGENT** | Blocks merge. Ship this and something breaks in production or a customer is exposed. |
| 🟠 **HIGH** | Fix before merge. Real security or correctness impact, or a materially raised risk profile. |
| 🟡 **MEDIUM** | Fix in this PR or a fast follow-up with a linked issue. Design, robustness, cost, or maintainability. |
| 🔵 **LOW** | Nit, convention, or polish. Batch these. |
| ⚪ **PONYTAIL** | Over-engineering. Code to delete, not code to fix. Listed separately at the end. |

---

## Verdict

**Request changes.** The architecture is right and the write-up is unusually honest — the port-based split
between editor and server, the decision to keep `contracts.ts` as the single source of truth, and the
self-reported known gaps are all good engineering. But three things stop this from merging as-is:

1. The base branch is wrong on the PR itself (`master`), so what GitHub shows as the diff is not what would
   actually land.
2. The one test that proves the central security claim — *the team comes from the credential, not the URL* —
   **has never been executed.**
3. A second credential class (`X-CMS-Key`) reaches `/mcp` and takes the owner short-circuit, skipping the
   `create_chart` permission check the route declares.

Everything else below is fixable in a normal review cycle.

---

# 🔴 URGENT

### U-1 · The security test that justifies the whole design has never passed

**File:** `packages/integration-tests/e2e/mcp/locationMapMcp.spec.ts`

The PR's core safety argument is *"the API key **is** the team claim — the caller never names a team, so there
is nothing to spoof."* The test that proves this — *two keys on the same URL resolve to different teams* — is
written, type-clean, and **has never been run.** The PR body says so explicitly.

An unexecuted test is not coverage. It is an assertion about coverage.

**Also unrun, per the author:** `npm run check`, the full `npm test`, and the whole Playwright suite. Only the
`@everviz/server` workspace was re-run after the URL change.

**Action:** run the e2e suite. This is a merge gate, not a nice-to-have.

---

### U-2 · The `getByKey` `active` filter can revoke live customer keys on deploy

**Files:** `packages/everviz-db/lib/model/team_key.ts`, `packages/everviz-db/schema/team.key.json`

```diff
- d = d.where(({ eb, and, or }) => or([and([eb('key', '=', key)])]));
+ d = d.where(({ eb, and, or }) => or([and([eb('key', '=', key), eb('active', '=', 1)])]));
```

This is a correct fix — clearing `active` previously revoked nothing. But `active` is a bare `bool` with **no
column default**, so any row created outside the UI path may be `NULL`, and `NULL <> 1`. Those keys stop
working the moment this deploys.

The author flagged this and supplied the check query. It sits under "Deployment note" rather than as a blocking
item, which undersells it — this is the single change in the PR that can break a paying customer's existing
integration with no code path of theirs changing.

**Action, in order:**

1. Run `SELECT COUNT(*) FROM team_key WHERE active IS NULL OR active <> 1;` against production.
2. Backfill if the count is non-zero.
3. **Add a migration** setting `active NOT NULL DEFAULT 1`, so this cannot recur. Fixing the read without
   fixing the schema leaves the same trap for the next reader.
4. Consider shipping the `getByKey` fix as its own small PR ahead of the MCP work, so a revocation incident is
   not entangled with a 5.8k-line feature rollback.

---

### U-3 · PR is opened against the wrong base branch

The description says the base must be `enhancement/location-map-shared-headless-core` (#2916), but the PR
targets `master`. Everything CI runs, everything a reviewer reads, and the merge itself are all computed
against the wrong tree.

**Action:** retarget the PR before any further review pass. A review of the wrong diff is worth very little.

---

# 🟠 HIGH

### H-1 · A CMS licence key reaches `/mcp` and skips the `create_chart` permission check

**File:** `packages/everviz-server/lib/api/auth.middleware.ts` — `sessionFromCMSKey`, `apiKeyTeam`, `checkTeamAccess`

The chain:

1. `sessionFromCMSKey` (triggered by `X-CMS-Key`) sets `api_key: true`, `cms_license: true`, `group_id: null`,
   `user_id: row.owner_user`, `team_id: row.team_id`.
2. `apiKeyTeam` gates only on `req.session.user_data.api_key` being truthy and `team_id` being non-null. A CMS
   licence satisfies both, so it passes.
3. Inside `checkTeamAccess`, the new guard is:

```ts
const isTeamApiKey = api_key === true && req.session.user_data.cms_license !== true;
if (req.team && req.team.owner_user === req.session.user_data.user_id && !isTeamApiKey) {
  next();   // ← permission check skipped entirely
  return;
}
```

A CMS licence authenticates *as* the owner, so `owner_user === user_id` holds and `isTeamApiKey` is `false`.
The `create_chart` permission the route declares is **never evaluated.**

The route reads `auth.apiKeyTeam('create_chart')`, which states an intent that one credential class silently
does not honour. `auth.apiKeyPlanFeature('create_location_map')` still runs, so this is not unauthenticated
access — but it is a permission gate that does not gate.

**Fix:** if `/mcp` is meant for team API keys only (which the docblock and the 403 message both say), assert
that directly rather than inferring it:

```ts
const ud = req.session.user_data;
const isTeamApiKey = ud.api_key === true && ud.cms_license !== true;
if (!isTeamApiKey || ud.team_id == null) { /* 403 */ }
```

Two flags are already being used to answer one question in two places. Collapse them into a single
`credential: 'cookie' | 'team_key' | 'cms_license'` discriminant on `user_data` and the ambiguity disappears at
the type level instead of in prose comments.

---

### H-2 · Plaintext, non-expiring API keys are now pasted into third-party MCP clients

*Listed by the author as a follow-up. The risk profile changed in this PR, so the follow-up label is no longer
the right one.*

`team_key` rows store the key in plaintext, with no expiry and no rotation. Until now those keys lived in
server-to-server integrations. This PR's entire purpose is to get customers to paste them into Claude Desktop
configs, `mcp-remote` invocations, shell history, and third-party client settings files.

That is a legitimate product decision, but it converts "plaintext keys in our DB" from a latent weakness into
the primary credential for a new distribution channel.

**Minimum before GA (not necessarily before merge):**

- Hash at rest (show-once on mint; reworks `ApiPage`, as the author notes).
- Add `expires_at`, even if the default is null.
- Surface `last_used` in the UI so a customer can spot a leaked key.
- Document key rotation in whatever setup guide ships alongside this.

At minimum this belongs in a tracked issue linked from the PR, not a bullet in a description that disappears on
merge.

---

### H-3 · The documented session-replay hazard is guarded only by an accident

**File:** `auth.middleware.ts` — `apiKeyTeam` docblock

The docblock is admirably candid, and that candour is the finding:

> `session()` short-circuits whenever `req.session.user_data` is already set, so a caller that could replay an
> express-session cookie would resolve the team its FIRST key established and never touch `team_key` again:
> **revoked keys would keep working**, `last_used` would stop updating, and the plan's `api_access` check would
> stop running for the life of that session. Today that is unreachable, and **only by accident**: `app.js` sets
> `cookie: { secure: true }` while nothing sets `trust proxy` […] Enabling `trust proxy` — an ordinary thing to
> do for correct client IPs in rate limiting — would turn that on with no other code change.

This PR adds a rate limiter that keys on `req.ip` as its fallback. `trust proxy` is *exactly* the next change
someone makes. The comment predicts its own defeat.

**Fix:** do not rely on the accident. On the `/mcp` path, resolve the credential per request rather than
honouring a pre-populated `req.session.user_data`:

```ts
// in apiKeyTeam, before calling session()
if (req.header('X-API-Key') || req.header('Authorization')) delete req.session.user_data;
```

…or add an explicit `session({ force: true })` mode. A one-line guard beats a twelve-line comment explaining
why you do not need one.

---

# 🟡 MEDIUM

### M-1 · The rate limiter is mounted last, so it rate-limits nothing expensive

**Files:** `packages/everviz-server/lib/api/routes/mcp.ts` (middleware chain), `mcpRateLimiter.middleware.ts`

```ts
auth.apiKeyTeam('create_chart'),        // 4+ DB queries, incl. a write
auth.apiKeyPlanFeature('create_...'),   // 2+ DB queries
originAllowlist([frontendOrigin]),
mcpRateLimiter(),                       // ← runs after all of the above
```

Every request — including the 121st, the 10,000th, and every rejected one — pays the full auth cost before the
limiter is consulted: `getByKey`, `getPlanForTeam`, `getPermissions`, `team_key.update` (a **write**),
`getTeam`, `getRow`, `checkAndExecPendingPlan`. The limiter caps tool *execution*, not load.

The ordering is forced (the limiter keys on the team the auth resolves) and the comment says so. But the answer
is a two-tier limit, not accepting the inversion: a cheap per-IP limiter in front of auth, plus the per-team one
behind it.

### M-2 · The rate limit is per-instance, so the real ceiling is 120 × replicas

`express-rate-limit`'s default `MemoryStore` is per-process. `MAX_REQUESTS_PER_TEAM = 120` is therefore 120 *per
backend instance per minute*. On four replicas behind a load balancer a team gets 480/min, unevenly and
unpredictably. The PR describes the endpoint as stateless precisely so any instance can serve any request —
which is exactly what defeats an in-memory limiter.

**Fix:** a shared store (Redis), or state in the comment that the limit is per-instance and set the constant
accordingly.

### M-3 · `express-rate-limit` v7 API usage

```ts
rateLimit({ windowMs, max: 120, keyGenerator: (req) => … req.ip … })
```

- `max` is the v6 name; v7 (7.5.1 is pinned here) prefers `limit` and warns on `max`.
- A custom `keyGenerator` returning a bare `req.ip` trips v7's IPv6 validation (`ERR_ERL_KEY_GEN_IPV6`) — the
  `ipKeyGenerator` helper exists for this. Without it, IPv6 clients are keyed per-address rather than
  per-subnet, which makes the IP fallback trivially bypassable.
- No `standardHeaders: true`, so clients get no `RateLimit-*` headers and cannot back off politely. For an
  endpoint whose entire audience is automated agents, that matters more than usual.

### M-4 · Theme descriptions are prompt-injected into tool descriptions, unbounded and unescaped

**Files:** `registerLocationMapTools.ts` (`describeTheme`, `buildCreateDescription`), `serverTools.ts`
(`readThemeDescription`), `themeEditorReducer.ts`

Team-authored free text is interpolated verbatim into `create_location_map`'s MCP tool description — the text a
model reads while deciding what to do. The code comments explicitly choose *not* to truncate:

> Descriptions go in whole, deliberately […] a fixed-length cut is a blind one.

Three problems compound:

1. **The 400-character cap is client-side only.** `THEME_DESCRIPTION_MAX_LENGTH` is applied in the `saveTheme`
   saga. `theme_editor_options` is a free-form JSON blob posted to the API; nothing server-side validates
   `aiMetadata.description`. A crafted API call stores a description of any length. The reducer comment claims
   *"This is the ONLY cap on description text"* — which is true, and is the bug.
2. **No escaping.** `describeTheme` builds `${id} = "${name}" — ${description}`. A name or description
   containing `"`, `;`, or a newline corrupts the delimiter the function was carefully designed around.
3. **It is an instruction channel.** 40 themes × unbounded text is attacker-influenced content sitting in the
   model's tool description. Blast radius is one team (a theme editor already holds that team's write access),
   so this is not privilege escalation — but a compromised or careless theme author can steer every MCP session
   on that team.

**Fix:** validate and clamp server-side in `readThemeDescription` — it already returns `undefined` for
everything malformed, so add a `.slice(0, 400)` and strip control characters and newlines there. Server-side
validation of a client-supplied blob is not optional.

### M-5 · `create_location_map` bypasses chart-limit enforcement

**File:** `routes/mcp.ts`

`auth.chartLimit()` guards `chart.js`, `story.js`, and `table.js`. It is not mounted on `/mcp`. An MCP client in
a retry loop can mint unlimited charts against a plan that caps them.

In fairness this matches the existing location-map routes, which also omit it — so it is a pre-existing gap, not
a regression. But this PR is the first path where an *automated agent* creates charts in a loop, which is what
turns a latent gap into a billing and storage problem. `create_location_map` is also the one tool a model is
explicitly instructed to call before anything else.

**Fix:** mount `auth.chartLimit()`, or perform the check inside `createLocationMapFromMcp`.

### M-6 · PostHog capture sends customer map content to a third party

**File:** `routes/mcp.ts` — the `instrument()` block

Tool arguments *and* results are captured, meaning place searches, marker labels, titles, and whole map configs
reach PostHog. The code says this plainly and calls the scrub "load-bearing rather than belt-and-braces" —
correct, and the reason to treat it carefully:

- `observability.scrub` is **key-name based**. Map content lives in values under innocuous keys (`name`, `text`,
  `label`), which key-based scrubbing will not catch by design.
- It is gated on `mcpAnalyticsEnabled`, defaulting to `false`. Good. But nothing in the PR describes the
  DPA/GDPR review required to flip it on, and that flag is the only thing between "off" and "customer content
  leaves the building".

**Fix:** document the sign-off required to enable the flag, and consider capturing tool *names* plus argument
*shapes* (key sets, array lengths) rather than values. That answers "what do models actually send" without
exporting content.

### M-7 · A losing optimistic write orphans a `chart_version` row

**File:** `packages/everviz-server/lib/chart.helpers.js` — `update`

The compare-and-swap is well designed, and the comment explaining why `db.transaction` issues no `BEGIN` is
genuinely useful. But the loser has already inserted its `chart_version` (and `data_setting`) row before the
swap fails. Nothing points at it and nothing deletes it. Under a retrying model — the exact caller this was
built for — orphans accumulate silently.

**Fix:** delete the inserted version row in the failure branch, or add it to whatever version-GC job exists. At
minimum add a metric so the orphan rate is visible.

### M-8 · `chartHelpers.update` now takes 12 positional parameters

**Files:** `chart.helpers.js`, `chartToolExecutor.ts`

The call site reads:

```js
await chartHelpers.update(
  Number(teamId), chartId, userId, JSON.stringify(...), { is_theme: 0 },
  chart.dataId, chart.live, chart.name,
  undefined,        // templateId
  undefined,        // isTemplate
  chart.version     // expectedVersion
);
```

Two `undefined` placeholders exist only to reach the twelfth argument. Any future parameter makes it worse, and
a transposed pair of same-typed arguments here is a silent data-corruption bug no type checker catches.

**Fix:** the trailing options-object refactor — `update(teamID, chartID, userID, chartData, opts)` — with the
existing callers adapted. Mechanical, and the PR already touches every relevant call site.

### M-9 · `tools/list` theme injection misses JSON-RPC batch requests

**File:** `routes/mcp.ts`

```ts
if (req.body?.method === 'tools/list') { … }
```

JSON-RPC 2.0 permits a batch request — a top-level **array**. `req.body.method` is then `undefined`, the theme
list is silently skipped, and the model gets the degraded fallback description with no signal that anything went
wrong. Either handle the array case or explicitly reject batches with a proper JSON-RPC error.

### M-10 · `originAllowlist` details

**File:** `originAllowlist.middleware.ts`

- Constructed as `originAllowlist([frontendOrigin])` — a single-element array with no way to add the admin
  origin, a staging host, or `claude.ai` when the OAuth follow-up lands. Take the list from config.
- If `resourcesOrigin.frontend` is ever empty (the failure the route's own comment is defending against), the
  allowlist becomes `['']` and every browser request carrying an `Origin` is rejected — a silent total outage
  for browser clients. Fail loudly at startup instead: `if (!frontendOrigin) throw`.
- Returns `res.status(403).send('Forbidden')` — `text/plain`, on a route whose every other error path is
  JSON-RPC. An MCP client cannot parse it.

### M-11 · `apiKeyPlanFeature` does not verify it is looking at an API key

**File:** `auth.middleware.ts`

It reads `req.session.user_data.team_id` and proceeds. It never checks `api_key`. It is safe *today* only
because `apiKeyTeam` runs first on the one route that uses it — a constraint recorded in a comment, not in code.
Add the same credential check to `apiKeyPlanFeature`, or make the two a single composed middleware that cannot
be mounted in the wrong order.

### M-12 · Ownership check costs a full chart parse

**File:** `chartToolExecutor.ts` — `loadTeamChart`, used by `renameChart` and `getChartThemeId`

`loadTeamChart` fetches the row and runs `parsePersistedLocationMap(JSON.parse(String(row.data)))` on the entire
map blob. `renameChart` needs exactly one thing from it: that `team_owner` matches. `getChartThemeId` needs one
field. On a large map with hundreds of features that is a full parse and validation pass thrown away — on the
hot path of `list_theme_presets`, which a model calls constantly.

**Fix:** split the guard from the load — `assertTeamOwnsChart(teamId, chartId)` returning the raw row, with
`loadTeamChart` building on it.

### M-13 · zod 3 → 4 on a shared package, with a v3 compat shim retained

**File:** `packages/location-map-shared/package.json`

`zod@3.25.76` → `zod@4.4.3` on a package the **frontend** also consumes, while the validator files keep the v3
API through the `zod/v3` compat subpath. Two zod runtimes in one bundle is a real size and behaviour concern for
the frontend build, and the compat shim is deferred debt with no tracked removal.

**Ask:** a bundle-size delta for the frontend build, and an issue for retiring `zod/v3`.

---

# 🔵 LOW

| # | File | Finding |
|---|---|---|
| L-1 | `chart.helpers.js` | `parseInt(chart.version, 10)` can yield `NaN`; `NaN !== expectedVersion` is always true, so it fails closed (good) but with a misleading message (`found NaN`). `chart.version + 1` in `chartToolExecutor` then reports `NaN` as the new version. Guard explicitly. |
| L-2 | `packages/everviz-server/package.json` | The three `@modelcontextprotocol/*` deps are inserted *after* `express`, breaking the file's alphabetical ordering. Cosmetic, but it makes the diff noisier than it needs to be. |
| L-3 | `auth.middleware.ts` | `apiKeyTeam` never populates `seenPermissions`, unlike `team()`. The author flags this; `getSeenPermissions()` has no callers outside this file. Resolve it or delete the mechanism — a half-populated registry is worse than none. |
| L-4 | `routes/mcp.ts` | Only `POST /mcp` is registered. `GET` (SSE) and `DELETE` (session termination) fall through to the global handler and return HTML. Return an explicit `405` with a JSON-RPC body so clients probing transport capability get a parseable answer. |
| L-5 | *(repo-wide)* | `@everviz/server` has no `typecheck` script, so `npm run check` never type-checks it — including `registerLocationMapTools.ts`, the largest new file here. The author flagged it. Fix it in this PR, not after: a manual one-off `tsc` run is not a CI gate. |
| L-6 | `auth.middleware.ts` — `checkTeamAccess` | If `billing.checkAndExecPendingPlan` throws *after* the `402` has been sent, the `catch` sends `403` on top of it → `ERR_HTTP_HEADERS_SENT`. Pre-existing ordering, faithfully preserved by the refactor. Add a `res.headersSent` guard in the catch. |
| L-7 | `handlers.ts` | `normalizePresetId` does `id.replace(/-/g, '').toLowerCase()`, so `a-b` and `ab` collide. Probably carried over from the pre-move code, but the move is the moment to notice it. |
| L-8 | `mcpRateLimiter.middleware.ts` | `WINDOW_MS` and `MAX_REQUESTS_PER_TEAM` are module constants. Every other operational limit in this codebase lives in `config.js`. Move them, so a rate-limit change is a config push rather than a deploy. |
| L-9 | new middleware tests | Heavy `as any` / `as unknown as` in `auth.middleware.test.ts`, `mcpRateLimiter.middleware.test.ts`, `originAllowlist.middleware.test.ts`. A small typed `makeReq`/`makeRes` helper removes ~15 of them and makes the tests read as specifications rather than casts. |
| L-10 | `registerLocationMapTools.ts` | The `catch` block in the generic tool handler and the one in `registerCreateLocationMap` are byte-identical (log, narrow, generic message). Extract `toErrorResult(name, error)`. |
| L-11 | `AiMetadataSection.tsx` | A 79-line file carrying a 25-line docblock. It is excellent documentation and genuinely explains a non-obvious mechanism — but the "can never become a per-chart control" invariant is enforced by *absence* from `CustomizeOptions.ts`, which no test asserts. Add the assertion; then the comment is a pointer rather than the only guard. |

---

## What is good, and should be said

Reviews that only list defects misrepresent the work. Specifically worth keeping:

- **The port abstraction is the right call.** Three named ports (`resolvePresets`, `getAggregatedOptions`,
  `resolveCamera`) with one honest gap on the server side, documented rather than faked, is much better than a
  headless MapLibre shim would have been.
- **The "no team in the URL" reasoning is correct**, and the refactor enabling it — splitting team *resolution*
  from team *checking* into one shared core — leaves all 164 existing routes on one implementation instead of
  two. That is the hard version of the change and the right one.
- **The `auth.team()` owner-short-circuit fix closes a real vulnerability**: a key scoped to team A whose
  attached user owned team B reached team B unrestricted. Worth calling out on its own merits, independent of
  this feature.
- **The comments explain *why*, not *what*.** The `db.transaction` note ("despite the name, issues no BEGIN"),
  the `outputSchema` omission, and the module-scope `resourcesOrigin` trap are all things the next reader would
  otherwise rediscover the hard way.
- **Four bugs were found by running the thing.** The PR says so and lists them. That is the right instinct — and
  it is also the argument for U-1: the same instinct, applied to the e2e suite, is what is missing.

---

# ⚪ PONYTAIL — the over-engineering pass

Complexity only. Correctness and security are above; this section is purely *what to delete*.

```
packages/everviz-server/package.json: delete: "@modelcontextprotocol/express": "2.0.0" declared, never imported. Route uses /server and /node only. Nothing replaces it.
packages/everviz-utils/lib/observability/types.ts:L92-95: yagni: optional rawClient?() port on ObservabilityProvider — one provider implements it, one caller uses it. Export the posthog client directly until a second provider exists.
auth.middleware.ts:L18-23: shrink: bearerApiKey, 6 lines. `return /^Bearer\s+(.+)$/i.exec(req.header('Authorization')?.trim() ?? '')?.[1];` — 1 line.
registerLocationMapTools.ts (tool callback): delete: parseToolInput re-validation the comment itself calls "a redundant safety net" — the SDK already rejected bad args against the schema declared 30 lines above. The adapter test already pins the tool list.
registerLocationMapTools.ts (optionalChartIdField): yagni: exists to vary one .describe() string for one tool. Inline it at the single call site.
registerLocationMapTools.ts: shrink: two byte-identical catch blocks (generic handler + create). One toErrorResult(name, error) helper, -14 lines.
TextWidget.tsx:L10-17: yagni: characterLimit + showCharacterCount as two props, one call site, and showCharacterCount is a documented no-op without characterLimit. One prop: characterLimit renders the counter.
AiMetadataSection.tsx:L8-11: yagni: showContainer / openedByDefault props — neither is passed by the single call site in LocationMapCustomize.tsx. Drop both, hardcode the SectionNode defaults.
aiTools/cameraFit.ts:L21-29: shrink: unionBoundingBoxes reduce with an undefined seed. `bboxes.length ? [Math.min(...bboxes.map(b=>b[0])), …] : undefined` — 3 lines, and the four Math calls read as what they are.
serverTools.ts (readThemeDescription): shrink: 20 lines of hand-rolled defensive parsing. A 4-line zod safeParse on the shape you already validate elsewhere.
chartToolExecutor.ts (renameChart): shrink: calls loadTeamChart (full JSON.parse of the map blob) for an ownership check it then discards. Ownership-only query, -1 parse per rename.
```

**net: -120 lines possible.**

Not counted, and not to be cut: the `handlers.ts` move itself. 840 lines relocated from the frontend into the
shared package so two runtimes execute one implementation is the opposite of bloat — it is the deletion of a
future second copy.

---

## Merge checklist

- [ ] 🔴 Retarget the PR to `enhancement/location-map-shared-headless-core` (U-3)
- [ ] 🔴 Run the Playwright e2e suite, especially the two-keys-one-URL test (U-1)
- [ ] 🔴 Run `npm run check` and the full `npm test`
- [ ] 🔴 Run the production `team_key.active` count, backfill, and add the `NOT NULL DEFAULT 1` migration (U-2)
- [ ] 🟠 Block `X-CMS-Key` from `/mcp`, or make it honour the permission check (H-1)
- [ ] 🟠 Open a tracked issue for `team_key` hashing + expiry, linked from this PR (H-2)
- [ ] 🟠 Replace the `trust proxy` comment with a per-request credential resolution guard (H-3)
- [ ] 🟡 Clamp and sanitise `aiMetadata.description` server-side (M-4)
- [ ] 🟡 Fix the rate limiter: shared store, v7 API, `standardHeaders`, cheap pre-auth tier (M-1/2/3)
- [ ] 🟡 Mount `auth.chartLimit()` on `/mcp` (M-5)
- [ ] 🟡 Refactor `chartHelpers.update` to an options object (M-8)
- [ ] 🟡 Add a `typecheck` script to `@everviz/server` (L-5)
- [ ] ⚪ Apply the ponytail cut list (−120 lines)

---

*Reviewed against head `7f6f2f0`. Line references are approximate for files whose base branch differs from the
PR's current target; re-verify after U-3 is addressed.*
