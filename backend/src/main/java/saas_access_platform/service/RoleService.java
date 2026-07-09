package saas_access_platform.service;

import org.springframework.transaction.annotation.Transactional;
import saas_access_platform.dto.request.CreateRoleRequest;
import saas_access_platform.dto.response.PermissionResponse;
import saas_access_platform.dto.response.RoleResponse;
import saas_access_platform.entity.*;
import saas_access_platform.exception.DuplicateAssignmentException;
import saas_access_platform.exception.ResourceNotFoundException;
import saas_access_platform.repository.*;
import saas_access_platform.security.CurrentUserContext;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class RoleService {

    private final RoleRepository roleRepository;
    private final UserRoleRepository userRoleRepository;
    private final UserRepository userRepository;
    private final PermissionRepository permissionRepository;
    private final RolePermissionRepository rolePermissionRepository;

    // Admin (full access) and No Access (zero access) are both system-guaranteed
    // roles, auto-bootstrapped per org at registration (see AuthService.registerOrg).
    // Neither can have its permission set edited or be deleted — that symmetry is
    // what makes "No Access" a safe, always-available landing spot for transferAdmin.
    private boolean isSystemRole(String roleName) {
        return roleName.equalsIgnoreCase("Admin") || roleName.equalsIgnoreCase("No Access");
    }

    public RoleResponse createRole(CreateRoleRequest request) {
        CurrentUserContext currentUser = (CurrentUserContext)
                SecurityContextHolder.getContext().getAuthentication().getPrincipal();

        Role role = Role.builder()
                .name(request.getName())
                .orgId(currentUser.getOrgId())
                .build();

        Role saved = roleRepository.save(role);

        return RoleResponse.builder()
                .id(saved.getId())
                .name(saved.getName())
                .orgId(saved.getOrgId())
                .createdAt(saved.getCreatedAt())
                .build();
    }

    public List<RoleResponse> getAllRoles() {
        CurrentUserContext currentUser = (CurrentUserContext)
                SecurityContextHolder.getContext().getAuthentication().getPrincipal();

        return roleRepository.findAllByOrgId(currentUser.getOrgId())
                .stream()
                .map(role -> RoleResponse.builder()
                        .id(role.getId())
                        .name(role.getName())
                        .orgId(role.getOrgId())
                        .createdAt(role.getCreatedAt())
                        .memberCount(userRoleRepository.countByRoleId(role.getId()))
                        .build())
                .toList();
    }

    public void assignRoleToUser(Long roleId, Long userId) {
        CurrentUserContext currentUser = (CurrentUserContext)
                SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        Long orgId = currentUser.getOrgId();

        Role role = roleRepository.findByIdAndOrgId(roleId, orgId)
                .orElseThrow(() -> new ResourceNotFoundException("Role not found"));

        if (role.getName().equalsIgnoreCase("Admin")) {
            throw new RuntimeException("Admin role cannot be assigned directly — use transfer-admin instead");
        }

        User user = userRepository.findByIdAndOrgId(userId, orgId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        if (userRoleRepository.existsByUserIdAndRoleId(user.getId(), role.getId())) {
            throw new DuplicateAssignmentException("User already has this role");
        }

        UserRole userRole = UserRole.builder()
                .userId(user.getId())
                .roleId(role.getId())
                .build();

        userRoleRepository.save(userRole);
    }

    @Transactional
    public void unassignRoleFromUser(Long roleId, Long userId) {
        CurrentUserContext currentUser = (CurrentUserContext)
                SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        Long orgId = currentUser.getOrgId();

        Role role = roleRepository.findByIdAndOrgId(roleId, orgId)
                .orElseThrow(() -> new ResourceNotFoundException("Role not found"));

        if (role.getName().equalsIgnoreCase("Admin")) {
            throw new RuntimeException("Admin role cannot be removed directly — use transfer-admin instead");
        }

        User user = userRepository.findByIdAndOrgId(userId, orgId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        if (!userRoleRepository.existsByUserIdAndRoleId(user.getId(), role.getId())) {
            throw new ResourceNotFoundException("User does not have this role");
        }

        // Every user must retain at least one role — if this is their last one,
        // reject the removal rather than leaving them with zero roles.
        long currentRoleCount = userRoleRepository.countByUserId(user.getId());
        if (currentRoleCount <= 1) {
            throw new RuntimeException("A user must have at least one role assigned");
        }

        userRoleRepository.deleteByUserIdAndRoleId(user.getId(), role.getId());
    }

    public void assignPermissionToRole(Long roleId, Long permissionId) {
        CurrentUserContext currentUser = (CurrentUserContext)
                SecurityContextHolder.getContext().getAuthentication().getPrincipal();

        // Verify role belongs to this org
        Role role = roleRepository.findByIdAndOrgId(roleId, currentUser.getOrgId())
                .orElseThrow(() -> new ResourceNotFoundException("Role not found"));

        if (isSystemRole(role.getName())) {
            throw new RuntimeException("System roles (Admin, No Access) cannot have their permissions modified");
        }

        // Verify permission exists
        Permission permission = permissionRepository.findById(permissionId)
                .orElseThrow(() -> new ResourceNotFoundException("Permission not found"));

        // Prevent duplicate assignment
        if (rolePermissionRepository.existsByRoleIdAndPermissionId(role.getId(), permission.getId())) {
            throw new DuplicateAssignmentException("Permission already assigned to this role");
        }

        RolePermission rolePermission = RolePermission.builder()
                .roleId(role.getId())
                .permissionId(permission.getId())
                .build();

        rolePermissionRepository.save(rolePermission);
    }

    public List<PermissionResponse> getRolePermissions(Long roleId) {
        CurrentUserContext currentUser = (CurrentUserContext)
                SecurityContextHolder.getContext().getAuthentication().getPrincipal();

        // Verify role belongs to this org
        roleRepository.findByIdAndOrgId(roleId, currentUser.getOrgId())
                .orElseThrow(() -> new ResourceNotFoundException("Role not found"));

        List<RolePermission> rolePermissions = rolePermissionRepository.findAllByRoleId(roleId);

        List<Long> permissionIds = rolePermissions.stream()
                .map(RolePermission::getPermissionId)
                .toList();

        return permissionRepository.findAllById(permissionIds)
                .stream()
                .map(permission -> PermissionResponse.builder()
                        .id(permission.getId())
                        .code(permission.getCode())
                        .description(permission.getDescription())
                        .build())
                .toList();
    }

    @Transactional
    public void removePermissionFromRole(Long roleId, Long permissionId) {
        CurrentUserContext currentUser = (CurrentUserContext)
                SecurityContextHolder.getContext().getAuthentication().getPrincipal();

        Role role = roleRepository.findByIdAndOrgId(roleId, currentUser.getOrgId())
                .orElseThrow(() -> new ResourceNotFoundException("Role not found"));

        if (isSystemRole(role.getName())) {
            throw new RuntimeException("System roles (Admin, No Access) cannot have their permissions modified");
        }

        Permission permission = permissionRepository.findById(permissionId)
                .orElseThrow(() -> new ResourceNotFoundException("Permission not found"));

        // Prevent removing a permission that was never assigned
        if (!rolePermissionRepository.existsByRoleIdAndPermissionId(role.getId(), permission.getId())) {
            throw new ResourceNotFoundException("Permission not assigned to this role");
        }

        rolePermissionRepository.deleteByRoleIdAndPermissionId(role.getId(), permission.getId());
    }

    @Transactional
    public void transferAdmin(Long newUserId) {
        CurrentUserContext currentUser = (CurrentUserContext)
                SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        Long orgId = currentUser.getOrgId();

        Role adminRole = roleRepository.findByNameAndOrgId("Admin", orgId)
                .orElseThrow(() -> new ResourceNotFoundException("Admin role not found"));

        Role noAccessRole = roleRepository.findByNameAndOrgId("No Access", orgId)
                .orElseThrow(() -> new ResourceNotFoundException("No Access role not found"));

        boolean callerIsAdmin = userRoleRepository
                .existsByUserIdAndRoleId(currentUser.getUserId(), adminRole.getId());
        if (!callerIsAdmin) {
            throw new RuntimeException("Only the current Admin can transfer admin rights");
        }

        if (newUserId.equals(currentUser.getUserId())) {
            throw new RuntimeException("User is already the Admin");
        }

        User newAdmin = userRepository.findByIdAndOrgId(newUserId, orgId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        // Assign the outgoing Admin their fallback role FIRST, before removing
        // Admin — this guarantees they never pass through a zero-role state,
        // closing the gap that previously bypassed unassignRoleFromUser's
        // "must have at least one role" guard.
        if (!userRoleRepository.existsByUserIdAndRoleId(currentUser.getUserId(), noAccessRole.getId())) {
            UserRole fallbackRole = UserRole.builder()
                    .userId(currentUser.getUserId())
                    .roleId(noAccessRole.getId())
                    .build();
            userRoleRepository.save(fallbackRole);
        }

        // Demote current Admin
        userRoleRepository.deleteByUserIdAndRoleId(currentUser.getUserId(), adminRole.getId());

        // Promote new Admin
        if (!userRoleRepository.existsByUserIdAndRoleId(newAdmin.getId(), adminRole.getId())) {
            UserRole newAdminUserRole = UserRole.builder()
                    .userId(newAdmin.getId())
                    .roleId(adminRole.getId())
                    .build();
            userRoleRepository.save(newAdminUserRole);
        }

        // If the new Admin happened to hold No Access (unlikely but possible —
        // e.g. it was assigned manually), clean it up so they end up holding
        // just Admin, not a redundant zero-permission role alongside it.
        if (userRoleRepository.existsByUserIdAndRoleId(newAdmin.getId(), noAccessRole.getId())) {
            userRoleRepository.deleteByUserIdAndRoleId(newAdmin.getId(), noAccessRole.getId());
        }
    }

    @Transactional
    public void deleteRole(Long roleId) {
        CurrentUserContext currentUser = (CurrentUserContext)
                SecurityContextHolder.getContext().getAuthentication().getPrincipal();

        Role role = roleRepository.findByIdAndOrgId(roleId, currentUser.getOrgId())
                .orElseThrow(() -> new ResourceNotFoundException("Role not found"));

        if (isSystemRole(role.getName())) {
            throw new RuntimeException("System roles (Admin, No Access) cannot be deleted");
        }

        long memberCount = userRoleRepository.countByRoleId(role.getId());
        if (memberCount > 0) {
            throw new RuntimeException("Cannot delete a role that's still assigned to members — unassign them first");
        }

        // Remove permission mappings first to avoid a foreign-key conflict, then the role itself
        rolePermissionRepository.deleteAllByRoleId(role.getId());
        roleRepository.delete(role);
    }
}