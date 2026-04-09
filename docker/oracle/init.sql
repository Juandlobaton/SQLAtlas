-- =============================================================================
-- SQLAtlas Test Database - Healthcare / Clinic System
-- Target: Oracle Free 23ai (FREEPDB1) - user TESTUSER
-- Execute: sqlplus testuser/TestAtlas2026!@localhost:1521/FREEPDB1 @init-healthcare.sql
-- =============================================================================

-- =============================================
-- 0. Cleanup: drop objects in dependency order
-- =============================================

BEGIN
    FOR r IN (
        SELECT trigger_name FROM user_triggers
    ) LOOP
        EXECUTE IMMEDIATE 'DROP TRIGGER ' || r.trigger_name;
    END LOOP;

    FOR r IN (
        SELECT object_name, object_type
          FROM user_objects
         WHERE object_type IN ('PROCEDURE','FUNCTION','PACKAGE')
    ) LOOP
        EXECUTE IMMEDIATE 'DROP ' || r.object_type || ' ' || r.object_name;
    END LOOP;

    -- Drop tables respecting FK order (children first)
    FOR r IN (
        SELECT table_name FROM user_tables
         WHERE table_name IN (
            'AUDIT_LOG','BILLING','PRESCRIPTIONS','APPOINTMENTS',
            'MEDICAL_RECORDS','PATIENTS','DOCTORS','INSURANCE_PLANS',
            'DEPARTMENTS'
         )
         ORDER BY CASE table_name
            WHEN 'AUDIT_LOG'       THEN 1
            WHEN 'BILLING'         THEN 2
            WHEN 'PRESCRIPTIONS'   THEN 3
            WHEN 'APPOINTMENTS'    THEN 4
            WHEN 'MEDICAL_RECORDS' THEN 5
            WHEN 'PATIENTS'        THEN 6
            WHEN 'DOCTORS'         THEN 7
            WHEN 'INSURANCE_PLANS' THEN 8
            WHEN 'DEPARTMENTS'     THEN 9
         END
    ) LOOP
        EXECUTE IMMEDIATE 'DROP TABLE ' || r.table_name || ' CASCADE CONSTRAINTS';
    END LOOP;

    -- Drop sequences
    FOR r IN (
        SELECT sequence_name FROM user_sequences
         WHERE sequence_name LIKE 'SEQ_%'
    ) LOOP
        EXECUTE IMMEDIATE 'DROP SEQUENCE ' || r.sequence_name;
    END LOOP;
END;
/

-- =============================================
-- 1. SEQUENCES
-- =============================================

CREATE SEQUENCE seq_patient_id     START WITH 1000 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_doctor_id      START WITH 2000 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_appointment_id START WITH 3000 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_record_id      START WITH 4000 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_billing_id     START WITH 5000 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_prescription_id START WITH 6000 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_audit_id       START WITH 9000 INCREMENT BY 1 NOCACHE;

-- =============================================
-- 2. TABLES
-- =============================================

-- 2a. DEPARTMENTS - hospital departments / specialties
CREATE TABLE departments (
    department_id   NUMBER(6)       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    department_name VARCHAR2(100)   NOT NULL,
    floor_number    NUMBER(2),
    phone_ext       VARCHAR2(10),
    is_active       CHAR(1)         DEFAULT 'Y' CHECK (is_active IN ('Y','N')),
    created_at      TIMESTAMP       DEFAULT SYSTIMESTAMP
);

CREATE UNIQUE INDEX idx_dept_name ON departments(department_name);

-- 2b. INSURANCE_PLANS - external insurance reference
CREATE TABLE insurance_plans (
    plan_id         NUMBER(8)       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plan_name       VARCHAR2(150)   NOT NULL,
    provider_name   VARCHAR2(150)   NOT NULL,
    plan_type       VARCHAR2(30)    CHECK (plan_type IN ('HMO','PPO','EPO','POS','MEDICARE','MEDICAID')),
    coverage_pct    NUMBER(5,2)     DEFAULT 80.00 CHECK (coverage_pct BETWEEN 0 AND 100),
    max_annual      NUMBER(12,2),
    is_active       CHAR(1)         DEFAULT 'Y' CHECK (is_active IN ('Y','N')),
    effective_from  DATE            NOT NULL,
    effective_to    DATE
);

CREATE INDEX idx_ins_provider ON insurance_plans(provider_name);

-- 2c. DOCTORS - physician roster
CREATE TABLE doctors (
    doctor_id       NUMBER(8)       NOT NULL,
    first_name      VARCHAR2(60)    NOT NULL,
    last_name       VARCHAR2(60)    NOT NULL,
    specialty       VARCHAR2(80),
    license_number  VARCHAR2(30)    NOT NULL,
    department_id   NUMBER(6),
    email           VARCHAR2(120),
    phone           VARCHAR2(20),
    hire_date       DATE            DEFAULT SYSDATE,
    is_active       CHAR(1)         DEFAULT 'Y' CHECK (is_active IN ('Y','N')),
    CONSTRAINT pk_doctors PRIMARY KEY (doctor_id),
    CONSTRAINT fk_doc_dept FOREIGN KEY (department_id) REFERENCES departments(department_id),
    CONSTRAINT uq_doc_license UNIQUE (license_number)
);

CREATE INDEX idx_doc_specialty ON doctors(specialty);
CREATE INDEX idx_doc_dept      ON doctors(department_id);

-- 2d. PATIENTS - core patient demographics
CREATE TABLE patients (
    patient_id      NUMBER(10)      NOT NULL,
    first_name      VARCHAR2(60)    NOT NULL,
    last_name       VARCHAR2(60)    NOT NULL,
    date_of_birth   DATE            NOT NULL,
    gender          CHAR(1)         CHECK (gender IN ('M','F','O')),
    ssn             VARCHAR2(11),
    email           VARCHAR2(120),
    phone           VARCHAR2(20),
    address_line1   VARCHAR2(200),
    address_line2   VARCHAR2(200),
    city            VARCHAR2(80),
    state_code      CHAR(2),
    zip_code        VARCHAR2(10),
    insurance_plan_id NUMBER(8),
    policy_number   VARCHAR2(30),
    emergency_contact_name  VARCHAR2(120),
    emergency_contact_phone VARCHAR2(20),
    registration_date DATE          DEFAULT SYSDATE,
    is_active       CHAR(1)         DEFAULT 'Y' CHECK (is_active IN ('Y','N')),
    CONSTRAINT pk_patients PRIMARY KEY (patient_id),
    CONSTRAINT fk_pat_ins  FOREIGN KEY (insurance_plan_id) REFERENCES insurance_plans(plan_id)
);

CREATE UNIQUE INDEX idx_pat_ssn   ON patients(ssn);
CREATE INDEX idx_pat_name         ON patients(last_name, first_name);
CREATE INDEX idx_pat_insurance    ON patients(insurance_plan_id);
CREATE INDEX idx_pat_dob          ON patients(date_of_birth);

-- 2e. APPOINTMENTS - scheduling
CREATE TABLE appointments (
    appointment_id  NUMBER(10)      NOT NULL,
    patient_id      NUMBER(10)      NOT NULL,
    doctor_id       NUMBER(8)       NOT NULL,
    appointment_date DATE           NOT NULL,
    start_time      TIMESTAMP       NOT NULL,
    end_time        TIMESTAMP       NOT NULL,
    visit_type      VARCHAR2(30)    CHECK (visit_type IN ('CHECKUP','FOLLOW_UP','EMERGENCY','CONSULTATION','PROCEDURE','LAB')),
    status          VARCHAR2(20)    DEFAULT 'SCHEDULED'
                                    CHECK (status IN ('SCHEDULED','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED','NO_SHOW')),
    reason          VARCHAR2(500),
    notes           CLOB,
    created_at      TIMESTAMP       DEFAULT SYSTIMESTAMP,
    updated_at      TIMESTAMP,
    CONSTRAINT pk_appointments PRIMARY KEY (appointment_id),
    CONSTRAINT fk_appt_patient FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
    CONSTRAINT fk_appt_doctor  FOREIGN KEY (doctor_id)  REFERENCES doctors(doctor_id),
    CONSTRAINT chk_appt_times  CHECK (end_time > start_time)
);

CREATE INDEX idx_appt_patient ON appointments(patient_id);
CREATE INDEX idx_appt_doctor  ON appointments(doctor_id);
CREATE INDEX idx_appt_date    ON appointments(appointment_date);
CREATE INDEX idx_appt_status  ON appointments(status);

-- 2f. MEDICAL_RECORDS - clinical documentation
CREATE TABLE medical_records (
    record_id       NUMBER(10)      NOT NULL,
    patient_id      NUMBER(10)      NOT NULL,
    doctor_id       NUMBER(8)       NOT NULL,
    appointment_id  NUMBER(10),
    record_date     DATE            DEFAULT SYSDATE,
    diagnosis_code  VARCHAR2(10),
    diagnosis_desc  VARCHAR2(500),
    treatment_plan  CLOB,
    vitals_bp       VARCHAR2(10),
    vitals_hr       NUMBER(3),
    vitals_temp     NUMBER(4,1),
    vitals_weight   NUMBER(5,1),
    notes           CLOB,
    is_confidential CHAR(1)         DEFAULT 'N' CHECK (is_confidential IN ('Y','N')),
    created_at      TIMESTAMP       DEFAULT SYSTIMESTAMP,
    updated_at      TIMESTAMP,
    CONSTRAINT pk_medical_records PRIMARY KEY (record_id),
    CONSTRAINT fk_mr_patient     FOREIGN KEY (patient_id)     REFERENCES patients(patient_id),
    CONSTRAINT fk_mr_doctor      FOREIGN KEY (doctor_id)      REFERENCES doctors(doctor_id),
    CONSTRAINT fk_mr_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id)
);

CREATE INDEX idx_mr_patient   ON medical_records(patient_id);
CREATE INDEX idx_mr_doctor    ON medical_records(doctor_id);
CREATE INDEX idx_mr_diagnosis ON medical_records(diagnosis_code);

-- 2g. PRESCRIPTIONS
CREATE TABLE prescriptions (
    prescription_id NUMBER(10)      NOT NULL,
    record_id       NUMBER(10)      NOT NULL,
    patient_id      NUMBER(10)      NOT NULL,
    doctor_id       NUMBER(8)       NOT NULL,
    drug_name       VARCHAR2(200)   NOT NULL,
    dosage          VARCHAR2(80)    NOT NULL,
    frequency       VARCHAR2(80),
    duration_days   NUMBER(4),
    refills_allowed NUMBER(2)       DEFAULT 0,
    refills_used    NUMBER(2)       DEFAULT 0,
    prescribed_date DATE            DEFAULT SYSDATE,
    status          VARCHAR2(20)    DEFAULT 'ACTIVE'
                                    CHECK (status IN ('ACTIVE','COMPLETED','CANCELLED','EXPIRED')),
    pharmacy_notes  VARCHAR2(500),
    CONSTRAINT pk_prescriptions PRIMARY KEY (prescription_id),
    CONSTRAINT fk_rx_record     FOREIGN KEY (record_id)  REFERENCES medical_records(record_id),
    CONSTRAINT fk_rx_patient    FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
    CONSTRAINT fk_rx_doctor     FOREIGN KEY (doctor_id)  REFERENCES doctors(doctor_id),
    CONSTRAINT chk_rx_refills   CHECK (refills_used <= refills_allowed)
);

CREATE INDEX idx_rx_patient ON prescriptions(patient_id);
CREATE INDEX idx_rx_drug    ON prescriptions(drug_name);

-- 2h. BILLING - charges and payments
CREATE TABLE billing (
    billing_id      NUMBER(12)      NOT NULL,
    patient_id      NUMBER(10)      NOT NULL,
    appointment_id  NUMBER(10),
    insurance_plan_id NUMBER(8),
    billing_date    DATE            DEFAULT SYSDATE,
    service_code    VARCHAR2(20)    NOT NULL,
    service_desc    VARCHAR2(300),
    gross_amount    NUMBER(10,2)    NOT NULL CHECK (gross_amount >= 0),
    insurance_covered NUMBER(10,2)  DEFAULT 0,
    patient_copay   NUMBER(10,2)    DEFAULT 0,
    discount_amount NUMBER(10,2)    DEFAULT 0,
    net_amount      NUMBER(10,2)    GENERATED ALWAYS AS (gross_amount - insurance_covered - discount_amount) VIRTUAL,
    payment_status  VARCHAR2(20)    DEFAULT 'PENDING'
                                    CHECK (payment_status IN ('PENDING','PARTIAL','PAID','OVERDUE','WRITTEN_OFF','REFUNDED')),
    payment_date    DATE,
    payment_method  VARCHAR2(20),
    created_at      TIMESTAMP       DEFAULT SYSTIMESTAMP,
    CONSTRAINT pk_billing PRIMARY KEY (billing_id),
    CONSTRAINT fk_bill_patient     FOREIGN KEY (patient_id)       REFERENCES patients(patient_id),
    CONSTRAINT fk_bill_appointment FOREIGN KEY (appointment_id)   REFERENCES appointments(appointment_id),
    CONSTRAINT fk_bill_insurance   FOREIGN KEY (insurance_plan_id) REFERENCES insurance_plans(plan_id)
);

CREATE INDEX idx_bill_patient ON billing(patient_id);
CREATE INDEX idx_bill_status  ON billing(payment_status);
CREATE INDEX idx_bill_date    ON billing(billing_date);

-- 2i. AUDIT_LOG - change tracking
CREATE TABLE audit_log (
    audit_id        NUMBER(12)      NOT NULL,
    table_name      VARCHAR2(60)    NOT NULL,
    record_id       NUMBER(12),
    action_type     VARCHAR2(10)    CHECK (action_type IN ('INSERT','UPDATE','DELETE')),
    column_name     VARCHAR2(60),
    old_value       VARCHAR2(4000),
    new_value       VARCHAR2(4000),
    changed_by      VARCHAR2(60)    DEFAULT USER,
    changed_at      TIMESTAMP       DEFAULT SYSTIMESTAMP,
    session_id      NUMBER,
    ip_address      VARCHAR2(45),
    CONSTRAINT pk_audit_log PRIMARY KEY (audit_id)
);

CREATE INDEX idx_audit_table  ON audit_log(table_name);
CREATE INDEX idx_audit_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_date   ON audit_log(changed_at);

-- =============================================
-- 3. FUNCTION: fn_CalculateAge
--    Returns patient age in whole years from DOB.
-- =============================================

CREATE OR REPLACE FUNCTION fn_CalculateAge(
    p_date_of_birth IN DATE
) RETURN NUMBER
IS
    -- --------------------------------------------------
    -- fn_CalculateAge
    -- Calculates age in full years from a date of birth.
    -- Uses MONTHS_BETWEEN for precision with leap years.
    -- --------------------------------------------------
    v_age NUMBER(3);
BEGIN
    IF p_date_of_birth IS NULL THEN
        RETURN NULL;
    END IF;

    IF p_date_of_birth > SYSDATE THEN
        RAISE_APPLICATION_ERROR(-20010, 'Date of birth cannot be in the future');
    END IF;

    v_age := TRUNC(MONTHS_BETWEEN(SYSDATE, p_date_of_birth) / 12);
    RETURN v_age;
EXCEPTION
    WHEN OTHERS THEN
        -- Re-raise application errors, log unexpected ones
        IF SQLCODE BETWEEN -20999 AND -20000 THEN
            RAISE;
        END IF;
        RAISE_APPLICATION_ERROR(-20011, 'Error calculating age: ' || SQLERRM);
END fn_CalculateAge;
/

-- =============================================
-- 4. TRIGGER: trg_AuditChanges
--    Fires on INSERT, UPDATE, DELETE on PATIENTS
--    and writes change details to AUDIT_LOG.
-- =============================================

CREATE OR REPLACE TRIGGER trg_AuditChanges
AFTER INSERT OR UPDATE OR DELETE ON patients
FOR EACH ROW
DECLARE
    -- --------------------------------------------------
    -- trg_AuditChanges
    -- Comprehensive audit trigger for the patients table.
    -- Captures column-level changes for UPDATE, full row
    -- snapshots for INSERT/DELETE.
    -- --------------------------------------------------
    v_action    VARCHAR2(10);
    v_audit_id  NUMBER(12);
    v_session   NUMBER;

    PROCEDURE log_change(
        p_col       VARCHAR2,
        p_old_val   VARCHAR2,
        p_new_val   VARCHAR2,
        p_rec_id    NUMBER
    ) IS
    BEGIN
        IF (p_old_val IS NULL AND p_new_val IS NULL) THEN
            RETURN; -- no actual change
        END IF;
        IF (p_old_val = p_new_val) THEN
            RETURN; -- values are the same
        END IF;

        SELECT seq_audit_id.NEXTVAL INTO v_audit_id FROM dual;

        INSERT INTO audit_log (
            audit_id, table_name, record_id, action_type,
            column_name, old_value, new_value,
            changed_by, changed_at, session_id
        ) VALUES (
            v_audit_id, 'PATIENTS', p_rec_id, v_action,
            p_col, p_old_val, p_new_val,
            USER, SYSTIMESTAMP, v_session
        );
    END log_change;

BEGIN
    v_session := SYS_CONTEXT('USERENV', 'SESSIONID');

    IF INSERTING THEN
        v_action := 'INSERT';
        SELECT seq_audit_id.NEXTVAL INTO v_audit_id FROM dual;
        INSERT INTO audit_log (
            audit_id, table_name, record_id, action_type,
            column_name, old_value, new_value,
            changed_by, changed_at, session_id
        ) VALUES (
            v_audit_id, 'PATIENTS', :NEW.patient_id, 'INSERT',
            '*', NULL,
            :NEW.first_name || ' ' || :NEW.last_name || ' (DOB: ' || TO_CHAR(:NEW.date_of_birth,'YYYY-MM-DD') || ')',
            USER, SYSTIMESTAMP, v_session
        );

    ELSIF UPDATING THEN
        v_action := 'UPDATE';
        -- Track each column individually
        log_change('FIRST_NAME',      :OLD.first_name,      :NEW.first_name,      :OLD.patient_id);
        log_change('LAST_NAME',       :OLD.last_name,       :NEW.last_name,       :OLD.patient_id);
        log_change('EMAIL',           :OLD.email,           :NEW.email,           :OLD.patient_id);
        log_change('PHONE',           :OLD.phone,           :NEW.phone,           :OLD.patient_id);
        log_change('ADDRESS_LINE1',   :OLD.address_line1,   :NEW.address_line1,   :OLD.patient_id);
        log_change('CITY',            :OLD.city,            :NEW.city,            :OLD.patient_id);
        log_change('STATE_CODE',      :OLD.state_code,      :NEW.state_code,      :OLD.patient_id);
        log_change('ZIP_CODE',        :OLD.zip_code,        :NEW.zip_code,        :OLD.patient_id);
        log_change('IS_ACTIVE',       :OLD.is_active,       :NEW.is_active,       :OLD.patient_id);
        log_change('INSURANCE_PLAN_ID',
                   TO_CHAR(:OLD.insurance_plan_id),
                   TO_CHAR(:NEW.insurance_plan_id),
                   :OLD.patient_id);
        log_change('POLICY_NUMBER',   :OLD.policy_number,   :NEW.policy_number,   :OLD.patient_id);

    ELSIF DELETING THEN
        v_action := 'DELETE';
        SELECT seq_audit_id.NEXTVAL INTO v_audit_id FROM dual;
        INSERT INTO audit_log (
            audit_id, table_name, record_id, action_type,
            column_name, old_value, new_value,
            changed_by, changed_at, session_id
        ) VALUES (
            v_audit_id, 'PATIENTS', :OLD.patient_id, 'DELETE',
            '*',
            :OLD.first_name || ' ' || :OLD.last_name || ' (DOB: ' || TO_CHAR(:OLD.date_of_birth,'YYYY-MM-DD') || ')',
            NULL,
            USER, SYSTIMESTAMP, v_session
        );
    END IF;
END trg_AuditChanges;
/

-- =============================================
-- 5. PROCEDURE: sp_RegisterPatient
--    Validates inputs and inserts a new patient.
--    Returns the new patient_id via OUT parameter.
-- =============================================

CREATE OR REPLACE PROCEDURE sp_RegisterPatient(
    p_first_name        IN  VARCHAR2,
    p_last_name         IN  VARCHAR2,
    p_date_of_birth     IN  DATE,
    p_gender            IN  CHAR,
    p_ssn               IN  VARCHAR2    DEFAULT NULL,
    p_email             IN  VARCHAR2    DEFAULT NULL,
    p_phone             IN  VARCHAR2    DEFAULT NULL,
    p_address_line1     IN  VARCHAR2    DEFAULT NULL,
    p_city              IN  VARCHAR2    DEFAULT NULL,
    p_state_code        IN  CHAR        DEFAULT NULL,
    p_zip_code          IN  VARCHAR2    DEFAULT NULL,
    p_insurance_plan_id IN  NUMBER      DEFAULT NULL,
    p_policy_number     IN  VARCHAR2    DEFAULT NULL,
    p_emerg_name        IN  VARCHAR2    DEFAULT NULL,
    p_emerg_phone       IN  VARCHAR2    DEFAULT NULL,
    p_patient_id        OUT NUMBER
)
IS
    -- --------------------------------------------------
    -- sp_RegisterPatient
    -- Registers a new patient after validating:
    --   1) Required fields are present
    --   2) Date of birth is not in the future
    --   3) SSN is unique (if provided)
    --   4) Insurance plan exists and is active (if provided)
    --   5) Patient is not a duplicate (name + DOB match)
    -- Cross-references: fn_CalculateAge, insurance_plans
    -- --------------------------------------------------
    v_count         NUMBER;
    v_age           NUMBER;
    v_plan_active   CHAR(1);
BEGIN
    -- Validate required fields
    IF p_first_name IS NULL OR p_last_name IS NULL THEN
        RAISE_APPLICATION_ERROR(-20100, 'First name and last name are required');
    END IF;

    IF p_date_of_birth IS NULL THEN
        RAISE_APPLICATION_ERROR(-20101, 'Date of birth is required');
    END IF;

    IF p_gender NOT IN ('M','F','O') THEN
        RAISE_APPLICATION_ERROR(-20102, 'Gender must be M, F, or O');
    END IF;

    -- Validate DOB is not in the future
    v_age := fn_CalculateAge(p_date_of_birth);
    IF v_age < 0 THEN
        RAISE_APPLICATION_ERROR(-20103, 'Date of birth cannot be in the future');
    END IF;

    -- Check SSN uniqueness
    IF p_ssn IS NOT NULL THEN
        SELECT COUNT(*) INTO v_count
          FROM patients
         WHERE ssn = p_ssn;

        IF v_count > 0 THEN
            RAISE_APPLICATION_ERROR(-20104,
                'A patient with SSN ' || p_ssn || ' already exists');
        END IF;
    END IF;

    -- Check for duplicate (name + DOB)
    SELECT COUNT(*) INTO v_count
      FROM patients
     WHERE UPPER(first_name) = UPPER(p_first_name)
       AND UPPER(last_name)  = UPPER(p_last_name)
       AND date_of_birth     = p_date_of_birth;

    IF v_count > 0 THEN
        RAISE_APPLICATION_ERROR(-20105,
            'Possible duplicate: patient with same name and DOB already exists');
    END IF;

    -- Validate insurance plan if provided
    IF p_insurance_plan_id IS NOT NULL THEN
        BEGIN
            SELECT is_active INTO v_plan_active
              FROM insurance_plans
             WHERE plan_id = p_insurance_plan_id;

            IF v_plan_active = 'N' THEN
                RAISE_APPLICATION_ERROR(-20106,
                    'Insurance plan ' || p_insurance_plan_id || ' is inactive');
            END IF;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                RAISE_APPLICATION_ERROR(-20107,
                    'Insurance plan ' || p_insurance_plan_id || ' does not exist');
        END;
    END IF;

    -- Generate ID and insert
    p_patient_id := seq_patient_id.NEXTVAL;

    INSERT INTO patients (
        patient_id, first_name, last_name, date_of_birth, gender,
        ssn, email, phone, address_line1, city, state_code, zip_code,
        insurance_plan_id, policy_number,
        emergency_contact_name, emergency_contact_phone,
        registration_date, is_active
    ) VALUES (
        p_patient_id, p_first_name, p_last_name, p_date_of_birth, p_gender,
        p_ssn, p_email, p_phone, p_address_line1, p_city, p_state_code, p_zip_code,
        p_insurance_plan_id, p_policy_number,
        p_emerg_name, p_emerg_phone,
        SYSDATE, 'Y'
    );

    COMMIT;

EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        -- Re-raise application errors as-is
        IF SQLCODE BETWEEN -20999 AND -20000 THEN
            RAISE;
        END IF;
        RAISE_APPLICATION_ERROR(-20199,
            'Unexpected error in sp_RegisterPatient: ' || SQLERRM);
END sp_RegisterPatient;
/

-- =============================================
-- 6. PROCEDURE: sp_CheckInsurance
--    Validates a patient insurance eligibility.
--    Returns coverage details via OUT parameters.
-- =============================================

CREATE OR REPLACE PROCEDURE sp_CheckInsurance(
    p_patient_id        IN  NUMBER,
    p_service_code      IN  VARCHAR2,
    p_service_amount    IN  NUMBER,
    p_is_eligible       OUT CHAR,
    p_coverage_pct      OUT NUMBER,
    p_covered_amount    OUT NUMBER,
    p_patient_responsibility OUT NUMBER,
    p_denial_reason     OUT VARCHAR2
)
IS
    -- --------------------------------------------------
    -- sp_CheckInsurance
    -- Checks insurance eligibility for a given patient
    -- and proposed service. Evaluates:
    --   1) Patient has active insurance
    --   2) Plan is currently effective
    --   3) Plan has not exceeded annual maximum
    --   4) Service type is covered by plan type
    -- Cross-references: patients, insurance_plans, billing
    -- --------------------------------------------------
    v_plan_id       NUMBER(8);
    v_plan_type     VARCHAR2(30);
    v_coverage_pct  NUMBER(5,2);
    v_max_annual    NUMBER(12,2);
    v_eff_from      DATE;
    v_eff_to        DATE;
    v_plan_active   CHAR(1);
    v_ytd_covered   NUMBER(12,2);
    v_remaining     NUMBER(12,2);
BEGIN
    -- Initialize outputs
    p_is_eligible       := 'N';
    p_coverage_pct      := 0;
    p_covered_amount    := 0;
    p_patient_responsibility := p_service_amount;
    p_denial_reason     := NULL;

    -- Fetch patient insurance info
    BEGIN
        SELECT p.insurance_plan_id,
               ip.plan_type, ip.coverage_pct, ip.max_annual,
               ip.effective_from, ip.effective_to, ip.is_active
          INTO v_plan_id, v_plan_type, v_coverage_pct, v_max_annual,
               v_eff_from, v_eff_to, v_plan_active
          FROM patients p
          JOIN insurance_plans ip ON ip.plan_id = p.insurance_plan_id
         WHERE p.patient_id = p_patient_id
           AND p.is_active = 'Y';
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            p_denial_reason := 'Patient not found or has no insurance on file';
            RETURN;
        WHEN TOO_MANY_ROWS THEN
            p_denial_reason := 'Data integrity error: multiple active records';
            RETURN;
    END;

    -- Check plan is active
    IF v_plan_active = 'N' THEN
        p_denial_reason := 'Insurance plan is inactive';
        RETURN;
    END IF;

    -- Check plan effective dates
    IF SYSDATE < v_eff_from THEN
        p_denial_reason := 'Insurance plan not yet effective (starts ' ||
                           TO_CHAR(v_eff_from, 'YYYY-MM-DD') || ')';
        RETURN;
    END IF;

    IF v_eff_to IS NOT NULL AND SYSDATE > v_eff_to THEN
        p_denial_reason := 'Insurance plan expired on ' ||
                           TO_CHAR(v_eff_to, 'YYYY-MM-DD');
        RETURN;
    END IF;

    -- Emergency services: all plan types cover emergencies
    -- Non-emergency procedures: HMO requires referral (simplified check)
    IF v_plan_type = 'HMO' AND p_service_code NOT LIKE 'ER%' THEN
        -- For HMO, only cover if service code starts with approved prefixes
        IF p_service_code NOT LIKE 'PCP%'
           AND p_service_code NOT LIKE 'LAB%'
           AND p_service_code NOT LIKE 'PRV%' THEN
            p_denial_reason := 'HMO plan requires PCP referral for service ' || p_service_code;
            RETURN;
        END IF;
    END IF;

    -- Medicaid caps on certain services
    IF v_plan_type = 'MEDICAID' AND p_service_amount > 5000 THEN
        IF p_service_code NOT LIKE 'ER%' AND p_service_code NOT LIKE 'SUR%' THEN
            p_denial_reason := 'Medicaid does not cover non-emergency services above $5000';
            RETURN;
        END IF;
    END IF;

    -- Check year-to-date coverage against annual maximum
    IF v_max_annual IS NOT NULL THEN
        SELECT NVL(SUM(insurance_covered), 0)
          INTO v_ytd_covered
          FROM billing
         WHERE patient_id = p_patient_id
           AND insurance_plan_id = v_plan_id
           AND billing_date >= TRUNC(SYSDATE, 'YYYY');

        v_remaining := v_max_annual - v_ytd_covered;

        IF v_remaining <= 0 THEN
            p_denial_reason := 'Annual coverage maximum ($' ||
                               TO_CHAR(v_max_annual, 'FM999,999.00') || ') has been reached';
            RETURN;
        END IF;
    ELSE
        v_remaining := p_service_amount; -- unlimited
    END IF;

    -- Calculate coverage
    p_is_eligible  := 'Y';
    p_coverage_pct := v_coverage_pct;
    p_covered_amount := LEAST(
        ROUND(p_service_amount * (v_coverage_pct / 100), 2),
        v_remaining
    );
    p_patient_responsibility := p_service_amount - p_covered_amount;

EXCEPTION
    WHEN OTHERS THEN
        p_is_eligible   := 'N';
        p_denial_reason := 'System error during insurance check: ' || SQLERRM;
END sp_CheckInsurance;
/

-- =============================================
-- 7. PROCEDURE: sp_ScheduleAppointment
--    Creates an appointment with date and conflict
--    validation. Returns new appointment_id.
-- =============================================

CREATE OR REPLACE PROCEDURE sp_ScheduleAppointment(
    p_patient_id        IN  NUMBER,
    p_doctor_id         IN  NUMBER,
    p_appointment_date  IN  DATE,
    p_start_time        IN  TIMESTAMP,
    p_end_time          IN  TIMESTAMP,
    p_visit_type        IN  VARCHAR2,
    p_reason            IN  VARCHAR2    DEFAULT NULL,
    p_appointment_id    OUT NUMBER
)
IS
    -- --------------------------------------------------
    -- sp_ScheduleAppointment
    -- Validates scheduling constraints and creates an
    -- appointment:
    --   1) Patient and doctor must exist and be active
    --   2) Appointment must be in the future
    --   3) No overlapping appointments for the doctor
    --   4) No overlapping appointments for the patient
    --   5) Doctor works in a valid department
    -- Cross-references: patients, doctors, appointments
    -- --------------------------------------------------
    v_count         NUMBER;
    v_doc_active    CHAR(1);
    v_pat_active    CHAR(1);
    v_conflict_id   NUMBER;
BEGIN
    -- Validate patient exists and is active
    BEGIN
        SELECT is_active INTO v_pat_active
          FROM patients
         WHERE patient_id = p_patient_id;

        IF v_pat_active = 'N' THEN
            RAISE_APPLICATION_ERROR(-20200,
                'Patient ' || p_patient_id || ' is inactive');
        END IF;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE_APPLICATION_ERROR(-20201,
                'Patient ' || p_patient_id || ' does not exist');
    END;

    -- Validate doctor exists and is active
    BEGIN
        SELECT is_active INTO v_doc_active
          FROM doctors
         WHERE doctor_id = p_doctor_id;

        IF v_doc_active = 'N' THEN
            RAISE_APPLICATION_ERROR(-20202,
                'Doctor ' || p_doctor_id || ' is inactive');
        END IF;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE_APPLICATION_ERROR(-20203,
                'Doctor ' || p_doctor_id || ' does not exist');
    END;

    -- Appointment must be in the future
    IF p_appointment_date < TRUNC(SYSDATE) THEN
        RAISE_APPLICATION_ERROR(-20204,
            'Cannot schedule appointment in the past');
    END IF;

    -- Validate time range
    IF p_end_time <= p_start_time THEN
        RAISE_APPLICATION_ERROR(-20205,
            'End time must be after start time');
    END IF;

    -- Check for doctor scheduling conflicts (overlapping times)
    BEGIN
        SELECT appointment_id INTO v_conflict_id
          FROM appointments
         WHERE doctor_id = p_doctor_id
           AND appointment_date = p_appointment_date
           AND status NOT IN ('CANCELLED','NO_SHOW')
           AND (
               (p_start_time >= start_time AND p_start_time < end_time)
               OR (p_end_time > start_time AND p_end_time <= end_time)
               OR (p_start_time <= start_time AND p_end_time >= end_time)
           )
           AND ROWNUM = 1;

        RAISE_APPLICATION_ERROR(-20206,
            'Doctor has a conflicting appointment (ID: ' || v_conflict_id ||
            ') at the requested time');
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            NULL; -- No conflict, proceed
    END;

    -- Check for patient scheduling conflicts
    BEGIN
        SELECT appointment_id INTO v_conflict_id
          FROM appointments
         WHERE patient_id = p_patient_id
           AND appointment_date = p_appointment_date
           AND status NOT IN ('CANCELLED','NO_SHOW')
           AND (
               (p_start_time >= start_time AND p_start_time < end_time)
               OR (p_end_time > start_time AND p_end_time <= end_time)
               OR (p_start_time <= start_time AND p_end_time >= end_time)
           )
           AND ROWNUM = 1;

        RAISE_APPLICATION_ERROR(-20207,
            'Patient already has an appointment (ID: ' || v_conflict_id ||
            ') at the requested time');
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            NULL; -- No conflict, proceed
    END;

    -- Create the appointment
    p_appointment_id := seq_appointment_id.NEXTVAL;

    INSERT INTO appointments (
        appointment_id, patient_id, doctor_id,
        appointment_date, start_time, end_time,
        visit_type, status, reason, created_at
    ) VALUES (
        p_appointment_id, p_patient_id, p_doctor_id,
        p_appointment_date, p_start_time, p_end_time,
        p_visit_type, 'SCHEDULED', p_reason, SYSTIMESTAMP
    );

    COMMIT;

EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        IF SQLCODE BETWEEN -20999 AND -20000 THEN
            RAISE;
        END IF;
        RAISE_APPLICATION_ERROR(-20299,
            'Unexpected error in sp_ScheduleAppointment: ' || SQLERRM);
END sp_ScheduleAppointment;
/

-- =============================================
-- 8. PROCEDURE: sp_UpdateMedicalRecord
--    Updates a medical record with full audit trail
--    and confidentiality enforcement.
-- =============================================

CREATE OR REPLACE PROCEDURE sp_UpdateMedicalRecord(
    p_record_id         IN  NUMBER,
    p_doctor_id         IN  NUMBER,
    p_diagnosis_code    IN  VARCHAR2    DEFAULT NULL,
    p_diagnosis_desc    IN  VARCHAR2    DEFAULT NULL,
    p_treatment_plan    IN  CLOB        DEFAULT NULL,
    p_vitals_bp         IN  VARCHAR2    DEFAULT NULL,
    p_vitals_hr         IN  NUMBER      DEFAULT NULL,
    p_vitals_temp       IN  NUMBER      DEFAULT NULL,
    p_vitals_weight     IN  NUMBER      DEFAULT NULL,
    p_notes             IN  CLOB        DEFAULT NULL,
    p_is_confidential   IN  CHAR        DEFAULT NULL
)
IS
    -- --------------------------------------------------
    -- sp_UpdateMedicalRecord
    -- Updates an existing medical record with validation:
    --   1) Record must exist
    --   2) Only the attending doctor (or same department)
    --      can modify the record
    --   3) Confidential records require additional logging
    --   4) Manual audit entries for CLOB fields that the
    --      trigger on PATIENTS cannot capture here
    -- Cross-references: medical_records, doctors, audit_log
    -- --------------------------------------------------
    v_existing_doc_id   NUMBER(8);
    v_existing_dept     NUMBER(6);
    v_requesting_dept   NUMBER(6);
    v_patient_id        NUMBER(10);
    v_is_confidential   CHAR(1);
    v_old_diag_code     VARCHAR2(10);
    v_old_diag_desc     VARCHAR2(500);
    v_audit_id          NUMBER;
BEGIN
    -- Fetch current record
    BEGIN
        SELECT doctor_id, patient_id, is_confidential,
               diagnosis_code, diagnosis_desc
          INTO v_existing_doc_id, v_patient_id, v_is_confidential,
               v_old_diag_code, v_old_diag_desc
          FROM medical_records
         WHERE record_id = p_record_id;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE_APPLICATION_ERROR(-20300,
                'Medical record ' || p_record_id || ' does not exist');
    END;

    -- Authorization: requesting doctor must be same or in same department
    IF p_doctor_id != v_existing_doc_id THEN
        SELECT department_id INTO v_existing_dept
          FROM doctors WHERE doctor_id = v_existing_doc_id;

        SELECT department_id INTO v_requesting_dept
          FROM doctors WHERE doctor_id = p_doctor_id;

        IF v_existing_dept != v_requesting_dept THEN
            RAISE_APPLICATION_ERROR(-20301,
                'Doctor ' || p_doctor_id ||
                ' is not authorized to modify records from department ' ||
                v_existing_dept);
        END IF;
    END IF;

    -- Confidential record access logging
    IF v_is_confidential = 'Y' THEN
        SELECT seq_audit_id.NEXTVAL INTO v_audit_id FROM dual;
        INSERT INTO audit_log (
            audit_id, table_name, record_id, action_type,
            column_name, old_value, new_value,
            changed_by, changed_at
        ) VALUES (
            v_audit_id, 'MEDICAL_RECORDS', p_record_id, 'UPDATE',
            'CONFIDENTIAL_ACCESS',
            'Confidential record accessed',
            'Modified by doctor_id=' || p_doctor_id,
            USER, SYSTIMESTAMP
        );
    END IF;

    -- Perform the update (only non-NULL parameters are applied)
    UPDATE medical_records
       SET diagnosis_code  = NVL(p_diagnosis_code, diagnosis_code),
           diagnosis_desc  = NVL(p_diagnosis_desc, diagnosis_desc),
           treatment_plan  = NVL(p_treatment_plan, treatment_plan),
           vitals_bp       = NVL(p_vitals_bp,      vitals_bp),
           vitals_hr       = NVL(p_vitals_hr,      vitals_hr),
           vitals_temp     = NVL(p_vitals_temp,     vitals_temp),
           vitals_weight   = NVL(p_vitals_weight,   vitals_weight),
           notes           = NVL(p_notes,           notes),
           is_confidential = NVL(p_is_confidential, is_confidential),
           updated_at      = SYSTIMESTAMP
     WHERE record_id = p_record_id;

    -- Manual audit for diagnosis changes (important for compliance)
    IF p_diagnosis_code IS NOT NULL AND
       (v_old_diag_code IS NULL OR v_old_diag_code != p_diagnosis_code) THEN
        SELECT seq_audit_id.NEXTVAL INTO v_audit_id FROM dual;
        INSERT INTO audit_log (
            audit_id, table_name, record_id, action_type,
            column_name, old_value, new_value,
            changed_by, changed_at
        ) VALUES (
            v_audit_id, 'MEDICAL_RECORDS', p_record_id, 'UPDATE',
            'DIAGNOSIS_CODE', v_old_diag_code, p_diagnosis_code,
            USER, SYSTIMESTAMP
        );
    END IF;

    IF p_diagnosis_desc IS NOT NULL AND
       (v_old_diag_desc IS NULL OR v_old_diag_desc != p_diagnosis_desc) THEN
        SELECT seq_audit_id.NEXTVAL INTO v_audit_id FROM dual;
        INSERT INTO audit_log (
            audit_id, table_name, record_id, action_type,
            column_name, old_value, new_value,
            changed_by, changed_at
        ) VALUES (
            v_audit_id, 'MEDICAL_RECORDS', p_record_id, 'UPDATE',
            'DIAGNOSIS_DESC',
            SUBSTR(v_old_diag_desc, 1, 4000),
            SUBSTR(p_diagnosis_desc, 1, 4000),
            USER, SYSTIMESTAMP
        );
    END IF;

    COMMIT;

EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        IF SQLCODE BETWEEN -20999 AND -20000 THEN
            RAISE;
        END IF;
        RAISE_APPLICATION_ERROR(-20399,
            'Unexpected error in sp_UpdateMedicalRecord: ' || SQLERRM);
END sp_UpdateMedicalRecord;
/

-- =============================================
-- 9. PROCEDURE: sp_ProcessBilling
--    Complex billing procedure with cursor,
--    insurance check, exception handling.
-- =============================================

CREATE OR REPLACE PROCEDURE sp_ProcessBilling(
    p_appointment_id    IN  NUMBER,
    p_service_code      IN  VARCHAR2,
    p_service_desc      IN  VARCHAR2,
    p_gross_amount      IN  NUMBER,
    p_billing_id        OUT NUMBER
)
IS
    -- --------------------------------------------------
    -- sp_ProcessBilling
    -- Processes billing for a completed appointment:
    --   1) Validates appointment exists and is completed
    --   2) Calls sp_CheckInsurance for coverage calculation
    --   3) Applies any existing discounts (senior, loyalty)
    --   4) Creates billing record
    --   5) Checks for outstanding balances using cursor
    --   6) Updates appointment status if not already final
    -- Cross-references: sp_CheckInsurance, fn_CalculateAge,
    --   appointments, patients, billing, insurance_plans
    -- --------------------------------------------------
    v_patient_id        NUMBER(10);
    v_doctor_id         NUMBER(8);
    v_appt_status       VARCHAR2(20);
    v_insurance_plan_id NUMBER(8);
    v_dob               DATE;
    v_age               NUMBER;

    -- Insurance check outputs
    v_is_eligible       CHAR(1);
    v_coverage_pct      NUMBER;
    v_covered_amount    NUMBER;
    v_patient_resp      NUMBER;
    v_denial_reason     VARCHAR2(4000);

    -- Discount calculation
    v_discount          NUMBER(10,2) := 0;
    v_senior_discount   CONSTANT NUMBER := 0.10; -- 10% for 65+
    v_loyalty_threshold CONSTANT NUMBER := 10;   -- visits for loyalty discount
    v_loyalty_discount  CONSTANT NUMBER := 0.05; -- 5% loyalty discount
    v_visit_count       NUMBER;
    v_net_amount        NUMBER(10,2);

    -- Outstanding balance cursor
    CURSOR cur_outstanding(cp_patient_id NUMBER) IS
        SELECT billing_id, net_amount, billing_date, payment_status
          FROM billing
         WHERE patient_id = cp_patient_id
           AND payment_status IN ('PENDING','OVERDUE')
         ORDER BY billing_date ASC;

    v_outstanding_total NUMBER(12,2) := 0;
    v_overdue_count     NUMBER := 0;
    v_rec               cur_outstanding%ROWTYPE;

BEGIN
    -- Step 1: Validate appointment
    BEGIN
        SELECT patient_id, doctor_id, status
          INTO v_patient_id, v_doctor_id, v_appt_status
          FROM appointments
         WHERE appointment_id = p_appointment_id;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE_APPLICATION_ERROR(-20400,
                'Appointment ' || p_appointment_id || ' does not exist');
    END;

    -- Appointment must be completed or in progress
    IF v_appt_status NOT IN ('COMPLETED','IN_PROGRESS') THEN
        RAISE_APPLICATION_ERROR(-20401,
            'Cannot bill appointment with status: ' || v_appt_status ||
            '. Appointment must be COMPLETED or IN_PROGRESS.');
    END IF;

    -- Validate amount
    IF p_gross_amount IS NULL OR p_gross_amount <= 0 THEN
        RAISE_APPLICATION_ERROR(-20402, 'Gross amount must be positive');
    END IF;

    -- Step 2: Get patient details
    SELECT date_of_birth, insurance_plan_id
      INTO v_dob, v_insurance_plan_id
      FROM patients
     WHERE patient_id = v_patient_id;

    -- Step 3: Check insurance coverage
    IF v_insurance_plan_id IS NOT NULL THEN
        sp_CheckInsurance(
            p_patient_id            => v_patient_id,
            p_service_code          => p_service_code,
            p_service_amount        => p_gross_amount,
            p_is_eligible           => v_is_eligible,
            p_coverage_pct          => v_coverage_pct,
            p_covered_amount        => v_covered_amount,
            p_patient_responsibility => v_patient_resp,
            p_denial_reason         => v_denial_reason
        );

        IF v_is_eligible = 'N' THEN
            -- Insurance denied; patient pays full amount
            -- (denial reason is logged but does not block billing)
            v_covered_amount := 0;
        END IF;
    ELSE
        -- No insurance, patient pays everything
        v_covered_amount := 0;
    END IF;

    -- Step 4: Calculate discounts
    -- Senior discount (age 65+)
    v_age := fn_CalculateAge(v_dob);
    IF v_age >= 65 THEN
        v_discount := v_discount + ROUND(p_gross_amount * v_senior_discount, 2);
    END IF;

    -- Loyalty discount (10+ completed visits)
    SELECT COUNT(*) INTO v_visit_count
      FROM appointments
     WHERE patient_id = v_patient_id
       AND status = 'COMPLETED';

    IF v_visit_count >= v_loyalty_threshold THEN
        v_discount := v_discount + ROUND(p_gross_amount * v_loyalty_discount, 2);
    END IF;

    -- Cap discount so it does not exceed patient responsibility
    v_net_amount := p_gross_amount - v_covered_amount - v_discount;
    IF v_net_amount < 0 THEN
        v_discount := p_gross_amount - v_covered_amount;
        v_net_amount := 0;
    END IF;

    -- Step 5: Create billing record
    p_billing_id := seq_billing_id.NEXTVAL;

    INSERT INTO billing (
        billing_id, patient_id, appointment_id, insurance_plan_id,
        billing_date, service_code, service_desc,
        gross_amount, insurance_covered, patient_copay, discount_amount,
        payment_status, created_at
    ) VALUES (
        p_billing_id, v_patient_id, p_appointment_id, v_insurance_plan_id,
        SYSDATE, p_service_code, p_service_desc,
        p_gross_amount, v_covered_amount, v_net_amount, v_discount,
        'PENDING', SYSTIMESTAMP
    );

    -- Step 6: Check outstanding balances with cursor
    OPEN cur_outstanding(v_patient_id);
    LOOP
        FETCH cur_outstanding INTO v_rec;
        EXIT WHEN cur_outstanding%NOTFOUND;

        v_outstanding_total := v_outstanding_total + v_rec.net_amount;

        -- Mark old pending bills as overdue if > 90 days
        IF v_rec.payment_status = 'PENDING'
           AND v_rec.billing_date < SYSDATE - 90 THEN
            UPDATE billing
               SET payment_status = 'OVERDUE'
             WHERE billing_id = v_rec.billing_id;
            v_overdue_count := v_overdue_count + 1;
        END IF;
    END LOOP;
    CLOSE cur_outstanding;

    -- Update appointment to COMPLETED if still IN_PROGRESS
    IF v_appt_status = 'IN_PROGRESS' THEN
        UPDATE appointments
           SET status = 'COMPLETED',
               updated_at = SYSTIMESTAMP
         WHERE appointment_id = p_appointment_id;
    END IF;

    COMMIT;

    -- Log a note if patient has significant outstanding balance
    IF v_outstanding_total > 1000 THEN
        DECLARE
            v_audit_id NUMBER;
        BEGIN
            SELECT seq_audit_id.NEXTVAL INTO v_audit_id FROM dual;
            INSERT INTO audit_log (
                audit_id, table_name, record_id, action_type,
                column_name, old_value, new_value,
                changed_by, changed_at
            ) VALUES (
                v_audit_id, 'BILLING', p_billing_id, 'INSERT',
                'OUTSTANDING_BALANCE_WARNING',
                NULL,
                'Patient ' || v_patient_id || ' outstanding balance: $' ||
                TO_CHAR(v_outstanding_total, 'FM999,999.00') ||
                ' (' || v_overdue_count || ' overdue)',
                USER, SYSTIMESTAMP
            );
            COMMIT;
        END;
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        IF cur_outstanding%ISOPEN THEN
            CLOSE cur_outstanding;
        END IF;
        ROLLBACK;
        IF SQLCODE BETWEEN -20999 AND -20000 THEN
            RAISE;
        END IF;
        RAISE_APPLICATION_ERROR(-20499,
            'Unexpected error in sp_ProcessBilling: ' || SQLERRM);
END sp_ProcessBilling;
/

-- =============================================
-- 10. PROCEDURE: sp_GenerateReport
--     Dynamic SQL aggregation report.
-- =============================================

CREATE OR REPLACE PROCEDURE sp_GenerateReport(
    p_report_type   IN  VARCHAR2,
    p_date_from     IN  DATE        DEFAULT NULL,
    p_date_to       IN  DATE        DEFAULT NULL,
    p_department_id IN  NUMBER      DEFAULT NULL,
    p_result_cursor OUT SYS_REFCURSOR
)
IS
    -- --------------------------------------------------
    -- sp_GenerateReport
    -- Generates dynamic reports based on report type:
    --   'REVENUE'      - Revenue summary by department/month
    --   'PATIENT_DEMO' - Patient demographics overview
    --   'DOCTOR_LOAD'  - Doctor workload analysis
    --   'INSURANCE'    - Insurance utilization breakdown
    --   'DIAGNOSIS'    - Top diagnosis codes and frequency
    -- Uses dynamic SQL with bind variables for security.
    -- Cross-references: all major tables
    -- --------------------------------------------------
    v_sql       VARCHAR2(4000);
    v_where     VARCHAR2(1000) := '';
    v_from_date DATE;
    v_to_date   DATE;
BEGIN
    -- Default date range: last 12 months
    v_from_date := NVL(p_date_from, ADD_MONTHS(TRUNC(SYSDATE), -12));
    v_to_date   := NVL(p_date_to, SYSDATE);

    IF p_report_type = 'REVENUE' THEN
        -- Revenue by department and month
        v_sql := '
            SELECT d.department_name,
                   TO_CHAR(b.billing_date, ''YYYY-MM'') AS billing_month,
                   COUNT(b.billing_id) AS invoice_count,
                   SUM(b.gross_amount) AS total_gross,
                   SUM(b.insurance_covered) AS total_insurance,
                   SUM(b.discount_amount) AS total_discounts,
                   SUM(b.gross_amount - b.insurance_covered - b.discount_amount) AS total_net,
                   ROUND(AVG(b.gross_amount), 2) AS avg_charge,
                   SUM(CASE WHEN b.payment_status = ''PAID'' THEN 1 ELSE 0 END) AS paid_count,
                   SUM(CASE WHEN b.payment_status = ''OVERDUE'' THEN 1 ELSE 0 END) AS overdue_count
              FROM billing b
              JOIN appointments a  ON a.appointment_id = b.appointment_id
              JOIN doctors doc     ON doc.doctor_id = a.doctor_id
              JOIN departments d   ON d.department_id = doc.department_id
             WHERE b.billing_date BETWEEN :from_date AND :to_date';

        IF p_department_id IS NOT NULL THEN
            v_sql := v_sql || ' AND d.department_id = :dept_id';
        ELSE
            v_sql := v_sql || ' AND (1=1 OR :dept_id IS NULL)';
        END IF;

        v_sql := v_sql || '
             GROUP BY d.department_name, TO_CHAR(b.billing_date, ''YYYY-MM'')
             ORDER BY d.department_name, billing_month';

        OPEN p_result_cursor FOR v_sql
            USING v_from_date, v_to_date, p_department_id;

    ELSIF p_report_type = 'PATIENT_DEMO' THEN
        -- Patient demographics
        v_sql := '
            SELECT
                CASE
                    WHEN fn_CalculateAge(p.date_of_birth) < 18 THEN ''Pediatric (0-17)''
                    WHEN fn_CalculateAge(p.date_of_birth) BETWEEN 18 AND 34 THEN ''Young Adult (18-34)''
                    WHEN fn_CalculateAge(p.date_of_birth) BETWEEN 35 AND 54 THEN ''Adult (35-54)''
                    WHEN fn_CalculateAge(p.date_of_birth) BETWEEN 55 AND 64 THEN ''Senior (55-64)''
                    ELSE ''Elderly (65+)''
                END AS age_group,
                p.gender,
                COUNT(*) AS patient_count,
                SUM(CASE WHEN p.insurance_plan_id IS NOT NULL THEN 1 ELSE 0 END) AS insured_count,
                ROUND(AVG(fn_CalculateAge(p.date_of_birth)), 1) AS avg_age,
                COUNT(DISTINCT p.state_code) AS state_count
              FROM patients p
             WHERE p.is_active = ''Y''
               AND p.registration_date BETWEEN :from_date AND :to_date
               AND (1=1 OR :dept_id IS NULL)
             GROUP BY
                CASE
                    WHEN fn_CalculateAge(p.date_of_birth) < 18 THEN ''Pediatric (0-17)''
                    WHEN fn_CalculateAge(p.date_of_birth) BETWEEN 18 AND 34 THEN ''Young Adult (18-34)''
                    WHEN fn_CalculateAge(p.date_of_birth) BETWEEN 35 AND 54 THEN ''Adult (35-54)''
                    WHEN fn_CalculateAge(p.date_of_birth) BETWEEN 55 AND 64 THEN ''Senior (55-64)''
                    ELSE ''Elderly (65+)''
                END,
                p.gender
             ORDER BY age_group, gender';

        OPEN p_result_cursor FOR v_sql
            USING v_from_date, v_to_date, p_department_id;

    ELSIF p_report_type = 'DOCTOR_LOAD' THEN
        -- Doctor workload analysis
        v_sql := '
            SELECT doc.doctor_id,
                   doc.first_name || '' '' || doc.last_name AS doctor_name,
                   doc.specialty,
                   d.department_name,
                   COUNT(a.appointment_id) AS total_appointments,
                   SUM(CASE WHEN a.status = ''COMPLETED'' THEN 1 ELSE 0 END) AS completed,
                   SUM(CASE WHEN a.status = ''CANCELLED'' THEN 1 ELSE 0 END) AS cancelled,
                   SUM(CASE WHEN a.status = ''NO_SHOW'' THEN 1 ELSE 0 END) AS no_shows,
                   ROUND(
                       SUM(CASE WHEN a.status = ''COMPLETED'' THEN 1 ELSE 0 END) * 100.0 /
                       NULLIF(COUNT(a.appointment_id), 0), 1
                   ) AS completion_rate_pct,
                   COUNT(DISTINCT a.patient_id) AS unique_patients
              FROM doctors doc
              LEFT JOIN departments d   ON d.department_id = doc.department_id
              LEFT JOIN appointments a  ON a.doctor_id = doc.doctor_id
                   AND a.appointment_date BETWEEN :from_date AND :to_date
             WHERE doc.is_active = ''Y''';

        IF p_department_id IS NOT NULL THEN
            v_sql := v_sql || ' AND doc.department_id = :dept_id';
        ELSE
            v_sql := v_sql || ' AND (1=1 OR :dept_id IS NULL)';
        END IF;

        v_sql := v_sql || '
             GROUP BY doc.doctor_id, doc.first_name, doc.last_name,
                      doc.specialty, d.department_name
             ORDER BY total_appointments DESC';

        OPEN p_result_cursor FOR v_sql
            USING v_from_date, v_to_date, p_department_id;

    ELSIF p_report_type = 'INSURANCE' THEN
        -- Insurance utilization breakdown
        v_sql := '
            SELECT ip.plan_name,
                   ip.provider_name,
                   ip.plan_type,
                   COUNT(DISTINCT b.patient_id) AS patient_count,
                   COUNT(b.billing_id) AS claim_count,
                   SUM(b.gross_amount) AS total_billed,
                   SUM(b.insurance_covered) AS total_covered,
                   ROUND(
                       SUM(b.insurance_covered) * 100.0 /
                       NULLIF(SUM(b.gross_amount), 0), 1
                   ) AS actual_coverage_pct,
                   ip.coverage_pct AS stated_coverage_pct
              FROM insurance_plans ip
              LEFT JOIN billing b ON b.insurance_plan_id = ip.plan_id
                   AND b.billing_date BETWEEN :from_date AND :to_date
             WHERE ip.is_active = ''Y''
               AND (1=1 OR :dept_id IS NULL)
             GROUP BY ip.plan_name, ip.provider_name, ip.plan_type,
                      ip.coverage_pct
             ORDER BY total_covered DESC NULLS LAST';

        OPEN p_result_cursor FOR v_sql
            USING v_from_date, v_to_date, p_department_id;

    ELSIF p_report_type = 'DIAGNOSIS' THEN
        -- Top diagnosis codes
        v_sql := '
            SELECT mr.diagnosis_code,
                   mr.diagnosis_desc,
                   COUNT(*) AS occurrence_count,
                   COUNT(DISTINCT mr.patient_id) AS affected_patients,
                   COUNT(DISTINCT mr.doctor_id) AS treating_doctors,
                   MIN(mr.record_date) AS first_seen,
                   MAX(mr.record_date) AS last_seen
              FROM medical_records mr
             WHERE mr.diagnosis_code IS NOT NULL
               AND mr.record_date BETWEEN :from_date AND :to_date';

        IF p_department_id IS NOT NULL THEN
            v_sql := v_sql || '
               AND mr.doctor_id IN (
                   SELECT doctor_id FROM doctors WHERE department_id = :dept_id
               )';
        ELSE
            v_sql := v_sql || ' AND (1=1 OR :dept_id IS NULL)';
        END IF;

        v_sql := v_sql || '
             GROUP BY mr.diagnosis_code, mr.diagnosis_desc
             ORDER BY occurrence_count DESC
             FETCH FIRST 50 ROWS ONLY';

        OPEN p_result_cursor FOR v_sql
            USING v_from_date, v_to_date, p_department_id;

    ELSE
        RAISE_APPLICATION_ERROR(-20500,
            'Unknown report type: ' || p_report_type ||
            '. Valid types: REVENUE, PATIENT_DEMO, DOCTOR_LOAD, INSURANCE, DIAGNOSIS');
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        IF p_result_cursor%ISOPEN THEN
            CLOSE p_result_cursor;
        END IF;
        IF SQLCODE BETWEEN -20999 AND -20000 THEN
            RAISE;
        END IF;
        RAISE_APPLICATION_ERROR(-20599,
            'Error generating report: ' || SQLERRM);
END sp_GenerateReport;
/

-- =============================================
-- 11. PROCEDURE: sp_DischargePatient
--     Marks a patient inactive and handles
--     cascading status changes.
-- =============================================

CREATE OR REPLACE PROCEDURE sp_DischargePatient(
    p_patient_id    IN  NUMBER,
    p_reason        IN  VARCHAR2 DEFAULT 'VOLUNTARY'
)
IS
    -- --------------------------------------------------
    -- sp_DischargePatient
    -- Deactivates a patient and manages related records:
    --   1) Cancels all future appointments
    --   2) Expires active prescriptions
    --   3) Marks patient as inactive
    --   4) Logs discharge event to audit trail
    -- Cross-references: patients, appointments,
    --   prescriptions, audit_log
    -- --------------------------------------------------
    v_patient_exists    CHAR(1);
    v_cancelled_appts   NUMBER := 0;
    v_expired_rx        NUMBER := 0;
    v_audit_id          NUMBER;
BEGIN
    -- Verify patient exists
    BEGIN
        SELECT is_active INTO v_patient_exists
          FROM patients
         WHERE patient_id = p_patient_id;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE_APPLICATION_ERROR(-20600,
                'Patient ' || p_patient_id || ' does not exist');
    END;

    IF v_patient_exists = 'N' THEN
        RAISE_APPLICATION_ERROR(-20601,
            'Patient ' || p_patient_id || ' is already inactive');
    END IF;

    -- Cancel future appointments
    UPDATE appointments
       SET status = 'CANCELLED',
           notes = notes || CHR(10) || '[SYSTEM] Cancelled due to patient discharge: ' || p_reason,
           updated_at = SYSTIMESTAMP
     WHERE patient_id = p_patient_id
       AND status IN ('SCHEDULED','CONFIRMED')
       AND appointment_date >= TRUNC(SYSDATE);

    v_cancelled_appts := SQL%ROWCOUNT;

    -- Expire active prescriptions
    UPDATE prescriptions
       SET status = 'EXPIRED',
           pharmacy_notes = NVL(pharmacy_notes, '') ||
               ' [DISCHARGED ' || TO_CHAR(SYSDATE, 'YYYY-MM-DD') || ']'
     WHERE patient_id = p_patient_id
       AND status = 'ACTIVE';

    v_expired_rx := SQL%ROWCOUNT;

    -- Mark patient inactive (triggers trg_AuditChanges)
    UPDATE patients
       SET is_active = 'N'
     WHERE patient_id = p_patient_id;

    -- Explicit discharge audit entry
    SELECT seq_audit_id.NEXTVAL INTO v_audit_id FROM dual;
    INSERT INTO audit_log (
        audit_id, table_name, record_id, action_type,
        column_name, old_value, new_value,
        changed_by, changed_at
    ) VALUES (
        v_audit_id, 'PATIENTS', p_patient_id, 'UPDATE',
        'DISCHARGE',
        'Active patient',
        'Discharged (' || p_reason || '). Cancelled ' || v_cancelled_appts ||
        ' appointments, expired ' || v_expired_rx || ' prescriptions.',
        USER, SYSTIMESTAMP
    );

    COMMIT;

EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        IF SQLCODE BETWEEN -20999 AND -20000 THEN
            RAISE;
        END IF;
        RAISE_APPLICATION_ERROR(-20699,
            'Unexpected error in sp_DischargePatient: ' || SQLERRM);
END sp_DischargePatient;
/

-- =============================================
-- 12. SEED DATA - Realistic test records
-- =============================================

-- Departments
INSERT INTO departments (department_name, floor_number, phone_ext) VALUES ('General Medicine',   1, '1001');
INSERT INTO departments (department_name, floor_number, phone_ext) VALUES ('Cardiology',         2, '2001');
INSERT INTO departments (department_name, floor_number, phone_ext) VALUES ('Orthopedics',        2, '2002');
INSERT INTO departments (department_name, floor_number, phone_ext) VALUES ('Pediatrics',         3, '3001');
INSERT INTO departments (department_name, floor_number, phone_ext) VALUES ('Neurology',          4, '4001');
INSERT INTO departments (department_name, floor_number, phone_ext) VALUES ('Oncology',           4, '4002');
INSERT INTO departments (department_name, floor_number, phone_ext) VALUES ('Emergency',          1, '9911');

COMMIT;

-- Insurance Plans
INSERT INTO insurance_plans (plan_name, provider_name, plan_type, coverage_pct, max_annual, effective_from, effective_to)
VALUES ('BlueCross Standard',   'BlueCross BlueShield', 'PPO',      80.00, 100000.00, DATE '2024-01-01', NULL);
INSERT INTO insurance_plans (plan_name, provider_name, plan_type, coverage_pct, max_annual, effective_from, effective_to)
VALUES ('Aetna Premium',        'Aetna',                'HMO',      90.00, 250000.00, DATE '2024-01-01', NULL);
INSERT INTO insurance_plans (plan_name, provider_name, plan_type, coverage_pct, max_annual, effective_from, effective_to)
VALUES ('UnitedHealth Basic',   'UnitedHealth Group',   'EPO',      70.00,  50000.00, DATE '2024-01-01', NULL);
INSERT INTO insurance_plans (plan_name, provider_name, plan_type, coverage_pct, max_annual, effective_from, effective_to)
VALUES ('Cigna Choice',         'Cigna',                'POS',      85.00, 150000.00, DATE '2024-06-01', NULL);
INSERT INTO insurance_plans (plan_name, provider_name, plan_type, coverage_pct, max_annual, effective_from, effective_to)
VALUES ('Medicare Part A',      'CMS',                  'MEDICARE', 80.00, NULL,       DATE '2023-01-01', NULL);
INSERT INTO insurance_plans (plan_name, provider_name, plan_type, coverage_pct, max_annual, effective_from, effective_to)
VALUES ('State Medicaid',       'State HHS',            'MEDICAID', 95.00, NULL,       DATE '2023-01-01', NULL);
INSERT INTO insurance_plans (plan_name, provider_name, plan_type, coverage_pct, max_annual, effective_from, effective_to)
VALUES ('Expired Plan Legacy',  'Legacy Health',        'PPO',      75.00,  75000.00, DATE '2020-01-01', DATE '2023-12-31');

COMMIT;

-- Doctors
INSERT INTO doctors (doctor_id, first_name, last_name, specialty, license_number, department_id, email, phone, hire_date)
VALUES (seq_doctor_id.NEXTVAL, 'Sarah',   'Mitchell',  'Internal Medicine',   'MD-2018-4412', 1, 'smitchell@clinic.org',  '555-0101', DATE '2018-03-15');
INSERT INTO doctors (doctor_id, first_name, last_name, specialty, license_number, department_id, email, phone, hire_date)
VALUES (seq_doctor_id.NEXTVAL, 'James',   'Chen',      'Cardiology',          'MD-2015-3301', 2, 'jchen@clinic.org',      '555-0102', DATE '2015-07-01');
INSERT INTO doctors (doctor_id, first_name, last_name, specialty, license_number, department_id, email, phone, hire_date)
VALUES (seq_doctor_id.NEXTVAL, 'Maria',   'Rodriguez', 'Orthopedic Surgery',  'MD-2019-5567', 3, 'mrodriguez@clinic.org', '555-0103', DATE '2019-11-01');
INSERT INTO doctors (doctor_id, first_name, last_name, specialty, license_number, department_id, email, phone, hire_date)
VALUES (seq_doctor_id.NEXTVAL, 'David',   'Okafor',    'Pediatrics',          'MD-2020-6678', 4, 'dokafor@clinic.org',    '555-0104', DATE '2020-01-15');
INSERT INTO doctors (doctor_id, first_name, last_name, specialty, license_number, department_id, email, phone, hire_date)
VALUES (seq_doctor_id.NEXTVAL, 'Emily',   'Park',      'Neurology',           'MD-2017-4489', 5, 'epark@clinic.org',      '555-0105', DATE '2017-06-01');
INSERT INTO doctors (doctor_id, first_name, last_name, specialty, license_number, department_id, email, phone, hire_date)
VALUES (seq_doctor_id.NEXTVAL, 'Robert',  'Singh',     'Oncology',            'MD-2014-2234', 6, 'rsingh@clinic.org',     '555-0106', DATE '2014-09-01');
INSERT INTO doctors (doctor_id, first_name, last_name, specialty, license_number, department_id, email, phone, hire_date)
VALUES (seq_doctor_id.NEXTVAL, 'Lisa',    'Thompson',  'Emergency Medicine',  'MD-2016-3890', 7, 'lthompson@clinic.org',  '555-0107', DATE '2016-02-01');
INSERT INTO doctors (doctor_id, first_name, last_name, specialty, license_number, department_id, email, phone, hire_date)
VALUES (seq_doctor_id.NEXTVAL, 'Michael', 'Reeves',    'Cardiology',          'MD-2021-7712', 2, 'mreeves@clinic.org',    '555-0108', DATE '2021-08-15');

COMMIT;

-- Patients (using direct inserts for seed data)
INSERT INTO patients (patient_id, first_name, last_name, date_of_birth, gender, ssn, email, phone,
    address_line1, city, state_code, zip_code, insurance_plan_id, policy_number,
    emergency_contact_name, emergency_contact_phone, registration_date)
VALUES (seq_patient_id.NEXTVAL, 'John',      'Williams',    DATE '1985-06-15', 'M', '123-45-6789', 'jwilliams@email.com',   '555-1001',
    '123 Oak Street',    'Springfield', 'IL', '62701', 1, 'BC-2024-001001',
    'Mary Williams',    '555-1002', DATE '2024-01-10');

INSERT INTO patients (patient_id, first_name, last_name, date_of_birth, gender, ssn, email, phone,
    address_line1, city, state_code, zip_code, insurance_plan_id, policy_number,
    emergency_contact_name, emergency_contact_phone, registration_date)
VALUES (seq_patient_id.NEXTVAL, 'Maria',     'Garcia',      DATE '1992-03-22', 'F', '234-56-7890', 'mgarcia@email.com',     '555-1003',
    '456 Maple Avenue',  'Portland',    'OR', '97201', 2, 'AE-2024-002001',
    'Carlos Garcia',    '555-1004', DATE '2024-02-14');

INSERT INTO patients (patient_id, first_name, last_name, date_of_birth, gender, ssn, email, phone,
    address_line1, city, state_code, zip_code, insurance_plan_id, policy_number,
    emergency_contact_name, emergency_contact_phone, registration_date)
VALUES (seq_patient_id.NEXTVAL, 'Robert',    'Johnson',     DATE '1958-11-03', 'M', '345-67-8901', 'rjohnson@email.com',    '555-1005',
    '789 Elm Drive',     'Austin',      'TX', '73301', 5, 'MC-2023-003001',
    'Linda Johnson',    '555-1006', DATE '2023-06-20');

INSERT INTO patients (patient_id, first_name, last_name, date_of_birth, gender, ssn, email, phone,
    address_line1, city, state_code, zip_code, insurance_plan_id, policy_number,
    emergency_contact_name, emergency_contact_phone, registration_date)
VALUES (seq_patient_id.NEXTVAL, 'Aisha',     'Patel',       DATE '2018-08-30', 'F', '456-78-9012', 'apatel.parent@email.com','555-1007',
    '101 Pine Lane',     'Denver',      'CO', '80201', 4, 'CG-2024-004001',
    'Raj Patel',        '555-1008', DATE '2024-03-01');

INSERT INTO patients (patient_id, first_name, last_name, date_of_birth, gender, ssn, email, phone,
    address_line1, city, state_code, zip_code, insurance_plan_id, policy_number,
    emergency_contact_name, emergency_contact_phone, registration_date)
VALUES (seq_patient_id.NEXTVAL, 'Thomas',    'Anderson',    DATE '1975-01-12', 'M', '567-89-0123', 'tanderson@email.com',   '555-1009',
    '222 Cedar Court',   'Chicago',     'IL', '60601', 1, 'BC-2024-005001',
    'Susan Anderson',   '555-1010', DATE '2024-01-25');

INSERT INTO patients (patient_id, first_name, last_name, date_of_birth, gender, ssn, email, phone,
    address_line1, city, state_code, zip_code, insurance_plan_id, policy_number,
    emergency_contact_name, emergency_contact_phone, registration_date)
VALUES (seq_patient_id.NEXTVAL, 'Elizabeth', 'Kim',         DATE '1945-04-18', 'F', '678-90-1234', 'ekim@email.com',        '555-1011',
    '333 Birch Road',    'Seattle',     'WA', '98101', 5, 'MC-2023-006001',
    'Daniel Kim',       '555-1012', DATE '2023-08-15');

INSERT INTO patients (patient_id, first_name, last_name, date_of_birth, gender, ssn, email, phone,
    address_line1, city, state_code, zip_code, insurance_plan_id, policy_number,
    emergency_contact_name, emergency_contact_phone, registration_date)
VALUES (seq_patient_id.NEXTVAL, 'Carlos',    'Mendez',      DATE '2001-12-05', 'M', '789-01-2345', 'cmendez@email.com',     '555-1013',
    '444 Walnut Street', 'Miami',       'FL', '33101', 6, 'MD-2023-007001',
    'Rosa Mendez',      '555-1014', DATE '2024-04-10');

INSERT INTO patients (patient_id, first_name, last_name, date_of_birth, gender, ssn, email, phone,
    address_line1, city, state_code, zip_code, insurance_plan_id, policy_number,
    emergency_contact_name, emergency_contact_phone, registration_date)
VALUES (seq_patient_id.NEXTVAL, 'Jennifer',  'Osei',        DATE '1988-07-20', 'F', '890-12-3456', 'josei@email.com',       '555-1015',
    '555 Spruce Avenue', 'Atlanta',     'GA', '30301', 3, 'UH-2024-008001',
    'Kwame Osei',       '555-1016', DATE '2024-05-01');

INSERT INTO patients (patient_id, first_name, last_name, date_of_birth, gender, ssn, email, phone,
    address_line1, city, state_code, zip_code, insurance_plan_id, policy_number,
    emergency_contact_name, emergency_contact_phone, registration_date)
VALUES (seq_patient_id.NEXTVAL, 'William',   'Nakamura',    DATE '1970-09-08', 'M', '901-23-4567', 'wnakamura@email.com',   '555-1017',
    '666 Ash Boulevard', 'San Jose',    'CA', '95101', NULL, NULL,
    'Yuki Nakamura',    '555-1018', DATE '2025-01-15');

INSERT INTO patients (patient_id, first_name, last_name, date_of_birth, gender, ssn, email, phone,
    address_line1, city, state_code, zip_code, insurance_plan_id, policy_number,
    emergency_contact_name, emergency_contact_phone, registration_date)
VALUES (seq_patient_id.NEXTVAL, 'Sofia',     'Petrov',      DATE '1995-05-25', 'F', '012-34-5678', 'spetrov@email.com',     '555-1019',
    '777 Magnolia Way',  'Boston',      'MA', '02101', 2, 'AE-2024-010001',
    'Ivan Petrov',      '555-1020', DATE '2025-02-20');

COMMIT;

-- Appointments (past, completed, for billing and records)
INSERT INTO appointments (appointment_id, patient_id, doctor_id, appointment_date, start_time, end_time, visit_type, status, reason, created_at)
VALUES (seq_appointment_id.NEXTVAL, 1000, 2000, DATE '2025-06-10',
    TIMESTAMP '2025-06-10 09:00:00', TIMESTAMP '2025-06-10 09:30:00',
    'CHECKUP', 'COMPLETED', 'Annual physical exam', SYSTIMESTAMP);

INSERT INTO appointments (appointment_id, patient_id, doctor_id, appointment_date, start_time, end_time, visit_type, status, reason, created_at)
VALUES (seq_appointment_id.NEXTVAL, 1001, 2001, DATE '2025-07-15',
    TIMESTAMP '2025-07-15 10:00:00', TIMESTAMP '2025-07-15 10:45:00',
    'CONSULTATION', 'COMPLETED', 'Heart palpitations evaluation', SYSTIMESTAMP);

INSERT INTO appointments (appointment_id, patient_id, doctor_id, appointment_date, start_time, end_time, visit_type, status, reason, created_at)
VALUES (seq_appointment_id.NEXTVAL, 1002, 2000, DATE '2025-08-20',
    TIMESTAMP '2025-08-20 14:00:00', TIMESTAMP '2025-08-20 14:30:00',
    'FOLLOW_UP', 'COMPLETED', 'Blood pressure follow-up', SYSTIMESTAMP);

INSERT INTO appointments (appointment_id, patient_id, doctor_id, appointment_date, start_time, end_time, visit_type, status, reason, created_at)
VALUES (seq_appointment_id.NEXTVAL, 1003, 2003, DATE '2025-09-05',
    TIMESTAMP '2025-09-05 11:00:00', TIMESTAMP '2025-09-05 11:30:00',
    'CHECKUP', 'COMPLETED', 'Well-child visit', SYSTIMESTAMP);

INSERT INTO appointments (appointment_id, patient_id, doctor_id, appointment_date, start_time, end_time, visit_type, status, reason, created_at)
VALUES (seq_appointment_id.NEXTVAL, 1004, 2002, DATE '2025-10-12',
    TIMESTAMP '2025-10-12 08:30:00', TIMESTAMP '2025-10-12 09:15:00',
    'PROCEDURE', 'COMPLETED', 'Knee X-ray and evaluation', SYSTIMESTAMP);

INSERT INTO appointments (appointment_id, patient_id, doctor_id, appointment_date, start_time, end_time, visit_type, status, reason, created_at)
VALUES (seq_appointment_id.NEXTVAL, 1005, 2005, DATE '2025-11-01',
    TIMESTAMP '2025-11-01 13:00:00', TIMESTAMP '2025-11-01 14:00:00',
    'CONSULTATION', 'COMPLETED', 'Oncology screening', SYSTIMESTAMP);

INSERT INTO appointments (appointment_id, patient_id, doctor_id, appointment_date, start_time, end_time, visit_type, status, reason, created_at)
VALUES (seq_appointment_id.NEXTVAL, 1000, 2001, DATE '2025-12-03',
    TIMESTAMP '2025-12-03 10:00:00', TIMESTAMP '2025-12-03 10:30:00',
    'FOLLOW_UP', 'COMPLETED', 'Cardiac follow-up', SYSTIMESTAMP);

INSERT INTO appointments (appointment_id, patient_id, doctor_id, appointment_date, start_time, end_time, visit_type, status, reason, created_at)
VALUES (seq_appointment_id.NEXTVAL, 1006, 2006, DATE '2025-12-15',
    TIMESTAMP '2025-12-15 15:00:00', TIMESTAMP '2025-12-15 15:30:00',
    'EMERGENCY', 'COMPLETED', 'Acute abdominal pain', SYSTIMESTAMP);

INSERT INTO appointments (appointment_id, patient_id, doctor_id, appointment_date, start_time, end_time, visit_type, status, reason, created_at)
VALUES (seq_appointment_id.NEXTVAL, 1007, 2000, DATE '2026-01-20',
    TIMESTAMP '2026-01-20 09:30:00', TIMESTAMP '2026-01-20 10:00:00',
    'CHECKUP', 'COMPLETED', 'New patient intake', SYSTIMESTAMP);

INSERT INTO appointments (appointment_id, patient_id, doctor_id, appointment_date, start_time, end_time, visit_type, status, reason, created_at)
VALUES (seq_appointment_id.NEXTVAL, 1001, 2004, DATE '2026-02-10',
    TIMESTAMP '2026-02-10 11:00:00', TIMESTAMP '2026-02-10 11:45:00',
    'CONSULTATION', 'COMPLETED', 'Migraine evaluation', SYSTIMESTAMP);

INSERT INTO appointments (appointment_id, patient_id, doctor_id, appointment_date, start_time, end_time, visit_type, status, reason, created_at)
VALUES (seq_appointment_id.NEXTVAL, 1008, 2000, DATE '2026-03-05',
    TIMESTAMP '2026-03-05 14:00:00', TIMESTAMP '2026-03-05 14:30:00',
    'CHECKUP', 'COMPLETED', 'Routine physical', SYSTIMESTAMP);

INSERT INTO appointments (appointment_id, patient_id, doctor_id, appointment_date, start_time, end_time, visit_type, status, reason, created_at)
VALUES (seq_appointment_id.NEXTVAL, 1009, 2001, DATE '2026-03-18',
    TIMESTAMP '2026-03-18 10:00:00', TIMESTAMP '2026-03-18 10:30:00',
    'CONSULTATION', 'COMPLETED', 'Chest pain evaluation', SYSTIMESTAMP);

-- A cancelled and a no-show for variety
INSERT INTO appointments (appointment_id, patient_id, doctor_id, appointment_date, start_time, end_time, visit_type, status, reason, created_at)
VALUES (seq_appointment_id.NEXTVAL, 1004, 2002, DATE '2025-11-20',
    TIMESTAMP '2025-11-20 09:00:00', TIMESTAMP '2025-11-20 09:30:00',
    'FOLLOW_UP', 'CANCELLED', 'Knee follow-up (patient cancelled)', SYSTIMESTAMP);

INSERT INTO appointments (appointment_id, patient_id, doctor_id, appointment_date, start_time, end_time, visit_type, status, reason, created_at)
VALUES (seq_appointment_id.NEXTVAL, 1006, 2000, DATE '2026-01-05',
    TIMESTAMP '2026-01-05 11:00:00', TIMESTAMP '2026-01-05 11:30:00',
    'CHECKUP', 'NO_SHOW', 'Annual checkup', SYSTIMESTAMP);

-- Future scheduled appointments
INSERT INTO appointments (appointment_id, patient_id, doctor_id, appointment_date, start_time, end_time, visit_type, status, reason, created_at)
VALUES (seq_appointment_id.NEXTVAL, 1000, 2000, DATE '2026-05-15',
    TIMESTAMP '2026-05-15 09:00:00', TIMESTAMP '2026-05-15 09:30:00',
    'FOLLOW_UP', 'SCHEDULED', 'Semi-annual follow-up', SYSTIMESTAMP);

INSERT INTO appointments (appointment_id, patient_id, doctor_id, appointment_date, start_time, end_time, visit_type, status, reason, created_at)
VALUES (seq_appointment_id.NEXTVAL, 1002, 2001, DATE '2026-05-20',
    TIMESTAMP '2026-05-20 14:00:00', TIMESTAMP '2026-05-20 14:45:00',
    'CONSULTATION', 'CONFIRMED', 'Cardiology referral', SYSTIMESTAMP);

COMMIT;

-- Medical Records
INSERT INTO medical_records (record_id, patient_id, doctor_id, appointment_id, record_date, diagnosis_code, diagnosis_desc, treatment_plan, vitals_bp, vitals_hr, vitals_temp, vitals_weight, notes)
VALUES (seq_record_id.NEXTVAL, 1000, 2000, 3000, DATE '2025-06-10', 'Z00.00', 'Encounter for general adult medical examination',
    'Continue current medications. Follow up in 6 months. Recommend cholesterol screening.',
    '120/80', 72, 98.6, 185.0, 'Patient in good general health. BMI slightly elevated.');

INSERT INTO medical_records (record_id, patient_id, doctor_id, appointment_id, record_date, diagnosis_code, diagnosis_desc, treatment_plan, vitals_bp, vitals_hr, vitals_temp, vitals_weight, notes)
VALUES (seq_record_id.NEXTVAL, 1001, 2001, 3001, DATE '2025-07-15', 'R00.2', 'Palpitations',
    'ECG ordered - results normal sinus rhythm. Recommend Holter monitor for 48hr. Reduce caffeine intake.',
    '118/75', 88, 98.4, 140.0, 'Patient reports intermittent palpitations for 2 weeks. No syncope. No family history of arrhythmia.');

INSERT INTO medical_records (record_id, patient_id, doctor_id, appointment_id, record_date, diagnosis_code, diagnosis_desc, treatment_plan, vitals_bp, vitals_hr, vitals_temp, vitals_weight, notes)
VALUES (seq_record_id.NEXTVAL, 1002, 2000, 3002, DATE '2025-08-20', 'I10', 'Essential hypertension',
    'Increase Lisinopril to 20mg daily. Low sodium diet counseling provided. Recheck BP in 4 weeks.',
    '148/92', 78, 98.5, 210.0, 'BP still elevated despite 10mg Lisinopril. No end-organ damage. Compliant with medication.');

INSERT INTO medical_records (record_id, patient_id, doctor_id, appointment_id, record_date, diagnosis_code, diagnosis_desc, treatment_plan, vitals_bp, vitals_hr, vitals_temp, vitals_weight, notes)
VALUES (seq_record_id.NEXTVAL, 1003, 2003, 3003, DATE '2025-09-05', 'Z00.129', 'Encounter for routine child health examination',
    'Growth and development on track. Immunizations up to date. Next well-child visit at age 8.',
    '95/60', 90, 98.3, 52.0, 'Height 48 inches (75th percentile). Weight 52 lbs (60th percentile). Vision and hearing normal.');

INSERT INTO medical_records (record_id, patient_id, doctor_id, appointment_id, record_date, diagnosis_code, diagnosis_desc, treatment_plan, vitals_bp, vitals_hr, vitals_temp, vitals_weight, notes)
VALUES (seq_record_id.NEXTVAL, 1004, 2002, 3004, DATE '2025-10-12', 'M17.11', 'Primary osteoarthritis, right knee',
    'X-ray shows moderate joint space narrowing. Start physical therapy 2x/week. Prescribed Meloxicam 15mg daily. Consider cortisone injection if no improvement in 6 weeks.',
    '130/85', 68, 98.6, 195.0, 'Right knee pain worsening over 3 months. Crepitus on examination. Range of motion limited.');

INSERT INTO medical_records (record_id, patient_id, doctor_id, appointment_id, record_date, diagnosis_code, diagnosis_desc, treatment_plan, vitals_bp, vitals_hr, vitals_temp, vitals_weight, notes, is_confidential)
VALUES (seq_record_id.NEXTVAL, 1005, 2005, 3005, DATE '2025-11-01', 'Z12.31', 'Encounter for screening mammogram',
    'Screening mammogram ordered. Breast self-exam education provided. Follow-up with results in 1 week.',
    '125/78', 74, 98.4, 155.0, 'Annual oncology screening. No palpable masses. Family history of breast cancer (mother, age 62).', 'Y');

INSERT INTO medical_records (record_id, patient_id, doctor_id, appointment_id, record_date, diagnosis_code, diagnosis_desc, treatment_plan, vitals_bp, vitals_hr, vitals_temp, vitals_weight, notes)
VALUES (seq_record_id.NEXTVAL, 1000, 2001, 3006, DATE '2025-12-03', 'Z09', 'Encounter for follow-up after completed treatment',
    'Holter results: normal. No significant arrhythmia detected. Palpitations likely benign. Discharge from cardiology.',
    '122/78', 70, 98.6, 183.0, 'Follow-up on palpitations workup. Patient reports symptoms resolved after reducing caffeine.');

INSERT INTO medical_records (record_id, patient_id, doctor_id, appointment_id, record_date, diagnosis_code, diagnosis_desc, treatment_plan, vitals_bp, vitals_hr, vitals_temp, vitals_weight, notes)
VALUES (seq_record_id.NEXTVAL, 1006, 2006, 3007, DATE '2025-12-15', 'R10.9', 'Unspecified abdominal pain',
    'CT abdomen/pelvis with contrast ordered STAT. IV fluids started. Pain management with Ketorolac. Surgical consult if CT shows appendicitis.',
    '135/88', 98, 99.8, 95.0, 'ER presentation with acute RLQ pain x 6 hours. Rebound tenderness present. WBC elevated at 14.2.');

COMMIT;

-- Prescriptions
INSERT INTO prescriptions (prescription_id, record_id, patient_id, doctor_id, drug_name, dosage, frequency, duration_days, refills_allowed, refills_used, prescribed_date, status)
VALUES (seq_prescription_id.NEXTVAL, 4002, 1002, 2000, 'Lisinopril',      '20mg',  'Once daily',           365, 3, 1, DATE '2025-08-20', 'ACTIVE');

INSERT INTO prescriptions (prescription_id, record_id, patient_id, doctor_id, drug_name, dosage, frequency, duration_days, refills_allowed, refills_used, prescribed_date, status)
VALUES (seq_prescription_id.NEXTVAL, 4004, 1004, 2002, 'Meloxicam',       '15mg',  'Once daily with food', 42,  1, 0, DATE '2025-10-12', 'ACTIVE');

INSERT INTO prescriptions (prescription_id, record_id, patient_id, doctor_id, drug_name, dosage, frequency, duration_days, refills_allowed, refills_used, prescribed_date, status)
VALUES (seq_prescription_id.NEXTVAL, 4007, 1006, 2006, 'Ketorolac',       '30mg',  'Every 6 hours PRN',    5,  0, 0, DATE '2025-12-15', 'COMPLETED');

INSERT INTO prescriptions (prescription_id, record_id, patient_id, doctor_id, drug_name, dosage, frequency, duration_days, refills_allowed, refills_used, prescribed_date, status)
VALUES (seq_prescription_id.NEXTVAL, 4000, 1000, 2000, 'Atorvastatin',    '10mg',  'Once daily at bedtime',365, 3, 2, DATE '2025-06-10', 'ACTIVE');

INSERT INTO prescriptions (prescription_id, record_id, patient_id, doctor_id, drug_name, dosage, frequency, duration_days, refills_allowed, refills_used, prescribed_date, status, pharmacy_notes)
VALUES (seq_prescription_id.NEXTVAL, 4001, 1001, 2001, 'Metoprolol',      '25mg',  'Twice daily',          30,  0, 0, DATE '2025-07-15', 'CANCELLED',
    'Cancelled - Holter monitor showed normal rhythm. Palpitations resolved.');

COMMIT;

-- Billing records
INSERT INTO billing (billing_id, patient_id, appointment_id, insurance_plan_id, billing_date, service_code, service_desc, gross_amount, insurance_covered, patient_copay, discount_amount, payment_status, payment_date, payment_method)
VALUES (seq_billing_id.NEXTVAL, 1000, 3000, 1, DATE '2025-06-10', 'PCP-EXAM-01', 'Annual physical examination',         250.00, 200.00, 50.00, 0, 'PAID',     DATE '2025-06-25', 'CREDIT_CARD');

INSERT INTO billing (billing_id, patient_id, appointment_id, insurance_plan_id, billing_date, service_code, service_desc, gross_amount, insurance_covered, patient_copay, discount_amount, payment_status, payment_date, payment_method)
VALUES (seq_billing_id.NEXTVAL, 1001, 3001, 2, DATE '2025-07-15', 'PCP-CONS-01', 'Cardiology consultation',             350.00, 315.00, 35.00, 0, 'PAID',     DATE '2025-08-01', 'INSURANCE');

INSERT INTO billing (billing_id, patient_id, appointment_id, insurance_plan_id, billing_date, service_code, service_desc, gross_amount, insurance_covered, patient_copay, discount_amount, payment_status, payment_date, payment_method)
VALUES (seq_billing_id.NEXTVAL, 1002, 3002, 5, DATE '2025-08-20', 'PCP-FOLL-01', 'Follow-up visit with lab review',     175.00, 140.00, 35.00, 0, 'PAID',     DATE '2025-09-10', 'CHECK');

INSERT INTO billing (billing_id, patient_id, appointment_id, insurance_plan_id, billing_date, service_code, service_desc, gross_amount, insurance_covered, patient_copay, discount_amount, payment_status, payment_date, payment_method)
VALUES (seq_billing_id.NEXTVAL, 1003, 3003, 4, DATE '2025-09-05', 'PCP-WELL-01', 'Well-child examination',              200.00, 170.00, 30.00, 0, 'PAID',     DATE '2025-09-20', 'CREDIT_CARD');

INSERT INTO billing (billing_id, patient_id, appointment_id, insurance_plan_id, billing_date, service_code, service_desc, gross_amount, insurance_covered, patient_copay, discount_amount, payment_status)
VALUES (seq_billing_id.NEXTVAL, 1004, 3004, 1, DATE '2025-10-12', 'PRV-XRAY-01', 'Knee X-ray and orthopedic evaluation', 450.00, 360.00, 90.00, 0, 'PENDING');

INSERT INTO billing (billing_id, patient_id, appointment_id, insurance_plan_id, billing_date, service_code, service_desc, gross_amount, insurance_covered, patient_copay, discount_amount, payment_status, payment_date, payment_method)
VALUES (seq_billing_id.NEXTVAL, 1005, 3005, 5, DATE '2025-11-01', 'PCP-ONCO-01', 'Oncology screening consultation',     500.00, 400.00, 75.00, 25.00, 'PAID', DATE '2025-11-15', 'INSURANCE');

INSERT INTO billing (billing_id, patient_id, appointment_id, insurance_plan_id, billing_date, service_code, service_desc, gross_amount, insurance_covered, patient_copay, discount_amount, payment_status, payment_date, payment_method)
VALUES (seq_billing_id.NEXTVAL, 1000, 3006, 1, DATE '2025-12-03', 'PCP-CARD-01', 'Cardiology follow-up visit',          200.00, 160.00, 40.00, 0, 'PAID',     DATE '2025-12-18', 'CREDIT_CARD');

INSERT INTO billing (billing_id, patient_id, appointment_id, insurance_plan_id, billing_date, service_code, service_desc, gross_amount, insurance_covered, patient_copay, discount_amount, payment_status, payment_date, payment_method)
VALUES (seq_billing_id.NEXTVAL, 1006, 3007, 6, DATE '2025-12-15', 'ER-VISIT-01', 'Emergency department visit with CT',  1800.00, 1710.00, 90.00, 0, 'PAID',  DATE '2026-01-10', 'INSURANCE');

INSERT INTO billing (billing_id, patient_id, appointment_id, insurance_plan_id, billing_date, service_code, service_desc, gross_amount, insurance_covered, patient_copay, discount_amount, payment_status)
VALUES (seq_billing_id.NEXTVAL, 1007, 3008, 3, DATE '2026-01-20', 'PCP-EXAM-01', 'New patient intake examination',      300.00, 210.00, 90.00, 0, 'PENDING');

INSERT INTO billing (billing_id, patient_id, appointment_id, insurance_plan_id, billing_date, service_code, service_desc, gross_amount, insurance_covered, patient_copay, discount_amount, payment_status, payment_date, payment_method)
VALUES (seq_billing_id.NEXTVAL, 1001, 3009, 2, DATE '2026-02-10', 'PCP-NEUR-01', 'Neurology consultation for migraine', 400.00, 360.00, 40.00, 0, 'PAID',     DATE '2026-02-28', 'CREDIT_CARD');

INSERT INTO billing (billing_id, patient_id, appointment_id, insurance_plan_id, billing_date, service_code, service_desc, gross_amount, insurance_covered, patient_copay, discount_amount, payment_status)
VALUES (seq_billing_id.NEXTVAL, 1008, 3010, NULL, DATE '2026-03-05', 'PCP-EXAM-01', 'Routine physical - self-pay',       250.00, 0, 225.00, 25.00, 'PENDING');

COMMIT;

-- =============================================
-- 13. VERIFICATION QUERIES
-- =============================================

-- Summary of created objects
PROMPT
PROMPT ============================================
PROMPT   SQLAtlas Healthcare Test DB - Summary
PROMPT ============================================
PROMPT

SELECT 'Tables' AS object_type, COUNT(*) AS cnt FROM user_tables
UNION ALL
SELECT 'Indexes', COUNT(*) FROM user_indexes WHERE index_type != 'LOB'
UNION ALL
SELECT 'Sequences', COUNT(*) FROM user_sequences
UNION ALL
SELECT 'Procedures', COUNT(*) FROM user_procedures WHERE object_type = 'PROCEDURE'
UNION ALL
SELECT 'Functions', COUNT(*) FROM user_procedures WHERE object_type = 'FUNCTION'
UNION ALL
SELECT 'Triggers', COUNT(*) FROM user_triggers
ORDER BY 1;

PROMPT
PROMPT -- Row counts per table:

SELECT 'DEPARTMENTS'     AS tbl, COUNT(*) AS rows_count FROM departments     UNION ALL
SELECT 'INSURANCE_PLANS',        COUNT(*)                FROM insurance_plans UNION ALL
SELECT 'DOCTORS',                COUNT(*)                FROM doctors         UNION ALL
SELECT 'PATIENTS',               COUNT(*)                FROM patients        UNION ALL
SELECT 'APPOINTMENTS',           COUNT(*)                FROM appointments    UNION ALL
SELECT 'MEDICAL_RECORDS',        COUNT(*)                FROM medical_records UNION ALL
SELECT 'PRESCRIPTIONS',          COUNT(*)                FROM prescriptions   UNION ALL
SELECT 'BILLING',                COUNT(*)                FROM billing         UNION ALL
SELECT 'AUDIT_LOG',              COUNT(*)                FROM audit_log
ORDER BY 1;

PROMPT
PROMPT -- Stored procedures and functions:

SELECT object_name, object_type, status
  FROM user_objects
 WHERE object_type IN ('PROCEDURE','FUNCTION','TRIGGER')
 ORDER BY object_type, object_name;

PROMPT
PROMPT ============================================
PROMPT   Init complete. Database ready for SQLAtlas.
PROMPT ============================================
PROMPT

EXIT;
