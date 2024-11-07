DROP VIEW IF EXISTS match_parties;

CREATE MATERIALIZED VIEW match_parties
  ENGINE = ReplacingMergeTree
   ORDER BY (account_ids, match_id)
  POPULATE
AS
SELECT groupArray(account_id) as account_ids,
       match_id,
       party,
       team
FROM match_player
GROUP BY match_id, party, team;
