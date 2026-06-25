package saas_access_platform.config;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.hibernate.Session;
import org.springframework.stereotype.Component;
import saas_access_platform.context.TenantContext;

@Aspect
@Component
public class TenantFilterConfig {

    @PersistenceContext
    private EntityManager entityManager;

    @Before("execution(* saas_access_platform.repository..*(..))")
    public void enableTenantFilter() {
        Long tenantId = TenantContext.getTenantId();

        if (tenantId != null) {
            Session session = entityManager.unwrap(Session.class);
            session.enableFilter("tenantFilter")
                    .setParameter("orgId", tenantId);
        }
    }
}