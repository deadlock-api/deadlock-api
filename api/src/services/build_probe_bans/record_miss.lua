-- Records one miss of a client crawling the Game Coordinator and bans it at the threshold,
-- atomically.
--
-- KEYS[1]: the client's misses (sorted set: member = target, score = ms of its last miss).
-- KEYS[2]: the client's ban (string with a TTL; its value is the miss count that set it).
-- ARGV: now (ms), window (ms), threshold, ban (ms), member.
-- Returns {distinct misses in the window, 1 if this miss banned the client else 0}.
local misses_key = KEYS[1]
local ban_key = KEYS[2]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local threshold = tonumber(ARGV[3])
local ban = tonumber(ARGV[4])
local member = ARGV[5]

-- `%d`: concatenating the number would format it with 14 significant digits.
redis.call('ZADD', misses_key, string.format('%d', now), member)
redis.call('ZREMRANGEBYSCORE', misses_key, '-inf', string.format('(%d', now - window))
local misses = redis.call('ZCARD', misses_key)
if misses >= threshold then
    redis.call('DEL', misses_key)
    local set = redis.call('SET', ban_key, misses, 'PX', string.format('%d', ban), 'NX')
    if set then
        return {misses, 1}
    end
    return {misses, 0}
end
redis.call('PEXPIRE', misses_key, string.format('%d', window))
return {misses, 0}
