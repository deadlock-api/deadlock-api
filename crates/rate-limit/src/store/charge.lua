-- Charges one request against cost-weighted request logs, atomically.
--
-- A log is a sorted set scored by request time in microseconds. Each member is
-- `<total>:<cost>`, where `<total>` is the log's running cost total after the request, kept in
-- `<log>:total` and zero-padded so requests with equal times sort in order. The cost of a window
-- is then the last total in it minus the first, plus the first request's own cost: two log(n)
-- lookups however many requests the window holds.
--
-- KEYS: the logs to always record in, the logs to record in if admitted, then the window logs.
-- ARGV: now, cost, the number of logs always recorded in, the number recorded in if admitted,
--       each of those logs' retention in microseconds, then each window's start (exclusive) and
--       limit.
-- Returns each window's cost without this request and its oldest request time (-1 if empty).
local now = tonumber(ARGV[1])
local cost = tonumber(ARGV[2])
local always = tonumber(ARGV[3])
local if_admitted = tonumber(ARGV[4])
local logs = always + if_admitted

-- The total of each log recorded in: its newest request, so windows on it skip that lookup.
local totals = {}
local function record(i)
    local log = KEYS[i]
    local retention_us = tonumber(ARGV[4 + i])
    local retention_ms = math.max(1, math.ceil(retention_us / 1000))
    -- `%d`: concatenating the number would format it with 14 significant digits.
    redis.call('ZREMRANGEBYSCORE', log, '-inf', string.format('(%d', now - retention_us))
    local total = redis.call('INCRBY', log .. ':total', cost)
    redis.call('ZADD', log, now, string.format('%020d:%d', total, cost))
    redis.call('PEXPIRE', log, retention_ms)
    redis.call('PEXPIRE', log .. ':total', retention_ms)
    totals[log] = total
end

for i = 1, always do
    record(i)
end

local usages = {}
local admitted = true
local arg = 5 + logs
for i = logs + 1, #KEYS do
    local log = KEYS[i]
    local start = '(' .. ARGV[arg]
    local limit = tonumber(ARGV[arg + 1])
    arg = arg + 2
    local used, oldest = 0, -1
    local first = redis.call('ZRANGEBYSCORE', log, start, now, 'WITHSCORES', 'LIMIT', 0, 1)
    if #first > 0 then
        local last_total = totals[log]
        if last_total == nil then
            local last = redis.call('ZREVRANGEBYSCORE', log, now, start, 'LIMIT', 0, 1)
            last_total = tonumber(string.match(last[1], '^(%d+):'))
        else
            -- The window holds this request; it is not counted against itself.
            last_total = last_total - cost
        end
        local first_total, first_cost = string.match(first[1], '^(%d+):(%d+)$')
        used = last_total - tonumber(first_total) + tonumber(first_cost)
        if used > 0 then
            oldest = tonumber(first[2])
        end
    end
    if used + cost > limit then
        admitted = false
    end
    table.insert(usages, used)
    table.insert(usages, oldest)
end

if admitted then
    for i = always + 1, logs do
        record(i)
    end
end
return usages
