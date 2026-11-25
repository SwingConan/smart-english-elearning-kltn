-- PO: MB does not accept the 1,000 VND transfer; replace with a 10,000 VND check.
-- Retain the original immutable order. Only the independent demo is authorized.
SELECT br136_bank_check.assert_target();
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM br136_bank_check.receipts)
 OR (SELECT count(*) FROM br136_bank_check.orders)<>1
 OR NOT EXISTS(SELECT 1 FROM br136_bank_check.orders WHERE amount_vnd=1000)
 THEN RAISE EXCEPTION 'UNPAID_1000_ORDER_REQUIRED'; END IF;
END $$;
CREATE TABLE br136_bank_check.cancellations(
 order_id uuid PRIMARY KEY REFERENCES br136_bank_check.orders(id),
 reason text NOT NULL CHECK(reason='PO_BANK_MINIMUM_AMOUNT_REPLACED_WITH_10000'),
 cancelled_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER bank_check_cancellation_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON br136_bank_check.cancellations FOR EACH STATEMENT EXECUTE FUNCTION br136_bank_check.immutable();
CREATE TRIGGER bank_check_cancellation_target BEFORE INSERT ON br136_bank_check.cancellations FOR EACH ROW EXECUTE FUNCTION br136_bank_check.guard_insert();
INSERT INTO br136_bank_check.cancellations(order_id,reason)
 SELECT id,'PO_BANK_MINIMUM_AMOUNT_REPLACED_WITH_10000' FROM br136_bank_check.orders WHERE amount_vnd=1000;
ALTER TABLE br136_bank_check.orders DROP CONSTRAINT orders_purpose_key;
ALTER TABLE br136_bank_check.orders DROP CONSTRAINT orders_amount_vnd_check;
ALTER TABLE br136_bank_check.orders ADD CONSTRAINT bank_check_bounded_amount CHECK(amount_vnd IN (1000,10000));
ALTER TABLE br136_bank_check.orders ADD CONSTRAINT bank_check_one_order_per_amount UNIQUE(purpose,amount_vnd);
CREATE FUNCTION br136_bank_check.receipt_requires_active_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM br136_bank_check.cancellations WHERE order_id=NEW.order_id)
 THEN RAISE EXCEPTION 'CANCELLED_BANK_CHECK_CANNOT_SETTLE' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bank_check_receipt_active BEFORE INSERT ON br136_bank_check.receipts FOR EACH ROW EXECUTE FUNCTION br136_bank_check.receipt_requires_active_order();
