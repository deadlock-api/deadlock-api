DROP TABLE IF EXISTS bot_friends;

CREATE TABLE bot_friends
(
 bot_id     INTEGER PRIMARY KEY,
 friend_id  INTEGER,
 created_at TIMESTAMP DEFAULT now()
);
