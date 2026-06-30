package saas_access_platform.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import saas_access_platform.ratelimit.RateLimiter;
import saas_access_platform.repository.OrganizationRepository;
import saas_access_platform.entity.Organization;

import java.io.IOException;

@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private final RateLimiter rateLimiter;
    private final OrganizationRepository organizationRepository;

    public RateLimitFilter(RateLimiter rateLimiter, OrganizationRepository organizationRepository) {
        this.rateLimiter = rateLimiter;
        this.organizationRepository = organizationRepository;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null || !(authentication.getPrincipal() instanceof CurrentUserContext)) {
            filterChain.doFilter(request, response);
            return;
        }

        CurrentUserContext currentUser = (CurrentUserContext) authentication.getPrincipal();
        Long orgId = currentUser.getOrgId();

        Organization organization = organizationRepository.findById(orgId).orElse(null);
        if (organization == null) {
            filterChain.doFilter(request, response);
            return;
        }

        int limit = organization.getRequestLimitPerMinute();
        boolean allowed = rateLimiter.allowRequest(orgId, limit);

        if (!allowed) {
            response.setStatus(429);
            response.setHeader("Retry-After", "60");
            response.setHeader("X-RateLimit-Remaining", "0");
            response.setContentType("application/json");
            response.getWriter().write("{\"status\":429,\"message\":\"Rate limit exceeded\"}");
            return;
        }

        filterChain.doFilter(request, response);
    }
}