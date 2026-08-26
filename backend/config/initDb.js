const pool = require('./db');

const createTables = async () => {
    const queryText = `
        -- 1. Users Node Table
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255),
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- 2. Linked Accounts/Branches Table Context
        CREATE TABLE IF NOT EXISTS linked_accounts (
            id SERIAL PRIMARY KEY,
            user_id INT REFERENCES users(id) ON DELETE CASCADE,
            daftra_subdomain VARCHAR(100) NOT NULL,
            daftra_site_id VARCHAR(50) NOT NULL,
            encrypted_access_token TEXT NOT NULL,
            account_name VARCHAR(150),
            currency_code VARCHAR(10) DEFAULT 'EGP',
            webhook_secret VARCHAR(255),
            sync_status VARCHAR(50) DEFAULT 'connected',
            last_swept_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_user_subdomain UNIQUE (user_id, daftra_subdomain)
        );

        -- 3. Branches Cache Table
        CREATE TABLE IF NOT EXISTS branches_cache (
            id SERIAL PRIMARY KEY,
            account_id INT REFERENCES linked_accounts(id) ON DELETE CASCADE,
            daftra_branch_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            status INT DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_account_branch UNIQUE (account_id, daftra_branch_id)
        );

        -- 4. Invoices Cache Ledger Table (الفواتير العادية والمسودات)
        CREATE TABLE IF NOT EXISTS invoices_cache (
            id SERIAL PRIMARY KEY,
            account_id INT REFERENCES linked_accounts(id) ON DELETE CASCADE,
            daftra_invoice_id VARCHAR(100) NOT NULL,
            invoice_no VARCHAR(100) NOT NULL,
            client_id VARCHAR(50),
            branch_id INT,
            currency_code VARCHAR(10) DEFAULT 'EGP',
            exchange_rate NUMERIC(15, 6) DEFAULT 1.000000,
            total_debit NUMERIC(15, 4) DEFAULT 0.0000,
            total_credit NUMERIC(15, 4) DEFAULT 0.0000,
            currency_debit NUMERIC(15, 4) DEFAULT 0.0000,
            currency_credit NUMERIC(15, 4) DEFAULT 0.0000,
            issue_date DATE NOT NULL,
            due_date DATE,
            payment_status INT DEFAULT 0,
            requisition_delivery_status INT,
            gross_subtotal NUMERIC(15, 4) DEFAULT 0.0000,
            total_discount NUMERIC(15, 4) DEFAULT 0.0000,
            net_revenue NUMERIC(15, 4) DEFAULT 0.0000,
            tax_amount NUMERIC(15, 4) DEFAULT 0.0000,
            total_amount NUMERIC(15, 4) DEFAULT 0.0000,
            summary_paid NUMERIC(15, 4) DEFAULT 0.0000,
            summary_unpaid NUMERIC(15, 4) DEFAULT 0.0000,
            base_net_revenue NUMERIC(15, 4) DEFAULT 0.0000,
            base_total_amount NUMERIC(15, 4) DEFAULT 0.0000,
            base_summary_paid NUMERIC(15, 4) DEFAULT 0.0000,
            base_summary_unpaid NUMERIC(15, 4) DEFAULT 0.0000,
            total_cogs NUMERIC(15, 4) DEFAULT 0.0000,
            is_return INT DEFAULT 0,
            draft INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_account_invoice UNIQUE (account_id, daftra_invoice_id)
        );

        -- 5. Returns Cache Table (الفواتير المرتجعة)
        CREATE TABLE IF NOT EXISTS returns_cache (
            id SERIAL PRIMARY KEY,
            account_id INT REFERENCES linked_accounts(id) ON DELETE CASCADE,
            daftra_return_id VARCHAR(100) NOT NULL,
            return_no VARCHAR(100) NOT NULL,
            subscription_id VARCHAR(100),
            client_id VARCHAR(50),
            branch_id INT,
            currency_code VARCHAR(10) DEFAULT 'EGP',
            exchange_rate NUMERIC(15, 6) DEFAULT 1.000000,
            issue_date DATE NOT NULL,
            payment_status INT DEFAULT 0,
            gross_subtotal NUMERIC(15, 4) DEFAULT 0.0000,
            total_discount NUMERIC(15, 4) DEFAULT 0.0000,
            net_revenue NUMERIC(15, 4) DEFAULT 0.0000,
            tax_amount NUMERIC(15, 4) DEFAULT 0.0000,
            total_amount NUMERIC(15, 4) DEFAULT 0.0000,
            summary_paid NUMERIC(15, 4) DEFAULT 0.0000,
            summary_unpaid NUMERIC(15, 4) DEFAULT 0.0000,
            base_net_revenue NUMERIC(15, 4) DEFAULT 0.0000,
            base_total_amount NUMERIC(15, 4) DEFAULT 0.0000,
            base_summary_paid NUMERIC(15, 4) DEFAULT 0.0000,
            base_summary_unpaid NUMERIC(15, 4) DEFAULT 0.0000,
            total_cogs NUMERIC(15, 4) DEFAULT 0.0000,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_account_return UNIQUE (account_id, daftra_return_id)
        );

        -- 6. Cost of Goods Sold Tracking Guard
        CREATE TABLE IF NOT EXISTS processed_cogs_entries (
            id SERIAL PRIMARY KEY,
            account_id INT REFERENCES linked_accounts(id) ON DELETE CASCADE,
            daftra_site_id VARCHAR(50) NOT NULL,
            journal_entry_id INT NOT NULL,
            invoice_id INT NOT NULL,
            processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_journal_per_account UNIQUE (account_id, journal_entry_id)
        );

        -- 7. Clients Cache Ledger Directory Node
        CREATE TABLE IF NOT EXISTS clients_cache (
            id SERIAL PRIMARY KEY,
            account_id INT REFERENCES linked_accounts(id) ON DELETE CASCADE,
            branch_id INT,
            daftra_client_id VARCHAR(50) NOT NULL,
            client_name VARCHAR(255) NOT NULL,
            client_email VARCHAR(255),
            client_phone VARCHAR(50),
            currency VARCHAR(10) DEFAULT 'EGP',
            current_balance DECIMAL(15, 2) DEFAULT 0.00,
            daftra_created_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_account_client UNIQUE (account_id, daftra_client_id)
        );

        -- 8. Treasury Definitions & Live Balances
        CREATE TABLE IF NOT EXISTS treasuries_cache (
            id SERIAL PRIMARY KEY,
            account_id INT REFERENCES linked_accounts(id) ON DELETE CASCADE,
            journal_account_id INT NOT NULL,
            entity_id VARCHAR(50),
            name VARCHAR(255) NOT NULL,
            branch_id INT,
            opening_balance NUMERIC(15, 4) DEFAULT 0.0000,
            current_balance NUMERIC(15, 4) DEFAULT 0.0000,
            currency_code VARCHAR(10) DEFAULT 'EGP',
            last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_account_journal_treasury UNIQUE (account_id, journal_account_id)
        );

        -- 9. Treasury Detailed Transactions Stream
        CREATE TABLE IF NOT EXISTS treasury_transactions_cache (
            id SERIAL PRIMARY KEY,
            account_id INT REFERENCES linked_accounts(id) ON DELETE CASCADE,
            journal_account_id INT NOT NULL,
            journal_id INT NOT NULL,
            branch_id INT,
            entity_type VARCHAR(50),
            currency_code VARCHAR(10) DEFAULT 'EGP',
            exchange_rate NUMERIC(15, 6) DEFAULT 1.000000,
            currency_debit NUMERIC(15, 4) DEFAULT 0.0000,
            currency_credit NUMERIC(15, 4) DEFAULT 0.0000,
            debit NUMERIC(15, 4) DEFAULT 0.0000,
            credit NUMERIC(15, 4) DEFAULT 0.0000,
            description TEXT,
            transaction_date TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_account_treasury_txn UNIQUE (account_id, journal_account_id, journal_id)
        );

        -- 10. Live Daily Treasury Snapshot
        CREATE TABLE IF NOT EXISTS daily_treasury_totals (
            id SERIAL PRIMARY KEY,
            account_id INT REFERENCES linked_accounts(id) ON DELETE CASCADE,
            journal_account_id INT NOT NULL,
            branch_id INT,
            currency_code VARCHAR(10) DEFAULT 'EGP',
            record_date DATE NOT NULL,
            opening_balance NUMERIC(15, 4) DEFAULT 0.0000,
            today_inflow NUMERIC(15, 4) DEFAULT 0.0000,
            today_outflow NUMERIC(15, 4) DEFAULT 0.0000,
            net_change NUMERIC(15, 4) DEFAULT 0.0000,
            closing_balance NUMERIC(15, 4) DEFAULT 0.0000,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_treasury_daily_snapshot UNIQUE (account_id, journal_account_id)
        );

        -- 11. Journal Categories Cache
        CREATE TABLE IF NOT EXISTS journal_categories_cache (
            id SERIAL PRIMARY KEY,
            account_id INT REFERENCES linked_accounts(id) ON DELETE CASCADE,
            daftra_category_id INT NOT NULL,
            code VARCHAR(50),
            name VARCHAR(255) NOT NULL,
            parent_category_id INT,
            parent_cat_ids VARCHAR(255),
            type INT DEFAULT 0,
            total_amount NUMERIC(15, 4) DEFAULT 0.0000,
            branch_id INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_account_journal_cat UNIQUE (account_id, daftra_category_id)
        );

        -- 12. Journal Accounts Cache
        CREATE TABLE IF NOT EXISTS journal_accounts_cache (
            id SERIAL PRIMARY KEY,
            account_id INT REFERENCES linked_accounts(id) ON DELETE CASCADE,
            daftra_account_id INT NOT NULL,
            code VARCHAR(50),
            name VARCHAR(255) NOT NULL,
            journal_cat_id INT NOT NULL,
            type INT DEFAULT 0,
            total_amount NUMERIC(15, 4) DEFAULT 0.0000,
            entity_type VARCHAR(100),
            entity_id VARCHAR(50),
            branch_id INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_account_journal_account UNIQUE (account_id, daftra_account_id)
        );

        -- 13. Journal Transactions Cache
        CREATE TABLE IF NOT EXISTS journal_transactions_cache (
            id SERIAL PRIMARY KEY,
            account_id INT REFERENCES linked_accounts(id) ON DELETE CASCADE,
            daftra_txn_id INT NOT NULL,
            journal_id INT NOT NULL,
            journal_account_id INT NOT NULL,
            branch_id INT,
            subkey VARCHAR(100),
            description TEXT,
            currency_code VARCHAR(10) DEFAULT 'EGP',
            exchange_rate NUMERIC(15, 6) DEFAULT 1.000000,
            currency_debit NUMERIC(15, 4) DEFAULT 0.0000,
            currency_credit NUMERIC(15, 4) DEFAULT 0.0000,
            debit NUMERIC(15, 4) DEFAULT 0.0000,
            credit NUMERIC(15, 4) DEFAULT 0.0000,
            transaction_date TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_account_journal_txn UNIQUE (account_id, daftra_txn_id)
        );

        -- 14. Background Sync Progress Tracking Worker
        CREATE TABLE IF NOT EXISTS sync_jobs (
            id SERIAL PRIMARY KEY,
            user_id INT REFERENCES users(id) ON DELETE CASCADE,
            account_id INT REFERENCES linked_accounts(id) ON DELETE CASCADE,
            status VARCHAR(20) DEFAULT 'pending',
            current_step VARCHAR(50) DEFAULT 'initializing',
            total_records INT DEFAULT 0,
            processed_records INT DEFAULT 0,
            progress_percentage INT DEFAULT 0,
            error_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- 15. Products Cache Directory
        CREATE TABLE IF NOT EXISTS products_cache (
            id SERIAL PRIMARY KEY,
            account_id INT REFERENCES linked_accounts(id) ON DELETE CASCADE,
            daftra_product_id VARCHAR(50) NOT NULL,
            branch_id INT,
            name VARCHAR(255) NOT NULL,
            product_code VARCHAR(100),
            barcode VARCHAR(100),
            unit_price NUMERIC(15, 4) DEFAULT 0.0000,
            stock_balance NUMERIC(15, 4) DEFAULT 0.0000,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_account_product UNIQUE (account_id, daftra_product_id)
        );

        -- 16. Daily Product Sales Matrix
        CREATE TABLE IF NOT EXISTS daily_product_sales_cache (
            id SERIAL PRIMARY KEY,
            account_id INT REFERENCES linked_accounts(id) ON DELETE CASCADE,
            daftra_product_id VARCHAR(50) NOT NULL,
            branch_id INT,
            sale_date DATE NOT NULL,
            sold_quantity NUMERIC(15, 4) DEFAULT 0.0000,
            delivered_quantity NUMERIC(15, 4) DEFAULT 0.0000,
            pending_quantity NUMERIC(15, 4) DEFAULT 0.0000,
            returned_quantity NUMERIC(15, 4) DEFAULT 0.0000,
            net_quantity NUMERIC(15, 4) DEFAULT 0.0000,
            net_sales_amount NUMERIC(15, 4) DEFAULT 0.0000,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_product_daily_sales UNIQUE (account_id, daftra_product_id, branch_id, sale_date)
        );

        -- 17. Invoice Payments Cache Table
        CREATE TABLE IF NOT EXISTS invoice_payments_cache (
            id SERIAL PRIMARY KEY,
            account_id INT REFERENCES linked_accounts(id) ON DELETE CASCADE,
            daftra_payment_id INT NOT NULL,
            invoice_id INT,
            invoice_no VARCHAR(100),
            client_id INT,
            payment_method VARCHAR(50),
            amount NUMERIC(15, 4) DEFAULT 0.0000,
            base_amount NUMERIC(15, 4) DEFAULT 0.0000,
            currency_code VARCHAR(10) DEFAULT 'EGP',
            exchange_rate NUMERIC(15, 6) DEFAULT 1.000000,
            payment_type VARCHAR(50) NOT NULL,
            payment_date TIMESTAMP NOT NULL,
            treasury_id INT,
            branch_id INT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_account_payment UNIQUE (account_id, daftra_payment_id)
        );

        -- 🎯 18. User Dashboard Preferences Table (تفضيلات العرض والعملة الموحدة)
        CREATE TABLE IF NOT EXISTS user_dashboard_preferences (
            id SERIAL PRIMARY KEY,
            user_id INT REFERENCES users(id) ON DELETE CASCADE UNIQUE,
            is_unified_enabled BOOLEAN DEFAULT FALSE,
            active_currency VARCHAR(10) DEFAULT 'DEFAULT',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- 🎯 19. User Exchange Rates Table (أسعار التحويل المباشرة المدخلة)
        CREATE TABLE IF NOT EXISTS user_exchange_rates (
            id SERIAL PRIMARY KEY,
            user_id INT REFERENCES users(id) ON DELETE CASCADE,
            from_currency VARCHAR(10) NOT NULL,
            to_currency VARCHAR(10) NOT NULL,
            exchange_value NUMERIC(15, 6) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_user_currency_pair UNIQUE (user_id, from_currency, to_currency)
        );
    `;
    try {
        await pool.query(queryText);
        console.log('All database schema tables initialized cleanly.');
    } catch (err) {
        console.error('Critical database schema initialization failure:', err);
    }
};

module.exports = createTables;