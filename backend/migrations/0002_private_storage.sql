-- Additive schema upgrade. Existing activity is moved only by the user's
-- authenticated browser after it has encrypted and successfully saved it.
ALTER TABLE accounts ADD COLUMN auth_verifier TEXT;
ALTER TABLE accounts ADD COLUMN legacy_revision INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX ix_accounts_auth_verifier ON accounts(auth_verifier);
CREATE INDEX ix_fronts_account ON fronts(account_id);
CREATE INDEX ix_sessions_account_created ON web_sessions(account_id,created_at,token_verifier);

-- The user's code stays immutable. Permit only the one-time replacement of
-- the old verifier with a hash of the browser's authentication credential.
DROP TRIGGER accounts_code_immutable;
CREATE TRIGGER accounts_code_immutable BEFORE UPDATE OF code_verifier ON accounts
WHEN NOT (OLD.auth_verifier IS NULL AND NEW.auth_verifier IS NOT NULL AND NEW.code_verifier=NEW.auth_verifier)
BEGIN SELECT RAISE(ABORT, 'Account code is immutable'); END;

CREATE TABLE encrypted_vaults (
  account_id CHAR(32) NOT NULL PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  iv TEXT NOT NULL CHECK (length(iv)=16),
  ciphertext TEXT NOT NULL CHECK (length(ciphertext) BETWEEN 24 AND 699052),
  updated_at TEXT NOT NULL
);

-- A request from the previous Worker may still be in flight during rollout.
-- Count plaintext changes so the browser cannot migrate a stale export, and
-- prevent the old Worker from reintroducing plaintext after migration commits.
CREATE TRIGGER fronts_private_insert BEFORE INSERT ON fronts
WHEN EXISTS (SELECT 1 FROM encrypted_vaults WHERE account_id=NEW.account_id)
BEGIN SELECT RAISE(ABORT, 'Encrypted account'); END;
CREATE TRIGGER fronts_private_update BEFORE UPDATE ON fronts
WHEN EXISTS (SELECT 1 FROM encrypted_vaults WHERE account_id IN (OLD.account_id,NEW.account_id))
BEGIN SELECT RAISE(ABORT, 'Encrypted account'); END;
CREATE TRIGGER replays_private_insert BEFORE INSERT ON idempotency_requests
WHEN EXISTS (SELECT 1 FROM encrypted_vaults WHERE account_id=NEW.account_id)
BEGIN SELECT RAISE(ABORT, 'Encrypted account'); END;
CREATE TRIGGER fronts_revision_insert AFTER INSERT ON fronts
BEGIN UPDATE accounts SET legacy_revision=legacy_revision+1 WHERE id=NEW.account_id; END;
CREATE TRIGGER fronts_revision_update AFTER UPDATE ON fronts
BEGIN UPDATE accounts SET legacy_revision=legacy_revision+1 WHERE id IN (OLD.account_id,NEW.account_id); END;
CREATE TRIGGER fronts_revision_delete AFTER DELETE ON fronts
BEGIN UPDATE accounts SET legacy_revision=legacy_revision+1 WHERE id=OLD.account_id; END;
CREATE TRIGGER checks_revision_insert AFTER INSERT ON activity_checks
BEGIN UPDATE accounts SET legacy_revision=legacy_revision+1 WHERE id=(SELECT account_id FROM fronts WHERE id=NEW.front_id); END;
CREATE TRIGGER checks_revision_delete AFTER DELETE ON activity_checks
BEGIN UPDATE accounts SET legacy_revision=legacy_revision+1 WHERE id=(SELECT account_id FROM fronts WHERE id=OLD.front_id); END;
CREATE TRIGGER replays_revision_insert AFTER INSERT ON idempotency_requests
BEGIN UPDATE accounts SET legacy_revision=legacy_revision+1 WHERE id=NEW.account_id; END;
CREATE TRIGGER replays_revision_delete AFTER DELETE ON idempotency_requests
BEGIN UPDATE accounts SET legacy_revision=legacy_revision+1 WHERE id=OLD.account_id; END;
