-- Enable explicit assignment windows. Keep source ownership and immutable publication checks.
ALTER TABLE class_activities DROP CONSTRAINT assignment_draft_shape;
ALTER TABLE class_activities ADD CONSTRAINT assignment_draft_shape CHECK (
  type::text <> 'ASSIGNMENT' OR (
    "resourceUrl" IS NULL AND "storageKey" IS NULL
    AND "sourceLessonId" IS NULL AND "sourceResourceId" IS NULL
  )
);
ALTER TABLE class_activity_revisions DROP CONSTRAINT assignment_revision_shape;
ALTER TABLE class_activity_revisions ADD CONSTRAINT assignment_revision_shape CHECK (
  type::text <> 'ASSIGNMENT' OR (
    "sourceLessonId" IS NULL AND "sourceResourceId" IS NULL
  )
);

-- Enforce the published window for new drafts/submissions without rewriting existing work.
CREATE FUNCTION assignment_submission_window_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM class_activity_revisions r WHERE r.id = NEW."revisionId"
    AND ((r."availableFrom" IS NOT NULL AND r."availableFrom" > clock_timestamp())
      OR (r."availableUntil" IS NOT NULL AND r."availableUntil" <= clock_timestamp()))
  ) THEN
    RAISE EXCEPTION 'ASSIGNMENT_SUBMISSION_WINDOW_CLOSED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER assignment_submission_window_guard
  BEFORE INSERT OR UPDATE ON class_assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION assignment_submission_window_guard();
