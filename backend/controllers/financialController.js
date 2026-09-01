const pool = require('../config/db');
const axios = require('axios');
const {
    executeFullAccountSync,
    executeBulkUserSync,
    recalculateGlobalUserRollup,
    updateJobProgress,
    syncChartOfAccounts
} = require('../services/syncService');
const { getUserCurrencyContext, convertToActiveCurrency } = require('../utils/currencyHelper');

/**
 * ⚡ 1. Fetch Global Recent Dashboard Widgets (يدعم تحويل العملة الموحدة)
 */
const getGlobalRecentWidgets = async (req, res) => {
    try {
        const userId = req.user.userId; // 🎯 أمان: استخراج من التوكن فقط
        const { targetCurrency } = req.query;

        const currencyContext = await getUserCurrencyContext(userId);
        const isUnified = !!(targetCurrency && targetCurrency !== 'DEFAULT');
        const activeCurrency = isUnified ? targetCurrency.toUpperCase().trim() : 'DEFAULT';

        const recentAccounts = await pool.query(
            'SELECT id, account_name, daftra_subdomain, currency_code, created_at FROM linked_accounts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5;',
            [userId]
        );

        const recentInvoicesQuery = `
            SELECT 
                ic.id, ic.invoice_no, ic.total_amount, ic.currency_code, ic.exchange_rate,
                ic.base_total_amount, ic.base_summary_paid, ic.base_summary_unpaid,
                ic.payment_status, ic.summary_paid, ic.summary_unpaid, ic.issue_date, ic.due_date,
                ic.requisition_delivery_status, ic.is_return, ic.draft, 
                la.account_name, 
                la.currency_code AS account_base_currency,
                bc.name AS branch_name
            FROM invoices_cache ic 
            JOIN linked_accounts la ON ic.account_id = la.id 
            LEFT JOIN branches_cache bc ON ic.account_id = bc.account_id AND ic.branch_id = bc.daftra_branch_id
            WHERE la.user_id = $1
            ORDER BY ic.issue_date DESC, ic.id DESC LIMIT 5;
        `;
        const recentInvoicesRes = await pool.query(recentInvoicesQuery, [userId]);

        const recentClients = await pool.query(`
            SELECT cc.id, cc.client_name, cc.client_email, cc.currency, la.account_name, bc.name AS branch_name
            FROM clients_cache cc 
            JOIN linked_accounts la ON cc.account_id = la.id 
            LEFT JOIN branches_cache bc ON cc.account_id = bc.account_id AND cc.branch_id = bc.daftra_branch_id
            WHERE la.user_id = $1 
            ORDER BY cc.created_at DESC LIMIT 5;
        `, [userId]);

        const processedInvoices = recentInvoicesRes.rows.map(inv => {
            const accCurr = (inv.account_base_currency || inv.currency_code || 'EGP').toUpperCase().trim();
            const rawTotal = parseFloat(inv.base_total_amount || inv.total_amount || 0);

            return {
                ...inv,
                is_unified: isUnified,
                display_currency: isUnified ? activeCurrency : (inv.currency_code || accCurr),
                total_amount: isUnified ? convertToActiveCurrency(rawTotal, accCurr, activeCurrency, currencyContext.exchangeRates) : rawTotal
            };
        });

        res.json({ accounts: recentAccounts.rows, invoices: processedInvoices, clients: recentClients.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * ⚡ 2. Fetch Single Branch Recent Dashboard Widgets (يدعم تحويل العملة الموحدة)
 */
const getBranchRecentWidgets = async (req, res) => {
    try {
        const { accountId } = req.params;
        const userId = req.user.userId; // 🎯 أمان: التحقق من التوكن
        const { targetCurrency } = req.query;

        // 🎯 أمان: التحقق من ملكية الحساب
        const accUserRes = await pool.query('SELECT user_id, currency_code FROM linked_accounts WHERE id = $1 AND user_id = $2', [accountId, userId]);
        if (accUserRes.rows.length === 0) {
            return res.status(403).json({ error: 'Unauthorized or Branch account not found' });
        }

        const accountBaseCurrency = (accUserRes.rows[0].currency_code || 'EGP').toUpperCase().trim();

        const currencyContext = await getUserCurrencyContext(userId);
        const isUnified = !!(targetCurrency && targetCurrency !== 'DEFAULT');
        const activeCurrency = isUnified ? targetCurrency.toUpperCase().trim() : accountBaseCurrency;

        const recentInvoices = await pool.query(`
            SELECT 
                ic.id, ic.invoice_no, ic.total_amount, ic.currency_code, ic.exchange_rate,
                ic.base_total_amount, ic.base_summary_paid, ic.base_summary_unpaid,
                ic.payment_status, ic.summary_paid, ic.summary_unpaid, ic.issue_date, ic.due_date, 
                ic.requisition_delivery_status, ic.is_return, ic.draft, bc.name AS branch_name
            FROM invoices_cache ic
            LEFT JOIN branches_cache bc ON ic.account_id = bc.account_id AND ic.branch_id = bc.daftra_branch_id
            WHERE ic.account_id = $1
            ORDER BY ic.issue_date DESC, ic.id DESC LIMIT 5;
        `, [accountId]);

        const recentClients = await pool.query(`
            SELECT cc.id, cc.client_name, cc.client_email, cc.currency, bc.name AS branch_name
            FROM clients_cache cc
            LEFT JOIN branches_cache bc ON cc.account_id = bc.account_id AND cc.branch_id = bc.daftra_branch_id
            WHERE cc.account_id = $1 
            ORDER BY cc.created_at DESC LIMIT 5;
        `, [accountId]);

        const processedInvoices = recentInvoices.rows.map(inv => {
            const rawTotal = parseFloat(inv.base_total_amount || inv.total_amount || 0);

            return {
                ...inv,
                is_unified: isUnified,
                display_currency: isUnified ? activeCurrency : accountBaseCurrency,
                total_amount: isUnified ? convertToActiveCurrency(rawTotal, accountBaseCurrency, activeCurrency, currencyContext.exchangeRates) : rawTotal
            };
        });

        res.json({ invoices: processedInvoices, clients: recentClients.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * 📊 2.1 Fetch Sales Widget (أحدث المبيعات والتحصيلات + توزيع المبيعات للرسم البياني)
 */
const getRecentSalesWidget = async (req, res) => {
    try {
        let { accountId, targetCurrency } = req.query;
        const userId = req.user.userId;

        if (accountId) {
            const accUserRes = await pool.query(
                'SELECT user_id FROM linked_accounts WHERE id = $1::int AND user_id = $2::int',
                [parseInt(accountId, 10), parseInt(userId, 10)]
            );
            if (accUserRes.rows.length === 0) {
                return res.status(403).json({ error: "Unauthorized" });
            }
        }

        const currencyContext = userId ? await getUserCurrencyContext(userId) : { exchangeRates: {} };
        const isUnified = !!(targetCurrency && targetCurrency !== 'DEFAULT');
        const activeCurrency = isUnified ? targetCurrency.toUpperCase().trim() : 'DEFAULT';

        const filterClause = accountId ? `ipc.account_id = $1::int` : `la.user_id = $1::int`;
        const queryParams = accountId ? [parseInt(accountId, 10)] : [parseInt(userId, 10)];

        // 🎯 1. أحدث 5 مدفوعات نقدية/بنكية فعلية (مستبعد منها الـ Starting Balance)
        const recentPaymentsQuery = `
            SELECT 
                ipc.id,
                COALESCE(ipc.invoice_no, CONCAT('دفعة #', ipc.daftra_payment_id)) AS invoice_no,
                ipc.amount AS raw_amount,
                ipc.base_amount AS amount,
                ipc.currency_code,
                ipc.payment_date,
                COALESCE(c.client_name, 'عميل') AS client_name,
                la.account_name,
                la.currency_code AS account_base_currency,
                COALESCE(bc.name, 'الفرع الرئيسي') AS branch_name,
                LOWER(TRIM(ipc.payment_method)) AS payment_method
            FROM invoice_payments_cache ipc
            JOIN linked_accounts la ON ipc.account_id = la.id
            LEFT JOIN clients_cache c 
                ON ipc.account_id = c.account_id 
                AND TRIM(ipc.client_id::text) = TRIM(c.daftra_client_id::text)
            LEFT JOIN branches_cache bc 
                ON ipc.account_id = bc.account_id 
                AND ipc.branch_id = bc.daftra_branch_id
            WHERE ${filterClause}
            AND ipc.amount > 0 
            AND LOWER(TRIM(ipc.payment_method)) != 'starting_balance'
            AND (ipc.payment_type IS NULL OR ipc.payment_type != 'starting_balance')
            ORDER BY ipc.payment_date DESC, ipc.id DESC
            LIMIT 5;
        `;

        // 🎯 2. تجميع المبيعات حسب طريقة الدفع وعملة الحساب نفسه
        const breakdownQuery = `
            SELECT 
                LOWER(TRIM(ipc.payment_method)) AS payment_method,
                UPPER(TRIM(la.currency_code)) AS currency_code,
                COALESCE(SUM(ipc.amount), 0) AS total_original_amount,
                COALESCE(SUM(ipc.base_amount), 0) AS total_base_amount
            FROM invoice_payments_cache ipc
            JOIN linked_accounts la ON ipc.account_id = la.id
            WHERE ${filterClause}
            AND ipc.amount > 0
            AND LOWER(TRIM(ipc.payment_method)) != 'starting_balance'
            AND (ipc.payment_type IS NULL OR ipc.payment_type != 'starting_balance')
            AND ipc.payment_date >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY 1, 2;
        `;

        const [recentRes, breakdownRes] = await Promise.all([
            pool.query(recentPaymentsQuery, queryParams),
            pool.query(breakdownQuery, queryParams)
        ]);

        const processedSales = recentRes.rows.map(row => {
            const accCurr = (row.currency_code || row.account_base_currency || 'EGP').toUpperCase().trim();
            const rawAmount = parseFloat(row.amount || 0);

            return {
                ...row,
                is_unified: isUnified,
                display_currency: isUnified ? activeCurrency : accCurr,
                amount: isUnified ? convertToActiveCurrency(rawAmount, accCurr, activeCurrency, currencyContext.exchangeRates) : rawAmount
            };
        });

        // 🎯 3. هيكلة البيانات لدعم الـ Hover وتفاصيل كل عملة بصورة دقيقة
        const methodsMap = {};

        breakdownRes.rows.forEach(row => {
            const methodKey = row.payment_method || 'cash';
            const curr = (row.currency_code || 'EGP').toUpperCase().trim();
            const origAmt = parseFloat(row.total_original_amount || 0);
            const baseAmt = parseFloat(row.total_base_amount || 0);

            const calculatedAmt = isUnified
                ? convertToActiveCurrency(baseAmt, curr, activeCurrency, currencyContext.exchangeRates)
                : baseAmt;

            if (!methodsMap[methodKey]) {
                methodsMap[methodKey] = {
                    totalChartValue: 0,
                    currencies: {}
                };
            }

            methodsMap[methodKey].totalChartValue += calculatedAmt;
            methodsMap[methodKey].currencies[curr] = (methodsMap[methodKey].currencies[curr] || 0) + origAmt;
        });

        const breakdownChartData = Object.keys(methodsMap).map(methodKey => ({
            rawKey: methodKey,
            name: methodKey,
            value: methodsMap[methodKey].totalChartValue,
            currenciesBreakdown: Object.keys(methodsMap[methodKey].currencies)
                .filter(c => parseFloat(methodsMap[methodKey].currencies[c] || 0) > 0)
                .map(c => ({
                    currency: c,
                    amount: methodsMap[methodKey].currencies[c]
                }))
        }));

        return res.json({
            recentSales: processedSales,
            salesBreakdown: breakdownChartData,
            displayCurrency: isUnified ? activeCurrency : 'DEFAULT'
        });

    } catch (err) {
        console.error("❌ [getRecentSalesWidget] Error:", err.message);
        return res.status(500).json({ error: err.message });
    }
};

/**
 * 📇 3. Server-Side Paginated Invoices Ledger (حساب وتجهيز قيم base_ الكلية بناءً على سعر الصرف)
 */
const getLedgersPaginated = async (req, res) => {
    try {
        const userId = req.user.userId; // 🎯 أمان
        const { accountId, page = 1, limit = 10, targetCurrency } = req.query;
        const parsedLimit = parseInt(limit, 10);
        const offset = (parseInt(page, 10) - 1) * parsedLimit;

        // 🎯 أمان
        if (accountId) {
            const accUserRes = await pool.query('SELECT user_id FROM linked_accounts WHERE id = $1::int AND user_id = $2::int', [parseInt(accountId, 10), parseInt(userId, 10)]);
            if (accUserRes.rows.length === 0) return res.status(403).json({ error: "Unauthorized" });
        }

        const currencyContext = await getUserCurrencyContext(userId);
        const isUnified = !!(targetCurrency && targetCurrency !== 'DEFAULT');
        const activeCurrency = isUnified ? targetCurrency.toUpperCase().trim() : 'DEFAULT';

        let dataQuery, countQuery, queryParams;

        if (accountId) {
            dataQuery = `
                SELECT 
                    ic.*, 
                    bc.name AS branch_name,
                    la.account_name,
                    la.currency_code AS account_base_currency,
                    COALESCE(rc_totals.total_returned, 0) AS total_returned
                FROM invoices_cache ic 
                JOIN linked_accounts la ON ic.account_id = la.id
                LEFT JOIN branches_cache bc 
                    ON ic.account_id = bc.account_id 
                    AND ic.branch_id = bc.daftra_branch_id
                LEFT JOIN (
                    SELECT account_id, subscription_id, SUM(base_total_amount) AS total_returned
                    FROM returns_cache
                    WHERE subscription_id IS NOT NULL AND subscription_id != ''
                    GROUP BY account_id, subscription_id
                ) rc_totals 
                    ON ic.account_id = rc_totals.account_id 
                    AND TRIM(ic.daftra_invoice_id::text) = TRIM(rc_totals.subscription_id::text)
                WHERE ic.account_id = $1::int
                ORDER BY ic.issue_date DESC, ic.id DESC 
                LIMIT $2 OFFSET $3;
            `;
            countQuery = `SELECT COUNT(*) FROM invoices_cache WHERE account_id = $1::int;`;
            queryParams = [parseInt(accountId, 10), parsedLimit, offset];
        } else {
            dataQuery = `
                SELECT 
                    ic.*, 
                    bc.name AS branch_name,
                    la.account_name, 
                    la.currency_code AS account_base_currency,
                    COALESCE(rc_totals.total_returned, 0) AS total_returned
                FROM invoices_cache ic 
                JOIN linked_accounts la ON ic.account_id = la.id 
                LEFT JOIN branches_cache bc 
                    ON ic.account_id = bc.account_id 
                    AND ic.branch_id = bc.daftra_branch_id
                LEFT JOIN (
                    SELECT account_id, subscription_id, SUM(base_total_amount) AS total_returned
                    FROM returns_cache
                    WHERE subscription_id IS NOT NULL AND subscription_id != ''
                    GROUP BY account_id, subscription_id
                ) rc_totals 
                    ON ic.account_id = rc_totals.account_id 
                    AND TRIM(ic.daftra_invoice_id::text) = TRIM(rc_totals.subscription_id::text)
                WHERE la.user_id = $1::int
                ORDER BY ic.issue_date DESC, ic.id DESC 
                LIMIT $2 OFFSET $3;
            `;
            countQuery = `SELECT COUNT(*) FROM invoices_cache ic JOIN linked_accounts la ON ic.account_id = la.id WHERE la.user_id = $1::int;`;
            queryParams = [parseInt(userId, 10), parsedLimit, offset];
        }

        const dataResult = await pool.query(dataQuery, queryParams);
        const countResult = await pool.query(countQuery, [queryParams[0]]);
        const totalRows = parseInt(countResult.rows[0].count, 10);

        const processedRows = dataResult.rows.map(row => {
            const accCurr = (row.account_base_currency || 'EGP').toUpperCase().trim();
            const invCurr = (row.currency_code || accCurr).toUpperCase().trim();

            const origGrossSubtotal = parseFloat(row.gross_subtotal || 0);
            const origNetRevenue = parseFloat(row.net_revenue || 0);
            const origTax = parseFloat(row.tax_amount || 0);
            const origTotalAmount = parseFloat(row.total_amount || 0);
            const origSummaryPaid = parseFloat(row.summary_paid || 0);
            const origSummaryUnpaid = parseFloat(row.summary_unpaid || 0);

            let rate = parseFloat(row.exchange_rate || 1);
            if (rate === 1 && origTotalAmount > 0 && row.base_total_amount) {
                rate = parseFloat(row.base_total_amount) / origTotalAmount;
            }

            const baseGrossSubtotal = origGrossSubtotal * rate;
            const baseNetRevenue = parseFloat(row.base_net_revenue || (origNetRevenue * rate));
            const baseTax = origTax * rate;
            const baseTotalAmount = parseFloat(row.base_total_amount || (origTotalAmount * rate));
            const baseCogs = parseFloat(row.total_cogs || 0);
            const baseSummaryPaid = parseFloat(row.base_summary_paid || (origSummaryPaid * rate));
            const baseSummaryUnpaid = parseFloat(row.base_summary_unpaid || (origSummaryUnpaid * rate));

            return {
                ...row,
                is_unified: isUnified,
                display_currency: isUnified ? activeCurrency : invCurr,
                account_base_currency: accCurr,
                exchange_rate: rate,

                gross_subtotal: isUnified ? convertToActiveCurrency(baseGrossSubtotal, accCurr, activeCurrency, currencyContext.exchangeRates) : origGrossSubtotal,
                net_revenue: isUnified ? convertToActiveCurrency(baseNetRevenue, accCurr, activeCurrency, currencyContext.exchangeRates) : origNetRevenue,
                tax_amount: isUnified ? convertToActiveCurrency(baseTax, accCurr, activeCurrency, currencyContext.exchangeRates) : origTax,
                total_amount: isUnified ? convertToActiveCurrency(baseTotalAmount, accCurr, activeCurrency, currencyContext.exchangeRates) : origTotalAmount,
                summary_paid: isUnified ? convertToActiveCurrency(baseSummaryPaid, accCurr, activeCurrency, currencyContext.exchangeRates) : origSummaryPaid,
                summary_unpaid: isUnified ? convertToActiveCurrency(baseSummaryUnpaid, accCurr, activeCurrency, currencyContext.exchangeRates) : origSummaryUnpaid,

                base_gross_subtotal: isUnified ? convertToActiveCurrency(baseGrossSubtotal, accCurr, activeCurrency, currencyContext.exchangeRates) : baseGrossSubtotal,
                base_net_revenue: isUnified ? convertToActiveCurrency(baseNetRevenue, accCurr, activeCurrency, currencyContext.exchangeRates) : baseNetRevenue,
                base_tax_amount: isUnified ? convertToActiveCurrency(baseTax, accCurr, activeCurrency, currencyContext.exchangeRates) : baseTax,
                base_total_amount: isUnified ? convertToActiveCurrency(baseTotalAmount, accCurr, activeCurrency, currencyContext.exchangeRates) : baseTotalAmount,
                base_summary_paid: isUnified ? convertToActiveCurrency(baseSummaryPaid, accCurr, activeCurrency, currencyContext.exchangeRates) : baseSummaryPaid,
                base_summary_unpaid: isUnified ? convertToActiveCurrency(baseSummaryUnpaid, accCurr, activeCurrency, currencyContext.exchangeRates) : baseSummaryUnpaid,
                total_cogs: isUnified ? convertToActiveCurrency(baseCogs, accCurr, activeCurrency, currencyContext.exchangeRates) : baseCogs,
            };
        });

        res.json({
            data: processedRows,
            pagination: { page: parseInt(page, 10), limit: parsedLimit, totalRows, totalPages: Math.ceil(totalRows / parsedLimit) }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * 🎯 4. Server-Side Paginated Clients Directory (يدعم تحويل العملة الموحدة)
 */
const getClientsPaginated = async (req, res) => {
    try {
        const userId = req.user.userId; // 🎯 أمان
        const { accountId, page = 1, limit = 10, targetCurrency } = req.query;
        const parsedLimit = parseInt(limit, 10);
        const offset = (parseInt(page, 10) - 1) * parsedLimit;

        if (accountId) {
            const accUserRes = await pool.query('SELECT user_id FROM linked_accounts WHERE id = $1 AND user_id = $2', [accountId, userId]);
            if (accUserRes.rows.length === 0) return res.status(403).json({ error: "Unauthorized" });
        }

        const currencyContext = await getUserCurrencyContext(userId);
        const isUnified = !!(targetCurrency && targetCurrency !== 'DEFAULT');
        const activeCurrency = isUnified ? targetCurrency.toUpperCase().trim() : 'DEFAULT';

        let dataQuery, countQuery, queryParams;

        if (accountId) {
            dataQuery = `
                SELECT 
                    cc.*, 
                    la.account_name,
                    la.daftra_subdomain,
                    la.currency_code AS account_base_currency,
                    bc.name AS branch_name,
                    COALESCE(SUM(ic.base_summary_paid + ic.base_summary_unpaid), 0) AS total_invoiced,
                    COALESCE(SUM(ic.summary_paid + ic.summary_unpaid), 0) AS orig_total_invoiced,
                    COALESCE(SUM(ic.base_summary_paid), 0) AS total_paid,
                    COALESCE(SUM(ic.summary_paid), 0) AS orig_total_paid,
                    COALESCE(MAX(rc_totals.total_returned), 0) AS total_returned,
                    COALESCE(SUM(ic.base_summary_unpaid), 0) AS total_unpaid,
                    COALESCE(SUM(ic.summary_unpaid), 0) AS orig_total_unpaid,
                    COUNT(CASE WHEN ic.due_date IS NOT NULL AND ic.due_date < CURRENT_DATE AND ic.payment_status IN (0, 1) THEN 1 END) AS overdue_count
                FROM clients_cache cc
                JOIN linked_accounts la ON cc.account_id = la.id
                LEFT JOIN branches_cache bc ON cc.account_id = bc.account_id AND cc.branch_id = bc.daftra_branch_id
                LEFT JOIN invoices_cache ic ON cc.account_id = ic.account_id AND TRIM(ic.client_id::text) = TRIM(cc.daftra_client_id::text) AND (ic.is_return IS NULL OR ic.is_return != 1) AND (ic.draft IS NULL OR ic.draft = 0)
                LEFT JOIN (
                    SELECT account_id, client_id, SUM(base_total_amount) as total_returned
                    FROM returns_cache GROUP BY account_id, client_id
                ) rc_totals ON cc.account_id = rc_totals.account_id AND TRIM(rc_totals.client_id::text) = TRIM(cc.daftra_client_id::text)
                WHERE cc.account_id = $1
                GROUP BY cc.id, la.account_name, la.daftra_subdomain, la.currency_code, bc.name
                ORDER BY cc.daftra_created_at DESC, cc.id DESC
                LIMIT $2 OFFSET $3;
            `;
            countQuery = `SELECT COUNT(*) FROM clients_cache WHERE account_id = $1;`;
            queryParams = [accountId, parsedLimit, offset];
        } else {
            dataQuery = `
                SELECT 
                    cc.*, 
                    la.account_name,
                    la.daftra_subdomain,
                    la.currency_code AS account_base_currency,
                    bc.name AS branch_name,
                    COALESCE(SUM(ic.base_summary_paid + ic.base_summary_unpaid), 0) AS total_invoiced,
                    COALESCE(SUM(ic.summary_paid + ic.summary_unpaid), 0) AS orig_total_invoiced,
                    COALESCE(SUM(ic.base_summary_paid), 0) AS total_paid,
                    COALESCE(SUM(ic.summary_paid), 0) AS orig_total_paid,
                    COALESCE(MAX(rc_totals.total_returned), 0) AS total_returned,
                    COALESCE(SUM(ic.base_summary_unpaid), 0) AS total_unpaid,
                    COALESCE(SUM(ic.summary_unpaid), 0) AS orig_total_unpaid,
                    COUNT(CASE WHEN ic.due_date IS NOT NULL AND ic.due_date < CURRENT_DATE AND ic.payment_status IN (0, 1) THEN 1 END) AS overdue_count
                FROM clients_cache cc
                JOIN linked_accounts la ON cc.account_id = la.id
                LEFT JOIN branches_cache bc ON cc.account_id = bc.account_id AND cc.branch_id = bc.daftra_branch_id
                LEFT JOIN invoices_cache ic ON cc.account_id = ic.account_id AND TRIM(ic.client_id::text) = TRIM(cc.daftra_client_id::text) AND (ic.is_return IS NULL OR ic.is_return != 1) AND (ic.draft IS NULL OR ic.draft = 0)
                LEFT JOIN (
                    SELECT account_id, client_id, SUM(base_total_amount) as total_returned
                    FROM returns_cache GROUP BY account_id, client_id
                ) rc_totals ON cc.account_id = rc_totals.account_id AND TRIM(rc_totals.client_id::text) = TRIM(cc.daftra_client_id::text)
                WHERE la.user_id = $1
                GROUP BY cc.id, la.account_name, la.daftra_subdomain, la.currency_code, bc.name
                ORDER BY cc.daftra_created_at DESC, cc.id DESC
                LIMIT $2 OFFSET $3;
            `;
            countQuery = `SELECT COUNT(*) FROM clients_cache cc JOIN linked_accounts la ON cc.account_id = la.id WHERE la.user_id = $1;`;
            queryParams = [userId, parsedLimit, offset];
        }

        const dataResult = await pool.query(dataQuery, queryParams);
        const countResult = await pool.query(countQuery, [queryParams[0]]);
        const totalRows = parseInt(countResult.rows[0].count, 10);

        const processedRows = dataResult.rows.map(row => {
            const accCurr = (row.account_base_currency || row.currency || 'EGP').toUpperCase().trim();
            const rawInvoiced = parseFloat(row.total_invoiced || 0);
            const rawPaid = parseFloat(row.total_paid || 0);
            const rawUnpaid = parseFloat(row.total_unpaid || 0);
            const rawReturned = parseFloat(row.total_returned || 0);

            return {
                ...row,
                is_unified: isUnified,
                display_currency: isUnified ? activeCurrency : (row.currency || accCurr),
                total_invoiced: isUnified ? convertToActiveCurrency(rawInvoiced, accCurr, activeCurrency, currencyContext.exchangeRates) : rawInvoiced,
                total_paid: isUnified ? convertToActiveCurrency(rawPaid, accCurr, activeCurrency, currencyContext.exchangeRates) : rawPaid,
                total_unpaid: isUnified ? convertToActiveCurrency(rawUnpaid, accCurr, activeCurrency, currencyContext.exchangeRates) : rawUnpaid,
                total_returned: isUnified ? convertToActiveCurrency(rawReturned, accCurr, activeCurrency, currencyContext.exchangeRates) : rawReturned,
            };
        });

        res.json({
            data: processedRows,
            pagination: { page: parseInt(page, 10), limit: parsedLimit, totalRows, totalPages: Math.ceil(totalRows / parsedLimit) }
        });
    } catch (err) {
        console.error("❌ [getClientsPaginated] Database Error:", err.message);
        res.status(500).json({ error: err.message });
    }
};

/**
 * 🌐 5. HTML Proxy for Daftra Live Client Statement View
 */
const getClientStatementHtml = async (req, res) => {
    try {
        const { accountId, clientId } = req.params;
        const userId = req.user.userId;

        const accountResult = await pool.query(
            'SELECT daftra_subdomain, encrypted_access_token FROM linked_accounts WHERE id = $1 AND user_id = $2;',
            [accountId, userId]
        );

        if (accountResult.rows.length === 0) {
            return res.status(403).send('<h3>حساب دفترة غير موجود أو غير مصرح لك بالوصول إليه</h3>');
        }

        const { daftra_subdomain: subdomain, encrypted_access_token: token } = accountResult.rows[0];
        const cleanSubdomain = subdomain.replace('https://', '').replace('http://', '').split('.')[0].trim();

        const daftraStatementUrl = `https://${cleanSubdomain}.daftra.com/owner/clients/view_statement/${clientId}`;

        const response = await axios.get(daftraStatementUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'text/html,application/xhtml+xml,application/xml',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            },
            responseType: 'text'
        });

        let htmlContent = response.data;
        const baseTag = `<base href="https://${cleanSubdomain}.daftra.com/">`;
        if (htmlContent.includes('<head>')) {
            htmlContent = htmlContent.replace('<head>', `<head>${baseTag}`);
        } else {
            htmlContent = `${baseTag}${htmlContent}`;
        }

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(htmlContent);

    } catch (error) {
        console.error('❌ [getClientStatementHtml] Proxy Failure:', error.message);
        return res.status(500).send(`
            <div style="font-family: sans-serif; text-align: center; padding: 40px; color: #ef4444;">
                <h3>تعذر تحميل كشف الحساب من دفترة</h3>
                <p>${error.message}</p>
            </div>
        `);
    }
};

/**
 * 📊 6. Global Analytics Engine
 */
const getGlobalAnalytics = async (req, res) => {
    try {
        const userId = req.user.userId; // 🎯 أمان
        const { targetCurrency } = req.query;

        const currencyContext = await getUserCurrencyContext(userId);

        const isUnified = !!(targetCurrency && targetCurrency !== 'DEFAULT');
        const activeCurrency = isUnified ? targetCurrency.toUpperCase().trim() : 'DEFAULT';

        const summaryQuery = `
            WITH inv_totals AS (
                SELECT 
                    la.user_id,
                    ic.account_id,
                    la.currency_code AS account_currency,
                    COALESCE(SUM(ic.base_total_amount), 0) AS gross_sales_tax_incl,
                    COALESCE(SUM(ic.total_cogs), 0) AS sales_cogs,
                    COALESCE(SUM(
                        CASE 
                            WHEN ic.base_total_amount > 0 
                            THEN (ic.base_net_revenue / ic.base_total_amount) * ic.base_summary_paid 
                            ELSE ic.base_summary_paid 
                        END
                    ), 0) AS sales_paid_net,
                    COALESCE(SUM(ic.base_summary_unpaid), 0) AS sales_unpaid_tax_incl,
                    COALESCE(SUM(
                        CASE 
                            WHEN ic.is_return = 2 THEN COALESCE(rc.base_total_amount, 0)
                            ELSE 0 
                        END
                    ), 0) AS partial_returns_tax_incl,
                    COALESCE(SUM(ic.summary_paid), 0) AS orig_sales_paid,
                    COALESCE(SUM(ic.summary_unpaid), 0) AS orig_sales_unpaid
                FROM invoices_cache ic
                JOIN linked_accounts la ON ic.account_id = la.id
                LEFT JOIN returns_cache rc 
                       ON ic.account_id = rc.account_id 
                      AND TRIM(ic.daftra_invoice_id::text) = TRIM(rc.subscription_id::text)
                WHERE la.user_id = $1 
                  AND (ic.is_return IS NULL OR ic.is_return != 1)
                  AND (ic.draft IS NULL OR ic.draft = 0)
                GROUP BY la.user_id, ic.account_id, la.currency_code
            ),
            ret_totals AS (
                SELECT 
                    la.user_id,
                    rc.account_id,
                    COALESCE(SUM(rc.base_total_amount), 0) AS total_returns_tax_incl,
                    COALESCE(SUM(rc.total_amount), 0) AS orig_total_returns
                FROM returns_cache rc
                JOIN linked_accounts la ON rc.account_id = la.id
                WHERE la.user_id = $1
                GROUP BY la.user_id, rc.account_id
            ),
            chart_summary AS (
                SELECT 
                    la.user_id,
                    jc.account_id,
                    COALESCE(SUM(CASE WHEN jc.parent_category_id = 27 OR jc.daftra_category_id = 27 THEN jc.total_amount ELSE 0 END), 0) AS chart_incomes,
                    COALESCE(SUM(CASE WHEN jc.parent_category_id = 43 OR jc.daftra_category_id = 43 THEN jc.total_amount ELSE 0 END), 0) AS chart_expenses
                FROM journal_categories_cache jc
                JOIN linked_accounts la ON jc.account_id = la.id
                WHERE la.user_id = $1
                GROUP BY la.user_id, jc.account_id
            )
            SELECT 
                la.id AS account_id,
                la.account_name,
                la.currency_code AS account_currency,
                GREATEST(0, COALESCE(inv.gross_sales_tax_incl, 0) - COALESCE(inv.partial_returns_tax_incl, 0)) AS invoices_revenue,
                COALESCE(inv.sales_cogs, 0) AS total_cogs,
                COALESCE(ret.total_returns_tax_incl, 0) AS total_returns,
                COALESCE(inv.sales_paid_net, 0) AS total_paid,
                COALESCE(inv.sales_unpaid_tax_incl, 0) AS total_unpaid,
                COALESCE(inv.orig_sales_paid, 0) AS orig_total_paid,
                COALESCE(inv.orig_sales_unpaid, 0) AS orig_total_unpaid,
                COALESCE(ret.orig_total_returns, 0) AS orig_total_returns,
                (COALESCE(cs.chart_incomes, 0) - COALESCE(cs.chart_expenses, 0)) AS net_profit
            FROM linked_accounts la
            LEFT JOIN inv_totals inv ON la.id = inv.account_id
            LEFT JOIN ret_totals ret ON la.id = ret.account_id
            LEFT JOIN chart_summary cs ON la.id = cs.account_id
            WHERE la.user_id = $1;
        `;

        const treasuriesQuery = `
            SELECT 
                dt.id,
                dt.account_id,
                dt.journal_account_id,
                dt.opening_balance,
                dt.today_inflow,
                dt.today_outflow,
                dt.net_change,
                dt.closing_balance,
                la.currency_code AS account_currency,
                tc.name AS treasury_name,
                la.account_name
            FROM daily_treasury_totals dt
            JOIN treasuries_cache tc ON dt.journal_account_id = tc.journal_account_id AND dt.account_id = tc.account_id
            JOIN linked_accounts la ON dt.account_id = la.id
            WHERE la.user_id = $1
            ORDER BY dt.journal_account_id ASC;
        `;

        const paymentStatusQuery = `
            SELECT 
                ic.payment_status,
                ic.currency_code,
                COUNT(ic.id) AS count,
                COALESCE(SUM(ic.base_total_amount), 0) AS total_amount
            FROM invoices_cache ic
            JOIN linked_accounts la ON ic.account_id = la.id
            WHERE la.user_id = $1 
              AND (ic.is_return IS NULL OR ic.is_return != 1)
              AND (ic.draft IS NULL OR ic.draft = 0)
            GROUP BY ic.payment_status, ic.currency_code;
        `;

        const [summaryRes, treasuriesRes, statusRes, topClientsRes, branchCompRes, accountPaymentRes] = await Promise.all([
            pool.query(summaryQuery, [userId]),
            pool.query(treasuriesQuery, [userId]),
            pool.query(paymentStatusQuery, [userId]),
            pool.query(`
                SELECT cc.daftra_client_id, cc.client_name, la.currency_code AS account_currency, la.account_name AS branch_name,
                       COALESCE(SUM(ic.base_summary_paid + ic.base_summary_unpaid), 0) AS total_invoiced,
                       COALESCE(SUM(ic.base_summary_unpaid), 0) AS total_due
                FROM clients_cache cc
                JOIN linked_accounts la ON cc.account_id = la.id
                LEFT JOIN invoices_cache ic ON cc.account_id = ic.account_id AND TRIM(ic.client_id::text) = TRIM(cc.daftra_client_id::text)
                WHERE la.user_id = $1
                GROUP BY cc.id, cc.daftra_client_id, cc.client_name, la.account_name, la.currency_code
                ORDER BY total_invoiced DESC LIMIT 10;
            `, [userId]),
            pool.query(`
                SELECT la.id AS account_id, la.account_name, la.currency_code AS account_currency,
                       COALESCE(SUM(ic.base_net_revenue), 0) AS branch_base_revenue,
                       COALESCE(SUM(ic.total_cogs), 0) AS branch_base_cogs
                FROM linked_accounts la
                LEFT JOIN invoices_cache ic ON la.id = ic.account_id AND (ic.is_return IS NULL OR ic.is_return != 1)
                WHERE la.user_id = $1 GROUP BY la.id, la.account_name, la.currency_code ORDER BY la.id ASC;
            `, [userId]),
            pool.query(`
                SELECT la.id AS account_id, la.account_name, la.currency_code AS account_currency,
                       COALESCE(SUM(
                           CASE 
                               WHEN ic.base_total_amount > 0 
                               THEN (ic.base_net_revenue / ic.base_total_amount) * ic.base_summary_paid 
                               ELSE ic.base_summary_paid 
                           END
                       ), 0) AS branch_base_paid,
                       COALESCE(SUM(ic.base_summary_unpaid), 0) AS branch_base_unpaid
                FROM linked_accounts la
                LEFT JOIN invoices_cache ic ON la.id = ic.account_id AND (ic.is_return IS NULL OR ic.is_return != 1)
                WHERE la.user_id = $1 GROUP BY la.id, la.account_name, la.currency_code ORDER BY la.id ASC;
            `, [userId])
        ]);

        let summary = {
            invoices_revenue: 0,
            total_revenue: 0,
            total_cogs: 0,
            total_returns: 0,
            total_paid: 0,
            total_unpaid: 0,
            net_profit: 0,
            active_currency: activeCurrency,
            is_unified: isUnified,
            breakdown_by_currency: {}
        };

        // 🎯 تجميع تراكيب العملات المخصصة لكارت حالة تحصيل الفواتير
        const collectionMap = {
            paid: { value: 0, currencies: {} },
            unpaid: { value: 0, currencies: {} },
            returned: { value: 0, currencies: {} }
        };

        summaryRes.rows.forEach(row => {
            const accCurr = (row.account_currency || 'EGP').toUpperCase().trim();

            const rawRev = parseFloat(row.invoices_revenue || 0);
            const rawCogs = parseFloat(row.total_cogs || 0);
            const rawRet = parseFloat(row.total_returns || 0);
            const rawPaid = parseFloat(row.total_paid || 0);
            const rawUnpaid = parseFloat(row.total_unpaid || 0);
            const rawProfit = parseFloat(row.net_profit || 0);

            const revenue = isUnified ? convertToActiveCurrency(rawRev, accCurr, activeCurrency, currencyContext.exchangeRates) : rawRev;
            const cogs = isUnified ? convertToActiveCurrency(rawCogs, accCurr, activeCurrency, currencyContext.exchangeRates) : rawCogs;
            const returns = isUnified ? convertToActiveCurrency(rawRet, accCurr, activeCurrency, currencyContext.exchangeRates) : rawRet;
            const paid = isUnified ? convertToActiveCurrency(rawPaid, accCurr, activeCurrency, currencyContext.exchangeRates) : rawPaid;
            const unpaid = isUnified ? convertToActiveCurrency(rawUnpaid, accCurr, activeCurrency, currencyContext.exchangeRates) : rawUnpaid;
            const profit = isUnified ? convertToActiveCurrency(rawProfit, accCurr, activeCurrency, currencyContext.exchangeRates) : rawProfit;

            summary.invoices_revenue += revenue;
            summary.total_revenue += revenue;
            summary.total_cogs += cogs;
            summary.total_returns += returns;
            summary.total_paid += paid;
            summary.total_unpaid += unpaid;
            summary.net_profit += profit;

            // 🎯 نضمن إن كارت الشارت يقرأ نفس المبالغ الحقيقية المباشرة (rawPaid, rawUnpaid, rawRet) لكل عملة
            collectionMap.paid.value += paid;
            collectionMap.paid.currencies[accCurr] = (collectionMap.paid.currencies[accCurr] || 0) + rawPaid;

            collectionMap.unpaid.value += unpaid;
            collectionMap.unpaid.currencies[accCurr] = (collectionMap.unpaid.currencies[accCurr] || 0) + rawUnpaid;

            collectionMap.returned.value += returns;
            collectionMap.returned.currencies[accCurr] = (collectionMap.returned.currencies[accCurr] || 0) + rawRet;

            if (!summary.breakdown_by_currency[accCurr]) {
                summary.breakdown_by_currency[accCurr] = {
                    invoices_revenue: 0, total_revenue: 0, total_cogs: 0, total_returns: 0, total_paid: 0, total_unpaid: 0, net_profit: 0
                };
            }
            summary.breakdown_by_currency[accCurr].invoices_revenue += rawRev;
            summary.breakdown_by_currency[accCurr].total_revenue += rawRev;
            summary.breakdown_by_currency[accCurr].total_cogs += rawCogs;
            summary.breakdown_by_currency[accCurr].total_returns += rawRet;
            summary.breakdown_by_currency[accCurr].total_paid += rawPaid;
            summary.breakdown_by_currency[accCurr].total_unpaid += rawUnpaid;
            summary.breakdown_by_currency[accCurr].net_profit += rawProfit;
        });

        // 🎯 فلترة الـ Breakdown للعملات التي تمتلك مبالغ فعلية أكبر من الصفر فقط
        const paymentStatusBreakdownFormatted = Object.keys(collectionMap).map(key => ({
            name: key,
            value: collectionMap[key].value,
            currenciesBreakdown: Object.keys(collectionMap[key].currencies)
                .filter(c => parseFloat(collectionMap[key].currencies[c] || 0) > 0)
                .map(c => ({
                    currency: c,
                    amount: collectionMap[key].currencies[c]
                }))
        }));

        const processedTreasuries = treasuriesRes.rows.map(t => {
            const accCurr = (t.account_currency || 'EGP').toUpperCase().trim();
            return {
                ...t,
                opening_balance: isUnified ? convertToActiveCurrency(t.opening_balance, accCurr, activeCurrency, currencyContext.exchangeRates) : parseFloat(t.opening_balance),
                today_inflow: isUnified ? convertToActiveCurrency(t.today_inflow, accCurr, activeCurrency, currencyContext.exchangeRates) : parseFloat(t.today_inflow),
                today_outflow: isUnified ? convertToActiveCurrency(t.today_outflow, accCurr, activeCurrency, currencyContext.exchangeRates) : parseFloat(t.today_outflow),
                closing_balance: isUnified ? convertToActiveCurrency(t.closing_balance, accCurr, activeCurrency, currencyContext.exchangeRates) : parseFloat(t.closing_balance),
                currency_code: isUnified ? activeCurrency : accCurr
            };
        });

        const processedBranchComparison = branchCompRes.rows.map(b => {
            const accCurr = (b.account_currency || 'EGP').toUpperCase().trim();
            const rawRev = parseFloat(b.branch_base_revenue || 0);
            const rawCogs = parseFloat(b.branch_base_cogs || 0);

            return {
                ...b,
                revenue: isUnified ? convertToActiveCurrency(rawRev, accCurr, activeCurrency, currencyContext.exchangeRates) : rawRev,
                cogs: isUnified ? convertToActiveCurrency(rawCogs, accCurr, activeCurrency, currencyContext.exchangeRates) : rawCogs,
                display_currency: isUnified ? activeCurrency : accCurr
            };
        });

        const processedTopClients = topClientsRes.rows.map(c => {
            const accCurr = (c.account_currency || 'EGP').toUpperCase().trim();
            const rawInvoiced = parseFloat(c.total_invoiced || 0);
            const rawDue = parseFloat(c.total_due || 0);

            return {
                ...c,
                total_invoiced: isUnified ? convertToActiveCurrency(rawInvoiced, accCurr, activeCurrency, currencyContext.exchangeRates) : rawInvoiced,
                total_due: isUnified ? convertToActiveCurrency(rawDue, accCurr, activeCurrency, currencyContext.exchangeRates) : rawDue,
                display_currency: isUnified ? activeCurrency : accCurr
            };
        });

        const processedAccountPaymentStatus = accountPaymentRes.rows.map(a => {
            const accCurr = (a.account_currency || 'EGP').toUpperCase().trim();
            const rawPaid = parseFloat(a.branch_base_paid || 0);
            const rawUnpaid = parseFloat(a.branch_base_unpaid || 0);

            return {
                ...a,
                total_paid: isUnified ? convertToActiveCurrency(rawPaid, accCurr, activeCurrency, currencyContext.exchangeRates) : rawPaid,
                total_unpaid: isUnified ? convertToActiveCurrency(rawUnpaid, accCurr, activeCurrency, currencyContext.exchangeRates) : rawUnpaid,
                display_currency: isUnified ? activeCurrency : accCurr
            };
        });

        res.json({
            summary,
            treasuries: processedTreasuries,
            paymentStatusBreakdown: paymentStatusBreakdownFormatted,
            topClients: processedTopClients,
            branchComparison: processedBranchComparison,
            accountPaymentStatus: processedAccountPaymentStatus
        });

    } catch (err) {
        console.error("❌ [getGlobalAnalytics] Failed:", err.message);
        res.status(500).json({ error: err.message });
    }
};

/**
 * 🏢 7. Single Branch Analytics Engine
 */
const getBranchAnalytics = async (req, res) => {
    try {
        const { accountId } = req.params;
        const userId = req.user.userId; // 🎯 أمان
        const { currency, targetCurrency } = req.query;

        const accountRes = await pool.query('SELECT user_id, currency_code FROM linked_accounts WHERE id = $1 AND user_id = $2;', [accountId, userId]);
        if (accountRes.rows.length === 0) {
            return res.status(403).json({ error: "Unauthorized or Branch account not found" });
        }

        const accountBaseCurrency = (accountRes.rows[0].currency_code || 'EGP').toUpperCase().trim();

        const currencyContext = await getUserCurrencyContext(userId);

        const isUnified = !!(targetCurrency && targetCurrency !== 'DEFAULT');
        const activeCurrency = isUnified ? targetCurrency.toUpperCase().trim() : accountBaseCurrency;

        const summaryQuery = `
            WITH inv_totals AS (
                SELECT 
                    ic.account_id,
                    COALESCE(SUM(ic.base_total_amount), 0) AS gross_sales_tax_incl,
                    COALESCE(SUM(ic.total_cogs), 0) AS sales_cogs,
                    COALESCE(SUM(
                        CASE 
                            WHEN ic.base_total_amount > 0 
                            THEN (ic.base_net_revenue / ic.base_total_amount) * ic.base_summary_paid 
                            ELSE ic.base_summary_paid 
                        END
                    ), 0) AS sales_paid_net,
                    COALESCE(SUM(ic.base_summary_unpaid), 0) AS sales_unpaid_tax_incl,
                    COALESCE(SUM(
                        CASE 
                            WHEN ic.is_return = 2 THEN COALESCE(rc.base_total_amount, 0)
                            ELSE 0 
                        END
                    ), 0) AS partial_returns_tax_incl
                FROM invoices_cache ic
                LEFT JOIN returns_cache rc 
                       ON ic.account_id = rc.account_id 
                      AND TRIM(ic.daftra_invoice_id::text) = TRIM(rc.subscription_id::text)
                WHERE ic.account_id = $1 
                  AND (ic.is_return IS NULL OR ic.is_return != 1)
                  AND (ic.draft IS NULL OR ic.draft = 0)
                GROUP BY ic.account_id
            ),
            ret_totals AS (
                SELECT 
                    rc.account_id,
                    COALESCE(SUM(rc.base_total_amount), 0) AS total_returns_tax_incl
                FROM returns_cache rc
                WHERE rc.account_id = $1
                GROUP BY rc.account_id
            ),
            chart_summary AS (
                SELECT 
                    jc.account_id,
                    COALESCE(SUM(CASE WHEN jc.parent_category_id = 27 OR jc.daftra_category_id = 27 THEN jc.total_amount ELSE 0 END), 0) AS chart_incomes,
                    COALESCE(SUM(CASE WHEN jc.parent_category_id = 43 OR jc.daftra_category_id = 43 THEN jc.total_amount ELSE 0 END), 0) AS chart_expenses
                FROM journal_categories_cache jc
                WHERE jc.account_id = $1
                GROUP BY jc.account_id
            )
            SELECT 
                GREATEST(0, COALESCE(inv.gross_sales_tax_incl, 0) - COALESCE(inv.partial_returns_tax_incl, 0)) AS invoices_revenue,
                COALESCE(inv.sales_cogs, 0) AS total_cogs,
                COALESCE(ret.total_returns_tax_incl, 0) AS total_returns,
                COALESCE(inv.sales_paid_net, 0) AS total_paid,
                COALESCE(inv.sales_unpaid_tax_incl, 0) AS total_unpaid,
                (COALESCE(cs.chart_incomes, 0) - COALESCE(cs.chart_expenses, 0)) AS net_profit
            FROM (SELECT $1::int AS account_id) a
            LEFT JOIN inv_totals inv ON a.account_id = inv.account_id
            LEFT JOIN ret_totals ret ON a.account_id = ret.account_id
            LEFT JOIN chart_summary cs ON a.account_id = cs.account_id;
        `;

        const treasuriesQuery = `
            SELECT 
                dt.id,
                dt.account_id,
                dt.journal_account_id,
                dt.opening_balance,
                dt.today_inflow,
                dt.today_outflow,
                dt.net_change,
                dt.closing_balance,
                dt.currency_code,
                tc.name AS treasury_name,
                tc.current_balance AS live_treasury_balance
            FROM daily_treasury_totals dt
            JOIN treasuries_cache tc ON dt.journal_account_id = tc.journal_account_id AND dt.account_id = tc.account_id
            WHERE dt.account_id = $1
            ORDER BY dt.journal_account_id ASC;
        `;

        const paymentStatusQuery = `
            SELECT payment_status, COUNT(id) AS count, COALESCE(SUM(base_total_amount), 0) AS total_amount
            FROM invoices_cache
            WHERE account_id = $1 
              AND (is_return IS NULL OR is_return != 1)
              AND (draft IS NULL OR draft = 0)
            GROUP BY payment_status;
        `;

        const topClientsQuery = `
            SELECT 
                cc.daftra_client_id,
                cc.client_name,
                COALESCE(SUM(ic.base_summary_paid + ic.base_summary_unpaid), 0) AS total_invoiced,
                COALESCE(SUM(ic.base_summary_unpaid), 0) AS total_due
            FROM clients_cache cc
            LEFT JOIN invoices_cache ic 
                   ON cc.account_id = ic.account_id 
                  AND TRIM(ic.client_id::text) = TRIM(cc.daftra_client_id::text)
                  AND (ic.is_return IS NULL OR ic.is_return != 1)
                  AND (ic.draft IS NULL OR ic.draft = 0)
            WHERE cc.account_id = $1
            GROUP BY cc.id, cc.daftra_client_id, cc.client_name
            ORDER BY total_invoiced DESC
            LIMIT 5;
        `;

        const [summaryRes, treasuriesRes, statusRes, topClientsRes] = await Promise.all([
            pool.query(summaryQuery, [accountId]),
            pool.query(treasuriesQuery, [accountId]),
            pool.query(paymentStatusQuery, [accountId]),
            pool.query(topClientsQuery, [accountId]),
        ]);

        const rawSummary = summaryRes.rows[0] || {
            invoices_revenue: 0, total_revenue: 0, total_cogs: 0,
            net_profit: 0, total_returns: 0, total_paid: 0, total_unpaid: 0
        };

        const processedSummary = {
            invoices_revenue: isUnified ? convertToActiveCurrency(rawSummary.invoices_revenue, accountBaseCurrency, activeCurrency, currencyContext.exchangeRates) : parseFloat(rawSummary.invoices_revenue || 0),
            total_revenue: isUnified ? convertToActiveCurrency(rawSummary.invoices_revenue, accountBaseCurrency, activeCurrency, currencyContext.exchangeRates) : parseFloat(rawSummary.invoices_revenue || 0),
            total_cogs: isUnified ? convertToActiveCurrency(rawSummary.total_cogs, accountBaseCurrency, activeCurrency, currencyContext.exchangeRates) : parseFloat(rawSummary.total_cogs || 0),
            total_returns: isUnified ? convertToActiveCurrency(rawSummary.total_returns, accountBaseCurrency, activeCurrency, currencyContext.exchangeRates) : parseFloat(rawSummary.total_returns || 0),
            total_paid: isUnified ? convertToActiveCurrency(rawSummary.total_paid, accountBaseCurrency, activeCurrency, currencyContext.exchangeRates) : parseFloat(rawSummary.total_paid || 0),
            total_unpaid: isUnified ? convertToActiveCurrency(rawSummary.total_unpaid, accountBaseCurrency, activeCurrency, currencyContext.exchangeRates) : parseFloat(rawSummary.total_unpaid || 0),
            net_profit: isUnified ? convertToActiveCurrency(rawSummary.net_profit, accountBaseCurrency, activeCurrency, currencyContext.exchangeRates) : parseFloat(rawSummary.net_profit || 0),
            currency_code: activeCurrency,
            account_currency: accountBaseCurrency
        };

        const processedTreasuries = treasuriesRes.rows.map(t => {
            const curr = (t.currency_code || accountBaseCurrency).toUpperCase().trim();
            return {
                ...t,
                opening_balance: isUnified ? convertToActiveCurrency(t.opening_balance, curr, activeCurrency, currencyContext.exchangeRates) : parseFloat(t.opening_balance),
                today_inflow: isUnified ? convertToActiveCurrency(t.today_inflow, curr, activeCurrency, currencyContext.exchangeRates) : parseFloat(t.today_inflow),
                today_outflow: isUnified ? convertToActiveCurrency(t.today_outflow, curr, activeCurrency, currencyContext.exchangeRates) : parseFloat(t.today_outflow),
                closing_balance: isUnified ? convertToActiveCurrency(t.closing_balance, curr, activeCurrency, currencyContext.exchangeRates) : parseFloat(t.closing_balance),
                currency_code: isUnified ? activeCurrency : curr
            };
        });

        res.json({
            summary: processedSummary,
            treasuries: processedTreasuries,
            paymentStatusBreakdown: statusRes.rows,
            topClients: topClientsRes.rows.map(c => ({
                ...c,
                total_invoiced: isUnified ? convertToActiveCurrency(c.total_invoiced, accountBaseCurrency, activeCurrency, currencyContext.exchangeRates) : parseFloat(c.total_invoiced),
                display_currency: activeCurrency
            }))
        });

    } catch (err) {
        console.error("❌ [getBranchAnalytics] Failed:", err.message);
        res.status(500).json({ error: err.message });
    }
};

/**
 * 🎯 8. Get Financial Statement Summary (Global - يدعم التوحيد)
 */
const getSummary = async (req, res) => {
    try {
        const userId = req.user.userId; // 🎯 أمان
        const { targetCurrency } = req.query;

        const currencyContext = await getUserCurrencyContext(userId);
        const isUnified = !!(targetCurrency && targetCurrency !== 'DEFAULT');
        const activeCurrency = isUnified ? targetCurrency.toUpperCase().trim() : 'DEFAULT';

        const categoriesQuery = `
            SELECT 
                jc.id,
                jc.code,
                jc.name,
                jc.parent_category_id,
                jc.total_amount,
                la.currency_code
            FROM journal_categories_cache jc
            JOIN linked_accounts la ON jc.account_id = la.id
            WHERE la.user_id = $1 
              AND jc.parent_category_id IN (27, 43)
            ORDER BY jc.code ASC;
        `;

        const totalsQuery = `
            SELECT 
                la.currency_code,
                COALESCE(SUM(
                    CASE 
                        WHEN ic.base_total_amount > 0 
                        THEN (ic.base_net_revenue / ic.base_total_amount) * ic.base_summary_paid 
                        ELSE ic.base_summary_paid 
                    END
                ), 0) AS total_paid_net,
                COALESCE(SUM(ic.base_summary_unpaid), 0) AS total_unpaid_tax_incl,
                COALESCE(SUM(
                    CASE 
                        WHEN rc.id IS NOT NULL THEN rc.base_total_amount 
                        ELSE 0 
                    END
                ), 0) AS total_returns_tax_incl
            FROM linked_accounts la
            LEFT JOIN invoices_cache ic ON la.id = ic.account_id AND (ic.is_return IS NULL OR ic.is_return != 1) AND (ic.draft IS NULL OR ic.draft = 0)
            LEFT JOIN returns_cache rc ON la.id = rc.account_id
            WHERE la.user_id = $1
            GROUP BY la.currency_code;
        `;

        const [catRes, totalsRes] = await Promise.all([
            pool.query(categoriesQuery, [userId]),
            pool.query(totalsQuery, [userId])
        ]);

        const summaryByCurrency = {};

        catRes.rows.forEach(row => {
            const accCurr = (row.currency_code || 'EGP').toUpperCase().trim();
            const currKey = isUnified ? activeCurrency : accCurr;

            if (!summaryByCurrency[currKey]) {
                summaryByCurrency[currKey] = {
                    currency_code: currKey,
                    incomes: [],
                    expenses: [],
                    total_incomes: 0,
                    total_expenses: 0,
                    net_profit: 0,
                    total_paid: 0,
                    total_unpaid: 0,
                    total_returns: 0
                };
            }

            const rawAmt = parseFloat(row.total_amount || 0);
            const amt = isUnified ? convertToActiveCurrency(rawAmt, accCurr, activeCurrency, currencyContext.exchangeRates) : rawAmt;

            const item = {
                id: row.id,
                code: row.code,
                name: row.name,
                total_amount: amt
            };

            if (parseInt(row.parent_category_id, 10) === 27) {
                summaryByCurrency[currKey].incomes.push(item);
                summaryByCurrency[currKey].total_incomes += item.total_amount;
            } else if (parseInt(row.parent_category_id, 10) === 43) {
                summaryByCurrency[currKey].expenses.push(item);
                summaryByCurrency[currKey].total_expenses += item.total_amount;
            }
        });

        totalsRes.rows.forEach(row => {
            const accCurr = (row.currency_code || 'EGP').toUpperCase().trim();
            const currKey = isUnified ? activeCurrency : accCurr;

            if (summaryByCurrency[currKey]) {
                const rawPaid = parseFloat(row.total_paid_net || 0);
                const rawUnpaid = parseFloat(row.total_unpaid_tax_incl || 0);
                const rawReturns = parseFloat(row.total_returns_tax_incl || 0);

                summaryByCurrency[currKey].total_paid += isUnified ? convertToActiveCurrency(rawPaid, accCurr, activeCurrency, currencyContext.exchangeRates) : rawPaid;
                summaryByCurrency[currKey].total_unpaid += isUnified ? convertToActiveCurrency(rawUnpaid, accCurr, activeCurrency, currencyContext.exchangeRates) : rawUnpaid;
                summaryByCurrency[currKey].total_returns += isUnified ? convertToActiveCurrency(rawReturns, accCurr, activeCurrency, currencyContext.exchangeRates) : rawReturns;
            }
        });

        Object.keys(summaryByCurrency).forEach(curr => {
            summaryByCurrency[curr].net_profit = summaryByCurrency[curr].total_incomes - summaryByCurrency[curr].total_expenses;
        });

        res.json(summaryByCurrency);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * 🎯 9. Get Financial Statement Summary (Single Branch - يدعم التوحيد)
 */
const getBranchSummary = async (req, res) => {
    try {
        const { accountId } = req.params;
        const userId = req.user.userId; // 🎯 أمان
        const { targetCurrency } = req.query;

        const accountRes = await pool.query('SELECT user_id, currency_code FROM linked_accounts WHERE id = $1 AND user_id = $2;', [accountId, userId]);
        if (accountRes.rows.length === 0) {
            return res.status(403).json({ error: "Unauthorized or Branch account not found" });
        }

        const accountBaseCurrency = (accountRes.rows[0].currency_code || 'EGP').toUpperCase().trim();

        const currencyContext = await getUserCurrencyContext(userId);
        const isUnified = !!(targetCurrency && targetCurrency !== 'DEFAULT');
        const activeCurrency = isUnified ? targetCurrency.toUpperCase().trim() : accountBaseCurrency;

        const query = `
            SELECT 
                jc.id,
                jc.code,
                jc.name,
                jc.parent_category_id,
                jc.total_amount
            FROM journal_categories_cache jc
            WHERE jc.account_id = $1 AND jc.parent_category_id IN (27, 43)
            ORDER BY jc.code ASC;
        `;

        const totalsQuery = `
            SELECT 
                COALESCE(SUM(
                    CASE 
                        WHEN ic.base_total_amount > 0 
                        THEN (ic.base_net_revenue / ic.base_total_amount) * ic.base_summary_paid 
                        ELSE ic.base_summary_paid 
                    END
                ), 0) AS total_paid_net,
                COALESCE(SUM(ic.base_summary_unpaid), 0) AS total_unpaid_tax_incl,
                COALESCE((SELECT SUM(base_total_amount) FROM returns_cache WHERE account_id = $1), 0) AS total_returns_tax_incl
            FROM invoices_cache ic
            WHERE ic.account_id = $1 
              AND (ic.is_return IS NULL OR ic.is_return != 1)
              AND (ic.draft IS NULL OR ic.draft = 0);
        `;

        const [catRes, totalsRes] = await Promise.all([
            pool.query(query, [accountId]),
            pool.query(totalsQuery, [accountId])
        ]);

        const incomes = [];
        const expenses = [];
        let totalIncomes = 0;
        let totalExpenses = 0;

        catRes.rows.forEach(row => {
            const rawAmt = parseFloat(row.total_amount || 0);
            const amt = isUnified ? convertToActiveCurrency(rawAmt, accountBaseCurrency, activeCurrency, currencyContext.exchangeRates) : rawAmt;

            const item = {
                id: row.id,
                code: row.code,
                name: row.name,
                total_amount: amt
            };

            if (parseInt(row.parent_category_id, 10) === 27) {
                incomes.push(item);
                totalIncomes += item.total_amount;
            } else if (parseInt(row.parent_category_id, 10) === 43) {
                expenses.push(item);
                totalExpenses += item.total_amount;
            }
        });

        const totalsRow = totalsRes.rows[0] || {};
        const rawPaid = parseFloat(totalsRow.total_paid_net || 0);
        const rawUnpaid = parseFloat(totalsRow.total_unpaid_tax_incl || 0);
        const rawReturns = parseFloat(totalsRow.total_returns_tax_incl || 0);

        const branchSummary = {
            [activeCurrency]: {
                currency_code: activeCurrency,
                incomes,
                expenses,
                total_incomes: totalIncomes,
                total_expenses: totalExpenses,
                net_profit: totalIncomes - totalExpenses,
                total_paid: isUnified ? convertToActiveCurrency(rawPaid, accountBaseCurrency, activeCurrency, currencyContext.exchangeRates) : rawPaid,
                total_unpaid: isUnified ? convertToActiveCurrency(rawUnpaid, accountBaseCurrency, activeCurrency, currencyContext.exchangeRates) : rawUnpaid,
                total_returns: isUnified ? convertToActiveCurrency(rawReturns, accountBaseCurrency, activeCurrency, currencyContext.exchangeRates) : rawReturns
            }
        };

        res.json(branchSummary);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

/**
 * 🧾 10. Fetch Single Branch Transactions Stream
 */
const getBranchTransactions = async (req, res) => {
    try {
        const { accountId } = req.params;
        const userId = req.user.userId; // 🎯 أمان

        // 🎯 أمان
        const checkAuth = await pool.query('SELECT 1 FROM linked_accounts WHERE id = $1 AND user_id = $2', [accountId, userId]);
        if (checkAuth.rows.length === 0) return res.status(403).json({ error: "Unauthorized" });

        // 🎯 أمان السيرفر (LIMIT 100) لمنع Crash
        const result = await pool.query(`
            SELECT id, invoice_no AS doc_number, 'invoice' AS origin, base_net_revenue AS total_amount, currency_code, issue_date AS date 
            FROM invoices_cache WHERE account_id = $1
            UNION ALL
            SELECT id, return_no AS doc_number, 'return' AS origin, (-1 * base_net_revenue) AS total_amount, currency_code, issue_date AS date 
            FROM returns_cache WHERE account_id = $1
            UNION ALL
            SELECT id, journal_id::text AS doc_number, entity_type AS origin, (CASE WHEN entity_type = 'income' THEN debit ELSE credit END) AS total_amount, currency_code, transaction_date AS date 
            FROM treasury_transactions_cache WHERE account_id = $1 AND entity_type IN ('income', 'expense')
            ORDER BY date DESC
            LIMIT 100;
        `, [accountId]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

/**
 * 💳 10.1 Fetch All Payments for a User (فصل العملة الأصلية عن الأساسية بالمدفوعات + التصفية بالفرع)
 */
const getUserPayments = async (req, res) => {
    const userId = req.user.userId; // 🎯 أمان
    const { targetCurrency, accountId } = req.query;

    try {
        const currencyContext = await getUserCurrencyContext(userId);
        const isUnified = !!(targetCurrency && targetCurrency !== 'DEFAULT');
        const activeCurrency = isUnified ? targetCurrency.toUpperCase().trim() : 'DEFAULT';

        let accountFilter = `WHERE la.user_id = $1::int`;
        let queryParams = [parseInt(userId, 10)];

        if (accountId && accountId !== 'null' && accountId !== 'undefined') {
            const checkAuth = await pool.query('SELECT 1 FROM linked_accounts WHERE id = $1 AND user_id = $2', [parseInt(accountId, 10), parseInt(userId, 10)]);
            if (checkAuth.rows.length === 0) return res.status(403).json({ error: "Unauthorized" });

            accountFilter += ` AND p.account_id = $2::int`;
            queryParams.push(parseInt(accountId, 10));
        }

        const query = `
            SELECT 
                p.id,
                p.account_id,
                p.daftra_payment_id,
                p.invoice_id,
                p.invoice_no,
                p.client_id,
                c.client_name,
                p.payment_method,
                p.amount,
                p.base_amount,
                p.currency_code,
                p.exchange_rate,
                p.payment_type,
                p.payment_date,
                p.notes,
                p.branch_id,
                p.treasury_id,
                la.account_name,
                la.currency_code AS account_base_currency,
                b.name AS branch_name,
                tc.name AS treasury_name
            FROM invoice_payments_cache p
            JOIN linked_accounts la ON p.account_id = la.id
            LEFT JOIN clients_cache c 
                   ON p.account_id = c.account_id 
                  AND TRIM(p.client_id::text) = TRIM(c.daftra_client_id::text)
            LEFT JOIN branches_cache b 
                   ON p.account_id = b.account_id 
                  AND p.branch_id::text = b.daftra_branch_id::text
            LEFT JOIN treasuries_cache tc 
                   ON p.account_id = tc.account_id 
                  AND (
                      TRIM(p.treasury_id::text) = TRIM(tc.entity_id::text) 
                      OR TRIM(p.treasury_id::text) = TRIM(tc.journal_account_id::text)
                  )
            ${accountFilter}
            ORDER BY p.payment_date DESC, p.daftra_payment_id DESC, p.id DESC
            LIMIT 1000;
        `;
        const result = await pool.query(query, queryParams);

        const processedRows = result.rows.map(row => {
            const accCurr = (row.account_base_currency || 'EGP').toUpperCase().trim();
            const invCurr = (row.currency_code || accCurr).toUpperCase().trim();

            const rawOrigAmount = parseFloat(row.amount || 0);
            const rawBaseAmount = parseFloat(row.base_amount || row.amount || 0);

            return {
                ...row,
                is_unified: isUnified,
                display_currency: isUnified ? activeCurrency : invCurr,
                amount: isUnified ? convertToActiveCurrency(rawBaseAmount, accCurr, activeCurrency, currencyContext.exchangeRates) : rawOrigAmount,
                base_amount: isUnified ? convertToActiveCurrency(rawBaseAmount, accCurr, activeCurrency, currencyContext.exchangeRates) : rawBaseAmount
            };
        });

        return res.status(200).json(processedRows);
    } catch (err) {
        console.error('❌ Error fetching user payments:', err.message);
        return res.status(500).json({ error: 'Failed retrieving payments history.' });
    }
};

/**
 * 🔁 11. Trigger Background Sync for a Specific Account/Branch
 */
const syncBranch = async (req, res) => {
    const { accountId } = req.params;
    const userId = req.user.userId; // 🎯 أمان
    try {
        const accountResult = await pool.query('SELECT user_id, daftra_subdomain, encrypted_access_token FROM linked_accounts WHERE id = $1 AND user_id = $2;', [accountId, userId]);
        if (accountResult.rows.length === 0) return res.status(404).json({ error: "Target linked branch account mapping node not found or unauthorized." });

        const { daftra_subdomain: subdomain, encrypted_access_token: token } = accountResult.rows[0];
        const cleanSubdomain = subdomain.replace('https://', '').replace('http://', '').split('.')[0];
        const config = { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } };

        const jobResult = await pool.query(
            "INSERT INTO sync_jobs (user_id, account_id, status, current_step) VALUES ($1, $2, 'pending', 'initializing') RETURNING id;",
            [userId, accountId]
        );
        const jobId = jobResult.rows[0].id;

        setImmediate(() => {
            executeFullAccountSync(userId, accountId, cleanSubdomain, config, jobId);
        });

        return res.status(200).json({ success: true, backgroundJobLaunched: true, jobId });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

/**
 * 🔁 12. Trigger Background Bulk Sync for All User Linked Accounts
 */
const syncAll = async (req, res) => {
    const userId = req.user.userId; // 🎯 أمان
    try {
        const accountsResult = await pool.query('SELECT id FROM linked_accounts WHERE user_id = $1;', [userId]);
        if (accountsResult.rows.length === 0) return res.status(200).json({ message: "No connected accounts found to synchronize." });

        const jobResult = await pool.query(
            "INSERT INTO sync_jobs (user_id, account_id, status, current_step) VALUES ($1, null, 'pending', 'initializing') RETURNING id;",
            [userId]
        );
        const jobId = jobResult.rows[0].id;

        setImmediate(() => {
            executeBulkUserSync(userId, jobId);
        });

        return res.status(200).json({ success: true, backgroundJobLaunched: true, jobId });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

/**
 * ⚡ Fast Financial Report / Chart of Accounts Sync
 */
const syncFinancialReportOnly = async (req, res) => {
    try {
        const { accountId } = req.params;
        const userId = req.user.userId; // 🎯 أمان
        const accountResult = await pool.query(
            'SELECT user_id, daftra_subdomain, encrypted_access_token FROM linked_accounts WHERE id = $1 AND user_id = $2;',
            [accountId, userId]
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: "Linked account mapping node not found or unauthorized." });
        }

        const { daftra_subdomain: subdomain, encrypted_access_token: token } = accountResult.rows[0];
        const cleanSubdomain = subdomain.replace('https://', '').replace('http://', '').split('.')[0];
        const config = { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } };

        await syncChartOfAccounts(accountId, cleanSubdomain, config, null);

        res.json({ success: true, message: "Chart of Accounts refreshed successfully." });
    } catch (err) {
        console.error("❌ [syncFinancialReportOnly] Error:", err.message);
        res.status(500).json({ error: err.message });
    }
};

/**
 * 🏦 13. Fetch Live Treasury Balances & Daily Totals
 */
const getTreasuryDailyTotals = async (req, res) => {
    try {
        const { accountId } = req.params;
        const userId = req.user.userId; // 🎯 أمان

        const checkAuth = await pool.query('SELECT 1 FROM linked_accounts WHERE id = $1 AND user_id = $2', [accountId, userId]);
        if (checkAuth.rows.length === 0) return res.status(403).json({ error: "Unauthorized" });

        const result = await pool.query(`
            SELECT 
                dt.id,
                dt.account_id,
                dt.journal_account_id,
                dt.opening_balance,
                dt.today_inflow,
                dt.today_outflow,
                dt.net_change,
                dt.closing_balance,
                dt.currency_code,
                tc.name AS treasury_name,
                tc.current_balance AS live_treasury_balance,
                tc.last_updated_at
            FROM daily_treasury_totals dt
            JOIN treasuries_cache tc ON dt.journal_account_id = tc.journal_account_id AND dt.account_id = tc.account_id
            WHERE dt.account_id = $1
            ORDER BY dt.journal_account_id ASC;
        `, [accountId]);

        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * 🏦 14. Get Treasuries (يدعم العملة الموحدة)
 */
const getUserTreasuries = async (req, res) => {
    try {
        const userId = req.user.userId; // 🎯 أمان
        const { accountId, targetCurrency } = req.query;

        const currencyContext = await getUserCurrencyContext(userId);
        const isUnified = !!(targetCurrency && targetCurrency !== 'DEFAULT');
        const activeCurrency = isUnified ? targetCurrency.toUpperCase().trim() : 'DEFAULT';

        let query = `
            SELECT 
                tc.id,
                tc.account_id,
                tc.journal_account_id,
                tc.entity_id,
                tc.name AS treasury_name,
                tc.currency_code,
                tc.current_balance,
                la.account_name,
                la.currency_code AS account_base_currency,
                COALESCE(bc.name, 'Main Branch') AS branch_name
            FROM treasuries_cache tc
            JOIN linked_accounts la ON tc.account_id = la.id
            LEFT JOIN branches_cache bc ON tc.account_id = bc.account_id AND tc.branch_id = bc.daftra_branch_id
            WHERE la.user_id = $1
        `;

        const queryParams = [userId];

        if (accountId) {
            const checkAuth = await pool.query('SELECT 1 FROM linked_accounts WHERE id = $1 AND user_id = $2', [accountId, userId]);
            if (checkAuth.rows.length === 0) return res.status(403).json({ error: "Unauthorized" });

            query += ` AND tc.account_id = $2`;
            queryParams.push(accountId);
        }

        query += ` ORDER BY la.id ASC, tc.journal_account_id ASC;`;

        const result = await pool.query(query, queryParams);

        const processedRows = result.rows.map(row => {
            const accCurr = (row.currency_code || row.account_base_currency || 'EGP').toUpperCase().trim();
            const rawBalance = parseFloat(row.current_balance || 0);

            return {
                ...row,
                is_unified: isUnified,
                display_currency: isUnified ? activeCurrency : accCurr,
                current_balance: isUnified ? convertToActiveCurrency(rawBalance, accCurr, activeCurrency, currencyContext.exchangeRates) : rawBalance
            };
        });

        res.json(processedRows);
    } catch (err) {
        console.error("❌ [getUserTreasuries] Error:", err.message);
        res.status(500).json({ error: err.message });
    }
};

/**
 * 🏦 15. Get Single Treasury Header Info (يدعم العملة الموحدة)
 */
const getTreasuryHeader = async (req, res) => {
    try {
        const { accountId, journalAccountId } = req.params;
        const userId = req.user.userId; // 🎯 أمان
        const { targetCurrency } = req.query;

        const query = `
            SELECT 
                tc.id,
                tc.account_id,
                tc.journal_account_id,
                tc.entity_id,
                tc.name AS treasury_name,
                tc.currency_code,
                tc.current_balance,
                la.account_name,
                la.user_id,
                la.currency_code AS account_base_currency,
                la.daftra_subdomain,
                COALESCE(bc.name, 'Main Branch') AS branch_name
            FROM treasuries_cache tc
            JOIN linked_accounts la ON tc.account_id = la.id
            LEFT JOIN branches_cache bc ON tc.account_id = bc.account_id AND tc.branch_id = bc.daftra_branch_id
            WHERE tc.account_id = $1 AND tc.journal_account_id = $2 AND la.user_id = $3;
        `;
        const result = await pool.query(query, [accountId, journalAccountId, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Treasury not found or unauthorized" });
        }

        const treasury = result.rows[0];
        const currencyContext = await getUserCurrencyContext(treasury.user_id);
        const isUnified = !!(targetCurrency && targetCurrency !== 'DEFAULT');
        const activeCurrency = isUnified ? targetCurrency.toUpperCase().trim() : 'DEFAULT';

        const cleanSubdomain = treasury.daftra_subdomain.replace('https://', '').replace('http://', '').split('.')[0].trim();
        const daftraTreasuryUrl = `https://${cleanSubdomain}.daftra.com/owner/treasuries/view/${treasury.entity_id || treasury.journal_account_id}/${treasury.journal_account_id}`;

        const accCurr = (treasury.currency_code || treasury.account_base_currency || 'EGP').toUpperCase().trim();
        const rawBal = parseFloat(treasury.current_balance || 0);

        res.json({
            ...treasury,
            is_unified: isUnified,
            display_currency: isUnified ? activeCurrency : accCurr,
            current_balance: isUnified ? convertToActiveCurrency(rawBal, accCurr, activeCurrency, currencyContext.exchangeRates) : rawBal,
            daftra_treasury_url: daftraTreasuryUrl
        });
    } catch (err) {
        console.error("❌ [getTreasuryHeader] Error:", err.message);
        res.status(500).json({ error: err.message });
    }
};

/**
 * 🏦 16. Get Paginated Treasury Transactions (يدعم العملة الموحدة)
 */
const getTreasuryTransactionsPaginated = async (req, res) => {
    try {
        const { accountId, journalAccountId } = req.params;
        const userId = req.user.userId; // 🎯 أمان
        const { page = 1, limit = 20, targetCurrency } = req.query;
        const parsedLimit = parseInt(limit, 10);
        const parsedPage = parseInt(page, 10);
        const offset = (parsedPage - 1) * parsedLimit;

        const accUserRes = await pool.query('SELECT user_id, currency_code FROM linked_accounts WHERE id = $1 AND user_id = $2', [accountId, userId]);
        if (accUserRes.rows.length === 0) return res.status(403).json({ error: "Unauthorized" });

        const accountBaseCurrency = (accUserRes.rows[0]?.currency_code || 'EGP').toUpperCase().trim();

        const currencyContext = userId ? await getUserCurrencyContext(userId) : { exchangeRates: {} };
        const isUnified = !!(targetCurrency && targetCurrency !== 'DEFAULT');
        const activeCurrency = isUnified ? targetCurrency.toUpperCase().trim() : 'DEFAULT';

        const countQuery = `
            SELECT COUNT(*) FROM treasury_transactions_cache
            WHERE account_id = $1 AND journal_account_id = $2;
        `;
        const countRes = await pool.query(countQuery, [accountId, journalAccountId]);
        const totalRows = parseInt(countRes.rows[0].count, 10);

        const liveBalRes = await pool.query(`SELECT current_balance, currency_code FROM treasuries_cache WHERE account_id = $1 AND journal_account_id = $2;`, [accountId, journalAccountId]);
        const liveCurrentBalance = parseFloat(liveBalRes.rows[0]?.current_balance || 0);
        const treasuryCurrency = (liveBalRes.rows[0]?.currency_code || accountBaseCurrency).toUpperCase().trim();

        const allTxnsQuery = `
            SELECT 
                tt.*,
                COALESCE(bc.name, 'Main Branch') AS branch_name
            FROM treasury_transactions_cache tt
            LEFT JOIN branches_cache bc ON tt.account_id = bc.account_id AND tt.branch_id = bc.daftra_branch_id
            WHERE tt.account_id = $1 AND tt.journal_account_id = $2
            ORDER BY tt.transaction_date ASC, tt.journal_id ASC;
        `;
        const allTxnsRes = await pool.query(allTxnsQuery, [accountId, journalAccountId]);
        const allTxns = allTxnsRes.rows;

        let netMovementSum = 0;
        for (const t of allTxns) {
            netMovementSum += (parseFloat(t.debit || 0) - parseFloat(t.credit || 0));
        }

        let running = liveCurrentBalance - netMovementSum;

        const calculatedTxns = [];
        for (const t of allTxns) {
            const net = parseFloat(t.debit || 0) - parseFloat(t.credit || 0);
            running += net;
            calculatedTxns.push({
                ...t,
                running_balance: parseFloat(running.toFixed(4))
            });
        }

        calculatedTxns.reverse();

        const paginatedData = calculatedTxns.slice(offset, offset + parsedLimit);

        let openingBalance = 0;
        if (paginatedData.length > 0) {
            const oldestInPage = paginatedData[paginatedData.length - 1];
            const oldestNet = parseFloat(oldestInPage.debit || 0) - parseFloat(oldestInPage.credit || 0);
            openingBalance = parseFloat((oldestInPage.running_balance - oldestNet).toFixed(4));
        } else {
            openingBalance = liveCurrentBalance;
        }

        const processedTxns = paginatedData.map(t => {
            const rawDebit = parseFloat(t.debit || 0);
            const rawCredit = parseFloat(t.credit || 0);
            const rawRunBal = parseFloat(t.running_balance || 0);

            return {
                ...t,
                is_unified: isUnified,
                display_currency: isUnified ? activeCurrency : treasuryCurrency,
                debit: isUnified ? convertToActiveCurrency(rawDebit, treasuryCurrency, activeCurrency, currencyContext.exchangeRates) : rawDebit,
                credit: isUnified ? convertToActiveCurrency(rawCredit, treasuryCurrency, activeCurrency, currencyContext.exchangeRates) : rawCredit,
                running_balance: isUnified ? convertToActiveCurrency(rawRunBal, treasuryCurrency, activeCurrency, currencyContext.exchangeRates) : rawRunBal
            };
        });

        res.json({
            data: processedTxns,
            openingBalance: isUnified ? convertToActiveCurrency(openingBalance, treasuryCurrency, activeCurrency, currencyContext.exchangeRates) : openingBalance,
            liveCurrentBalance: isUnified ? convertToActiveCurrency(liveCurrentBalance, treasuryCurrency, activeCurrency, currencyContext.exchangeRates) : liveCurrentBalance,
            pagination: {
                page: parsedPage,
                limit: parsedLimit,
                totalRows,
                totalPages: Math.ceil(totalRows / parsedLimit) || 1
            }
        });
    } catch (err) {
        console.error("❌ [getTreasuryTransactionsPaginated] Error:", err.message);
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getGlobalRecentWidgets,
    getBranchRecentWidgets,
    getRecentSalesWidget,
    getLedgersPaginated,
    getClientsPaginated,
    getClientStatementHtml,
    getGlobalAnalytics,
    getBranchAnalytics,
    getSummary,
    getBranchSummary,
    getBranchTransactions,
    getUserPayments,
    getTreasuryDailyTotals,
    getUserTreasuries,
    getTreasuryHeader,
    getTreasuryTransactionsPaginated,
    syncBranch,
    syncAll,
    syncFinancialReportOnly
};