-- PO V2-W07-SEPAY-FULLSTACK-01: additive ledger on verified integrated QA only.
-- Existing W07 TEST guards, finance history, enrollment gates and Prisma ledger stay intact.
CREATE SCHEMA sepay_v2;
CREATE TABLE sepay_v2.migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE FUNCTION sepay_v2.assert_target() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM runtime_v2.assert_target();
 IF current_database()<>'v2_wave01_dev_test_w04b_unified_runtime01_20261107' OR
 (SELECT oid FROM pg_database WHERE datname=current_database())<>953322 THEN
 RAISE EXCEPTION 'SEPAY_INTEGRATED_IDENTITY_REQUIRED' USING ERRCODE='42501';END IF;
END $$;
CREATE TABLE sepay_v2.live_sources(
 obligation_id uuid PRIMARY KEY REFERENCES public.w07_obligations(id),
 consent_version text NOT NULL CHECK(consent_version!~*'(TEST|SYNTHETIC)'),
 decision_reference text NOT NULL CHECK(length(trim(decision_reference))>=8),
 academic_actor uuid NOT NULL REFERENCES public.users(id),
 finance_actor uuid NOT NULL REFERENCES public.users(id),
 approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(academic_actor<>finance_actor)
);
CREATE TABLE sepay_v2.orders(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 obligation_id uuid NOT NULL UNIQUE REFERENCES sepay_v2.live_sources(obligation_id),
 learner_id uuid NOT NULL REFERENCES public.users(id),
 class_id uuid NOT NULL REFERENCES public.class_offerings(id),
 payment_code varchar(32) NOT NULL UNIQUE CHECK(payment_code~'^SEV2[A-F0-9]{20}$'),
 amount_vnd bigint NOT NULL CHECK(amount_vnd>0 AND amount_vnd<=2147483647),
 bank_account_id uuid NOT NULL,account_number text NOT NULL,account_holder text NOT NULL,
 bank_code text NOT NULL,gateway text NOT NULL,sub_account text NOT NULL DEFAULT '',
 receiver_fingerprint char(64) NOT NULL,consent_version text NOT NULL,
 idempotency_key uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(learner_id,idempotency_key)
);
CREATE TABLE sepay_v2.inbox(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bank_account_id uuid NOT NULL,
 transaction_id bigint NOT NULL CHECK(transaction_id>0),
 payload_hash char(64) NOT NULL,raw_hash char(64) NOT NULL,payload jsonb NOT NULL,
 order_id uuid REFERENCES sepay_v2.orders(id),class_id uuid REFERENCES public.class_offerings(id),
 classification text NOT NULL,received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(bank_account_id,transaction_id)
);
CREATE TABLE sepay_v2.exceptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),inbox_id uuid NOT NULL REFERENCES sepay_v2.inbox(id),
 kind text NOT NULL,incoming_hash char(64),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(inbox_id,kind,incoming_hash)
);
CREATE TABLE sepay_v2.reconciliations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),inbox_id uuid NOT NULL UNIQUE REFERENCES sepay_v2.inbox(id),
 actor_id uuid NOT NULL REFERENCES public.users(id),grant_id uuid NOT NULL REFERENCES public.permission_grants(id),
 decision text NOT NULL CHECK(decision IN ('CONFIRM_RECEIPT','HOLD')),
 reason text NOT NULL CHECK(length(trim(reason))>=8),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Local contract checks have no FKs to financial orders/events and can never settle money.
CREATE TABLE sepay_v2.contract_checks(
 run_id uuid NOT NULL,transaction_id bigint NOT NULL,payload_hash char(64) NOT NULL,
 actor_id uuid NOT NULL REFERENCES public.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(run_id,transaction_id)
);
CREATE FUNCTION sepay_v2.immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'SEPAY_APPEND_ONLY' USING ERRCODE='42501';END $$;
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['migrations','live_sources','orders','inbox','exceptions','reconciliations','contract_checks'] LOOP
 EXECUTE format('CREATE TRIGGER sepay_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON sepay_v2.%I FOR EACH STATEMENT EXECUTE FUNCTION sepay_v2.immutable()',t);
END LOOP;END $$;
CREATE FUNCTION sepay_v2.validate_live_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fee public.w07_obligations;app public.w07_applications;
BEGIN
 PERFORM sepay_v2.assert_target();
 SELECT * INTO fee FROM public.w07_obligations WHERE id=NEW.obligation_id;
 SELECT * INTO app FROM public.w07_applications WHERE id=fee."applicationId";
 IF app.id IS NULL OR app.state<>'APPROVED' OR app."consentVersion"<>NEW.consent_version OR
 NOT EXISTS(SELECT 1 FROM public.w07_academic_decisions d WHERE d.id=fee."decisionId" AND d.kind='APPROVE' AND d."reviewerId"=NEW.academic_actor) OR
 NOT EXISTS(SELECT 1 FROM public.users WHERE id=NEW.academic_actor AND role='ACADEMIC_MANAGER' AND status='ACTIVE') OR
 NOT EXISTS(SELECT 1 FROM public.users WHERE id=NEW.finance_actor AND role='CASHIER' AND status='ACTIVE') OR
 NOT EXISTS(SELECT 1 FROM public.permission_grants WHERE "userId"=NEW.finance_actor AND capability='finance.verify' AND "scopeType"='CLASS' AND "scopeId"=app."classId" AND "approvedBy" IS NOT NULL AND "revokedAt" IS NULL AND "effectiveAt"<=timezone('UTC',clock_timestamp()) AND "expiresAt">timezone('UTC',clock_timestamp()))
 THEN RAISE EXCEPTION 'SEPAY_LIVE_SOURCE_APPROVAL_REQUIRED' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sepay_live_source BEFORE INSERT ON sepay_v2.live_sources FOR EACH ROW EXECUTE FUNCTION sepay_v2.validate_live_source();
