-- Authorized integrated QA binding. Source databases and original CMS binding remain untouched.
CREATE SCHEMA runtime_v2;
CREATE TABLE runtime_v2.binding(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),database_name text NOT NULL,database_oid oid NOT NULL,physical_id text NOT NULL,data_directory text NOT NULL,dataset_sha256 text NOT NULL CHECK(length(dataset_sha256)=64),state text NOT NULL CHECK(state='READY'),authority text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE runtime_v2.origins(source_name text NOT NULL,source_oid text NOT NULL,table_name text NOT NULL,source_rows integer NOT NULL,imported_rows integer NOT NULL,source_sha256 text NOT NULL,PRIMARY KEY(source_name,table_name));
CREATE TABLE runtime_v2.migrations(version text PRIMARY KEY,checksum text NOT NULL,authority text NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE FUNCTION runtime_v2.immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'UNIFIED_BINDING_APPEND_ONLY' USING ERRCODE='42501'; END $$;
CREATE TRIGGER unified_binding_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON runtime_v2.binding FOR EACH STATEMENT EXECUTE FUNCTION runtime_v2.immutable();
CREATE TRIGGER unified_origins_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON runtime_v2.origins FOR EACH STATEMENT EXECUTE FUNCTION runtime_v2.immutable();
CREATE TRIGGER unified_migrations_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON runtime_v2.migrations FOR EACH STATEMENT EXECUTE FUNCTION runtime_v2.immutable();
CREATE FUNCTION runtime_v2.assert_target() RETURNS void LANGUAGE plpgsql AS $$
DECLARE b runtime_v2.binding;
BEGIN
 SELECT * INTO b FROM runtime_v2.binding WHERE singleton;
 IF b IS NULL OR b.state<>'READY' OR current_database()<>b.database_name OR current_database()!~'^v2_wave01_dev_test_w04b_unified_runtime01_[a-z0-9_]+$'
 OR (SELECT oid FROM pg_database WHERE datname=current_database())<>b.database_oid OR current_user<>'wave01' OR session_user<>'wave01'
 OR (SELECT system_identifier::text FROM pg_control_system())<>b.physical_id OR b.physical_id<>'7702384118803149788'
 OR inet_server_port()<>55401 OR host(inet_server_addr())<>'127.0.0.1' OR current_setting('data_directory')<>b.data_directory
 OR shobj_description(b.database_oid,'pg_database')<>'SMART_ENGLISH_DISPOSABLE_E2E_V1'
 OR (SELECT count(*) FROM public._prisma_migrations)<>32
 THEN RAISE EXCEPTION 'UNIFIED_TARGET_IDENTITY_REQUIRED' USING ERRCODE='42501';END IF;
END $$;
-- Retain the exact original CMS guard body under a new name. The additional
-- branch only accepts the independently verified, immutable integrated binding.
ALTER FUNCTION cms_v2.assert_target() RENAME TO assert_source_target;
CREATE FUNCTION cms_v2.assert_target() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF current_database()~'^v2_wave01_dev_test_w04b_unified_runtime01_[a-z0-9_]+$' THEN PERFORM runtime_v2.assert_target();
 ELSE PERFORM cms_v2.assert_source_target(); END IF;
END $$;
