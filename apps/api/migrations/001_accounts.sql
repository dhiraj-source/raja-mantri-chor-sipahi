-- Accounts + game history.
-- Nayi changes ke liye NAYI file (002_..., 003_...) banao; purani file kabhi edit mat karo.

CREATE TABLE accounts (
  id            uuid PRIMARY KEY,
  username      text NOT NULL UNIQUE CHECK (username = lower(username)),
  display_name  text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL,
  xp            integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  coins         integer NOT NULL DEFAULT 0 CHECK (coins >= 0),
  games_played  integer NOT NULL DEFAULT 0 CHECK (games_played >= 0),
  wins          integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
  achievements  text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE game_history (
  seq          bigserial PRIMARY KEY,
  id           uuid NOT NULL UNIQUE,
  account_id   uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  played_at    timestamptz NOT NULL,
  room_code    text NOT NULL,
  points       integer NOT NULL,
  is_winner    boolean NOT NULL,
  xp_gained    integer NOT NULL,
  coins_gained integer NOT NULL
);

CREATE INDEX game_history_account_idx ON game_history (account_id, seq DESC);
