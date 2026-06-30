package saas_access_platform.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import saas_access_platform.dto.response.UsageResponse;
import saas_access_platform.entity.Organization;
import saas_access_platform.exception.ResourceNotFoundException;
import saas_access_platform.repository.OrganizationRepository;
import saas_access_platform.security.CurrentUserContext;

@Service
@RequiredArgsConstructor
public class UsageService {

    private final RedisTemplate<String, String> redisTemplate;
    private final OrganizationRepository organizationRepository;

    public UsageResponse getUsage() {
        CurrentUserContext currentUser = (CurrentUserContext) SecurityContextHolder
                .getContext().getAuthentication().getPrincipal();

        Long orgId = currentUser.getOrgId();

        Organization organization = organizationRepository.findById(orgId)
                .orElseThrow(() -> new ResourceNotFoundException("Organization not found"));

        int limit = organization.getRequestLimitPerMinute();

        String tokensKey = "ratelimit:" + orgId + ":tokens";
        String refillKey = "ratelimit:" + orgId + ":refill_at";

        String tokensStr = redisTemplate.opsForValue().get(tokensKey);
        String refillAtStr = redisTemplate.opsForValue().get(refillKey);

        double tokensRemaining;

        if (tokensStr == null || refillAtStr == null) {
            tokensRemaining = limit;
        } else {
            double storedTokens = Double.parseDouble(tokensStr);
            long lastRefillAt = Long.parseLong(refillAtStr);
            long now = System.currentTimeMillis() / 1000;

            long elapsed = now - lastRefillAt;
            double refillRatePerSecond = limit / 60.0;

            tokensRemaining = Math.min(limit, storedTokens + (elapsed * refillRatePerSecond));
        }

        return UsageResponse.builder()
                .orgId(orgId)
                .limitPerMinute(limit)
                .tokensRemaining(tokensRemaining)
                .build();
    }
}