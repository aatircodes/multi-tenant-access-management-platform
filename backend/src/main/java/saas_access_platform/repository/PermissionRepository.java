package saas_access_platform.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import saas_access_platform.entity.Permission;
import java.util.Optional;
import java.util.List;

public interface PermissionRepository
        extends JpaRepository<Permission, Long> {

    Optional<Permission> findByCode(String code);
    List<Permission> findAllByCodeIn(List<String> codes);
    boolean existsByCode(String code);
}