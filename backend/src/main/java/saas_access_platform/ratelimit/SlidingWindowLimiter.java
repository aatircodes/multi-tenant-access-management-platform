package saas_access_platform.ratelimit;

import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class SlidingWindowLimiter implements RateLimiter {

    private final RedisTemplate<String, String> redisTemplate;
    private final DefaultRedisScript<List> slidingWindowScript;

    public SlidingWindowLimiter(RedisTemplate<String, String> redisTemplate,
                                DefaultRedisScript<List> slidingWindowScript) {
        this.redisTemplate = redisTemplate;
        this.slidingWindowScript = slidingWindowScript;
    }

    @Override
    public boolean allowRequest(Long orgId, int limitPerMinute) {
        long now = System.currentTimeMillis() / 1000;
        long currentWindow = now / 60;
        long previousWindow = currentWindow - 1;

        String currentKey = "ratelimit:" + orgId + ":" + currentWindow;
        String previousKey = "ratelimit:" + orgId + ":" + previousWindow;

        List<Long> result = redisTemplate.execute(
                slidingWindowScript,
                List.of(currentKey, previousKey),
                String.valueOf(limitPerMinute),
                String.valueOf(now)
        );

        return result.get(0) == 1L;
    }
}