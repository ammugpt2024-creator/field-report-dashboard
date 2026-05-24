-- Audit trail tables for tracking all changes to reports
-- This migration creates tables to track status changes, comments, and activity history

-- Report status history table
CREATE TABLE IF NOT EXISTS report_status_history (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES concrete_test_logs(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_role TEXT,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  comments TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_report_status_history_report_id ON report_status_history(report_id);
CREATE INDEX IF NOT EXISTS idx_report_status_history_changed_at ON report_status_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_status_history_changed_by ON report_status_history(changed_by);

-- Report comments table
CREATE TABLE IF NOT EXISTS report_comments (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES concrete_test_logs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_role TEXT,
  user_name TEXT,
  comment TEXT NOT NULL,
  comment_type TEXT DEFAULT 'general', -- 'general', 'approval', 'rejection', 'change_request'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_internal BOOLEAN DEFAULT FALSE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_report_comments_report_id ON report_comments(report_id);
CREATE INDEX IF NOT EXISTS idx_report_comments_created_at ON report_comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_comments_user_id ON report_comments(user_id);

-- Report activity log table
CREATE TABLE IF NOT EXISTS report_activity_log (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES concrete_test_logs(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'created', 'updated', 'submitted', 'approved', 'rejected', 'viewed', 'downloaded'
  entity_type TEXT, -- 'report', 'specification', 'delivery_record', 'attachment', 'signature'
  entity_id BIGINT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_role TEXT,
  user_name TEXT,
  ip_address TEXT,
  user_agent TEXT,
  changes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_report_activity_log_report_id ON report_activity_log(report_id);
CREATE INDEX IF NOT EXISTS idx_report_activity_log_action ON report_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_report_activity_log_created_at ON report_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_activity_log_user_id ON report_activity_log(user_id);

-- Enable Row Level Security
ALTER TABLE report_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_activity_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for report_status_history
CREATE POLICY "Users can view status history for their project reports"
  ON report_status_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM concrete_test_logs
      WHERE concrete_test_logs.id = report_status_history.report_id
      AND concrete_test_logs.project_id IN (
        SELECT project_id FROM project_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Service role can insert status history"
  ON report_status_history FOR INSERT
  TO service_role
  WITH CHECK (true);

-- RLS Policies for report_comments
CREATE POLICY "Users can view comments for their project reports"
  ON report_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM concrete_test_logs
      WHERE concrete_test_logs.id = report_comments.report_id
      AND concrete_test_logs.project_id IN (
        SELECT project_id FROM project_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert comments for their project reports"
  ON report_comments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM concrete_test_logs
      WHERE concrete_test_logs.id = report_comments.report_id
      AND concrete_test_logs.project_id IN (
        SELECT project_id FROM project_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update their own comments"
  ON report_comments FOR UPDATE
  USING (user_id = auth.uid());

-- RLS Policies for report_activity_log
CREATE POLICY "Users can view activity log for their project reports"
  ON report_activity_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM concrete_test_logs
      WHERE concrete_test_logs.id = report_activity_log.report_id
      AND concrete_test_logs.project_id IN (
        SELECT project_id FROM project_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Service role can insert activity log"
  ON report_activity_log FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Add updated_at trigger for report_comments
CREATE OR REPLACE FUNCTION update_report_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_report_comments_updated_at
  BEFORE UPDATE ON report_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_report_comments_updated_at();
