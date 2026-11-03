# WhatsApp for Executor

Tool-only Executor app plus a Mac companion wrapping an app-scoped wacli build.
Customer: Instinct. No sends, pairing or unlinking were executed. A live round-1 sync probe timed out; borrowed-session monitoring now uses read-only source snapshots.

## Deployment

- App: WhatsApp (`whatsapp`)
- ID: `app_cfa39380-6372-4902-8cbf-b97a085363da`
- Dashboard: https://executor.netanelgilad.com/org/executor/apps/app_cfa39380-6372-4902-8cbf-b97a085363da
- Deployed version: `dpl_abad4cc2-eec5-4f01-a1f9-bfedab837a8a`
- Runtime: `com.netanelgilad.whatsapp-executor` LaunchAgent; authenticated companion on port 18871, reachable from Executor's container through `host.lima.internal`.
- App source: `app/`; only that directory is deployed to Executor. The companion, private data and executable stay on the Mac.
- Private state: `.private/`, excluded from Git. Two independent HOME directories, media directories and per-account bearer tokens. The companion credential binds each request to exactly one account.

## Account setup — human gate

Connect two **Local companion account** credentials to the app's `whatsapp` collection using Executor's secure connection form. Use `account-1` / `account-2` as the account field and each corresponding locally generated token. Never paste tokens into chat. Run `node companion/copy-token.mjs account-1` to copy only that token to the Mac clipboard, then paste it into the secure form.

Account 1 is a snapshot of the existing session/cache. Its identity comes from `creds.me.id`, reported privately to the owner; this is local identity evidence, not a network identity check. No assumption is made about personal/work labels. Account 2 is empty and its identity is unresolved. After connecting its companion credential, the human may explicitly authorize `link({account:'account-2',args:[]})`, poll `jobStatus` for its private QR, scan on the second phone and then inspect `account`. Pairing remains a separate human action; never pair for acceptance testing.

The source session and store are never used as a working directory. Initialization snapshots them and verifies source hash/size/mtime before and after. All subsequent operations target the copies. No global wacli install, migration or configuration change is required. A copied linked-device identity must not open a concurrent connection. Account 1 uses a read-only source-cache snapshot for unattended monitoring; independent upstream sync requires a separately paired app-owned session.

## Tools and approvals

Every tool has an explicit `account` selector. CLI tools take `args` as a string array, preserving supported flags and `--key=value` forms. Unknown commands/options, duplicate flags, invalid bounds and cross-account paths fail closed. No shell interpolation occurs.

See [acceptance round 1](docs/acceptance-round-1.md) for the authoritative per-tool effect/gating table and evidence. Routine monitoring reads and sync run unattended. Media writes, pairing/removal and pairing-output disclosure remain gated. All paths are confined per account; unsupported commands fail closed.

## Sync

Independent app-owned sessions report completed only after persisted final-history evidence. Borrowed account 1 refreshes its cache from the original store without opening a second WhatsApp connection and always reports cached-only, source timestamp and observation timestamp. Neither cached reads nor snapshot refresh prove complete upstream history.

Account 1's 15-minute user schedule is enabled in automatic mode with an approval-free scoped sync operation. Account 2's schedule remains disabled until setup. Credential connection is still required before the scheduler can reach the companion.

## Source provenance

PR https://github.com/netanelgilad/wacli/pull/1 was verified at `18eba53d76422072aece02b2e0ed117f0046d7f7`. Its source supplies DM registry recovery and NFC/case-insensitive, ambiguity-safe name lookup. `vendor/wacli` is pinned to that commit with the separately source-tested history-sync changes copied from `wacli-install-18eba53`, plus account media containment. No existing checkout was changed.

The reference https://app.notion.com/p/3f4cc156818981fcaaebdb62e75df7fd explicitly distinguishes October 25 source-tested sync fixes from deployment. We verified the edited files and six sync tests locally; historical deployment/acceptance is not assumed.

## Verification

Run `npm test`, `npm test --prefix vendor/wacli`, and TypeScript checks in `app` and `vendor/wacli`. `test/real-read.mjs` reads one actual cached record but prints aggregates only and rechecks original files. `test/bridge-read.mjs` verifies HTTP authentication, both directions of account-token isolation, blocked unapproved media writes, and an actual cached read. These scripts require local initialized private state; no test sends or pairs.

Acceptance remains pending for Instinct, secure Executor account connection, deployed end-to-end reads and scheduled delivery. The app has no custom UI. Never treat successful deployment or tool discovery as customer acceptance.

Preservation evidence: initialization and the first real-read check verified all original files unchanged. A later long-interval check detected three changed original files while the pre-existing global `wacli listen` process was active. That listener was left untouched; the per-invocation test now snapshots immediately before the read. No claim is made that the original store remains frozen while its own listener runs.
