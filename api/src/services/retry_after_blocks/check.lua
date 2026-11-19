-- Answers one request of a client blocked for ignoring Retry-After, atomically.
--
-- The client is sent a deadline (Retry-After). A request at or after it has waited: it counts a
-- round and sets the next deadline. A request before it is early: it is refused and the rounds
-- start over, but the deadline stays, so a client running several workers that each honor their
-- own Retry-After still converges on one deadline. Requests shortly after the one that opened a
-- round are that round's parallel requests, neither early nor a round of their own. Once enough
-- rounds in a row waited, the block is lifted and later requests pass.
--
-- KEYS[1]: the block's state hash (deadline, round_at, rounds, early, released).
-- ARGV: now (ms), wait (ms), rounds required, early tolerance (ms), round grace (ms), ttl (ms).
-- Returns {outcome, ms until the deadline, rounds waited, early requests}, where outcome is
-- 0 first request, 1 waited, 2 parallel to the round's opening request, 3 early,
-- 4 lifted by this request, 5 lifted before.
local key = KEYS[1]
local now = tonumber(ARGV[1])
local wait = tonumber(ARGV[2])
local required = tonumber(ARGV[3])
local tolerance = tonumber(ARGV[4])
local grace = tonumber(ARGV[5])
local ttl = tonumber(ARGV[6])

local state = redis.call('HMGET', key, 'deadline', 'round_at', 'rounds', 'early', 'released')
if state[5] then
    return {5, 0, 0, 0}
end
local deadline = tonumber(state[1])
local round_at = tonumber(state[2]) or 0
local rounds = tonumber(state[3]) or 0
local early = tonumber(state[4]) or 0

local outcome
if not deadline then
    outcome = 0
    deadline = now + wait
    round_at = now
elseif now + tolerance >= deadline then
    rounds = rounds + 1
    if rounds >= required then
        redis.call('HSET', key, 'released', string.format('%d', now), 'rounds', rounds)
        redis.call('PEXPIRE', key, ttl)
        return {4, 0, rounds, early}
    end
    outcome = 1
    deadline = now + wait
    round_at = now
elseif now < round_at + grace then
    outcome = 2
else
    outcome = 3
    rounds = 0
    early = early + 1
end

-- `%d`: concatenating the number would format it with 14 significant digits.
redis.call('HSET', key,
    'deadline', string.format('%d', deadline),
    'round_at', string.format('%d', round_at),
    'rounds', rounds,
    'early', early)
redis.call('PEXPIRE', key, ttl)
return {outcome, deadline - now, rounds, early}
