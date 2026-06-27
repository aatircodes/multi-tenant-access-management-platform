package saas_access_platform.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import saas_access_platform.entity.RolePermission;
import java.util.List;

public interface RolePermissionRepository extends JpaRepository<RolePermission, Long> {

    List<RolePermission> findAllByRoleId(Long roleId);
    void deleteByRoleIdAndPermissionId(Long roleId, Long permissionId);
    boolean existsByRoleIdAndPermissionId(Long roleId, Long permissionId);

    @Query("SELECT COUNT(rp) > 0 FROM RolePermission rp " +
            "JOIN Permission p ON rp.permissionId = p.id " +
            "WHERE rp.roleId IN :roleIds AND p.code = :code")
    boolean existsByRoleIdInAndPermissionCode(
            @Param("roleIds") List<Long> roleIds,
            @Param("code") String code
    );
}