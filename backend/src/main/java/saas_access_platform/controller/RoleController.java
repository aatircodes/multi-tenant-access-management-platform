package saas_access_platform.controller;

import saas_access_platform.dto.request.CreateRoleRequest;
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
    @PreAuthorize("hasPermission(null, 'ROLE_READ')")
    public ResponseEntity<List<RoleResponse>> getAllRoles() {
        return ResponseEntity.ok(roleService.getAllRoles());
    }

    @PostMapping("/{roleId}/assign/{userId}")
    @PreAuthorize("hasPermission(null, 'ROLE_ASSIGN')")
    public ResponseEntity<Void> assignRoleToUser(
            @PathVariable Long roleId,
            @PathVariable Long userId) {
        roleService.assignRoleToUser(roleId, userId);
        return ResponseEntity.noContent().build();
    }
}