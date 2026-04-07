-- ═══════════════════════════════════════════════════════════════
-- SQLAtlas Demo: PostgreSQL Banking System (PL/pgSQL)
-- Run against a PostgreSQL 14+ database to create test SPs
-- ═══════════════════════════════════════════════════════════════

-- Schemas
CREATE SCHEMA IF NOT EXISTS banking;
CREATE SCHEMA IF NOT EXISTS cards;
CREATE SCHEMA IF NOT EXISTS fraud;
CREATE SCHEMA IF NOT EXISTS payments;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS reports;
CREATE SCHEMA IF NOT EXISTS notifications;
CREATE SCHEMA IF NOT EXISTS customers;

-- ── Tables ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customers.accounts (
    id SERIAL PRIMARY KEY,
    customer_name VARCHAR(200) NOT NULL,
    email VARCHAR(255),
    account_number VARCHAR(20) UNIQUE NOT NULL,
    account_type VARCHAR(20) DEFAULT 'savings',
    balance NUMERIC(18,2) DEFAULT 0,
    daily_limit NUMERIC(18,2) DEFAULT 5000,
    monthly_limit NUMERIC(18,2) DEFAULT 50000,
    status VARCHAR(20) DEFAULT 'active',
    tier VARCHAR(20) DEFAULT 'standard',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cards.cards (
    id SERIAL PRIMARY KEY,
    account_id INT REFERENCES customers.accounts(id),
    card_number VARCHAR(20) NOT NULL,
    card_type VARCHAR(20) DEFAULT 'debit',
    expiry_month INT,
    expiry_year INT,
    status VARCHAR(20) DEFAULT 'active',
    daily_limit NUMERIC(18,2) DEFAULT 2000,
    is_blocked BOOLEAN DEFAULT FALSE,
    blocked_reason VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS banking.transactions (
    id SERIAL PRIMARY KEY,
    account_id INT REFERENCES customers.accounts(id),
    card_id INT REFERENCES cards.cards(id),
    amount NUMERIC(18,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    trans_type VARCHAR(20) NOT NULL,
    merchant_name VARCHAR(200),
    merchant_category VARCHAR(50),
    channel VARCHAR(20) DEFAULT 'POS',
    auth_code VARCHAR(20),
    status VARCHAR(20) DEFAULT 'pending',
    risk_score INT DEFAULT 0,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fraud.alerts (
    id SERIAL PRIMARY KEY,
    transaction_id INT,
    account_id INT REFERENCES customers.accounts(id),
    alert_type VARCHAR(50),
    risk_score INT,
    details JSONB,
    action_taken VARCHAR(50),
    reviewed_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit.activity_log (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(50),
    entity_id INT,
    action VARCHAR(50),
    actor VARCHAR(100),
    details JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments.settlements (
    id SERIAL PRIMARY KEY,
    transaction_id INT,
    amount NUMERIC(18,2),
    fee NUMERIC(18,2) DEFAULT 0,
    net_amount NUMERIC(18,2),
    settlement_date DATE,
    batch_id VARCHAR(50),
    status VARCHAR(20) DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS notifications.queue (
    id SERIAL PRIMARY KEY,
    recipient_email VARCHAR(255),
    template VARCHAR(50),
    payload JSONB,
    status VARCHAR(20) DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports.daily_summary (
    id SERIAL PRIMARY KEY,
    report_date DATE NOT NULL,
    total_transactions INT,
    total_amount NUMERIC(18,2),
    fraud_count INT,
    approval_rate NUMERIC(5,2),
    generated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Audit Functions ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION audit.log_activity(
    p_entity_type VARCHAR,
    p_entity_id INT,
    p_action VARCHAR,
    p_actor VARCHAR,
    p_details JSONB DEFAULT '{}'
) RETURNS VOID AS $$
BEGIN
    INSERT INTO audit.activity_log(entity_type, entity_id, action, actor, details)
    VALUES (p_entity_type, p_entity_id, p_action, p_actor, p_details);
END;
$$ LANGUAGE plpgsql;

-- ── Card Validation ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cards.validate_card(
    p_card_number VARCHAR,
    p_expiry_month INT,
    p_expiry_year INT
) RETURNS TABLE(is_valid BOOLEAN, card_id INT, account_id INT, card_status VARCHAR, message VARCHAR) AS $$
DECLARE
    v_card cards.cards%ROWTYPE;
    v_now DATE := CURRENT_DATE;
BEGIN
    SELECT c.* INTO v_card
    FROM cards.cards c
    WHERE c.card_number = p_card_number;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0, 0, 'unknown'::VARCHAR, 'Card not found'::VARCHAR;
        RETURN;
    END IF;

    IF v_card.is_blocked THEN
        RETURN QUERY SELECT FALSE, v_card.id, v_card.account_id, v_card.status, ('Card blocked: ' || COALESCE(v_card.blocked_reason, 'unknown'))::VARCHAR;
        RETURN;
    END IF;

    IF v_card.status != 'active' THEN
        RETURN QUERY SELECT FALSE, v_card.id, v_card.account_id, v_card.status, ('Card not active: ' || v_card.status)::VARCHAR;
        RETURN;
    END IF;

    IF (p_expiry_year < EXTRACT(YEAR FROM v_now)) OR
       (p_expiry_year = EXTRACT(YEAR FROM v_now) AND p_expiry_month < EXTRACT(MONTH FROM v_now)) THEN
        RETURN QUERY SELECT FALSE, v_card.id, v_card.account_id, 'expired'::VARCHAR, 'Card expired'::VARCHAR;
        RETURN;
    END IF;

    RETURN QUERY SELECT TRUE, v_card.id, v_card.account_id, v_card.status, 'Card valid'::VARCHAR;
END;
$$ LANGUAGE plpgsql;

-- ── Balance Validation ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION banking.validate_balance(
    p_account_id INT,
    p_amount NUMERIC
) RETURNS TABLE(is_sufficient BOOLEAN, current_balance NUMERIC, available NUMERIC, daily_used NUMERIC, monthly_used NUMERIC, message VARCHAR) AS $$
DECLARE
    v_account customers.accounts%ROWTYPE;
    v_daily_used NUMERIC;
    v_monthly_used NUMERIC;
    v_available NUMERIC;
BEGIN
    SELECT a.* INTO v_account
    FROM customers.accounts a WHERE a.id = p_account_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 'Account not found'::VARCHAR;
        RETURN;
    END IF;

    IF v_account.status != 'active' THEN
        RETURN QUERY SELECT FALSE, v_account.balance, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, ('Account not active: ' || v_account.status)::VARCHAR;
        RETURN;
    END IF;

    SELECT COALESCE(SUM(t.amount), 0) INTO v_daily_used
    FROM banking.transactions t
    WHERE t.account_id = p_account_id
      AND t.created_at >= CURRENT_DATE
      AND t.status = 'approved';

    SELECT COALESCE(SUM(t.amount), 0) INTO v_monthly_used
    FROM banking.transactions t
    WHERE t.account_id = p_account_id
      AND t.created_at >= date_trunc('month', CURRENT_DATE)
      AND t.status = 'approved';

    v_available := LEAST(
        v_account.balance,
        v_account.daily_limit - v_daily_used,
        v_account.monthly_limit - v_monthly_used
    );

    IF p_amount > v_available THEN
        RETURN QUERY SELECT FALSE, v_account.balance, v_available, v_daily_used, v_monthly_used, 'Insufficient funds or limit exceeded'::VARCHAR;
        RETURN;
    END IF;

    RETURN QUERY SELECT TRUE, v_account.balance, v_available, v_daily_used, v_monthly_used, 'Balance sufficient'::VARCHAR;
END;
$$ LANGUAGE plpgsql;

-- ── Fraud Detection ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fraud.check_transaction(
    p_account_id INT,
    p_amount NUMERIC,
    p_merchant_category VARCHAR,
    p_channel VARCHAR,
    p_card_id INT
) RETURNS TABLE(is_flagged BOOLEAN, risk_score INT, fraud_type VARCHAR, recommended_action VARCHAR) AS $$
DECLARE
    v_score INT := 0;
    v_recent_count INT;
    v_recent_amount NUMERIC;
    v_avg_amount NUMERIC;
    v_distinct_merchants INT;
    v_fraud_type VARCHAR := 'none';
    v_action VARCHAR := 'approve';
BEGIN
    -- Rule 1: Velocity check — more than 5 transactions in last hour
    SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_recent_count, v_recent_amount
    FROM banking.transactions
    WHERE account_id = p_account_id
      AND created_at >= NOW() - INTERVAL '1 hour'
      AND status = 'approved';

    IF v_recent_count > 5 THEN
        v_score := v_score + 30;
        v_fraud_type := 'velocity';
    END IF;

    -- Rule 2: Amount anomaly — more than 3x average
    SELECT COALESCE(AVG(amount), 0) INTO v_avg_amount
    FROM banking.transactions
    WHERE account_id = p_account_id AND status = 'approved';

    IF v_avg_amount > 0 AND p_amount > (v_avg_amount * 3) THEN
        v_score := v_score + 25;
        IF v_fraud_type = 'none' THEN v_fraud_type := 'amount_anomaly'; END IF;
    END IF;

    -- Rule 3: Multiple merchants in short time
    SELECT COUNT(DISTINCT merchant_name) INTO v_distinct_merchants
    FROM banking.transactions
    WHERE account_id = p_account_id
      AND created_at >= NOW() - INTERVAL '30 minutes'
      AND status = 'approved';

    IF v_distinct_merchants > 3 THEN
        v_score := v_score + 20;
        IF v_fraud_type = 'none' THEN v_fraud_type := 'multi_merchant'; END IF;
    END IF;

    -- Rule 4: High-risk merchant category
    IF p_merchant_category IN ('gambling', 'crypto', 'money_transfer', 'adult') THEN
        v_score := v_score + 15;
    END IF;

    -- Rule 5: ATM withdrawal over threshold
    IF p_channel = 'ATM' AND p_amount > 1000 THEN
        v_score := v_score + 10;
    END IF;

    -- Determine action
    IF v_score >= 70 THEN
        v_action := 'block';
    ELSIF v_score >= 40 THEN
        v_action := 'review';
    END IF;

    -- Log alert if score > 30
    IF v_score > 30 THEN
        INSERT INTO fraud.alerts(transaction_id, account_id, alert_type, risk_score, details, action_taken)
        VALUES (NULL, p_account_id, v_fraud_type, v_score,
                jsonb_build_object('amount', p_amount, 'channel', p_channel, 'merchant_category', p_merchant_category),
                v_action);
    END IF;

    RETURN QUERY SELECT (v_score >= 40), v_score, v_fraud_type, v_action;
END;
$$ LANGUAGE plpgsql;

-- ── Notification ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION notifications.send_notification(
    p_email VARCHAR,
    p_template VARCHAR,
    p_payload JSONB
) RETURNS INT AS $$
DECLARE
    v_id INT;
BEGIN
    INSERT INTO notifications.queue(recipient_email, template, payload)
    VALUES (p_email, p_template, p_payload)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ── Settlement ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION payments.queue_settlement(
    p_transaction_id INT,
    p_amount NUMERIC,
    p_fee_percent NUMERIC DEFAULT 2.5
) RETURNS INT AS $$
DECLARE
    v_fee NUMERIC;
    v_net NUMERIC;
    v_id INT;
    v_batch VARCHAR;
BEGIN
    v_fee := ROUND(p_amount * p_fee_percent / 100, 2);
    v_net := p_amount - v_fee;
    v_batch := 'BATCH-' || to_char(CURRENT_DATE, 'YYYYMMDD');

    INSERT INTO payments.settlements(transaction_id, amount, fee, net_amount, settlement_date, batch_id)
    VALUES (p_transaction_id, p_amount, v_fee, v_net, CURRENT_DATE + 1, v_batch)
    RETURNING id INTO v_id;

    PERFORM audit.log_activity('settlement', v_id, 'queued', 'system',
        jsonb_build_object('transaction_id', p_transaction_id, 'net_amount', v_net));

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ══════════════════════════════════════════════════════════════════
-- MAIN SP: Process Card Transaction (calls everything above)
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION banking.process_card_transaction(
    p_card_number VARCHAR,
    p_expiry_month INT,
    p_expiry_year INT,
    p_amount NUMERIC,
    p_currency VARCHAR DEFAULT 'USD',
    p_merchant_name VARCHAR DEFAULT NULL,
    p_merchant_category VARCHAR DEFAULT 'retail',
    p_trans_type VARCHAR DEFAULT 'purchase',
    p_channel VARCHAR DEFAULT 'POS',
    p_description TEXT DEFAULT NULL
) RETURNS TABLE(
    transaction_id INT,
    auth_code VARCHAR,
    response_code VARCHAR,
    response_message VARCHAR,
    approved_amount NUMERIC,
    remaining_balance NUMERIC,
    risk_score INT
) AS $$
DECLARE
    v_card_valid BOOLEAN;
    v_card_id INT;
    v_account_id INT;
    v_card_status VARCHAR;
    v_card_msg VARCHAR;
    v_bal_ok BOOLEAN;
    v_balance NUMERIC;
    v_available NUMERIC;
    v_fraud_flagged BOOLEAN;
    v_risk INT;
    v_fraud_action VARCHAR;
    v_trans_id INT;
    v_auth VARCHAR;
    v_email VARCHAR;
BEGIN
    -- Step 1: Validate card
    SELECT cv.is_valid, cv.card_id, cv.account_id, cv.card_status, cv.message
    INTO v_card_valid, v_card_id, v_account_id, v_card_status, v_card_msg
    FROM cards.validate_card(p_card_number, p_expiry_month, p_expiry_year) cv;

    IF NOT v_card_valid THEN
        RETURN QUERY SELECT 0, ''::VARCHAR, '05'::VARCHAR, v_card_msg, 0::NUMERIC, 0::NUMERIC, 0;
        RETURN;
    END IF;

    -- Step 2: Validate balance
    SELECT bv.is_sufficient, bv.current_balance, bv.available
    INTO v_bal_ok, v_balance, v_available
    FROM banking.validate_balance(v_account_id, p_amount) bv;

    IF NOT v_bal_ok THEN
        RETURN QUERY SELECT 0, ''::VARCHAR, '51'::VARCHAR, 'Insufficient funds'::VARCHAR, 0::NUMERIC, v_balance, 0;
        RETURN;
    END IF;

    -- Step 3: Fraud check
    SELECT fc.is_flagged, fc.risk_score, fc.recommended_action
    INTO v_fraud_flagged, v_risk, v_fraud_action
    FROM fraud.check_transaction(v_account_id, p_amount, p_merchant_category, p_channel, v_card_id) fc;

    IF v_fraud_action = 'block' THEN
        -- Block the card
        UPDATE cards.cards SET is_blocked = TRUE, blocked_reason = 'Fraud detected (score: ' || v_risk || ')'
        WHERE id = v_card_id;

        RETURN QUERY SELECT 0, ''::VARCHAR, '59'::VARCHAR, 'Transaction blocked by fraud detection'::VARCHAR, 0::NUMERIC, v_balance, v_risk;
        RETURN;
    END IF;

    -- Step 4: Create transaction
    v_auth := 'AUTH' || LPAD(floor(random() * 999999)::TEXT, 6, '0');

    INSERT INTO banking.transactions(account_id, card_id, amount, currency, trans_type,
        merchant_name, merchant_category, channel, auth_code, status, risk_score, description)
    VALUES (v_account_id, v_card_id, p_amount, p_currency, p_trans_type,
        p_merchant_name, p_merchant_category, p_channel, v_auth,
        CASE WHEN v_fraud_action = 'review' THEN 'pending_review' ELSE 'approved' END,
        v_risk, p_description)
    RETURNING id INTO v_trans_id;

    -- Step 5: Debit account
    IF v_fraud_action != 'review' THEN
        UPDATE customers.accounts
        SET balance = balance - p_amount
        WHERE id = v_account_id;
    END IF;

    -- Step 6: Queue settlement
    IF v_fraud_action != 'review' THEN
        PERFORM payments.queue_settlement(v_trans_id, p_amount);
    END IF;

    -- Step 7: Notification
    SELECT a.email INTO v_email FROM customers.accounts a WHERE a.id = v_account_id;
    PERFORM notifications.send_notification(v_email, 'transaction_receipt',
        jsonb_build_object('amount', p_amount, 'merchant', p_merchant_name, 'auth_code', v_auth));

    -- Step 8: Audit log
    PERFORM audit.log_activity('transaction', v_trans_id, 'processed', 'system',
        jsonb_build_object('amount', p_amount, 'card_id', v_card_id, 'risk_score', v_risk));

    -- Return
    SELECT a.balance INTO v_balance FROM customers.accounts a WHERE a.id = v_account_id;

    RETURN QUERY SELECT v_trans_id, v_auth, '00'::VARCHAR,
        CASE WHEN v_fraud_action = 'review' THEN 'Approved - pending review' ELSE 'Approved' END::VARCHAR,
        p_amount, v_balance, v_risk;
END;
$$ LANGUAGE plpgsql;

-- ── Reports ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION reports.generate_daily_report(p_date DATE DEFAULT CURRENT_DATE)
RETURNS INT AS $$
DECLARE
    v_id INT;
    v_total_tx INT;
    v_total_amt NUMERIC;
    v_fraud INT;
    v_approved INT;
    v_rate NUMERIC;
BEGIN
    SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_total_tx, v_total_amt
    FROM banking.transactions WHERE created_at::DATE = p_date;

    SELECT COUNT(*) INTO v_fraud
    FROM fraud.alerts WHERE created_at::DATE = p_date;

    SELECT COUNT(*) INTO v_approved
    FROM banking.transactions WHERE created_at::DATE = p_date AND status = 'approved';

    v_rate := CASE WHEN v_total_tx > 0 THEN (v_approved::NUMERIC / v_total_tx * 100) ELSE 0 END;

    INSERT INTO reports.daily_summary(report_date, total_transactions, total_amount, fraud_count, approval_rate)
    VALUES (p_date, v_total_tx, v_total_amt, v_fraud, v_rate)
    RETURNING id INTO v_id;

    PERFORM audit.log_activity('report', v_id, 'generated', 'system',
        jsonb_build_object('date', p_date, 'transactions', v_total_tx));

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ── Customer Management ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION customers.check_tier_upgrade(p_account_id INT)
RETURNS VARCHAR AS $$
DECLARE
    v_monthly_volume NUMERIC;
    v_current_tier VARCHAR;
    v_new_tier VARCHAR;
BEGIN
    SELECT tier INTO v_current_tier FROM customers.accounts WHERE id = p_account_id;

    SELECT COALESCE(SUM(amount), 0) INTO v_monthly_volume
    FROM banking.transactions
    WHERE account_id = p_account_id
      AND created_at >= date_trunc('month', CURRENT_DATE)
      AND status = 'approved';

    v_new_tier := CASE
        WHEN v_monthly_volume >= 50000 THEN 'platinum'
        WHEN v_monthly_volume >= 20000 THEN 'gold'
        WHEN v_monthly_volume >= 5000 THEN 'silver'
        ELSE 'standard'
    END;

    IF v_new_tier != v_current_tier THEN
        UPDATE customers.accounts SET tier = v_new_tier WHERE id = p_account_id;
        UPDATE customers.accounts SET daily_limit = CASE v_new_tier
            WHEN 'platinum' THEN 20000
            WHEN 'gold' THEN 10000
            WHEN 'silver' THEN 7500
            ELSE 5000
        END WHERE id = p_account_id;

        PERFORM audit.log_activity('account', p_account_id, 'tier_upgrade', 'system',
            jsonb_build_object('from', v_current_tier, 'to', v_new_tier, 'volume', v_monthly_volume));
    END IF;

    RETURN v_new_tier;
END;
$$ LANGUAGE plpgsql;

-- ── Triggers ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION banking.trg_auto_block_suspicious()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.risk_score >= 80 THEN
        UPDATE cards.cards SET is_blocked = TRUE, blocked_reason = 'Auto-blocked: risk score ' || NEW.risk_score
        WHERE id = NEW.card_id AND NOT is_blocked;

        PERFORM notifications.send_notification(
            (SELECT email FROM customers.accounts WHERE id = NEW.account_id),
            'card_blocked',
            jsonb_build_object('reason', 'Suspicious activity detected', 'risk_score', NEW.risk_score)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_block_suspicious ON banking.transactions;
CREATE TRIGGER trg_auto_block_suspicious
    AFTER INSERT ON banking.transactions
    FOR EACH ROW
    WHEN (NEW.risk_score >= 80)
    EXECUTE FUNCTION banking.trg_auto_block_suspicious();

CREATE OR REPLACE FUNCTION audit.trg_transaction_audit()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit.activity_log(entity_type, entity_id, action, actor, details)
    VALUES ('transaction', NEW.id,
        CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END,
        'trigger',
        jsonb_build_object('amount', NEW.amount, 'status', NEW.status, 'type', NEW.trans_type));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transaction_audit ON banking.transactions;
CREATE TRIGGER trg_transaction_audit
    AFTER INSERT OR UPDATE ON banking.transactions
    FOR EACH ROW EXECUTE FUNCTION audit.trg_transaction_audit();

-- ── Seed Data ───────────────────────────────────────────────────

INSERT INTO customers.accounts(customer_name, email, account_number, account_type, balance, tier)
VALUES
    ('Alice Johnson', 'alice@example.com', 'ACC-001', 'checking', 15000.00, 'gold'),
    ('Bob Smith', 'bob@example.com', 'ACC-002', 'savings', 8500.50, 'standard'),
    ('Carol Williams', 'carol@example.com', 'ACC-003', 'checking', 42000.00, 'platinum')
ON CONFLICT (account_number) DO NOTHING;

INSERT INTO cards.cards(account_id, card_number, card_type, expiry_month, expiry_year, daily_limit)
VALUES
    (1, '4111111111111111', 'credit', 12, 2027, 5000),
    (1, '4222222222222222', 'debit', 6, 2028, 2000),
    (2, '5333333333333333', 'debit', 3, 2027, 1500),
    (3, '5444444444444444', 'credit', 9, 2028, 10000)
ON CONFLICT DO NOTHING;

SELECT 'PostgreSQL banking demo installed: ' || count(*) || ' functions/triggers'
FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname IN ('banking', 'cards', 'fraud', 'payments', 'audit', 'reports', 'notifications', 'customers');
