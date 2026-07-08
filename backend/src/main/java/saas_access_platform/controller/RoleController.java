package saas_access_platform.controller;

import saas_access_platform.dto.request.CreateRoleRequest;
import saas_access_platform.dto.response.PermissionResponse;
import saas_access_platform.dto.response.RoleResponse;
import saas_access_platform.service.RoleService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/roles")
@RequiredArgsConstructor
public class RoleController {

    private final RoleService roleService;

    @PostMapping
    @PreAuthorize("hasPermission(null, 'ROLE_CREATE')")
    public ResponseEntity<RoleResponse> createRole(@RequestBody CreateRoleRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(roleService.createRole(request));
    }

    @GetMapping
    @PreAuthorize("hasPermission(null, 'ROLE_READ') or hasPermission(null, 'ROLE_MANAGE') or hasPermission(null, 'PERMISSION_MANAGE') or hasPermission(null, 'ADMIN_TRANSFER')")
    public ResponseEntity<List<RoleResponse>> getAllRoles() {
        return ResponseEntity.ok(roleService.getAllRoles());
    }

    @PostMapping("/{roleId}/assign/{userId}")
    @PreAuthorize("hasPermission(null, 'ROLE_MANAGE')")   // renamed from ROLE_ASSIGN
    public ResponseEntity<Void> assignRoleToUser(
            @PathVariable Long roleId,
            @PathVariable Long userId) {
        roleService.assignRoleToUser(roleId, userId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{roleId}/unassign/{userId}")
    @PreAuthorize("hasPermission(null, 'ROLE_MANAGE')")   // renamed from ROLE_ASSIGN
    public ResponseEntity<Void> unassignRoleFromUser(
            @PathVariable Long roleId,
            @PathVariable Long userId) {
        roleService.unassignRoleFromUser(roleId, userId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{roleId}/permissions/{permissionId}")
    @PreAuthorize("hasPermission(null, 'PERMISSION_MANAGE')")   // was ROLE_ASSIGN
    public ResponseEntity<Void> assignPermissionToRole(
            @PathVariable Long roleId,
            @PathVariable Long permissionId) {
        roleService.assignPermissionToRole(roleId, permissionId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{roleId}/permissions")
    @PreAuthorize("hasPermission(null, 'ROLE_READ') or hasPermission(null, 'PERMISSION_MANAGE')")   // widened
    public ResponseEntity<List<PermissionResponse>> getRolePermissions(@PathVariable Long roleId) {
        return ResponseEntity.ok(roleService.getRolePermissions(roleId));
    }

    @DeleteMapping("/{roleId}/permissions/{permissionId}")
    @PreAuthorize("hasPermission(null, 'PERMISSION_MANAGE')")   // was ROLE_ASSIGN
    public ResponseEntity<Void> removePermissionFromRole(
            @PathVariable Long roleId,
            @PathVariable Long permissionId) {
        roleService.removePermissionFromRole(roleId, permissionId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/transfer-admin/{newUserId}")
    @PreAuthorize("hasPermission(null, 'ADMIN_TRANSFER')")   // was ROLE_ASSIGN
    public ResponseEntity<Void> transferAdmin(@PathVariable Long newUserId) {
        roleService.transferAdmin(newUserId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{roleId}")
    @PreAuthorize("hasPermission(null, 'ROLE_DELETE')")   // was ROLE_CREATE
    public ResponseEntity<Void> deleteRole(@PathVariable Long roleId) {
        roleService.deleteRole(roleId);
        return ResponseEntity.noContent().build();
    }
}