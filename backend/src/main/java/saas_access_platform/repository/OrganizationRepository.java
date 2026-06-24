package saas_access_platform.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import saas_access_platform.entity.Organization;
import java.util.Optional;

public interface OrganizationRepository
        extends JpaRepository<Organization, Long> {

    Optional<Organization> findBySlug(String slug);
    boolean existsByName(String name);
    boolean existsBySlug(String slug);
}