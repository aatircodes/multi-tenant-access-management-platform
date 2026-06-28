package saas_access_platform.service;

import saas_access_platform.dto.request.CreateRoleRequest;
import saas_access_platform.dto.response.RoleResponse;
import saas_access_platform.entity.Role;
import saas_access_platform.repository.RoleRepository;
import saas_access_platform.security.CurrentUserContext;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class RoleService {

    private final RoleRepository roleRepository;

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
}