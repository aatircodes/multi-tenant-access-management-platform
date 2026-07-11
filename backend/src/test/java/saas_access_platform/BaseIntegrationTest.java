package saas_access_platform;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import saas_access_platform.entity.Organization;
import saas_access_platform.entity.Permission;
import saas_access_platform.entity.Role;
import saas_access_platform.entity.RolePermission;
import saas_access_platform.entity.User;
import saas_access_platform.entity.UserRole;
import saas_access_platform.repository.OrganizationRepository;
import saas_access_platform.repository.PermissionRepository;
import saas_access_platform.repository.RolePermissionRepository;
import saas_access_platform.repository.RoleRepository;
import saas_access_platform.repository.UserRepository;
import saas_access_platform.repository.UserRoleRepository;
import saas_access_platform.security.JwtUtil;

import java.util.List;
import java.util.UUID;

/**
 * Base class for the RBAC regression suite. Runs against the real, already-running
 * tenant-platform-mysql / tenant-platform-redis containers (same as manual QA) —
 * no mocks, no Testcontainers. Each test creates its own uniquely-named org via
 * direct repository calls (bypassing HTTP registration to avoid depending on DTO
 * shapes), then issues real MockMvc requests with real JwtUtil-generated tokens
 * through the actual filter chain (JwtAuthFilter -> RateLimitFilter -> TenantFilter
 * -> @PreAuthorize -> CustomPermissionEvaluator -> real DB).
 *
 * IMPORTANT: requires tenant-platform-mysql and tenant-platform-redis to be running
 * locally before executing (same manual-start routine as every other session).
 */
@SpringBootTest
@AutoConfigureMockMvc
public abstract class BaseIntegrationTest {

    @Autowired protected MockMvc mockMvc;
    @Autowired protected JwtUtil jwtUtil;
    @Autowired protected PasswordEncoder passwordEncoder;

    @Autowired protected OrganizationRepository organizationRepository;
    @Autowired protected UserRepository userRepository;
    @Autowired protected RoleRepository roleRepository;
    @Autowired protected UserRoleRepository userRoleRepository;
    @Autowired protected PermissionRepository permissionRepository;
    @Autowired protected RolePermissionRepository rolePermissionRepository;

    /** Creates a fresh org with a guaranteed-unique name/slug, avoiding collisions across reruns. */
    /** Creates a fresh org with a guaranteed-unique name/slug, avoiding collisions across reruns.
     *  Also bootstraps the Admin (all permissions) and No Access (zero permissions) system roles,
     *  mirroring AuthService.registerOrg exactly — tests rely on both existing, the same way a
     *  real registered org would have them. */
    protected Organization createTestOrg() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Organization org = Organization.builder()
                .name("Test Org " + suffix)
                .slug("test-org-" + suffix)
                .status(Organization.OrgStatus.ACTIVE)
                .build();
        org = organizationRepository.save(org);
        // requestLimitPerMinute defaults to 100 via @PrePersist

        Role adminRole = Role.builder()
                .orgId(org.getId())
                .name("Admin")
                .build();
        adminRole = roleRepository.save(adminRole);

        List<Permission> allPermissions = permissionRepository.findAll();
        for (Permission permission : allPermissions) {
            rolePermissionRepository.save(
                    RolePermission.builder()
                            .roleId(adminRole.getId())
                            .permissionId(permission.getId())
                            .build()
            );
        }

        Role noAccessRole = Role.builder()
                .orgId(org.getId())
                .name("No Access")
                .build();
        roleRepository.save(noAccessRole);
        // Deliberately zero permissions — mirrors AuthService.registerOrg exactly.

        return org;
    }

    /** Creates a role in the given org with the given permission codes attached. Codes must already
     *  exist in the `permissions` table (seeded via data.sql). */
    protected Role createTestRole(Organization org, String roleName, String... permissionCodes) {
        Role role = Role.builder()
                .orgId(org.getId())
                .name(roleName)
                .build();
        role = roleRepository.save(role);

        for (String code : permissionCodes) {
            Permission permission = permissionRepository.findByCode(code)
                    .orElseThrow(() -> new IllegalStateException(
                            "Permission code not found in DB (check data.sql seeding): " + code));
            rolePermissionRepository.save(
                    RolePermission.builder()
                            .roleId(role.getId())
                            .permissionId(permission.getId())
                            .build()
            );
        }
        return role;
    }

    /** Creates a user in the given org and assigns them the given role(s). */
    protected User createTestUser(Organization org, String email, Role... roles) {
        User user = User.builder()
                .orgId(org.getId())
                .email(email)
                .passwordHash(passwordEncoder.encode("Test1234!"))
                .status(User.UserStatus.ACTIVE)
                .build();
        user = userRepository.save(user);

        for (Role role : roles) {
            userRoleRepository.save(
                    UserRole.builder()
                            .userId(user.getId())
                            .roleId(role.getId())
                            .build()
            );
        }
        return user;
    }

    /** Generates a real JWT for the given user, matching exactly what AuthService.login produces. */
    protected String tokenFor(User user, Organization org, List<String> roleNames) {
        return jwtUtil.generateToken(user.getId(), org.getId(), user.getEmail(), roleNames);
    }

    protected String bearer(String token) {
        return "Bearer " + token;
    }
}