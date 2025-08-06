mod batch;
pub mod mmr_history;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;

#[derive(OpenApi)]
#[openapi(tags((name = "MMR", description = "
# STOP! READ THIS FIRST!

Please be very careful when using this endpoint and make yourself familiar with the way we calculate the MMR.

You can see our calculation script here: https://github.com/deadlock-api/deadlock-api-tools/blob/master/mmr-calc/mmr_calc.py

In short what we do:
1. Starting at the first match that has avg_team_badge assigned
2. We compare the avg_team_badge from metadata file and the average MMR from our database
    (If a player is not yet in our MMR database, we use the average MMR of the team)
3. From 2. we get an error (delta) and we calculate the error back to every player
4. We assign the error to the player and calculate the new MMR
5. We repeat 2-4 for every match

Player Score is the index for this array

    [0,11,12,13,14,15,16,21,22,23,24,25,26,31,32,33,34,35,36,41,42,43,44,45,46,51,52,53,54,55,56,61,62,63,64,65,66,71,72,73,74,75,76,81,82,83,84,85,86,91,92,93,94,95,96,101,102,103,104,105,106,111,112,113,114,115,116]

which is the order of all ranks.
So to get the rank we get the closest index from the player score.

**Example:**
- Player Score: 7.8 -> Index 8 -> Rank 22
- Player Score: 7.2 -> Index 7 -> Rank 21

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(batch::mmr))
        .routes(routes!(batch::hero_mmr))
        .routes(routes!(mmr_history::mmr_history))
        .routes(routes!(mmr_history::hero_mmr_history))
}
