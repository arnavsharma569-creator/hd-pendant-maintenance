# Firestore Schema

## Overview

All collections use the typed collection pattern — see `frontend/src/lib/firebase/firestore.ts`.
Security rules are in `firebase/firestore.rules`.

When adding a new collection, use the `/firebase-collection` Claude Code skill.

## Schema versioning

Every document in every collection **must** include a `_schemaVersion` field:

```typescript
_schemaVersion: 1  // increment when doing a breaking schema change
```

This enables **lazy migration** — when a document is read, check `_schemaVersion` and migrate on the fly if it's behind current. See the `/evolve-schema` skill for the full migration workflow.

**Rules:**
- `_schemaVersion` is always `1` on creation
- Non-breaking changes (adding optional fields with defaults) keep the same version
- Breaking changes (rename, remove, type change) increment the version and require a migration function
- Never remove `_schemaVersion` from a schema

---

## `users` collection

**Path:** `/users/{userId}`
**Access:** Owner-only (user can read/write their own document; admins can read all)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `uid` | `string` | Yes | Firebase Auth UID (same as document ID) |
| `email` | `string` | Yes | User's email address |
| `displayName` | `string \| null` | Yes | Display name from Auth or profile |
| `photoURL` | `string \| null` | Yes | Profile photo URL |
| `role` | `'user' \| 'admin'` | Yes | User role — immutable by user after creation |
| `createdAt` | `Timestamp` | Yes | When the document was created |
| `updatedAt` | `Timestamp` | Yes | When the document was last updated |
| `_schemaVersion` | `1` | Yes | Schema version for lazy migration |

**Creation:** Auto-created by `AuthProvider` on first sign-in via `syncUserProfile()`.
**Deletion:** Hard-delete is disabled in security rules. Use `deletedAt` field for soft-delete.

---

<!-- Add new collection schemas below using the /firebase-collection skill -->

## Maintenance requests (feature stage 1)

Two feature collections are added; the starter's `users` collection remains unchanged.
The five pendant IDs P001–P005 are synthetic fixed choices, not a new collection.

### `maintenanceRequests/{autoId}`

| Field | Type | Meaning |
| --- | --- | --- |
| pendantId | string | P001–P005 |
| problemType | string | NO_SIGNAL, BATTERY, DAMAGE or OTHER |
| description | string | Trimmed input, 10–500 characters |
| status | string | OPEN, IN_PROGRESS or COMPLETED |
| createdBy | string | Authenticated creator's UID; immutable |
| createdAt | Timestamp | Server time of creation; immutable |
| updatedAt | Timestamp | Server time of the latest status change |
| lastHistoryId | string | Document ID of the matching latest history entry |
| _schemaVersion | 1 | Initial schema version |

### `statusHistory/{requestId}_{toStatus}`

| Field | Type | Meaning |
| --- | --- | --- |
| requestId | string | Parent maintenance request ID |
| fromStatus | string or null | null for creation, otherwise previous status |
| toStatus | string | New status |
| changedBy | string | Creator's authenticated UID |
| changedAt | Timestamp | Server time of this change |
| _schemaVersion | 1 | Initial schema version |

Creation saves an OPEN request and its null-to-OPEN history record in one batch.
Updates read the current request inside a transaction, check the expected status,
then save both the status and its history. Only OPEN to IN_PROGRESS to COMPLETED
is allowed. The caller supplies the expected status to reject stale button clicks.
Deterministic history IDs prevent duplicate entries for a status.

Rules use getAfter to validate both sides of each atomic write; neither standalone
status changes nor invented history entries are permitted. Only the creator can
read or change a request. History cannot be edited or deleted. Completed requests
cannot change, and requests cannot be deleted. Rules reject unknown fields, invalid
pendants, invalid problem types and blank/short/long descriptions. The client trims
surrounding whitespace; rules also require at least one non-whitespace character.

Queries must include createdBy == current user UID for requests, and changedBy ==
current user UID for history. A history query can also filter by requestId; sorting
these small demo results in memory avoids needing a composite index.

Multiple requests for the same pendant are allowed. Request editing/deletion,
shared staff access and one-active-request enforcement are outside this scope.
Deploy only Firestore rules (not Functions) before using the feature against Firebase.

### Running the isolated security checks

The normal app still uses real Firebase. A separate emulator configuration is only
for automated rule checks; it does not change firebase.json or load .env.
With Node 22+ and Java 21+ installed, run from the repository root:

```bash
pnpm dlx firebase-tools@15.34.1 emulators:exec --only firestore --project demo-pendant-maintenance --config firebase/emulator.json 'node --test frontend/tests/firestore/maintenance.rules.mjs'
```

The first run downloads the testing tool and emulator. Expected permission-denied
messages are assertions that invalid writes are blocked, not failed tests.
Implementation reference: [Firebase atomic writes and getAfter rules](https://firebase.google.com/docs/firestore/manage-data/transactions#data_validation_for_atomic_operations).
