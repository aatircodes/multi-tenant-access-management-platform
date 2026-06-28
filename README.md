# Multi-Tenant Access Management Platform with Rate Limiting

A production-grade backend platform where multiple organizations share the same application
and database, with complete data isolation enforced through three independent layers —
a Hibernate session-level filter, a service-layer ownership assertion, and JWT-derived
tenant context that is never accepted from the client.

Built with Java 21, Spring Boot 3.4.5, Spring Security, Redis, and React.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Design Decisions](#design-decisions)
7. [Build Progress](#build-progress)
8. [Setup & Running Locally](#setup--running-locally)
9. [Live Demo](#live-demo)

---

## Tech Stack

- **Backend:** Java 21, Spring Boot 3.4.5, Spring Security, Spring Data JPA, Hibernate, MySQL
- **Auth:** JWT (stateless, HS384), BCrypt
- **Rate Limiting:** Redis (Token Bucket + Sliding Window)
- **Frontend:** React (Vite), Axios
- **Infra:** Docker, Docker Compose
- **Testing:** JUnit 5, Spring Boot Test

---

## Features

- Multi-tenant architecture with shared schema and complete row-level data isolation
- JWT-based stateless authentication with org-scoped token claims
- Data-driven RBAC — organizations define custom roles and assign permissions at runtime without any code change
- Invitation-based user onboarding with single-use tokens and 48-hour expiry
- Immutable audit logging for all role, permission, and resource mutations via AOP
- Tenant-aware rate limiting with runtime-configurable quotas per organization
- Two rate limiting algorithms: Token Bucket and Sliding Window

---

## Architecture

### Tenant isolation — three independent layers

Layer 1 — Hibernate @Filter (session-level, auto-scoped by org_id from JWT)
Layer 2 — Service-layer ownership assertion on every fetch-by-ID
Layer 3 — org_id never accepted from client — always JWT-derived

Cross-tenant access returns 404, not 403.
A 403 confirms the resource exists but is inaccessible — leaking information to an attacker.
A 404 reveals nothing. This is standard practice in multi-tenant systems where existence itself is sensitive.

### Request pipeline

JWT Auth (JwtAuthFilter)
|
Tenant Scoping (TenantFilter → sets TenantContext)
|
Permission Check (@PreAuthorize → CustomPermissionEvaluator)
|
Business Logic (Service layer)
|
Rate Limit Check (Phase 5)

### Data-driven RBAC

Roles and permissions are runtime data per organization, not hardcoded enums.
An org admin creates roles, assigns permissions to them, and assigns roles to users —
all through API calls. The permission check resolves at runtime:

userId → UserRole → roleIds → RolePermission → permissionCode

Enforced via a custom Spring Security PermissionEvaluator wired into @PreAuthorize.

### Rate limiting

Redis-backed quota keyed by org_id, pulled from Organization.requestLimitPerMinute
on every request — not cached at startup, so quota changes take effect immediately
without a restart. Returns 429 with Retry-After and X-RateLimit-Remaining headers.

---

## Database Schema

| Table | Purpose |
|---|---|
| organizations | Tenant root — name, slug, status, requestLimitPerMinute |
| users | Scoped per org — email unique per org, not globally |
| roles | Org-scoped custom roles |
| permissions | Global permission catalog (system-level, not org-scoped) |
| role_permissions | Maps permissions to roles |
| user_roles | Maps roles to users, tracks assignedAt |
| resources | Tenant-scoped business objects |
| invitations | Token-based invite flow with 48hr expiry |
| audit_logs | Immutable append-only change history |

---

## API Endpoints

### Auth (public — no JWT required)

| Method | Endpoint | Description |
|---|---|---|
| POST | /api/auth/register-org | Register new organization and first admin user |
| POST | /api/auth/login | Login with email, password, and orgSlug |
| POST | /api/auth/accept-invitation | Accept invitation and create account |

**Register org — request**
```json
{
    "orgName": "Acme Corp",
    "adminEmail": "alice@acme.com",
    "password": "password123"
}
```

**Register org — response (201)**
```json
{
    "message": "Organisation registered successfully",
    "orgSlug": "acme-corp"
}
```

**Login — request**
```json
{
    "email": "alice@acme.com",
    "password": "password123",
    "orgSlug": "acme-corp"
}
```

**Login — response (200)**
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

### Resources (JWT required)

| Method | Endpoint | Permission required |
|---|---|---|
| POST | /api/resources | RESOURCE_CREATE |
| GET | /api/resources | RESOURCE_READ |
| GET | /api/resources/{id} | RESOURCE_READ |
| PUT | /api/resources/{id} | RESOURCE_UPDATE |
| DELETE | /api/resources/{id} | RESOURCE_DELETE |
| GET | /api/resources/search?name= | RESOURCE_READ |

### Roles (JWT required)

| Method | Endpoint | Permission required |
|---|---|---|
| POST | /api/roles | ROLE_CREATE |
| GET | /api/roles | ROLE_READ |
| POST | /api/roles/{roleId}/assign/{userId} | ROLE_ASSIGN |
| POST | /api/roles/{roleId}/permissions/{permissionId} | ROLE_ASSIGN |
| GET | /api/roles/{roleId}/permissions | ROLE_READ |

### Invitations (JWT required)

| Method | Endpoint | Permission required |
|---|---|---|
| POST | /api/invitations | USER_INVITE |

### Audit Logs (JWT required)

| Method | Endpoint | Permission required |
|---|---|---|
| GET | /api/audit-logs | AUDIT_VIEW |

### Error response
```json
{
    "status": 400,
    "message": "Invalid credentials",
    "timestamp": "2026-06-28T15:18:52"
}
```

---

## Test Coverage

### Phase 1 — Auth

| Test | Expected | Status |
|---|---|---|
| Register org | 201 + message + orgSlug | Passed |
| Login | 200 + JWT | Passed |
| Wrong password | 400 "Invalid credentials" | Passed |
| Wrong org slug | 400 "Invalid credentials" | Passed |
| Empty password | 400 validation error | Passed |
| Duplicate org registration | 400 "Organization name already exists" | Passed |

### Phase 2 — Tenant Isolation

| Test | Expected | Status |
|---|---|---|
| Create resource | 201, orgId from JWT not request body | Passed |
| Get all resources | 200, only own tenant's resources returned | Passed |
| Get resource by ID | 200 | Passed |
| Update resource | 200 | Passed |
| Search by name | 200, filtered within tenant | Passed |
| Cross-tenant access | 404 not 403 | Passed |

### Phase 3 — RBAC

| Test | Expected | Status |
|---|---|---|
| Create role | 201 | Passed |
| Get all roles | 200, only org's roles | Passed |
| Assign permission to role | 204 | Passed |
| Duplicate permission assignment | 409 Conflict | Passed |
| Get role permissions | 200 | Passed |
| VIEWER access to read endpoint | 200 | Pending Phase 4 |
| VIEWER access to write endpoint | 403 | Pending Phase 4 |

---

## Design Decisions

### Why shared schema over schema-per-tenant?
Shared schema scales better operationally — one database, one schema, one deployment.
Schema-per-tenant multiplies maintenance overhead with every new organization added.
Row-level isolation via Hibernate filters gives the same security guarantees at a fraction
of the operational complexity.

### Why 404 instead of 403 for cross-tenant access?
A 403 confirms the resource exists but the caller cannot access it — leaking information
to an attacker. A 404 reveals nothing. Standard practice for multi-tenant systems where
resource existence itself is sensitive information.

### Why Hibernate filter over manual per-method scoping?
Manual scoping means every developer must remember to add a tenant check to every new query.
One missed call leaks data across tenants. A Hibernate filter applies automatically at the
session level before any query executes — a single enforcement point that cannot be forgotten.

### Why data-driven RBAC over hardcoded roles?
Hardcoded roles (ADMIN, USER, VIEWER as enums) require a code change and redeployment to add
a new role. Data-driven RBAC lets org admins define their own roles and permissions through
the API at runtime. This is how real SaaS platforms like Stripe and Notion handle access control.

### Why no open user registration?
There is no public registration endpoint for regular users. The only way to join an organization
is through an admin-initiated invitation. This prevents unauthorized users from joining a tenant
and keeps the org boundary strict.

### Why Redis over in-memory counter for rate limiting?
*To be filled in after Phase 5*

### Token Bucket vs Sliding Window — which is default and why?
*To be filled in after Phase 5*

---

## Build Progress

| Phase | Status |
|---|---|
| Phase 0 — Setup | Complete |
| Phase 1 — Auth + Entities | Complete |
| Phase 2 — Tenant Isolation | Complete |
| Phase 3 — RBAC | Complete |
| Phase 4 — Invitations + Audit Log | In progress |
| Phase 5 — Rate Limiting | Pending |
| Phase 6 — React Frontend | Pending |
| Phase 7 — Tests | Pending |
| Phase 8 — Docker + Deploy | Pending |

---

## Setup & Running Locally

*To be filled in after Phase 8*

---

## Live Demo

*To be filled in after Phase 8*