local tokens_key = KEYS[1]
local refill_key = KEYS[2]
local capacity = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local refill_rate_per_second = capacity / 60.0

local tokens = tonumber(redis.call('GET', tokens_key))
local last_refill = tonumber(redis.call('GET', refill_key))

if tokens == nil or last_refill == nil then
    tokens = capacity
    last_refill = now
end

local elapsed = now - last_refill
local refilled_tokens = math.min(capacity, tokens + (elapsed * refill_rate_per_second))

if refilled_tokens < 1 then
    redis.call('SET', tokens_key, refilled_tokens, 'EX', 120)
    redis.call('SET', refill_key, now, 'EX', 120)
    return {0, refilled_tokens}
end

local remaining = refilled_tokens - 1
redis.call('SET', tokens_key, remaining, 'EX', 120)
redis.call('SET', refill_key, now, 'EX', 120)

return {1, remaining}