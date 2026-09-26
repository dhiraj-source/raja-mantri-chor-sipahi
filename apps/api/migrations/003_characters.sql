-- Characters: kaun sa account kaun sa character khareed chuka hai + abhi kaun sa pehna hai.
-- DEFAULT character sabke paas hamesha hota hai (row ki zaroorat nahi).

ALTER TABLE accounts ADD COLUMN equipped_character text NOT NULL DEFAULT 'DEFAULT';

CREATE TABLE account_characters (
  account_id   uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  character_id text NOT NULL,
  acquired_at  timestamptz NOT NULL,
  PRIMARY KEY (account_id, character_id)
);
