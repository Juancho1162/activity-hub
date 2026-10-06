-- Fresh LOCAL experiment schema, derived from models.py and Alembic 0001-0003.
-- Not an import/upgrade procedure for existing or personal databases.
-- Keep Python's 32-hex UUIDs, ISO calendar dates and UTC text (six microseconds).
CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY);
INSERT INTO alembic_version VALUES ('0003');
CREATE TABLE worker_schema (version TEXT NOT NULL PRIMARY KEY);
INSERT INTO worker_schema VALUES ('0001');

CREATE TABLE accounts (
  id CHAR(32) NOT NULL PRIMARY KEY,
  code_verifier VARCHAR(64) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL,
  legacy_updated_at DATETIME,
  CONSTRAINT ck_accounts_uuid CHECK (length(id) = 32 AND id NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT ck_accounts_verifier CHECK (length(code_verifier) = 64 AND code_verifier NOT GLOB '*[^0-9a-f]*')
);
-- Also rejects updating to the same verifier, as the Python migration does.
CREATE TRIGGER accounts_code_immutable BEFORE UPDATE OF code_verifier ON accounts
BEGIN SELECT RAISE(ABORT, 'Account code is immutable'); END;

CREATE TABLE fronts (
  id CHAR(32) NOT NULL PRIMARY KEY,
  account_id CHAR(32) REFERENCES accounts(id),
  name VARCHAR(200) NOT NULL,
  reference VARCHAR(2048),
  state VARCHAR(8) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT ck_fronts_name CHECK (instr(name, char(0)) = 0 AND length(name) BETWEEN 1 AND 200 AND name = trim(name, char(9,10,11,12,13,28,29,30,31,32,133,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288)) AND length(trim(name, char(9,10,11,12,13,28,29,30,31,32,133,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288))) > 0),
  CONSTRAINT ck_fronts_state CHECK (state IN ('open', 'standby', 'archived')),
  CONSTRAINT ck_fronts_reference CHECK (reference IS NULL OR (length(reference) BETWEEN 8 AND 2048 AND (reference LIKE 'http://_%' OR reference LIKE 'https://_%'))),
  CONSTRAINT ck_fronts_uuid CHECK (length(id) = 32 AND id NOT GLOB '*[^0-9a-f]*')
);
CREATE TABLE activity_checks (
  front_id CHAR(32) NOT NULL REFERENCES fronts(id) ON DELETE RESTRICT,
  day DATE NOT NULL,
  PRIMARY KEY (front_id, day),
  CONSTRAINT ck_activity_checks_day CHECK (length(day) = 10 AND day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(day,1,4) >= '0001' AND date(day, '+0 days') IS NOT NULL AND date(day, '+0 days') = day)
);
CREATE TABLE idempotency_requests (
  account_id CHAR(32) REFERENCES accounts(id) ON DELETE RESTRICT,
  key CHAR(32) NOT NULL,
  operation VARCHAR(20) NOT NULL,
  target CHAR(32) REFERENCES fronts(id) ON DELETE RESTRICT,
  payload TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (account_id, key),
  CONSTRAINT ck_idempotency_operation CHECK (operation IN ('create_front', 'write_check')),
  CONSTRAINT ck_idempotency_target CHECK ((operation = 'create_front' AND target IS NULL) OR (operation = 'write_check' AND target IS NOT NULL)),
  CONSTRAINT ck_idempotency_json CHECK (json_valid(payload) AND json_valid(response)),
  CONSTRAINT ck_idempotency_uuid CHECK (length(key) = 32 AND key NOT GLOB '*[^0-9a-f]*')
);
CREATE TABLE web_sessions (
  token_verifier VARCHAR(64) NOT NULL PRIMARY KEY,
  account_id CHAR(32) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  csrf_token VARCHAR(43) NOT NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  CONSTRAINT ck_web_sessions_verifier CHECK (length(token_verifier) = 64 AND token_verifier NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT ck_web_sessions_csrf CHECK (length(csrf_token) = 43 AND csrf_token NOT GLOB '*[^A-Za-z0-9_-]*'),
  CONSTRAINT ck_web_sessions_expiry CHECK (expires_at > created_at)
);
CREATE INDEX ix_web_sessions_expires_at ON web_sessions (expires_at);
CREATE TABLE action_throttle (
  action VARCHAR(6) NOT NULL PRIMARY KEY,
  window_started_at DATETIME NOT NULL,
  attempts INTEGER NOT NULL,
  CONSTRAINT ck_action_throttle_action CHECK (action IN ('login', 'signup')),
  CONSTRAINT ck_action_throttle_attempts CHECK (attempts >= 0 AND ((action = 'login' AND attempts <= 10) OR (action = 'signup' AND attempts <= 5)))
);

-- Transaction-local scratch rows, inserted and removed in ONE D1 batch.
-- Each request has a random nonce; nothing is shared as an isolate permission
-- flag. Failed batches roll back their scratch row along with domain writes.
CREATE TABLE worker_batch_context (
  nonce TEXT NOT NULL PRIMARY KEY,
  now TEXT NOT NULL,
  account_id CHAR(32),
  today TEXT,
  status INTEGER NOT NULL,
  response TEXT
);
