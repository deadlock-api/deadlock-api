DROP VIEW IF EXISTS finished_matches;
CREATE MATERIALIZED VIEW finished_matches
REFRESH EVERY 10 MINUTES
    ENGINE = MergeTree() ORDER BY match_id
    POPULATE
AS
SELECT *,
       CASE
        WHEN am.team0_core AND NOT am.team1_core THEN 0
        WHEN am.team1_core AND NOT am.team0_core THEN 1
        WHEN am.team0_titan AND NOT am.team1_titan THEN 0
        WHEN am.team1_titan AND NOT am.team0_titan THEN 1
        WHEN am.team0_titan_shield_generator_1 + am.team0_titan_shield_generator_2 >
             am.team1_titan_shield_generator_1 + am.team1_titan_shield_generator_2 + 1 THEN 0
        WHEN am.team1_titan_shield_generator_1 + am.team1_titan_shield_generator_2 >
             am.team0_titan_shield_generator_1 + am.team0_titan_shield_generator_2 + 1 THEN 1
        WHEN am.net_worth_team_0 > am.net_worth_team_1 + 15000
         THEN 0
        WHEN am.net_worth_team_1 > am.net_worth_team_0 + 15000
         THEN 1
        END
        AS winner
FROM active_matches am
WHERE winner IS NOT NULL
ORDER BY match_id, scraped_at DESC
LIMIT 1 BY match_id
SETTINGS asterisk_include_alias_columns = 1, allow_experimental_refreshable_materialized_view = 1;
