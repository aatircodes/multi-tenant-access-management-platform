package saas_access_platform.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import saas_access_platform.entity.Invitation;
import java.util.Optional;
import java.util.List;

public interface InvitationRepository
        extends JpaRepository<Invitation, Long> {

    Optional<Invitation> findByToken(String token);
    List<Invitation> findAllByOrgId(Long orgId);
    boolean existsByEmailAndOrgId(String email, Long orgId);
    Optional<Invitation> findByEmailAndOrgId(String email, Long orgId);
    boolean existsByEmailAndOrgIdAndStatus(String email, Long orgId, String status);
}