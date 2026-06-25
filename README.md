# Multi-Tenant Access Management Platform with Rate Limiting

A backend platform where multiple organizations share the same application and database,
with complete data isolation enforced through three independent layers — a Hibernate-level
filter, a service-layer ownership check, and JWT-derived tenant context. Built with
Spring Boot, Spring Security, Redis, and React.

## Tech Stack

- **Backend:** Java, Spring Boot, Spring Security, Spring Data JPA, Hibernate, MySQL
- **Auth:** JWT (stateless), BCrypt
- **Rate Limiting:** Redis (Token Bucket + Sliding Window)
- **Frontend:** React (Vite), Axios
- **Infra:** Docker
- **Testing:** JUnit 5, Spring Boot Test

## Features

- Multi-tenant architecture with shared schema and complete data isolation
- JWT-based stateless authentication
- Data-driven RBAC — organizations define custom roles and permissions at runtime
- Invitation-based user onboarding with token expiry
- Immutable audit logging for all role, permission, and resource changes
- Tenant-aware rate limiting with runtime-configurable quotas per organization
- Two rate limiting algorithms: Token Bucket and Sliding Window

## Architecture

### Tenant Isolation — three independent layers
Layer 1 → Hibernate session-level @Filter (auto-scoped by org_id from JWT)
Layer 2 → Service-layer ownership assertion on every fetch-by-ID
Layer 3 → org_id never accepted from client — always JWT-derived

Cross-tenant access always returns **404**, never 403.
404 leaks no information about whether the resource exists in another org.
403 would confirm existence — a security vulnerability.

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

### Error response
```json
{
    "status": 400,
    "message": "Invalid credentials",
    "timestamp": "2026-06-25T12:31:23"
}
```

---

## Design Decisions

### Why shared schema over schema-per-tenant?
*To be filled in after Phase 2*

### Why 404 instead of 403 for cross-tenant access?
*To be filled in after Phase 2*

### Why Hibernate filter over manual per-method scoping?
*To be filled in after Phase 2*

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
| Phase 2 — Tenant Isolation | 🔄 In Progress |
| Phase 3 — RBAC | ⬜ Pending |
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
