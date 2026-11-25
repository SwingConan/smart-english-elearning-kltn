-- PO approved independent non-academic bank connection check, 2026-11-11.
-- Apply only to this newly created disposable. Never apply to existing QA.
CREATE SCHEMA br136_bank_check;
CREATE FUNCTION br136_bank_check.assert_target() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF current_database()<>'v2_wave01_dev_test_w04b_br136_demo_20261111_42db33'
 OR (SELECT oid FROM pg_database WHERE datname=current_database())<>1313121
 OR (SELECT system_identifier::text FROM pg_control_system())<>'7702384118803149788'
 OR current_setting('data_directory')<>'D:/KLTN_Project/smart-english-elearning-kltn/.local-storage/v2-wave01/postgres'
 OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database')<>'SMART_ENGLISH_DISPOSABLE_E2E_V1'
 OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55401
 OR current_user<>'wave01' OR session_user<>'wave01'
 THEN RAISE EXCEPTION 'BR136_BANK_CHECK_TARGET_REQUIRED' USING ERRCODE='42501'; END IF;
END $$;
SELECT br136_bank_check.assert_target();
CREATE TABLE br136_bank_check.orders(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 purpose text NOT NULL UNIQUE CHECK(purpose='NON_ACADEMIC_BANK_CONNECTION_CHECK'),
 learner_id uuid NOT NULL REFERENCES public.users(id)
   CHECK(learner_id='5c0adc3b-c075-4f03-8832-563140c983e9'),
 payment_code text NOT NULL UNIQUE CHECK(payment_code~'^SEV2[A-F0-9]{20}$'),
 amount_vnd integer NOT NULL CHECK(amount_vnd=1000),
 bank_account_id uuid NOT NULL, account_number text NOT NULL, account_holder text NOT NULL,
 bank_code text NOT NULL, gateway text NOT NULL, sub_account text NOT NULL CHECK(sub_account=''),
 receiver_fingerprint char(64) NOT NULL,
 idempotency_key uuid NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE br136_bank_check.receipts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL UNIQUE REFERENCES br136_bank_check.orders(id),
 bank_account_id uuid NOT NULL, provider_transaction_id bigint NOT NULL CHECK(provider_transaction_id>0),
 provider_transaction_uuid uuid NOT NULL UNIQUE,
 semantic_hash char(64) NOT NULL, raw_hash char(64) NOT NULL, provider_response_hash char(64) NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(bank_account_id,provider_transaction_id)
);
CREATE FUNCTION br136_bank_check.immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'BR136_BANK_CHECK_APPEND_ONLY' USING ERRCODE='42501'; END $$;
CREATE FUNCTION br136_bank_check.guard_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM br136_bank_check.assert_target(); RETURN NEW; END $$;
CREATE TRIGGER bank_check_order_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON br136_bank_check.orders FOR EACH STATEMENT EXECUTE FUNCTION br136_bank_check.immutable();
CREATE TRIGGER bank_check_receipt_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON br136_bank_check.receipts FOR EACH STATEMENT EXECUTE FUNCTION br136_bank_check.immutable();
CREATE TRIGGER bank_check_order_target BEFORE INSERT ON br136_bank_check.orders FOR EACH ROW EXECUTE FUNCTION br136_bank_check.guard_insert();
CREATE TRIGGER bank_check_receipt_target BEFORE INSERT ON br136_bank_check.receipts FOR EACH ROW EXECUTE FUNCTION br136_bank_check.guard_insert();
