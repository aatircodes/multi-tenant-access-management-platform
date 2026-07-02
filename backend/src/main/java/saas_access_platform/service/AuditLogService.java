package saas_access_platform.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
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

    public Page<AuditLog> getAuditLogs(int page, int size) {
        CurrentUserContext currentUser = (CurrentUserContext) SecurityContextHolder
                .getContext()
                .getAuthentication()
                .getPrincipal();

        Pageable pageable = PageRequest.of(page, size, Sort.by("timestamp").descending());
        return auditLogRepository.findAllByOrgId(currentUser.getOrgId(), pageable);
    }
}