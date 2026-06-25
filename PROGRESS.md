# Progress Tracker

## Project
Multi-Tenant Access Management Platform with Rate Limiting

## Repo
github.com/aatircodes/multi-tenant-access-management-platform

## Package name
saas_access_platform

## Current branch
main

## Approach
Build just-in-time — Controller → Service → Repository (request flow),
test in Postman before moving to next phase.

---

## Completed

### Phase 0 — Setup ✅
- Spring Boot project initialized
- application.yml configured (MySQL + JWT config)
- docker-compose.yml created (MySQL + Redis for later)
- .gitignore configured
- README.md created
- PROGRESS.md created
- data.sql created (seeds 6 permissions on startup)

### Phase 1 — Auth + Foundation ✅

#### Entities (9/9)
1. Organization.java
2. User.java
3. Role.java
4. Permission.java
5. RolePermission.java
6. UserRole.java
7. Resource.java
8. Invitation.java
9. AuditLog.java

#### Repositories (9/9)
1. OrganizationRepository.java
2. UserRepository.java
3. RoleRepository.java
4. PermissionRepository.java
5. RolePermissionRepository.java
6. UserRoleRepository.java
7. ResourceRepository.java
8. InvitationRepository.java
9. AuditLogRepository.java

#### Request DTOs (8/8)
1. RegisterOrgRequest.java
2. LoginRequest.java (includes orgSlug field)
3. InviteUserRequest.java
4. AcceptInvitationRequest.java
5. CreateRoleRequest.java
6. AssignPermissionsRequest.java
7. UpdateOrgSettingsRequest.java
8. CreateResourceRequest.java

#### Response DTOs (2/2)
1. AuthResponse.java (token + orgSlug + orgName + orgId + userId + email)
2. ErrorResponse.java (status + message + timestamp)

#### Security Layer (4/4)
1. SecurityConfig.java (stateless JWT, /api/auth/** public)
2. JwtUtil.java (generate + parse + validate + extractOrgId)
3. JwtAuthFilter.java (reads JWT, builds CurrentUserContext as principal)
4. CurrentUserContext.java (carries userId, orgId, email, roles)

#### Service + Controller (1/1)
1. AuthService.java (registerOrg + login)
2. AuthController.java (POST /api/auth/register-org, POST /api/auth/login)

#### Exception Handling (1/1)
1. GlobalExceptionHandler.java

#### Postman Tests (all passing ✅)
- Register org → 201 + JWT returned
- Login → 200 + JWT returned
- Wrong password → 400 "Invalid credentials"
- Wrong org slug → 400 "Invalid credentials"
- Empty password → 400 validation error
- Duplicate org registration → 400 "Organization name already exists"

---

### Phase 2 — Tenant Isolation ✅ (pending Postman tests)

#### Package structure

saas_access_platform/
├── config/
│   ├── SecurityConfig.java
│   └── TenantFilterConfig.java
├── context/
│   └── TenantContext.java
├── controller/
│   ├── AuthController.java
│   └── ResourceController.java
├── dto/
│   └── request/
│       └── UpdateResourceRequest.java (+ all Phase 1 DTOs)
├── entity/
│   └── Resource.java (updated with @FilterDef + @Filter)
├── exception/
│   ├── GlobalExceptionHandler.java
│   └── ResourceNotFoundException.java
├── repository/
│   └── ResourceRepository.java
├── security/
│   ├── CurrentUserContext.java
│   ├── JwtAuthFilter.java
│   ├── JwtUtil.java
│   └── TenantFilter.java
└── service/
└── ResourceService.java

#### Built (7/7)
1. TenantContext.java — ThreadLocal orgId holder, lives in context/, uses .remove() for cleanup
2. TenantFilter.java — OncePerRequestFilter, extracts orgId from JWT, sets TenantContext, clears in finally
3. SecurityConfig.java — updated, TenantFilter registered after JwtAuthFilter via addFilterAfter
4. Resource.java — updated with @FilterDef + @Filter, condition: WHERE org_id = :orgId
5. TenantFilterConfig.java — AOP @Before bean, enables Hibernate filter on every repository call
6. UpdateResourceRequest.java — new request DTO
7. ResourceController.java — 6 endpoints: create, getAll, getById, update, delete, search
8. ResourceNotFoundException.java — in exception/
9. ResourceService.java — tenant-scoped CRUD + search, orgId always from CurrentUserContext

#### Key design decisions
- orgId is NEVER accepted from client — always from JWT via CurrentUserContext
- getResourceById uses findByIdAndOrgId → 404 not 403 on cross-tenant access
- Two layers of isolation: Hibernate @Filter (implicit) + service ownership check (explicit)
- TenantContext in context/ (Spring Security unaware) vs CurrentUserContext in security/ (Spring Security aware)
- TenantFilter try/finally guarantees ThreadLocal cleanup even on exceptions

#### Postman Tests (pending ✅)
- [ ] Create resource → 201
- [ ] Get all resources → only own tenant's resources returned
- [ ] Get resource by ID → 200
- [ ] Get resource by ID (cross-tenant) → 404
- [ ] Update resource → 200
- [ ] Delete resource → 204
- [ ] Search by name → filtered results

---

## Next — Phase 3: RBAC

### What to build
- [ ] CustomPermissionEvaluator.java
- [ ] @PreAuthorize on resource endpoints
- [ ] Role management endpoints (create role, assign permissions)
- [ ] Permission boundary test (403 for wrong role)

---

## Remaining Phases

### Phase 4 — Invitations + Audit Log
- [ ] InvitationService + InvitationController
- [ ] Token generation + expiry logic
- [ ] AuditAspect.java (AOP-based logging)
- [ ] AuditLogController (admin-only viewer)

### Phase 5 — Rate Limiting
- [ ] Install and configure Redis
- [ ] RateLimitFilter.java
- [ ] TokenBucketLimiter.java
- [ ] SlidingWindowLimiter.java
- [ ] Lua script for atomic Redis increment
- [ ] 429 response with Retry-After + X-RateLimit-Remaining headers
- [ ] UsageController (/api/usage endpoint)

### Phase 6 — React Frontend
- [ ] Initialize React app (Vite)
- [ ] Axios client with JWT interceptor
- [ ] AuthContext
- [ ] Login + Register screens
- [ ] Resource CRUD screens
- [ ] Role/permission management UI
- [ ] Invitation flow UI
- [ ] Usage dashboard
- [ ] Audit log viewer

### Phase 7 — Tests
- [ ] Cross-tenant fetch returns 404
- [ ] Cross-tenant write rejected
- [ ] Filter bypass regression test
- [ ] org_id injection ignored
- [ ] Wrong role returns 403
- [ ] Quota enforcement returns 429
- [ ] Quota isolation between orgs
- [ ] Live limit update test

### Phase 8 — Docker + Deploy
- [ ] Multi-stage Dockerfile
- [ ] Add app to docker-compose
- [ ] Deploy to Render/Railway
- [ ] Add live demo link to README