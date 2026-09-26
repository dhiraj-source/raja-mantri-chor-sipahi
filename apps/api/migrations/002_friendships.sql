-- Dosti: ek pair ki ek hi row. account_low < account_high rakhte hain taaki (A,B) aur (B,A) alag row na banein.
-- requested_by = jisne request bheji thi.

CREATE TABLE friendships (
  account_low  uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  account_high uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  status       text NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED')),
  created_at   timestamptz NOT NULL,
  PRIMARY KEY (account_low, account_high),
  CHECK (account_low < account_high),
  CHECK (requested_by = account_low OR requested_by = account_high)
);

CREATE INDEX friendships_high_idx ON friendships (account_high);
