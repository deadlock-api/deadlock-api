-- Guess the Rank: the day's scores. A player counts once per day: the player is a salted hash of the address and the
-- day, and the points are worked out on the server from that player's votes, so a score cannot be sent in.
CREATE TABLE IF NOT EXISTS day_players (
  date TEXT NOT NULL,                   -- the UTC day played (YYYY-MM-DD)
  player TEXT NOT NULL,
  points INTEGER NOT NULL,
  PRIMARY KEY (date, player)
);

-- How many players scored each number of points on a day.
CREATE TABLE IF NOT EXISTS day_scores (
  date TEXT NOT NULL,
  points INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, points)
);
