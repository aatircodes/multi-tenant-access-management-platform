# Multi-Tenant Access Management Platform with Rate Limiting

A backend platform where multiple organizations share the same application and database,
with complete data isolation enforced through three independent layers — a Hibernate-level
filter, a service-layer ownership check, and JWT-derived tenant context. Built with
Spring Boot, Spring Security, Redis, and React.

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
- **Auth:** JWT (stateless), BCrypt
- **Rate Limiting:** Redis (Token Bucket + Sliding Window)
- **Frontend:** React (Vite), Axios
- **Infra:** Docker
- **Testing:** JUnit 5, Spring Boot Test

---

## Features

- Multi-tenant architecture with shared schema and complete data isolation
- JWT-based stateless authentication
- Data-driven RBAC — organizations define custom roles and permissions at runtime
- Invitation-based user onboarding with token expiry
- Immutable audit logging for all role, permission, and resource changes
- Tenant-aware rate limiting with runtime-configurable quotas per organization
- Two rate limiting algorithms: Token Bucket and Sliding Window

---

## Architecture

### Tenant Isolation — three independent layers

Layer 1 → Hibernate session-level @Filter (auto-scoped by org_id from JWT)
Layer 2 → Service-layer ownership assertion on every fetch-by-ID
Layer 3 → org_id never accepted from client — always JWT-derived

Cross-tenant access always returns **404**, never 403.
- 404 leaks no information about whether the resource exists in another org
- 403 would confirm existence — a security vulnerability

### Request pipeline order

Rate Limit Check
↓
Tenant Scoping (Hibernate Filter)
↓
Permission Check (@PreAuthorize)
↓
Business Logic

### Data-driven RBAC

Roles and permissions are runtime data per org, not hardcoded enums.
An org admin can create custom roles and assign permissions without any code change.
Enforced via a custom Spring Security PermissionEvaluator.

### Rate Limiting

Redis-backed quota keyed by org_id, pulled from Organization.requestLimitPerMinute
on every check — not cached at startup, so limit changes take effect immediately.
Returns 429 with Retry-After and X-RateLimit-Remaining headers.

---

## Database Schema

| Table | Purpose |
|---|---|
| organizations | Tenant root — holds name, slug, status, requestLimitPerMinute |
| users | Scoped per org — email unique per org, not globally |
| roles | Org-scoped custom roles |
| permissions | Global permission catalog |
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
| POST | /api/auth/register-org | Register new organization + first admin user |
| POST | /api/auth/login | Login with email + password + orgSlug |

### Register Org — request body
```json
{
    "orgName": "Acme Corp",
    "adminEmail": "alice@gmail.com",
    "password": "password123"
}
```

### Register Org — response (201 Created)
```json
{
    "token": "eyJhbGci...",
    "orgSlug": "acme-corp",
    "orgName": "Acme Corp",
    "orgId": 1,
    "userId": 1,
    "email": "alice@gmail.com"
}
```

### Login — request body
```json
{
    "email": "alice@gmail.com",
    "password": "password123",
    "orgSlug": "acme-corp"
}
```

### Login — response (200 OK)
```json
{
    "token": "eyJhbGci...",
    "orgSlug": "acme-corp",
    "orgName": "Acme Corp",
    "orgId": 1,
    "userId": 1,
    "email": "alice@gmail.com"
}
```

### Resources (JWT required)

| Method | Endpoint | Description |
|---|---|---|
| POST | /api/resources | Create a resource |
| GET | /api/resources | Get all resources (tenant-scoped) |
| GET | /api/resources/{id} | Get resource by ID |
| PUT | /api/resources/{id} | Update resource |
| DELETE | /api/resources/{id} | Delete resource |
| GET | /api/resources/search?name= | Search resources by name |

### Error response
```json
{
    "status": 400,
    "message": "Invalid credentials",
    "timestamp": "2026-06-25T12:31:23"
}
```

---

## Test Coverage

### Phase 1 — Auth (all passing ✅)

| Test | Expected | Result |
|---|---|---|
| Register org | 201 + JWT returned | ✅ |
| Login | 200 + JWT returned | ✅ |
| Wrong password | 400 "Invalid credentials" | ✅ |
| Wrong org slug | 400 "Invalid credentials" | ✅ |
| Empty password | 400 validation error | ✅ |
| Duplicate org registration | 400 "Organization name already exists" | ✅ |

### Phase 2 — Tenant Isolation (all passing ✅)

| Test | Expected | Result |
|---|---|---|
| Create resource | 201, orgId from JWT not request body | ✅ |
| Get all resources | 200, only own tenant's resources returned | ✅ |
| Get resource by ID | 200, correct resource returned | ✅ |
| Update resource | 200, name updated | ✅ |
| Search by name | 200, filtered results within tenant | ✅ |
| Cross-tenant access (HealthCorp token → TechCorp resource) | 404 not 403 | ✅ |

---

## Design Decisions

### Why shared schema over schema-per-tenant?
Shared schema scales better operationally — one database, one schema, one deployment.
Schema-per-tenant multiplies maintenance overhead with every new org. Row-level isolation
via Hibernate filters gives the same security guarantees at a fraction of the complexity.

### Why 404 instead of 403 for cross-tenant access?
A 403 confirms the resource exists but the caller can't access it — leaking information
to an attacker. A 404 reveals nothing. This is standard security practice for
multi-tenant systems where existence itself is sensitive information.

### Why Hibernate filter over manual per-method scoping?
Manual scoping means every developer must remember to add a tenant check to every
new query — one missed call leaks data. A Hibernate filter applies automatically
at the session level before any query runs. It's a single point of enforcement
that can't be forgotten.

### Why Redis over in-memory counter for rate limiting?
*To be filled in after Phase 5*

### Token Bucket vs Sliding Window — which is default and why?
*To be filled in after Phase 5*

---

## Build Progress

| Phase | Status |
|---|---|
| Phase 0 — Setup | ✅ Complete |
| Phase 1 — Auth + Entities | ✅ Complete |
| Phase 2 — Tenant Isolation | ✅ Complete |
| Phase 3 — RBAC | 🔄 Next |
| Phase 4 — Invitations + Audit | ⬜ Pending |
| Phase 5 — Rate Limiting | ⬜ Pending |
| Phase 6 — React Frontend | ⬜ Pending |
| Phase 7 — Tests | ⬜ Pending |
| Phase 8 — Docker + Deploy | ⬜ Pending |

---

## Setup & Running Locally

*To be filled in after Phase 8*

---

## Live Demo

*To be filled in after Phase 8*