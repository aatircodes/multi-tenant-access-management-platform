package saas_access_platform.service;

import saas_access_platform.dto.request.CreateRoleRequest;
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
                        .build())
                .toList();
    }

    public void assignRoleToUser(Long roleId, Long userId) {
        CurrentUserContext currentUser = (CurrentUserContext)
                SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        Long orgId = currentUser.getOrgId();

        Role role = roleRepository.findByIdAndOrgId(roleId, orgId)
                .orElseThrow(() -> new ResourceNotFoundException("Role not found"));

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

    public void assignPermissionToRole(Long roleId, Long permissionId) {
        CurrentUserContext currentUser = (CurrentUserContext)
                SecurityContextHolder.getContext().getAuthentication().getPrincipal();

        // Verify role belongs to this org
        Role role = roleRepository.findByIdAndOrgId(roleId, currentUser.getOrgId())
                .orElseThrow(() -> new ResourceNotFoundException("Role not found"));

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
}