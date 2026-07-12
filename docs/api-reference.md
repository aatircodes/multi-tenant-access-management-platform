# API Reference

This document is the complete contract for the platform's REST API — every endpoint, request and
response body, status code, and how to exercise the API directly. For the reasoning behind *why*
the API is shaped this way (why cross-tenant access returns 404, why certain endpoints have no
`@PreAuthorize`, why pagination stays 0-indexed), see
[`docs/design-decisions.md`](design-decisions.md).

---

## Table of Contents

- [Introduction](#introduction)
- [Error Response Format](#error-response-format)
- [Auth Endpoints](#auth-endpoints)
- [Organization Endpoints](#organization-endpoints)
- [Invitation Endpoints](#invitation-endpoints)
- [Role & Permission Endpoints](#role--permission-endpoints)
- [User & Membership Endpoints](#user--membership-endpoints)
- [Resource Endpoints](#resource-endpoints)
- [Audit Log Endpoints](#audit-log-endpoints)
- [Usage Endpoint](#usage-endpoint)
- [Testing the API](#testing-the-api)

---

## Introduction

**Base URL** — `http://localhost:8080/api` locally, or the deployed backend's origin in
production (see the main [README](../README.md) for the live URL).

**Authentication** — every endpoint except the three under Auth requires a JWT, obtained via
`POST /api/auth/login` or `POST /api/auth/accept-invitation`. Send it on every subsequent request
as:

```
Authorization: Bearer <token>
```

**Tenant context** — the organization a request operates on is always derived from the JWT, never
from a request body or query parameter. There's no way to pass an `orgId` explicitly, by design.

---

## Error Response Format

Every error response follows the same shape:

```json
{
    "status": 400,
    "message": "Pending invitation already exists for this email",
    "timestamp": "2026-06-29T12:34:28.734"
}
```

The one exception is `429 Too Many Requests`, which omits `timestamp` since it's written directly
by the rate limit filter rather than passing through the shared exception handler.

| Status | Meaning |
|---|---|
| 400 | Validation failure, invalid credentials, or a business rule violation |
| 401 | No JWT provided on a protected endpoint |
| 403 | Valid JWT, but the caller lacks the required permission |
| 404 | Resource not found, or a cross-tenant access attempt |
| 409 | Duplicate assignment — the role or permission is already assigned |
| 429 | The organization has exceeded its rate limit |

---

## Auth Endpoints

*Public — no JWT required.*

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register-org` | Register an organization and bootstrap its Admin account |
| POST | `/api/auth/login` | Log in and receive a JWT |
| POST | `/api/auth/accept-invitation` | Accept an invitation, create an account, receive a JWT |

**POST /api/auth/register-org**

```json
// Request
{
    "orgName": "Acme Corp",
    "adminEmail": "alice@acme.com",
    "password": "password123"
}
```

```json
// Response 201
{
    "message": "Organization registered successfully",
    "orgSlug": "acme-corp"
}
```

**POST /api/auth/login**

```json
// Request
{
    "email": "alice@acme.com",
    "password": "password123",
    "orgSlug": "acme-corp"
}
```

```json
// Response 200
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

```json
// Request
{
    "token": "d48a7b74-86d7-4996-bbf8-f8e301ec4364",
    "password": "password123"
}
```

Response `200` — same shape as the login response above. The invitee is logged in immediately,
without a separate login call.

---

## Organization Endpoints

*JWT required.*

| Method | Endpoint | Permission |
|---|---|---|
| GET | `/api/organizations/me` | Any authenticated user |

**GET /api/organizations/me**

```json
// Response 200
{
    "name": "Acme Corp",
    "slug": "acme-corp",
    "requestLimitPerMinute": 100,
    "createdAt": "2026-02-12T09:14:03.221"
}
```

Gated by `isAuthenticated()` rather than a specific permission — an organization's own name, slug,
and creation date are baseline context every member needs, not an administrative capability.

---

## Invitation Endpoints

*JWT required.*

| Method | Endpoint | Permission |
|---|---|---|
| POST | `/api/invitations` | `USER_INVITE` |
| GET | `/api/invitations` | `USER_INVITE` |
| DELETE | `/api/invitations/{invitationId}` | `USER_INVITE` |

**POST /api/invitations**

```json
// Request
{
    "email": "bob@acme.com",
    "roleId": 2
}
```

```json
// Response 201
{
    "id": 4,
    "token": "9f0ab181-eed3-47e1-8a04-750b2a6ac0a7",
    "email": "bob@acme.com",
    "expiresAt": "2026-07-01T13:28:55.317"
}
```

`roleId` is rejected with `400` if it refers to the Admin role. The `token` is only ever returned
here, to the inviting admin — never through the list endpoint below.

**GET /api/invitations**

Lists pending invitations for the caller's organization.

```json
// Response 200
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

Note this shape has no `token` field — a list of everyone currently invited shouldn't expose raw
invitation tokens.

**DELETE /api/invitations/{invitationId}**

Revokes a pending invitation by deleting it outright. Only invitations still `PENDING` can be
revoked. Response `204 No Content`.

---

## Role & Permission Endpoints

*JWT required.*

| Method | Endpoint | Permission |
|---|---|---|
| POST | `/api/roles` | `ROLE_CREATE` |
| GET | `/api/roles` | `ROLE_READ` or `ROLE_MANAGE` or `PERMISSION_MANAGE` or `ADMIN_TRANSFER` or `ROLE_DELETE` or `ROLE_CREATE` or `USER_INVITE` |
| POST | `/api/roles/{roleId}/assign/{userId}` | `ROLE_MANAGE` |
| DELETE | `/api/roles/{roleId}/unassign/{userId}` | `ROLE_MANAGE` |
| POST | `/api/roles/{roleId}/permissions/{permissionId}` | `PERMISSION_MANAGE` |
| DELETE | `/api/roles/{roleId}/permissions/{permissionId}` | `PERMISSION_MANAGE` |
| GET | `/api/roles/{roleId}/permissions` | `ROLE_READ` or `PERMISSION_MANAGE` |
| POST | `/api/roles/transfer-admin/{newUserId}` | `ADMIN_TRANSFER` |
| DELETE | `/api/roles/{roleId}` | `ROLE_DELETE` |

`GET /api/roles` is the widest OR-gate in the system by design — every permission whose action
targets a role by ID needs this page reachable, including `USER_INVITE`, which needs it to
populate the invitation role picker. See `docs/design-decisions.md` for the reasoning.

**POST /api/roles**

```json
// Request
{ "name": "ReadOnly" }
```

```json
// Response 201
{
    "id": 2,
    "name": "ReadOnly",
    "orgId": 1,
    "createdAt": "2026-06-29T12:00:00"
}
```

**POST /api/roles/{roleId}/assign/{userId}** — no request body; both are path variables. Response
`200`.

**POST / DELETE /api/roles/{roleId}/permissions/{permissionId}** — no request body; both are path
variables. Response `204 No Content`.

**GET /api/roles/{roleId}/permissions**

```json
// Response 200
[
    { "id": 2, "code": "RESOURCE_READ", "description": "Can read resources" }
]
```

**POST /api/roles/transfer-admin/{newUserId}** — no request body. Transfers Admin from the caller
to the target user atomically; the caller loses Admin, the target gains it. Response
`204 No Content`.

**DELETE /api/roles/{roleId}** — rejected with `400` if the role is Admin or No Access, or if it
still has members assigned. Response `204 No Content` on success.

---

## User & Membership Endpoints

*JWT required.*

| Method | Endpoint | Permission |
|---|---|---|
| GET | `/api/users` | `ROLE_READ` or `ROLE_MANAGE` or `ADMIN_TRANSFER` or `USER_DEACTIVATE` |
| GET | `/api/users/basic-info` | None — self-serve, `id` + `email` only |
| GET | `/api/users/me-permissions` | None — self-serve, caller's own permissions only |
| GET | `/api/users/me-roles` | None — self-serve, caller's own role names only |
| PATCH | `/api/users/{userId}/deactivate` | `USER_DEACTIVATE` |

**GET /api/users**

```json
// Response 200
[
    {
        "id": 2,
        "email": "priya@acme.com",
        "status": "ACTIVE",
        "roles": ["ReadOnly"],
        "createdAt": "2026-06-29T12:51:47.842"
    }
]
```

**GET /api/users/basic-info**

```json
// Response 200
[ { "id": 2, "email": "priya@acme.com" } ]
```

No roles or status — just enough to resolve an owner or actor column to a real email address.
Deliberately has no `@PreAuthorize`; see `docs/design-decisions.md`.

**GET /api/users/me-permissions**

```json
// Response 200
["RESOURCE_READ", "RESOURCE_CREATE"]
```

The caller's own merged permission codes, resolved across every role they hold. Also has no
`@PreAuthorize` by design — its purpose is answering "what am I allowed to do" before any specific
permission is known to be held.

**PATCH /api/users/{userId}/deactivate**

No request body. Rejected with `400` if the caller targets themself, targets the current Admin, or
targets an already-disabled user. `404` if the target doesn't exist or belongs to another
organization. Response `204 No Content` on success.

---

## Resource Endpoints

*JWT required.*

| Method | Endpoint | Permission |
|---|---|---|
| POST | `/api/resources` | `RESOURCE_CREATE` |
| GET | `/api/resources` | `RESOURCE_READ` or `RESOURCE_UPDATE` or `RESOURCE_DELETE` |
| GET | `/api/resources/{id}` | `RESOURCE_READ` |
| PUT | `/api/resources/{id}` | `RESOURCE_UPDATE` |
| DELETE | `/api/resources/{id}` | `RESOURCE_DELETE` |
| GET | `/api/resources/search?name=` | `RESOURCE_READ` |

`RESOURCE_CREATE` is deliberately excluded from the `GET /api/resources` gate — a
`RESOURCE_CREATE`-only user can create resources but not view the list.

**POST /api/resources**

```json
// Request
{
    "name": "Primary Database",
    "description": "Main production database"
}
```

```json
// Response 201
{
    "id": 1,
    "orgId": 1,
    "name": "Primary Database",
    "description": "Main production database",
    "ownerUserId": 1,
    "createdAt": "2026-06-29T12:00:00"
}
```

**PUT /api/resources/{id}** — same request/response shape as create, with updated fields.

**DELETE /api/resources/{id}** — Response `204 No Content`.

**GET /api/resources?page=0&size=10** — paginated, `page` is 0-indexed, `size` defaults to 10.

```json
// Response 200
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

Results are sorted by `createdAt` descending.

**GET /api/resources/search?name=database** — returns the full matching set, unpaginated, scoped
to the caller's organization.

---

## Audit Log Endpoints

*JWT required.*

| Method | Endpoint | Permission |
|---|---|---|
| GET | `/api/audit-logs` | `AUDIT_VIEW` |

Paginated, `page` 0-indexed, `size` defaults to 20.

```json
// Response 200
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
            "timestamp": "2026-06-29T12:51:47.842"
        }
    ],
    "totalElements": 67,
    "totalPages": 4,
    "number": 0,
    "size": 20
}
```

Sorted by `timestamp` descending, scoped to the caller's organization. Filtering by action type or
actor is currently client-side only — see the README's Known Limitations section.

Actions logged automatically: `INVITE_SENT`, `INVITE_REVOKED`, `RESOURCE_CREATED`,
`RESOURCE_UPDATED`, `RESOURCE_DELETED`, `ROLE_CREATED`, `ROLE_DELETED`, `ROLE_ASSIGNED`,
`ROLE_UNASSIGNED`, `PERMISSION_ASSIGNED`, `PERMISSION_REMOVED`, `ADMIN_TRANSFERRED`,
`USER_DEACTIVATED`. `USER_JOINED` is logged manually, since `acceptInvitation` is public and has no
authenticated principal for the aspect to read.

---

## Usage Endpoint

*JWT required, no permission needed.*

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/usage` | Returns the caller's organization's current rate limit status |

```json
// Response 200
{
    "orgId": 1,
    "limitPerMinute": 100,
    "tokensRemaining": 88.33
}
```

`tokensRemaining` is calculated live at request time, reflecting any refill since the last
rate-limited request. This endpoint is excluded from rate limiting itself, so checking usage
never consumes a token.

---

## Testing the API

**Getting a token locally:**

```bash
curl -X POST http://localhost:8080/api/auth/register-org \
  -H "Content-Type: application/json" \
  -d '{"orgName":"Acme Corp","adminEmail":"alice@acme.com","password":"password123"}'

curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@acme.com","password":"password123","orgSlug":"acme-corp"}'
```

Copy the `token` from the login response and attach it to every subsequent request:

```bash
curl http://localhost:8080/api/resources \
  -H "Authorization: Bearer <token>"
```

**Testing permission boundaries:** the most reliable way to verify a permission gate is to create
a role with exactly one permission, assign it to a test user, and confirm both that the intended
endpoint succeeds and that adjacent endpoints correctly return `403`. This is the same approach
used during manual QA to verify all 13 permission codes independently — see
`docs/design-decisions.md` for the full methodology.

**Automated tests:** the integration suite (`RbacRegressionTest.java`) runs against real local
MySQL and Redis containers rather than mocks:

```bash
docker compose up -d
cd backend
./mvnw test
```

**Rate limiting:** to observe the token bucket in action, send repeated requests to any endpoint
in a tight loop — a Postman Runner or a simple shell loop both work — until a `429` appears, then
call `GET /api/usage` to confirm `tokensRemaining` reflects the exhausted state and recovers over
time.
