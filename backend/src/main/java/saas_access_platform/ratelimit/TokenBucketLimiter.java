package saas_access_platform.ratelimit;

import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class TokenBucketLimiter implements RateLimiter {

    private final RedisTemplate<String, String> redisTemplate;
    private final DefaultRedisScript<List> tokenBucketScript;

    public TokenBucketLimiter(RedisTemplate<String, String> redisTemplate,
                              DefaultRedisScript<List> tokenBucketScript) {
        this.redisTemplate = redisTemplate;
        this.tokenBucketScript = tokenBucketScript;
    }

    @Override
    public boolean allowRequest(Long orgId, int limitPerMinute) {
        long now = System.currentTimeMillis() / 1000;

        String tokensKey = "ratelimit:" + orgId + ":tokens";
        String refillKey = "ratelimit:" + orgId + ":refill_at";

        List<Object> result = redisTemplate.execute(
                tokenBucketScript,
                List.of(tokensKey, refillKey),
                String.valueOf(limitPerMinute),
                String.valueOf(now)
        );

        Long allowed = (Long) result.get(0);
        return allowed == 1L;
    }
}