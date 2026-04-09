/*
 * ForensicsTestDB - SQL Server Test Database
 * Purpose: Realistic demo data for SQLAtlas, a database forensics analysis tool
 * Domain:  E-commerce / Fintech platform
 *
 * Schemas:  Orders, Inventory, Banking, Payments, Settlement,
 *           Notifications, Reports, Fraud, Audit, Cards
 *
 * Contains: 30+ tables, 17+ stored procedures with varying cyclomatic complexity,
 *           cross-schema references, transactions, cursors, dynamic SQL, etc.
 *
 * Generated: 2026-04-08
 */

SET QUOTED_IDENTIFIER ON;
GO
SET ANSI_NULLS ON;
GO

-- ============================================================================
-- DATABASE CREATION
-- ============================================================================
USE master;
GO

IF EXISTS (SELECT name FROM sys.databases WHERE name = N'ForensicsTestDB')
BEGIN
    ALTER DATABASE ForensicsTestDB SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE ForensicsTestDB;
END
GO

CREATE DATABASE ForensicsTestDB;
GO

USE ForensicsTestDB;
GO

-- ============================================================================
-- SCHEMA CREATION
-- ============================================================================
CREATE SCHEMA Orders AUTHORIZATION dbo;
GO
CREATE SCHEMA Inventory AUTHORIZATION dbo;
GO
CREATE SCHEMA Banking AUTHORIZATION dbo;
GO
CREATE SCHEMA Payments AUTHORIZATION dbo;
GO
CREATE SCHEMA Settlement AUTHORIZATION dbo;
GO
CREATE SCHEMA Notifications AUTHORIZATION dbo;
GO
CREATE SCHEMA Reports AUTHORIZATION dbo;
GO
CREATE SCHEMA Fraud AUTHORIZATION dbo;
GO
CREATE SCHEMA Audit AUTHORIZATION dbo;
GO
CREATE SCHEMA Cards AUTHORIZATION dbo;
GO

-- ============================================================================
-- AUDIT SCHEMA TABLES (created first - referenced by many SPs)
-- ============================================================================

CREATE TABLE Audit.ActivityLog (
    LogId           BIGINT IDENTITY(1,1) PRIMARY KEY,
    ActivityType    NVARCHAR(50)   NOT NULL,
    SchemaName      NVARCHAR(128)  NULL,
    ObjectName      NVARCHAR(256)  NULL,
    RecordId        BIGINT         NULL,
    OldValue        NVARCHAR(MAX)  NULL,
    NewValue        NVARCHAR(MAX)  NULL,
    PerformedBy     NVARCHAR(128)  NOT NULL DEFAULT SYSTEM_USER,
    PerformedAt     DATETIME2(3)   NOT NULL DEFAULT SYSDATETIME(),
    IPAddress       VARCHAR(45)    NULL,
    SessionId       UNIQUEIDENTIFIER NULL,
    AdditionalData  NVARCHAR(MAX)  NULL  -- JSON payload
);
GO

CREATE NONCLUSTERED INDEX IX_ActivityLog_Type_Date
    ON Audit.ActivityLog (ActivityType, PerformedAt DESC);

CREATE NONCLUSTERED INDEX IX_ActivityLog_RecordId
    ON Audit.ActivityLog (RecordId)
    WHERE RecordId IS NOT NULL;
GO

CREATE TABLE Audit.ErrorLog (
    ErrorLogId    BIGINT IDENTITY(1,1) PRIMARY KEY,
    ErrorNumber   INT            NULL,
    ErrorSeverity INT            NULL,
    ErrorState    INT            NULL,
    ErrorLine     INT            NULL,
    ErrorProc     NVARCHAR(256)  NULL,
    ErrorMessage  NVARCHAR(4000) NULL,
    LoggedAt      DATETIME2(3)   NOT NULL DEFAULT SYSDATETIME(),
    ContextData   NVARCHAR(MAX)  NULL
);
GO

-- ============================================================================
-- CARDS SCHEMA TABLES
-- ============================================================================

CREATE TABLE Cards.CardType (
    CardTypeId   TINYINT       PRIMARY KEY,
    TypeName     NVARCHAR(30)  NOT NULL,  -- Visa, Mastercard, Amex, etc.
    Prefix       VARCHAR(6)    NOT NULL,
    CardLength   TINYINT       NOT NULL DEFAULT 16
);
GO

CREATE TABLE Cards.CustomerCard (
    CardId          BIGINT IDENTITY(1,1) PRIMARY KEY,
    CustomerId      BIGINT         NOT NULL,
    CardTypeId      TINYINT        NOT NULL REFERENCES Cards.CardType(CardTypeId),
    MaskedNumber    VARCHAR(19)    NOT NULL,  -- e.g. ****-****-****-1234
    CardHash        VARBINARY(64)  NOT NULL,  -- SHA-256 of full card number
    ExpiryMonth     TINYINT        NOT NULL,
    ExpiryYear      SMALLINT       NOT NULL,
    IsActive        BIT            NOT NULL DEFAULT 1,
    CreatedAt       DATETIME2(3)   NOT NULL DEFAULT SYSDATETIME(),
    DeactivatedAt   DATETIME2(3)   NULL,
    CONSTRAINT CK_Card_ExpiryMonth CHECK (ExpiryMonth BETWEEN 1 AND 12)
);
GO

CREATE NONCLUSTERED INDEX IX_CustomerCard_Customer
    ON Cards.CustomerCard (CustomerId, IsActive);
GO

-- ============================================================================
-- BANKING SCHEMA TABLES
-- ============================================================================

CREATE TABLE Banking.AccountType (
    AccountTypeId  TINYINT       PRIMARY KEY,
    TypeName       NVARCHAR(50)  NOT NULL,  -- Checking, Savings, Merchant, Escrow
    IsInternal     BIT           NOT NULL DEFAULT 0
);
GO

CREATE TABLE Banking.Account (
    AccountId      BIGINT IDENTITY(1,1) PRIMARY KEY,
    AccountNumber  VARCHAR(20)    NOT NULL UNIQUE,
    AccountTypeId  TINYINT        NOT NULL REFERENCES Banking.AccountType(AccountTypeId),
    CustomerId     BIGINT         NULL,  -- NULL for internal/escrow accounts
    Balance        DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
    Currency       CHAR(3)        NOT NULL DEFAULT 'USD',
    IsActive       BIT            NOT NULL DEFAULT 1,
    OpenedAt       DATETIME2(3)   NOT NULL DEFAULT SYSDATETIME(),
    ClosedAt       DATETIME2(3)   NULL,
    CONSTRAINT CK_Account_Currency CHECK (Currency IN ('USD','EUR','GBP','MXN','BRL'))
);
GO

CREATE TABLE Banking.Transaction (
    TransactionId    BIGINT IDENTITY(1,1) PRIMARY KEY,
    FromAccountId    BIGINT         NULL REFERENCES Banking.Account(AccountId),
    ToAccountId      BIGINT         NULL REFERENCES Banking.Account(AccountId),
    Amount           DECIMAL(18,2)  NOT NULL,
    Currency         CHAR(3)        NOT NULL DEFAULT 'USD',
    TransactionType  VARCHAR(20)    NOT NULL,  -- TRANSFER, DEPOSIT, WITHDRAWAL, FEE
    ReferenceId      NVARCHAR(50)   NULL,       -- external reference
    Status           VARCHAR(15)    NOT NULL DEFAULT 'PENDING',
    CreatedAt        DATETIME2(3)   NOT NULL DEFAULT SYSDATETIME(),
    CompletedAt      DATETIME2(3)   NULL,
    Notes            NVARCHAR(500)  NULL,
    CONSTRAINT CK_Transaction_Amount CHECK (Amount > 0),
    CONSTRAINT CK_Transaction_Status CHECK (Status IN ('PENDING','COMPLETED','FAILED','REVERSED'))
);
GO

CREATE NONCLUSTERED INDEX IX_Transaction_From ON Banking.Transaction (FromAccountId, CreatedAt DESC);
CREATE NONCLUSTERED INDEX IX_Transaction_To   ON Banking.Transaction (ToAccountId,   CreatedAt DESC);
CREATE NONCLUSTERED INDEX IX_Transaction_Ref  ON Banking.Transaction (ReferenceId) WHERE ReferenceId IS NOT NULL;
GO

CREATE TABLE Banking.ReconciliationBatch (
    BatchId       BIGINT IDENTITY(1,1) PRIMARY KEY,
    BatchDate     DATE           NOT NULL,
    Status        VARCHAR(15)    NOT NULL DEFAULT 'PENDING',
    TotalDebits   DECIMAL(18,2)  NULL,
    TotalCredits  DECIMAL(18,2)  NULL,
    Discrepancy   DECIMAL(18,2)  NULL,
    StartedAt     DATETIME2(3)   NULL,
    CompletedAt   DATETIME2(3)   NULL,
    RunBy         NVARCHAR(128)  NULL
);
GO

-- ============================================================================
-- INVENTORY SCHEMA TABLES
-- ============================================================================

CREATE TABLE Inventory.Warehouse (
    WarehouseId   INT IDENTITY(1,1) PRIMARY KEY,
    WarehouseCode VARCHAR(10)   NOT NULL UNIQUE,
    Name          NVARCHAR(100) NOT NULL,
    Region        NVARCHAR(50)  NOT NULL,
    IsActive      BIT           NOT NULL DEFAULT 1
);
GO

CREATE TABLE Inventory.Product (
    ProductId    BIGINT IDENTITY(1,1) PRIMARY KEY,
    SKU          VARCHAR(30)    NOT NULL UNIQUE,
    Name         NVARCHAR(200)  NOT NULL,
    Category     NVARCHAR(100)  NULL,
    UnitPrice    DECIMAL(10,2)  NOT NULL,
    Weight       DECIMAL(8,3)   NULL,
    IsActive     BIT            NOT NULL DEFAULT 1,
    CreatedAt    DATETIME2(3)   NOT NULL DEFAULT SYSDATETIME()
);
GO

CREATE TABLE Inventory.Stock (
    StockId       BIGINT IDENTITY(1,1) PRIMARY KEY,
    ProductId     BIGINT  NOT NULL REFERENCES Inventory.Product(ProductId),
    WarehouseId   INT     NOT NULL REFERENCES Inventory.Warehouse(WarehouseId),
    QuantityOnHand    INT NOT NULL DEFAULT 0,
    QuantityReserved  INT NOT NULL DEFAULT 0,
    ReorderPoint      INT NOT NULL DEFAULT 10,
    LastCountedAt     DATETIME2(3) NULL,
    CONSTRAINT UQ_Stock_Product_Warehouse UNIQUE (ProductId, WarehouseId),
    CONSTRAINT CK_Stock_Qty CHECK (QuantityOnHand >= 0 AND QuantityReserved >= 0)
);
GO

CREATE TABLE Inventory.StockMovement (
    MovementId    BIGINT IDENTITY(1,1) PRIMARY KEY,
    StockId       BIGINT        NOT NULL REFERENCES Inventory.Stock(StockId),
    MovementType  VARCHAR(20)   NOT NULL,  -- RESERVE, RELEASE, ADJUST, SHIP, RECEIVE
    Quantity      INT           NOT NULL,
    ReferenceType VARCHAR(20)   NULL,       -- ORDER, RETURN, MANUAL
    ReferenceId   BIGINT        NULL,
    PerformedBy   NVARCHAR(128) NOT NULL DEFAULT SYSTEM_USER,
    PerformedAt   DATETIME2(3)  NOT NULL DEFAULT SYSDATETIME(),
    Notes         NVARCHAR(500) NULL
);
GO

CREATE NONCLUSTERED INDEX IX_StockMovement_Stock ON Inventory.StockMovement (StockId, PerformedAt DESC);
CREATE NONCLUSTERED INDEX IX_StockMovement_Ref   ON Inventory.StockMovement (ReferenceType, ReferenceId) WHERE ReferenceId IS NOT NULL;
GO

-- ============================================================================
-- ORDERS SCHEMA TABLES
-- ============================================================================

CREATE TABLE Orders.Customer (
    CustomerId    BIGINT IDENTITY(1,1) PRIMARY KEY,
    Email         NVARCHAR(256)  NOT NULL UNIQUE,
    FirstName     NVARCHAR(100)  NOT NULL,
    LastName      NVARCHAR(100)  NOT NULL,
    Phone         VARCHAR(20)    NULL,
    Tier          VARCHAR(10)    NOT NULL DEFAULT 'STANDARD',
    CreatedAt     DATETIME2(3)   NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT CK_Customer_Tier CHECK (Tier IN ('STANDARD','SILVER','GOLD','PLATINUM'))
);
GO

CREATE TABLE Orders.OrderHeader (
    OrderId       BIGINT IDENTITY(1,1) PRIMARY KEY,
    OrderNumber   VARCHAR(20)    NOT NULL UNIQUE,
    CustomerId    BIGINT         NOT NULL REFERENCES Orders.Customer(CustomerId),
    Status        VARCHAR(20)    NOT NULL DEFAULT 'PENDING',
    OrderDate     DATETIME2(3)   NOT NULL DEFAULT SYSDATETIME(),
    ShippingAddr  NVARCHAR(500)  NULL,
    SubTotal      DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
    TaxAmount     DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
    ShippingCost  DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
    TotalAmount   DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
    CancelledAt   DATETIME2(3)   NULL,
    CancelReason  NVARCHAR(500)  NULL,
    CONSTRAINT CK_Order_Status CHECK (
        Status IN ('PENDING','CONFIRMED','PROCESSING','SHIPPED','DELIVERED','CANCELLED','REFUNDED')
    )
);
GO

CREATE NONCLUSTERED INDEX IX_Order_Customer ON Orders.OrderHeader (CustomerId, OrderDate DESC);
CREATE NONCLUSTERED INDEX IX_Order_Status   ON Orders.OrderHeader (Status, OrderDate DESC);
GO

CREATE TABLE Orders.OrderLine (
    OrderLineId   BIGINT IDENTITY(1,1) PRIMARY KEY,
    OrderId       BIGINT         NOT NULL REFERENCES Orders.OrderHeader(OrderId),
    ProductId     BIGINT         NOT NULL REFERENCES Inventory.Product(ProductId),
    Quantity      INT            NOT NULL,
    UnitPrice     DECIMAL(10,2)  NOT NULL,
    Discount      DECIMAL(5,2)   NOT NULL DEFAULT 0.00,
    LineTotal     AS (Quantity * UnitPrice * (1 - Discount / 100)) PERSISTED,
    CONSTRAINT CK_OrderLine_Qty CHECK (Quantity > 0)
);
GO

CREATE NONCLUSTERED INDEX IX_OrderLine_Order   ON Orders.OrderLine (OrderId);
CREATE NONCLUSTERED INDEX IX_OrderLine_Product ON Orders.OrderLine (ProductId);
GO

CREATE TABLE Orders.OrderStatusHistory (
    HistoryId    BIGINT IDENTITY(1,1) PRIMARY KEY,
    OrderId      BIGINT        NOT NULL REFERENCES Orders.OrderHeader(OrderId),
    OldStatus    VARCHAR(20)   NULL,
    NewStatus    VARCHAR(20)   NOT NULL,
    ChangedBy    NVARCHAR(128) NOT NULL DEFAULT SYSTEM_USER,
    ChangedAt    DATETIME2(3)  NOT NULL DEFAULT SYSDATETIME(),
    Notes        NVARCHAR(500) NULL
);
GO

-- ============================================================================
-- PAYMENTS SCHEMA TABLES
-- ============================================================================

CREATE TABLE Payments.PaymentMethod (
    MethodId     TINYINT       PRIMARY KEY,
    MethodName   NVARCHAR(30)  NOT NULL,  -- CARD, BANK_TRANSFER, WALLET, CRYPTO
    IsActive     BIT           NOT NULL DEFAULT 1
);
GO

CREATE TABLE Payments.Payment (
    PaymentId      BIGINT IDENTITY(1,1) PRIMARY KEY,
    OrderId        BIGINT         NOT NULL REFERENCES Orders.OrderHeader(OrderId),
    MethodId       TINYINT        NOT NULL REFERENCES Payments.PaymentMethod(MethodId),
    CardId         BIGINT         NULL REFERENCES Cards.CustomerCard(CardId),
    Amount         DECIMAL(18,2)  NOT NULL,
    Currency       CHAR(3)        NOT NULL DEFAULT 'USD',
    Status         VARCHAR(15)    NOT NULL DEFAULT 'PENDING',
    GatewayRef     VARCHAR(64)    NULL,  -- external payment gateway reference
    AttemptCount   TINYINT        NOT NULL DEFAULT 1,
    CreatedAt      DATETIME2(3)   NOT NULL DEFAULT SYSDATETIME(),
    ProcessedAt    DATETIME2(3)   NULL,
    CONSTRAINT CK_Payment_Status CHECK (Status IN ('PENDING','AUTHORIZED','CAPTURED','FAILED','REFUNDED'))
);
GO

CREATE NONCLUSTERED INDEX IX_Payment_Order ON Payments.Payment (OrderId);
GO

CREATE TABLE Payments.Refund (
    RefundId       BIGINT IDENTITY(1,1) PRIMARY KEY,
    PaymentId      BIGINT         NOT NULL REFERENCES Payments.Payment(PaymentId),
    Amount         DECIMAL(18,2)  NOT NULL,
    Reason         NVARCHAR(500)  NOT NULL,
    Status         VARCHAR(15)    NOT NULL DEFAULT 'PENDING',
    ApprovedBy     NVARCHAR(128)  NULL,
    CreatedAt      DATETIME2(3)   NOT NULL DEFAULT SYSDATETIME(),
    ProcessedAt    DATETIME2(3)   NULL,
    BankingTxnId   BIGINT         NULL REFERENCES Banking.Transaction(TransactionId),
    CONSTRAINT CK_Refund_Status CHECK (Status IN ('PENDING','APPROVED','PROCESSED','REJECTED'))
);
GO

-- ============================================================================
-- SETTLEMENT SCHEMA TABLES
-- ============================================================================

CREATE TABLE Settlement.SettlementBatch (
    BatchId          BIGINT IDENTITY(1,1) PRIMARY KEY,
    BatchDate        DATE           NOT NULL,
    MerchantId       BIGINT         NULL,
    TotalTransactions INT           NOT NULL DEFAULT 0,
    GrossAmount      DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
    FeeAmount        DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
    NetAmount        DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
    Status           VARCHAR(15)    NOT NULL DEFAULT 'PENDING',
    CreatedAt        DATETIME2(3)   NOT NULL DEFAULT SYSDATETIME(),
    SettledAt        DATETIME2(3)   NULL,
    CONSTRAINT CK_Settlement_Status CHECK (Status IN ('PENDING','PROCESSING','SETTLED','FAILED'))
);
GO

CREATE TABLE Settlement.SettlementDetail (
    DetailId      BIGINT IDENTITY(1,1) PRIMARY KEY,
    BatchId       BIGINT         NOT NULL REFERENCES Settlement.SettlementBatch(BatchId),
    PaymentId     BIGINT         NOT NULL REFERENCES Payments.Payment(PaymentId),
    Amount        DECIMAL(18,2)  NOT NULL,
    Fee           DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
    NetAmount     AS (Amount - Fee) PERSISTED
);
GO

-- ============================================================================
-- NOTIFICATIONS SCHEMA TABLES
-- ============================================================================

CREATE TABLE Notifications.NotificationType (
    TypeId      TINYINT       PRIMARY KEY,
    TypeCode    VARCHAR(30)   NOT NULL UNIQUE,
    Template    NVARCHAR(MAX) NOT NULL,
    Channel     VARCHAR(10)   NOT NULL DEFAULT 'EMAIL',
    CONSTRAINT CK_Notif_Channel CHECK (Channel IN ('EMAIL','SMS','PUSH','WEBHOOK'))
);
GO

CREATE TABLE Notifications.NotificationQueue (
    NotificationId  BIGINT IDENTITY(1,1) PRIMARY KEY,
    TypeId          TINYINT        NOT NULL REFERENCES Notifications.NotificationType(TypeId),
    RecipientId     BIGINT         NOT NULL,
    RecipientAddr   NVARCHAR(256)  NOT NULL,  -- email or phone
    Subject         NVARCHAR(200)  NULL,
    Body            NVARCHAR(MAX)  NOT NULL,
    Status          VARCHAR(10)    NOT NULL DEFAULT 'QUEUED',
    Priority        TINYINT        NOT NULL DEFAULT 5,
    ScheduledAt     DATETIME2(3)   NULL,
    SentAt          DATETIME2(3)   NULL,
    RetryCount      TINYINT        NOT NULL DEFAULT 0,
    CreatedAt       DATETIME2(3)   NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT CK_Notif_Status CHECK (Status IN ('QUEUED','SENDING','SENT','FAILED','CANCELLED'))
);
GO

CREATE NONCLUSTERED INDEX IX_NotifQueue_Status ON Notifications.NotificationQueue (Status, Priority, ScheduledAt);
GO

-- ============================================================================
-- REPORTS SCHEMA TABLES
-- ============================================================================

CREATE TABLE Reports.DailySnapshot (
    SnapshotId       BIGINT IDENTITY(1,1) PRIMARY KEY,
    SnapshotDate     DATE           NOT NULL,
    TotalOrders      INT            NOT NULL DEFAULT 0,
    TotalRevenue     DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
    TotalRefunds     DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
    NewCustomers     INT            NOT NULL DEFAULT 0,
    ActiveProducts   INT            NOT NULL DEFAULT 0,
    AvgOrderValue    DECIMAL(10,2)  NULL,
    GeneratedAt      DATETIME2(3)   NOT NULL DEFAULT SYSDATETIME()
);
GO

CREATE UNIQUE INDEX UX_DailySnapshot_Date ON Reports.DailySnapshot (SnapshotDate);
GO

CREATE TABLE Reports.ReportExecution (
    ExecutionId   BIGINT IDENTITY(1,1) PRIMARY KEY,
    ReportName    NVARCHAR(100)  NOT NULL,
    Parameters    NVARCHAR(MAX)  NULL,
    Status        VARCHAR(15)    NOT NULL DEFAULT 'RUNNING',
    RowsAffected  INT            NULL,
    DurationMs    INT            NULL,
    StartedAt     DATETIME2(3)   NOT NULL DEFAULT SYSDATETIME(),
    CompletedAt   DATETIME2(3)   NULL,
    RunBy         NVARCHAR(128)  NOT NULL DEFAULT SYSTEM_USER
);
GO

-- ============================================================================
-- FRAUD SCHEMA TABLES
-- ============================================================================

CREATE TABLE Fraud.RiskRule (
    RuleId        INT IDENTITY(1,1) PRIMARY KEY,
    RuleName      NVARCHAR(100) NOT NULL,
    RuleCategory  VARCHAR(20)   NOT NULL,  -- VELOCITY, AMOUNT, GEO, DEVICE, BEHAVIORAL
    ScoreWeight   DECIMAL(5,2)  NOT NULL DEFAULT 1.00,
    Threshold     DECIMAL(10,2) NULL,
    IsActive      BIT           NOT NULL DEFAULT 1,
    Description   NVARCHAR(500) NULL
);
GO

CREATE TABLE Fraud.TransactionScore (
    ScoreId         BIGINT IDENTITY(1,1) PRIMARY KEY,
    PaymentId       BIGINT         NOT NULL REFERENCES Payments.Payment(PaymentId),
    TotalScore      DECIMAL(5,2)   NOT NULL,
    RiskLevel       VARCHAR(10)    NOT NULL,  -- LOW, MEDIUM, HIGH, CRITICAL
    TriggeredRules  NVARCHAR(MAX)  NULL,       -- JSON array of rule IDs
    ReviewRequired  BIT            NOT NULL DEFAULT 0,
    ReviewedBy      NVARCHAR(128)  NULL,
    ReviewedAt      DATETIME2(3)   NULL,
    Decision        VARCHAR(10)    NULL,        -- APPROVE, DECLINE, HOLD
    EvaluatedAt     DATETIME2(3)   NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT CK_FraudRisk CHECK (RiskLevel IN ('LOW','MEDIUM','HIGH','CRITICAL'))
);
GO

CREATE NONCLUSTERED INDEX IX_FraudScore_Payment ON Fraud.TransactionScore (PaymentId);
CREATE NONCLUSTERED INDEX IX_FraudScore_Risk    ON Fraud.TransactionScore (RiskLevel, EvaluatedAt DESC);
GO

CREATE TABLE Fraud.Watchlist (
    WatchlistId   INT IDENTITY(1,1) PRIMARY KEY,
    EntityType    VARCHAR(20)   NOT NULL,  -- CARD_HASH, EMAIL, IP, DEVICE_ID
    EntityValue   NVARCHAR(256) NOT NULL,
    Reason        NVARCHAR(500) NOT NULL,
    AddedAt       DATETIME2(3)  NOT NULL DEFAULT SYSDATETIME(),
    ExpiresAt     DATETIME2(3)  NULL,
    AddedBy       NVARCHAR(128) NOT NULL DEFAULT SYSTEM_USER
);
GO

CREATE NONCLUSTERED INDEX IX_Watchlist_Entity ON Fraud.Watchlist (EntityType, EntityValue);
GO


-- ============================================================================
-- REFERENCE / SEED DATA
-- ============================================================================

INSERT INTO Cards.CardType (CardTypeId, TypeName, Prefix, CardLength) VALUES
    (1, 'Visa',       '4',    16),
    (2, 'Mastercard', '5',    16),
    (3, 'Amex',       '37',   15),
    (4, 'Discover',   '6011', 16);

INSERT INTO Banking.AccountType (AccountTypeId, TypeName, IsInternal) VALUES
    (1, 'Checking',  0),
    (2, 'Savings',   0),
    (3, 'Merchant',  0),
    (4, 'Escrow',    1),
    (5, 'Platform',  1);

INSERT INTO Payments.PaymentMethod (MethodId, MethodName) VALUES
    (1, 'CARD'),
    (2, 'BANK_TRANSFER'),
    (3, 'WALLET'),
    (4, 'CRYPTO');

INSERT INTO Notifications.NotificationType (TypeId, TypeCode, Template, Channel) VALUES
    (1, 'ORDER_CONFIRMED',  N'Your order {{OrderNumber}} has been confirmed.',           'EMAIL'),
    (2, 'ORDER_SHIPPED',    N'Your order {{OrderNumber}} has shipped! Track: {{Link}}',  'EMAIL'),
    (3, 'ORDER_CANCELLED',  N'Your order {{OrderNumber}} has been cancelled.',           'EMAIL'),
    (4, 'PAYMENT_RECEIVED', N'We received your payment of {{Amount}} {{Currency}}.',     'EMAIL'),
    (5, 'REFUND_PROCESSED', N'Your refund of {{Amount}} has been processed.',            'EMAIL'),
    (6, 'FRAUD_ALERT',      N'Suspicious activity on payment {{PaymentId}}.',            'SMS'),
    (7, 'SETTLEMENT_DONE',  N'Settlement batch {{BatchId}} completed.',                  'WEBHOOK');

INSERT INTO Fraud.RiskRule (RuleName, RuleCategory, ScoreWeight, Threshold, Description) VALUES
    ('High Amount',        'AMOUNT',     3.00, 5000.00, 'Transaction exceeds $5000'),
    ('Velocity 5min',      'VELOCITY',   2.50, 3,       'More than 3 txns in 5 minutes'),
    ('New Card',           'BEHAVIORAL', 1.50, NULL,     'Card used for the first time'),
    ('Country Mismatch',   'GEO',        4.00, NULL,     'Card country differs from IP country'),
    ('Watchlisted Entity', 'BEHAVIORAL', 5.00, NULL,     'Entity found on watchlist'),
    ('Odd Hours',          'BEHAVIORAL', 1.00, NULL,     'Transaction between 01:00 and 05:00 local'),
    ('Repeated Declines',  'VELOCITY',   3.50, 3,        'More than 3 declines in 24h');

INSERT INTO Inventory.Warehouse (WarehouseCode, Name, Region) VALUES
    ('US-EAST-1', 'East Coast Fulfillment',  'US-East'),
    ('US-WEST-1', 'West Coast Fulfillment',  'US-West'),
    ('EU-CENT-1', 'Frankfurt Warehouse',     'EU-Central');
GO


-- ============================================================================
-- STORED PROCEDURE: Audit.sp_LogActivity
-- Complexity: Low (CC ~3)
-- Purpose:    Generic audit logger used by many other SPs
-- ============================================================================
CREATE OR ALTER PROCEDURE Audit.sp_LogActivity
    @ActivityType   NVARCHAR(50),
    @SchemaName     NVARCHAR(128)   = NULL,
    @ObjectName     NVARCHAR(256)   = NULL,
    @RecordId       BIGINT          = NULL,
    @OldValue       NVARCHAR(MAX)   = NULL,
    @NewValue       NVARCHAR(MAX)   = NULL,
    @PerformedBy    NVARCHAR(128)   = NULL,
    @IPAddress      VARCHAR(45)     = NULL,
    @SessionId      UNIQUEIDENTIFIER = NULL,
    @AdditionalData NVARCHAR(MAX)   = NULL
AS
BEGIN
    /*
     * Generic audit logger.
     * Called from nearly every write-operation SP to maintain an immutable
     * activity trail across the entire platform.
     */
    SET NOCOUNT ON;

    IF @PerformedBy IS NULL
        SET @PerformedBy = SYSTEM_USER;

    INSERT INTO Audit.ActivityLog (
        ActivityType, SchemaName, ObjectName, RecordId,
        OldValue, NewValue, PerformedBy, IPAddress, SessionId, AdditionalData
    )
    VALUES (
        @ActivityType, @SchemaName, @ObjectName, @RecordId,
        @OldValue, @NewValue, @PerformedBy, @IPAddress, @SessionId, @AdditionalData
    );
END;
GO


-- ============================================================================
-- STORED PROCEDURE: Cards.sp_ValidateCard
-- Complexity: Medium (CC ~8)
-- Purpose:    Luhn algorithm check + expiry validation
-- ============================================================================
CREATE OR ALTER PROCEDURE Cards.sp_ValidateCard
    @CardNumber     VARCHAR(19),
    @ExpiryMonth    TINYINT,
    @ExpiryYear     SMALLINT,
    @IsValid        BIT             OUTPUT,
    @ErrorMessage   NVARCHAR(200)   OUTPUT
AS
BEGIN
    /*
     * Card validation procedure.
     * 1. Checks that card number is numeric and correct length.
     * 2. Runs the Luhn algorithm (mod-10 checksum).
     * 3. Validates the expiry date is in the future.
     * 4. Checks that the card prefix matches a known card type.
     *
     * Returns @IsValid = 1 if all checks pass, 0 otherwise.
     * The @ErrorMessage output describes the first failure encountered.
     */
    SET NOCOUNT ON;

    SET @IsValid = 0;
    SET @ErrorMessage = NULL;

    -- Step 1: Basic format validation
    DECLARE @CleanNumber VARCHAR(19) = REPLACE(REPLACE(@CardNumber, '-', ''), ' ', '');
    DECLARE @Len INT = LEN(@CleanNumber);

    IF @CleanNumber LIKE '%[^0-9]%'
    BEGIN
        SET @ErrorMessage = 'Card number contains non-numeric characters.';
        RETURN;
    END

    IF @Len < 13 OR @Len > 19
    BEGIN
        SET @ErrorMessage = 'Card number length is invalid (must be 13-19 digits).';
        RETURN;
    END

    -- Step 2: Luhn algorithm
    DECLARE @Sum INT = 0;
    DECLARE @Alt BIT = 0;
    DECLARE @i INT = @Len;
    DECLARE @Digit INT;
    DECLARE @Doubled INT;

    WHILE @i >= 1
    BEGIN
        SET @Digit = CAST(SUBSTRING(@CleanNumber, @i, 1) AS INT);

        IF @Alt = 1
        BEGIN
            SET @Doubled = @Digit * 2;
            IF @Doubled > 9
                SET @Doubled = @Doubled - 9;
            SET @Sum = @Sum + @Doubled;
        END
        ELSE
        BEGIN
            SET @Sum = @Sum + @Digit;
        END

        SET @Alt = CASE WHEN @Alt = 0 THEN 1 ELSE 0 END;
        SET @i = @i - 1;
    END

    IF (@Sum % 10) <> 0
    BEGIN
        SET @ErrorMessage = 'Card number failed Luhn checksum validation.';
        RETURN;
    END

    -- Step 3: Expiry validation
    IF @ExpiryMonth < 1 OR @ExpiryMonth > 12
    BEGIN
        SET @ErrorMessage = 'Invalid expiry month.';
        RETURN;
    END

    DECLARE @ExpiryDate DATE = DATEFROMPARTS(@ExpiryYear, @ExpiryMonth,
        DAY(EOMONTH(DATEFROMPARTS(@ExpiryYear, @ExpiryMonth, 1))));

    IF @ExpiryDate < CAST(GETDATE() AS DATE)
    BEGIN
        SET @ErrorMessage = 'Card has expired.';
        RETURN;
    END

    -- Step 4: Prefix check against known card types
    IF NOT EXISTS (
        SELECT 1 FROM Cards.CardType
        WHERE LEFT(@CleanNumber, LEN(Prefix)) = Prefix
          AND @Len = CardLength
    )
    BEGIN
        SET @ErrorMessage = 'Card type not recognized or length mismatch.';
        RETURN;
    END

    -- All checks passed
    SET @IsValid = 1;
    SET @ErrorMessage = NULL;
END;
GO


-- ============================================================================
-- STORED PROCEDURE: Banking.sp_TransferFunds
-- Complexity: Medium-High (CC ~10)
-- Purpose:    Atomic fund transfer between two accounts with validation
-- ============================================================================
CREATE OR ALTER PROCEDURE Banking.sp_TransferFunds
    @FromAccountId   BIGINT,
    @ToAccountId     BIGINT,
    @Amount          DECIMAL(18,2),
    @ReferenceId     NVARCHAR(50)    = NULL,
    @Notes           NVARCHAR(500)   = NULL,
    @TransactionId   BIGINT          OUTPUT
AS
BEGIN
    /*
     * Transfers funds between two Banking.Account records atomically.
     *
     * Business rules:
     *   - Both accounts must exist and be active.
     *   - Source account must have sufficient balance.
     *   - Currencies must match (cross-currency not supported here).
     *   - A Banking.Transaction row is created to record the movement.
     *   - The entire operation is wrapped in an explicit transaction
     *     with TRY/CATCH and full rollback on error.
     *   - An audit log entry is written on success.
     */
    SET NOCOUNT ON;

    SET @TransactionId = NULL;

    DECLARE @FromBalance  DECIMAL(18,2);
    DECLARE @FromCurrency CHAR(3);
    DECLARE @ToCurrency   CHAR(3);
    DECLARE @FromActive   BIT;
    DECLARE @ToActive     BIT;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Lock source account first (consistent ordering to prevent deadlocks)
        SELECT @FromBalance  = Balance,
               @FromCurrency = Currency,
               @FromActive   = IsActive
        FROM Banking.Account WITH (UPDLOCK, ROWLOCK)
        WHERE AccountId = @FromAccountId;

        IF @FromActive IS NULL
        BEGIN
            RAISERROR('Source account %I64d does not exist.', 16, 1, @FromAccountId);
        END

        IF @FromActive = 0
        BEGIN
            RAISERROR('Source account %I64d is inactive.', 16, 1, @FromAccountId);
        END

        -- Lock destination account
        SELECT @ToCurrency = Currency,
               @ToActive   = IsActive
        FROM Banking.Account WITH (UPDLOCK, ROWLOCK)
        WHERE AccountId = @ToAccountId;

        IF @ToActive IS NULL
        BEGIN
            RAISERROR('Destination account %I64d does not exist.', 16, 1, @ToAccountId);
        END

        IF @ToActive = 0
        BEGIN
            RAISERROR('Destination account %I64d is inactive.', 16, 1, @ToAccountId);
        END

        -- Currency match
        IF @FromCurrency <> @ToCurrency
        BEGIN
            RAISERROR('Currency mismatch: source is %s, destination is %s.', 16, 1, @FromCurrency, @ToCurrency);
        END

        -- Sufficient funds
        IF @FromBalance < @Amount
        BEGIN
            RAISERROR('Insufficient balance. Available: %s, Requested: %s.', 16, 1, @FromBalance, @Amount);
        END

        -- Debit source
        UPDATE Banking.Account
        SET Balance = Balance - @Amount
        WHERE AccountId = @FromAccountId;

        -- Credit destination
        UPDATE Banking.Account
        SET Balance = Balance + @Amount
        WHERE AccountId = @ToAccountId;

        -- Record transaction
        INSERT INTO Banking.Transaction (
            FromAccountId, ToAccountId, Amount, Currency,
            TransactionType, ReferenceId, Status, CompletedAt, Notes
        )
        VALUES (
            @FromAccountId, @ToAccountId, @Amount, @FromCurrency,
            'TRANSFER', @ReferenceId, 'COMPLETED', SYSDATETIME(), @Notes
        );

        SET @TransactionId = SCOPE_IDENTITY();

        COMMIT TRANSACTION;

        -- Audit (outside the main transaction for performance)
        EXEC Audit.sp_LogActivity
            @ActivityType   = 'FUND_TRANSFER',
            @SchemaName     = 'Banking',
            @ObjectName     = 'Account',
            @RecordId       = @TransactionId,
            @NewValue       = @Amount,
            @AdditionalData = @Notes;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        -- Log the error
        INSERT INTO Audit.ErrorLog (ErrorNumber, ErrorSeverity, ErrorState, ErrorLine, ErrorProc, ErrorMessage, ContextData)
        VALUES (ERROR_NUMBER(), ERROR_SEVERITY(), ERROR_STATE(), ERROR_LINE(), ERROR_PROCEDURE(), ERROR_MESSAGE(),
            CONCAT('FromAccount=', @FromAccountId, ', ToAccount=', @ToAccountId, ', Amount=', @Amount));

        THROW;
    END CATCH
END;
GO


-- ============================================================================
-- STORED PROCEDURE: Banking.sp_ReconcileAccounts
-- Complexity: High (CC ~12)
-- Purpose:    End-of-day reconciliation comparing transactions with balances
-- ============================================================================
CREATE OR ALTER PROCEDURE Banking.sp_ReconcileAccounts
    @BatchDate   DATE = NULL,
    @BatchId     BIGINT OUTPUT
AS
BEGIN
    /*
     * Daily account reconciliation procedure.
     *
     * Compares the sum of all completed transactions for the batch date
     * against the expected running balances. Identifies any discrepancies
     * and records them in Banking.ReconciliationBatch.
     *
     * Steps:
     *   1. Default @BatchDate to yesterday if NULL.
     *   2. Check for existing batch on same date (idempotency guard).
     *   3. Compute total debits and credits from Banking.Transaction.
     *   4. Cross-check against account balances using a temp table.
     *   5. Flag any discrepancies.
     *   6. Record batch results and notify if discrepancies found.
     */
    SET NOCOUNT ON;

    SET @BatchId = NULL;

    IF @BatchDate IS NULL
        SET @BatchDate = DATEADD(DAY, -1, CAST(GETDATE() AS DATE));

    BEGIN TRY
        -- Idempotency: skip if already reconciled
        IF EXISTS (
            SELECT 1 FROM Banking.ReconciliationBatch
            WHERE BatchDate = @BatchDate AND Status = 'COMPLETED'
        )
        BEGIN
            SELECT @BatchId = BatchId
            FROM Banking.ReconciliationBatch
            WHERE BatchDate = @BatchDate AND Status = 'COMPLETED';

            PRINT 'Reconciliation already completed for ' + CONVERT(VARCHAR(10), @BatchDate, 120);
            RETURN;
        END

        -- Create batch record
        INSERT INTO Banking.ReconciliationBatch (BatchDate, Status, StartedAt, RunBy)
        VALUES (@BatchDate, 'PROCESSING', SYSDATETIME(), SYSTEM_USER);

        SET @BatchId = SCOPE_IDENTITY();

        -- Temp table for per-account reconciliation
        CREATE TABLE #AccountRecon (
            AccountId     BIGINT PRIMARY KEY,
            CurrentBalance DECIMAL(18,2),
            ComputedDebits  DECIMAL(18,2) DEFAULT 0,
            ComputedCredits DECIMAL(18,2) DEFAULT 0,
            Discrepancy     DECIMAL(18,2) DEFAULT 0
        );

        -- Load all active accounts
        INSERT INTO #AccountRecon (AccountId, CurrentBalance)
        SELECT AccountId, Balance
        FROM Banking.Account
        WHERE IsActive = 1;

        -- Sum completed debits (outgoing) on the batch date
        UPDATE ar
        SET ar.ComputedDebits = ISNULL(t.TotalOut, 0)
        FROM #AccountRecon ar
        LEFT JOIN (
            SELECT FromAccountId, SUM(Amount) AS TotalOut
            FROM Banking.Transaction
            WHERE Status = 'COMPLETED'
              AND CAST(CompletedAt AS DATE) = @BatchDate
              AND FromAccountId IS NOT NULL
            GROUP BY FromAccountId
        ) t ON t.FromAccountId = ar.AccountId;

        -- Sum completed credits (incoming) on the batch date
        UPDATE ar
        SET ar.ComputedCredits = ISNULL(t.TotalIn, 0)
        FROM #AccountRecon ar
        LEFT JOIN (
            SELECT ToAccountId, SUM(Amount) AS TotalIn
            FROM Banking.Transaction
            WHERE Status = 'COMPLETED'
              AND CAST(CompletedAt AS DATE) = @BatchDate
              AND ToAccountId IS NOT NULL
            GROUP BY ToAccountId
        ) t ON t.ToAccountId = ar.AccountId;

        -- Compute totals
        DECLARE @TotalDebits  DECIMAL(18,2);
        DECLARE @TotalCredits DECIMAL(18,2);
        DECLARE @Discrepancy  DECIMAL(18,2);

        SELECT @TotalDebits  = SUM(ComputedDebits),
               @TotalCredits = SUM(ComputedCredits)
        FROM #AccountRecon;

        SET @Discrepancy = @TotalCredits - @TotalDebits;

        -- Update batch record
        UPDATE Banking.ReconciliationBatch
        SET TotalDebits  = @TotalDebits,
            TotalCredits = @TotalCredits,
            Discrepancy  = @Discrepancy,
            Status       = CASE WHEN ABS(@Discrepancy) < 0.01 THEN 'COMPLETED' ELSE 'COMPLETED' END,
            CompletedAt  = SYSDATETIME()
        WHERE BatchId = @BatchId;

        -- If significant discrepancy, send alert notification
        IF ABS(@Discrepancy) >= 0.01
        BEGIN
            EXEC Notifications.sp_SendNotification
                @TypeCode    = 'SETTLEMENT_DONE',
                @RecipientId = 0,  -- system admin
                @RecipientAddr = 'ops@company.com',
                @Subject     = 'Reconciliation Discrepancy Alert',
                @BodyParams  = @Discrepancy;
        END

        -- Audit log
        EXEC Audit.sp_LogActivity
            @ActivityType = 'RECONCILIATION',
            @SchemaName   = 'Banking',
            @ObjectName   = 'ReconciliationBatch',
            @RecordId     = @BatchId,
            @NewValue     = @Discrepancy;

        DROP TABLE #AccountRecon;
    END TRY
    BEGIN CATCH
        IF OBJECT_ID('tempdb..#AccountRecon') IS NOT NULL
            DROP TABLE #AccountRecon;

        IF @@TRANCOUNT > 0
            ROLLBACK;

        -- Mark batch as failed
        IF @BatchId IS NOT NULL
        BEGIN
            UPDATE Banking.ReconciliationBatch
            SET Status = 'FAILED', CompletedAt = SYSDATETIME()
            WHERE BatchId = @BatchId;
        END

        INSERT INTO Audit.ErrorLog (ErrorNumber, ErrorSeverity, ErrorState, ErrorLine, ErrorProc, ErrorMessage, ContextData)
        VALUES (ERROR_NUMBER(), ERROR_SEVERITY(), ERROR_STATE(), ERROR_LINE(), ERROR_PROCEDURE(), ERROR_MESSAGE(),
            CONCAT('BatchDate=', CONVERT(VARCHAR(10), @BatchDate, 120)));

        THROW;
    END CATCH
END;
GO


-- ============================================================================
-- STORED PROCEDURE: Inventory.sp_ReserveStock
-- Complexity: Medium-High (CC ~10)
-- Purpose:    Reserves stock for an order with deadlock retry logic
-- ============================================================================
CREATE OR ALTER PROCEDURE Inventory.sp_ReserveStock
    @OrderId       BIGINT,
    @ProductId     BIGINT,
    @Quantity      INT,
    @WarehouseId   INT           = NULL,  -- NULL = auto-select best warehouse
    @Success       BIT           OUTPUT,
    @Message       NVARCHAR(200) OUTPUT
AS
BEGIN
    /*
     * Reserves inventory stock for a given order line.
     *
     * If @WarehouseId is NULL, the procedure selects the warehouse with
     * the highest available quantity (on-hand minus reserved).
     *
     * Includes deadlock retry logic: up to 3 retries with a brief wait
     * between attempts, because stock rows are a hotspot during peak hours.
     *
     * On success, writes a StockMovement record and returns @Success = 1.
     */
    SET NOCOUNT ON;

    SET @Success = 0;
    SET @Message = NULL;

    DECLARE @RetryCount   INT = 0;
    DECLARE @MaxRetries   INT = 3;
    DECLARE @StockId      BIGINT;
    DECLARE @Available    INT;

    WHILE @RetryCount < @MaxRetries
    BEGIN
        BEGIN TRY
            BEGIN TRANSACTION;

            -- Auto-select warehouse if not specified
            IF @WarehouseId IS NULL
            BEGIN
                SELECT TOP 1
                    @WarehouseId = s.WarehouseId,
                    @StockId     = s.StockId,
                    @Available   = s.QuantityOnHand - s.QuantityReserved
                FROM Inventory.Stock s WITH (UPDLOCK, ROWLOCK)
                INNER JOIN Inventory.Warehouse w ON w.WarehouseId = s.WarehouseId
                WHERE s.ProductId = @ProductId
                  AND w.IsActive = 1
                  AND (s.QuantityOnHand - s.QuantityReserved) >= @Quantity
                ORDER BY (s.QuantityOnHand - s.QuantityReserved) DESC;
            END
            ELSE
            BEGIN
                SELECT @StockId   = StockId,
                       @Available = QuantityOnHand - QuantityReserved
                FROM Inventory.Stock WITH (UPDLOCK, ROWLOCK)
                WHERE ProductId = @ProductId
                  AND WarehouseId = @WarehouseId;
            END

            IF @StockId IS NULL
            BEGIN
                SET @Message = 'No stock record found for product in any active warehouse.';
                ROLLBACK TRANSACTION;
                RETURN;
            END

            IF @Available < @Quantity
            BEGIN
                SET @Message = CONCAT('Insufficient stock. Available: ', @Available, ', Requested: ', @Quantity);
                ROLLBACK TRANSACTION;
                RETURN;
            END

            -- Reserve the stock
            UPDATE Inventory.Stock
            SET QuantityReserved = QuantityReserved + @Quantity
            WHERE StockId = @StockId;

            -- Log the movement
            INSERT INTO Inventory.StockMovement (StockId, MovementType, Quantity, ReferenceType, ReferenceId, Notes)
            VALUES (@StockId, 'RESERVE', @Quantity, 'ORDER', @OrderId, CONCAT('Reserved for order ', @OrderId));

            COMMIT TRANSACTION;

            SET @Success = 1;
            SET @Message = CONCAT('Reserved ', @Quantity, ' units from warehouse ', @WarehouseId);
            RETURN; -- success, exit retry loop

        END TRY
        BEGIN CATCH
            IF @@TRANCOUNT > 0
                ROLLBACK TRANSACTION;

            -- If deadlock, retry
            IF ERROR_NUMBER() = 1205
            BEGIN
                SET @RetryCount = @RetryCount + 1;
                IF @RetryCount < @MaxRetries
                BEGIN
                    WAITFOR DELAY '00:00:00.200'; -- 200ms backoff
                    CONTINUE;
                END
            END

            -- Non-deadlock error or max retries exceeded
            INSERT INTO Audit.ErrorLog (ErrorNumber, ErrorSeverity, ErrorState, ErrorLine, ErrorProc, ErrorMessage, ContextData)
            VALUES (ERROR_NUMBER(), ERROR_SEVERITY(), ERROR_STATE(), ERROR_LINE(), ERROR_PROCEDURE(), ERROR_MESSAGE(),
                CONCAT('OrderId=', @OrderId, ', ProductId=', @ProductId, ', Attempt=', @RetryCount));

            SET @Message = CONCAT('Stock reservation failed: ', ERROR_MESSAGE());
            RETURN;
        END CATCH
    END
END;
GO


-- ============================================================================
-- STORED PROCEDURE: Inventory.sp_ReleaseStock
-- Complexity: Medium (CC ~8)
-- Purpose:    Releases previously reserved stock using a cursor
-- ============================================================================
CREATE OR ALTER PROCEDURE Inventory.sp_ReleaseStock
    @OrderId   BIGINT
AS
BEGIN
    /*
     * Releases all stock reservations associated with an order.
     *
     * Uses a CURSOR to iterate over each order line and find the corresponding
     * stock reservation. This cursor-based approach is intentional for the
     * forensics demo (showcasing cursor detection), even though a set-based
     * approach would be more efficient.
     *
     * For each line item:
     *   1. Find the StockMovement RESERVE record for this order/product.
     *   2. Reduce QuantityReserved on the Stock row.
     *   3. Insert a RELEASE StockMovement record.
     *   4. Log to audit trail.
     */
    SET NOCOUNT ON;

    DECLARE @LineProductId  BIGINT;
    DECLARE @LineQty        INT;
    DECLARE @StockId        BIGINT;
    DECLARE @LinesReleased  INT = 0;

    DECLARE line_cursor CURSOR LOCAL FAST_FORWARD FOR
        SELECT ol.ProductId, ol.Quantity
        FROM Orders.OrderLine ol
        WHERE ol.OrderId = @OrderId;

    OPEN line_cursor;

    FETCH NEXT FROM line_cursor INTO @LineProductId, @LineQty;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        BEGIN TRY
            -- Find the stock record that was reserved for this order
            SELECT TOP 1 @StockId = sm.StockId
            FROM Inventory.StockMovement sm
            WHERE sm.ReferenceType = 'ORDER'
              AND sm.ReferenceId = @OrderId
              AND sm.MovementType = 'RESERVE'
              AND sm.StockId IN (
                  SELECT StockId FROM Inventory.Stock WHERE ProductId = @LineProductId
              )
            ORDER BY sm.PerformedAt DESC;

            IF @StockId IS NOT NULL
            BEGIN
                -- Release the reserved quantity
                UPDATE Inventory.Stock
                SET QuantityReserved = CASE
                    WHEN QuantityReserved >= @LineQty THEN QuantityReserved - @LineQty
                    ELSE 0
                END
                WHERE StockId = @StockId;

                -- Record the release movement
                INSERT INTO Inventory.StockMovement (StockId, MovementType, Quantity, ReferenceType, ReferenceId, Notes)
                VALUES (@StockId, 'RELEASE', @LineQty, 'ORDER', @OrderId,
                    CONCAT('Released stock for cancelled order ', @OrderId));

                SET @LinesReleased = @LinesReleased + 1;
            END
        END TRY
        BEGIN CATCH
            -- Log but continue processing remaining lines
            INSERT INTO Audit.ErrorLog (ErrorNumber, ErrorSeverity, ErrorState, ErrorLine, ErrorProc, ErrorMessage, ContextData)
            VALUES (ERROR_NUMBER(), ERROR_SEVERITY(), ERROR_STATE(), ERROR_LINE(), ERROR_PROCEDURE(), ERROR_MESSAGE(),
                CONCAT('OrderId=', @OrderId, ', ProductId=', @LineProductId));
        END CATCH

        SET @StockId = NULL;
        FETCH NEXT FROM line_cursor INTO @LineProductId, @LineQty;
    END

    CLOSE line_cursor;
    DEALLOCATE line_cursor;

    -- Audit summary
    EXEC Audit.sp_LogActivity
        @ActivityType = 'STOCK_RELEASE',
        @SchemaName   = 'Inventory',
        @ObjectName   = 'Stock',
        @RecordId     = @OrderId,
        @NewValue     = @LinesReleased,
        @AdditionalData = 'Bulk release for order cancellation';
END;
GO


-- ============================================================================
-- STORED PROCEDURE: Inventory.sp_AdjustInventory
-- Complexity: Low-Medium (CC ~5)
-- Purpose:    Manual inventory adjustment with audit trail
-- ============================================================================
CREATE OR ALTER PROCEDURE Inventory.sp_AdjustInventory
    @ProductId    BIGINT,
    @WarehouseId  INT,
    @Adjustment   INT,           -- positive = add, negative = remove
    @Reason       NVARCHAR(500),
    @AdjustedBy   NVARCHAR(128) = NULL
AS
BEGIN
    /*
     * Adjusts physical inventory count for a product in a specific warehouse.
     *
     * Used for:
     *   - Cycle count corrections
     *   - Damage write-offs
     *   - Receiving new shipments
     *   - Manual corrections
     *
     * Records the old and new quantities in the audit log for traceability.
     */
    SET NOCOUNT ON;

    IF @AdjustedBy IS NULL
        SET @AdjustedBy = SYSTEM_USER;

    DECLARE @StockId    BIGINT;
    DECLARE @OldQty     INT;
    DECLARE @NewQty     INT;

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT @StockId = StockId,
               @OldQty  = QuantityOnHand
        FROM Inventory.Stock WITH (UPDLOCK)
        WHERE ProductId = @ProductId
          AND WarehouseId = @WarehouseId;

        IF @StockId IS NULL
        BEGIN
            RAISERROR('Stock record not found for ProductId=%I64d, WarehouseId=%d.', 16, 1, @ProductId, @WarehouseId);
        END

        SET @NewQty = @OldQty + @Adjustment;

        IF @NewQty < 0
        BEGIN
            RAISERROR('Adjustment would result in negative stock (%d). Current: %d, Adjustment: %d.', 16, 1, @NewQty, @OldQty, @Adjustment);
        END

        UPDATE Inventory.Stock
        SET QuantityOnHand = @NewQty,
            LastCountedAt  = SYSDATETIME()
        WHERE StockId = @StockId;

        INSERT INTO Inventory.StockMovement (StockId, MovementType, Quantity, ReferenceType, PerformedBy, Notes)
        VALUES (@StockId, 'ADJUST', ABS(@Adjustment), 'MANUAL', @AdjustedBy, @Reason);

        COMMIT TRANSACTION;

        -- Audit trail
        EXEC Audit.sp_LogActivity
            @ActivityType = 'INVENTORY_ADJUSTMENT',
            @SchemaName   = 'Inventory',
            @ObjectName   = 'Stock',
            @RecordId     = @StockId,
            @OldValue     = @OldQty,
            @NewValue     = @NewQty,
            @PerformedBy  = @AdjustedBy,
            @AdditionalData = @Reason;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        INSERT INTO Audit.ErrorLog (ErrorNumber, ErrorSeverity, ErrorState, ErrorLine, ErrorProc, ErrorMessage)
        VALUES (ERROR_NUMBER(), ERROR_SEVERITY(), ERROR_STATE(), ERROR_LINE(), ERROR_PROCEDURE(), ERROR_MESSAGE());

        THROW;
    END CATCH
END;
GO


-- ============================================================================
-- STORED PROCEDURE: Notifications.sp_SendNotification
-- Complexity: Medium (CC ~7)
-- Purpose:    Enqueues a notification with dynamic SQL for template rendering
-- ============================================================================
CREATE OR ALTER PROCEDURE Notifications.sp_SendNotification
    @TypeCode       VARCHAR(30),
    @RecipientId    BIGINT,
    @RecipientAddr  NVARCHAR(256),
    @Subject        NVARCHAR(200) = NULL,
    @BodyParams     NVARCHAR(MAX) = NULL,  -- pipe-delimited params or single value
    @Priority       TINYINT       = 5,
    @ScheduledAt    DATETIME2(3)  = NULL
AS
BEGIN
    /*
     * Enqueues a notification into the NotificationQueue table.
     *
     * Looks up the template from NotificationType, performs basic parameter
     * substitution using dynamic SQL (REPLACE on {{placeholders}}), and
     * inserts the rendered notification into the queue.
     *
     * Dynamic SQL is used intentionally here for the forensics demo to
     * showcase dynamic SQL detection capabilities of the analysis tool.
     *
     * Parameters in @BodyParams are pipe-delimited: 'value1|value2|value3'
     * They replace {{Param1}}, {{Param2}}, etc. in order. If only a single
     * value is provided (no pipes), it replaces {{Value}}.
     */
    SET NOCOUNT ON;

    DECLARE @TypeId   TINYINT;
    DECLARE @Template NVARCHAR(MAX);
    DECLARE @Channel  VARCHAR(10);
    DECLARE @Body     NVARCHAR(MAX);

    -- Look up notification type
    SELECT @TypeId   = TypeId,
           @Template = Template,
           @Channel  = Channel
    FROM Notifications.NotificationType
    WHERE TypeCode = @TypeCode;

    IF @TypeId IS NULL
    BEGIN
        RAISERROR('Unknown notification type: %s', 16, 1, @TypeCode);
        RETURN;
    END

    -- Template rendering via dynamic SQL
    SET @Body = @Template;

    IF @BodyParams IS NOT NULL
    BEGIN
        DECLARE @ParamIndex INT = 1;
        DECLARE @Param NVARCHAR(MAX);
        DECLARE @Pos INT;

        -- Check if single value (no pipe delimiter)
        IF CHARINDEX('|', @BodyParams) = 0
        BEGIN
            SET @Body = REPLACE(@Body, '{{Value}}', @BodyParams);
            -- Also try common placeholders
            SET @Body = REPLACE(@Body, '{{Amount}}', @BodyParams);
            SET @Body = REPLACE(@Body, '{{OrderNumber}}', @BodyParams);
            SET @Body = REPLACE(@Body, '{{PaymentId}}', @BodyParams);
            SET @Body = REPLACE(@Body, '{{BatchId}}', @BodyParams);
        END
        ELSE
        BEGIN
            -- Multiple params: split by pipe and replace {{Param1}}, {{Param2}}, ...
            DECLARE @Remaining NVARCHAR(MAX) = @BodyParams;

            WHILE LEN(@Remaining) > 0
            BEGIN
                SET @Pos = CHARINDEX('|', @Remaining);
                IF @Pos = 0
                BEGIN
                    SET @Param = @Remaining;
                    SET @Remaining = '';
                END
                ELSE
                BEGIN
                    SET @Param = LEFT(@Remaining, @Pos - 1);
                    SET @Remaining = SUBSTRING(@Remaining, @Pos + 1, LEN(@Remaining));
                END

                -- Build and execute dynamic replacement
                DECLARE @PlaceholderSQL NVARCHAR(MAX);
                SET @PlaceholderSQL = N'SET @BodyOut = REPLACE(@BodyIn, ''{{Param'
                    + CAST(@ParamIndex AS NVARCHAR(5)) + N'}}'', @ParamVal)';

                EXEC sp_executesql @PlaceholderSQL,
                    N'@BodyIn NVARCHAR(MAX), @ParamVal NVARCHAR(MAX), @BodyOut NVARCHAR(MAX) OUTPUT',
                    @BodyIn = @Body, @ParamVal = @Param, @BodyOut = @Body OUTPUT;

                SET @ParamIndex = @ParamIndex + 1;
            END
        END
    END

    -- Use subject from parameter or generate default
    IF @Subject IS NULL
        SET @Subject = @TypeCode + ' Notification';

    -- Enqueue
    INSERT INTO Notifications.NotificationQueue (
        TypeId, RecipientId, RecipientAddr, Subject, Body,
        Status, Priority, ScheduledAt
    )
    VALUES (
        @TypeId, @RecipientId, @RecipientAddr, @Subject, @Body,
        'QUEUED', @Priority, ISNULL(@ScheduledAt, SYSDATETIME())
    );

    -- Audit
    EXEC Audit.sp_LogActivity
        @ActivityType = 'NOTIFICATION_QUEUED',
        @SchemaName   = 'Notifications',
        @ObjectName   = 'NotificationQueue',
        @RecordId     = @RecipientId,
        @NewValue     = @TypeCode;
END;
GO


-- ============================================================================
-- STORED PROCEDURE: Fraud.sp_CheckTransaction
-- Complexity: High (CC ~15)
-- Purpose:    Risk scoring engine evaluating multiple fraud rules
-- ============================================================================
CREATE OR ALTER PROCEDURE Fraud.sp_CheckTransaction
    @PaymentId      BIGINT,
    @TotalScore     DECIMAL(5,2)  OUTPUT,
    @RiskLevel      VARCHAR(10)   OUTPUT,
    @ShouldBlock    BIT           OUTPUT
AS
BEGIN
    /*
     * Fraud risk scoring engine for a payment transaction.
     *
     * Evaluates the payment against all active fraud rules and computes
     * a weighted risk score. Each rule contributes its ScoreWeight to the
     * total if triggered.
     *
     * Rules evaluated:
     *   1. HIGH AMOUNT - payment exceeds threshold (e.g. $5000)
     *   2. VELOCITY    - multiple transactions in a short window
     *   3. NEW CARD    - card has never been used before
     *   4. WATCHLIST   - card hash or email is on the watchlist
     *   5. ODD HOURS   - transaction at unusual times (01:00-05:00)
     *   6. REPEATED DECLINES - many recent failed attempts
     *
     * Risk level mapping:
     *   0-3.0   = LOW
     *   3.01-7  = MEDIUM
     *   7.01-12 = HIGH
     *   12.01+  = CRITICAL
     *
     * @ShouldBlock = 1 if risk is HIGH or CRITICAL.
     */
    SET NOCOUNT ON;

    SET @TotalScore  = 0;
    SET @RiskLevel   = 'LOW';
    SET @ShouldBlock = 0;

    DECLARE @PaymentAmount  DECIMAL(18,2);
    DECLARE @CardId         BIGINT;
    DECLARE @CustomerId     BIGINT;
    DECLARE @PaymentTime    DATETIME2(3);
    DECLARE @CardHash       VARBINARY(64);
    DECLARE @CustomerEmail  NVARCHAR(256);
    DECLARE @TriggeredRules NVARCHAR(MAX) = '[]';
    DECLARE @RuleList       NVARCHAR(MAX) = '';

    BEGIN TRY
        -- Gather payment context
        SELECT @PaymentAmount = p.Amount,
               @CardId        = p.CardId,
               @PaymentTime   = p.CreatedAt,
               @CustomerId    = oh.CustomerId
        FROM Payments.Payment p
        INNER JOIN Orders.OrderHeader oh ON oh.OrderId = p.OrderId
        WHERE p.PaymentId = @PaymentId;

        IF @PaymentAmount IS NULL
        BEGIN
            RAISERROR('Payment %I64d not found.', 16, 1, @PaymentId);
        END

        -- Get card hash if card payment
        IF @CardId IS NOT NULL
        BEGIN
            SELECT @CardHash = CardHash
            FROM Cards.CustomerCard
            WHERE CardId = @CardId;
        END

        -- Get customer email
        SELECT @CustomerEmail = Email
        FROM Orders.Customer
        WHERE CustomerId = @CustomerId;

        -- ================================================================
        -- RULE 1: High Amount
        -- ================================================================
        DECLARE @AmountThreshold DECIMAL(10,2);
        DECLARE @AmountWeight    DECIMAL(5,2);

        SELECT @AmountThreshold = Threshold, @AmountWeight = ScoreWeight
        FROM Fraud.RiskRule
        WHERE RuleName = 'High Amount' AND IsActive = 1;

        IF @AmountThreshold IS NOT NULL AND @PaymentAmount > @AmountThreshold
        BEGIN
            SET @TotalScore = @TotalScore + @AmountWeight;
            SET @RuleList = @RuleList + 'High Amount,';
        END

        -- ================================================================
        -- RULE 2: Velocity Check (multiple txns in 5 min window)
        -- ================================================================
        DECLARE @VelocityThreshold INT;
        DECLARE @VelocityWeight    DECIMAL(5,2);
        DECLARE @RecentTxnCount    INT;

        SELECT @VelocityThreshold = CAST(Threshold AS INT), @VelocityWeight = ScoreWeight
        FROM Fraud.RiskRule
        WHERE RuleName = 'Velocity 5min' AND IsActive = 1;

        IF @VelocityThreshold IS NOT NULL
        BEGIN
            SELECT @RecentTxnCount = COUNT(*)
            FROM Payments.Payment p
            INNER JOIN Orders.OrderHeader oh ON oh.OrderId = p.OrderId
            WHERE oh.CustomerId = @CustomerId
              AND p.CreatedAt >= DATEADD(MINUTE, -5, @PaymentTime)
              AND p.PaymentId <> @PaymentId;

            IF @RecentTxnCount >= @VelocityThreshold
            BEGIN
                SET @TotalScore = @TotalScore + @VelocityWeight;
                SET @RuleList = @RuleList + 'Velocity 5min,';
            END
        END

        -- ================================================================
        -- RULE 3: New Card (first time use)
        -- ================================================================
        DECLARE @NewCardWeight DECIMAL(5,2);

        SELECT @NewCardWeight = ScoreWeight
        FROM Fraud.RiskRule
        WHERE RuleName = 'New Card' AND IsActive = 1;

        IF @CardId IS NOT NULL AND @NewCardWeight IS NOT NULL
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM Payments.Payment
                WHERE CardId = @CardId
                  AND PaymentId <> @PaymentId
                  AND Status IN ('AUTHORIZED', 'CAPTURED')
            )
            BEGIN
                SET @TotalScore = @TotalScore + @NewCardWeight;
                SET @RuleList = @RuleList + 'New Card,';
            END
        END

        -- ================================================================
        -- RULE 4: Watchlist Check (card hash or email)
        -- ================================================================
        DECLARE @WatchlistWeight DECIMAL(5,2);
        DECLARE @OnWatchlist     BIT = 0;

        SELECT @WatchlistWeight = ScoreWeight
        FROM Fraud.RiskRule
        WHERE RuleName = 'Watchlisted Entity' AND IsActive = 1;

        IF @WatchlistWeight IS NOT NULL
        BEGIN
            -- Check card hash
            IF @CardHash IS NOT NULL AND EXISTS (
                SELECT 1 FROM Fraud.Watchlist
                WHERE EntityType = 'CARD_HASH'
                  AND EntityValue = CONVERT(NVARCHAR(256), @CardHash, 2)
                  AND (ExpiresAt IS NULL OR ExpiresAt > SYSDATETIME())
            )
                SET @OnWatchlist = 1;

            -- Check email
            IF @OnWatchlist = 0 AND @CustomerEmail IS NOT NULL AND EXISTS (
                SELECT 1 FROM Fraud.Watchlist
                WHERE EntityType = 'EMAIL'
                  AND EntityValue = @CustomerEmail
                  AND (ExpiresAt IS NULL OR ExpiresAt > SYSDATETIME())
            )
                SET @OnWatchlist = 1;

            IF @OnWatchlist = 1
            BEGIN
                SET @TotalScore = @TotalScore + @WatchlistWeight;
                SET @RuleList = @RuleList + 'Watchlisted Entity,';
            END
        END

        -- ================================================================
        -- RULE 5: Odd Hours (01:00 - 05:00)
        -- ================================================================
        DECLARE @OddHoursWeight DECIMAL(5,2);

        SELECT @OddHoursWeight = ScoreWeight
        FROM Fraud.RiskRule
        WHERE RuleName = 'Odd Hours' AND IsActive = 1;

        IF @OddHoursWeight IS NOT NULL
        BEGIN
            DECLARE @Hour INT = DATEPART(HOUR, @PaymentTime);
            IF @Hour >= 1 AND @Hour < 5
            BEGIN
                SET @TotalScore = @TotalScore + @OddHoursWeight;
                SET @RuleList = @RuleList + 'Odd Hours,';
            END
        END

        -- ================================================================
        -- RULE 6: Repeated Declines
        -- ================================================================
        DECLARE @DeclineThreshold INT;
        DECLARE @DeclineWeight    DECIMAL(5,2);
        DECLARE @RecentDeclines   INT;

        SELECT @DeclineThreshold = CAST(Threshold AS INT), @DeclineWeight = ScoreWeight
        FROM Fraud.RiskRule
        WHERE RuleName = 'Repeated Declines' AND IsActive = 1;

        IF @DeclineThreshold IS NOT NULL
        BEGIN
            SELECT @RecentDeclines = COUNT(*)
            FROM Payments.Payment p
            INNER JOIN Orders.OrderHeader oh ON oh.OrderId = p.OrderId
            WHERE oh.CustomerId = @CustomerId
              AND p.Status = 'FAILED'
              AND p.CreatedAt >= DATEADD(HOUR, -24, @PaymentTime);

            IF @RecentDeclines >= @DeclineThreshold
            BEGIN
                SET @TotalScore = @TotalScore + @DeclineWeight;
                SET @RuleList = @RuleList + 'Repeated Declines,';
            END
        END

        -- ================================================================
        -- Determine risk level
        -- ================================================================
        SET @RiskLevel = CASE
            WHEN @TotalScore <= 3.0  THEN 'LOW'
            WHEN @TotalScore <= 7.0  THEN 'MEDIUM'
            WHEN @TotalScore <= 12.0 THEN 'HIGH'
            ELSE 'CRITICAL'
        END;

        SET @ShouldBlock = CASE
            WHEN @RiskLevel IN ('HIGH', 'CRITICAL') THEN 1
            ELSE 0
        END;

        -- Build triggered rules JSON
        IF LEN(@RuleList) > 0
            SET @RuleList = LEFT(@RuleList, LEN(@RuleList) - 1); -- trim trailing comma

        SET @TriggeredRules = '[' + @RuleList + ']';

        -- Record the score
        INSERT INTO Fraud.TransactionScore (
            PaymentId, TotalScore, RiskLevel, TriggeredRules,
            ReviewRequired, Decision, EvaluatedAt
        )
        VALUES (
            @PaymentId, @TotalScore, @RiskLevel, @TriggeredRules,
            @ShouldBlock,
            CASE WHEN @ShouldBlock = 1 THEN 'HOLD' ELSE 'APPROVE' END,
            SYSDATETIME()
        );

        -- If high risk, send fraud alert
        IF @ShouldBlock = 1
        BEGIN
            EXEC Notifications.sp_SendNotification
                @TypeCode      = 'FRAUD_ALERT',
                @RecipientId   = 0,
                @RecipientAddr = 'fraud-team@company.com',
                @Subject       = 'High Risk Transaction Detected',
                @BodyParams    = @PaymentId,
                @Priority      = 1;
        END

        -- Audit
        EXEC Audit.sp_LogActivity
            @ActivityType   = 'FRAUD_CHECK',
            @SchemaName     = 'Fraud',
            @ObjectName     = 'TransactionScore',
            @RecordId       = @PaymentId,
            @NewValue       = @TotalScore,
            @AdditionalData = @TriggeredRules;

    END TRY
    BEGIN CATCH
        INSERT INTO Audit.ErrorLog (ErrorNumber, ErrorSeverity, ErrorState, ErrorLine, ErrorProc, ErrorMessage, ContextData)
        VALUES (ERROR_NUMBER(), ERROR_SEVERITY(), ERROR_STATE(), ERROR_LINE(), ERROR_PROCEDURE(), ERROR_MESSAGE(),
            CONCAT('PaymentId=', @PaymentId));

        -- On error, default to blocking (fail-safe)
        SET @TotalScore  = 99.99;
        SET @RiskLevel   = 'CRITICAL';
        SET @ShouldBlock = 1;
    END CATCH
END;
GO


-- ============================================================================
-- STORED PROCEDURE: Payments.sp_ValidatePayment
-- Complexity: Medium (CC ~7)
-- Purpose:    Pre-authorization validation of a payment
-- ============================================================================
CREATE OR ALTER PROCEDURE Payments.sp_ValidatePayment
    @PaymentId    BIGINT,
    @IsValid      BIT            OUTPUT,
    @ErrorMessage NVARCHAR(200)  OUTPUT
AS
BEGIN
    /*
     * Validates a payment before processing.
     *
     * Checks:
     *   1. Payment exists and is in PENDING status.
     *   2. Associated order exists and is in a valid state.
     *   3. Payment amount matches order total.
     *   4. If card payment, validates the card is active and not expired.
     *   5. Runs fraud check via Fraud.sp_CheckTransaction.
     *
     * Returns @IsValid = 1 if all checks pass.
     */
    SET NOCOUNT ON;

    SET @IsValid = 0;
    SET @ErrorMessage = NULL;

    DECLARE @PaymentStatus VARCHAR(15);
    DECLARE @PaymentAmount DECIMAL(18,2);
    DECLARE @OrderId       BIGINT;
    DECLARE @OrderStatus   VARCHAR(20);
    DECLARE @OrderTotal    DECIMAL(18,2);
    DECLARE @CardId        BIGINT;
    DECLARE @MethodId      TINYINT;

    -- Step 1: Payment exists and is pending
    SELECT @PaymentStatus = Status,
           @PaymentAmount = Amount,
           @OrderId       = OrderId,
           @CardId        = CardId,
           @MethodId      = MethodId
    FROM Payments.Payment
    WHERE PaymentId = @PaymentId;

    IF @PaymentStatus IS NULL
    BEGIN
        SET @ErrorMessage = 'Payment not found.';
        RETURN;
    END

    IF @PaymentStatus <> 'PENDING'
    BEGIN
        SET @ErrorMessage = CONCAT('Payment is not in PENDING status (current: ', @PaymentStatus, ').');
        RETURN;
    END

    -- Step 2: Order validation
    SELECT @OrderStatus = Status,
           @OrderTotal  = TotalAmount
    FROM Orders.OrderHeader
    WHERE OrderId = @OrderId;

    IF @OrderStatus IS NULL
    BEGIN
        SET @ErrorMessage = 'Associated order not found.';
        RETURN;
    END

    IF @OrderStatus IN ('CANCELLED', 'REFUNDED')
    BEGIN
        SET @ErrorMessage = CONCAT('Order is in invalid state: ', @OrderStatus);
        RETURN;
    END

    -- Step 3: Amount match
    IF ABS(@PaymentAmount - @OrderTotal) > 0.01
    BEGIN
        SET @ErrorMessage = CONCAT('Payment amount (', @PaymentAmount, ') does not match order total (', @OrderTotal, ').');
        RETURN;
    END

    -- Step 4: Card validation (if card payment)
    IF @MethodId = 1 AND @CardId IS NOT NULL
    BEGIN
        DECLARE @CardActive BIT;
        DECLARE @ExpMonth   TINYINT;
        DECLARE @ExpYear    SMALLINT;

        SELECT @CardActive = IsActive,
               @ExpMonth   = ExpiryMonth,
               @ExpYear    = ExpiryYear
        FROM Cards.CustomerCard
        WHERE CardId = @CardId;

        IF @CardActive IS NULL OR @CardActive = 0
        BEGIN
            SET @ErrorMessage = 'Card is inactive or not found.';
            RETURN;
        END

        -- Check expiry
        DECLARE @ExpiryDate DATE = DATEFROMPARTS(@ExpYear, @ExpMonth,
            DAY(EOMONTH(DATEFROMPARTS(@ExpYear, @ExpMonth, 1))));

        IF @ExpiryDate < CAST(GETDATE() AS DATE)
        BEGIN
            SET @ErrorMessage = 'Card has expired.';
            RETURN;
        END
    END

    -- Step 5: Fraud check
    DECLARE @FraudScore   DECIMAL(5,2);
    DECLARE @FraudRisk    VARCHAR(10);
    DECLARE @FraudBlock   BIT;

    EXEC Fraud.sp_CheckTransaction
        @PaymentId  = @PaymentId,
        @TotalScore = @FraudScore OUTPUT,
        @RiskLevel  = @FraudRisk OUTPUT,
        @ShouldBlock = @FraudBlock OUTPUT;

    IF @FraudBlock = 1
    BEGIN
        SET @ErrorMessage = CONCAT('Payment blocked by fraud check. Risk: ', @FraudRisk, ', Score: ', @FraudScore);
        RETURN;
    END

    -- All checks passed
    SET @IsValid = 1;
END;
GO


-- ============================================================================
-- STORED PROCEDURE: Payments.sp_ProcessRefund
-- Complexity: Medium (CC ~8)
-- Purpose:    Processes a refund by reversing payment and calling Banking SP
-- ============================================================================
CREATE OR ALTER PROCEDURE Payments.sp_ProcessRefund
    @PaymentId     BIGINT,
    @RefundAmount  DECIMAL(18,2)  = NULL,  -- NULL = full refund
    @Reason        NVARCHAR(500),
    @ApprovedBy    NVARCHAR(128),
    @RefundId      BIGINT         OUTPUT
AS
BEGIN
    /*
     * Processes a refund for a captured payment.
     *
     * Flow:
     *   1. Validate payment exists and is in CAPTURED status.
     *   2. Default to full refund amount if not specified.
     *   3. Ensure refund amount does not exceed original payment.
     *   4. Create refund record.
     *   5. Call Banking.sp_TransferFunds to move money back.
     *   6. Update payment status to REFUNDED.
     *   7. Send notification to customer.
     *   8. Audit trail.
     */
    SET NOCOUNT ON;

    SET @RefundId = NULL;

    DECLARE @PaymentStatus VARCHAR(15);
    DECLARE @OriginalAmount DECIMAL(18,2);
    DECLARE @OrderId       BIGINT;
    DECLARE @CustomerId    BIGINT;
    DECLARE @CustomerEmail NVARCHAR(256);
    DECLARE @BankingTxnId  BIGINT;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Validate payment
        SELECT @PaymentStatus  = Status,
               @OriginalAmount = Amount,
               @OrderId        = OrderId
        FROM Payments.Payment WITH (UPDLOCK)
        WHERE PaymentId = @PaymentId;

        IF @PaymentStatus IS NULL
        BEGIN
            RAISERROR('Payment %I64d not found.', 16, 1, @PaymentId);
        END

        IF @PaymentStatus <> 'CAPTURED'
        BEGIN
            RAISERROR('Payment must be in CAPTURED status to refund (current: %s).', 16, 1, @PaymentStatus);
        END

        -- Default to full refund
        IF @RefundAmount IS NULL
            SET @RefundAmount = @OriginalAmount;

        -- Check refund amount
        IF @RefundAmount > @OriginalAmount
        BEGIN
            RAISERROR('Refund amount (%s) exceeds original payment (%s).', 16, 1, @RefundAmount, @OriginalAmount);
        END

        -- Check existing refunds don't exceed original
        DECLARE @PreviousRefunds DECIMAL(18,2) = 0;
        SELECT @PreviousRefunds = ISNULL(SUM(Amount), 0)
        FROM Payments.Refund
        WHERE PaymentId = @PaymentId
          AND Status IN ('APPROVED', 'PROCESSED');

        IF (@PreviousRefunds + @RefundAmount) > @OriginalAmount
        BEGIN
            RAISERROR('Total refunds would exceed original payment. Previous: %s, This: %s, Original: %s.', 16, 1,
                @PreviousRefunds, @RefundAmount, @OriginalAmount);
        END

        -- Create refund record
        INSERT INTO Payments.Refund (PaymentId, Amount, Reason, Status, ApprovedBy)
        VALUES (@PaymentId, @RefundAmount, @Reason, 'APPROVED', @ApprovedBy);

        SET @RefundId = SCOPE_IDENTITY();

        COMMIT TRANSACTION;

        -- Transfer funds back via banking (platform account -> customer)
        -- Using account IDs 1 (platform) and 2 (customer) as an example
        DECLARE @PlatformAccountId BIGINT = 1;  -- would be looked up in real system
        DECLARE @CustomerAccountId BIGINT = 2;

        EXEC Banking.sp_TransferFunds
            @FromAccountId = @PlatformAccountId,
            @ToAccountId   = @CustomerAccountId,
            @Amount        = @RefundAmount,
            @ReferenceId   = @RefundId,
            @Notes         = @Reason,
            @TransactionId = @BankingTxnId OUTPUT;

        -- Link banking transaction to refund
        UPDATE Payments.Refund
        SET BankingTxnId = @BankingTxnId,
            Status       = 'PROCESSED',
            ProcessedAt  = SYSDATETIME()
        WHERE RefundId = @RefundId;

        -- Update payment status if fully refunded
        IF (@PreviousRefunds + @RefundAmount) = @OriginalAmount
        BEGIN
            UPDATE Payments.Payment
            SET Status = 'REFUNDED', ProcessedAt = SYSDATETIME()
            WHERE PaymentId = @PaymentId;
        END

        -- Notify customer
        SELECT @CustomerId = oh.CustomerId,
               @CustomerEmail = c.Email
        FROM Orders.OrderHeader oh
        INNER JOIN Orders.Customer c ON c.CustomerId = oh.CustomerId
        WHERE oh.OrderId = @OrderId;

        EXEC Notifications.sp_SendNotification
            @TypeCode      = 'REFUND_PROCESSED',
            @RecipientId   = @CustomerId,
            @RecipientAddr = @CustomerEmail,
            @BodyParams    = @RefundAmount;

        -- Audit
        EXEC Audit.sp_LogActivity
            @ActivityType   = 'REFUND_PROCESSED',
            @SchemaName     = 'Payments',
            @ObjectName     = 'Refund',
            @RecordId       = @RefundId,
            @NewValue       = @RefundAmount,
            @PerformedBy    = @ApprovedBy,
            @AdditionalData = @Reason;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        INSERT INTO Audit.ErrorLog (ErrorNumber, ErrorSeverity, ErrorState, ErrorLine, ErrorProc, ErrorMessage, ContextData)
        VALUES (ERROR_NUMBER(), ERROR_SEVERITY(), ERROR_STATE(), ERROR_LINE(), ERROR_PROCEDURE(), ERROR_MESSAGE(),
            CONCAT('PaymentId=', @PaymentId, ', RefundAmount=', @RefundAmount));

        THROW;
    END CATCH
END;
GO


-- ============================================================================
-- STORED PROCEDURE: Settlement.sp_DailySettlement
-- Complexity: High (CC ~11)
-- Purpose:    Batch settlement of captured payments for a given date
-- ============================================================================
CREATE OR ALTER PROCEDURE Settlement.sp_DailySettlement
    @SettlementDate  DATE = NULL,
    @BatchId         BIGINT OUTPUT
AS
BEGIN
    /*
     * Daily settlement batch processing.
     *
     * Collects all CAPTURED payments for the given date (or yesterday),
     * computes fees, creates settlement batch and detail records, and
     * initiates the fund transfer to merchant accounts.
     *
     * Fee structure:
     *   - Card payments: 2.9% + $0.30 per transaction
     *   - Bank transfer:  0.8% flat
     *   - Wallet:         1.5% flat
     *   - Crypto:         1.0% flat
     *
     * Steps:
     *   1. Default date to yesterday.
     *   2. Idempotency check.
     *   3. Create batch record.
     *   4. Insert settlement details with computed fees.
     *   5. Update batch totals.
     *   6. Send settlement notification.
     */
    SET NOCOUNT ON;

    SET @BatchId = NULL;

    IF @SettlementDate IS NULL
        SET @SettlementDate = DATEADD(DAY, -1, CAST(GETDATE() AS DATE));

    BEGIN TRY
        -- Idempotency
        IF EXISTS (
            SELECT 1 FROM Settlement.SettlementBatch
            WHERE BatchDate = @SettlementDate AND Status IN ('SETTLED','PROCESSING')
        )
        BEGIN
            SELECT @BatchId = BatchId
            FROM Settlement.SettlementBatch
            WHERE BatchDate = @SettlementDate AND Status IN ('SETTLED','PROCESSING');

            PRINT 'Settlement already exists for ' + CONVERT(VARCHAR(10), @SettlementDate, 120);
            RETURN;
        END

        BEGIN TRANSACTION;

        -- Create batch
        INSERT INTO Settlement.SettlementBatch (BatchDate, Status)
        VALUES (@SettlementDate, 'PROCESSING');

        SET @BatchId = SCOPE_IDENTITY();

        -- Insert details with fee calculation
        INSERT INTO Settlement.SettlementDetail (BatchId, PaymentId, Amount, Fee)
        SELECT
            @BatchId,
            p.PaymentId,
            p.Amount,
            CASE
                WHEN p.MethodId = 1 THEN ROUND(p.Amount * 0.029 + 0.30, 2)  -- Card: 2.9% + $0.30
                WHEN p.MethodId = 2 THEN ROUND(p.Amount * 0.008, 2)          -- Bank: 0.8%
                WHEN p.MethodId = 3 THEN ROUND(p.Amount * 0.015, 2)          -- Wallet: 1.5%
                WHEN p.MethodId = 4 THEN ROUND(p.Amount * 0.010, 2)          -- Crypto: 1.0%
                ELSE ROUND(p.Amount * 0.030, 2)                               -- Default: 3.0%
            END AS Fee
        FROM Payments.Payment p
        WHERE p.Status = 'CAPTURED'
          AND CAST(p.ProcessedAt AS DATE) = @SettlementDate;

        -- Update batch totals
        DECLARE @TotalTxns  INT;
        DECLARE @GrossAmt   DECIMAL(18,2);
        DECLARE @FeeAmt     DECIMAL(18,2);

        SELECT @TotalTxns = COUNT(*),
               @GrossAmt  = ISNULL(SUM(Amount), 0),
               @FeeAmt    = ISNULL(SUM(Fee), 0)
        FROM Settlement.SettlementDetail
        WHERE BatchId = @BatchId;

        UPDATE Settlement.SettlementBatch
        SET TotalTransactions = @TotalTxns,
            GrossAmount       = @GrossAmt,
            FeeAmount         = @FeeAmt,
            NetAmount         = @GrossAmt - @FeeAmt,
            Status            = 'SETTLED',
            SettledAt         = SYSDATETIME()
        WHERE BatchId = @BatchId;

        COMMIT TRANSACTION;

        -- Notification
        EXEC Notifications.sp_SendNotification
            @TypeCode      = 'SETTLEMENT_DONE',
            @RecipientId   = 0,
            @RecipientAddr = 'finance@company.com',
            @Subject       = 'Daily Settlement Complete',
            @BodyParams    = @BatchId;

        -- Audit
        EXEC Audit.sp_LogActivity
            @ActivityType   = 'DAILY_SETTLEMENT',
            @SchemaName     = 'Settlement',
            @ObjectName     = 'SettlementBatch',
            @RecordId       = @BatchId,
            @NewValue       = @GrossAmt,
            @AdditionalData = CONCAT('Txns=', @TotalTxns, ', Fees=', @FeeAmt, ', Net=', @GrossAmt - @FeeAmt);

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        IF @BatchId IS NOT NULL
        BEGIN
            UPDATE Settlement.SettlementBatch
            SET Status = 'FAILED'
            WHERE BatchId = @BatchId;
        END

        INSERT INTO Audit.ErrorLog (ErrorNumber, ErrorSeverity, ErrorState, ErrorLine, ErrorProc, ErrorMessage, ContextData)
        VALUES (ERROR_NUMBER(), ERROR_SEVERITY(), ERROR_STATE(), ERROR_LINE(), ERROR_PROCEDURE(), ERROR_MESSAGE(),
            CONCAT('SettlementDate=', CONVERT(VARCHAR(10), @SettlementDate, 120)));

        THROW;
    END CATCH
END;
GO


-- ============================================================================
-- STORED PROCEDURE: Reports.sp_GenerateDailyReport
-- Complexity: Medium (CC ~6)
-- Purpose:    Aggregation queries to build a daily snapshot
-- ============================================================================
CREATE OR ALTER PROCEDURE Reports.sp_GenerateDailyReport
    @ReportDate  DATE = NULL
AS
BEGIN
    /*
     * Generates the daily business snapshot.
     *
     * Aggregates data from Orders, Payments, and Customers into the
     * Reports.DailySnapshot table for dashboarding and trend analysis.
     *
     * Metrics:
     *   - Total orders placed
     *   - Total revenue (captured payments)
     *   - Total refunds processed
     *   - New customer registrations
     *   - Active product count
     *   - Average order value
     *
     * Records execution metadata in Reports.ReportExecution for observability.
     */
    SET NOCOUNT ON;

    IF @ReportDate IS NULL
        SET @ReportDate = DATEADD(DAY, -1, CAST(GETDATE() AS DATE));

    DECLARE @ExecutionId BIGINT;
    DECLARE @StartTime   DATETIME2(3) = SYSDATETIME();
    DECLARE @RowCount    INT = 0;

    -- Log execution start
    INSERT INTO Reports.ReportExecution (ReportName, Parameters, Status)
    VALUES ('DailySnapshot', CONCAT('ReportDate=', CONVERT(VARCHAR(10), @ReportDate, 120)), 'RUNNING');

    SET @ExecutionId = SCOPE_IDENTITY();

    BEGIN TRY
        -- Remove existing snapshot for the date (re-runnable)
        DELETE FROM Reports.DailySnapshot WHERE SnapshotDate = @ReportDate;

        -- Build the snapshot
        DECLARE @TotalOrders    INT;
        DECLARE @TotalRevenue   DECIMAL(18,2);
        DECLARE @TotalRefunds   DECIMAL(18,2);
        DECLARE @NewCustomers   INT;
        DECLARE @ActiveProducts INT;
        DECLARE @AvgOrderValue  DECIMAL(10,2);

        -- Orders placed on the date
        SELECT @TotalOrders = COUNT(*),
               @AvgOrderValue = AVG(TotalAmount)
        FROM Orders.OrderHeader
        WHERE CAST(OrderDate AS DATE) = @ReportDate;

        -- Revenue from captured payments
        SELECT @TotalRevenue = ISNULL(SUM(Amount), 0)
        FROM Payments.Payment
        WHERE Status = 'CAPTURED'
          AND CAST(ProcessedAt AS DATE) = @ReportDate;

        -- Refunds processed
        SELECT @TotalRefunds = ISNULL(SUM(Amount), 0)
        FROM Payments.Refund
        WHERE Status = 'PROCESSED'
          AND CAST(ProcessedAt AS DATE) = @ReportDate;

        -- New customers
        SELECT @NewCustomers = COUNT(*)
        FROM Orders.Customer
        WHERE CAST(CreatedAt AS DATE) = @ReportDate;

        -- Active products
        SELECT @ActiveProducts = COUNT(*)
        FROM Inventory.Product
        WHERE IsActive = 1;

        -- Insert snapshot
        INSERT INTO Reports.DailySnapshot (
            SnapshotDate, TotalOrders, TotalRevenue, TotalRefunds,
            NewCustomers, ActiveProducts, AvgOrderValue
        )
        VALUES (
            @ReportDate,
            ISNULL(@TotalOrders, 0),
            ISNULL(@TotalRevenue, 0),
            ISNULL(@TotalRefunds, 0),
            ISNULL(@NewCustomers, 0),
            ISNULL(@ActiveProducts, 0),
            @AvgOrderValue
        );

        SET @RowCount = 1;

        -- Update execution log
        UPDATE Reports.ReportExecution
        SET Status       = 'COMPLETED',
            RowsAffected = @RowCount,
            DurationMs   = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME()),
            CompletedAt  = SYSDATETIME()
        WHERE ExecutionId = @ExecutionId;

        -- Audit
        EXEC Audit.sp_LogActivity
            @ActivityType = 'REPORT_GENERATED',
            @SchemaName   = 'Reports',
            @ObjectName   = 'DailySnapshot',
            @RecordId     = @ExecutionId,
            @NewValue     = @TotalRevenue;

    END TRY
    BEGIN CATCH
        UPDATE Reports.ReportExecution
        SET Status      = 'FAILED',
            DurationMs  = DATEDIFF(MILLISECOND, @StartTime, SYSDATETIME()),
            CompletedAt = SYSDATETIME()
        WHERE ExecutionId = @ExecutionId;

        INSERT INTO Audit.ErrorLog (ErrorNumber, ErrorSeverity, ErrorState, ErrorLine, ErrorProc, ErrorMessage)
        VALUES (ERROR_NUMBER(), ERROR_SEVERITY(), ERROR_STATE(), ERROR_LINE(), ERROR_PROCEDURE(), ERROR_MESSAGE());

        THROW;
    END CATCH
END;
GO


-- ============================================================================
-- STORED PROCEDURE: Orders.sp_UpdateOrderStatus
-- Complexity: Low (CC ~4)
-- Purpose:    Simple status update with history tracking and audit
-- ============================================================================
CREATE OR ALTER PROCEDURE Orders.sp_UpdateOrderStatus
    @OrderId    BIGINT,
    @NewStatus  VARCHAR(20),
    @ChangedBy  NVARCHAR(128) = NULL,
    @Notes      NVARCHAR(500) = NULL
AS
BEGIN
    /*
     * Updates an order's status and records the transition in the
     * OrderStatusHistory table.
     *
     * Simple procedure with low cyclomatic complexity, representing
     * the kind of "utility" SPs commonly found in production systems.
     */
    SET NOCOUNT ON;

    IF @ChangedBy IS NULL
        SET @ChangedBy = SYSTEM_USER;

    DECLARE @OldStatus VARCHAR(20);

    SELECT @OldStatus = Status
    FROM Orders.OrderHeader
    WHERE OrderId = @OrderId;

    IF @OldStatus IS NULL
    BEGIN
        RAISERROR('Order %I64d not found.', 16, 1, @OrderId);
        RETURN;
    END

    IF @OldStatus = @NewStatus
        RETURN; -- no-op

    -- Update order
    UPDATE Orders.OrderHeader
    SET Status = @NewStatus
    WHERE OrderId = @OrderId;

    -- Record history
    INSERT INTO Orders.OrderStatusHistory (OrderId, OldStatus, NewStatus, ChangedBy, Notes)
    VALUES (@OrderId, @OldStatus, @NewStatus, @ChangedBy, @Notes);

    -- Audit
    EXEC Audit.sp_LogActivity
        @ActivityType = 'ORDER_STATUS_CHANGE',
        @SchemaName   = 'Orders',
        @ObjectName   = 'OrderHeader',
        @RecordId     = @OrderId,
        @OldValue     = @OldStatus,
        @NewValue     = @NewStatus,
        @PerformedBy  = @ChangedBy;
END;
GO


-- ============================================================================
-- STORED PROCEDURE: Orders.sp_GetOrderDetails
-- Complexity: Medium (CC ~5)
-- Purpose:    Retrieves full order details using joins and temp tables
-- ============================================================================
CREATE OR ALTER PROCEDURE Orders.sp_GetOrderDetails
    @OrderId       BIGINT,
    @IncludeHistory BIT = 0
AS
BEGIN
    /*
     * Retrieves comprehensive order details by joining across multiple
     * schemas: Orders, Inventory, Payments, and optionally status history.
     *
     * Uses a temp table to stage the line item detail so that supplementary
     * data (stock availability, payment info) can be joined in subsequent
     * steps. This multi-step approach is common in reporting SPs.
     *
     * Result sets:
     *   1. Order header + customer info
     *   2. Line items with product details and stock levels
     *   3. Payment information
     *   4. (Optional) Status history timeline
     */
    SET NOCOUNT ON;

    -- Validate order exists
    IF NOT EXISTS (SELECT 1 FROM Orders.OrderHeader WHERE OrderId = @OrderId)
    BEGIN
        RAISERROR('Order %I64d not found.', 16, 1, @OrderId);
        RETURN;
    END

    -- Result Set 1: Order header with customer
    SELECT
        oh.OrderId,
        oh.OrderNumber,
        oh.Status,
        oh.OrderDate,
        oh.SubTotal,
        oh.TaxAmount,
        oh.ShippingCost,
        oh.TotalAmount,
        oh.ShippingAddr,
        oh.CancelledAt,
        oh.CancelReason,
        c.CustomerId,
        c.FirstName,
        c.LastName,
        c.Email,
        c.Phone,
        c.Tier AS CustomerTier
    FROM Orders.OrderHeader oh
    INNER JOIN Orders.Customer c ON c.CustomerId = oh.CustomerId
    WHERE oh.OrderId = @OrderId;

    -- Temp table for line items enriched with product and stock data
    CREATE TABLE #OrderLines (
        OrderLineId   BIGINT,
        ProductId     BIGINT,
        SKU           VARCHAR(30),
        ProductName   NVARCHAR(200),
        Quantity      INT,
        UnitPrice     DECIMAL(10,2),
        Discount      DECIMAL(5,2),
        LineTotal     DECIMAL(18,2),
        StockAvailable INT
    );

    INSERT INTO #OrderLines (OrderLineId, ProductId, SKU, ProductName, Quantity, UnitPrice, Discount, LineTotal)
    SELECT
        ol.OrderLineId,
        ol.ProductId,
        p.SKU,
        p.Name,
        ol.Quantity,
        ol.UnitPrice,
        ol.Discount,
        ol.LineTotal
    FROM Orders.OrderLine ol
    INNER JOIN Inventory.Product p ON p.ProductId = ol.ProductId
    WHERE ol.OrderId = @OrderId;

    -- Enrich with current stock availability (sum across all warehouses)
    UPDATE ol
    SET ol.StockAvailable = ISNULL(s.TotalAvailable, 0)
    FROM #OrderLines ol
    LEFT JOIN (
        SELECT ProductId, SUM(QuantityOnHand - QuantityReserved) AS TotalAvailable
        FROM Inventory.Stock
        GROUP BY ProductId
    ) s ON s.ProductId = ol.ProductId;

    -- Result Set 2: Enriched line items
    SELECT * FROM #OrderLines ORDER BY OrderLineId;

    DROP TABLE #OrderLines;

    -- Result Set 3: Payment information
    SELECT
        p.PaymentId,
        pm.MethodName,
        p.Amount,
        p.Currency,
        p.Status,
        p.GatewayRef,
        p.AttemptCount,
        p.CreatedAt,
        p.ProcessedAt,
        fs.TotalScore   AS FraudScore,
        fs.RiskLevel    AS FraudRiskLevel
    FROM Payments.Payment p
    INNER JOIN Payments.PaymentMethod pm ON pm.MethodId = p.MethodId
    LEFT JOIN Fraud.TransactionScore fs ON fs.PaymentId = p.PaymentId
    WHERE p.OrderId = @OrderId
    ORDER BY p.CreatedAt DESC;

    -- Result Set 4: Status history (optional)
    IF @IncludeHistory = 1
    BEGIN
        SELECT
            HistoryId,
            OldStatus,
            NewStatus,
            ChangedBy,
            ChangedAt,
            Notes
        FROM Orders.OrderStatusHistory
        WHERE OrderId = @OrderId
        ORDER BY ChangedAt ASC;
    END
END;
GO


-- ============================================================================
-- STORED PROCEDURE: Orders.sp_ProcessOrder
-- Complexity: High (CC ~13)
-- Purpose:    Full order processing pipeline with multi-schema operations
-- ============================================================================
CREATE OR ALTER PROCEDURE Orders.sp_ProcessOrder
    @OrderId    BIGINT,
    @PaymentMethodId TINYINT  = 1,
    @CardId     BIGINT        = NULL,
    @Success    BIT           OUTPUT,
    @Message    NVARCHAR(500) OUTPUT
AS
BEGIN
    /*
     * Processes a pending order through the full pipeline:
     *
     *   1. Validate order is in PENDING status.
     *   2. Reserve stock for each line item (calls Inventory.sp_ReserveStock).
     *   3. Create payment record.
     *   4. Validate payment (calls Payments.sp_ValidatePayment).
     *   5. If validation passes: confirm order, capture payment.
     *   6. If any step fails: release stock, cancel payment, revert order.
     *   7. Send appropriate notification.
     *   8. Full audit trail.
     *
     * This SP demonstrates high complexity with multiple conditional branches,
     * cross-schema calls, and error handling at each step.
     */
    SET NOCOUNT ON;

    SET @Success = 0;
    SET @Message = NULL;

    DECLARE @OrderStatus   VARCHAR(20);
    DECLARE @TotalAmount   DECIMAL(18,2);
    DECLARE @CustomerId    BIGINT;
    DECLARE @CustomerEmail NVARCHAR(256);
    DECLARE @OrderNumber   VARCHAR(20);
    DECLARE @PaymentId     BIGINT;
    DECLARE @StockSuccess  BIT;
    DECLARE @StockMsg      NVARCHAR(200);
    DECLARE @PayValid      BIT;
    DECLARE @PayError      NVARCHAR(200);
    DECLARE @AllStockOk    BIT = 1;

    BEGIN TRY
        -- Step 1: Validate order status
        SELECT @OrderStatus = oh.Status,
               @TotalAmount = oh.TotalAmount,
               @CustomerId  = oh.CustomerId,
               @OrderNumber = oh.OrderNumber,
               @CustomerEmail = c.Email
        FROM Orders.OrderHeader oh
        INNER JOIN Orders.Customer c ON c.CustomerId = oh.CustomerId
        WHERE oh.OrderId = @OrderId;

        IF @OrderStatus IS NULL
        BEGIN
            SET @Message = 'Order not found.';
            RETURN;
        END

        IF @OrderStatus <> 'PENDING'
        BEGIN
            SET @Message = CONCAT('Order cannot be processed. Current status: ', @OrderStatus);
            RETURN;
        END

        -- Update to PROCESSING
        EXEC Orders.sp_UpdateOrderStatus @OrderId, 'PROCESSING', 'SYSTEM', 'Auto-processing initiated';

        -- Step 2: Reserve stock for each line item
        DECLARE @LineProductId BIGINT;
        DECLARE @LineQty       INT;

        DECLARE stock_cursor CURSOR LOCAL FAST_FORWARD FOR
            SELECT ProductId, Quantity
            FROM Orders.OrderLine
            WHERE OrderId = @OrderId;

        OPEN stock_cursor;
        FETCH NEXT FROM stock_cursor INTO @LineProductId, @LineQty;

        WHILE @@FETCH_STATUS = 0 AND @AllStockOk = 1
        BEGIN
            EXEC Inventory.sp_ReserveStock
                @OrderId   = @OrderId,
                @ProductId = @LineProductId,
                @Quantity  = @LineQty,
                @Success   = @StockSuccess OUTPUT,
                @Message   = @StockMsg OUTPUT;

            IF @StockSuccess = 0
            BEGIN
                SET @AllStockOk = 0;
                SET @Message = CONCAT('Stock reservation failed for product ', @LineProductId, ': ', @StockMsg);
            END

            FETCH NEXT FROM stock_cursor INTO @LineProductId, @LineQty;
        END

        CLOSE stock_cursor;
        DEALLOCATE stock_cursor;

        -- If stock reservation failed, release everything and revert
        IF @AllStockOk = 0
        BEGIN
            EXEC Inventory.sp_ReleaseStock @OrderId;
            EXEC Orders.sp_UpdateOrderStatus @OrderId, 'PENDING', 'SYSTEM', @Message;
            RETURN;
        END

        -- Step 3: Create payment
        INSERT INTO Payments.Payment (OrderId, MethodId, CardId, Amount, Status)
        VALUES (@OrderId, @PaymentMethodId, @CardId, @TotalAmount, 'PENDING');

        SET @PaymentId = SCOPE_IDENTITY();

        -- Step 4: Validate payment
        EXEC Payments.sp_ValidatePayment
            @PaymentId    = @PaymentId,
            @IsValid      = @PayValid OUTPUT,
            @ErrorMessage = @PayError OUTPUT;

        IF @PayValid = 0
        BEGIN
            -- Revert: release stock and cancel order processing
            EXEC Inventory.sp_ReleaseStock @OrderId;

            UPDATE Payments.Payment SET Status = 'FAILED' WHERE PaymentId = @PaymentId;

            EXEC Orders.sp_UpdateOrderStatus @OrderId, 'PENDING', 'SYSTEM',
                'Payment validation failed - reverted to PENDING';

            SET @Message = CONCAT('Payment validation failed: ', @PayError);
            RETURN;
        END

        -- Step 5: Capture payment (simulate authorization + capture)
        UPDATE Payments.Payment
        SET Status = 'CAPTURED', ProcessedAt = SYSDATETIME()
        WHERE PaymentId = @PaymentId;

        -- Confirm order
        EXEC Orders.sp_UpdateOrderStatus @OrderId, 'CONFIRMED', 'SYSTEM', 'Payment captured successfully';

        -- Step 6: Send confirmation notification
        EXEC Notifications.sp_SendNotification
            @TypeCode      = 'ORDER_CONFIRMED',
            @RecipientId   = @CustomerId,
            @RecipientAddr = @CustomerEmail,
            @BodyParams    = @OrderNumber;

        -- Success
        SET @Success = 1;
        SET @Message = CONCAT('Order ', @OrderNumber, ' processed successfully. PaymentId: ', @PaymentId);

        -- Audit
        EXEC Audit.sp_LogActivity
            @ActivityType   = 'ORDER_PROCESSED',
            @SchemaName     = 'Orders',
            @ObjectName     = 'OrderHeader',
            @RecordId       = @OrderId,
            @NewValue       = 'CONFIRMED',
            @AdditionalData = CONCAT('PaymentId=', @PaymentId, ', Amount=', @TotalAmount);

    END TRY
    BEGIN CATCH
        -- Emergency cleanup
        IF CURSOR_STATUS('local', 'stock_cursor') >= 0
        BEGIN
            CLOSE stock_cursor;
            DEALLOCATE stock_cursor;
        END

        IF @@TRANCOUNT > 0
            ROLLBACK;

        -- Attempt to release any reserved stock
        BEGIN TRY
            EXEC Inventory.sp_ReleaseStock @OrderId;
        END TRY
        BEGIN CATCH
            -- Swallow - best effort cleanup
        END CATCH

        -- Revert order status
        BEGIN TRY
            EXEC Orders.sp_UpdateOrderStatus @OrderId, 'PENDING', 'SYSTEM', 'Processing failed - reverted';
        END TRY
        BEGIN CATCH
            -- Swallow
        END CATCH

        INSERT INTO Audit.ErrorLog (ErrorNumber, ErrorSeverity, ErrorState, ErrorLine, ErrorProc, ErrorMessage, ContextData)
        VALUES (ERROR_NUMBER(), ERROR_SEVERITY(), ERROR_STATE(), ERROR_LINE(), ERROR_PROCEDURE(), ERROR_MESSAGE(),
            CONCAT('OrderId=', @OrderId));

        SET @Message = CONCAT('Order processing failed: ', ERROR_MESSAGE());
    END CATCH
END;
GO


-- ============================================================================
-- STORED PROCEDURE: Orders.sp_CancelOrder
-- Complexity: Very High (CC ~18)
-- Purpose:    Complex cancellation with IF/ELSE, TRY/CATCH, cursors,
--             calls to other SPs, transactions, refund processing
-- ============================================================================
CREATE OR ALTER PROCEDURE Orders.sp_CancelOrder
    @OrderId      BIGINT,
    @CancelReason NVARCHAR(500),
    @CancelledBy  NVARCHAR(128) = NULL,
    @ForceCancel  BIT           = 0,   -- bypass status checks for admin override
    @Success      BIT           OUTPUT,
    @Message      NVARCHAR(500) OUTPUT
AS
BEGIN
    /*
     * Comprehensive order cancellation procedure.
     *
     * This is the most complex SP in the system, designed to demonstrate
     * high cyclomatic complexity for the forensics analysis tool.
     *
     * Business rules:
     *   - Orders can only be cancelled if in PENDING, CONFIRMED, or PROCESSING status.
     *   - SHIPPED orders require @ForceCancel = 1 (admin override).
     *   - DELIVERED and already-CANCELLED orders cannot be cancelled.
     *   - If inventory was reserved, it must be released.
     *   - If payment was captured, a refund must be processed.
     *   - If payment was only authorized, it should be voided.
     *   - Notification sent to customer.
     *   - Full audit trail with old/new state diff.
     *
     * Flow:
     *   1. Validate order exists and is in a cancellable state.
     *   2. Begin transaction.
     *   3. Update order status to CANCELLED.
     *   4. Release reserved inventory (calls Inventory.sp_ReleaseStock).
     *   5. Handle payment:
     *      a. CAPTURED -> process refund (calls Payments.sp_ProcessRefund)
     *      b. AUTHORIZED -> void payment
     *      c. PENDING -> cancel payment
     *   6. Send cancellation notification.
     *   7. Commit and audit.
     *   8. Error handling with partial rollback awareness.
     */
    SET NOCOUNT ON;

    SET @Success = 0;
    SET @Message = NULL;

    IF @CancelledBy IS NULL
        SET @CancelledBy = SYSTEM_USER;

    DECLARE @OrderStatus    VARCHAR(20);
    DECLARE @OrderNumber    VARCHAR(20);
    DECLARE @CustomerId     BIGINT;
    DECLARE @CustomerEmail  NVARCHAR(256);
    DECLARE @TotalAmount    DECIMAL(18,2);
    DECLARE @OldStatusJSON  NVARCHAR(MAX);

    -- Gather order context
    SELECT @OrderStatus   = oh.Status,
           @OrderNumber   = oh.OrderNumber,
           @CustomerId    = oh.CustomerId,
           @TotalAmount   = oh.TotalAmount,
           @CustomerEmail = c.Email
    FROM Orders.OrderHeader oh
    INNER JOIN Orders.Customer c ON c.CustomerId = oh.CustomerId
    WHERE oh.OrderId = @OrderId;

    -- ============================================================
    -- PHASE 1: Validation
    -- ============================================================

    IF @OrderStatus IS NULL
    BEGIN
        SET @Message = CONCAT('Order ', @OrderId, ' not found.');
        RETURN;
    END

    IF @OrderStatus = 'CANCELLED'
    BEGIN
        SET @Message = 'Order is already cancelled.';
        RETURN;
    END

    IF @OrderStatus = 'REFUNDED'
    BEGIN
        SET @Message = 'Order has already been refunded. Cannot cancel.';
        RETURN;
    END

    IF @OrderStatus = 'DELIVERED' AND @ForceCancel = 0
    BEGIN
        SET @Message = 'Delivered orders cannot be cancelled. Use ForceCancel for admin override.';
        RETURN;
    END

    IF @OrderStatus = 'SHIPPED' AND @ForceCancel = 0
    BEGIN
        SET @Message = 'Shipped orders require admin override (ForceCancel=1) to cancel.';
        RETURN;
    END

    -- Save pre-cancellation state for audit
    SET @OldStatusJSON = CONCAT('{"status":"', @OrderStatus, '","total":', @TotalAmount, '}');

    -- ============================================================
    -- PHASE 2: Cancellation Transaction
    -- ============================================================

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Mark order as cancelled
        UPDATE Orders.OrderHeader
        SET Status       = 'CANCELLED',
            CancelledAt  = SYSDATETIME(),
            CancelReason = @CancelReason
        WHERE OrderId = @OrderId;

        -- Record status change
        INSERT INTO Orders.OrderStatusHistory (OrderId, OldStatus, NewStatus, ChangedBy, Notes)
        VALUES (@OrderId, @OrderStatus, 'CANCELLED', @CancelledBy, @CancelReason);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        INSERT INTO Audit.ErrorLog (ErrorNumber, ErrorSeverity, ErrorState, ErrorLine, ErrorProc, ErrorMessage, ContextData)
        VALUES (ERROR_NUMBER(), ERROR_SEVERITY(), ERROR_STATE(), ERROR_LINE(), ERROR_PROCEDURE(), ERROR_MESSAGE(),
            CONCAT('Phase 2 - OrderId=', @OrderId));

        SET @Message = CONCAT('Failed to update order status: ', ERROR_MESSAGE());
        RETURN;
    END CATCH

    -- ============================================================
    -- PHASE 3: Inventory Release
    -- ============================================================

    IF @OrderStatus IN ('CONFIRMED', 'PROCESSING', 'SHIPPED')
    BEGIN
        BEGIN TRY
            EXEC Inventory.sp_ReleaseStock @OrderId = @OrderId;
        END TRY
        BEGIN CATCH
            -- Log but continue - stock can be reconciled manually
            INSERT INTO Audit.ErrorLog (ErrorNumber, ErrorSeverity, ErrorState, ErrorLine, ErrorProc, ErrorMessage, ContextData)
            VALUES (ERROR_NUMBER(), ERROR_SEVERITY(), ERROR_STATE(), ERROR_LINE(), ERROR_PROCEDURE(), ERROR_MESSAGE(),
                CONCAT('Phase 3 Stock Release - OrderId=', @OrderId));
        END CATCH
    END

    -- ============================================================
    -- PHASE 4: Payment Handling
    -- ============================================================

    DECLARE @PaymentId      BIGINT;
    DECLARE @PaymentStatus  VARCHAR(15);
    DECLARE @PaymentAmount  DECIMAL(18,2);

    -- Process each payment associated with this order
    DECLARE payment_cursor CURSOR LOCAL FAST_FORWARD FOR
        SELECT PaymentId, Status, Amount
        FROM Payments.Payment
        WHERE OrderId = @OrderId
          AND Status NOT IN ('FAILED', 'REFUNDED');

    OPEN payment_cursor;
    FETCH NEXT FROM payment_cursor INTO @PaymentId, @PaymentStatus, @PaymentAmount;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        BEGIN TRY
            IF @PaymentStatus = 'CAPTURED'
            BEGIN
                -- Full refund needed
                DECLARE @RefundId BIGINT;

                EXEC Payments.sp_ProcessRefund
                    @PaymentId    = @PaymentId,
                    @RefundAmount = @PaymentAmount,
                    @Reason       = @CancelReason,
                    @ApprovedBy   = @CancelledBy,
                    @RefundId     = @RefundId OUTPUT;
            END
            ELSE IF @PaymentStatus = 'AUTHORIZED'
            BEGIN
                -- Void the authorization
                UPDATE Payments.Payment
                SET Status = 'FAILED',
                    ProcessedAt = SYSDATETIME()
                WHERE PaymentId = @PaymentId;

                EXEC Audit.sp_LogActivity
                    @ActivityType = 'PAYMENT_VOIDED',
                    @SchemaName   = 'Payments',
                    @ObjectName   = 'Payment',
                    @RecordId     = @PaymentId,
                    @OldValue     = 'AUTHORIZED',
                    @NewValue     = 'FAILED',
                    @PerformedBy  = @CancelledBy;
            END
            ELSE IF @PaymentStatus = 'PENDING'
            BEGIN
                -- Cancel the pending payment
                UPDATE Payments.Payment
                SET Status = 'FAILED',
                    ProcessedAt = SYSDATETIME()
                WHERE PaymentId = @PaymentId;
            END
        END TRY
        BEGIN CATCH
            -- Log but continue processing other payments
            INSERT INTO Audit.ErrorLog (ErrorNumber, ErrorSeverity, ErrorState, ErrorLine, ErrorProc, ErrorMessage, ContextData)
            VALUES (ERROR_NUMBER(), ERROR_SEVERITY(), ERROR_STATE(), ERROR_LINE(), ERROR_PROCEDURE(), ERROR_MESSAGE(),
                CONCAT('Phase 4 Payment - PaymentId=', @PaymentId, ', Status=', @PaymentStatus));
        END CATCH

        FETCH NEXT FROM payment_cursor INTO @PaymentId, @PaymentStatus, @PaymentAmount;
    END

    CLOSE payment_cursor;
    DEALLOCATE payment_cursor;

    -- ============================================================
    -- PHASE 5: Notification
    -- ============================================================

    BEGIN TRY
        EXEC Notifications.sp_SendNotification
            @TypeCode      = 'ORDER_CANCELLED',
            @RecipientId   = @CustomerId,
            @RecipientAddr = @CustomerEmail,
            @Subject       = 'Your order has been cancelled',
            @BodyParams    = @OrderNumber;
    END TRY
    BEGIN CATCH
        -- Non-critical: log and continue
        INSERT INTO Audit.ErrorLog (ErrorNumber, ErrorSeverity, ErrorState, ErrorLine, ErrorProc, ErrorMessage, ContextData)
        VALUES (ERROR_NUMBER(), ERROR_SEVERITY(), ERROR_STATE(), ERROR_LINE(), ERROR_PROCEDURE(), ERROR_MESSAGE(),
            CONCAT('Phase 5 Notification - OrderId=', @OrderId));
    END CATCH

    -- ============================================================
    -- PHASE 6: Audit & Completion
    -- ============================================================

    EXEC Audit.sp_LogActivity
        @ActivityType   = 'ORDER_CANCELLED',
        @SchemaName     = 'Orders',
        @ObjectName     = 'OrderHeader',
        @RecordId       = @OrderId,
        @OldValue       = @OldStatusJSON,
        @NewValue       = '{"status":"CANCELLED"}',
        @PerformedBy    = @CancelledBy,
        @AdditionalData = @CancelReason;

    SET @Success = 1;
    SET @Message = CONCAT('Order ', @OrderNumber, ' cancelled successfully.',
        CASE WHEN @OrderStatus IN ('CONFIRMED','PROCESSING','SHIPPED')
             THEN ' Stock released.'
             ELSE '' END,
        CASE WHEN EXISTS (SELECT 1 FROM Payments.Refund WHERE PaymentId IN
                (SELECT PaymentId FROM Payments.Payment WHERE OrderId = @OrderId)
                AND Status = 'PROCESSED')
             THEN ' Refund processed.'
             ELSE '' END);
END;
GO


-- ============================================================================
-- STORED PROCEDURE: Orders.sp_BulkUpdateShipping (bonus SP)
-- Complexity: Medium (CC ~6)
-- Purpose:    Batch update shipping status from carrier feed
-- ============================================================================
CREATE OR ALTER PROCEDURE Orders.sp_BulkUpdateShipping
    @ShippingUpdatesJSON NVARCHAR(MAX)  -- JSON array: [{"OrderId":1,"TrackingNo":"XX123","Status":"SHIPPED"}, ...]
AS
BEGIN
    /*
     * Batch updates order shipping status from an external carrier feed.
     *
     * Accepts a JSON array of shipping updates and processes each one,
     * updating the order status and sending notifications as appropriate.
     *
     * Uses OPENJSON to parse the input, demonstrating JSON handling
     * in stored procedures.
     */
    SET NOCOUNT ON;

    DECLARE @UpdateCount INT = 0;
    DECLARE @ErrorCount  INT = 0;

    -- Parse JSON into a temp table
    CREATE TABLE #ShippingUpdates (
        OrderId     BIGINT,
        TrackingNo  NVARCHAR(50),
        NewStatus   VARCHAR(20)
    );

    INSERT INTO #ShippingUpdates (OrderId, TrackingNo, NewStatus)
    SELECT OrderId, TrackingNo, [Status]
    FROM OPENJSON(@ShippingUpdatesJSON)
    WITH (
        OrderId    BIGINT        '$.OrderId',
        TrackingNo NVARCHAR(50)  '$.TrackingNo',
        [Status]   VARCHAR(20)   '$.Status'
    );

    -- Process each update
    DECLARE @UpdOrderId   BIGINT;
    DECLARE @UpdTracking  NVARCHAR(50);
    DECLARE @UpdStatus    VARCHAR(20);

    DECLARE upd_cursor CURSOR LOCAL FAST_FORWARD FOR
        SELECT OrderId, TrackingNo, NewStatus FROM #ShippingUpdates;

    OPEN upd_cursor;
    FETCH NEXT FROM upd_cursor INTO @UpdOrderId, @UpdTracking, @UpdStatus;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        BEGIN TRY
            EXEC Orders.sp_UpdateOrderStatus
                @OrderId   = @UpdOrderId,
                @NewStatus = @UpdStatus,
                @ChangedBy = 'CARRIER_FEED',
                @Notes     = @UpdTracking;

            SET @UpdateCount = @UpdateCount + 1;

            -- Send shipping notification if status is SHIPPED
            IF @UpdStatus = 'SHIPPED'
            BEGIN
                DECLARE @CustEmail NVARCHAR(256);
                DECLARE @CustId    BIGINT;
                DECLARE @OrdNum    VARCHAR(20);

                SELECT @CustId = oh.CustomerId,
                       @CustEmail = c.Email,
                       @OrdNum = oh.OrderNumber
                FROM Orders.OrderHeader oh
                INNER JOIN Orders.Customer c ON c.CustomerId = oh.CustomerId
                WHERE oh.OrderId = @UpdOrderId;

                EXEC Notifications.sp_SendNotification
                    @TypeCode      = 'ORDER_SHIPPED',
                    @RecipientId   = @CustId,
                    @RecipientAddr = @CustEmail,
                    @BodyParams    = @OrdNum;
            END
        END TRY
        BEGIN CATCH
            SET @ErrorCount = @ErrorCount + 1;

            INSERT INTO Audit.ErrorLog (ErrorNumber, ErrorSeverity, ErrorState, ErrorLine, ErrorProc, ErrorMessage, ContextData)
            VALUES (ERROR_NUMBER(), ERROR_SEVERITY(), ERROR_STATE(), ERROR_LINE(), ERROR_PROCEDURE(), ERROR_MESSAGE(),
                CONCAT('OrderId=', @UpdOrderId, ', Status=', @UpdStatus));
        END CATCH

        FETCH NEXT FROM upd_cursor INTO @UpdOrderId, @UpdTracking, @UpdStatus;
    END

    CLOSE upd_cursor;
    DEALLOCATE upd_cursor;
    DROP TABLE #ShippingUpdates;

    -- Audit summary
    EXEC Audit.sp_LogActivity
        @ActivityType   = 'BULK_SHIPPING_UPDATE',
        @SchemaName     = 'Orders',
        @ObjectName     = 'OrderHeader',
        @AdditionalData = CONCAT('Updated=', @UpdateCount, ', Errors=', @ErrorCount);

    -- Return summary
    SELECT @UpdateCount AS OrdersUpdated, @ErrorCount AS Errors;
END;
GO


-- ============================================================================
-- SUMMARY VIEW: Cross-schema dependency view (useful for forensics demo)
-- ============================================================================
CREATE OR ALTER VIEW dbo.vw_SPDependencyMap
AS
/*
 * Helper view that exposes stored procedure dependencies.
 * Useful for the SQLAtlas tool to visualize the call graph.
 */
SELECT
    SCHEMA_NAME(o.schema_id)      AS CallerSchema,
    o.name                         AS CallerName,
    d.referenced_schema_name       AS ReferencedSchema,
    d.referenced_entity_name       AS ReferencedEntity,
    d.referenced_minor_name        AS ReferencedColumn,
    d.referenced_class_desc        AS ReferenceType
FROM sys.sql_expression_dependencies d
INNER JOIN sys.objects o ON o.object_id = d.referencing_id
WHERE o.type IN ('P', 'FN', 'TF', 'IF')  -- Procedures and functions
GO


-- ============================================================================
-- OPTIONAL: Sample data for testing queries
-- ============================================================================

-- Sample customers
INSERT INTO Orders.Customer (Email, FirstName, LastName, Phone, Tier) VALUES
    ('alice@example.com',  'Alice',  'Johnson', '+1-555-0101', 'GOLD'),
    ('bob@example.com',    'Bob',    'Smith',   '+1-555-0102', 'STANDARD'),
    ('carol@example.com',  'Carol',  'Williams','+1-555-0103', 'PLATINUM'),
    ('dave@example.com',   'Dave',   'Brown',   '+1-555-0104', 'SILVER'),
    ('eve@example.com',    'Eve',    'Davis',   '+1-555-0105', 'STANDARD');

-- Sample products
INSERT INTO Inventory.Product (SKU, Name, Category, UnitPrice, Weight) VALUES
    ('LAPTOP-PRO-15',  'Pro Laptop 15"',        'Electronics', 1299.99, 2.100),
    ('PHONE-ULTRA-X',  'Ultra Phone X',         'Electronics',  999.99, 0.185),
    ('HEADSET-BT-7',   'Bluetooth Headset 7',   'Electronics',   79.99, 0.220),
    ('CHARGER-USB-C',  'USB-C Fast Charger',    'Accessories',   29.99, 0.095),
    ('CASE-PHONE-X',   'Phone X Protective Case','Accessories',  19.99, 0.050),
    ('MONITOR-27-4K',  'Professional 27" 4K',   'Electronics',  549.99, 6.800),
    ('KEYBOARD-MECH',  'Mechanical Keyboard',   'Peripherals',  129.99, 0.900),
    ('MOUSE-ERGO',     'Ergonomic Mouse',       'Peripherals',   59.99, 0.120);

-- Sample stock
INSERT INTO Inventory.Stock (ProductId, WarehouseId, QuantityOnHand, QuantityReserved, ReorderPoint) VALUES
    (1, 1, 150, 12, 20),  (1, 2, 200, 8, 20),  (1, 3, 50, 3, 10),
    (2, 1, 300, 25, 50),  (2, 2, 250, 15, 50),
    (3, 1, 500, 40, 100), (3, 2, 400, 30, 100), (3, 3, 200, 10, 50),
    (4, 1, 1000, 50, 200),(4, 2, 800, 35, 200),
    (5, 1, 600, 20, 100), (5, 2, 500, 15, 100),
    (6, 1, 80, 5, 15),    (6, 2, 120, 8, 15),
    (7, 1, 250, 18, 40),  (7, 2, 200, 12, 40),
    (8, 1, 350, 22, 60),  (8, 2, 300, 16, 60);

-- Sample banking accounts
INSERT INTO Banking.Account (AccountNumber, AccountTypeId, CustomerId, Balance, Currency) VALUES
    ('PLAT-001-ESCROW',  4, NULL, 500000.00, 'USD'),  -- Platform escrow
    ('PLAT-002-OPS',     5, NULL, 125000.00, 'USD'),  -- Platform operations
    ('CUST-001-CHK',     1, 1,    15420.50,  'USD'),  -- Alice checking
    ('CUST-002-CHK',     1, 2,     3250.75,  'USD'),  -- Bob checking
    ('CUST-003-SAV',     2, 3,    48900.00,  'USD'),  -- Carol savings
    ('MERCH-001',        3, NULL,  82300.00,  'USD');  -- Merchant account

-- Sample cards
INSERT INTO Cards.CustomerCard (CustomerId, CardTypeId, MaskedNumber, CardHash, ExpiryMonth, ExpiryYear) VALUES
    (1, 1, '****-****-****-4242', 0xA1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2, 12, 2027),
    (2, 2, '****-****-****-5555', 0xB2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3, 6, 2028),
    (3, 3, '****-****-****-0005', 0xC3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4, 3, 2027),
    (4, 1, '****-****-****-1881', 0xD4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5, 9, 2026);

-- Sample orders
INSERT INTO Orders.OrderHeader (OrderNumber, CustomerId, Status, SubTotal, TaxAmount, ShippingCost, TotalAmount, ShippingAddr) VALUES
    ('ORD-2026-00001', 1, 'CONFIRMED',  1329.98, 106.40, 12.99, 1449.37, '123 Main St, New York, NY 10001'),
    ('ORD-2026-00002', 2, 'PENDING',      79.99,   6.40,  5.99,   92.38, '456 Oak Ave, Los Angeles, CA 90001'),
    ('ORD-2026-00003', 3, 'SHIPPED',    1859.97, 148.80, 0.00,  2008.77, '789 Pine Rd, Chicago, IL 60601'),
    ('ORD-2026-00004', 1, 'DELIVERED',    49.98,   4.00,  5.99,   59.97, '123 Main St, New York, NY 10001'),
    ('ORD-2026-00005', 4, 'PENDING',     679.98,  54.40,  9.99,  744.37, '321 Elm St, Houston, TX 77001');

-- Sample order lines
INSERT INTO Orders.OrderLine (OrderId, ProductId, Quantity, UnitPrice, Discount) VALUES
    (1, 1, 1, 1299.99, 0.00),   -- Laptop
    (1, 4, 1,   29.99, 0.00),   -- Charger
    (2, 3, 1,   79.99, 0.00),   -- Headset
    (3, 1, 1, 1299.99, 0.00),   -- Laptop
    (3, 6, 1,  549.99, 0.00),   -- Monitor
    (3, 5, 1,   19.99, 50.00),  -- Phone case (50% off)
    (4, 4, 1,   29.99, 0.00),   -- Charger
    (4, 5, 1,   19.99, 0.00),   -- Phone case
    (5, 6, 1,  549.99, 0.00),   -- Monitor
    (5, 7, 1,  129.99, 0.00);   -- Keyboard

-- Sample payments
INSERT INTO Payments.Payment (OrderId, MethodId, CardId, Amount, Status, GatewayRef, ProcessedAt) VALUES
    (1, 1, 1, 1449.37, 'CAPTURED',   'GW-TXN-A001', '2026-04-06 14:30:00'),
    (2, 1, 2,   92.38, 'PENDING',    NULL,            NULL),
    (3, 1, 3, 2008.77, 'CAPTURED',   'GW-TXN-A003', '2026-04-05 09:15:00'),
    (4, 2, NULL, 59.97, 'CAPTURED',  'GW-TXN-A004', '2026-03-28 11:00:00'),
    (5, 1, 4,  744.37, 'PENDING',    NULL,            NULL);

-- Sample status history
INSERT INTO Orders.OrderStatusHistory (OrderId, OldStatus, NewStatus, ChangedBy, ChangedAt, Notes) VALUES
    (1, 'PENDING',   'CONFIRMED',  'SYSTEM',       '2026-04-06 14:30:05', 'Payment captured'),
    (3, 'PENDING',   'CONFIRMED',  'SYSTEM',       '2026-04-05 09:15:10', 'Payment captured'),
    (3, 'CONFIRMED', 'PROCESSING', 'SYSTEM',       '2026-04-05 10:00:00', 'Picked and packed'),
    (3, 'PROCESSING','SHIPPED',    'CARRIER_FEED', '2026-04-06 08:00:00', 'UPS-1Z999AA10123456784'),
    (4, 'PENDING',   'CONFIRMED',  'SYSTEM',       '2026-03-28 11:00:05', 'Payment captured'),
    (4, 'CONFIRMED', 'SHIPPED',    'CARRIER_FEED', '2026-03-29 16:00:00', 'FEDEX-789456123'),
    (4, 'SHIPPED',   'DELIVERED',  'CARRIER_FEED', '2026-04-01 10:30:00', 'Delivered to front door');
GO


PRINT '========================================================';
PRINT ' ForensicsTestDB created successfully.';
PRINT ' ';
PRINT ' Schemas:     10';
PRINT ' Tables:      30+';
PRINT ' Stored Procs: 18';
PRINT ' Seed Data:    Customers, Products, Orders, Payments';
PRINT ' ';
PRINT ' Ready for SQLAtlas forensic analysis.';
PRINT '========================================================';
GO
