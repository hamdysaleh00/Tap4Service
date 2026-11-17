-- Optional additive indexes for an EXISTING normalized D1 database only.
-- New databases created from staged 0001 already include these indexes.
-- No deployment, storage cutover, table data change or automatic application.
CREATE INDEX IF NOT EXISTS sessions_history_position ON sessions(restaurant_id,position);
CREATE INDEX IF NOT EXISTS feedback_history_position ON feedback(restaurant_id,position);
CREATE INDEX IF NOT EXISTS service_requests_history_position ON service_requests(restaurant_id,position);
CREATE INDEX IF NOT EXISTS audit_events_history_position ON audit_events(restaurant_id,position);
CREATE INDEX IF NOT EXISTS sessions_sync_occupied ON sessions(restaurant_id,id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS sessions_sync_open_bill ON sessions(restaurant_id,id) WHERE status='FINALIZED' AND closed_at IS NULL;
