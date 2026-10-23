CREATE TABLE IF NOT EXISTS planner_states (
  user_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS planner_history (
  user_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, revision)
);
CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  window INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS login_attempts_window ON login_attempts(window);
CREATE TRIGGER IF NOT EXISTS planner_history_insert AFTER INSERT ON planner_states BEGIN
  INSERT INTO planner_history (user_id, revision, data, updated_at) VALUES (NEW.user_id, NEW.revision, NEW.data, NEW.updated_at);
END;
CREATE TRIGGER IF NOT EXISTS planner_history_update AFTER UPDATE ON planner_states BEGIN
  INSERT INTO planner_history (user_id, revision, data, updated_at) VALUES (NEW.user_id, NEW.revision, NEW.data, NEW.updated_at);
  DELETE FROM planner_history WHERE user_id = NEW.user_id AND revision <= NEW.revision - 30;
END;
