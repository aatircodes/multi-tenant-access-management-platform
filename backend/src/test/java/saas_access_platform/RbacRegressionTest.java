package saas_access_platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import saas_access_platform.dto.request.CreateResourceRequest;
import saas_access_platform.entity.Organization;
import saas_access_platform.entity.Permission;
import saas_access_platform.entity.Role;
import saas_access_platform.entity.RolePermission;
import saas_access_platform.entity.User;

import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Targeted regression suite for the bugs found and fixed during this session's manual
 * QA pass. Not general coverage — each test maps 1:1 to a specific, real bug that was
 * found, so a future change that reintroduces any of them fails here immediately
 * instead of requiring another manual click-through session to rediscover.
 */
class RbacRegressionTest extends BaseIntegrationTest {

    // ── 1. OR-gate dead-end regression ─────────────────────────────────────
    // Every permission below was, at some point this session, granted but unreachable
    // because its listing endpoint's OR-gate didn't include it. This proves each one
    // now has a working path. One user per permission, single-permission role only,
    // so a failure here points at exactly one gate.

    @Autowired
    protected ObjectMapper objectMapper;

    @ParameterizedTest
    @ValueSource(strings = {"ROLE_READ", "ROLE_MANAGE", "PERMISSION_MANAGE", "ADMIN_TRANSFER",
            "ROLE_DELETE", "ROLE_CREATE", "USER_INVITE"})
    void permissionCanReachRolesList(String permissionCode) throws Exception {
        Organization testOrg = createTestOrg();
        Role role = createTestRole(testOrg, "TestRole-" + permissionCode, permissionCode);
        User user = createTestUser(testOrg, "user-" + permissionCode.toLowerCase() + "@test.com", role);
        String token = tokenFor(user, testOrg, List.of(role.getName()));

        mockMvc.perform(get("/api/roles").header("Authorization", bearer(token)))
                .andExpect(status().isOk());
    }

    @ParameterizedTest
    @ValueSource(strings = {"ROLE_READ", "ROLE_MANAGE", "ADMIN_TRANSFER", "USER_DEACTIVATE"})
    void permissionCanReachUsersList(String permissionCode) throws Exception {
        Organization testOrg = createTestOrg();
        Role role = createTestRole(testOrg, "TestRole-" + permissionCode, permissionCode);
        User user = createTestUser(testOrg, "user-" + permissionCode.toLowerCase() + "@test.com", role);
        String token = tokenFor(user, testOrg, List.of(role.getName()));

        mockMvc.perform(get("/api/users").header("Authorization", bearer(token)))
                .andExpect(status().isOk());
    }

    @ParameterizedTest
    @ValueSource(strings = {"RESOURCE_READ", "RESOURCE_UPDATE", "RESOURCE_DELETE"})
    void permissionCanReachResourcesList(String permissionCode) throws Exception {
        Organization testOrg = createTestOrg();
        Role role = createTestRole(testOrg, "TestRole-" + permissionCode, permissionCode);
        User user = createTestUser(testOrg, "user-" + permissionCode.toLowerCase() + "@test.com", role);
        String token = tokenFor(user, testOrg, List.of(role.getName()));

        mockMvc.perform(get("/api/resources").header("Authorization", bearer(token)))
                .andExpect(status().isOk());
    }

    // RESOURCE_CREATE deliberately does NOT grant read access to the resource list — it
    // grants creation only. Frontend enforces this by never attempting GET /resources for
    // a RESOURCE_CREATE-only user; this confirms the backend independently enforces the
    // same boundary, not just the UI hiding it.
    @Test
    void resourceCreateOnlyCannotReadListButCanCreate() throws Exception {
        Organization testOrg = createTestOrg();
        Role role = createTestRole(testOrg, "CreateOnly", "RESOURCE_CREATE");
        User user = createTestUser(testOrg, "create-only@test.com", role);
        String token = tokenFor(user, testOrg, List.of(role.getName()));

        mockMvc.perform(get("/api/resources").header("Authorization", bearer(token)))
                .andExpect(status().isForbidden());

        CreateResourceRequest request = new CreateResourceRequest();
        request.setName("Test Resource");
        request.setDescription("Created by regression test");

        mockMvc.perform(post("/api/resources")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated());
    }

    // A permission with NO relation to roles (e.g. AUDIT_VIEW) should still correctly
    // 403 on /api/roles — proves the OR-gate isn't accidentally wide open to everyone.
    @Test
    void unrelatedPermissionCannotReachRolesList() throws Exception {
        Organization testOrg = createTestOrg();
        Role role = createTestRole(testOrg, "AuditOnly", "AUDIT_VIEW");
        User user = createTestUser(testOrg, "audit-only@test.com", role);
        String token = tokenFor(user, testOrg, List.of(role.getName()));

        mockMvc.perform(get("/api/roles").header("Authorization", bearer(token)))
                .andExpect(status().isForbidden());
    }

    // ── 2. transferAdmin invariant ──────────────────────────────────────────
    // The bug: outgoing admin was left with zero roles, bypassing the >=1-role
    // invariant. Proves the fix: outgoing admin lands on exactly "No Access",
    // incoming admin ends up with exactly "Admin".

    @Test
    void transferAdminLeavesOutgoingAdminWithNoAccessNotZeroRoles() throws Exception {
        Organization testOrg = createTestOrg();
        Role adminRole = roleRepository.findByNameAndOrgId("Admin", testOrg.getId())
                .orElseThrow(() -> new IllegalStateException("Admin role not bootstrapped for test org"));
        Role noAccessRole = roleRepository.findByNameAndOrgId("No Access", testOrg.getId())
                .orElseThrow(() -> new IllegalStateException("No Access role not bootstrapped for test org"));

        User admin = createTestUser(testOrg, "admin@test.com", adminRole);
        Role basicRole = createTestRole(testOrg, "Basic");
        User target = createTestUser(testOrg, "target@test.com", basicRole);

        String adminToken = tokenFor(admin, testOrg, List.of("Admin"));

        mockMvc.perform(post("/api/roles/transfer-admin/{id}", target.getId())
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isNoContent());

        // Outgoing admin: exactly one role, and it's No Access — never zero.
        List<Long> outgoingRoleIds = userRoleRepository.findRoleIdsByUserId(admin.getId());
        Assertions.assertEquals(1, outgoingRoleIds.size(),
                "Outgoing admin should hold exactly one role after transfer");
        Assertions.assertTrue(outgoingRoleIds.contains(noAccessRole.getId()),
                "Outgoing admin's remaining role should be No Access");

        // Incoming admin: now holds Admin.
        List<Long> incomingRoleIds = userRoleRepository.findRoleIdsByUserId(target.getId());
        Assertions.assertTrue(incomingRoleIds.contains(adminRole.getId()),
                "New admin should hold the Admin role after transfer");
    }

    // ── 3. System-role immutability ─────────────────────────────────────────
    // Admin and No Access must both reject permission edits and deletion attempts,
    // even from a caller who holds PERMISSION_MANAGE / ROLE_DELETE.

    @Test
    void adminRolePermissionsCannotBeModified() throws Exception {
        Organization testOrg = createTestOrg();
        Role adminRole = roleRepository.findByNameAndOrgId("Admin", testOrg.getId()).orElseThrow();
        Permission somePermission = permissionRepository.findByCode("RESOURCE_READ").orElseThrow();

        Role callerRole = createTestRole(testOrg, "PermManager", "PERMISSION_MANAGE");
        User caller = createTestUser(testOrg, "permmgr@test.com", callerRole);
        String token = tokenFor(caller, testOrg, List.of(callerRole.getName()));

        mockMvc.perform(delete("/api/roles/{roleId}/permissions/{permId}",
                        adminRole.getId(), somePermission.getId())
                        .header("Authorization", bearer(token)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void noAccessRolePermissionsCannotBeModified() throws Exception {
        Organization testOrg = createTestOrg();
        Role noAccessRole = roleRepository.findByNameAndOrgId("No Access", testOrg.getId()).orElseThrow();
        Permission somePermission = permissionRepository.findByCode("RESOURCE_READ").orElseThrow();

        Role callerRole = createTestRole(testOrg, "PermManager", "PERMISSION_MANAGE");
        User caller = createTestUser(testOrg, "permmgr2@test.com", callerRole);
        String token = tokenFor(caller, testOrg, List.of(callerRole.getName()));

        mockMvc.perform(post("/api/roles/{roleId}/permissions/{permId}",
                        noAccessRole.getId(), somePermission.getId())
                        .header("Authorization", bearer(token)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void systemRolesCannotBeDeleted() throws Exception {
        Organization testOrg = createTestOrg();
        Role adminRole = roleRepository.findByNameAndOrgId("Admin", testOrg.getId()).orElseThrow();
        Role noAccessRole = roleRepository.findByNameAndOrgId("No Access", testOrg.getId()).orElseThrow();

        Role callerRole = createTestRole(testOrg, "Deleter", "ROLE_DELETE");
        User caller = createTestUser(testOrg, "deleter@test.com", callerRole);
        String token = tokenFor(caller, testOrg, List.of(callerRole.getName()));

        mockMvc.perform(delete("/api/roles/{roleId}", adminRole.getId())
                        .header("Authorization", bearer(token)))
                .andExpect(status().isBadRequest());

        mockMvc.perform(delete("/api/roles/{roleId}", noAccessRole.getId())
                        .header("Authorization", bearer(token)))
                .andExpect(status().isBadRequest());
    }

    // ── 4. Zero-permission role stays valid, even while assigned ───────────
    // Non-regression check: confirms this deliberate design decision (AWS IAM-style
    // empty policy objects) hasn't been accidentally "fixed" by a future change.

    @Test
    void permissionManageCanEmptyAnAssignedRoleToZeroPermissions() throws Exception {
        Organization testOrg = createTestOrg();
        Role targetRole = createTestRole(testOrg, "WillBeEmptied", "RESOURCE_READ");
        User assignedUser = createTestUser(testOrg, "assigned@test.com", targetRole);

        Role callerRole = createTestRole(testOrg, "PermManager3", "PERMISSION_MANAGE");
        User caller = createTestUser(testOrg, "permmgr3@test.com", callerRole);
        String token = tokenFor(caller, testOrg, List.of(callerRole.getName()));

        Permission resourceRead = permissionRepository.findByCode("RESOURCE_READ").orElseThrow();

        mockMvc.perform(delete("/api/roles/{roleId}/permissions/{permId}",
                        targetRole.getId(), resourceRead.getId())
                        .header("Authorization", bearer(token)))
                .andExpect(status().isNoContent());

        // The role still exists, still assigned, just with zero permissions now.
        List<RolePermission> remaining = rolePermissionRepository.findAllByRoleId(targetRole.getId());
        Assertions.assertTrue(remaining.isEmpty());
        List<Long> stillAssigned = userRoleRepository.findRoleIdsByUserId(assignedUser.getId());
        Assertions.assertTrue(stillAssigned.contains(targetRole.getId()));
    }

    // ── 5. A user can never be reduced below one role via normal unassign ──

    @Test
    void unassigningAUsersOnlyRoleIsRejected() throws Exception {
        Organization testOrg = createTestOrg();
        Role onlyRole = createTestRole(testOrg, "OnlyRole", "RESOURCE_READ");
        User targetUser = createTestUser(testOrg, "onlyrole@test.com", onlyRole);

        Role callerRole = createTestRole(testOrg, "RoleManager", "ROLE_MANAGE");
        User caller = createTestUser(testOrg, "rolemgr@test.com", callerRole);
        String token = tokenFor(caller, testOrg, List.of(callerRole.getName()));

        mockMvc.perform(delete("/api/roles/{roleId}/unassign/{userId}",
                        onlyRole.getId(), targetUser.getId())
                        .header("Authorization", bearer(token)))
                .andExpect(status().isBadRequest());
    }
}