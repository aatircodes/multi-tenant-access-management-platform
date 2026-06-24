package saas_access_platform.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import saas_access_platform.entity.Resource;
import java.util.List;
import java.util.Optional;

public interface ResourceRepository
        extends JpaRepository<Resource, Long> {

    List<Resource> findAllByOrgId(Long orgId);
    Optional<Resource> findByIdAndOrgId(Long id, Long orgId);
    boolean existsByNameAndOrgId(String name, Long orgId);
}