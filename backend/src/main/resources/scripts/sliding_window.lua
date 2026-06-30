local current_key = KEYS[1]
local previous_key = KEYS[2]
local limit = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local window = 60

local current_count = tonumber(redis.call('GET', current_key) or '0')
local previous_count = tonumber(redis.call('GET', previous_key) or '0')

local elapsed_in_current = now % window
local overlap_fraction = (window - elapsed_in_current) / window

local estimated_count = (previous_count * overlap_fraction) + current_count

if estimated_count >= limit then
    return {0, estimated_count}
else
    redis.call('INCR', current_key)
    redis.call('EXPIRE', current_key, window * 2)
    return {1, estimated_count + 1}
end