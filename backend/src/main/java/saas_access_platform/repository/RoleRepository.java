package saas_access_platform.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import saas_access_platform.entity.Role;
import java.util.List;
import java.util.Optional;

public interface RoleRepository
        extends JpaRepository<Role, Long> {

    List<Role> findAllByOrgId(Long orgId);
    Optional<Role> findByNameAndOrgId(String name, Long orgId);
    boolean existsByNameAndOrgId(String name, Long orgId);
    Optional<Role> findByIdAndOrgId(Long id, Long orgId);
}