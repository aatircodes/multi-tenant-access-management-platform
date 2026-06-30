# Progress Tracker

## Project
Multi-Tenant Access Management Platform with Rate Limiting

## Repo
github.com/aatircodes/multi-tenant-access-management-platform

## Package
saas_access_platform

## Branch
main

## Approach
Build just-in-time — Controller → Service → Repository, one endpoint at a time.
Test in Postman before moving to the next phase.

---

## Phase 0 — Setup

- Spring Boot 3.4.5 + Java 21 project initialized
- application.yml configured (MySQL + JWT)
- docker-compose.yml created (MySQL + Redis), placed at repo root
- .gitignore configured at repo root
- README.md created at repo root
- PROGRESS.md created at repo root
- data.sql created — seeds 9 permissions on startup

---

## Phase 1 — Auth + Foundation

### Entities (9)
- Organization.java
- User.java
- Role.java
- Permission.java
- RolePermission.java
- UserRole.java
- Resource.java
- Invitation.java
- AuditLog.java

### Repositories (9)
- OrganizationRepository.java
- UserRepository.java
- RoleRepository.java
- PermissionRepository.java
- RolePermissionRepository.java
- UserRoleRepository.java
- ResourceRepository.java
- InvitationRepository.java
- AuditLogRepository.java

### Request DTOs (8)
- RegisterOrgRequest.java
- LoginRequest.java (email + password + orgSlug)
- InviteUserRequest.java
- AcceptInvitationRequest.java
- CreateRoleRequest.java
- AssignPermissionsRequest.java
- UpdateOrgSettingsRequest.java
- CreateResourceRequest.java

### Response DTOs (5)
- LoginResponse.java (token + orgSlug + orgName + orgId + userId + email)
- RegisterOrgResponse.java (message + orgSlug)
- ErrorResponse.java (status + message + timestamp)
- RoleResponse.java (id + name + orgId + createdAt)
- InvitationResponse.java (token + email + expiresAt)

### Security Layer (4)
- SecurityConfig.java — stateless JWT, /api/auth/** public
- JwtUtil.java — generate, parse, validate, extract claims
- JwtAuthFilter.java — reads JWT, builds CurrentUserContext as principal
- CurrentUserContext.java — carries userId, orgId, email, roles

### Auth Service + Controller
- AuthService.java
  - registerOrg — provisions org, creates Admin role with all 9 permissions, returns RegisterOrgResponse (no token on registration)
  - login — validates credentials, returns LoginResponse with JWT
- AuthController.java
  - POST /api/auth/register-org — 201
  - POST /api/auth/login — 200

### Exception Handling
- GlobalExceptionHandler.java

### Postman Tests
- Register org — 201 with message and orgSlug
- Login — 200 with JWT
- Wrong password — 400 Invalid credentials
- Wrong org slug — 400 Invalid credentials
- Empty password — 400 validation error
- Duplicate org — 400 Organization name already exists

---

## Phase 2 — Tenant Isolation

### Built
- TenantContext.java — ThreadLocal orgId holder, lives in context/
- TenantFilter.java — OncePerRequestFilter, extracts orgId from JWT, sets TenantContext, clears in finally block
- SecurityConfig.java — updated, TenantFilter registered after JwtAuthFilter
- Resource.java — updated with @FilterDef + @Filter on org_id
- TenantFilterConfig.java — AOP @Before bean, enables Hibernate filter on every repository call
- UpdateResourceRequest.java
- ResourceController.java — 6 endpoints
- ResourceNotFoundException.java — in exception/
- ResourceService.java — tenant-scoped CRUD, orgId always from CurrentUserContext
- GlobalExceptionHandler.java — updated with ResourceNotFoundException handler returning 404

### Key Design Decisions
- orgId is never accepted from the client — always sourced from JWT
- getResourceById uses findByIdAndOrgId — returns 404 not 403 on cross-tenant access
- Two isolation layers: Hibernate @Filter (implicit) + service-level ownership check (explicit)
- TenantContext lives in context/ (Spring Security unaware); CurrentUserContext lives in security/ (Spring Security aware)
- TenantFilter uses try/finally to guarantee ThreadLocal cleanup on exceptions

### Postman Tests
- Create resource — 201, orgId from JWT not client
- Get all resources — 200, only own tenant resources returned
- Get resource by ID — 200
- Update resource — 200
- Search by name — filtered results
- Cross-tenant access — 404 not 403

---

## Phase 3 — RBAC

### Built
- CustomPermissionEvaluator.java — implements PermissionEvaluator, checks userId to roleIds to permissionCode
- MethodSecurityConfig.java — @EnableMethodSecurity, registers CustomPermissionEvaluator as @Bean
- UserRoleRepository.java — added findRoleIdsByUserId
- RolePermissionRepository.java — added existsByRoleIdInAndPermissionCode
- RoleController.java — 5 endpoints
- RoleService.java
- RoleResponse.java (id + name + orgId + createdAt)
- PermissionResponse.java (id + code + description)
- DuplicateAssignmentException.java — 409 Conflict
- GlobalExceptionHandler.java — updated with DuplicateAssignmentException and AccessDeniedException handlers
- ResourceController.java — updated with @PreAuthorize on all 6 endpoints

### Endpoints
- POST /api/roles — create role (ROLE_CREATE)
- GET /api/roles — get all roles for org (ROLE_READ)
- POST /api/roles/{roleId}/assign/{userId} — assign role to user (ROLE_ASSIGN)
- POST /api/roles/{roleId}/permissions/{permissionId} — assign permission to role (ROLE_ASSIGN)
- GET /api/roles/{roleId}/permissions — get permissions for role (ROLE_READ)

### Resource Endpoints — Permission Guards
- POST /api/resources — RESOURCE_CREATE
- GET /api/resources — RESOURCE_READ
- GET /api/resources/{id} — RESOURCE_READ
- PUT /api/resources/{id} — RESOURCE_UPDATE
- DELETE /api/resources/{id} — RESOURCE_DELETE
- GET /api/resources/search — RESOURCE_READ

### Key Design Decisions
- Permission check at method boundary via @PreAuthorize — not inside service logic
- Permissions are system-level; roles are org-scoped
- 403 for permission denied; 404 for cross-tenant resource access
- Admin role auto-bootstrapped with all 9 permissions on org registration
- AccessDeniedException mapped to 403 in GlobalExceptionHandler

### Postman Tests
- Create role — 201
- Get all roles — 200, only org roles returned
- Assign permission to role — 204
- Duplicate permission assignment — 409 Conflict
- Get role permissions — 200
- Login as invited user with ReadOnly role — 200
- GET /api/resources with ReadOnly token — 200
- POST /api/resources with ReadOnly token — 403

---

## Phase 4 — Invitations + Audit Log

### Built
- InvalidInvitationException.java — in exception/
- InvitationResponse.java — token + email + expiresAt
- InvitationService.java — sendInvitation, guards against duplicate invites and existing users
- InvitationController.java — POST /api/invitations (USER_INVITE)
- AuthService.java — updated with acceptInvitation (@Transactional, creates User + UserRole, marks invitation ACCEPTED, returns JWT)
- AuthController.java — updated with POST /api/auth/accept-invitation (public)
- AuditLogService.java — returns audit logs scoped to current org
- AuditLogController.java — GET /api/audit-logs (AUDIT_VIEW)
- AuditAspect.java — in aspect/, @AfterReturning on all controller methods, maps method names to action strings, reads actor from SecurityContext
- GlobalExceptionHandler.java — updated with InvalidInvitationException handler
- InvitationRepository.java — updated with existsByEmailAndOrgIdAndStatus

### Endpoints
- POST /api/invitations — send invitation (USER_INVITE)
- POST /api/auth/accept-invitation — accept invitation, create account, return JWT (public)
- GET /api/audit-logs — view audit trail (AUDIT_VIEW)

### Key Design Decisions
- Invitation token is UUID v4 — single-use, 48-hour expiry set via @PrePersist
- Token returned directly in API response — no real email in this project
- acceptInvitation is @Transactional — User + UserRole + invitation status update all commit or all roll back
- AuditAspect uses @AfterReturning — only logs actions that completed successfully, not failed ones
- AuditAspect guard checks for null principal — skips logging on public endpoints (no JWT = no actor)
- USER_JOINED is logged manually inside AuthService.acceptInvitation — AOP cannot capture public endpoint actors
- orgId always sourced from invitation record, never from client input

### Audit Actions Logged
- INVITE_SENT — via AuditAspect after sendInvitation
- USER_JOINED — manually inside acceptInvitation after user creation
- RESOURCE_CREATED — via AuditAspect after createResource
- RESOURCE_UPDATED — via AuditAspect after updateResource
- RESOURCE_DELETED — via AuditAspect after deleteResource
- ROLE_CREATED — via AuditAspect after createRole
- ROLE_ASSIGNED — via AuditAspect after assignRoleToUser

### Postman Tests
- Send invitation — 201 with token and expiresAt
- Send duplicate invitation — 400 Pending invitation already exists
- Invite existing user — 400 User already exists in this organization
- Accept invitation — 200 with full JWT response
- Accept already-used invitation — 400 Invitation has already been used
- Accept invalid token — 400 Invalid invitation token
- Get audit logs — 200 with INVITE_SENT and USER_JOINED entries, scoped to org

---

## Phase 5 — Rate Limiting

### Environment Setup (prerequisite work)
- Docker Desktop + WSL2 installed on Windows
- MySQL and Redis run via Docker containers — local MySQL service disabled to avoid port 3306 conflict
- Container names: tenant-platform-mysql, tenant-platform-redis — restart policy set to "no" (manual start/stop only, no auto-start on boot, by deliberate preference for gaming performance)
- application.yml datasource fixed to match Docker MySQL: url jdbc:mysql://localhost:3306/saas_access_platform, username root, password root
- Redis config added under spring.data.redis (host localhost, port 6379)
- spring-boot-starter-data-redis dependency added to pom.xml

### Built
- RateLimiter.java — interface, in ratelimit/, single method allowRequest(orgId, limitPerMinute)
- TokenBucketLimiter.java — in ratelimit/, implements RateLimiter, atomic via Lua script
- token_bucket.lua — in resources/scripts/, atomic read-refill-check-consume Redis operation
- RedisConfig.java — in config/, RedisTemplate bean + tokenBucketScript DefaultRedisScript bean
- OrganizationRepository.java — created (did not previously exist), basic JpaRepository
- RateLimitFilter.java — in security/ (matches existing filter convention, not a separate filter/ package), OncePerRequestFilter, excludes /api/usage from rate limiting, returns 429 with Retry-After and X-RateLimit-Remaining headers
- SecurityConfig.java — updated, RateLimitFilter registered between JwtAuthFilter and TenantFilter (fail-fast ordering); FilterRegistrationBean added to disable duplicate standalone servlet registration
- UsageResponse.java — orgId + limitPerMinute + tokensRemaining
- UsageService.java — calculates live refilled token count (does not return stale stored value), rounds and clamps near-zero floating point noise to 0.0
- UsageController.java — GET /api/usage, no @PreAuthorize (any authenticated user can check their own org's usage)

### Endpoints
- GET /api/usage — view current org's rate limit status (any authenticated user, no specific permission required)

### Algorithm Decision
- Sliding window was initially built (SlidingWindowLimiter.java, sliding_window.lua) then deliberately removed in favor of token bucket only
- Reasoning: token bucket fits this platform's actual usage pattern (authenticated API integrators who may burst), is simpler to explain and defend confidently in interviews, and was made atomic via Lua to remove its one weakness (race conditions in the original read-modify-write version)
- Sliding window knowledge is retained as a talking point (what problem it solves, when it would be the better choice) without claiming to have built it

### Key Design Decisions
- requestLimitPerMinute lives on the Organization entity, defaults to 100 via @PrePersist, set once at org creation — deliberately NOT exposed as a self-service update endpoint, since allowing orgs to set their own limit would defeat the rate limiter's purpose; in production this would be tied to a billing plan and changed administratively
- RateLimitFilter runs before TenantFilter (fail-fast — reject cheaply before doing tenant setup work), placed directly after JwtAuthFilter since orgId is available at that point
- orgId always read from JWT-derived CurrentUserContext, never from client input
- Token bucket refill is continuous (limit / 60 tokens per second), not a fixed-window reset — avoids boundary spike problem, naturally tolerates legitimate bursts
- Entire read-refill-check-consume cycle for both the limiter and the Lua script is atomic, eliminating race conditions under concurrent requests for the same org
- GET /api/usage is explicitly excluded from RateLimitFilter — checking usage must never consume a token, matching the pattern used by GitHub's rate limit status endpoint
- UsageService independently recalculates live refill rather than reading the stored Redis value directly, since the stored value is only accurate at the instant of the last actual rate-limited request

### Bug Found and Fixed
- RateLimitFilter, being a @Component, was being auto-registered twice — once correctly inside the Spring Security filter chain via addFilterAfter, and once automatically by Spring Boot as a standalone servlet filter that ran before authentication populated the SecurityContext, causing it to silently skip every request. Fixed with a FilterRegistrationBean bean that disables the automatic standalone registration, ensuring the filter only runs once, in the correct position.
- A secondary issue during testing: GET /api/usage was returning a stale token count because the request itself was passing through RateLimitFilter and consuming a token before UsageService read the value, making the refill timestamp always appear "fresh." Fixed by excluding /api/usage from RateLimitFilter entirely.

### Postman Tests
- Check usage on a fresh org with no prior requests — 200, tokensRemaining equals limitPerMinute
- Repeated requests within quota — 200 for each
- Sustained burst (300+ rapid requests via Postman Runner) exceeding quota — 429 once bucket exhausted, confirmed via direct Redis inspection (redis-cli GET on token and refill_at keys)
- 429 response headers confirmed — Retry-After: 60, X-RateLimit-Remaining: 0
- 429 response body confirmed — {"status":429,"message":"Rate limit exceeded"}
- Intermittent 200 responses observed between strings of 429s during sustained load — live proof of continuous refill, not a disguised fixed window
- Usage check immediately after exhaustion — tokensRemaining near 0 (clamped to clean 0.0)
- Usage check after waiting — tokensRemaining increases proportionally, capped at 100.0 once fully refilled
- Repeated usage checks with no delay — tokensRemaining unchanged, confirming usage endpoint does not consume tokens

### Documentation
- README.md fully updated through Phase 5 — architecture section, token bucket explanation, Redis key structure, usage endpoint documentation, Phase 5 test coverage table, and new design decision entries (Redis vs in-memory counter, token bucket vs fixed window, why rate limits are not self-service, why usage endpoint excludes itself)
- Phase5_Interview_Prep.docx created — 17 interview Q&A covering algorithm choice, filter ordering, atomicity/concurrency, the usage endpoint, configuration scope decisions, and the duplicate filter registration debugging story, plus a quick reference table

---

## Remaining

### Phase 6 — React Frontend
- Initialize React app with Vite
- Axios client with JWT interceptor
- AuthContext
- Login and Register screens
- Resource CRUD screens
- Role and permission management UI
- Invitation flow UI
- Usage dashboard
- Audit log viewer

### Phase 7 — Tests
- Cross-tenant fetch returns 404
- Cross-tenant write rejected
- Filter bypass regression test
- org_id injection ignored
- Wrong role returns 403
- Quota enforcement returns 429
- Quota isolation between orgs
- Token bucket atomicity under concurrent load

### Phase 8 — Docker + Deploy
- Multi-stage Dockerfile
- Add app to docker-compose
- Deploy to Render or Railway
- Add live demo link to README