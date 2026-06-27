package saas_access_platform.security;

import saas_access_platform.repository.RolePermissionRepository;
import saas_access_platform.repository.UserRoleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.PermissionEvaluator;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import java.io.Serializable;
import java.util.List;

@Component
@RequiredArgsConstructor
public class CustomPermissionEvaluator implements PermissionEvaluator {

    private final UserRoleRepository userRoleRepository;
    private final RolePermissionRepository rolePermissionRepository;

    @Override
    public boolean hasPermission(Authentication authentication,
                                 Object targetDomainObject,
                                 Object permission) {
        return checkPermission(authentication, permission);
    }

    @Override
    public boolean hasPermission(
            Authentication authentication,
            Serializable targetId,
            String targetType,
            Object permission) {
        return checkPermission(authentication, permission);
    }

    private boolean checkPermission(Authentication authentication, Object permission) {
        if (authentication == null || permission == null) return false;

        CurrentUserContext currentUser = (CurrentUserContext) authentication.getPrincipal();
        Long userId = currentUser.getUserId();
        String permissionCode = permission.toString();

        List<Long> roleIds = userRoleRepository.findRoleIdsByUserId(userId);
        if (roleIds.isEmpty()) return false;

        return rolePermissionRepository.existsByRoleIdInAndPermissionCode(roleIds, permissionCode);
    }
}