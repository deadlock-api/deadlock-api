DROP TABLE IF EXISTS bot_friends;

CREATE TABLE IF NOT EXISTS bot_friends
(
 friend_id  INTEGER PRIMARY KEY,
 bot_id     VARCHAR(32),
 created_at TIMESTAMP DEFAULT now()
);
