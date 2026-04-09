-- SQLAtlas Test Data: PostgreSQL (Banking System)
-- Creates a separate "banking_demo" database with PL/pgSQL procedures

-- Run this connected to sqlatlas-db as sqlatlas user:
--   psql -h localhost -p 9432 -U sqlatlas -d sqlatlas -f seed-banking.sql

-- Create schemas
CREATE SCHEMA IF NOT EXISTS customers;
CREATE SCHEMA IF NOT EXISTS banking;
CREATE SCHEMA IF NOT EXISTS cards;
CREATE SCHEMA IF NOT EXISTS payments;
CREATE SCHEMA IF NOT EXISTS fraud;
CREATE SCHEMA IF NOT EXISTS notifications;
CREATE SCHEMA IF NOT EXISTS reports;
CREATE SCHEMA IF NOT EXISTS audit;

-- ══════════════════════════════
-- TABLES
-- ══════════════════════════════

CREATE TABLE customers.accounts (
    account_id    UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    full_name     VARCHAR(200) NOT NULL,
    phone         VARCHAR(20),
    tier          VARCHAR(20) DEFAULT 'basic' NOT NULL,
    balance       NUMERIC(15,2) DEFAULT 0.00 NOT NULL,
    credit_limit  NUMERIC(15,2) DEFAULT 1000.00,
    currency      VARCHAR(3) DEFAULT 'USD' NOT NULL,
    status        VARCHAR(20) DEFAULT 'active' NOT NULL,
    kyc_verified  BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE banking.transactions (
    txn_id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    account_id      UUID NOT NULL REFERENCES customers.accounts(account_id),
    counterparty_id UUID REFERENCES customers.accounts(account_id),
    txn_type        VARCHAR(30) NOT NULL,
    amount          NUMERIC(15,2) NOT NULL,
    currency        VARCHAR(3) DEFAULT 'USD',
    description     VARCHAR(500),
    reference       VARCHAR(100),
    status          VARCHAR(20) DEFAULT 'pending' NOT NULL,
    fee             NUMERIC(10,2) DEFAULT 0.00,
    exchange_rate   NUMERIC(10,6),
    metadata        JSONB DEFAULT '{}',
    fraud_score     NUMERIC(5,2),
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE cards.cards (
    card_id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    account_id      UUID NOT NULL REFERENCES customers.accounts(account_id),
    card_number     VARCHAR(19) NOT NULL,
    card_type       VARCHAR(20) DEFAULT 'debit',
    expiry_month    INT NOT NULL,
    expiry_year     INT NOT NULL,
    cvv_hash        VARCHAR(64),
    status          VARCHAR(20) DEFAULT 'active' NOT NULL,
    daily_limit     NUMERIC(10,2) DEFAULT 5000.00,
    blocked_reason  VARCHAR(200),
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE fraud.alerts (
    alert_id      UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    txn_id        UUID REFERENCES banking.transactions(txn_id),
    account_id    UUID NOT NULL REFERENCES customers.accounts(account_id),
    alert_type    VARCHAR(50) NOT NULL,
    severity      VARCHAR(20) NOT NULL,
    score         NUMERIC(5,2),
    description   VARCHAR(500),
    resolved      BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE payments.settlements (
    settlement_id  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    batch_date     DATE NOT NULL,
    total_amount   NUMERIC(15,2) NOT NULL,
    txn_count      INT NOT NULL,
    status         VARCHAR(20) DEFAULT 'pending',
    processor      VARCHAR(50),
    reference      VARCHAR(100),
    settled_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE notifications.queue (
    notification_id  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    account_id       UUID NOT NULL REFERENCES customers.accounts(account_id),
    channel          VARCHAR(20) NOT NULL,
    subject          VARCHAR(200),
    body             TEXT,
    status           VARCHAR(20) DEFAULT 'pending',
    created_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE reports.daily_summary (
    report_id     UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    report_date   DATE NOT NULL UNIQUE,
    total_txns    INT DEFAULT 0,
    total_volume  NUMERIC(15,2) DEFAULT 0,
    total_fees    NUMERIC(10,2) DEFAULT 0,
    fraud_count   INT DEFAULT 0,
    new_accounts  INT DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE audit.activity_log (
    log_id        UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    entity_type   VARCHAR(50) NOT NULL,
    entity_id     UUID,
    action        VARCHAR(50) NOT NULL,
    actor          VARCHAR(100),
    old_data      JSONB,
    new_data      JSONB,
    ip_address    VARCHAR(45),
    created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_txn_account ON banking.transactions(account_id);
CREATE INDEX idx_txn_status ON banking.transactions(status);
CREATE INDEX idx_txn_created ON banking.transactions(created_at);
CREATE INDEX idx_cards_account ON cards.cards(account_id);
CREATE INDEX idx_fraud_account ON fraud.alerts(account_id);
CREATE INDEX idx_fraud_severity ON fraud.alerts(severity);
CREATE INDEX idx_notif_account ON notifications.queue(account_id);
CREATE INDEX idx_notif_status ON notifications.queue(status);
CREATE INDEX idx_audit_entity ON audit.activity_log(entity_type, entity_id);

-- ══════════════════════════════
-- FUNCTIONS & PROCEDURES
-- ══════════════════════════════

-- audit.log_activity (CC=1, utility)
CREATE OR REPLACE FUNCTION audit.log_activity(
    p_entity_type VARCHAR,
    p_entity_id UUID,
    p_action VARCHAR,
    p_actor VARCHAR DEFAULT current_user,
    p_old_data JSONB DEFAULT NULL,
    p_new_data JSONB DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO audit.activity_log (entity_type, entity_id, action, actor, old_data, new_data)
    VALUES (p_entity_type, p_entity_id, p_action, p_actor, p_old_data, p_new_data)
    RETURNING log_id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

-- notifications.send_notification (CC=3, multi-channel dispatch)
CREATE OR REPLACE FUNCTION notifications.send_notification(
    p_account_id UUID,
    p_channel VARCHAR,
    p_subject VARCHAR,
    p_body TEXT
) RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE
    v_notif_id UUID;
    v_account_status VARCHAR;
BEGIN
    SELECT status INTO v_account_status
    FROM customers.accounts WHERE account_id = p_account_id;

    IF v_account_status IS NULL THEN
        RAISE EXCEPTION 'Account not found: %', p_account_id;
    END IF;

    IF v_account_status = 'suspended' THEN
        RAISE NOTICE 'Skipping notification for suspended account %', p_account_id;
        RETURN NULL;
    END IF;

    INSERT INTO notifications.queue (account_id, channel, subject, body, status)
    VALUES (p_account_id, p_channel, p_subject, p_body, 'queued')
    RETURNING notification_id INTO v_notif_id;

    RETURN v_notif_id;
END;
$$;

-- banking.validate_balance (CC=7, validation with limits)
CREATE OR REPLACE FUNCTION banking.validate_balance(
    p_account_id UUID,
    p_amount NUMERIC,
    p_txn_type VARCHAR
) RETURNS TABLE(is_valid BOOLEAN, message VARCHAR, available NUMERIC)
LANGUAGE plpgsql AS $$
DECLARE
    v_balance NUMERIC;
    v_credit_limit NUMERIC;
    v_status VARCHAR;
    v_tier VARCHAR;
    v_daily_total NUMERIC;
    v_daily_limit NUMERIC;
BEGIN
    SELECT balance, credit_limit, status, tier
    INTO v_balance, v_credit_limit, v_status, v_tier
    FROM customers.accounts WHERE account_id = p_account_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Account not found'::VARCHAR, 0::NUMERIC;
        RETURN;
    END IF;

    IF v_status != 'active' THEN
        RETURN QUERY SELECT FALSE, ('Account is ' || v_status)::VARCHAR, 0::NUMERIC;
        RETURN;
    END IF;

    -- Daily limit check
    v_daily_limit := CASE v_tier
        WHEN 'premium' THEN 50000.00
        WHEN 'gold' THEN 25000.00
        WHEN 'basic' THEN 10000.00
        ELSE 5000.00
    END;

    SELECT COALESCE(SUM(amount), 0) INTO v_daily_total
    FROM banking.transactions
    WHERE account_id = p_account_id
      AND txn_type IN ('withdrawal', 'transfer_out', 'payment')
      AND created_at >= CURRENT_DATE
      AND status = 'completed';

    IF v_daily_total + p_amount > v_daily_limit THEN
        RETURN QUERY SELECT FALSE,
            format('Daily limit exceeded: %s/%s', (v_daily_total + p_amount)::TEXT, v_daily_limit::TEXT)::VARCHAR,
            (v_daily_limit - v_daily_total)::NUMERIC;
        RETURN;
    END IF;

    -- Balance check (allow overdraft up to credit limit for premium)
    IF p_txn_type IN ('withdrawal', 'transfer_out', 'payment') THEN
        IF v_balance - p_amount < -v_credit_limit THEN
            RETURN QUERY SELECT FALSE, 'Insufficient funds'::VARCHAR, (v_balance + v_credit_limit)::NUMERIC;
            RETURN;
        END IF;
    END IF;

    RETURN QUERY SELECT TRUE, 'OK'::VARCHAR, v_balance::NUMERIC;
END;
$$;

-- cards.validate_card (CC=9, Luhn check + expiry + status)
CREATE OR REPLACE FUNCTION cards.validate_card(
    p_card_number VARCHAR,
    p_expiry_month INT,
    p_expiry_year INT,
    p_amount NUMERIC DEFAULT 0
) RETURNS TABLE(is_valid BOOLEAN, message VARCHAR, card_id UUID)
LANGUAGE plpgsql AS $$
DECLARE
    v_card RECORD;
    v_sum INT := 0;
    v_digit INT;
    v_double BOOLEAN := FALSE;
    v_i INT;
    v_clean VARCHAR;
BEGIN
    -- Luhn check
    v_clean := REPLACE(p_card_number, ' ', '');
    FOR v_i IN REVERSE LENGTH(v_clean)..1 LOOP
        v_digit := SUBSTRING(v_clean FROM v_i FOR 1)::INT;
        IF v_double THEN
            v_digit := v_digit * 2;
            IF v_digit > 9 THEN v_digit := v_digit - 9; END IF;
        END IF;
        v_sum := v_sum + v_digit;
        v_double := NOT v_double;
    END LOOP;

    IF v_sum % 10 != 0 THEN
        RETURN QUERY SELECT FALSE, 'Invalid card number (Luhn check failed)'::VARCHAR, NULL::UUID;
        RETURN;
    END IF;

    -- Find card
    SELECT * INTO v_card FROM cards.cards
    WHERE card_number = v_clean AND status != 'cancelled'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Card not found'::VARCHAR, NULL::UUID;
        RETURN;
    END IF;

    -- Expiry check
    IF (p_expiry_year < EXTRACT(YEAR FROM CURRENT_DATE)::INT) OR
       (p_expiry_year = EXTRACT(YEAR FROM CURRENT_DATE)::INT AND p_expiry_month < EXTRACT(MONTH FROM CURRENT_DATE)::INT) THEN
        RETURN QUERY SELECT FALSE, 'Card expired'::VARCHAR, v_card.card_id;
        RETURN;
    END IF;

    IF v_card.status = 'blocked' THEN
        RETURN QUERY SELECT FALSE, ('Card blocked: ' || COALESCE(v_card.blocked_reason, 'unknown'))::VARCHAR, v_card.card_id;
        RETURN;
    END IF;

    -- Daily limit
    IF p_amount > v_card.daily_limit THEN
        RETURN QUERY SELECT FALSE, format('Exceeds daily limit: %s', v_card.daily_limit::TEXT)::VARCHAR, v_card.card_id;
        RETURN;
    END IF;

    RETURN QUERY SELECT TRUE, 'Card valid'::VARCHAR, v_card.card_id;
END;
$$;

-- fraud.check_transaction (CC=21, complex risk scoring)
CREATE OR REPLACE FUNCTION fraud.check_transaction(
    p_account_id UUID,
    p_amount NUMERIC,
    p_txn_type VARCHAR,
    p_metadata JSONB DEFAULT '{}'
) RETURNS TABLE(risk_score NUMERIC, risk_level VARCHAR, reasons TEXT[])
LANGUAGE plpgsql AS $$
DECLARE
    v_score NUMERIC := 0;
    v_reasons TEXT[] := '{}';
    v_account RECORD;
    v_recent_count INT;
    v_recent_total NUMERIC;
    v_avg_txn NUMERIC;
    v_hour INT;
    v_country VARCHAR;
    v_prev_alerts INT;
BEGIN
    SELECT * INTO v_account FROM customers.accounts WHERE account_id = p_account_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 100::NUMERIC, 'critical'::VARCHAR, ARRAY['Account not found']::TEXT[];
        RETURN;
    END IF;

    -- KYC not verified
    IF NOT v_account.kyc_verified THEN
        v_score := v_score + 15;
        v_reasons := array_append(v_reasons, 'KYC not verified');
    END IF;

    -- Large transaction relative to balance
    IF p_amount > v_account.balance * 0.8 AND p_amount > 1000 THEN
        v_score := v_score + 20;
        v_reasons := array_append(v_reasons, format('Large txn: %s vs balance %s', p_amount, v_account.balance));
    END IF;

    IF p_amount > 10000 THEN
        v_score := v_score + 10;
        v_reasons := array_append(v_reasons, 'Amount exceeds $10,000 reporting threshold');
    END IF;

    -- Velocity check: recent transactions in last hour
    SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_recent_count, v_recent_total
    FROM banking.transactions
    WHERE account_id = p_account_id
      AND created_at >= NOW() - INTERVAL '1 hour'
      AND status != 'failed';

    IF v_recent_count > 10 THEN
        v_score := v_score + 25;
        v_reasons := array_append(v_reasons, format('High velocity: %s txns in last hour', v_recent_count));
    ELSIF v_recent_count > 5 THEN
        v_score := v_score + 10;
        v_reasons := array_append(v_reasons, format('Elevated velocity: %s txns in last hour', v_recent_count));
    END IF;

    -- Average transaction deviation
    SELECT COALESCE(AVG(amount), 0) INTO v_avg_txn
    FROM banking.transactions
    WHERE account_id = p_account_id
      AND status = 'completed'
      AND created_at >= NOW() - INTERVAL '30 days';

    IF v_avg_txn > 0 AND p_amount > v_avg_txn * 5 THEN
        v_score := v_score + 15;
        v_reasons := array_append(v_reasons, format('5x above avg txn (%s vs %s)', p_amount, ROUND(v_avg_txn, 2)));
    END IF;

    -- Off-hours check
    v_hour := EXTRACT(HOUR FROM NOW())::INT;
    IF v_hour >= 1 AND v_hour <= 5 THEN
        v_score := v_score + 10;
        v_reasons := array_append(v_reasons, 'Transaction during unusual hours (1AM-5AM)');
    END IF;

    -- International transaction
    v_country := p_metadata->>'country';
    IF v_country IS NOT NULL AND v_country != 'US' THEN
        v_score := v_score + 8;
        v_reasons := array_append(v_reasons, format('International transaction: %s', v_country));

        -- Check if first international txn
        IF NOT EXISTS (
            SELECT 1 FROM banking.transactions
            WHERE account_id = p_account_id
              AND metadata->>'country' = v_country
              AND status = 'completed'
        ) THEN
            v_score := v_score + 12;
            v_reasons := array_append(v_reasons, format('First transaction from %s', v_country));
        END IF;
    END IF;

    -- New account
    IF v_account.created_at >= NOW() - INTERVAL '7 days' THEN
        v_score := v_score + 10;
        v_reasons := array_append(v_reasons, 'Account less than 7 days old');
    END IF;

    -- Previous fraud alerts
    SELECT COUNT(*) INTO v_prev_alerts
    FROM fraud.alerts
    WHERE account_id = p_account_id AND NOT resolved;

    IF v_prev_alerts > 0 THEN
        v_score := v_score + 15;
        v_reasons := array_append(v_reasons, format('%s unresolved fraud alerts', v_prev_alerts));
    END IF;

    -- Cap score at 100
    v_score := LEAST(v_score, 100);

    RETURN QUERY SELECT
        v_score,
        CASE
            WHEN v_score >= 80 THEN 'critical'
            WHEN v_score >= 60 THEN 'high'
            WHEN v_score >= 40 THEN 'medium'
            WHEN v_score >= 20 THEN 'low'
            ELSE 'minimal'
        END::VARCHAR,
        v_reasons;
END;
$$;

-- banking.process_card_transaction (CC=13, main pipeline, calls multiple SPs)
CREATE OR REPLACE FUNCTION banking.process_card_transaction(
    p_card_number VARCHAR,
    p_expiry_month INT,
    p_expiry_year INT,
    p_amount NUMERIC,
    p_description VARCHAR DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
) RETURNS TABLE(txn_id UUID, status VARCHAR, message VARCHAR)
LANGUAGE plpgsql AS $$
DECLARE
    v_card_valid BOOLEAN;
    v_card_msg VARCHAR;
    v_card_id UUID;
    v_account_id UUID;
    v_balance_valid BOOLEAN;
    v_balance_msg VARCHAR;
    v_fraud_score NUMERIC;
    v_fraud_level VARCHAR;
    v_fraud_reasons TEXT[];
    v_txn_id UUID;
    v_fee NUMERIC;
BEGIN
    -- Step 1: Validate card
    SELECT cv.is_valid, cv.message, cv.card_id
    INTO v_card_valid, v_card_msg, v_card_id
    FROM cards.validate_card(p_card_number, p_expiry_month, p_expiry_year, p_amount) cv;

    IF NOT v_card_valid THEN
        RETURN QUERY SELECT NULL::UUID, 'rejected'::VARCHAR, v_card_msg;
        RETURN;
    END IF;

    -- Get account from card
    SELECT account_id INTO v_account_id FROM cards.cards WHERE cards.card_id = v_card_id;

    -- Step 2: Validate balance
    SELECT bv.is_valid, bv.message
    INTO v_balance_valid, v_balance_msg
    FROM banking.validate_balance(v_account_id, p_amount, 'payment') bv;

    IF NOT v_balance_valid THEN
        RETURN QUERY SELECT NULL::UUID, 'rejected'::VARCHAR, v_balance_msg;
        RETURN;
    END IF;

    -- Step 3: Fraud check
    SELECT fc.risk_score, fc.risk_level, fc.reasons
    INTO v_fraud_score, v_fraud_level, v_fraud_reasons
    FROM fraud.check_transaction(v_account_id, p_amount, 'card_payment', p_metadata) fc;

    -- Block if critical risk
    IF v_fraud_level = 'critical' THEN
        -- Block card
        UPDATE cards.cards SET status = 'blocked', blocked_reason = 'Fraud detected: ' || array_to_string(v_fraud_reasons, '; ')
        WHERE cards.card_id = v_card_id;

        -- Create fraud alert
        INSERT INTO fraud.alerts (account_id, alert_type, severity, score, description)
        VALUES (v_account_id, 'card_transaction', 'critical', v_fraud_score,
                'Blocked: ' || array_to_string(v_fraud_reasons, '; '));

        PERFORM notifications.send_notification(v_account_id, 'email', 'Card Blocked',
            'Your card has been blocked due to suspicious activity.');

        RETURN QUERY SELECT NULL::UUID, 'blocked'::VARCHAR, 'Transaction blocked due to fraud risk'::VARCHAR;
        RETURN;
    END IF;

    -- Step 4: Calculate fee
    v_fee := CASE
        WHEN p_amount > 5000 THEN ROUND(p_amount * 0.015, 2)
        WHEN p_amount > 1000 THEN ROUND(p_amount * 0.02, 2)
        ELSE ROUND(p_amount * 0.025, 2)
    END;

    -- Step 5: Create transaction
    INSERT INTO banking.transactions (account_id, txn_type, amount, description, reference, status, fee, fraud_score, metadata)
    VALUES (v_account_id, 'card_payment', p_amount, p_description, 'CARD-' || v_card_id::TEXT,
            CASE WHEN v_fraud_level IN ('high', 'medium') THEN 'pending_review' ELSE 'completed' END,
            v_fee, v_fraud_score, p_metadata)
    RETURNING banking.transactions.txn_id INTO v_txn_id;

    -- Step 6: Update balance (only if not pending review)
    IF v_fraud_level NOT IN ('high') THEN
        UPDATE customers.accounts SET balance = balance - (p_amount + v_fee), updated_at = NOW()
        WHERE account_id = v_account_id;
    END IF;

    -- Step 7: Create fraud alert if medium+
    IF v_fraud_level IN ('high', 'medium') THEN
        INSERT INTO fraud.alerts (txn_id, account_id, alert_type, severity, score, description)
        VALUES (v_txn_id, v_account_id, 'card_transaction', v_fraud_level, v_fraud_score,
                array_to_string(v_fraud_reasons, '; '));
    END IF;

    -- Step 8: Queue settlement
    PERFORM payments.queue_settlement(v_txn_id, p_amount, v_fee);

    -- Step 9: Notify
    PERFORM notifications.send_notification(v_account_id, 'push',
        'Transaction ' || CASE WHEN v_fraud_level IN ('high', 'medium') THEN 'Under Review' ELSE 'Completed' END,
        format('Card payment of $%s %s', p_amount::TEXT,
               CASE WHEN v_fraud_level IN ('high', 'medium') THEN 'is under review' ELSE 'has been processed' END));

    -- Step 10: Check tier upgrade
    PERFORM customers.check_tier_upgrade(v_account_id);

    -- Step 11: Audit
    PERFORM audit.log_activity('transaction', v_txn_id, 'card_payment', current_user,
        NULL, jsonb_build_object('amount', p_amount, 'fee', v_fee, 'fraud_score', v_fraud_score));

    RETURN QUERY SELECT v_txn_id,
        CASE WHEN v_fraud_level IN ('high', 'medium') THEN 'pending_review' ELSE 'completed' END::VARCHAR,
        'Transaction processed'::VARCHAR;
END;
$$;

-- customers.check_tier_upgrade (CC=9, tier evaluation)
CREATE OR REPLACE FUNCTION customers.check_tier_upgrade(p_account_id UUID)
RETURNS VARCHAR
LANGUAGE plpgsql AS $$
DECLARE
    v_current_tier VARCHAR;
    v_new_tier VARCHAR;
    v_total_volume NUMERIC;
    v_txn_count INT;
    v_account_age INTERVAL;
BEGIN
    SELECT tier, NOW() - created_at INTO v_current_tier, v_account_age
    FROM customers.accounts WHERE account_id = p_account_id;

    SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_txn_count, v_total_volume
    FROM banking.transactions
    WHERE account_id = p_account_id
      AND status = 'completed'
      AND created_at >= NOW() - INTERVAL '90 days';

    v_new_tier := CASE
        WHEN v_total_volume >= 100000 AND v_txn_count >= 50 AND v_account_age >= INTERVAL '6 months' THEN 'premium'
        WHEN v_total_volume >= 25000 AND v_txn_count >= 20 AND v_account_age >= INTERVAL '3 months' THEN 'gold'
        WHEN v_total_volume >= 5000 AND v_txn_count >= 5 THEN 'silver'
        ELSE 'basic'
    END;

    IF v_new_tier != v_current_tier AND
       (CASE v_new_tier WHEN 'premium' THEN 4 WHEN 'gold' THEN 3 WHEN 'silver' THEN 2 ELSE 1 END) >
       (CASE v_current_tier WHEN 'premium' THEN 4 WHEN 'gold' THEN 3 WHEN 'silver' THEN 2 ELSE 1 END) THEN

        UPDATE customers.accounts SET tier = v_new_tier, updated_at = NOW()
        WHERE account_id = p_account_id;

        PERFORM audit.log_activity('account', p_account_id, 'tier_upgrade', current_user,
            jsonb_build_object('old_tier', v_current_tier), jsonb_build_object('new_tier', v_new_tier));

        PERFORM notifications.send_notification(p_account_id, 'email',
            'Congratulations! Tier Upgrade',
            format('Your account has been upgraded from %s to %s.', v_current_tier, v_new_tier));

        RETURN v_new_tier;
    END IF;

    RETURN v_current_tier;
END;
$$;

-- payments.queue_settlement (CC=5, batch settlement)
CREATE OR REPLACE FUNCTION payments.queue_settlement(
    p_txn_id UUID,
    p_amount NUMERIC,
    p_fee NUMERIC
) RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE
    v_batch_date DATE := CURRENT_DATE;
    v_settlement_id UUID;
BEGIN
    -- Upsert daily batch
    INSERT INTO payments.settlements (batch_date, total_amount, txn_count, status, processor)
    VALUES (v_batch_date, p_amount + p_fee, 1, 'accumulating', 'stripe')
    ON CONFLICT (batch_date) DO UPDATE SET
        total_amount = payments.settlements.total_amount + p_amount + p_fee,
        txn_count = payments.settlements.txn_count + 1
    RETURNING settlement_id INTO v_settlement_id;

    -- If batch exceeds threshold, mark for processing
    IF (SELECT total_amount FROM payments.settlements WHERE settlement_id = v_settlement_id) > 50000 THEN
        UPDATE payments.settlements SET status = 'ready' WHERE settlement_id = v_settlement_id;
    END IF;

    RETURN v_settlement_id;
END;
$$;

-- Add unique constraint for settlement upsert
ALTER TABLE payments.settlements ADD CONSTRAINT uq_settlements_batch_date UNIQUE (batch_date);

-- reports.generate_daily_report (CC=4, aggregation)
CREATE OR REPLACE FUNCTION reports.generate_daily_report(p_date DATE DEFAULT CURRENT_DATE - 1)
RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE
    v_report_id UUID;
    v_txns INT;
    v_volume NUMERIC;
    v_fees NUMERIC;
    v_fraud INT;
    v_new_accts INT;
BEGIN
    SELECT COUNT(*), COALESCE(SUM(amount), 0), COALESCE(SUM(fee), 0)
    INTO v_txns, v_volume, v_fees
    FROM banking.transactions
    WHERE created_at::DATE = p_date AND status = 'completed';

    SELECT COUNT(*) INTO v_fraud
    FROM fraud.alerts WHERE created_at::DATE = p_date;

    SELECT COUNT(*) INTO v_new_accts
    FROM customers.accounts WHERE created_at::DATE = p_date;

    INSERT INTO reports.daily_summary (report_date, total_txns, total_volume, total_fees, fraud_count, new_accounts)
    VALUES (p_date, v_txns, v_volume, v_fees, v_fraud, v_new_accts)
    ON CONFLICT (report_date) DO UPDATE SET
        total_txns = v_txns, total_volume = v_volume, total_fees = v_fees,
        fraud_count = v_fraud, new_accounts = v_new_accts
    RETURNING report_id INTO v_report_id;

    PERFORM audit.log_activity('report', v_report_id, 'generated', 'system',
        NULL, jsonb_build_object('date', p_date, 'txns', v_txns, 'volume', v_volume));

    RETURN v_report_id;
END;
$$;

-- banking.trg_transaction_audit (trigger function + trigger)
CREATE OR REPLACE FUNCTION banking.trg_transaction_audit()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
        PERFORM audit.log_activity('transaction', NEW.txn_id, 'status_change', current_user,
            jsonb_build_object('old_status', OLD.status),
            jsonb_build_object('new_status', NEW.status));
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_txn_audit
AFTER UPDATE ON banking.transactions
FOR EACH ROW EXECUTE FUNCTION banking.trg_transaction_audit();

-- banking.trg_auto_block_suspicious (trigger for auto-blocking)
CREATE OR REPLACE FUNCTION banking.trg_auto_block_suspicious()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.fraud_score IS NOT NULL AND NEW.fraud_score >= 80 THEN
        UPDATE cards.cards SET status = 'blocked', blocked_reason = 'Auto-blocked: fraud score ' || NEW.fraud_score::TEXT
        WHERE account_id = NEW.account_id AND status = 'active';

        PERFORM notifications.send_notification(NEW.account_id, 'sms',
            'Security Alert', 'A suspicious transaction was detected. Your card has been temporarily blocked.');
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_block
AFTER INSERT ON banking.transactions
FOR EACH ROW EXECUTE FUNCTION banking.trg_auto_block_suspicious();
