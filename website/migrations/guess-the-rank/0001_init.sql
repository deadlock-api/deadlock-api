-- Guess the Rank: the video catalog (written by the guess-rank skill) and the community's guesses.

-- One row per uploaded video. The video itself is `r2_key` in the guess-the-rank R2 bucket, served publicly from
-- https://guess-the-rank.deadlock-api.com/<r2_key>; the key is random and does not reveal the rank.
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,                  -- random hex id, also the key's file name
  r2_key TEXT NOT NULL UNIQUE,          -- videos/<id>.mp4
  poster_key TEXT,                      -- videos/<id>.jpg
  badge INTEGER NOT NULL,               -- the player's rank at match start: tier * 10 + subtier (11 = tier 1.1 ... 116 = tier 11.6; names and badges: /v1/assets/ranks)
  hero_id INTEGER NOT NULL,
  match_id INTEGER NOT NULL,
  duration_s REAL NOT NULL,
  added_at TEXT NOT NULL,               -- ISO 8601 UTC; a video joins the daily pool from the next UTC day on
  active INTEGER NOT NULL DEFAULT 1     -- 0 = withdrawn
);

-- How many players guessed each tier (1-11) for a video.
CREATE TABLE IF NOT EXISTS votes (
  video_id TEXT NOT NULL REFERENCES videos (id),
  tier INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (video_id, tier)
);

-- Who already voted on a video (a salted hash, never the address itself), so a vote counts once.
CREATE TABLE IF NOT EXISTS voters (
  video_id TEXT NOT NULL REFERENCES videos (id),
  voter TEXT NOT NULL,
  tier INTEGER NOT NULL,
  PRIMARY KEY (video_id, voter)
);
