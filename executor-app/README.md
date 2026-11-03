# WhatsApp for Executor

Tool-only Executor app plus a Mac companion wrapping an app-scoped wacli build. This branch is a draft, not a deployment. Existing service, account state, Executor connections and schedules are untouched.

## Connection model

The app declares a single app-scoped `whatsapp` requirement. Executor supplies it as `ctx.app.accounts.whatsapp` to every handler. The requirement uses the connection linked for the app by its manager; callers do not supply account selectors. Tools take only their operation arguments. The provider's sole credential field is `token`; a human-readable connection label is Executor account metadata, not a credential or routing field.

The selected connection's token is sent to the companion. The companion selects its isolated local HOME from the authenticated bearer, never a caller's account argument. Existing clients may still send a legacy body account, but it must match the bearer-selected account or the request is refused. Tokens cannot access another account's HOME, jobs or media paths. The change does not establish independently verifiable Executor-native app/approval authentication; existing bridge approval assertions remain the transition protocol.

The published SDK `apps@0.0.1-beta.116` supports this token-only schema. Changing the previous credential schema creates a new provider identity; changing `.many()` to a plain requirement changes cardinality, not provider identity. One app instance now uses one platform-bound connection. Using separate connections side by side requires separately linked app copies or an explicitly designed collection workflow, not invented local selectors in tools.

## Deployment and setup boundary

The existing deployed app is WhatsApp (`whatsapp`), `app_cfa39380-6372-4902-8cbf-b97a085363da`, at https://executor.netanelgilad.com/org/executor/apps/app_cfa39380-6372-4902-8cbf-b97a085363da. Its previously observed deployment is `dpl_abad4cc2-eec5-4f01-a1f9-bfedab837a8a`. This branch does not update it.

The production companion currently listens on 18871 through `com.netanelgilad.whatsapp-executor`. The app source still targets that endpoint; the shared-service URL change is a separate reviewed cutover described in [the SDK/cutover findings](docs/sdk-account-model.md). Both companion implementations must accept accountless requests before the corrected app can be activated. The running old companion currently requires the legacy account field, so deploying only this app source would fail. Do not activate this draft or restart a service to work around that boundary.

Only `app/` is deployed to Executor; exclude its `node_modules/` and fixture `test/` source from upload. `app/skills/whatsapp/SKILL.md` and router instructions describe capabilities and approval requirements without local account choices. `companion/` remains on the Mac, with config and private account HOME directories in place.

A read-only deployed `appAccounts.appGet` returned no linked or compatible saved WhatsApp accounts for the current provider. A new connection form/API completion is required, and the submitted `fields` must contain the token. There is no demonstrated built-in local CLI/API path that registers the existing local credential without reading/transferring its value. Do not run the historical clipboard helper, inspect private token files, submit secret-bearing tool arguments, create connection requests, or pair a device as part of this draft. No-paste registration remains blocked; see the exact gap in the findings.

## Tools, monitoring and approval

`account` inspects identity and cache freshness. `messagesCached` and `search` read cache. `status`, `sync`, `chats`, `groups`, `messages` and `listen` perform bounded monitoring. `jobStatus` reads bounded background progress. CLI operations retain `args: string[]` and supported flags; no shell interpolation occurs.

Media writes, pairing/removal, public QR serving and pairing-output disclosure require explicit approval. Unknown commands/options, duplicate flags, invalid bounds and paths outside the authenticated account fail closed. No send command exists. Pairing/removal must never be used as acceptance tests.

Borrowed-session monitoring refreshes its read-only source cache and reports cached-only, with timestamps and unverified coverage. It does not open another upstream socket. Independently paired identities can sync upstream; completion requires a persisted final-history event. Neither a connection nor a cache timestamp proves complete history.

The new source declares one `monitoringSync` schedule without account inputs. The previous source's two slot-specific schedules are not changed in the live deployment. An eventual supervised deployment must review those saved schedules and replace/retire them through supported operations, without replaying uncertain work.

## Offline verification

```sh
npm test
npm ci --ignore-scripts --prefix app
npm run typecheck --prefix app
npm run test:fixture --prefix app
```

The SDK fixture drives the actual pinned host handler into a disposable local HTTP companion. Synthetic bound connections route to different local HOME directories without any account input. It verifies every advertised tool schema, schedule input, approval rejection before outbound work, invalid bearers and both directions of legacy account mismatch. Process execution is stubbed; no real configs, sessions, databases, WhatsApp connections or provider operations are used.

The older `test/real-read.mjs`, `test/bridge-read.mjs` and `test/unattended-sync.mjs` depend on live initialized state; do not run them for this change. [Round-one acceptance](docs/acceptance-round-1.md) is historical evidence and its slot/clipboard instructions are superseded.

Vendor source provenance and retained isolation rules are unchanged. No customer acceptance, successful new connection, deployment or no-paste migration is claimed.
