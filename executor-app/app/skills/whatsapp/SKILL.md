---
name: whatsapp
description: Inspect WhatsApp identity, monitor chats and messages, refresh cached history, and manage bounded monitoring jobs.
---

Use `account` to inspect identity, link state and cache freshness. `messagesCached` and `search` read cached history without connecting to WhatsApp. `status`, `chats`, `groups`, `messages`, `sync` and `listen` perform bounded monitoring; `jobStatus` reads a monitoring job's progress.

A cache timestamp or a connected status does not prove history synchronization completed. Borrowed-session monitoring refreshes a read-only source snapshot and reports cached-only coverage.

Media downloads and media-file writes require approval. Pairing, session removal, public QR serving and pairing-material disclosure require explicit human approval. Never invoke pairing or removal as a test, and never approve on behalf of a human. This app provides no send command or arbitrary filesystem access.
