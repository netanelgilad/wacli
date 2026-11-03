# Deployed account model and cutover findings

Observed 2026-11-03 against `../upstream/executor` release tag `executor@2.0.0-beta.33`, matching deployed `apps@0.0.1-beta.116`. All live inspection was read-only. No private credential/session/hash value was read, copied or printed. No connection, deployment, schedule or running service was changed.

## Handler context and cardinality

Release source:

- `packages/apps/src/contracts/{context,app}.ts`: app requirements bind at `ctx.app.accounts.<requirement>`; user requirements bind at `ctx.user.accounts.<requirement>`. App-scope background work has no user context. An account object has `id`, auth `method` and schema-decoded `fields`; the ID is an Executor account ID, not a local companion directory.
- `packages/sdk/src/implementation/linked-accounts.ts`: calls never choose accounts. A plain requirement resolves its linked account; ordinarily at most one is linked. If a many-to-plain deployment leaves multiple historical links, `plainAccount` selects the newest, not an arbitrary caller input. `.many()` resolves every linked account, potentially none, as an array. An invocation therefore does not universally choose exactly one connection per requirement.
- `packages/apps/src/implementation/host.ts`, `bindScope`: validates provider definition/auth method and decodes fields, then binds one object for plain or an array for `.many()`.
- With declared hosts, unmarked string fields are opaque credential handles in app code. Executor's outbound runtime substitutes their stored values only at allowed destinations. `plain()` would expose a nonsecret field directly; it is unnecessary here. `label` is separate account metadata supplied to the connection API, not in `fields`.

This draft keeps the existing shared app scope, switches the requirement to plain, and uses `ctx.app.accounts.whatsapp.fields.token` solely in the companion Authorization header. No tool or schedule input contains an account selector. The companion's authenticated bearer resolves the local account and therefore its HOME. Native connection routing is distinct from companion-verifiable Executor-native authorization, which remains blocked in mac-companion.

## Provider identity and host grants

`packages/sdk/src/implementation/provider.ts`, `identifyProvider`: canonicalize sorted JSON object keys and derive the provider ID from the definition with **hosts removed**. Name, auth method labels, field schemas/exposures, OAuth scopes and credential placements are included. Array order remains significant. The source's digest algorithm was inspected; no real credential or token hash was computed or queried.

Thus changing only 18871 to 18873 does **not** create a provider for WhatsApp. The same is true for Agent Hub's hosts-only change from 4139 to 18873. Removing WhatsApp's old `account: plain(string())` field **does** change provider identity and makes old-schema accounts incompatible. Connection metadata label changes do not change the provider; changing the secrets-method declaration's label does.

Host identity stability does not expand access: `grantedHosts` intersects app-declared hosts with the account's `allowedHosts`. `connection-target.ts`, `applyConnectionTarget`, updates that grant only when a supported connection completes for the deployed target. Linking an existing account by metadata alone does not regrant hosts. A reconnect of an unchanged provider can retain account ID and links; a schema/provider change needs a new compatible connection.

## No-secret-extraction cutover by app

**WhatsApp:** first stage the accountless companion protocol in an authorized maintenance window, without changing its bearer-to-HOME map or private files. Deploy the corrected app only after that protocol is available. Token-only fields require a new provider/connection. Read-only `appAccounts.appGet` currently returned `scope: app`, `cardinality: many`, `accounts: []`: even the old provider has no compatible saved account for this caller to link. On an eventual shared-service deploy, declare 18873 before creating the new connection so it receives the correct host grant. The label can describe the connection without a local slot. Link/create via the supported app-account workflow only after a supported non-extracting credential delivery mechanism exists. None was established in this task.

**Agent Hub:** keep its provider definition and existing companion account. Hosts-only edits preserve identity, but existing allowed hosts remain at 4139, and the saved plain `baseUrl` also targets the old companion. Reconnect through the supported connection workflow can retain ID/links and regrant hosts. However `accounts.submit` requires the complete secrets fields, including token and baseUrl; `accounts.update` edits only label/description. No supported “reuse stored secret while changing baseUrl/host grant” operation was found. Under the current prohibition on extracting/transferring secrets, that cutover is blocked too. Do not manufacture a DB edit, wider grant, credential echo or unverified proxy workaround.

Neither path was executed. An ordinary secure-form paste is not proof of the requested no-paste path.

## Docker to Mac reachability

Docker uses the existing Colima `default` VM (macOS Virtualization.Framework / `vz`, shared network) and network `executor-selfhost_default`. Lima's generated config enables hostResolver and aliases `host.docker.internal` to `host.lima.internal`. A DNS query to Docker's 127.0.0.11 resolver inside the actual Executor container network namespace returned `192.168.5.2` for `host.lima.internal`.

A VM curl in that exact container network namespace reached existing `http://host.lima.internal:18871/v1/call` and received 401 without credentials. The production WhatsApp listener is bound to `*:18871`. Separately, a temporary synthetic-only HTTP listener was bound to 18873 first on `127.0.0.1`, then on `0.0.0.0`; both requests from the Executor container network namespace through 192.168.5.2 returned the exact fixture marker and HTTP 200. No real companion handler or credentials were used. Both fixtures were closed, leaving 18873 unused.

Therefore mac-companion can retain its safer default **127.0.0.1:18873** on this actual Colima route. An all-interface bind is not required. No Docker publish, tunnel, forwarding process or network reconfiguration was added. The existing operator setting `EXECUTOR_APPS_ALLOW_PRIVATE_FETCH=true` permits app requests to this private host; provider/account host grants must still authorize the exact port. Transport reachability does not prove a deployed app has the new grant.

## Registration gap

The deployed API offers `appAccounts.appConnect` to create a pending form and `POST /api/organizations/:organization/connections/:connection/submit` (`accounts.submit`) with `{method,label?,fields}`. `AccountFieldsInput` is redacted JSON, not a local-file/keychain/credential reference. Submission validates the complete secrets schema; `accounts.replaceCredentials` replaces every field, with no preserve-existing-token sentinel. No stored secret is returned in account metadata.

The shipped CLI (`packages/app-management/src/cli.ts`) supports apps login/list/source/deploy/etc.; its `credential` command is a Git credential helper, not an app-provider secret importer. It does not register a local WhatsApp account by a nonsecret local ID. The existing companion likewise has no issuer/token-exchange/bootstrap flow that Executor can complete without an existing token.

A raw API submission could register a token if someone supplied its value, but reading a private token file and piping it into that API still extracts/transfers a secret and violates this task. There is no supported no-paste registration established for the existing local account-1 credential. The exact missing capability is a scoped local credential broker/provider sign-in or host-supported reuse/secure-import operation that can deliver the existing credential directly into the intended Executor connection without the agent reading/copying it. No such mechanism was implemented or simulated as a successful connection.

The historical clipboard helper is not the solution and was not invoked. No live connection request was created merely to investigate its contract.
