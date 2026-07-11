# Multi-Tenant Access Management Platform with Rate Limiting

A production-grade backend platform where multiple organizations share the same application
and database, with complete data isolation enforced through three independent layers —
a Hibernate session-level filter, a service-layer ownership assertion, and JWT-derived
tenant context that is never accepted from the client. The platform also enforces
per-organization API rate limits using a Redis-backed token bucket, protecting the system
from abuse while allowing legitimate short bursts of traffic.

Built with Java 21, Spring Boot 3.4.5, Spring Security, Redis, and React.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Features](#features)
- [Architecture](#architecture)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Test Coverage](#test-coverage)
- [Design Decisions](#design-decisions)
- [Build Progress](#build-progress)
- [Known Issues & Open Questions](#known-issues--open-questions)
- [Setup and Running Locally](#setup-and-running-locally)
- [Live Demo](#live-demo)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | Java 21 |
| Framework | Spring Boot 3.4.5 |
| Security | Spring Security, JWT (HS384), BCrypt |
| Persistence | Spring Data JPA, Hibernate, MySQL |
| Rate Limiting | Redis, atomic Lua script, Token Bucket algorithm |
| Frontend | React (Vite), Axios |
| Infrastructure | Docker, Docker Compose |
| Testing | JUnit 5, Spring Boot Test |

---

## Features

- Multi-tenant architecture with shared schema and complete row-level data isolation
- JWT-based stateless authentication with org-scoped token claims
- Data-driven RBAC — organizations define custom roles and assign permissions at runtime without any code change
- Invitation-based user onboarding with single-use UUID tokens and 48-hour expiry
- Immutable audit logging for all mutations via AOP — no manual logging in service code
- Per-organization rate limiting using a Redis-backed token bucket, enforced atomically through a Lua script
- Self-service usage endpoint so any authenticated user can check their organization's remaining quota without consuming it
- Self-service organization info endpoint so the frontend can display real org metadata (name, slug, creation date) without hardcoding it

---

## Architecture

### Tenant Isolation — Three Independent Layers

**Layer 1 — Hibernate @Filter**
Applied at the session level. Every query against tenant-scoped tables automatically includes
`WHERE org_id = :orgId`. The filter is enabled before any repository call via an AOP @Before
advice, using the orgId extracted from the JWT.

**Layer 2 — Service-layer ownership assertion**
On every fetch-by-ID, the service calls `findByIdAndOrgId` rather than `findById`. If the
record exists but belongs to a different org, the result is empty and the service throws a
`ResourceNotFoundException`. The caller receives 404, not 403.

**Layer 3 — org_id never accepted from client**
The org context is read exclusively from the JWT principal (`CurrentUserContext`). No endpoint
accepts `orgId` as a request body field or query parameter.

A 403 confirms a resource exists but is inaccessible — leaking information to an attacker.
A 404 reveals nothing. All cross-tenant access returns 404.

---

### Request Pipeline

```
HTTP Request
    |
JwtAuthFilter          — validates JWT, builds CurrentUserContext as Spring Security principal
    |
RateLimitFilter         — checks org's token bucket in Redis, rejects with 429 if exhausted
    |
TenantFilter            — extracts orgId from JWT, sets TenantContext (ThreadLocal)
    |
TenantFilterConfig      — AOP @Before enables Hibernate tenant filter before every repository call
    |
@PreAuthorize            — CustomPermissionEvaluator checks userId -> roleIds -> permissionCode
    |
Service Layer            — business logic, orgId always from CurrentUserContext
    |
AuditAspect               — AOP @AfterReturning writes audit log after successful mutations
```

`RateLimitFilter` runs immediately after authentication and before tenant context setup or any
business logic. This is a deliberate fail-fast ordering — a request that will be rejected for
exceeding its quota should be rejected as early as possible, before the system does any further
work on it.

---

### Data-Driven RBAC

Roles and permissions are runtime data, not hardcoded enums. An org admin creates roles,
assigns permissions to them, and assigns roles to users through API calls. The permission
check resolves at runtime:

```
userId -> UserRole -> roleIds -> RolePermission -> permissionCode
```

Enforced via a custom `PermissionEvaluator` wired into `@PreAuthorize("hasPermission(null, 'PERMISSION_CODE')")`.

The 13 system-level permissions (final, since Phase 6c — supersedes the original 9-permission
catalog above; ROLE_ASSIGN was split three ways, and USER_DEACTIVATE was separated from
USER_INVITE):

| Code | Description |
|---|---|
| RESOURCE_CREATE | Create resources |
| RESOURCE_READ | Read resources |
| RESOURCE_UPDATE | Update resources |
| RESOURCE_DELETE | Delete resources |
| ROLE_CREATE | Create roles |
| ROLE_DELETE | Delete roles |
| ROLE_READ | Read roles |
| ROLE_MANAGE | Assign/unassign roles to and from users |
| PERMISSION_MANAGE | Add/remove permissions on a role |
| ADMIN_TRANSFER | Transfer admin ownership to another user |
| USER_INVITE | Send, list, and revoke invitations |
| USER_DEACTIVATE | Deactivate a user |
| AUDIT_VIEW | View audit logs |

A role may hold zero permissions (both at creation and after removing its last one) — this is
deliberate, modeled on AWS IAM/K8s RBAC's empty-policy-object pattern, and every listing
endpoint's OR-gate is designed so no permission is ever a dead end (see Phase 6c/7 below).

---

### Invitation Flow

```
Admin calls POST /api/invitations
    |
System creates Invitation row — UUID token, 48hr expiry, status PENDING
    |
Token returned in API response (no email in this project)
    |
Invitee calls POST /api/auth/accept-invitation with token + chosen password
    |
@Transactional block:
    — validate token (exists, PENDING, not expired)
    — create User row
    — create UserRole row
    — mark Invitation ACCEPTED
    |
JWT returned immediately — invitee is logged in without a separate login call
```

---

### Audit Logging

All mutations are logged automatically via `AuditAspect` — an AOP `@AfterReturning` advice
that fires after any controller method returns successfully. The aspect reads the actor's
identity from the `SecurityContext`, maps the method name to an action string, and writes
an `AuditLog` row. Service methods contain zero audit logging code.

The one exception is `USER_JOINED` — logged manually inside `AuthService.acceptInvitation`
because the accept-invitation endpoint is public and has no JWT principal in the SecurityContext.

Actions logged automatically via AOP:

| Action | Trigger |
|---|---|
| INVITE_SENT | sendInvitation() |
| RESOURCE_CREATED | createResource() |
| RESOURCE_UPDATED | updateResource() |
| RESOURCE_DELETED | deleteResource() |
| ROLE_CREATED | createRole() |
| ROLE_ASSIGNED | assignRoleToUser() |
| PERMISSION_ASSIGNED | assignPermissionToRole() |
| PERMISSION_REMOVED | removePermissionFromRole() |
| ADMIN_TRANSFERRED | transferAdmin() |
| USER_DEACTIVATED | deactivateUser() |
| INVITE_REVOKED | revokeInvitation() |
| ROLE_DELETED | deleteRole() |
| ROLE_UNASSIGNED | unassignRoleFromUser() |

**Fixed during testing:** `entityId` originally showed `0` for every create-style action
(`RESOURCE_CREATED`, `INVITE_SENT`, `ROLE_CREATED`) because the aspect only inspected the
method's *arguments* — but create endpoints take a request DTO with no ID, since the entity's
ID doesn't exist until after the save. The fix adds a `returning` clause to `@AfterReturning`
so the aspect can also inspect the method's *return value*, reflectively reading `getId()` off
the response body (unwrapping `ResponseEntity` first) before falling back to argument-scanning
for update/delete-style methods where the ID is a path variable instead. `transferAdmin` was
also resolving to `entityType: "UNKNOWN"` since its method name matched none of the existing
substring checks — fixed by adding an explicit case.

Actions logged manually:

| Action | Trigger |
|---|---|
| USER_JOINED | acceptInvitation() — no JWT principal available on public endpoints |

---

### Rate Limiting — Token Bucket

Each organization is allocated a request quota defined by `requestLimitPerMinute` on the
`Organization` entity, defaulting to 100 requests per minute. This quota is enforced using a
token bucket algorithm backed by Redis.

**How the bucket works**

Every organization has a bucket holding up to `requestLimitPerMinute` tokens. Tokens refill
continuously at a constant rate of `limit / 60` tokens per second, rather than resetting all
at once at a fixed interval. Each incoming request consumes one token. If no tokens remain,
the request is rejected with `429 Too Many Requests`.

This continuous refill model was chosen over a fixed-window counter because it avoids the
boundary spike problem inherent to fixed windows, where a burst of traffic at the edge of one
window and the start of the next can momentarily double the effective rate. It also naturally
tolerates short bursts of legitimate traffic — such as a client syncing several records at
once — without requiring a separate burst allowance.

**Atomicity**

The read, refill calculation, limit check, and token decrement are all performed inside a
single Lua script executed atomically on Redis. This eliminates the race condition that would
otherwise occur if two concurrent requests for the same organization both read the token count
before either one writes back the decremented value — a classic check-then-act bug under
concurrent load.

**Redis key structure**

```
ratelimit:{orgId}:tokens      — current token count (decimal, refilled lazily on read)
ratelimit:{orgId}:refill_at   — Unix timestamp of the last token calculation
```

**Response on rejection**

```json
{
    "status": 429,
    "message": "Rate limit exceeded"
}
```

Headers:

```
Retry-After: 60
X-RateLimit-Remaining: 0
```

**Usage endpoint**

`GET /api/usage` lets any authenticated user check their organization's current quota status
without consuming a token. This endpoint is explicitly excluded from `RateLimitFilter` — a
client checking how much quota remains should never be penalized for checking. The endpoint
independently recalculates the live refilled token count from the stored values rather than
returning a stale snapshot, so it always reflects the true state of the bucket at the moment
of the call.

---

## Database Schema

| Table | Purpose |
|---|---|
| organizations | Tenant root — name, slug, status, requestLimitPerMinute |
| users | Scoped per org — email unique per org, not globally |
| roles | Org-scoped custom roles |
| permissions | Global permission catalog (system-level, not org-scoped) |
| role_permissions | Maps permissions to roles |
| user_roles | Maps roles to users |
| resources | Tenant-scoped business objects — name, optional description, owner |
| invitations | Token-based invite flow with 48hr expiry and single-use enforcement |
| audit_logs | Immutable append-only change history |

Rate limiting state is not persisted in MySQL. Token counts and refill timestamps live
entirely in Redis, since this data is ephemeral by nature and does not require durability —
if Redis is restarted, every organization simply starts with a full bucket again.

---

## API Endpoints

### Auth — public, no JWT required

| Method | Endpoint | Description |
|---|---|---|
| POST | /api/auth/register-org | Register organization and bootstrap admin account |
| POST | /api/auth/login | Login and receive JWT |
| POST | /api/auth/accept-invitation | Accept invitation, create account, receive JWT |

**POST /api/auth/register-org**

Request:
```json
{
    "orgName": "Acme Corp",
    "adminEmail": "alice@acme.com",
    "password": "password123"
}
```

Response `201`:
```json
{
    "message": "Organisation registered successfully",
    "orgSlug": "acme-corp"
}
```

**POST /api/auth/login**

Request:
```json
{
    "email": "alice@acme.com",
    "password": "password123",
    "orgSlug": "acme-corp"
}
```

Response `200`:
```json
{
    "token": "eyJhbGci...",
    "orgSlug": "acme-corp",
    "orgName": "Acme Corp",
    "orgId": 1,
    "userId": 1,
    "email": "alice@acme.com"
}
```

**POST /api/auth/accept-invitation**

Request:
```json
{
    "token": "d48a7b74-86d7-4996-bbf8-f8e301ec4364",
    "password": "password123"
}
```

Response `200` — same shape as login response. Invitee receives a usable JWT immediately
without needing to make a separate login call.

---

### Resources — JWT required

| Method | Endpoint | Permission |
|---|---|---|
| POST | /api/resources | RESOURCE_CREATE |
| GET | /api/resources | RESOURCE_READ or RESOURCE_UPDATE or RESOURCE_DELETE |
| GET | /api/resources/{id} | RESOURCE_READ |
| PUT | /api/resources/{id} | RESOURCE_UPDATE |
| DELETE | /api/resources/{id} | RESOURCE_DELETE |
| GET | /api/resources/search?name= | RESOURCE_READ |

Note: RESOURCE_CREATE is deliberately NOT in the GET /api/resources gate — a
RESOURCE_CREATE-only user can create but not view the list, matching the frontend, which never
attempts this fetch for such a user (Resources.jsx gates the list/table on RESOURCE_READ
independently of the create button). Confirmed by a dedicated regression test.

**POST /api/resources**

Request:
```json
{
    "name": "Primary Database",
    "description": "Main production database"
}
```

Response `201`:
```json
{
    "id": 1,
    "orgId": 1,
    "name": "Primary Database",
    "description": "Main production database",
    "ownerUserId": 1,
    "createdAt": "2026-06-29T12:00:00"
}
```

**PUT /api/resources/{id}**

Request:
```json
{
    "name": "Primary Database — Updated",
    "description": "Updated description"
}
```

Response `200` — same shape as the create response with updated fields.

**DELETE /api/resources/{id}**

Response `204 No Content` — no body returned.

**GET /api/resources?page=0&size=10**

`GET /api/resources` is paginated. `page` is 0-indexed (Spring convention) and `size`
defaults to 10 if omitted.

Response `200`:
```json
{
    "content": [
        {
            "id": 1,
            "orgId": 1,
            "name": "Primary Database",
            "description": "Main production database",
            "ownerUserId": 1,
            "createdAt": "2026-06-29T12:00:00"
        }
    ],
    "totalElements": 23,
    "totalPages": 3,
    "number": 0,
    "size": 10
}
```

Results are sorted by `createdAt` descending. The frontend converts between its own
1-indexed page display and this 0-indexed API at the point of the request — the backend
stays on Spring's native convention rather than shifting it to match the UI.

**GET /api/resources/search?name=database**

Response `200`:
```json
[
    {
        "id": 1,
        "orgId": 1,
        "name": "Primary Database",
        "description": "Main production database",
        "ownerUserId": 1,
        "createdAt": "2026-06-29T12:00:00"
    }
]
```

Results are filtered by name within the caller's org only. Search results are not paginated —
this endpoint returns the full matching set.

---

### Roles — JWT required

| Method | Endpoint | Permission |
|---|---|---|
| POST | /api/roles | ROLE_CREATE |
| GET | /api/roles | ROLE_READ or ROLE_MANAGE or PERMISSION_MANAGE or ADMIN_TRANSFER or ROLE_DELETE or ROLE_CREATE or USER_INVITE |
| POST | /api/roles/{roleId}/assign/{userId} | ROLE_MANAGE |
| DELETE | /api/roles/{roleId}/unassign/{userId} | ROLE_MANAGE |
| POST | /api/roles/{roleId}/permissions/{permissionId} | PERMISSION_MANAGE |
| DELETE | /api/roles/{roleId}/permissions/{permissionId} | PERMISSION_MANAGE |
| GET | /api/roles/{roleId}/permissions | ROLE_READ or PERMISSION_MANAGE |
| POST | /api/roles/transfer-admin/{newUserId} | ADMIN_TRANSFER |
| DELETE | /api/roles/{roleId} | ROLE_DELETE |

`GET /api/roles` is deliberately the widest OR-gate in the system — every permission whose
action targets a role by ID needs this page reachable, including USER_INVITE (to populate the
invitation role-picker). See Phase 6c/7 below for why each of these was added.

**POST /api/roles**

Request:
```json
{
    "name": "ReadOnly"
}
```

Response `201`:
```json
{
    "id": 2,
    "name": "ReadOnly",
    "orgId": 1,
    "createdAt": "2026-06-29T12:00:00"
}
```

**POST /api/roles/{roleId}/assign/{userId}**

No request body. Both `roleId` and `userId` are path variables.

Response `200` — confirms role assigned to user.

**POST /api/roles/{roleId}/permissions/{permissionId}**

No request body. Both `roleId` and `permissionId` are path variables.

Response `204 No Content` — no body returned.

**DELETE /api/roles/{roleId}/permissions/{permissionId}**

No request body. Both `roleId` and `permissionId` are path variables.

Response `204 No Content` — no body returned.

**GET /api/roles/{roleId}/permissions**

Response `200`:
```json
[
    {
        "id": 2,
        "code": "RESOURCE_READ",
        "description": "Can read resources"
    }
]
```

**POST /api/roles/transfer-admin/{newUserId}**

No request body. Transfers the Admin role from the caller to `newUserId` in a single
transactional operation — the caller loses Admin, the target user gains it. There is exactly
one Admin per organization at all times.

Response `204 No Content` — no body returned.

---

### Admin Role Governance

Two system-guaranteed roles are bootstrapped per organization at registration: **Admin** (all
13 permissions, immutable) and **No Access** (zero permissions, immutable) — added in Phase 6c
as the landing role for an outgoing Admin after transfer. Both are subject to the same
invariants, enforced in `RoleService`:

**1. Both system roles' permission sets are immutable.** `assignPermissionToRole` and
`removePermissionFromRole` reject any attempt to modify either role's permissions with
`400 "System roles (Admin, No Access) cannot have their permissions modified"`.

**2. Both system roles are undeletable.** `deleteRole` rejects deletion of either with
`400 "System roles (Admin, No Access) cannot be deleted"`.

**3. There is exactly one Admin per organization, and it moves by transfer, not direct
assignment.** `assignRoleToUser`/`unassignRoleFromUser` reject any direct attempt to assign or
remove the Admin role with `400`, directing the caller to transfer-admin instead.
`POST /api/roles/transfer-admin/{newUserId}` atomically: assigns No Access to the outgoing
admin (guaranteeing they never pass through a zero-role state), removes Admin from them, then
promotes the target — all inside one `@Transactional` block.

**No forced logout on transfer (changed in Phase 6c/7).** Earlier design forced the outgoing
admin to re-login after a transfer (see the corresponding note in Design Decisions below, kept
for historical context but no longer accurate). Since `CustomPermissionEvaluator` re-derives
permissions live from the database on every request rather than trusting the JWT, this was
found to be unnecessary friction — removed in favor of an in-place refresh
(`AuthContext.loadPermissions()` + `loadRoleNames()`) immediately after a successful transfer.

---

### Invitations — JWT required

| Method | Endpoint | Permission |
|---|---|---|
| POST | /api/invitations | USER_INVITE |
| GET | /api/invitations | USER_INVITE |
| DELETE | /api/invitations/{invitationId} | USER_INVITE |

**POST /api/invitations**

Request:
```json
{
    "email": "bob@acme.com",
    "roleId": 2
}
```

Response `201`:
```json
{
    "id": 4,
    "token": "9f0ab181-eed3-47e1-8a04-750b2a6ac0a7",
    "email": "bob@acme.com",
    "expiresAt": "2026-07-01T13:28:55.317"
}
```

`id` is the invitation record's own primary key (not a user ID), included so the audit log can
correctly attribute an `entityId` to `INVITE_SENT` entries. This is only ever returned to the
org admin who is sending the invitation — a `USER_INVITE`-gated endpoint — never to the invitee,
who receives the invitation out-of-band and never calls this endpoint at all. Since that same
response already includes the far more sensitive `token`, including `id` alongside it exposes
nothing new to anyone who wasn't already trusted with more.

**Found and fixed via UI review, not testing:** neither `sendInvitation` nor `acceptInvitation`
originally checked whether the invitation's `roleId` referred to the Admin role. This meant the
single-Admin invariant enforced everywhere else (`assignRoleToUser`, `transferAdmin`) had a
completely separate, unguarded bypass — anyone with `USER_INVITE` could invite a new user
directly into the Admin role, and `acceptInvitation` would honor it without question, producing
a second Admin and breaking the entire governance model. Fixed with the same defense-in-depth
pattern used elsewhere: `sendInvitation` now rejects Admin-role invitations at send time, and
`acceptInvitation` independently re-checks at accept time (covering the edge case where a role
is renamed to "Admin" after an invitation was already sent but before it was accepted).

`roleId` is rejected with `400` if it refers to the Admin role — found during frontend review as
a real bypass of the single-admin invariant, since `assignRoleToUser`/`transferAdmin` were
guarded but the invitation path was not. See Admin Role Governance below.

**GET /api/invitations**

Lists pending invitations for the caller's org.

Response `200`:
```json
[
    {
        "id": 4,
        "email": "bob@acme.com",
        "roleName": "ReadOnly",
        "status": "PENDING",
        "expiresAt": "2026-07-01T13:28:55.317"
    }
]
```

Note this returns a different shape than the send response — no `token` field, since a
list of everyone currently invited should not expose raw invitation tokens. Includes `id`
(needed to revoke) and `roleName` (resolved server-side from `roleId`) instead.

**DELETE /api/invitations/{invitationId}**

Revokes a pending invitation by deleting it outright — there is no separate "revoked" status
in the `InvitationStatus` enum, since a cancelled invite has no further use. Only invitations
still in `PENDING` status can be revoked.

Response `204 No Content` — no body returned.

---

### Users — JWT required

| Method | Endpoint | Permission |
|---|---|---|
| GET | /api/users | ROLE_READ or ROLE_MANAGE or ADMIN_TRANSFER or USER_DEACTIVATE |
| GET | /api/users/basic-info | None (self-serve, id + email only) |
| GET | /api/users/me-permissions | None (self-serve, caller's own permissions only) |
| GET | /api/users/me-roles | None (self-serve, caller's own role names only — added Phase 6c/7) |
| PATCH | /api/users/{userId}/deactivate | USER_DEACTIVATE |

**GET /api/users**

Lists all members of the caller's organization along with their assigned role name(s). This
endpoint reuses `ROLE_READ` rather than introducing a new permission code — seeing who holds
which role is part of the same "reading role assignments" concern the permission already
covers, and the permission catalog is deliberately fixed at 9 codes.

Response `200`:
```json
[
    {
        "id": 2,
        "email": "priya@acme.com",
        "status": "ACTIVE",
        "roles": ["ReadOnly"],
        "createdAt": "2026-06-29T12:51:47.842596"
    }
]
```

Used by the frontend to populate the Transfer Admin member picker, and to derive
"active members" and "members per role" counts without a separate aggregation endpoint.

**GET /api/users/basic-info**

Response `200`:
```json
[
    { "id": 2, "email": "priya@acme.com" }
]
```

Returns only `id` and `email` for every user in the caller's org — no roles, no status, nothing
sensitive. Added so that the Resources owner column and the Audit log actor column can resolve
a real email address instead of a bare user ID, without depending on `ROLE_READ`. Deliberately
has no `@PreAuthorize` — see Design Decisions.

**GET /api/users/me-permissions**

Response `200`:
```json
["RESOURCE_READ", "RESOURCE_CREATE"]
```

Returns the caller's own merged permission codes, resolved across every role they hold. Also
has no `@PreAuthorize` by design — its entire purpose is answering "what am I allowed to do"
before any specific permission is known, so it can't depend on already having one. See Design
Decisions and Build Progress (Phase 6b) for the bug this fixed.

**PATCH /api/users/{userId}/deactivate**

Soft-deletes a user by setting `status` to `DISABLED` rather than removing the row. Reuses
`USER_INVITE` — deactivating is treated as the symmetric opposite of inviting, both being the
same "manage who's in the org" concern.

No request body.

Response `204 No Content` on success. Rejected with `400` in three cases:
- Caller attempts to deactivate their own account ("Cannot deactivate your own account")
- Target user currently holds the Admin role ("Cannot deactivate the current Admin — transfer
  admin rights first")
- Target user is already `DISABLED` ("User is already deactivated")

`404` if the target user doesn't exist or belongs to a different org.

A disabled user's credentials still exist but `AuthService.login` rejects them with the same
generic `"Invalid credentials"` message used for a wrong password — not a distinct "account
disabled" message — so a login attempt cannot be used to probe whether a given email
corresponds to a deactivated account.

---

### Organizations — JWT required

| Method | Endpoint | Permission |
|---|---|---|
| GET | /api/organizations/me | Any authenticated user |

**GET /api/organizations/me**

Returns basic metadata about the caller's own organization. Unlike every other endpoint in
this API, it is gated with `@PreAuthorize("isAuthenticated()")` rather than a specific
permission code — seeing your own organization's name, slug, and creation date is not an
administrative concern, it's baseline information every member needs (e.g. to render the
Home dashboard), so it deliberately does not consume one of the 9 fixed permission codes.

Response `200`:
```json
{
    "name": "Acme Corp",
    "slug": "acme-corp",
    "requestLimitPerMinute": 100,
    "createdAt": "2026-02-12T09:14:03.221"
}
```

Added during Phase 6a frontend design review — `Organization.createdAt` existed on the
entity from Phase 0 but was never exposed through any response (`register-org` returns only
`orgSlug`, `login` returns JWT claims). The Home screen design needed a real creation date for
the Organization card, which surfaced the gap.

---

### Audit Logs — JWT required

| Method | Endpoint | Permission |
|---|---|---|
| GET | /api/audit-logs | AUDIT_VIEW |

`GET /api/audit-logs` is paginated. `page` is 0-indexed, `size` defaults to 20 (larger than
Resources' default of 10, since audit rows are short and scanned quickly).

Response `200`:
```json
{
    "content": [
        {
            "id": 6,
            "orgId": 1,
            "actorUserId": 2,
            "action": "USER_JOINED",
            "entityType": "USER",
            "entityId": 2,
            "oldValue": null,
            "newValue": null,
            "timestamp": "2026-06-29T12:51:47.842596"
        },
        {
            "id": 5,
            "orgId": 1,
            "actorUserId": 1,
            "action": "INVITE_SENT",
            "entityType": "INVITATION",
            "entityId": 0,
            "oldValue": null,
            "newValue": null,
            "timestamp": "2026-06-29T12:50:55.089218"
        }
    ],
    "totalElements": 67,
    "totalPages": 4,
    "number": 0,
    "size": 20
}
```

Results are sorted by timestamp descending and scoped to the caller's org. The frontend's
action-type and actor-email filters are applied client-side against the currently loaded page
only — filtering does not span unloaded pages. A production version of this feature would move
filtering server-side via query parameters; kept client-side here since the backend returns
one page at a time by design.

---

### Usage — JWT required, no permission needed

| Method | Endpoint | Description |
|---|---|---|
| GET | /api/usage | Returns the caller's org current rate limit status |

Any authenticated user in an organization can check their org's usage — there is no
restriction by permission, since visibility into remaining quota is not an administrative
concern. This endpoint is excluded from rate limiting itself, so checking usage never
consumes a token.

Response `200`:
```json
{
    "orgId": 1,
    "limitPerMinute": 100,
    "tokensRemaining": 88.33
}
```

`tokensRemaining` is calculated live at the time of the request, reflecting any refill that
has happened since the organization's last rate-limited request, rounded to two decimal
places. A value of `100.0` means the bucket is completely full.

---

### Error Response Shape

All errors return a consistent structure:

```json
{
    "status": 400,
    "message": "Pending invitation already exists for this email",
    "timestamp": "2026-06-29T12:34:28.73396"
}
```

The one exception is the 429 response, which uses a slightly different shape (`status` and
`message` only, no `timestamp`) since it is written directly by `RateLimitFilter` rather than
passing through `GlobalExceptionHandler`.

| Status | Scenario |
|---|---|
| 400 | Validation failure, invalid credentials, business rule violation |
| 401 | No JWT provided on a protected endpoint |
| 403 | Valid JWT but missing required permission |
| 404 | Resource not found or cross-tenant access attempt |
| 409 | Duplicate assignment — role or permission already assigned |
| 429 | Organization has exceeded its rate limit |

---

## Test Coverage

### Phase 1 — Auth

| Test | Expected | Result |
|---|---|---|
| Register org | 201 with message and orgSlug | Passed |
| Login with correct credentials | 200 with JWT | Passed |
| Login with wrong password | 400 Invalid credentials | Passed |
| Login with wrong org slug | 400 Invalid credentials | Passed |
| Login with empty password | 400 validation error | Passed |
| Register duplicate org name | 400 Organization name already exists | Passed |

---

### Phase 2 — Tenant Isolation

| Test | Expected | Result |
|---|---|---|
| Create resource | 201, orgId set from JWT not request body | Passed |
| Get all resources | 200, only caller's org resources returned | Passed |
| Get resource by ID — exists | 200 with resource | Passed |
| Get resource by ID — does not exist | 404 | Passed |
| Update resource | 200 with updated fields | Passed |
| Delete resource | 204 No Content | Passed |
| Search resources by name | 200, results filtered within org | Passed |
| Access another org's resource by ID | 404 not 403 | Passed |

---

### Phase 3 — RBAC

| Test | Expected | Result |
|---|---|---|
| Create role | 201 with role details | Passed |
| Get all roles | 200, only caller's org roles returned | Passed |
| Assign permission to role | 204 No Content | Passed |
| Assign duplicate permission to role | 409 Conflict | Passed |
| Get role permissions | 200 with permission list | Passed |
| Assign role to user | 200 | Passed |
| Access protected endpoint without JWT | 401 | Passed |
| Access protected endpoint with valid JWT but missing permission | 403 | Passed |
| ReadOnly user — GET /api/resources | 200 | Passed |
| ReadOnly user — POST /api/resources | 403 | Passed |

---

### Phase 4 — Invitations + Audit Log

| Test | Expected | Result |
|---|---|---|
| Send invitation to new email | 201 with token and expiresAt | Passed |
| Send invitation to email with pending invite | 400 Pending invitation already exists | Passed |
| Send invitation to existing user's email | 400 User already exists in this organization | Passed |
| Accept valid invitation | 200 with JWT | Passed |
| Accept already-used invitation token | 400 Invitation has already been used | Passed |
| Accept expired invitation token | 400 Invitation has expired | Passed |
| Accept non-existent token | 400 Invalid invitation token | Passed |
| Invited user logs in after account creation | 200 with JWT | Passed |
| Get audit logs as admin | 200 with INVITE_SENT and USER_JOINED entries | Passed |
| Audit logs scoped to org — no cross-org entries visible | 200, isolated results | Passed |
| Get audit logs without AUDIT_VIEW permission | 403 | Passed |

---

### Phase 5 — Rate Limiting

| Test | Expected | Result |
|---|---|---|
| Check usage with empty bucket (new org) | 200, tokensRemaining equals limitPerMinute | Passed |
| Repeated requests within quota | 200 for each request | Passed |
| Sustained burst exceeding quota | 429 once tokens are exhausted | Passed |
| 429 response includes correct headers | Retry-After: 60, X-RateLimit-Remaining: 0 | Passed |
| Token refill under sustained load | Intermittent 200 responses appear between 429s as tokens regenerate | Passed |
| Usage check immediately after exhaustion | tokensRemaining close to 0 | Passed |
| Usage check after waiting | tokensRemaining increases proportionally to elapsed time | Passed |
| Repeated usage checks with no delay | tokensRemaining unchanged — usage endpoint does not consume tokens | Passed |
| Bucket fully refilled after one minute idle | tokensRemaining returns to limitPerMinute | Passed |

---

### Phase 6 — Admin Governance, Extended Endpoints, Pagination

| Test | Expected | Result |
|---|---|---|
| Remove permission from non-Admin role | 204 No Content | Passed |
| Confirm permission removed | 200, permission no longer listed | Passed |
| Remove same permission twice | 404 Permission not assigned to this role | Passed |
| Remove permission from role in another org | 404 | Passed |
| Add permission to Admin role | 400 Admin role permissions cannot be modified | Passed |
| Remove permission from Admin role | 400 Admin role permissions cannot be modified | Passed |
| Directly assign Admin role to a user | 400 Admin role cannot be assigned directly | Passed |
| Confirm Admin retains all 9 permissions after attempts above | 200, 9 permissions unchanged | Passed |
| Non-admin without ROLE_ASSIGN attempts admin transfer | 403 (blocked by @PreAuthorize before reaching the service-layer check) | Passed |
| Admin transfers to self | 400 User is already the Admin | Passed |
| Admin transfers to valid user | 204, old admin demoted, new admin promoted | Passed |
| Confirm exactly one Admin exists after transfer | 200, only new admin has Admin role | Passed |
| Old admin's pre-transfer JWT loses admin access immediately | 403 on admin-only actions, despite JWT still claiming "Admin" — confirms live DB permission checks, not JWT-trusted | Passed |
| List org members | 200, scoped to caller's org, includes roles | Passed |
| List pending invitations | 200, only PENDING status | Passed |
| Revoke pending invitation | 204 | Passed |
| Confirm revoked invitation removed from list | 200, no longer present | Passed |
| Revoke already-accepted invitation | 400 Only pending invitations can be revoked | Passed |
| Revoke invitation from another org | 404 | Passed |
| Revoke non-existent invitation | 404 | Passed |
| Create resource with description | 201, description in response | Passed |
| Create resource without description | 201, description null, no error | Passed |
| Description over 500 characters | 400 validation error | Passed |
| Resource list, default pagination | 200, Page object, page=0 size=10 | Passed |
| Resource list sort order | Sorted by createdAt descending | Passed |
| Cross-tenant resource access by ID | 404 not 403 | Passed |
| Search resources by name (no match) | 200, empty array | Passed |
| Search resources by name (match) | 200, correct result | Passed |
| Audit log, default pagination | 200, Page object, size=20 | Passed |
| Audit log sort order | Sorted by timestamp descending | Passed |
| entityId populated correctly for create actions after fix | Real entity ID instead of 0 | Passed |
| entityType correct for transferAdmin after fix | "USER" instead of "UNKNOWN" | Passed |
| Unauthenticated request returns 401 not 403 | 401, proper JSON body matching standard error shape | Passed (bug found and fixed) |
| Deactivate non-admin user | 204 No Content | Passed |
| Deactivated user cannot log in | 400 Invalid credentials (generic, not "account disabled") | Passed |
| Self-deactivation blocked | 400 Cannot deactivate your own account | Passed |
| Deactivate already-disabled user | 400 User is already deactivated | Passed |
| Deactivate non-existent user | 404 | Passed |
| Cross-tenant deactivation attempt | 404 | Passed |
| Rate limit burst against real endpoint, then check usage | 429 after ~100 requests; /api/usage reflects near-zero tokens; subsequent checks show continuous refill (~1.67/sec) | Passed |
| /api/usage itself excluded from rate limiting under burst | Repeated /api/usage calls stay 200, tokens unaffected | Passed |
| Deactivate current Admin (by a second admin) | Blocked by service-layer guard | Not independently testable — only one Admin exists at a time by design, so this path has no reachable second-admin scenario in current test data |

---

### Phase 6a continued — Organization Self-Info

| Test | Expected | Result |
|---|---|---|
| Get current organization, authenticated | 200 with name, slug, requestLimitPerMinute, createdAt | Passed |
| Get current organization, no JWT | 401 | Passed |

### Phase 6b continued — Permission-Resolution Fix and Display Endpoints

| Test | Expected | Result |
|---|---|---|
| GET /api/users/me-permissions as a user with only RESOURCE_READ (no ROLE_READ) | 200, `["RESOURCE_READ"]` | Passed |
| Resources tab and resource list load correctly for that same user after the frontend fix | Sidebar and page both accessible | Passed |
| GET /api/users/basic-info as a user with no ROLE_READ | 200, array of `{id, email}` | Passed |
| Resources owner column shows an email instead of "User #N" after the frontend fix | Confirmed in browser | Passed |
| Members page action buttons for a role holding ROLE_READ + USER_INVITE only | Deactivate enabled; Make Admin, Assign role, Unassign disabled with a tooltip | Passed |
| Deactivate action for that same role | Succeeds — USER_INVITE is genuinely sufficient per current backend gating | Passed |

---

## Design Decisions

### Why shared schema over schema-per-tenant?

Shared schema scales better operationally. Schema-per-tenant multiplies migration overhead,
connection pool requirements, and monitoring complexity with every new organization. Row-level
isolation via a Hibernate filter gives the same security guarantees with a fraction of the
operational cost.

### Why 404 instead of 403 for cross-tenant access?

A 403 confirms the resource exists but the caller cannot access it — leaking information to an
attacker who can use that signal to enumerate IDs across tenants. A 404 reveals nothing. This is
standard practice in multi-tenant systems where resource existence itself is sensitive.

### Why Hibernate filter over manual per-method scoping?

Manual scoping means every developer must remember to add a tenant check to every new query.
One missed call leaks data across tenants. A Hibernate filter applies automatically at the
session level before any query executes — a single enforcement point that cannot be bypassed
by forgetting to add a WHERE clause.

### Why data-driven RBAC over hardcoded roles?

Hardcoded roles (ADMIN, USER, VIEWER as enums) require a code change and redeployment to modify
access control. Data-driven RBAC lets org admins define roles and assign permissions through the
API at runtime. This is how access control works in real SaaS platforms — the application
enforces the rules, the customer defines them.

### Why invitation-only user onboarding?

There is no open registration endpoint for regular users. The only way to join an organization
is through an admin-initiated invitation. This keeps the org boundary strict and prevents
unauthorized accounts from being created inside a tenant.

### Why AOP for audit logging instead of manual calls?

Manual audit logging inside every service method mixes business logic with cross-cutting concerns.
If a developer adds a new endpoint and forgets to add the audit call, the gap is invisible until
something goes wrong. An AOP @AfterReturning advice intercepts every controller return
automatically — the aspect fires or it does not, with no dependency on developer discipline.

### Why does accept-invitation return a JWT immediately?

The invitation token already proves the caller was legitimately invited. There is no reason to
make the invitee authenticate again on a separate login call immediately after account creation.
The @Transactional block creates the account and returns a usable JWT in a single response.

### Why Redis over an in-memory counter for rate limiting?

An in-memory counter on a single application instance does not scale beyond one server. The
moment the application runs as multiple replicas behind a load balancer, each instance would
track its own separate counter, allowing an organization to receive several times its intended
limit simply by having requests routed to different instances. Redis provides a single shared
source of truth for the counter regardless of how many application instances are running,
which is the same approach used by rate limiters in production SaaS platforms.

### Why token bucket over a fixed-window counter?

A fixed-window counter resets entirely at a clock boundary, which creates a boundary spike
problem — a client can send a full quota of requests in the final second of one window and a
full quota again in the first second of the next, doubling the effective rate for a brief
period. Token bucket avoids this because tokens refill continuously rather than all at once,
so there is no single instant where the available quota suddenly jumps. It also naturally
allows short, legitimate bursts of traffic, which is the access pattern of an authenticated
API client integrating with this platform, rather than the pattern of a public-facing
endpoint that needs to defend against abuse with zero tolerance.

### Why is rate limit configuration not exposed as a self-service setting?

`requestLimitPerMinute` is a field on the `Organization` entity and could technically be
exposed through an update endpoint. It deliberately is not. If an organization could set its
own limit without constraint, the rate limiter would no longer serve its purpose — there is
nothing stopping every organization from simply raising its own limit to an arbitrarily high
number. In production systems this value is tied to a billing plan and changed through an
internal administrative process, not a user-facing API. For this project, every organization
receives the same default of 100 requests per minute on creation.

### Why does the usage endpoint exclude itself from rate limiting?

Checking remaining quota should not cost quota. If `GET /api/usage` consumed a token like any
other request, a client trying to behave well by checking its limit before sending a burst
would itself contribute to exhausting that limit, which defeats the purpose of exposing the
endpoint in the first place. Production APIs such as GitHub's rate limit status endpoint
follow the same pattern — monitoring endpoints are excluded from the limit they report on.

### Why a single transferable Admin instead of multiple Admins or an immutable one?

Two simpler alternatives were considered and rejected. Allowing multiple Admins per org adds
coordination complexity (who can override whom) with no clear benefit at this project's scale.
A single, permanently fixed Admin is simpler but has no recovery path if the original Admin
leaves the organization. A single, transferable Admin gets the simplicity of "exactly one
Admin, always" while still allowing succession — the current Admin explicitly hands off the
role, and `transferAdmin` performs the demote-and-promote as one atomic operation so the
organization is never left with zero Admins mid-transfer.

### Why is Admin's permission set enforced as immutable in the service layer, not just hidden in the UI?

A frontend can disable a checkbox, but nothing stops a direct API call from reaching
`assignPermissionToRole`/`removePermissionFromRole` regardless of what the UI shows. The guard
belongs in `RoleService`, checked against the role's name, so the invariant holds no matter
which client — the React app, Postman, or a future mobile client — is making the request.

### Why does pagination stay 0-indexed in the API instead of matching the UI's 1-indexed display?

Spring's `Pageable`/`Page<T>` are built around 0-indexed pages as a framework-wide convention;
`PageRequest.of(0, size)` is page one internally, and the `Page` response's `number` field is
populated the same way. Shifting the backend to accept 1-indexed input would desynchronize the
request convention from the response convention, since the response's `number` field would
still be 0-indexed regardless. The conversion is handled once, at the frontend's UI boundary —
React keeps 1-indexed state for anything a human reads (page labels, buttons) and subtracts 1
only when constructing the request URL.

### Why does revoking an invitation delete the row instead of adding a REVOKED status?

The `InvitationStatus` enum (`PENDING`, `ACCEPTED`, `EXPIRED`) tracks states that matter for
business logic — whether a token can still be used. A cancelled invitation has no further use
and nothing downstream needs to distinguish "revoked" from "no longer exists." Deleting the row
keeps the enum focused on states that are actually queried against, rather than growing it for
a state that would only ever be read once, if at all.

### Why doesn't transferAdmin also reassign a role to the demoted admin?

After a transfer, the previous Admin is left with no role at all rather than being
auto-demoted to some default role. This is intentional, not an oversight: `transferAdmin` has
exactly one job — move the Admin role to someone else — and it cannot know from that call alone
whether the previous Admin is staying on as a regular member or leaving the organization
entirely. These are two independent decisions requiring two independent actions:

- **Staying, with reduced privileges** — the new Admin calls the existing
  `POST /api/roles/{roleId}/assign/{userId}` to explicitly grant whichever role actually fits
  (Viewer, Editor, etc.).
- **Leaving the organization** — the new Admin calls
  `PATCH /api/users/{userId}/deactivate` as a separate, deliberate action.

Baking either behavior automatically into `transferAdmin` would silently do the wrong thing in
the other case — an org where the previous Admin is staying on would have them unexpectedly
locked out, while an org where they're leaving would have `transferAdmin` alone insufficient to
actually revoke their access. Keeping transfer and deactivation as two independent, explicit
operations avoids both failure modes.

### Why deactivate instead of hard-delete a user?

`userId` is referenced by `AuditLog.actorUserId`, `Resource.ownerUserId`, and role/invitation
history, all of which are meant to remain intact as historical record even after a user leaves.
Hard-deleting the user row would either violate foreign key constraints or leave those records
pointing at a user that no longer exists, corrupting the audit trail's integrity. Deactivating
via `User.status = DISABLED` blocks login while preserving every record that references the
user — the same pattern used by real SaaS platforms (e.g. GitHub/Slack "remove from org" keeps
history intact rather than deleting rows).

### Why does a disabled user get the same "Invalid credentials" message as a wrong password, instead of "Account disabled"?

A distinct message would let an attacker distinguish "this email exists but is disabled" from
"this email/password combination is simply wrong" — leaking account existence and status to
anyone probing the login endpoint. Returning the identical generic message for both cases
closes that side channel, at the minor cost of a slightly less helpful error for the disabled
user themselves (who would need to contact their org admin regardless).

### Why can an invitation only assign a single role, rather than multiple roles at once?

Onboarding is intentionally limited to exactly one role per invitation, for three reasons.
First, the Principle of Least Privilege — a new member should start with the minimum access
their initial role requires, not an accumulated set decided at invite time before they've even
joined. Second, simplicity — a single `roleId` field on `InviteUserRequest` keeps the invitation
flow to one clear decision (which role does this person start as), rather than turning
onboarding into a miniature version of full permission management. Third, separation of
concerns — invitation is about *bringing someone into the organization*, while assigning
additional roles is an *ongoing management* action that belongs with the tools already built
for it. If a member needs more than their starting role, an existing Admin can assign additional
roles afterward via `POST /api/roles/{roleId}/assign/{userId}` — nothing about single-role
invitations limits what a user can ultimately hold, it only limits what onboarding itself
decides on their behalf.

### Why does neither sendInvitation nor acceptInvitation allow the Admin role?

Found and fixed via UI/frontend review, not automated testing: originally, neither endpoint
checked whether an invitation's `roleId` referred to the Admin role. This meant the single-Admin
invariant enforced everywhere else (`assignRoleToUser`, `transferAdmin`) had a completely
separate, unguarded bypass — anyone holding `USER_INVITE` could invite a new user directly into
the Admin role, and `acceptInvitation` would honor it without question, silently producing a
second Admin and breaking the entire governance model this platform is built around. Fixed with
the same defense-in-depth pattern used for Admin-permission immutability: `sendInvitation`
rejects Admin-role invitations at send time, and `acceptInvitation` independently re-checks at
accept time — covering the edge case where a role is renamed to "Admin" after an invitation was
already sent but before it was accepted. This is a good example of why a UI/API-contract review
pass matters even after a full backend test suite passes — the tests exercised the paths that
were written, but nobody had tested the *absence* of a guard on a path that was never
specifically considered.

### Why does GlobalExceptionHandler implement AuthenticationEntryPoint instead of a lambda in SecurityConfig?

Found and fixed during testing: requests with no JWT at all were returning `403 Forbidden`
instead of `401 Unauthorized`. The cause was two-fold — Spring Security's default anonymous
authentication filter assigns unauthenticated requests a fake low-privilege principal rather
than leaving them truly unauthenticated, so `@PreAuthorize` denies them via `AccessDeniedException`
(403) rather than the request ever reaching an `AuthenticationEntryPoint` (401). Disabling
anonymous authentication (`.anonymous(AbstractHttpConfigurer::disable)`) surfaces the request as
genuinely unauthenticated, but Spring's fallback entry point when none is configured
(`Http403ForbiddenEntryPoint`) *also* returns 403 despite its name. A custom entry point is
required to get a correct 401. Rather than defining that inline in `SecurityConfig` with its own
`ObjectMapper`, `GlobalExceptionHandler` — already a `@RestControllerAdvice` bean — implements
`AuthenticationEntryPoint` directly, so all error-response construction (401 alongside the
existing 400/403/404/409 handlers) lives in one file, and `SecurityConfig` just wires it in as a
bean reference with no serialization logic of its own.

### Why are permissions re-checked against the database on every request instead of trusted from the JWT?

JWT's stateless design eliminates the need for a database lookup to establish *identity* —
signature verification alone confirms who is making the request, without a session-store round
trip. But permissions are different from identity: they are mutable, revocable authorization
state, not a fixed fact about a user. If a permission set were baked into the JWT at login time
and trusted for the token's full lifetime, a user demoted mid-session (e.g. the previous Admin
after `transferAdmin`) would keep their old authorization until their token happened to expire —
observed directly during testing, where the demoted Admin's still-valid JWT (claiming
`"roles":["Admin"]`) correctly received `403` on admin-only actions, because
`CustomPermissionEvaluator` re-derives `userId → UserRole → roleId → RolePermission → permissionCode`
fresh from the database on every request rather than trusting the token's embedded claims. This
makes access revocation immediate rather than dependent on token expiry, which matters more for
this system's security guarantees than the small cost of one indexed join per request.

### Why does GET /api/organizations/me use isAuthenticated() instead of a permission code?

Every other endpoint in this API is gated by one of the 9 fixed permission codes, resolved
through `userId -> UserRole -> RolePermission -> permissionCode`. Org name, slug, and creation
date don't fit that model — they're not an administrative capability being granted or withheld,
they're baseline context every member of the org needs regardless of role, the same way a
Slack workspace's name is visible to every member of that workspace, not just admins. Gating it
behind a permission would mean deliberately choosing which of the 9 codes this unrelated
concern piggybacks on, weakening the meaning of that code for no real benefit. `isAuthenticated()`
says precisely what's actually being checked: is this a real, logged-in member of some
organization, nothing more specific than that.

### Why does the frontend surface the invitation link directly to the admin instead of sending an email?

No email service (SMTP, templating, deliverability) is wired into this project, which is a
deliberate scope decision consistent with keeping the project defensible in a solo-fresher
portfolio context rather than replicating every feature of a production SaaS. Since
`sendInvitation` already returns the token in its response to the inviting admin, the
Invitations screen surfaces a "Copy invite link" action per pending invitation
(`{frontend_url}/accept-invitation?token=...`), which the admin shares with the invitee through
whatever channel is convenient. The accept-invitation flow itself is unaffected by how the
invitee received the link — the token and `GET /api/invitations/{token}` /
`POST /api/auth/accept-invitation` endpoints don't know or care whether the link arrived by
email or was pasted manually. In production, the only change required is triggering an email
send at the point `sendInvitation` currently returns the token — no change to the accept flow,
the token model, or any endpoint contract.

### Why did the Transfer Admin action move from the Roles page to the Members page during frontend design?

Originally, Roles → Admin detail included a Transfer Admin panel with its own member dropdown,
built before a dedicated Members management screen existed. Once Members was designed (to
support `GET /api/users` and `PATCH /api/users/{userId}/deactivate`), this created a real
inconsistency: an admin managing a specific person's access would need to remember that most
person-level actions (viewing status, deactivating) live on Members, but one specific action
(promoting them to Admin) lived on a completely different page, under Roles. The fix moves
Transfer Admin onto Members as a per-row action, alongside Deactivate — both are actions
performed *on a person*, so both live where an admin naturally looks for person-level actions.
Roles → Admin detail keeps only what's actually about the role itself: its fixed permission
list, with a short pointer note directing to Members for the transfer action. No backend change
was needed — `POST /api/roles/transfer-admin/{newUserId}` already accepted a bare path
parameter with no page-specific dependency.

### Why does GET /api/invitations never include the raw token, even for still-pending invitations?

A list of everyone currently invited should not expose raw invitation tokens — that's the same
reasoning as the original design decision above, extended to cover the list endpoint too. Even
though this project simulates email delivery via a manually-copied link rather than an actual
inbox, the correct mental model is that the token is minted and exposed exactly once, at
send-time, the same way a real email would be sent to exactly one recipient and not be
re-fetchable from an admin dashboard afterward. The frontend's Invitations screen reflects this
directly: a "Copy invite link" button works immediately after sending (the token is held in
React state from the `POST` response), but after a page refresh the same button shows an
explicit notice — "Link no longer available for security reasons. Revoke and resend to generate
a new one." — rather than silently failing or fabricating a stale link. Resending via
revoke-then-invite is the correct recovery path, not "recovering" the old token, since it also
naturally invalidates the original link.

### Why do Members rows collapse multiple roles into a "+N more" badge instead of listing every role tag?

`UserResponse.roles` is a list — a single user can hold multiple roles simultaneously (e.g. both
`Editor` and `Auditor`), and nothing in `assignRoleToUser` prevents this. Rendering every role as
an inline tag works fine for one or two roles but breaks down as the count grows — a member
holding most of an organization's roles would produce a row several times taller than every
other row, or a wall of tags wrapping across multiple lines, either of which draws visual
attention to a data density problem rather than to the person and their access level, which is
what the row is actually for. The fix shows the first role directly (covering the common
single-role case with zero extra interaction) and collapses any additional roles behind a
`+N more` badge that reveals the full list in a small popover on click — every row stays a
consistent height regardless of how many roles a member holds.

### Why are permission IDs resolved dynamically from the Admin role instead of hardcoded?

The Role Detail screen needs the numeric ID behind each of the 9 fixed permission codes to call
the assign/remove endpoints, but no endpoint returns "all 9 permissions with their IDs" directly
— `GET /api/roles/{roleId}/permissions` only returns whichever ones a *specific* role currently
holds. An early attempt hardcoded a `code -> id` mapping by hand, based on the order one example
response happened to return them in. This caused a real, confusing bug: toggling a permission ON
worked, but toggling it back OFF failed, because the hardcoded ID for at least one code didn't
match its actual seeded value, so the `DELETE` call targeted a permission-role association that
didn't exist. Since the Admin role is documented as always holding all 9 permissions by design,
it's a reliable, self-updating source of truth: the frontend fetches Admin's permission list once
per Role Detail page load and builds the `code -> id` map from that response, rather than trusting
a hand-typed guess that can silently drift out of sync with whatever the backend actually seeded.

### Why does transferring Admin force an immediate logout for the person who transferred it?

Early testing surfaced that after a successful `POST /api/roles/transfer-admin/{id}`, the
now-former-Admin's UI appeared to "crash" — buttons that should have become disabled stayed
clickable, and clicking them failed with no clear explanation. This isn't a bug in the usual
sense; it's an inherent property of stateless JWT auth. The caller's browser still holds their
*old* token, minted at login time with `roles: ["Admin"]` baked into its claims, and nothing
about a backend-side permission change updates a JWT that's already been issued — the token is
only ever re-derived at the next login. The correct fix isn't defensively handling every possible
stale-permission 403 throughout the app; it's recognizing that a successful Admin transfer is
one of the few actions where the caller's *entire* permission set changes in a single moment, so
forcing a clean re-login immediately afterward is the honest, correct response rather than
letting them continue operating on claims that are now wrong.

### Why does deleting a role require unassigning all members first, instead of cascading?

Real SaaS products differ here — AWS IAM blocks deleting a role/policy while anything is still
attached to it (a hard conflict error, detach first), while systems like GitHub Teams or Okta
Groups cascade a group deletion by silently stripping that group's access from every member. The
cascade approach doesn't fit this project, though, because of an invariant already established
elsewhere: every user must always hold at least one role (enforced by `unassignRoleFromUser`'s
own guard). A cascading role deletion would either need to silently violate that invariant for
anyone whose *only* role was the one being deleted, or perform the same "does removing this leave
someone at zero roles" check that the blocking approach requires anyway — just automatically,
with more room for a single careless click to strip several people's access at once with no
intermediate confirmation per person affected. Blocking deletion outright when `memberCount > 0`
(requiring members to be unassigned or reassigned first, one deliberate action at a time) avoids
that risk entirely and mirrors a real, citable industry precedent (AWS IAM's model) rather than
inventing a bespoke cascade-with-safety-checks that accomplishes the same end state with more
complexity.

### Why CSS Modules instead of one shared global stylesheet across pages?

Early in the React build, every page's CSS was written as a plain `.css` file imported
independently (`Login.css`, `Home.css`, `Invitations.css`, etc.), using generic class names like
`.field`, `.card`, and `.btn-primary` that were assumed to be page-local. Vite doesn't scope
plain CSS imports, though — once a person navigates between pages in the same SPA session, every
previously-imported stylesheet remains active simultaneously, so identically-named classes from
different pages collide and whichever was loaded last wins ties in the cascade. This surfaced as
real, confusing bugs on the Invitations screen: an oversized "Send invite" button (inheriting a
`width: 100%` rule from `Login.css`'s `.btn-primary`) and a collapsed email input, plus buttons
inside the invite form defaulting to `type="submit"` and triggering the wrong handler. The fix
was converting each page's stylesheet to a CSS Module (`Invitations.module.css`, imported as
`import styles from './Invitations.module.css'`), which Vite compiles into guaranteed-unique
class names per file automatically. This is the standard scoping approach for component-based
React UIs (the plain-global-stylesheet approach from traditional HTML/CSS doesn't hold up once
multiple independently-authored stylesheets can be active in the DOM at once) and was retrofitted
across all existing pages before continuing to new screens, to avoid repeating the same class of
bug on every subsequent page.

### Why do GET /api/users/me-permissions and GET /api/users/basic-info have no @PreAuthorize at all?

Both exist to fix the same underlying flaw in two different places — a permission-reading or
purely display-oriented endpoint gated behind a permission that not every legitimate caller
would actually hold. `me-permissions` only ever returns the caller's own permission list, which
makes it impossible to use for snooping on anyone else. `basic-info` only ever returns `id` and
`email` — no roles, no status, nothing sensitive — purely so the UI can label an owner or actor
column with a real email address instead of a bare user ID. Gating either one behind a
permission would just recreate the exact deadlock they were built to solve: a user without that
permission couldn't find out what they *can* do, or couldn't see who owns something they're
already allowed to view. See Known Issues for a related, still-open case of this same pattern
with `ROLE_ASSIGN`.

### Why does the sidebar disable inaccessible nav items instead of hiding them?

Early testing with a ReadOnly-role invited user surfaced two related problems: the Home
dashboard's `Promise.all(...)` call rejected entirely the moment any single request came back
`403` (e.g. `GET /api/audit-logs` without `AUDIT_VIEW`), wiping out sections the user *did* have
access to; and the sidebar rendered every nav link unconditionally, so clicking "Invitations"
as a ReadOnly user navigated to a page that immediately failed to load anything, with no
explanation. Both were fixed by leaning further into the permission-driven rendering model
already established for the rest of the app. Home now uses `Promise.allSettled(...)` and
resolves each section independently against the user's actual permission set (skipping the
`GET /api/audit-logs` call entirely, rather than firing it and catching the failure, when
`AUDIT_VIEW` isn't held) so a ReadOnly user simply sees the sections they're allowed to see, with
no error noise for the ones they aren't. The sidebar takes the same approach one level up: each
nav item declares the permission it requires, and items the user lacks render as visibly
disabled with a tooltip ("You don't have permission to access this section") rather than
vanishing outright — surfacing what exists in the product without ever routing to a page
guaranteed to fail is more informative than silently hiding sections, since it lets a user
understand what they'd need additional access for for on their own without leaving them wondering
why a piece of the interface disappeared.

---

## Build Progress

| Phase | Description | Status |
|---|---|---|
| 0 | Setup — project, Docker, data.sql, README | Complete |
| 1 | Auth — entities, repositories, JWT, register, login | Complete |
| 2 | Tenant Isolation — Hibernate filter, TenantContext, resource CRUD | Complete |
| 3 | RBAC — custom PermissionEvaluator, roles, permission assignment | Complete |
| 4 | Invitations + Audit Log — invite flow, AuditAspect, audit log endpoint | Complete |
| 5 | Rate Limiting — Redis, token bucket, atomic Lua script, usage endpoint | Complete |
| 6a | Backend extensions — admin governance, deactivate-user, pagination, extended endpoints | Complete |
| 6a | Frontend design — 10 screens designed and reviewed against the real API contract | Complete |
| 6b | React Frontend — all nine screens built and tested end-to-end against the live backend | Complete |
| 6c | Permission catalog redesign — 9 to 13 permissions, No Access system role, forced-logout removal | Complete |
| 6c/7 | Manual QA + systematic RBAC audit — dead-end permission fixes, frontend/backend gate realignment | Complete |
| 7 | Automated regression suite — JUnit + MockMvc against real containers, 22 tests | Complete |
| 8 | Docker + Deploy — multi-stage Dockerfile, Render/Railway | Pending |

**Backend additions made during Phase 6a** (surfaced by designing against the real API and
then testing it end-to-end, rather than assuming either was correct):

- `DELETE /api/roles/{roleId}/permissions/{permissionId}` — permissions could previously only be added, not removed
- Admin role governance — immutable permissions, single transferable Admin via `POST /api/roles/transfer-admin/{newUserId}`
- `GET /api/users` and `PATCH /api/users/{userId}/deactivate` — member listing and soft-delete, kept as two independent operations from admin transfer by design
- `GET /api/invitations` and `DELETE /api/invitations/{invitationId}` — listing and revoking pending invitations
- `GET /api/organizations/me` — organization self-info (name, slug, requestLimitPerMinute, createdAt), gated by `isAuthenticated()` rather than a permission code
- `description` field added to `Resource`
- Pagination added to `GET /api/resources` and `GET /api/audit-logs`
- Two bugs found and fixed via testing, not by inspection: unauthenticated requests returning
  403 instead of 401 (anonymous auth + missing custom entry point), and `AuditAspect` recording
  `entityId: 0` on all create-style actions (aspect only inspected method arguments, not the
  return value)
- One additional gap found via UI/frontend review (not automated testing): neither
  `sendInvitation` nor `acceptInvitation` blocked the Admin role from being assigned through an
  invitation, bypassing the single-Admin invariant. Fixed with defense-in-depth guards at both
  send and accept time.

**Frontend design decisions made during Phase 6a** (see [Design Decisions](#design-decisions)
for full detail):

- Single React app with permission-driven conditional rendering, not a separate admin/user
  module split — nav items and actions show or hide based on the logged-in user's permission
  set, the same live-checked model the backend already enforces
- Transfer Admin relocated from Roles → Admin detail onto the Members page, alongside
  Deactivate, so all person-level actions live in one place
- Members screen handles multi-role users with a "+N more" overflow pattern rather than an
  unbounded row of tags
- Invitation token delivery handled via a "Copy invite link" action in the admin's Invitations
  view rather than email, since no email service is part of this project's scope — the accept
  flow itself is unaffected by how the link reaches the invitee, so swapping in real email
  delivery later requires no change to the token model or any endpoint

**Known small cleanup items from Phase 6a — resolved during Phase 6b:**

- Login screen's non-functional "Forgot password?" link — removed
- "Roles" nav/page label — renamed to "Roles & Permissions" in the shared `Sidebar` component
- Home's Organization card and Recent Activity feed — wired to `GET /api/organizations/me` and
  `GET /api/audit-logs` respectively
- Brand/logo block originally shown on Login, Register, Register-Success, and Accept-Invitation
  mockups — removed from all of them per a mid-build decision to keep auth screens free of
  placeholder branding; the topbar's org-initials badge and user-avatar circle (also originally
  decorative placeholders with no real data behind them) were likewise replaced with a
  functional org-name pill and a working Logout button

---

### Phase 6b — React Frontend (complete)

**Stack and setup:** Vite + React (plain JS, not TypeScript), `axios`, `react-router-dom`.
Folder structure: `src/api` (Axios client), `src/context` (AuthContext), `src/components`
(shared Sidebar/Topbar), `src/pages` (one file + one CSS Module per screen).

**Infrastructure built:**

- `axiosClient.js` — Axios instance with a request interceptor attaching `Authorization: Bearer
  <token>` from `localStorage`, and a response interceptor that clears the token and redirects to
  `/login` on any `401`.
- `AuthContext.jsx` — decodes the JWT client-side (`sub`, `userId`, `orgId`, `roles`) without
  verifying its signature (verification is the backend's job on every request). Since the JWT
  carries role *names* only, not a resolved permission set, the context additionally calls
  `GET /api/roles` once after login to map role names to IDs, then `GET /api/roles/{id}/permissions`
  per matched role, merging the results into one flat permission array exposed as
  `hasPermission(code)`. This mirrors the backend's live, DB-checked permission model rather than
  trusting anything embedded in the token.
- **CORS** — `SecurityConfig` initially had no `CorsConfigurationSource`, so every request from
  the Vite dev server (`localhost:5173`) to the backend (`localhost:8080`) was blocked by the
  browser before reaching Spring Security at all. Fixed by adding a `CorsConfigurationSource`
  bean scoped to `http://localhost:5173` with `allowCredentials(true)` (required since the
  frontend sends an `Authorization` header), wired into the filter chain via `.cors(...)`.
- **CSS Modules** — see [Design Decisions](#design-decisions) for the full story; every page
  stylesheet is a `.module.css` file to prevent cross-page class name collisions.

**Screens built and tested end-to-end against the live backend:**

- **Login** — org slug + email + password, password visibility toggle, distinguishes `400`
  ("Invalid credentials" — deliberately vague per the backend's user-enumeration protection) from
  other failure modes.
- **Register / Register-Success** — creates an org via `POST /api/auth/register-org`, passes the
  returned `orgSlug` to the success screen via React Router navigation `state` (not a URL param,
  since it's a one-time handoff value), copy-to-clipboard for the slug.
- **Home** — Organization card, Usage card (with a standalone Refresh button hitting
  `GET /api/usage` in isolation, not a full page reload), Active Members count, Recent Activity
  feed. Actor emails in the activity feed are resolved client-side by cross-referencing
  `actorUserId` against `GET /api/users`, since `GET /api/audit-logs` only returns the numeric ID.
  Uses `Promise.allSettled` and per-section permission checks (see Design Decisions) so a
  lower-privilege user sees every section they're entitled to, with no error noise for the rest.
- **Invitations** — send (role dropdown excludes Admin, per the single-Admin invariant, and shows
  a "select at least one" style disabled state if no non-Admin roles exist yet), list pending,
  copy-link (session-only, see Design Decisions on why `GET /api/invitations` never returns a
  token), revoke.
- **Accept-Invitation** — reads `?token=` from the URL, calls the newly-added
  `GET /api/invitations/{token}` to prefill org name/role/email before the user sets a password,
  then calls `POST /api/auth/accept-invitation` and logs the user in immediately, closing with a
  reminder screen showing the org slug they'll need for future logins.
- **Members** — table of all org members with role tags, status badges, and three row-level
  actions (Assign role, Make Admin, Deactivate) plus a per-tag "Unassign" button for removing
  individual roles from a multi-role member. All four mutating actions (deactivate, transfer,
  assign, unassign) share one confirm modal component, switching its title/body/button per
  action type rather than four separate modals. Successfully transferring Admin immediately logs
  the caller out and redirects to `/login`, since their JWT's cached permission claims are now
  stale and continuing to use them would cause silently-wrong permission checks throughout the
  app — see Design Decisions.
- **Roles & Permissions** (list + detail) — list view shows role name, LOCKED tag for Admin, and
  member count; detail view shows all 9 permissions as toggle switches (optimistic UI, rolls back
  on failure) plus a Delete role button. New-role creation happens in one modal that includes the
  same toggle switches used on the detail page, so a role is never created with zero permissions
  (the "Create role" submit button stays disabled with a tooltip until at least one permission is
  checked) — this replaced an earlier two-step flow (create empty, then configure) that made it
  possible to leave a role in an invalid zero-permission state. Permission IDs needed for the
  assign/remove calls are resolved dynamically at runtime from the Admin role's permission list
  (which always holds all 9 by design) rather than hardcoded, after an earlier hardcoded mapping
  attempt caused a real bug — see Design Decisions. Deleting a role is disabled (with a tooltip)
  for the Admin role and for any role that still has members assigned to it.
- **Resources** — table view with name, description, owner, and per-row Edit/Delete actions,
  gated on `RESOURCE_UPDATE`/`RESOURCE_DELETE` respectively; a collapsible "+ New resource" panel
  gated on `RESOURCE_CREATE`; a name search box calling `GET /api/resources/search` directly
  rather than filtering the current page client-side; and numbered pagination matching the
  original mockup. The owner column resolves `ownerUserId` to an email address via
  `GET /api/users/basic-info` (see below) rather than showing a bare user ID, and shows
  "No description" as an explicit fallback rather than leaving the cell blank when a resource
  was created without one.
- **Audit log** — paginated table (Action, Entity, Actor, Timestamp) with an "All actions"
  dropdown covering the full 13-action list `AuditAspect` actually produces. Since
  `GET /api/audit-logs` only accepts `page`/`size` — there's no server-side action-type filter
  parameter — the dropdown filters client-side against whichever page is currently loaded, which
  means a rare action type on an earlier page won't show up until that page is fetched. Actor
  emails resolve the same way as Resources' owner column, through `GET /api/users/basic-info`.

**Backend additions and fixes made during Phase 6b** (surfaced by building and testing the
frontend against the real API, the same pattern as Phase 6a):

- `CorsConfigurationSource` bean added to `SecurityConfig` — see above.
- `AuditAspect` extended with `INVITE_REVOKED` (on `revokeInvitation()`), `ROLE_DELETED` (on
  `deleteRole()`), and `ROLE_UNASSIGNED` (on `unassignRoleFromUser()`) — closing gaps where each
  of these performed a real mutation with no corresponding audit trail entry.
- **Missing `@Transactional` on `removePermissionFromRole`** — toggling a permission off in the
  UI reliably failed with `"No EntityManager with actual transaction available for current
  thread"`, since the underlying `@Modifying`-style delete query needs an active transaction to
  execute and this method didn't have one (unlike `transferAdmin`, which did). Fixed by adding
  `@Transactional` to the method.
- **Minimum-one-permission-per-role guard**, added to `removePermissionFromRole`: rejects
  (`400`) removing a role's last remaining permission, with a message directing the caller to
  delete the role instead of leaving it in an empty, meaningless state.
- **`DELETE /api/roles/{roleId}/unassign/{userId}`** — new endpoint, mirroring the existing
  `assign` endpoint. Closes a gap where a user could be assigned additional roles from the
  Members screen but never have one removed short of full deactivation. Includes a
  minimum-one-role-per-user guard (`400` if it's their last remaining role), and rejects
  targeting the Admin role directly (use transfer-admin instead), matching the same pattern as
  `assignRoleToUser`.
- **`DELETE /api/roles/{roleId}`** — new endpoint. Rejects deleting the Admin role outright, and
  rejects deleting any role that still has `memberCount > 0`, requiring members to be unassigned
  first rather than silently cascading the deletion through their role list (see Design
  Decisions for the reasoning). Deletes the role's `RolePermission` rows before deleting the role
  itself to avoid a foreign-key conflict. Gated behind `ROLE_CREATE` rather than `ROLE_ASSIGN`,
  since creation and deletion are the symmetric lifecycle pair for a role, consistent with how
  `RESOURCE_CREATE`/`RESOURCE_DELETE` are paired in the permission catalog.
- `UserRoleRepository` gained `countByUserId(Long userId)` and `RolePermissionRepository` gained
  `deleteAllByRoleId(Long roleId)`, both needed by the two new endpoints above.
- **Permission-resolution deadlock, found and fixed.** A user holding only `RESOURCE_READ` (no
  `ROLE_READ`) couldn't access the Resources screen at all, despite holding the exact permission
  it requires. `AuthContext.jsx`'s original `loadPermissions` resolved a user's full permission
  set by calling `GET /api/roles` — itself gated behind `ROLE_READ` — then
  `GET /api/roles/{id}/permissions` per matched role. Any role without `ROLE_READ` caused the
  first call to 403, and the surrounding `catch` block silently zeroed out the user's entire
  permission array, not just the role-related parts of it. Fixed with a new endpoint,
  `GET /api/users/me-permissions`, added to `UserController`/`UserService` rather than a separate
  controller. It resolves the caller's merged permissions directly
  (`userId -> UserRole -> roleIds -> RolePermission -> Permission.code`) via
  `UserRoleRepository.findRoleIdsByUserId`, and deliberately carries **no** `@PreAuthorize` — its
  entire purpose is to answer "what am I allowed to do" before any specific permission is known
  to be held, so gating it behind one would just recreate the same deadlock. `AuthContext.jsx`
  now calls this single endpoint instead of the `GET /roles` + per-role loop.
- **`GET /api/users/basic-info`** — new endpoint, also without `@PreAuthorize`, returning only
  `id` and `email` for every user in the caller's org. Added because Resources' owner column and
  Audit log's actor column both originally resolved names via `GET /api/users`, which requires
  `ROLE_READ` — so anyone without it saw `User #30` instead of an email. Since this endpoint
  exposes nothing beyond `id`+`email` (no roles, no status), it's safe for any authenticated org
  member to call purely for display purposes.
- **`Members.jsx` had no permission gating at all**, found while testing a role holding
  `ROLE_READ` + `USER_INVITE`: "Make Admin", "Assign role", and the per-tag "Unassign" button
  were all clickable, despite each calling an endpoint gated on `ROLE_ASSIGN`, which that role
  didn't include. Unlike `Sidebar.jsx` and `Resources.jsx`, `Members.jsx`'s action buttons never
  checked `hasPermission()` — their `disabled` state only considered whether the target was the
  caller themselves, already deactivated, or already Admin. The backend correctly rejected every
  one of these calls regardless, so this was a UX/consistency bug rather than an actual security
  gap — nothing unauthorized was ever genuinely possible. Fixed by gating Assign role/Make
  Admin/Unassign on `ROLE_ASSIGN` and Deactivate on `USER_INVITE`, matching the backend exactly.
- **`AuditLog.jsx`'s action-type filter list was incomplete.** The initial 11-entry list was
  built from the static mockup's `<select>` options and missed three real action types that
  `AuditAspect.resolveAction()` actually produces: `ROLE_DELETED`, `ROLE_UNASSIGNED`, and
  `INVITE_REVOKED`. Corrected to the full 13-action list.

Resources and Audit log are now built and tested end-to-end, completing Phase 6b.

---

## Known Issues & Open Questions

Both open questions from this section as originally written (`USER_INVITE` bundling deactivate,
and `ROLE_ASSIGN` having no reachable path) were resolved during the Phase 6c permission-catalog
redesign and the subsequent Phase 6c/7 manual QA pass — see the new section below for full
detail. This section is kept empty deliberately as a marker that the audit was completed, not
abandoned.

---

---

## Phase 6c — Permission Catalog Redesign

The original 9-permission catalog was split for precision: `ROLE_ASSIGN` became three separate
codes (`ROLE_MANAGE` for user↔role assignment, `PERMISSION_MANAGE` for permission↔role
assignment, `ADMIN_TRANSFER` isolated as the highest-privilege action), `ROLE_CREATE`/
`ROLE_DELETE` were split, and `USER_DEACTIVATE` was separated from `USER_INVITE`. The DB was
dropped and reseeded. Three endpoints were widened to OR-gates immediately so no split
permission was an obvious dead end at launch: `GET /api/roles`, `GET /api/roles/{roleId}/permissions`,
`GET /api/users`.

**No Access system role** introduced: zero permissions, undeletable, auto-bootstrapped
alongside Admin at registration (`AuthService.registerOrg`) — see Admin Role Governance above
for its role in `transferAdmin`.

**Key design decision reconfirmed:** a role may hold zero permissions, even while still assigned
to users — deliberate, not a bug, modeled on AWS IAM/K8s RBAC's empty-policy-object pattern.

---

## Phase 6c/7 — Manual QA and Systematic RBAC Audit

A full end-to-end manual QA pass was conducted using single-permission test roles, verifying
each of the 13 permissions independently as a real logged-in user, cross-checked against actual
`@PreAuthorize` source (not assumptions) via Postman where UI behavior alone wasn't conclusive.

**Bugs found and fixed:**

1. **Coupled-fetch error banners.** `RolesList.jsx`, `RoleDetail.jsx`, and `Members.jsx` each
   originally bundled a primary fetch with a secondary, differently-permissioned fetch inside
   one `try/catch` or `Promise.all`. A 403 on the secondary call threw a blocking error banner
   over an otherwise-working page, or (RoleDetail specifically) rendered an empty permission Set
   as "every permission is off" — misleading, not just cosmetic. Fixed by decoupling the fetches
   in all three files.
2. **`transferAdmin` zero-role bug.** The outgoing admin was left with zero roles, silently
   bypassing the "every user needs ≥1 role" invariant. Fixed via the No Access system role,
   assigned before Admin is removed.
3. **Dead-end permissions** — `ROLE_CREATE`, `ROLE_DELETE`, `USER_DEACTIVATE`, `USER_INVITE`
   (for the invitation role-picker), and `RESOURCE_CREATE` were each, at various points, granted
   but unreachable because their corresponding listing endpoint's OR-gate didn't include them.
   Design rule established: in this single-page app, any permission whose only UI entry point
   lives on a shared listing page needs that page's endpoint in its OR-gate — applies to
   create/update/delete equally, not just actions on existing items (an earlier, narrower version
   of this rule was tested and found incomplete). All confirmed fixed and covered by regression
   tests, with one deliberate exception: `RESOURCE_CREATE` does NOT get read access — see
   Resources endpoint table above.
4. **`Sidebar.jsx` nav-permission drift.** `NAV_ITEMS` had fallen out of sync with the backend
   OR-gate widenings above (pre-existing drift, not introduced this session). Realigned exactly.
5. **`Home.jsx` dashboard-loading race condition.** The dashboard's `useEffect` ran before
   `AuthContext`'s permissions finished loading (async), so `hasPermission('AUDIT_VIEW')` could
   evaluate `false` at the moment the audit-log fetch decision was made, silently skipping it.
   Fixed by gating the effect on `permissionsLoading`.

**Confirmed correct, no changes needed (tested, not assumed):** Admin's dynamic full-permission
bootstrap; backend guards blocking Admin-role reassignment via the general assign/unassign path
(verified via raw Postman calls with a low-privilege JWT, not just UI hiding); `ROLE_READ` being
able to view (not edit) a role's permissions; `PERMISSION_MANAGE` being able to empty an
already-assigned role to zero permissions; `Members.jsx`'s "Assign role" staying enabled on
Admin's row (the dangerous action is blocked at the dropdown-filtering/tag-removal level, not by
disabling the whole row).

**Known, accepted limitation, not fixed:** Audit log filtering (`AuditLog.jsx`) is client-side
only, filtering within the currently loaded page — no server-side `action` query param exists.
Documented in-code; judged out of scope.

---

## Phase 7 — Automated Regression Suite

A targeted JUnit 5 + MockMvc suite (`RbacRegressionTest.java`, extending
`BaseIntegrationTest.java`) runs against real local `tenant-platform-mysql`/`tenant-platform-redis`
containers — no mocks, no Testcontainers — generating real JWTs via `JwtUtil` for
repository-created test users, so requests pass through the actual filter chain
(`JwtAuthFilter` → `RateLimitFilter` → `TenantFilter` → `@PreAuthorize` →
`CustomPermissionEvaluator` → real DB) exactly like a live request.

**Coverage (22 tests, all passing), mapped 1:1 to bugs found above rather than general coverage:**
- Every permission with a listing-page dependency reaches it (parametrized across all affected
  codes for `/api/roles`, `/api/users`, `/api/resources`)
- An unrelated permission (`AUDIT_VIEW`) correctly cannot reach `/api/roles` — confirms the
  OR-gate isn't accidentally wide open
- `RESOURCE_CREATE` specifically cannot read the list but can still create — confirms the
  deliberate exception above
- `transferAdmin` leaves the outgoing admin holding exactly `No Access`, never zero roles; new
  admin ends up holding `Admin`
- Both system roles (`Admin`, `No Access`) reject permission modification and deletion attempts
- A role can be emptied to zero permissions while still assigned (non-regression check on the
  deliberate empty-role design)
- A user's only remaining role cannot be unassigned via the normal path

This suite is intentionally narrow — it exists to catch regressions of specific, real bugs
found during manual QA, not as general test coverage. It already proved its value twice during
development: once catching a genuine remaining dead-end (`RESOURCE_CREATE` on the resources
list, before the deliberate-exception design was finalized), and once catching an incomplete
test-setup helper (`createTestOrg()` initially not bootstrapping Admin/No Access the way
`AuthService.registerOrg` does in production).

---

## Setup and Running Locally

*To be filled in after Phase 8.*

---

## Live Demo

*To be filled in after Phase 8.*