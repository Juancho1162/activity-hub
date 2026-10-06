-- One successful registration per challenge, even if Siteverify accepts a
-- duplicate validation. Store only its domain-separated SHA-256 fingerprint.
-- NULL preserves existing accounts and the loopback-only development bypass.
ALTER TABLE accounts ADD COLUMN signup_challenge TEXT CHECK (signup_challenge IS NULL OR length(signup_challenge)=64);
CREATE UNIQUE INDEX ix_accounts_signup_challenge ON accounts(signup_challenge);
