# Progress Tracker

## Project
Multi-Tenant Access Management Platform with Rate Limiting

## Repo
github.com/aatircodes/multi-tenant-access-management-platform

## Package name
saas_access_platform

## Current branch
main

## Approach going forward
Build just-in-time — DTO + Service + Controller together per endpoint,
test in Postman before moving to next endpoint.

---

## Completed

### Phase 0 — Setup
- Spring Boot project initialized
- application.yml configured (MySQL connection)
- docker-compose.yml created (MySQL + Redis for later)
- .gitignore configured
- README.md skeleton created
- PROGRESS.md created

### Phase 1 — In Progress

#### Entities done (9/9)
1. Organization.java
2. User.java
3. Role.java
4. Permission.java
5. RolePermission.java
6. UserRole.java
7. Resource.java
8. Invitation.java
9. AuditLog.java

#### Repositories done (9/9)
1. OrganizationRepository.java
2. UserRepository.java
3. RoleRepository.java
4. PermissionRepository.java
5. RolePermissionRepository.java
6. UserRoleRepository.java
7. ResourceRepository.java
8. InvitationRepository.java
9. AuditLogRepository.java

#### Request DTOs done (8/8)
1. RegisterOrgRequest.java
2. LoginRequest.java
3. InviteUserRequest.java
4. AcceptInvitationRequest.java
5. CreateRoleRequest.java
6. AssignPermissionsRequest.java
7. UpdateOrgSettingsRequest.java
8. CreateResourceRequest.java

#### Remaining — Phase 1
- [ ] SecurityConfig
- [ ] JwtUtil
- [ ] JwtAuthFilter
- [ ] AuthResponse (response DTO)
- [ ] AuthService (register-org + login logic)
- [ ] AuthController (/register-org + /login endpoints)
- [ ] Test register-org in Postman
- [ ] Test login in Postman

---

## Remaining Phases

### Phase 2 — Tenant Isolation
- [ ] TenantContext.java (ThreadLocal holder for org_id)
- [ ] TenantFilter.java (OncePerRequestFilter, enables Hibernate filter)
- [ ] Add @Filter and @FilterDef to Resource entity
- [ ] Service-layer ownership assertion on every fetch-by-ID
- [ ] Cross-tenant access test (404 not 403)

### Phase 3 — RBAC
- [ ] CustomPermissionEvaluator.java
- [ ] @PreAuthorize on resource endpoints
- [ ] Role management endpoints (create role, assign permissions)
- [ ] Permission boundary test (403 for wrong role)

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
- [ ] 429 response with Retry-After headers
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

---

## Next immediate step
Build register-org endpoint:
1. AuthResponse.java (response DTO)
2. SecurityConfig.java (disable default Spring Security temporarily)
3. JwtUtil.java (token generation)
4. AuthService.java (register-org logic)
5. AuthController.java (/api/auth/register-org endpoint)
6. Test in Postman