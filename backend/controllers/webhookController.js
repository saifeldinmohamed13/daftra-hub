const pool = require('../config/db');
const { parseDaftraDueDate } = require('../utils/helpers');
const { 
    syncDailyTreasuryTotals, 
    recalculateGlobalUserRollup
    // 🎯 تمت إزالة الاستدعاء هنا للحماية
} = require('../services/syncService');
const { fetchInvoiceJournalEntry } = require('../services/daftraService');

/**
 * ⚡ MAIN DAFTRA LIVE WEBHOOK RECEIVER & ROUTER
 */
const handleDaftraWebhook = async (req, res) => {
    try {
        const payload      = req.body;
        const daftraSiteId = req.headers['x-site-id'] || payload.site_id?.toString();

        if (!daftraSiteId) {
            return res.status(200).json({ success: false, message: 'Missing tenant identity header' });
        }

        const accountResult = await pool.query(
            'SELECT id, user_id, daftra_subdomain, encrypted_access_token, currency_code FROM linked_accounts WHERE daftra_site_id = $1;',
            [daftraSiteId]
        );

        if (accountResult.rows.length === 0) {
            return res.status(200).json({ message: 'Unmapped site ID — ignored.' });
        }

        // =================================================================
        // 🛑 INTERCEPT 0: JOURNAL ENTRIES FOR COGS TRACKING
        // =================================================================
        const isJournalCostEvent = payload.entity_type &&
            (payload.entity_type === 'invoice_sales_cost' || payload.entity_type === 'sales_cost');

        if (isJournalCostEvent && payload.id && payload.total_debit) {
            const journalEntryId  = parseInt(payload.id, 10);
            const totalDebitCost  = parseFloat(payload.total_debit);
            let targetInvoiceId   = payload.entity_id ? payload.entity_id.toString().trim() : null;

            if (payload.entity_type === 'sales_cost' && payload.requisition_invoice?.id) {
                targetInvoiceId = payload.requisition_invoice.id.toString().trim();
            }

            if (targetInvoiceId && targetInvoiceId !== '0') {
                for (const account of accountResult.rows) {
                    const guardCheck = await pool.query(
                        'SELECT id FROM processed_cogs_entries WHERE account_id = $1 AND journal_entry_id = $2;',
                        [account.id, journalEntryId]
                    );
                    if (guardCheck.rows.length > 0) continue;

                    await pool.query(
                        'UPDATE invoices_cache SET total_cogs = COALESCE(total_cogs, 0.0000) + $1 WHERE account_id = $2 AND daftra_invoice_id = $3;',
                        [totalDebitCost, account.id, targetInvoiceId]
                    );
                    await pool.query(
                        'INSERT INTO processed_cogs_entries (account_id, daftra_site_id, journal_entry_id, invoice_id) VALUES ($1, $2, $3, $4);',
                        [account.id, daftraSiteId, journalEntryId, parseInt(targetInvoiceId, 10)]
                    );

                    setImmediate(async () => {
                        try { await recalculateGlobalUserRollup(account.user_id); } catch (e) { console.error('Webhook COGS rollup error:', e.message); }
                    });
                }
                return res.status(200).json({ success: true, message: 'Cumulative COGS updated safely.' });
            }
        }

        // =================================================================
        // 🛑 INTERCEPT 1: LIVE INVOICE DELETION
        // =================================================================
        const isInvoiceDeletionEvent = payload.id &&
            payload.invoice_item && Array.isArray(payload.invoice_item) && payload.deleted_at;

        if (isInvoiceDeletionEvent) {
            const daftraInvoiceId = payload.id.toString().trim();
            for (const account of accountResult.rows) {
                await pool.query(
                    'DELETE FROM invoices_cache WHERE account_id = $1 AND daftra_invoice_id = $2;',
                    [account.id, daftraInvoiceId]
                );
                setImmediate(async () => {
                    try { await recalculateGlobalUserRollup(account.user_id); } catch (e) { console.error('Webhook delete rollup error:', e.message); }
                });
            }
            return res.status(200).json({ success: true, message: 'Invoice deleted cleanly.' });
        }

        // =================================================================
        // 🛑 INTERCEPT 2: LIVE CLIENT DELETION
        // =================================================================
        const isClientDeletionEvent = payload.id &&
            payload.client_number && !payload.invoice_item && payload.deleted_at;

        if (isClientDeletionEvent) {
            const daftraClientId = payload.id.toString().trim();
            for (const account of accountResult.rows) {
                await pool.query(
                    'DELETE FROM clients_cache WHERE account_id = $1 AND daftra_client_id = $2;',
                    [account.id, daftraClientId]
                );
            }
            return res.status(200).json({ success: true, message: 'Client profile removed.' });
        }

        // =================================================================
        // 👥 PIPELINE A: CLIENT UPSERT
        // =================================================================
        let rawClientData = null;
        if (payload.client_number || (payload.business_name && !payload.invoice_item)) {
            rawClientData = payload;
        } else {
            rawClientData = payload.clients || payload.Client ||
                (payload.data && payload.data.Client) || payload.invoice_client;
        }

        if (rawClientData && rawClientData.id) {
            const daftraClientId  = rawClientData.id.toString().trim();
            const daftraCreatedAt = rawClientData.created || new Date();
            const branchId        = rawClientData.branch_id ? parseInt(rawClientData.branch_id, 10) : null;

            let resolvedName = rawClientData.business_name ? rawClientData.business_name.trim() : '';
            if (!resolvedName) resolvedName = `${rawClientData.first_name || ''} ${rawClientData.last_name || ''}`.trim();
            if (!resolvedName) resolvedName = `Client #${daftraClientId}`;

            const email    = rawClientData.email  || null;
            const phone    = rawClientData.phone1 || rawClientData.phone2 || null;
            const currency = rawClientData.default_currency_code || 'EGP';

            for (const account of accountResult.rows) {
                await pool.query(`
                    INSERT INTO clients_cache
                    (account_id, branch_id, daftra_client_id, client_name, client_email, client_phone, currency, daftra_created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (account_id, daftra_client_id)
                    DO UPDATE SET
                        branch_id        = EXCLUDED.branch_id,
                        client_name      = EXCLUDED.client_name,
                        client_email     = EXCLUDED.client_email,
                        client_phone     = EXCLUDED.client_phone,
                        currency         = EXCLUDED.currency,
                        daftra_created_at = EXCLUDED.daftra_created_at;
                `, [account.id, branchId, daftraClientId, resolvedName, email, phone, currency, daftraCreatedAt]);
            }

            if (payload.client_number && !payload.invoice_item) {
                return res.status(200).json({ success: true, message: 'Client profile cache refreshed.' });
            }
        }

        // =================================================================
        // 📄 PIPELINE B: INVOICE UPSERT
        // =================================================================
        const financialData = (payload.data && payload.data.Invoice) ? payload.data.Invoice : payload;

        if (financialData.id && financialData.invoice_item) {
            const daftraDocumentId = financialData.id.toString().trim();
            const invoiceNo        = financialData.no ? financialData.no.toString().trim() : null;
            const clientId         = financialData.client_id ? financialData.client_id.toString().trim() : null;
            const branchId         = financialData.branch_id ? parseInt(financialData.branch_id, 10) : null;
            const currencyCode     = financialData.currency_code || 'EGP';
            const issueDate        = financialData.date || financialData.created || new Date();
            const dueDate          = parseDaftraDueDate(financialData);
            const requisitionDeliveryStatus = financialData.requisition_delivery_status
                ? parseInt(financialData.requisition_delivery_status, 10) : null;
            const paymentStatus    = parseInt(financialData.payment_status || 0, 10);
            const isReturnFlag     = (paymentStatus === 3) ? 1 : 0;

            const totalAmount         = parseFloat(financialData.summary_total    || 0);
            const subtotal            = parseFloat(financialData.summary_subtotal || 0);
            const generalDiscount     = parseFloat(financialData.summary_discount || 0);
            const itemDiscountTotal   = parseFloat(financialData.item_discount_amount || 0);
            const totalDiscountAmount = generalDiscount + itemDiscountTotal;
            const summaryPaid         = parseFloat(financialData.summary_paid   || 0);
            const summaryUnpaid       = parseFloat(financialData.summary_unpaid || 0);
            const grossSubtotal       = subtotal + itemDiscountTotal;
            const netRevenue          = subtotal - generalDiscount;
            const taxAmount           = parseFloat((totalAmount - netRevenue).toFixed(4));

            for (const account of accountResult.rows) {
                const accountBaseCurrency = account.currency_code || 'EGP';
                const cleanSubdomain      = account.daftra_subdomain.replace('https://', '').replace('http://', '').split('.')[0];
                const config = { headers: { 'Authorization': `Bearer ${account.encrypted_access_token}`, 'Accept': 'application/json' } };

                let exchangeRate  = 1.0;
                let totalDebit    = totalAmount;
                let totalCredit   = 0.0;
                let currencyDebit  = totalAmount;
                let currencyCredit = 0.0;

                if (currencyCode.toUpperCase() !== accountBaseCurrency.toUpperCase()) {
                    const jEntry = await fetchInvoiceJournalEntry(cleanSubdomain, config, daftraDocumentId);
                    if (jEntry) {
                        exchangeRate  = jEntry.exchange_rate;
                        totalDebit    = jEntry.total_debit;
                        totalCredit   = jEntry.total_credit;
                        currencyDebit  = jEntry.currency_debit;
                        currencyCredit = jEntry.currency_credit;
                    }
                }

                const baseNetRevenue    = parseFloat((netRevenue    * exchangeRate).toFixed(4));
                const baseTotalAmount   = parseFloat((totalAmount   * exchangeRate).toFixed(4));
                const baseSummaryPaid   = parseFloat((summaryPaid   * exchangeRate).toFixed(4));
                const baseSummaryUnpaid = parseFloat((summaryUnpaid * exchangeRate).toFixed(4));

                await pool.query(`
                    INSERT INTO invoices_cache
                    (account_id, daftra_invoice_id, invoice_no, client_id, branch_id, currency_code,
                     exchange_rate, total_debit, total_credit, currency_debit, currency_credit,
                     issue_date, due_date, payment_status, requisition_delivery_status,
                     gross_subtotal, total_discount, net_revenue, tax_amount, total_amount,
                     summary_paid, summary_unpaid, base_net_revenue, base_total_amount,
                     base_summary_paid, base_summary_unpaid, is_return)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
                    ON CONFLICT (account_id, daftra_invoice_id)
                    DO UPDATE SET
                        invoice_no                  = EXCLUDED.invoice_no,
                        client_id                   = EXCLUDED.client_id,
                        branch_id                   = EXCLUDED.branch_id,
                        currency_code               = EXCLUDED.currency_code,
                        exchange_rate               = EXCLUDED.exchange_rate,
                        total_debit                 = EXCLUDED.total_debit,
                        total_credit                = EXCLUDED.total_credit,
                        currency_debit              = EXCLUDED.currency_debit,
                        currency_credit             = EXCLUDED.currency_credit,
                        issue_date                  = EXCLUDED.issue_date,
                        due_date                    = EXCLUDED.due_date,
                        payment_status              = EXCLUDED.payment_status,
                        requisition_delivery_status = EXCLUDED.requisition_delivery_status,
                        gross_subtotal              = EXCLUDED.gross_subtotal,
                        total_discount              = EXCLUDED.total_discount,
                        net_revenue                 = EXCLUDED.net_revenue,
                        tax_amount                  = EXCLUDED.tax_amount,
                        total_amount                = EXCLUDED.total_amount,
                        summary_paid                = EXCLUDED.summary_paid,
                        summary_unpaid              = EXCLUDED.summary_unpaid,
                        base_net_revenue            = EXCLUDED.base_net_revenue,
                        base_total_amount           = EXCLUDED.base_total_amount,
                        base_summary_paid           = EXCLUDED.base_summary_paid,
                        base_summary_unpaid         = EXCLUDED.base_summary_unpaid,
                        is_return                   = EXCLUDED.is_return;
                `, [
                    account.id, daftraDocumentId, invoiceNo, clientId, branchId,
                    currencyCode, exchangeRate, totalDebit, totalCredit, currencyDebit, currencyCredit,
                    issueDate, dueDate, paymentStatus, requisitionDeliveryStatus,
                    grossSubtotal, totalDiscountAmount, netRevenue, taxAmount,
                    totalAmount, summaryPaid, summaryUnpaid,
                    baseNetRevenue, baseTotalAmount, baseSummaryPaid, baseSummaryUnpaid,
                    isReturnFlag,
                ]);

                // 🎯 تشغيل حساب المجموعيات فقط لحماية السيرفر من الـ Webhook Storm
                setImmediate(async () => {
                    try {
                        await recalculateGlobalUserRollup(account.user_id);
                    } catch (e) {
                        console.error('Webhook background sync error:', e.message);
                    }
                });
            }
        }

        return res.status(200).json({ success: true, message: 'Webhook processed.' });

    } catch (error) {
        console.error('❌ [webhookController] Handling Error:', error.message);
        return res.status(500).json({ error: 'Internal processing failure' });
    }
};

module.exports = { handleDaftraWebhook };