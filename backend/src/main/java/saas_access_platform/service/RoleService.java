package saas_access_platform.service;

import saas_access_platform.dto.request.CreateRoleRequest;
import saas_access_platform.dto.response.RoleResponse;
import saas_access_platform.entity.Role;
import saas_access_platform.entity.User;
import saas_access_platform.entity.UserRole;
import saas_access_platform.exception.DuplicateAssignmentException;
import saas_access_platform.exception.ResourceNotFoundException;
import saas_access_platform.repository.RoleRepository;
import saas_access_platform.repository.UserRepository;
import saas_access_platform.repository.UserRoleRepository;
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
}