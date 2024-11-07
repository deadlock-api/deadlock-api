DROP VIEW IF EXISTS match_parties;

CREATE MATERIALIZED VIEW match_parties
ENGINE = ReplacingMergeTree
ORDER BY (account_ids, match_id)
POPULATE
AS
SELECT
    match_id,
    party,
    team,
    groupArray(account_id) AS account_ids
FROM match_player
GROUP BY match_id, party, team;
