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
one endpoint at a time (Controller + Service together), test in Postman before moving to next phase.

---

## Completed

### Phase 0 — Setup ✅
- Spring Boot 3.4.5 + Java 21 project initialized
- application.yml configured (MySQL + JWT config)
- docker-compose.yml created (MySQL + Redis for later), moved to repo root
- .gitignore configured at repo root (monorepo structure)
- README.md created, moved to repo root
- PROGRESS.md created, moved to repo root
- data.sql created (seeds 9 permissions on startup)

---

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
2. LoginRequest.java (email + password + orgSlug)
3. InviteUserRequest.java
4. AcceptInvitationRequest.java
5. CreateRoleRequest.java
6. AssignPermissionsRequest.java
7. UpdateOrgSettingsRequest.java
8. CreateResourceRequest.java

#### Response DTOs (4/4)
1. LoginResponse.java (token + orgSlug + orgName + orgId + userId + email)
2. RegisterOrgResponse.java (message + orgSlug)
3. ErrorResponse.java (status + message + timestamp)
4. RoleResponse.java (id + name + orgId + createdAt)

#### Security Layer (4/4)
1. SecurityConfig.java (stateless JWT, /api/auth/** public)
2. JwtUtil.java (generate + parse + validate + extractOrgId + extractUserId + extractEmail + extractRoles)
3. JwtAuthFilter.java (reads JWT, builds CurrentUserContext as principal)
4. CurrentUserContext.java (carries userId, orgId, email, roles)

#### Service + Controller (2/2)
1. AuthService.java
   - registerOrg → provisions org, creates Admin role with all permissions, returns RegisterOrgResponse (no token)
   - login → validates credentials, returns LoginResponse with JWT
2. AuthController.java
   - POST /api/auth/register-org → 201 RegisterOrgResponse
   - POST /api/auth/login → 200 LoginResponse

#### Exception Handling (1/1)
1. GlobalExceptionHandler.java

#### Postman Tests (all passing ✅)
- Register org → 201 + message + orgSlug
- Login → 200 + JWT
- Wrong password → 400 "Invalid credentials"
- Wrong org slug → 400 "Invalid credentials"
- Empty password → 400 validation error
- Duplicate org registration → 400 "Organization name already exists"

---

### Phase 2 — Tenant Isolation ✅

#### Built (9/9)
1. TenantContext.java — ThreadLocal orgId holder, lives in context/, uses .remove() for cleanup
2. TenantFilter.java — OncePerRequestFilter, extracts orgId from JWT, sets TenantContext, clears in finally
3. SecurityConfig.java — updated, TenantFilter registered after JwtAuthFilter via addFilterAfter
4. Resource.java — updated with @FilterDef + @Filter, condition: WHERE org_id = :orgId
5. TenantFilterConfig.java — AOP @Before bean, enables Hibernate filter on every repository call
6. UpdateResourceRequest.java — new request DTO
7. ResourceController.java — 6 endpoints: create, getAll, getById, update, delete, search
8. ResourceNotFoundException.java — in exception/
9. ResourceService.java — tenant-scoped CRUD + search, orgId always from CurrentUserContext
10. GlobalExceptionHandler.java — updated with ResourceNotFoundException handler returning 404

#### Key design decisions
- orgId is NEVER accepted from client — always from JWT via CurrentUserContext
- getResourceById uses findByIdAndOrgId → 404 not 403 on cross-tenant access
- Two layers of isolation: Hibernate @Filter (implicit) + service ownership check (explicit)
- TenantContext in context/ (Spring Security unaware) vs CurrentUserContext in security/ (Spring Security aware)
- TenantFilter try/finally guarantees ThreadLocal cleanup even on exceptions

#### Postman Tests (all passing ✅)
- ✅ Create resource → 201, orgId from JWT not client
- ✅ Get all resources → only own tenant's resources returned
- ✅ Get resource by ID → 200
- ✅ Update resource → 200
- ✅ Search by name → filtered results
- ✅ Cross-tenant access → 404 not 403

---

### Phase 3 — RBAC ✅

#### Built
1. CustomPermissionEvaluator.java — implements PermissionEvaluator, checks userId → roleIds → permissionCode
2. MethodSecurityConfig.java — @EnableMethodSecurity, registers CustomPermissionEvaluator as @Bean
3. UserRoleRepository.java — added findRoleIdsByUserId query
4. RolePermissionRepository.java — added existsByRoleIdInAndPermissionCode query
5. RoleController.java — 5 endpoints
6. RoleService.java — role management logic
7. RoleResponse.java — id + name + orgId + createdAt
8. PermissionResponse.java — id + code + description
9. DuplicateAssignmentException.java — 409 Conflict
10. GlobalExceptionHandler.java — updated with DuplicateAssignmentException handler
11. ResourceController.java — updated with @PreAuthorize on all 6 endpoints
12. data.sql — updated to 9 fine-grained permission codes

#### Endpoints
- POST /api/roles → create role (ROLE_CREATE)
- GET /api/roles → get all roles for org (ROLE_READ)
- POST /api/roles/{roleId}/assign/{userId} → assign role to user (ROLE_ASSIGN)
- POST /api/roles/{roleId}/permissions/{permissionId} → assign permission to role (ROLE_ASSIGN)
- GET /api/roles/{roleId}/permissions → get permissions for role (ROLE_READ)

#### Resource endpoints now permission-guarded
- POST /api/resources → RESOURCE_CREATE
- GET /api/resources → RESOURCE_READ
- GET /api/resources/{id} → RESOURCE_READ
- PUT /api/resources/{id} → RESOURCE_UPDATE
- DELETE /api/resources/{id} → RESOURCE_DELETE
- GET /api/resources/search → RESOURCE_READ

#### Key design decisions
- Permission check at method boundary via @PreAuthorize — not inside service logic
- Permissions are system-level (not org-scoped); roles are org-scoped
- Org boundary enforced at role level — permission binding is org-scoped because the role is
- 403 returned for permission denied (user exists but not allowed) vs 404 for cross-tenant (resource existence not leaked)
- AuthService auto-bootstraps Admin role with all permissions on org registration

#### Postman Tests (all passing ✅)
- ✅ Create role → 201
- ✅ Get all roles → 200, only org's roles returned
- ✅ Assign permission to role → 204
- ✅ Duplicate permission assignment → 409 Conflict
- ✅ Get role permissions → 200 with correct permissions

#### Pending (to complete after Phase 4 invitation flow)
- [ ] Login as VIEWER user (created via invitation)
- [ ] GET /api/resources with VIEWER token → 200
- [ ] POST /api/resources with VIEWER token → 403

---

## Next — Phase 4: Invitations + Audit Log

### What to build
- [ ] POST /api/invitations — admin invites user, generates token, returns token in response
- [ ] POST /api/auth/accept-invitation — user accepts invite, sets password, account created
- [ ] POST /api/roles/{roleId}/assign/{userId} — assign role to invited user
- [ ] AuditAspect.java — AOP-based audit logging
- [ ] GET /api/audit-logs — admin-only audit log viewer

---

## Remaining Phases

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