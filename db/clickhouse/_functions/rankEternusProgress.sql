CREATE FUNCTION rankEternusProgress AS rank_interval -> toUInt32(10 * arraySum(rankSubrankXp(rank_interval)));
