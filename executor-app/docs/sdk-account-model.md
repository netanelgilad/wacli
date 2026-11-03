# Native accounts, local credential forwarding and staged cutover

Evidence is grounded in `../upstream/executor` at `executor@2.0.0-beta.33` / `apps@0.0.1-beta.116`, deployed metadata/source APIs, and local synthetic fixtures. No live database was opened or edited. No credential entered stdout, transcript, argv or an artifact. Existing OAuth state was read only by the narrowly scoped local probe; no cookies, vault, token refresh or new management key were used.

## A. Multiple native accounts

`packages/sdk/src/implementation/linked-accounts.ts`, `resolveScope`, resolves **all linked accounts** for `.many()`. It does not run a handler once per account. `packages/apps/src/implementation/host.ts`, `bindScope`, binds the array to `ctx.app.accounts.<requirement>` or `ctx.user.accounts.<requirement>`. Plain requirements bind one object; switching WhatsApp to plain lost the intended two-number access and is superseded by this revision.

A real deployed example was read from Agent Hub's active version `dpl_7e0704a7-80ef-464a-a137-937954b8ecd5` through `apps.source(version)` (not merely its working tree): `index.ts` declares `slack.many()`, and `messaging.ts` takes `ctx.user?.accounts.slack ?? []`, iterates it and picks the account whose `auth.test` workspace matches the configured destination. That loop is authored app selection, not Executor fan-out. No Slack request or message was made to investigate it.

WhatsApp PR #2 now declares app-scoped `whatsapp: bridge.many()` again. The app's manager links both connections for everyone. Each account in `ctx.app.accounts.whatsapp` supplies an Executor `id`, auth `method` and typed `fields`. Account labels are metadata in Executor; the handler account contract does not supply a label, so this draft selects only by native ID.

- `connections()` lists linked Executor `connectionId` values without contacting WhatsApp.
- With exactly one linked connection, it is the documented default.
- With multiple links, ordinary tools require `connectionId`; omission and unknown/unlinked IDs fail before outbound work. No arbitrary first account is chosen.
- There is no local account argument or local-slot selector. Companion response routing fields are stripped from app results and replaced by the native `connectionId`.
- `syncAll()` is an explicit sequential monitoring fan-out, with separate success/failure per connection. The one source-declared interval uses it. Pairing, removal, media disclosure and all other operations never implicitly fan out.
- The credential schema is token-only, with labels stored as native account metadata. The selected token alone maps to the companion HOME; optional legacy body account values must still match, and cannot choose another HOME/job/media path.

The pinned-SDK fixture invokes the actual host handler and a disposable HTTP companion with two synthetic bindings. It verifies both IDs, ambiguous/unknown/empty selections, singleton defaults, token isolation, approval gates and explicit monitoring fan-out. Skill text explains tools and native-ID semantics, never local slots. No device was paired, removed or sent a message.

## Provider identity and grants

`packages/sdk/src/implementation/provider.ts`, `identifyProvider`, derives identity from canonical definition JSON **excluding hosts**. Provider name, secrets-method label, field schema/exposure, OAuth settings and placements are included; object keys are sorted and array order retained. No credential hashes were queried or computed.

Port changes 18871→18873 (WhatsApp) and 4139→18873 (Agent Hub) alone preserve provider identity. WhatsApp's removal of the old plain account credential field creates a new provider. Changing cardinality changes the requirement, not the provider. Native connection labels are not provider declaration labels.

`grantedHosts` intersects app hosts with the account's saved allowed hosts. `connection-target.ts`, `applyConnectionTarget`, regrants hosts when a supported connection completes for the deployed target; merely linking again does not expand a grant. A reconnect can retain an unchanged provider's account ID and links. WhatsApp's corrected provider needs new compatible connections; its currently deployed old provider returned no compatible saved accounts to the caller.

## B. Authorized narrow credential route and exact blocker

The user now explicitly permits a narrow Mac-local process to forward an existing companion credential directly into Executor's supported `accounts.submit` endpoint. This replaces the earlier conclusion that this memory-only forwarding itself was disallowed. It does **not** authorize printing a value, putting it in an artifact or tool argument, reading cookies/a vault, bypassing DB permissions or minting a management key.

The slack-rpc adapter is `../atlas-mac-rpc-bridge/executor-adapter.mjs` (`instinct-slack-rpc`). Its LaunchAgent has no environment credential. It invokes pinned `mcp-remote@0.15.2` for the fixed Executor MCP URL using the existing Cursor OAuth cache. The discovered credential type is **OAuth bearer**, not an established API management key. The script resolves only that URL's cache entry with the pinned tool's cache algorithm; filenames, access/refresh values and untrusted HTTP bodies are never printed. It never refreshes or rewrites the cache.

`scripts/migrate-credentials.mjs` has a default `--fixture` dry run and explicit `--probe`. The real probe targets **http://127.0.0.1:4400**: GET `/api/context`, then the exact supported submit route with an invalid-authority control and a randomly generated nonexistent connection. The submit handler checks ownership/existence before any save, so the authority probe cannot create/update an account.

**Observed real result: the existing OAuth bearer received HTTP 401 from accounts.submit.** Authentication to the local management submit API was not established. The release's bearer validator distinguishes MCP/API audiences and requires `executor` scope for API grants; MCP access alone does not imply that authority. The probe does not claim whether this particular rejection is expiry versus grant/audience suitability, and does not try to fix it with refresh, another token store, cookies, a new key or a DB edit.

Consequently no real connection was created/submitted, no companion credential file was opened by the probe, and no app version was deployed. The exact remaining blocker is **an already-authorized, currently valid API submit authority available to this narrow local process**. The existing slack-rpc bearer failed that gate. No-paste forwarder implementation and redaction are fixture-verified; actual migration remains unproven.

Once that gate genuinely passes, the helper also verifies the pending connection's app, requirement, expiry, token-only schema and exact destination host before sending the matching credential. WhatsApp requires two distinct target connection IDs. Agent Hub permits only its known token/baseUrl schema and pinned shared/original endpoint for cutover/rollback. Responses and errors are never echoed; output is an allowlist of fixed event codes and numeric HTTP status. Hostile fixture responses/errors that echo synthetic credentials remain redacted. There is no arbitrary destination, cookie fallback, secret lookup output, refresh or automatic submission retry.

## C. Two phases and Agent Hub readiness

The shared LaunchAgent is **unloaded**, configured with `MAC_COMPANION_MODULES=whatsapp`. This phase reads only the original WhatsApp config/HOMEs, refuses overlap on 18871, and does not load Agent Hub or hub.sqlite. The absent-hub-root startup fixture passed while the real 4139 service remained running. The real service was never activated.

WhatsApp source is prepared for `host.lima.internal:18873/whatsapp/v1/call`. After authentication is verified, an authorized controller can stop only the old 18871 companion, load this WhatsApp-only phase, deploy the reviewed `.many()` app, create its two native connection requests, use the local helper for submission, and verify identity plus cached reads for both native IDs. Keep the previous deployment and original LaunchAgent for rollback. Because authentication failed, none of those real cutover actions occurred.

Agent Hub is staged separately in `scripts/cutover-agenthub.mjs`, with `com.netanelgilad.mac-companion.cutover.plist` **not loaded**. Only launchd may own its live supervisor/worker PIDs. It requires a private metadata-only plan with old/new deployed version IDs and separate pending cutover/rollback connection IDs, a verified existing API authority, and a healthy old hub plus a running WhatsApp-only shared phase. It activates the prepared app version via the supported API, forwards the retained credential/baseUrl locally, stops 4139, restarts the shared service with `all`, and checks health plus a deployed read.

On errors it attempts all recovery steps: restore the shared WhatsApp phase, restart the original hub, restore the old Executor version and original endpoint through supported APIs, and check the original/deployed reads. A launchd-owned supervisor handles worker exit or a bounded timeout; cooperative termination triggers recovery. Recovery failures report `rollback_incomplete`, not success. Management revocation, whole-supervisor SIGKILL, power loss and host failure cannot be claimed fully recoverable. No state DB is copied, restored or edited by the controller.

Injected fixtures cover success and each forward-stage failure, preflight refusal, and incomplete rollback. `verify-cutover-launchd.mjs` actually executed those fixtures through a separate temporary launchd job and removed it afterward. It never stopped an original service. Both installed production plists pass plutil.

**Readiness: staged and fixture/launchd verified; operationally blocked.** The real `--check` refused on the same API-authority gate. There is no prepared new live deployment or pending-connection plan, and the WhatsApp phase is not live. Port 4139 was not stopped, and hub.sqlite was not opened.

## Docker route and preservation

Existing Colima uses the VZ/shared network. Docker DNS inside the actual Executor container network namespace resolved `host.lima.internal` to `192.168.5.2`. Existing 18871 returned unauthenticated 401. Temporary synthetic 18873 listeners on both 127.0.0.1 and 0.0.0.0 returned the exact fixture marker/200 through that namespace. Default **127.0.0.1:18873** therefore works here; an all-interface bind, tunnel or published port is unnecessary. Existing private-fetch permission and per-account host grants remain required. Fixtures were closed.

Original WhatsApp 18871, Agent Hub 4139 and GrokBot-owned Wolt 4147 remain untouched. No Wolt calls, new management key, vault/cookie access, production DB access, device pairing/removal or sends occurred. Draft PRs only; no merge or live cutover is claimed.
