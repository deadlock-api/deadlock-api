-- Guess the Rank: every video is scheduled for its own UTC day (YYYY-MM-DD), three a day, by the video pipeline at
-- publish time. A day plays the videos scheduled for it (src/lib/guess-the-rank/daily.ts); null is not scheduled yet.
-- Applied remotely by hand before this file existed: `wrangler d1 migrations apply` only has to record it there.
-- SQLite has no ADD COLUMN IF NOT EXISTS, so running it against a database that already has the column fails.
ALTER TABLE videos ADD COLUMN play_date TEXT;
CREATE INDEX IF NOT EXISTS videos_play_date ON videos (play_date);
