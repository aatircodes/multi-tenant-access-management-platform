package saas_access_platform.aspect;

import lombok.RequiredArgsConstructor;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.AfterReturning;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import saas_access_platform.entity.AuditLog;
import saas_access_platform.repository.AuditLogRepository;
import saas_access_platform.security.CurrentUserContext;

import java.lang.reflect.Method;

@Aspect
@Component
@RequiredArgsConstructor
public class AuditAspect {

    private final AuditLogRepository auditLogRepository;

    @AfterReturning(
            pointcut = "execution(* saas_access_platform.controller..*(..))",
            returning = "result"
    )
    public void logAudit(JoinPoint joinPoint, Object result) {

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
        Long entityId = resolveEntityId(joinPoint, result);

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
            case "sendInvitation":           return "INVITE_SENT";
            case "acceptInvitation":         return "USER_JOINED";
            case "createResource":           return "RESOURCE_CREATED";
            case "updateResource":           return "RESOURCE_UPDATED";
            case "deleteResource":           return "RESOURCE_DELETED";
            case "createRole":               return "ROLE_CREATED";
            case "assignRoleToUser":         return "ROLE_ASSIGNED";
            case "assignPermissionToRole":   return "PERMISSION_ASSIGNED";
            case "removePermissionFromRole": return "PERMISSION_REMOVED";
            case "transferAdmin":            return "ADMIN_TRANSFERRED";
            case "deactivateUser":           return "USER_DEACTIVATED";
            default:                         return null;
        }
    }

    private String resolveEntityType(String methodName) {
        if (methodName.contains("Resource")) return "RESOURCE";
        if (methodName.contains("Role"))     return "ROLE";
        if (methodName.contains("nvitation") || methodName.equals("acceptInvitation")) return "INVITATION";
        if (methodName.equals("transferAdmin")) return "USER";
        return "UNKNOWN";
    }

    private Long resolveEntityId(JoinPoint joinPoint, Object result) {
        // First, try to pull an ID off the returned object (covers create* methods,
        // where the new entity's ID doesn't exist until after the save)
        Long idFromResult = extractIdFromResult(result);
        if (idFromResult != null) {
            return idFromResult;
        }

        // Fall back to scanning method arguments (covers update/delete/assign methods,
        // where the ID is a path variable passed in, not generated)
        Object[] args = joinPoint.getArgs();
        for (Object arg : args) {
            if (arg instanceof Long) {
                return (Long) arg;
            }
        }
        return 0L;
    }

    private Long extractIdFromResult(Object result) {
        try {
            Object body = result;
            if (result instanceof ResponseEntity<?> responseEntity) {
                body = responseEntity.getBody();
            }
            if (body == null) {
                return null;
            }
            Method getId = body.getClass().getMethod("getId");
            Object id = getId.invoke(body);
            if (id instanceof Long) {
                return (Long) id;
            }
        } catch (Exception ignored) {
            // Response body has no getId() (e.g. Void, List, Page) — fall back to arg scan
        }
        return null;
    }
}