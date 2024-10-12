DROP VIEW IF EXISTS finished_matches;
CREATE MATERIALIZED VIEW finished_matches
REFRESH EVERY 10 MINUTES
    ENGINE = MergeTree() ORDER BY match_id
    POPULATE
AS
SELECT DISTINCT
    ON (match_id) *,
                  CASE
                      WHEN am.team0_titan AND NOT am.team1_titan THEN 0
                      WHEN am.team1_titan AND NOT am.team0_titan THEN 1
                      WHEN am.team0_titan_shield_generator_1 AND am.team0_titan_shield_generator_2 AND (
                          NOT am.team1_titan_shield_generator_1 OR NOT am.team1_titan_shield_generator_2)
                          THEN 0
                      WHEN am.team1_titan_shield_generator_1 AND am.team1_titan_shield_generator_2 AND (
                          NOT am.team0_titan_shield_generator_1 OR NOT am.team0_titan_shield_generator_2)
                          THEN 1
                      WHEN am.net_worth_team_0 > am.net_worth_team_1 THEN 0
                      WHEN am.net_worth_team_1 > am.net_worth_team_0 THEN 1
                      END
                      AS winner
FROM active_matches am
WHERE winner IS NOT NULL AND date_add(minute, 60, start_time) < now()
ORDER BY match_id, scraped_at DESC
    SETTINGS
    asterisk_include_alias_columns = 1, allow_experimental_refreshable_materialized_view = 1;
