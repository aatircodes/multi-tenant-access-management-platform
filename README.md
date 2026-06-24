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
1. Hibernate session-level `@Filter` auto-scoped by `org_id` from JWT
2. Service-layer ownership assertion on every fetch-by-ID
3. `org_id` never accepted from client — always JWT-derived
4. Cross-tenant access returns **404** (not 403 — no existence leakage)

### Request Pipeline Order

Rate Limit Check → Tenant Scoping → Permission Check → Business Logic

### Data-Driven RBAC
Roles and permissions are runtime data per org, not hardcoded enums.
Enforced via a custom Spring Security `PermissionEvaluator`.

### Rate Limiting
Redis-backed, quota keyed by `org_id`, pulled from
`Organization.requestLimitPerMinute` on every check.
Returns `429` with `Retry-After` and `X-RateLimit-Remaining` headers.

## Database Schema

9 entities:
- `organizations` — tenant root, holds `requestLimitPerMinute`
- `users` — scoped per org, email unique per org (not globally)
- `roles` — org-scoped custom roles
- `permissions` — global catalog
- `role_permissions` — maps permissions to roles
- `user_roles` — maps roles to users
- `resources` — tenant-scoped business objects
- `invitations` — token-based invite flow with expiry
- `audit_logs` — immutable append-only change history

Rate Limit Check → Tenant Scoping → Permission Check → Business Logic

## Design Decisions

### Why shared schema over schema-per-tenant?
*[To be filled in after Phase 2]*

### Why 404 instead of 403 for cross-tenant access?
*[To be filled in after Phase 2]*

### Why Hibernate filter over manual per-method scoping?
*[To be filled in after Phase 2]*

### Why Redis over in-memory counter for rate limiting?
*[To be filled in after Phase 5]*

### Token Bucket vs Sliding Window — which and why?
*[To be filled in after Phase 5]*

## API Endpoints

*[To be filled in after Phase 1 is complete]*

## Setup & Running Locally

*[To be filled in after Phase 8]*

## Live Demo

*[To be filled in after Phase 8]*
