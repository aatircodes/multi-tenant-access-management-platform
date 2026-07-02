package saas_access_platform.aspect;

import lombok.RequiredArgsConstructor;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.AfterReturning;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import saas_access_platform.entity.AuditLog;
import saas_access_platform.repository.AuditLogRepository;
import saas_access_platform.security.CurrentUserContext;

@Aspect
@Component
@RequiredArgsConstructor
public class AuditAspect {

    private final AuditLogRepository auditLogRepository;

    @AfterReturning("execution(* saas_access_platform.controller..*(..))")
    public void logAudit(JoinPoint joinPoint) {

        Authentication authentication = SecurityContextHolder
                .getContext()
                .getAuthentication();

        if (authentication == null || !(authentication.getPrincipal() instanceof CurrentUserContext)) {
            return;
        }

        CurrentUserContext currentUser = (CurrentUserContext) authentication.getPrincipal();

        String methodName = joinPoint.getSignature().getName();

        String action = resolveAction(methodName);
        if (action == null) {
            return;
        }

        String entityType = resolveEntityType(methodName);
        Long entityId = resolveEntityId(joinPoint);

        AuditLog auditLog = AuditLog.builder()
                .orgId(currentUser.getOrgId())
                .actorUserId(currentUser.getUserId())
                .action(action)
                .entityType(entityType)
                .entityId(entityId)
                .build();

        auditLogRepository.save(auditLog);
    }

    private String resolveAction(String methodName) {
        switch (methodName) {
            case "sendInvitation":     return "INVITE_SENT";
            case "acceptInvitation":   return "USER_JOINED";
            case "createResource":     return "RESOURCE_CREATED";
            case "updateResource":     return "RESOURCE_UPDATED";
            case "deleteResource":     return "RESOURCE_DELETED";
            case "createRole":         return "ROLE_CREATED";
            case "assignRoleToUser":   return "ROLE_ASSIGNED";
            case "transferAdmin":      return "ADMIN_TRANSFERRED";
            default:                   return null;
        }
    }

    private String resolveEntityType(String methodName) {
        if (methodName.contains("Resource")) return "RESOURCE";
        if (methodName.contains("Role"))     return "ROLE";
        if (methodName.contains("nvitation") || methodName.equals("acceptInvitation")) return "INVITATION";
        return "UNKNOWN";
    }

    private Long resolveEntityId(JoinPoint joinPoint) {
        Object[] args = joinPoint.getArgs();
        for (Object arg : args) {
            if (arg instanceof Long) {
                return (Long) arg;
            }
        }
        return 0L;
    }
}