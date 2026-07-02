package saas_access_platform.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import saas_access_platform.entity.User;
import java.util.List;
import java.util.Optional;

public interface UserRepository
        extends JpaRepository<User, Long> {

    Optional<User> findByEmailAndOrgId(String email, Long orgId);
    boolean existsByEmailAndOrgId(String email, Long orgId);
    Optional<User> findByIdAndOrgId(Long id, Long orgId);
    List<User> findAllByOrgId(Long orgId);
}