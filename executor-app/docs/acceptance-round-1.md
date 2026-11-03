# Acceptance round 1

Deployed version: `dpl_abad4cc2-eec5-4f01-a1f9-bfedab837a8a`.

Shared effect policy: `app/effects.ts`, consumed by both Executor and the Mac companion.
Monitoring scope covers reading the selected account's messages/chat metadata and maintaining its private cache. It does not authorize sending, pairing/removal, arbitrary destinations or writes outside that account's HOME.

| Tools | Actual effects and limits | Gate |
|---|---|---|
| account | Read local identity/cache status; no network verification claimed | None |
| messagesCached, search | Read monitoring records; borrowed accounts refresh a cache snapshot | None |
| messages | Same records; independent accounts may connect and maintain session/cache | None unless `--include-media` |
| status, chats, groups | Read upstream metadata for independent accounts, cached metadata for borrowed accounts; scoped cache/session maintenance | None |
| sync | Independent account history pull; borrowed account read-only source-cache snapshot | None, including schedule |
| listen | Bounded receive-only monitoring; borrowed accounts poll source cache every 5 seconds | None |
| download; messages --include-media | Download attachments and write confined media files | Approval |
| link | Establish account pairing; --serve also publishes QR through upstream tunnel | Approval |
| unlink | Delete selected private session/cache | Approval |
| jobStatus | Monitoring output; hides pairing material by default | Approval only for includePairingMaterial=true |
| send (not present upstream) | Sending is blocked by socket guard; no arbitrary command escape | Unavailable, never executed |

## Borrowed-session isolation correction

A filesystem copy still has the original WhatsApp linked-device identity. An initial round-1 connection probe ran against the app copy and reached the history wait timeout; it did not prove sync completion. The global listener's prior PID disappeared and a replacement listener was subsequently observed. Causation was not established; the agent did not stop or restart that process or write the original store/session.

To avoid future connection displacement, account 1 now has a fixed `monitoringSource` configured locally. Its routine tools only read that source cache and write a separate app cache. Sync returns `cached-only`, `upstreamSyncCompleted:false`, source mtime and observation time. It never presents snapshot refresh as completed upstream sync. The source's own listener determines upstream freshness. A separately paired app-owned device would be needed for independent upstream history sync; no pairing was executed.

Media downloads use cached attachment metadata directly, without opening a second device connection. They still require approval and stay inside the account media directory. An approved unlink removes only the app session/cache and clears its borrowed-source configuration, permitting a subsequent separately approved new pairing.

## Tests

- 16 upstream regressions; 8 wrapper/effect/snapshot/job tests passed.
- Build and TypeScript checks passed.
- Unattended real read through authenticated companion: passed with no approval header.
- Unattended real snapshot-sync: HTTP 200, ok=true, cached-only with timestamps and no upstream-completion claim.
- Material media effects rejected without approval; opposite-account token selection rejected; unlinked routine monitoring does not pair.
- Original files unchanged during immediate before/after isolated read verification. The original listener may independently update them between tests.
- Deployed messages/sync calls no longer pause for approval; they reached the missing-account setup check before any companion request.
- The leftover test request was cancelled with Executor resume(action=cancel), returning ApprovalCancelled. It was not replayed or executed.

## Connection / owner handoff

The original Executor connection remains pending and expires 2026-11-03 10:12:21.902 UTC. Its provider identity was preserved across deployment, so the request remains compatible. It saves a companion token and account selector, not WhatsApp credentials and not a new pairing.

`companion/copy-token.mjs` reads only locally generated companion credentials and pipes the selected token to pbcopy. It neither prints the token nor touches global wacli. It has not been run to leave a token on the clipboard. Account 1 token authentication was validated internally by HTTP tests without logging it.

Browser automation was unavailable (browser access host unavailable; native Chrome returned cgWindowNotFound), and no authenticated local Executor CLI was available. Therefore the remaining owner action is to open the secure form, enter account-1 and paste its token using the copy-token helper, submit, then clear the clipboard. No credentials need to be sent in chat. End-to-end Executor read/sync and successful scheduler delivery remain blocked on that connection; Instinct acceptance is not claimed.
