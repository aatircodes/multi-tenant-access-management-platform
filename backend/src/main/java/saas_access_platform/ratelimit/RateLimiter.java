package saas_access_platform.ratelimit;

public interface RateLimiter {
    boolean allowRequest(Long orgId, int limitPerMinute);
}