# WhatsApp for Executor

Tool-only Executor app plus a Mac companion wrapping an app-scoped wacli build. This branch is a draft, not a deployment. Existing service, account state, Executor connections and schedules are untouched.

## Connection model

The app declares app-scoped `whatsapp: bridge.many()`. Executor supplies all linked native accounts as `ctx.app.accounts.whatsapp`; it does not invoke the handler once per account. Each connection has its own token. The provider fields are token-only, with human-readable labels in Executor's account metadata.

`connections()` lists native Executor connection IDs. Exactly one linked connection is the default; when multiple are linked, ordinary tools require `connectionId`. Unknown IDs, no links and ambiguous omissions fail closed. There is no tool/schedule argument for a local account slot. Responses identify the native connection and omit the companion's local routing field.

`syncAll()` explicitly refreshes monitoring data across linked connections in sequence and reports each result separately. The source-declared interval uses this operation. Pairing, removal and other operations never implicitly fan out. To operate on either of two numbers, choose its native connection ID from `connections()` or Executor's account metadata, not a local directory name.

The selected connection's token goes to the companion, which chooses its isolated HOME by bearer. Optional legacy body account values must still match; they never select another HOME/job/media directory. The approval gates and media containment remain intact. Native account routing does not establish companion-verifiable native app/approval attestation; that mode remains fail-closed in mac-companion.

## Deployment and setup boundary

The existing deployed app is WhatsApp (`whatsapp`), `app_cfa39380-6372-4902-8cbf-b97a085363da`, at https://executor.netanelgilad.com/org/executor/apps/app_cfa39380-6372-4902-8cbf-b97a085363da. Its previously observed deployment is `dpl_abad4cc2-eec5-4f01-a1f9-bfedab837a8a`. This branch does not update it.

The production companion currently listens on 18871 through `com.netanelgilad.whatsapp-executor`. This draft targets the shared `host.lima.internal:18873/whatsapp/v1/call` endpoint. It can be deployed only after a verified WhatsApp-only shared phase and its new native connections are ready. The running old companion requires the legacy body field, so deploying this source alone would fail. See [the SDK/cutover findings](docs/sdk-account-model.md).

Only `app/` is deployed to Executor; exclude its `node_modules/` and fixture `test/` source from upload. `app/skills/whatsapp/SKILL.md` and router instructions describe capabilities and approval requirements without local account choices. `companion/` remains on the Mac, with config and private account HOME directories in place.

A read-only deployed `appAccounts.appGet` returned no compatible saved WhatsApp accounts for the current provider. The user now authorizes a narrow local process to forward existing companion credentials directly into Executor's supported accounts.submit endpoint, without transcript/stdout/artifacts. The shared repo's `scripts/migrate-credentials.mjs` implements and fixture-tests this route. The slack-rpc adapter uses an existing Cursor/mcp-remote OAuth bearer; its real local submit probe returned **401**. No companion credential was read/submitted, no new management key was minted, and no connection request was created. Actual registration/cutover remains blocked on existing valid API submit authority. No cookie/vault/DB bypass, clipboard helper or token-bearing tool call is allowed.

## Tools, monitoring and approval

`account` inspects identity and cache freshness. `messagesCached` and `search` read cache. `status`, `sync`, `chats`, `groups`, `messages` and `listen` perform bounded monitoring. `jobStatus` reads bounded background progress. CLI operations retain `args: string[]` and supported flags; no shell interpolation occurs.

Media writes, pairing/removal, public QR serving and pairing-output disclosure require explicit approval. Unknown commands/options, duplicate flags, invalid bounds and paths outside the authenticated account fail closed. No send command exists. Pairing/removal must never be used as acceptance tests.

Borrowed-session monitoring refreshes its read-only source cache and reports cached-only, with timestamps and unverified coverage. It does not open another upstream socket. Independently paired identities can sync upstream; completion requires a persisted final-history event. Neither a connection nor a cache timestamp proves complete history.

The new source declares one `monitoringSync` schedule invoking explicit monitoring-only `syncAll`, without local account inputs. The previous source's two slot-specific schedules are not changed in the live deployment. An eventual supervised deployment must review those saved schedules and replace/retire them through supported operations, without replaying uncertain work.

## Offline verification

```sh
npm test
npm ci --ignore-scripts --prefix app
npm run typecheck --prefix app
npm run test:fixture --prefix app
```

The SDK fixture drives the actual pinned host handler into a disposable local HTTP companion. Synthetic many-account bindings route by native connectionId to different local HOME directories, with a tested singleton default and ambiguous/unknown-ID rejection. It verifies every advertised tool schema, schedule input, approval rejection before outbound work, invalid bearers and both directions of legacy account mismatch. Process execution is stubbed; no real configs, sessions, databases, WhatsApp connections or provider operations are used.

The older `test/real-read.mjs`, `test/bridge-read.mjs` and `test/unattended-sync.mjs` depend on live initialized state; do not run them for this change. [Round-one acceptance](docs/acceptance-round-1.md) is historical evidence and its slot/clipboard instructions are superseded.

Vendor source provenance and retained isolation rules are unchanged. No customer acceptance, successful new connection, deployment or real no-paste migration is claimed. The shared cutover scripts and mirrored findings live in `mac-companion/`; `docs/sdk-account-model.md` includes their staging/readiness details.

The [subsequent credential route audit](docs/credential-route-matrix.md) verified MCP authority separately: the daemon OAuth source authenticates to local MCP and full accounts.submit reaches validation. Therefore REST 401 is not proof that no programmatic registration route exists. No credential values were supplied, no pending connection created and no real save attempted; the existing cutover scripts remain staged and REST-only.
