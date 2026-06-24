package saas_access_platform.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import saas_access_platform.entity.RolePermission;
import java.util.List;

public interface RolePermissionRepository
        extends JpaRepository<RolePermission, Long> {

    List<RolePermission> findAllByRoleId(Long roleId);
    void deleteByRoleIdAndPermissionId(Long roleId, Long permissionId);
    boolean existsByRoleIdAndPermissionId(Long roleId, Long permissionId);
}