package saas_access_platform.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import saas_access_platform.entity.AuditLog;
import java.util.List;

public interface AuditLogRepository
        extends JpaRepository<AuditLog, Long> {

    List<AuditLog> findAllByOrgIdOrderByTimestampDesc(Long orgId);
    Page<AuditLog> findAllByOrgId(Long orgId, Pageable pageable);
    List<AuditLog> findAllByOrgIdAndActorUserIdOrderByTimestampDesc(
            Long orgId, Long actorUserId);
    List<AuditLog> findAllByOrgIdAndEntityTypeOrderByTimestampDesc(
            Long orgId, String entityType);
}