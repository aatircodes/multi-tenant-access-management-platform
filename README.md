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

The 9 system-level permissions:

| Code | Description |
|---|---|
| RESOURCE_CREATE | Create resources |
| RESOURCE_READ | Read resources |
| RESOURCE_UPDATE | Update resources |
| RESOURCE_DELETE | Delete resources |
| ROLE_CREATE | Create roles |
| ROLE_READ | Read roles |
| ROLE_ASSIGN | Assign roles and permissions |
| USER_INVITE | Invite users |
| AUDIT_VIEW | View audit logs |

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
| resources | Tenant-scoped business objects |
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
| GET | /api/resources | RESOURCE_READ |
| GET | /api/resources/{id} | RESOURCE_READ |
| PUT | /api/resources/{id} | RESOURCE_UPDATE |
| DELETE | /api/resources/{id} | RESOURCE_DELETE |
| GET | /api/resources/search?name= | RESOURCE_READ |

**POST /api/resources**

Request:
```json
{
    "name": "Primary Database",
    "type": "DATABASE",
    "description": "Main production database"
}
```

Response `201`:
```json
{
    "id": 1,
    "orgId": 1,
    "name": "Primary Database",
    "ownerUserId": 1,
    "createdAt": "2026-06-29T12:00:00"
}
```

**PUT /api/resources/{id}**

Request:
```json
{
    "name": "Primary Database — Updated",
    "type": "DATABASE",
    "description": "Updated description"
}
```

Response `200` — same shape as the create response with updated fields.

**DELETE /api/resources/{id}**

Response `204 No Content` — no body returned.

**GET /api/resources/search?name=database**

Response `200`:
```json
[
    {
        "id": 1,
        "orgId": 1,
        "name": "Primary Database",
        "ownerUserId": 1,
        "createdAt": "2026-06-29T12:00:00"
    }
]
```

Results are filtered by name within the caller's org only.

---

### Roles — JWT required

| Method | Endpoint | Permission |
|---|---|---|
| POST | /api/roles | ROLE_CREATE |
| GET | /api/roles | ROLE_READ |
| POST | /api/roles/{roleId}/assign/{userId} | ROLE_ASSIGN |
| POST | /api/roles/{roleId}/permissions/{permissionId} | ROLE_ASSIGN |
| GET | /api/roles/{roleId}/permissions | ROLE_READ |

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

---

### Invitations — JWT required

| Method | Endpoint | Permission |
|---|---|---|
| POST | /api/invitations | USER_INVITE |

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
    "token": "9f0ab181-eed3-47e1-8a04-750b2a6ac0a7",
    "email": "bob@acme.com",
    "expiresAt": "2026-07-01T13:28:55.317"
}
```

---

### Audit Logs — JWT required

| Method | Endpoint | Permission |
|---|---|---|
| GET | /api/audit-logs | AUDIT_VIEW |

Response `200`:
```json
[
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
]
```

Results are ordered by timestamp descending and scoped to the caller's org.

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
| 6 | React Frontend — login, resources, roles, invitations, audit log | Pending |
| 7 | Tests — tenant isolation, RBAC, rate limiting | Pending |
| 8 | Docker + Deploy — multi-stage Dockerfile, Render/Railway | Pending |

---

## Setup and Running Locally

*To be filled in after Phase 8.*

---

## Live Demo

*To be filled in after Phase 8.*