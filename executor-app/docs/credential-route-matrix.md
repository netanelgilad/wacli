# Verified credential route matrix — 2026-11-03

Scope: authentication and schema validation only. No live connection creation/linking/submission, credential-field payload, OAuth flow, browser/form interaction, production DB access, new key, cookie/vault access or service change occurred. The daemon's existing bearer stayed inside the local HTTP process; no credential or session value was printed or written to an artifact. The audit client cannot send valid mutating inputs or arbitrary code; its offline guard fixture passed.

## Corrected conclusion

**REST 401 did not establish an absence of programmatic authority.** After an MCP initialize handshake, the daemon's existing OAuth credential source authenticated to `http://127.0.0.1:4400/mcp`. Initialize and tools/list returned HTTP 200. The direct MCP tools are `skills`, `search`, `describe`, `call`, `execute`, `resume`; credential operations are nested Executor app tools invoked through the `call` gateway.

The Executor app's native linked service account is separately an **existing apiKey account**, verified by projecting method metadata only through local MCP; its value was never read. Release `apps/hosted/server/src/implementation/executor-app.ts` binds `context.user.accounts.service` to its management API router. Thus a daemon MCP bearer and the Executor app's selected management credential are different authorization layers. Passing the MCP bearer directly to REST is not equivalent to invoking the management app through MCP.

No successful credential save is claimed. “Auth yes” below means local MCP accepted the request and the candidate returned a projected **validation error** for deliberately incomplete input; this meets the requested auth-only test. It does not prove every valid-input ownership/policy/approval check, nor test credential retention across every observability hop.

## Matrix

| Route | Authority | Works | Evidence | Blocker / limit |
| --- | --- | --- | --- | --- |
| Direct REST accounts.submit | Daemon OAuth bearer directly | No, as previously tested | HTTP 401 on 127.0.0.1:4400; not rerun | This bearer was not accepted by REST; no conclusion about MCP authority |
| MCP tools.executor.accounts.submit | Daemon MCP OAuth → Executor app's existing native service account | **Auth yes; full-save path exposed** | HTTP 200, completed call, missing-input validation; full fields schema S below | Owned pending connection, provider schema and policy still apply; no credential payload or save attempted |
| MCP tools.executor.appAccounts.userConnect | Same MCP/app layering | Auth yes; request-creation only | HTTP 200 + validation error; schema C | Creates pending metadata/form, not credentials; completion is UI **or the submit tool above** |
| MCP tools.executor.appAccounts.appConnect | Same, with app-management permission required | Auth yes; request-creation only | HTTP 200 + validation error; schema C | No credentials/prefill in input; permission and target checks untested with valid inputs |
| MCP tools.executor.appAccounts.userLink | Same, with account-use/link permission | Auth yes; existing-account only | HTTP 200 + validation error; schema L | Requires an existing saved compatible account; cannot import a new local token |
| MCP tools.executor.appAccounts.appLink | Same, plus app-edit permission | Auth yes; existing-account only | HTTP 200 + validation error; schema L | Cannot create credential material or expand its host grant merely by linking |
| MCP tools.executor.accounts.checkCredentials | Same | Auth yes; **not persistence** | HTTP 200 + validation error; schema V | Validation/health is not account-store registration; no provider call made |
| MCP tools.executor.accounts.startOAuth / completeOAuth | Same | Auth yes; OAuth-specific | Both HTTP 200 + validation errors; schemas O | Not a static-token importer for the companions' secrets method; no OAuth flow started |
| executor.execute code-mode | Daemon MCP OAuth, server-hosted interpreter | Runs; **no direct Mac filesystem** | Live globals all undefined; node:fs/promises import returned inaccessible | Only exposed app tools provide outside capabilities; not a local credential-file reader |
| Secure pending form | Existing signed-in UI; or MCP submit for programmatic completion | No automatic prefill established; **MCP completion candidate exists** | Connect schema has no credential/prefill field; form state starts empty; submit API is not browser-only | No form created/opened or repeated browser probe; no human paste required merely by the submit API contract |

## Deployed input schemas (normalized without descriptions/default organization metadata)

These are the application/json branches observed from Executor's own tools.list through local MCP. Full paths start `tools.executor.`. All shown route objects reject extra properties. `organization` is optional on every path; `contentType?: "application/json"` is optional on body-bearing tools. The enclosing `path` and `body` are required where shown.

```ts
// S — accounts.submit: the full-credential persistence candidate
{
  path: { organization?: string, connection: `con_${string}` },
  body: { method: string, label?: string | null, fields: Record<string, unknown> },
  contentType?: "application/json"
}

// C — appAccounts.userConnect and appAccounts.appConnect
{
  path: { organization?: string, app: `app_${string}`, requirement: string },
  body: {
    account?: `acc_${string}` | null, // existing native account to reconnect
    destination?: { kind: "personal" } | {
      kind: "shared",
      audience: { kind: "everyone" } | { kind: "groups", groups: string[] }
    } | null
  },
  contentType?: "application/json"
}

// L — appAccounts.userLink and appAccounts.appLink
{
  path: { organization?: string, app: `app_${string}`,
          requirement: string, account: `acc_${string}` }
}

// V — accounts.checkCredentials (no save)
{
  path: { organization?: string, app: `app_${string}` },
  body: { provider: `prv_${string}`, method: string, fields: Record<string, unknown> },
  contentType?: "application/json"
}

// O — accounts.startOAuth
{
  path: { organization?: string, connection: `con_${string}` },
  body: { method: string, label?: string | null,
    client?: { id: string } | { automatic: true } |
             { clientId: string, clientSecret?: string | null } | null },
  contentType?: "application/json"
}
// O — accounts.completeOAuth
{
  path: { organization?: string, connection: `con_${string}` },
  body: { callbackUrl: string }, contentType?: "application/json"
}
```

Strings carry their deployed nonempty/ID constraints; group IDs are nonempty and groups has maxItems 1000. `fields` is intentionally provider-specific JSON and is validated against the pending connection's provider. No field values were supplied. The auth-only payloads were `{}` or `{path:{}, body:{}}`, so they cannot create a pending request or perform a link/save.

The complete native account-tool inventory contained: accounts.check, checkCredentials, completeOAuth, connection, disconnect, get, oauthSetup, startOAuth, submit, update; appAccounts.appConnect, appGet, appLink, appList, appUnlink, userConnect, userGet, userLink, userList, userUnlink. Of those, submit is the full static-credential save path. Metadata update and checks do not replace it. No valid mutating call was made.

## Owning-store semantics and limits of the audit

Grounded at `executor@2.0.0-beta.33`:

- `apps/hosted/server/src/contracts/accounts.ts`: accounts.submit accepts redacted credential JSON and is under **RequireOrganization**, annotated manage. It is not under the separate browser-only RequireUser group used by OAuth browser callbacks.
- `apps/hosted/server/src/implementation/accounts.ts`, submitConnection: verifies the caller owns the pending connection before SDK completion.
- `packages/sdk/src/implementation/account-connections.ts`: submit checks the open connection/target and calls accounts.add or replaceCredentials; completion saves/link metadata transactionally.
- `packages/sdk/src/implementation/accounts.ts`: fields are validated and encrypted with credentials.encrypt before storing encryptedCredentials on the owning account record. The success result is account metadata, not credential fields.

This is a supported owning-account-store path, not storing values in arbitrary tool output, console logs, a generic app record, or code-mode source. The audit did not deliver a real value or certify complete real-input logging/retention behavior. Under the current explicit payload ban, no secret-bearing submission or code-mode workaround is authorized. The existing REST-only migrator/cutover remains staged; it was not switched to a new live secret transport in this audit.

## Actual code-mode placement and filesystem behavior

The requests went to the local Docker-published Executor MCP endpoint. The live container runs the beta.33 image with executor-host and two workerd processes. Docker mount inspection showed only the executor-data volume at `/app/data`, with no Mac source/home bind. Release self-host routes wire MCP into that product, and `packages/mcp/src/implementation/execute.ts` invokes `@opencode-ai/codemode`'s CodeMode.make(...).execute(code) server-side; there is no Mac-side evaluation in the audit client.

Live execute returned `undefined` for process, fetch, require, Bun, Deno and globalThis. A separate ordinary dynamic-import probe caught failure for `node:fs/promises` and returned filesystemModuleAccessible:false. No path containing secrets was attempted, no filesystem escape was attempted, and no module was installed. This is a **container-hosted restricted interpreter**, not a container shell or Mac filesystem API. It can reach the Mac only through capabilities an authorized app tool explicitly exposes.

## Secure form and external-change conclusion

MCP submit is a genuinely new completion signal. Source inspection, without a new form/browser request, shows `packages/ui/src/implementation/dashboard/account-form.tsx` initializes values to `{}` and requires complete field values before submit. The connect input has neither token fields nor a local credential-reference/prefill option. There was no evidence justifying another live secure-form attempt, and none occurred. Cookie reading, clipboard transfer, stored-token retrieval and user paste were not used.

**Not every route fails on the installed version:** the authenticated MCP full-submit tool is present and reaches validation. No new Executor feature, management key or human browser finish has been shown necessary merely to obtain programmatic submit authority. A real safe no-paste save remains unexecuted by instruction. If a later requirement prohibits all credential-bearing MCP arguments as well, the needed addition would be a narrowly scoped secret-reference/broker ingress whose only persistence is the targeted account store; this audit does not claim that extra feature already exists or silently substitute general logs/source as storage.

All staged cutover work is preserved. Neither shared LaunchAgent nor the Agent Hub cutover job was loaded. No service was stopped, no deployment was made, and no Wolt call occurred.
