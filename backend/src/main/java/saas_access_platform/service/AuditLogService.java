package saas_access_platform.service;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import saas_access_platform.entity.AuditLog;
import saas_access_platform.repository.AuditLogRepository;
import saas_access_platform.security.CurrentUserContext;

import java.util.List;

@Service
@RequiredArgsConstructor
public class AuditLogService {

    private final AuditLogRepository auditLogRepository;

    public List<AuditLog> getAuditLogs() {

        CurrentUserContext currentUser = (CurrentUserContext) SecurityContextHolder
                .getContext()
                .getAuthentication()
                .getPrincipal();

        return auditLogRepository.findAllByOrgIdOrderByTimestampDesc(currentUser.getOrgId());
    }
}