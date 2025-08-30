DROP TABLE IF EXISTS bot_friends;

CREATE TABLE IF NOT EXISTS bot_friends
(
 bot_id     VARCHAR(32),
 friend_id  INTEGER,
 created_at TIMESTAMP DEFAULT now(),
 PRIMARY KEY (bot_id, friend_id)
);
