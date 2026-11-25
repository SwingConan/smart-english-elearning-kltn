-- Append-only forward hardening; original 001 checksum stays unchanged.
SELECT runtime_v2.assert_target();
ALTER TABLE academic_offer_v2.version_events ADD CONSTRAINT version_event_state CHECK (
 (kind IN ('DRAFT_SAVED','RETURNED') AND snapshot->>'state'='DRAFT') OR
 (kind IN ('SUBMITTED','PRICE_CONFIRMED') AND snapshot->>'state'='PENDING_APPROVAL') OR
 (kind='PUBLISHED' AND snapshot->>'state'='PUBLISHED' AND snapshot->>'approvedBy'=actor_id::text)
);
