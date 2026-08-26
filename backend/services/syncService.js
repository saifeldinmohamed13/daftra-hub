const pool = require('../config/db');
const { parseDaftraDueDate } = require('../utils/helpers');
const {
    fetchExactEntityTotals,
    fetchBranchesFromDaftra,
    fetchTreasuriesFromDaftra,
    fetchTreasuryJournalAccounts,
    fetchTreasuryTransactionsFromDaftra,
    fetchInvoicesV2FromDaftra,
    fetchRefundReceiptsV2FromDaftra,
    fetchInvoicePaymentsFromDaftra,
    fetchSingleInvoiceNoFromDaftra,
    fetchPaymentExchangeRateFromDaftra,
    fetchClientsFromDaftra,
    fetchProductsFromDaftra,
    fetchInvoiceItemsFromDaftra,
    fetchRequisitionsFromDaftra,
    fetchRequisitionSingleDetails,
    fetchInvoiceJournalEntry,
    fetchInvoiceCOGSDirectly,
    fetchJournalCategoriesFromDaftra,
    fetchJournalAccountsFromDaftra,
    fetchJournalTransactionsFromDaftra,
    getDateRangeFilter,
    chunkArray,
    buildBulkInQuery,
    fetchAllPagesV2
} = require('./daftraService');

// ─────────────────────────────────────────────
// 🛠️ CENTRAL HELPER FUNCTIONS & CLEANUP WORKER
// ─────────────────────────────────────────────

const updateJobProgress = async (jobId, properties) => {
    if (!jobId) return;
    const fields = Object.keys(properties).map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = Object.values(properties);
    const query = `UPDATE sync_jobs SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = $1;`;
    await pool.query(query, [jobId, ...values]);
};

const incrementJobProgress = async (jobId, addProcessed, stepName = null) => {
    if (!jobId || addProcessed <= 0) return;
    try {
        const jobRes = await pool.query('SELECT total_records, processed_records FROM sync_jobs WHERE id = $1;', [jobId]);
        if (jobRes.rows.length === 0) return;

        const total = parseInt(jobRes.rows[0].total_records || 0, 10);
        const currentProcessed = parseInt(jobRes.rows[0].processed_records || 0, 10) + addProcessed;

        let percentage = 0;
        if (total > 0) {
            percentage = Math.min(99, Math.floor((currentProcessed / total) * 100));
        }

        const updateObj = {
            processed_records: currentProcessed,
            progress_percentage: percentage
        };
        if (stepName) updateObj.current_step = stepName;

        await updateJobProgress(jobId, updateObj);
    } catch (e) {
        console.error("❌ Failed to update job progress increment:", e.message);
    }
};

/**
 * 🧹 Rolling 30-Day Cleanup Window
 */
const cleanOldCacheData = async (accountId) => {
    try {
        await pool.query(`DELETE FROM invoices_cache WHERE account_id = $1 AND issue_date < CURRENT_DATE - INTERVAL '30 days';`, [accountId]);
        await pool.query(`DELETE FROM returns_cache WHERE account_id = $1 AND issue_date < CURRENT_DATE - INTERVAL '30 days';`, [accountId]);
        await pool.query(`DELETE FROM treasury_transactions_cache WHERE account_id = $1 AND transaction_date < CURRENT_DATE - INTERVAL '30 days';`, [accountId]);
        await pool.query(`DELETE FROM journal_transactions_cache WHERE account_id = $1 AND transaction_date < CURRENT_DATE - INTERVAL '30 days';`, [accountId]);
        await pool.query(`DELETE FROM invoice_payments_cache WHERE account_id = $1 AND payment_date < CURRENT_DATE - INTERVAL '30 days';`, [accountId]);
        console.log(`🧹 [RollingCleanup] Successfully purged records older than 30 days for Account #${accountId}`);
    } catch (err) {
        console.error(`⚠️ [RollingCleanup] Failed purging old records for Account #${accountId}:`, err.message);
    }
};

const recalculateGlobalUserRollup = async (userId) => {
    return true;
};

// ─────────────────────────────────────────────
// 🚚 🎯 TARGETED DUAL SYNC: REQUISITIONS/COGS & UNPAID PAYMENT STATUS
// ─────────────────────────────────────────────
const syncPendingRequisitionsForAccount = async (accountId) => {
    try {
        const accRes = await pool.query(
            'SELECT id, daftra_subdomain, encrypted_access_token, currency_code FROM linked_accounts WHERE id = $1;',
            [accountId]
        );
        if (accRes.rows.length === 0) return;

        const { daftra_subdomain: subdomain, encrypted_access_token: token } = accRes.rows[0];
        const cleanSubdomain = subdomain.replace('https://', '').replace('http://', '').split('.')[0];
        const config = { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } };

        const pendingReqInvoicesRes = await pool.query(`
            SELECT daftra_invoice_id, branch_id 
            FROM invoices_cache 
            WHERE account_id = $1 
              AND requisition_delivery_status IN (3, 4, 5);
        `, [accountId]);

        if (pendingReqInvoicesRes.rows.length > 0) {
            const pendingReqInvoiceIds = pendingReqInvoicesRes.rows.map(r => r.daftra_invoice_id);
            const branchIds = [...new Set(pendingReqInvoicesRes.rows.map(r => r.branch_id).filter(Boolean))];

            const requisitions = await fetchRequisitionsFromDaftra(cleanSubdomain, config, branchIds, pendingReqInvoiceIds);

            const invoiceRequisitionsMap = {};
            const acceptedReqIds = [];
            const reqToInvoiceMap = {};

            for (const req of requisitions) {
                const daftraInvoiceId = req.order_id ? req.order_id.toString().trim() : null;
                if (!daftraInvoiceId) continue;

                if (!invoiceRequisitionsMap[daftraInvoiceId]) {
                    invoiceRequisitionsMap[daftraInvoiceId] = [];
                }
                invoiceRequisitionsMap[daftraInvoiceId].push(req);

                if (req.id && parseInt(req.status, 10) === 3) {
                    const reqIdStr = req.id.toString().trim();
                    acceptedReqIds.push(reqIdStr);
                    reqToInvoiceMap[reqIdStr] = daftraInvoiceId;
                }
            }

            const reqCogsMap = {};
            if (acceptedReqIds.length > 0) {
                try {
                    const reqChunks = chunkArray(acceptedReqIds, 10);
                    let rjList = [];
                    for (const chunk of reqChunks) {
                        const bulkFilter = buildBulkInQuery('entity_id', chunk);
                        const url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/journal/list/1?${bulkFilter}&filter[entity_type]=requisition`;
                        const res = await fetchAllPagesV2(url, config);
                        rjList = rjList.concat(res);
                    }

                    for (const rjItem of rjList) {
                        if (rjItem && rjItem.id && rjItem.entity_id && rjItem.total_debit) {
                            const reqIdStr = rjItem.entity_id.toString().trim();
                            const targetInvoiceIdStr = reqToInvoiceMap[reqIdStr];
                            if (targetInvoiceIdStr) {
                                reqCogsMap[targetInvoiceIdStr] = (reqCogsMap[targetInvoiceIdStr] || 0) + parseFloat(rjItem.total_debit);
                            }
                        }
                    }
                } catch (e) {
                    console.error(`⚠️ COGS Requisition Fetch Error on Account #${accountId}:`, e.message);
                }
            }

            for (const [daftraInvoiceId, reqList] of Object.entries(invoiceRequisitionsMap)) {
                const statuses = reqList.map(r => parseInt(r.status, 10));
                let mappedInvoiceStatus = null;

                if (statuses.every(s => s === 3)) mappedInvoiceStatus = 1;      // RECEIVED
                else if (statuses.every(s => s === 4)) mappedInvoiceStatus = 2; // REJECTED
                else if (statuses.every(s => s === 1)) mappedInvoiceStatus = 3; // PENDING
                else if (statuses.includes(3)) mappedInvoiceStatus = 4;        // PARTIALLY RECEIVED
                else if (statuses.includes(4)) mappedInvoiceStatus = 5;        // PARTIALLY REJECTED

                if (mappedInvoiceStatus !== null) {
                    const newCogs = reqCogsMap[daftraInvoiceId];
                    if (newCogs !== undefined && newCogs > 0) {
                        await pool.query(`
                            UPDATE invoices_cache 
                            SET requisition_delivery_status = $1,
                                total_cogs = COALESCE(total_cogs, 0) + $2
                            WHERE account_id = $3 AND daftra_invoice_id = $4;
                        `, [mappedInvoiceStatus, newCogs, accountId, daftraInvoiceId]);
                    } else {
                        await pool.query(`
                            UPDATE invoices_cache 
                            SET requisition_delivery_status = $1 
                            WHERE account_id = $2 AND daftra_invoice_id = $3;
                        `, [mappedInvoiceStatus, accountId, daftraInvoiceId]);
                    }
                }
            }
        }

        const pendingPaymentInvoicesRes = await pool.query(`
            SELECT daftra_invoice_id 
            FROM invoices_cache 
            WHERE account_id = $1 
              AND payment_status IN (0, 1)
              AND (is_return IS NULL OR is_return != 1);
        `, [accountId]);

        if (pendingPaymentInvoicesRes.rows.length > 0) {
            const pendingPaymentInvoiceIds = pendingPaymentInvoicesRes.rows.map(r => r.daftra_invoice_id);

            const invChunks = chunkArray(pendingPaymentInvoiceIds, 10);
            let updatedInvoicesList = [];
            for (const chunk of invChunks) {
                const bulkFilter = buildBulkInQuery('id', chunk);
                const url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/invoice/list/1?${bulkFilter}&filter[type]=0&filter[deleted_at][is_null]`;
                const res = await fetchAllPagesV2(url, config);
                updatedInvoicesList = updatedInvoicesList.concat(res);
            }

            for (const inv of updatedInvoicesList) {
                if (!inv || !inv.id) continue;

                const daftraInvoiceId = inv.id.toString().trim();
                const newPaymentStatus = parseInt(inv.payment_status || 0, 10);
                const summaryPaid      = parseFloat(inv.summary_paid || 0);
                const summaryUnpaid    = parseFloat(inv.summary_unpaid || 0);

                await pool.query(`
                    UPDATE invoices_cache
                    SET payment_status = $1,
                        summary_paid   = $2,
                        summary_unpaid = $3,
                        base_summary_paid   = ROUND(($2 * exchange_rate)::numeric, 4),
                        base_summary_unpaid = ROUND(($3 * exchange_rate)::numeric, 4)
                    WHERE account_id = $4 AND daftra_invoice_id = $5;
                `, [newPaymentStatus, summaryPaid, summaryUnpaid, accountId, daftraInvoiceId]);
            }
        }

        console.log(`✅ [TargetedSync] Requisitions, COGS & Payment statuses refreshed successfully for Account #${accountId}`);

    } catch (err) {
        console.error(`⚠️ [TargetedSync] Dual Sync Error for Account #${accountId}:`, err.message);
    }
};

// ─────────────────────────────────────────────
// 1. SYNC BRANCHES
// ─────────────────────────────────────────────
const syncBranches = async (accountId, cleanSubdomain, config) => {
    const branchIds = [];
    try {
        const branches = await fetchBranchesFromDaftra(cleanSubdomain, config);
        for (const b of branches) {
            if (!b.id) continue;
            const branchId = parseInt(b.id, 10);
            branchIds.push(branchId);
            const branchName = b.name || `Branch #${branchId}`;
            const status = parseInt(b.status || 1, 10);

            await pool.query(`
                INSERT INTO branches_cache (account_id, daftra_branch_id, name, status)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (account_id, daftra_branch_id)
                DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status;
            `, [accountId, branchId, branchName, status]);
        }
    } catch (err) {
        console.error(`❌ [syncService] Branch Sync Error for ${cleanSubdomain}:`, err.message);
    }
    return branchIds;
};

// ─────────────────────────────────────────────
// 2. SYNC TREASURIES
// ─────────────────────────────────────────────
const syncTreasuries = async (accountId, cleanSubdomain, config) => {
    const treasuryAccountIds = [];
    try {
        const accRes = await pool.query('SELECT currency_code FROM linked_accounts WHERE id = $1;', [accountId]);
        const accountBaseCurrency = accRes.rows[0]?.currency_code || 'EGP';

        const [liveTreasuries, journalAccounts] = await Promise.all([
            fetchTreasuriesFromDaftra(cleanSubdomain, config),
            fetchTreasuryJournalAccounts(cleanSubdomain, config)
        ]);

        const journalMap = {};
        for (const ja of journalAccounts) {
            if (ja.id && ja.entity_id) {
                journalMap[ja.entity_id.toString().trim()] = parseInt(ja.id, 10);
            }
        }

        for (const t of liveTreasuries) {
            if (!t.id) continue;
            const entityId = t.id.toString().trim();
            const journalAccountId = journalMap[entityId] || parseInt(entityId, 10);

            treasuryAccountIds.push(journalAccountId);

            const name         = t.name || `Treasury #${journalAccountId}`;
            const branchId     = t.branch_id ? parseInt(t.branch_id, 10) : null;
            const liveBalance  = parseFloat(t.balance || 0);

            let currencyCode = t.currency_code;
            if ((entityId === '1' || journalAccountId === 1) && (!currencyCode || currencyCode.trim() === '')) {
                currencyCode = accountBaseCurrency;
            } else if (!currencyCode) {
                currencyCode = accountBaseCurrency;
            }

            await pool.query(`
                INSERT INTO treasuries_cache
                (account_id, journal_account_id, entity_id, name, branch_id, current_balance, currency_code, last_updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
                ON CONFLICT (account_id, journal_account_id)
                DO UPDATE SET 
                    entity_id = EXCLUDED.entity_id,
                    name = EXCLUDED.name, 
                    branch_id = EXCLUDED.branch_id, 
                    current_balance = EXCLUDED.current_balance,
                    currency_code = EXCLUDED.currency_code,
                    last_updated_at = CURRENT_TIMESTAMP;
            `, [accountId, journalAccountId, entityId, name, branchId, liveBalance, currencyCode]);
        }
    } catch (err) {
        console.error(`❌ [syncService] Treasuries Sync Error for ${cleanSubdomain}:`, err.message);
    }
    return treasuryAccountIds;
};

// ─────────────────────────────────────────────
// 3. SYNC TREASURY TRANSACTIONS
// ─────────────────────────────────────────────
const syncTreasuryTransactions = async (accountId, cleanSubdomain, config, treasuryAccountIds, isSingleDay = false, jobId = null) => {
    try {
        if (treasuryAccountIds.length === 0) return;

        const allowedTreasurySet = new Set(treasuryAccountIds.map(id => parseInt(id, 10)));
        const dateFilter = getDateRangeFilter(isSingleDay, 'created');

        const txns = await fetchTreasuryTransactionsFromDaftra(cleanSubdomain, config, treasuryAccountIds, dateFilter);

        for (const item of txns) {
            if (!item.id || !item.journal_id || !item.journal_account_id) continue;

            const jAccountId = parseInt(item.journal_account_id, 10);
            if (!allowedTreasurySet.has(jAccountId)) continue;

            const journalId    = parseInt(item.journal_id, 10);
            const branchId     = item.branch_id ? parseInt(item.branch_id, 10) : (item.journal?.branch_id ? parseInt(item.journal.branch_id, 10) : null);
            const entityType   = item.journal?.entity_type || item.subkey || 'transaction';
            const currencyCode = item.currency_code || 'EGP';

            const currencyDebit  = parseFloat(item.currency_debit  || 0);
            const currencyCredit = parseFloat(item.currency_credit || 0);
            const debit          = Math.abs(parseFloat(item.debit  || 0));
            const credit         = Math.abs(parseFloat(item.credit || 0));

            let exchangeRate = 1.0;
            if (currencyDebit > 0 && debit > 0)        exchangeRate = debit  / currencyDebit;
            else if (currencyCredit > 0 && credit > 0) exchangeRate = credit / currencyCredit;

            const description     = item.description || item.journal?.description || '';
            const transactionDate = item.created || item.journal?.date || new Date();

            await pool.query(`
                INSERT INTO treasury_transactions_cache
                (account_id, journal_account_id, journal_id, branch_id, entity_type,
                 currency_code, exchange_rate, currency_debit, currency_credit, debit, credit,
                 description, transaction_date)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                ON CONFLICT (account_id, journal_account_id, journal_id)
                DO UPDATE SET
                    branch_id        = EXCLUDED.branch_id,
                    entity_type      = EXCLUDED.entity_type,
                    currency_code    = EXCLUDED.currency_code,
                    exchange_rate    = EXCLUDED.exchange_rate,
                    currency_debit   = EXCLUDED.currency_debit,
                    currency_credit  = EXCLUDED.currency_credit,
                    debit            = EXCLUDED.debit,
                    credit           = EXCLUDED.credit,
                    description      = EXCLUDED.description,
                    transaction_date = EXCLUDED.transaction_date;
            `, [
                accountId, jAccountId, journalId, branchId, entityType, currencyCode, exchangeRate,
                currencyDebit, currencyCredit, debit, credit, description, transactionDate,
            ]);
        }

        if (jobId) {
            await incrementJobProgress(jobId, txns.length, 'fetching_transactions');
        }
    } catch (err) {
        console.error(`❌ [syncService] Treasury Transactions Sync Error for ${cleanSubdomain}:`, err.message);
    }
};

// ─────────────────────────────────────────────
// 3.5 SYNC DAILY TREASURY TOTALS
// ─────────────────────────────────────────────
const syncDailyTreasuryTotals = async (accountId) => {
    try {
        const query = `
            WITH today_txns AS (
                SELECT
                    tt.account_id,
                    tt.journal_account_id,
                    COALESCE(SUM(CASE WHEN DATE(tt.transaction_date) = CURRENT_DATE THEN tt.debit  ELSE 0 END), 0) AS today_inflow,
                    COALESCE(SUM(CASE WHEN DATE(tt.transaction_date) = CURRENT_DATE THEN tt.credit ELSE 0 END), 0) AS today_outflow
                FROM treasury_transactions_cache tt
                WHERE tt.account_id = $1
                GROUP BY tt.account_id, tt.journal_account_id
            )
            INSERT INTO daily_treasury_totals
            (account_id, journal_account_id, branch_id, currency_code, record_date,
             opening_balance, today_inflow, today_outflow, net_change, closing_balance, updated_at)
            SELECT
                tc.account_id,
                tc.journal_account_id,
                tc.branch_id,
                tc.currency_code,
                CURRENT_DATE AS record_date,
                (tc.current_balance - COALESCE(t.today_inflow, 0) + COALESCE(t.today_outflow, 0)) AS opening_balance,
                COALESCE(t.today_inflow, 0) AS today_inflow,
                COALESCE(t.today_outflow, 0) AS today_outflow,
                (COALESCE(t.today_inflow, 0) - COALESCE(t.today_outflow, 0)) AS net_change,
                tc.current_balance AS closing_balance,
                CURRENT_TIMESTAMP
            FROM treasuries_cache tc
            LEFT JOIN today_txns t 
                   ON tc.account_id = t.account_id 
                  AND tc.journal_account_id = t.journal_account_id
            WHERE tc.account_id = $1
            ON CONFLICT (account_id, journal_account_id)
            DO UPDATE SET
                branch_id       = EXCLUDED.branch_id,
                currency_code   = EXCLUDED.currency_code,
                record_date     = EXCLUDED.record_date,
                opening_balance = EXCLUDED.opening_balance,
                today_inflow    = EXCLUDED.today_inflow,
                today_outflow   = EXCLUDED.today_outflow,
                net_change      = EXCLUDED.net_change,
                closing_balance = EXCLUDED.closing_balance,
                updated_at      = EXCLUDED.updated_at;
        `;
        await pool.query(query, [accountId]);
    } catch (err) {
        console.error(`❌ [syncService] Treasury Daily Totals Error for Account ${accountId}:`, err.message);
    }
};

// ─────────────────────────────────────────────
// 3.8 SYNC CHART OF ACCOUNTS & JOURNAL TRANSACTIONS
// ─────────────────────────────────────────────
const syncChartOfAccounts = async (accountId, cleanSubdomain, config, isSingleDay = false, jobId = null, branchIds = []) => {
    try {
        if (jobId) await updateJobProgress(jobId, { current_step: 'fetching_chart_of_accounts' });

        const categoriesList = await fetchJournalCategoriesFromDaftra(cleanSubdomain, config, [27, 43], branchIds);
        const catIds = [27, 43];

        const existingCats = await pool.query('SELECT daftra_category_id FROM journal_categories_cache WHERE account_id = $1;', [accountId]);
        const existingCatSet = new Set(existingCats.rows.map(r => parseInt(r.daftra_category_id, 10)));
        const fetchedCatSet = new Set();

        for (const cat of categoriesList) {
            if (!cat.id) continue;
            const daftraCatId = parseInt(cat.id, 10);
            catIds.push(daftraCatId);
            fetchedCatSet.add(daftraCatId);

            const code            = cat.code || null;
            const name            = cat.name || `Category #${daftraCatId}`;
            const parentCatId     = cat.journal_cat_id ? parseInt(cat.journal_cat_id, 10) : null;
            const parentCatIds    = cat.parent_cat_ids ? cat.parent_cat_ids.toString().trim() : null;
            const catType         = parseInt(cat.type || 0, 10);
            const branchId        = cat.branch_id ? parseInt(cat.branch_id, 10) : null;

            await pool.query(`
                INSERT INTO journal_categories_cache
                (account_id, daftra_category_id, code, name, parent_category_id, parent_cat_ids, type, branch_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (account_id, daftra_category_id)
                DO UPDATE SET
                    code               = EXCLUDED.code,
                    name               = EXCLUDED.name,
                    parent_category_id = EXCLUDED.parent_category_id,
                    parent_cat_ids     = EXCLUDED.parent_cat_ids,
                    type               = EXCLUDED.type,
                    branch_id          = EXCLUDED.branch_id;
            `, [accountId, daftraCatId, code, name, parentCatId, parentCatIds, catType, branchId]);
        }

        for (const oldCatId of existingCatSet) {
            if (!fetchedCatSet.has(oldCatId)) {
                await pool.query('DELETE FROM journal_categories_cache WHERE account_id = $1 AND daftra_category_id = $2;', [accountId, oldCatId]);
            }
        }

        const journalAccountsList = await fetchJournalAccountsFromDaftra(cleanSubdomain, config, catIds, branchIds);
        const journalAccountIds = [];

        const existingAccs = await pool.query('SELECT daftra_account_id FROM journal_accounts_cache WHERE account_id = $1;', [accountId]);
        const existingAccSet = new Set(existingAccs.rows.map(r => parseInt(r.daftra_account_id, 10)));
        const fetchedAccSet = new Set();

        for (const acc of journalAccountsList) {
            if (!acc.id) continue;
            const daftraAccId = parseInt(acc.id, 10);
            journalAccountIds.push(daftraAccId);
            fetchedAccSet.add(daftraAccId);

            const code         = acc.code || null;
            const name         = acc.name || `Account #${daftraAccId}`;
            const journalCatId = acc.journal_cat_id ? parseInt(acc.journal_cat_id, 10) : 0;
            const accType      = parseInt(acc.type || 0, 10);
            const entityType   = acc.entity_type || null;
            const entityId     = acc.entity_id ? acc.entity_id.toString().trim() : null;
            const branchId     = acc.branch_id ? parseInt(acc.branch_id, 10) : null;

            await pool.query(`
                INSERT INTO journal_accounts_cache
                (account_id, daftra_account_id, code, name, journal_cat_id, type, entity_type, entity_id, branch_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (account_id, daftra_account_id)
                DO UPDATE SET
                    code           = EXCLUDED.code,
                    name           = EXCLUDED.name,
                    journal_cat_id = EXCLUDED.journal_cat_id,
                    type           = EXCLUDED.type,
                    entity_type    = EXCLUDED.entity_type,
                    entity_id      = EXCLUDED.entity_id,
                    branch_id      = EXCLUDED.branch_id;
            `, [accountId, daftraAccId, code, name, journalCatId, accType, entityType, entityId, branchId]);
        }

        for (const oldAccId of existingAccSet) {
            if (!fetchedAccSet.has(oldAccId)) {
                await pool.query('DELETE FROM journal_accounts_cache WHERE account_id = $1 AND daftra_account_id = $2;', [accountId, oldAccId]);
            }
        }

        if (journalAccountIds.length > 0) {
            const dateFilter = getDateRangeFilter(isSingleDay, 'journal.date');
            const txnsList = await fetchJournalTransactionsFromDaftra(cleanSubdomain, config, journalAccountIds, dateFilter);

            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            thirtyDaysAgo.setHours(0, 0, 0, 0);

            for (const item of txnsList) {
                if (!item.id || !item.journal_id || !item.journal_account_id) continue;

                const transactionDate = item.journal?.date ? new Date(item.journal.date) : (item.created ? new Date(item.created) : new Date());

                if (!isSingleDay && transactionDate < thirtyDaysAgo) {
                    continue; 
                }

                const daftraTxnId   = parseInt(item.id, 10);
                const journalId     = parseInt(item.journal_id, 10);
                const jAccountId    = parseInt(item.journal_account_id, 10);
                const branchId      = item.journal?.branch_id ? parseInt(item.journal.branch_id, 10) : null;
                const subkey        = item.subkey || null;
                const description   = item.description || item.journal?.description || '';
                const currencyCode  = item.currency_code || 'EGP';
                const exchangeRate  = parseFloat(item.currency_rate || item.exchange_rate || 1.0);

                const currencyDebit  = parseFloat(item.currency_debit  || 0);
                const currencyCredit = parseFloat(item.currency_credit || 0);
                const debit          = Math.abs(parseFloat(item.debit  || 0));
                const credit         = Math.abs(parseFloat(item.credit || 0));

                await pool.query(`
                    INSERT INTO journal_transactions_cache
                    (account_id, daftra_txn_id, journal_id, journal_account_id, branch_id, subkey,
                     description, currency_code, exchange_rate, currency_debit, currency_credit,
                     debit, credit, transaction_date)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                    ON CONFLICT (account_id, daftra_txn_id)
                    DO UPDATE SET
                        journal_id         = EXCLUDED.journal_id,
                        journal_account_id = EXCLUDED.journal_account_id,
                        branch_id          = EXCLUDED.branch_id,
                        subkey             = EXCLUDED.subkey,
                        description        = EXCLUDED.description,
                        currency_code      = EXCLUDED.currency_code,
                        exchange_rate      = EXCLUDED.exchange_rate,
                        currency_debit     = EXCLUDED.currency_debit,
                        currency_credit    = EXCLUDED.currency_credit,
                        debit              = EXCLUDED.debit,
                        credit             = EXCLUDED.credit,
                        transaction_date   = EXCLUDED.transaction_date;
                `, [
                    accountId, daftraTxnId, journalId, jAccountId, branchId, subkey,
                    description, currencyCode, exchangeRate, currencyDebit, currencyCredit,
                    debit, credit, transactionDate
                ]);
            }
        }

        await pool.query(`
            UPDATE journal_accounts_cache ja
            SET total_amount = ABS(COALESCE(calc.net_bal, 0))
            FROM (
                SELECT 
                    journal_account_id,
                    SUM(credit - debit) AS net_bal
                FROM journal_transactions_cache
                WHERE account_id = $1
                  AND transaction_date >= CURRENT_DATE - INTERVAL '30 days'
                GROUP BY journal_account_id
            ) calc
            WHERE ja.account_id = $1 AND ja.daftra_account_id = calc.journal_account_id;
        `, [accountId]);

        await pool.query(`
            UPDATE journal_categories_cache jc
            SET total_amount = ABS(COALESCE(cat_calc.cat_net, 0))
            FROM (
                SELECT 
                    ja.journal_cat_id,
                    SUM(CASE WHEN ja.type = 1 THEN -1 * ja.total_amount ELSE ja.total_amount END) AS cat_net
                FROM journal_accounts_cache ja
                WHERE ja.account_id = $1
                GROUP BY ja.journal_cat_id
            ) cat_calc
            WHERE jc.account_id = $1 AND jc.daftra_category_id = cat_calc.journal_cat_id;
        `, [accountId]);

    } catch (err) {
        console.error(`❌ [syncService] Chart of Accounts Sync Error for ${cleanSubdomain}:`, err.message);
    }
};

// ─────────────────────────────────────────────
// 4. SYNC INVOICES V2 & REFUND RECEIPTS
// ─────────────────────────────────────────────
const syncInvoicesV2 = async (accountId, cleanSubdomain, config, branchIds, isSingleDay = false, jobId = null) => {
    try {
        if (jobId) await updateJobProgress(jobId, { current_step: 'fetching_invoices' });

        const siteQuery = await pool.query('SELECT daftra_site_id, currency_code FROM linked_accounts WHERE id = $1;', [accountId]);
        const daftraSiteId        = siteQuery.rows[0]?.daftra_site_id  || 'UNKNOWN';
        const accountBaseCurrency = (siteQuery.rows[0]?.currency_code || 'EGP').toUpperCase();

        const dateFilter = getDateRangeFilter(isSingleDay, 'date');

        const [rawInvoicesList, rawRefundsList] = await Promise.all([
            fetchInvoicesV2FromDaftra(cleanSubdomain, config, branchIds, dateFilter),
            fetchRefundReceiptsV2FromDaftra(cleanSubdomain, config, branchIds, dateFilter)
        ]);

        const foreignCurrencyDocIds = [];
        for (const inv of rawInvoicesList) {
            if (inv.id && inv.currency_code && inv.currency_code.toUpperCase() !== accountBaseCurrency) {
                foreignCurrencyDocIds.push(inv.id.toString().trim());
            }
        }
        for (const ref of rawRefundsList) {
            if (ref.id && ref.currency_code && ref.currency_code.toUpperCase() !== accountBaseCurrency) {
                foreignCurrencyDocIds.push(ref.id.toString().trim());
            }
        }

        const foreignJournalMap = {};
        if (foreignCurrencyDocIds.length > 0) {
            try {
                const jChunks = chunkArray(foreignCurrencyDocIds, 10);
                let jList = [];
                for (const chunk of jChunks) {
                    const bulkFilter = buildBulkInQuery('entity_id', chunk);
                    const url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/journal/list/1?${bulkFilter}&filter[entity_type]=invoice`;
                    const res = await fetchAllPagesV2(url, config);
                    jList = jList.concat(res);
                }

                for (const j of jList) {
                    if (!j || !j.entity_id) continue;
                    const docIdStr       = j.entity_id.toString().trim();
                    const totalDebit     = parseFloat(j.total_debit || 0);
                    const currencyDebit  = parseFloat(j.currency_debit || 0);
                    let calculatedRate = 1.0;
                    if (currencyDebit > 0 && totalDebit > 0) {
                        calculatedRate = totalDebit / currencyDebit;
                    }
                    foreignJournalMap[docIdStr] = calculatedRate;
                }
            } catch (err) {
                console.error(`❌ Batch foreign exchange rate fetch error for ${cleanSubdomain}:`, err.message);
            }
        }

        const returnsByOriginalInvoiceMap = {};
        const validReturns = [];

        const directRefundIds = [];
        const acceptedRefundReqIds = [];
        const reqToRefundMap = {};

        for (const ref of rawRefundsList) {
            if (!ref.id) continue;
            const daftraReturnId = ref.id.toString().trim();
            const returnNo       = ref.no ? ref.no.toString().trim() : null;
            const subscriptionId = ref.subscription_id
                ? ref.subscription_id.toString().trim()
                : (ref.source_id ? ref.source_id.toString().trim() : null);
            const clientId       = ref.client_id ? ref.client_id.toString().trim() : null;
            const branchId       = ref.branch_id ? parseInt(ref.branch_id, 10) : null;
            const currencyCode   = ref.currency_code || accountBaseCurrency;
            const issueDate      = ref.issue_date || ref.date || ref.created || new Date();

            const totalAmount         = parseFloat(ref.summary_total    || 0);
            const subtotal            = parseFloat(ref.summary_subtotal || 0);
            const generalDiscount     = parseFloat(ref.summary_discount || 0);
            const itemDiscountTotal   = parseFloat(ref.item_discount_amount || 0);
            const totalDiscountAmount = generalDiscount + itemDiscountTotal;
            const summaryPaid         = parseFloat(ref.summary_paid    || 0);
            const summaryUnpaid       = parseFloat(ref.summary_unpaid || 0);
            const grossSubtotal       = subtotal + itemDiscountTotal;
            const netRevenue          = subtotal - generalDiscount;
            const taxAmount           = parseFloat((totalAmount - netRevenue).toFixed(4));

            let exchangeRate = 1.0;
            if (currencyCode.toUpperCase() !== accountBaseCurrency) {
                exchangeRate = foreignJournalMap[daftraReturnId] || 1.0;
            }

            const baseTotalAmount = parseFloat((totalAmount * exchangeRate).toFixed(4));

            if (subscriptionId) {
                returnsByOriginalInvoiceMap[subscriptionId] = (returnsByOriginalInvoiceMap[subscriptionId] || 0) + baseTotalAmount;
            }

            const refundReqs = ref.refund_receipt_requisitions || [];
            let hasAcceptedRefundReq = false;

            for (const rReq of refundReqs) {
                if (rReq && rReq.id && parseInt(rReq.status, 10) === 3) {
                    const rReqIdStr = rReq.id.toString().trim();
                    acceptedRefundReqIds.push(rReqIdStr);
                    reqToRefundMap[rReqIdStr] = subscriptionId;
                    hasAcceptedRefundReq = true;
                }
            }

            if (!hasAcceptedRefundReq && subscriptionId) {
                directRefundIds.push(daftraReturnId);
            }

            validReturns.push({
                daftraReturnId, returnNo, subscriptionId, clientId, branchId, currencyCode, exchangeRate,
                issueDate, paymentStatus: parseInt(ref.payment_status || 0, 10), grossSubtotal,
                totalDiscountAmount, netRevenue, taxAmount, totalAmount, summaryPaid, summaryUnpaid,
                baseNetRevenue: parseFloat((netRevenue * exchangeRate).toFixed(4)),
                baseTotalAmount,
                baseSummaryPaid: parseFloat((summaryPaid * exchangeRate).toFixed(4)),
                baseSummaryUnpaid: parseFloat((summaryUnpaid * exchangeRate).toFixed(4)),
            });
        }

        const directInvoiceIds = [];
        const acceptedReqIds   = [];
        const reqToInvoiceMap  = {};

        for (const inv of rawInvoicesList) {
            if (!inv.id) continue;
            const daftraInvoiceId = inv.id.toString().trim();
            const reqs = inv.invoice_requisitions || [];
            let hasAcceptedReq = false;

            for (const req of reqs) {
                if (req && req.id && parseInt(req.status, 10) === 3) {
                    const reqIdStr = req.id.toString().trim();
                    acceptedReqIds.push(reqIdStr);
                    reqToInvoiceMap[reqIdStr] = daftraInvoiceId;
                    hasAcceptedReq = true;
                }
            }

            if (!hasAcceptedReq) {
                directInvoiceIds.push(daftraInvoiceId);
            }
        }

        const directCogsMap = {};
        if (directInvoiceIds.length > 0) {
            try {
                const invChunks = chunkArray(directInvoiceIds, 10);
                let jList = [];
                for (const chunk of invChunks) {
                    const bulkFilter = buildBulkInQuery('entity_id', chunk);
                    const url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/journal/list/1?${bulkFilter}&filter[entity_type]=invoice_sales_cost`;
                    const res = await fetchAllPagesV2(url, config);
                    jList = jList.concat(res);
                }

                for (const jItem of jList) {
                    if (jItem && jItem.id && jItem.entity_id && jItem.total_debit) {
                        const invIdStr = jItem.entity_id.toString().trim();
                        directCogsMap[invIdStr] = (directCogsMap[invIdStr] || 0) + parseFloat(jItem.total_debit);
                        await pool.query(
                            'INSERT INTO processed_cogs_entries (account_id, daftra_site_id, journal_entry_id, invoice_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING;',
                            [accountId, daftraSiteId, parseInt(jItem.id, 10), parseInt(invIdStr, 10)]
                        );
                    }
                }
            } catch (err) {
                console.error(`❌ [syncService] Batch Direct COGS fetch failed for ${cleanSubdomain}:`, err.message);
            }
        }

        const reqCogsMap = {};
        if (acceptedReqIds.length > 0) {
            try {
                const reqChunks = chunkArray(acceptedReqIds, 10);
                let rjList = [];
                for (const chunk of reqChunks) {
                    const bulkFilter = buildBulkInQuery('entity_id', chunk);
                    const url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/journal/list/1?${bulkFilter}&filter[entity_type]=requisition`;
                    const res = await fetchAllPagesV2(url, config);
                    rjList = rjList.concat(res);
                }

                for (const rjItem of rjList) {
                    if (rjItem && rjItem.id && rjItem.entity_id && rjItem.total_debit) {
                        const reqIdStr           = rjItem.entity_id.toString().trim();
                        const targetInvoiceIdStr = reqToInvoiceMap[reqIdStr];
                        if (targetInvoiceIdStr) {
                            reqCogsMap[targetInvoiceIdStr] = (reqCogsMap[targetInvoiceIdStr] || 0) + parseFloat(rjItem.total_debit);
                            await pool.query(
                                'INSERT INTO processed_cogs_entries (account_id, daftra_site_id, journal_entry_id, invoice_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING;',
                                [accountId, daftraSiteId, parseInt(rjItem.id, 10), parseInt(targetInvoiceIdStr, 10)]
                            );
                        }
                    }
                }
            } catch (err) {
                console.error(`❌ [syncService] Batch Requisition COGS fetch failed for ${cleanSubdomain}:`, err.message);
            }
        }

        const refundReqCogsMap = {};
        if (acceptedRefundReqIds.length > 0) {
            try {
                const refChunks = chunkArray(acceptedRefundReqIds, 10);
                let refJList = [];
                for (const chunk of refChunks) {
                    const bulkFilter = buildBulkInQuery('entity_id', chunk);
                    const url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/journal/list/1?${bulkFilter}&filter[entity_type]=requisition`;
                    const res = await fetchAllPagesV2(url, config);
                    refJList = refJList.concat(res);
                }

                for (const refJItem of refJList) {
                    if (refJItem && refJItem.id && refJItem.entity_id && refJItem.total_debit) {
                        const refReqIdStr = refJItem.entity_id.toString().trim();
                        const origInvId   = reqToRefundMap[refReqIdStr];
                        if (origInvId) {
                            refundReqCogsMap[origInvId] = (refundReqCogsMap[origInvId] || 0) + parseFloat(refJItem.total_debit);
                        }
                    }
                }
            } catch (err) {
                console.error(`❌ [syncService] Batch Refund Requisition COGS fetch failed for ${cleanSubdomain}:`, err.message);
            }
        }

        for (const record of validReturns) {
            await pool.query(`
                INSERT INTO returns_cache
                (account_id, daftra_return_id, return_no, subscription_id, client_id, branch_id,
                 currency_code, exchange_rate, issue_date, payment_status, gross_subtotal,
                 total_discount, net_revenue, tax_amount, total_amount, summary_paid, summary_unpaid,
                 base_net_revenue, base_total_amount, base_summary_paid, base_summary_unpaid)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
                ON CONFLICT (account_id, daftra_return_id)
                DO UPDATE SET
                    return_no           = EXCLUDED.return_no,
                    subscription_id     = EXCLUDED.subscription_id,
                    client_id           = EXCLUDED.client_id,
                    branch_id           = EXCLUDED.branch_id,
                    currency_code       = EXCLUDED.currency_code,
                    exchange_rate       = EXCLUDED.exchange_rate,
                    issue_date          = EXCLUDED.issue_date,
                    payment_status      = EXCLUDED.payment_status,
                    gross_subtotal      = EXCLUDED.gross_subtotal,
                    total_discount      = EXCLUDED.total_discount,
                    net_revenue         = EXCLUDED.net_revenue,
                    tax_amount          = EXCLUDED.tax_amount,
                    total_amount        = EXCLUDED.total_amount,
                    summary_paid        = EXCLUDED.summary_paid,
                    summary_unpaid      = EXCLUDED.summary_unpaid,
                    base_net_revenue    = EXCLUDED.base_net_revenue,
                    base_total_amount   = EXCLUDED.base_total_amount,
                    base_summary_paid   = EXCLUDED.base_summary_paid,
                    base_summary_unpaid = EXCLUDED.base_summary_unpaid;
            `, [
                accountId, record.daftraReturnId, record.returnNo, record.subscriptionId, record.clientId,
                record.branchId, record.currencyCode, record.exchangeRate, record.issueDate, record.paymentStatus,
                record.grossSubtotal, record.totalDiscountAmount, record.netRevenue, record.taxAmount,
                record.totalAmount, record.summaryPaid, record.summaryUnpaid,
                record.baseNetRevenue, record.baseTotalAmount, record.baseSummaryPaid, record.baseSummaryUnpaid,
            ]);
        }

        for (const inv of rawInvoicesList) {
            if (!inv.id) continue;

            const daftraInvoiceId = inv.id.toString().trim();
            const invoiceNo       = inv.no ? inv.no.toString().trim() : null;
            const clientId        = inv.client_id ? inv.client_id.toString().trim() : null;
            const branchId        = inv.branch_id ? parseInt(inv.branch_id, 10) : null;
            const currencyCode    = inv.currency_code || accountBaseCurrency;
            const issueDate       = inv.date || inv.issue_date || inv.created || new Date();
            const dueDate         = parseDaftraDueDate(inv);
            const requisitionDeliveryStatus = inv.requisition_delivery_status
                ? parseInt(inv.requisition_delivery_status, 10) : null;

            const draftFlag       = inv.draft !== undefined && inv.draft !== null ? parseInt(inv.draft, 10) : 0;

            const totalAmount           = parseFloat(inv.summary_total    || 0);
            const subtotal              = parseFloat(inv.summary_subtotal  || 0);
            const generalDiscount       = parseFloat(inv.summary_discount  || 0);
            const itemDiscountTotal     = parseFloat(inv.item_discount_amount || 0);
            const totalDiscountAmount   = generalDiscount + itemDiscountTotal;
            const summaryPaid           = parseFloat(inv.summary_paid    || 0);
            const summaryUnpaid         = parseFloat(inv.summary_unpaid || 0);
            const grossSubtotal         = subtotal + itemDiscountTotal;
            const netRevenue            = subtotal - generalDiscount;
            const taxAmount             = parseFloat((totalAmount - netRevenue).toFixed(4));

            let exchangeRate = 1.0;
            if (currencyCode.toUpperCase() !== accountBaseCurrency) {
                exchangeRate = foreignJournalMap[daftraInvoiceId] || 1.0;
            }

            const baseNetRevenue    = parseFloat((netRevenue   * exchangeRate).toFixed(4));
            const baseTotalAmount   = parseFloat((totalAmount  * exchangeRate).toFixed(4));
            const baseSummaryPaid   = parseFloat((summaryPaid  * exchangeRate).toFixed(4));
            const baseSummaryUnpaid = parseFloat((summaryUnpaid * exchangeRate).toFixed(4));

            const totalReturnedBase = returnsByOriginalInvoiceMap[daftraInvoiceId] || 0;
            let isReturnFlag = 0;
            if (totalReturnedBase >= baseTotalAmount && baseTotalAmount > 0) {
                isReturnFlag = 1;
            } else if (totalReturnedBase > 0) {
                isReturnFlag = 2;
            }

            const grossCogs = (directCogsMap[daftraInvoiceId] || 0) + (reqCogsMap[daftraInvoiceId] || 0);
            const refundCogs = refundReqCogsMap[daftraInvoiceId] || 0;

            let netCogs = 0;
            if (isReturnFlag === 1) {
                netCogs = 0;
            } else {
                netCogs = Math.max(0, grossCogs - refundCogs);
            }

            await pool.query(`
                INSERT INTO invoices_cache
                (account_id, daftra_invoice_id, invoice_no, client_id, branch_id, currency_code,
                 exchange_rate, total_debit, total_credit, currency_debit, currency_credit,
                 issue_date, due_date, payment_status, requisition_delivery_status,
                 gross_subtotal, total_discount, net_revenue, tax_amount, total_amount,
                 summary_paid, summary_unpaid, base_net_revenue, base_total_amount,
                 base_summary_paid, base_summary_unpaid, total_cogs, is_return, draft)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
                ON CONFLICT (account_id, daftra_invoice_id)
                DO UPDATE SET
                    invoice_no                    = EXCLUDED.invoice_no,
                    client_id                     = EXCLUDED.client_id,
                    branch_id                     = EXCLUDED.branch_id,
                    currency_code                 = EXCLUDED.currency_code,
                    exchange_rate                 = EXCLUDED.exchange_rate,
                    total_debit                   = EXCLUDED.total_debit,
                    total_credit                  = EXCLUDED.total_credit,
                    currency_debit                = EXCLUDED.currency_debit,
                    currency_credit               = EXCLUDED.currency_credit,
                    issue_date                    = EXCLUDED.issue_date,
                    due_date                      = EXCLUDED.due_date,
                    payment_status                = EXCLUDED.payment_status,
                    requisition_delivery_status   = EXCLUDED.requisition_delivery_status,
                    gross_subtotal                = EXCLUDED.gross_subtotal,
                    total_discount                = EXCLUDED.total_discount,
                    net_revenue                   = EXCLUDED.net_revenue,
                    tax_amount                    = EXCLUDED.tax_amount,
                    total_amount                  = EXCLUDED.total_amount,
                    summary_paid                  = EXCLUDED.summary_paid,
                    summary_unpaid                = EXCLUDED.summary_unpaid,
                    base_net_revenue              = EXCLUDED.base_net_revenue,
                    base_total_amount             = EXCLUDED.base_total_amount,
                    base_summary_paid             = EXCLUDED.base_summary_paid,
                    base_summary_unpaid           = EXCLUDED.base_summary_unpaid,
                    total_cogs                    = EXCLUDED.total_cogs,
                    is_return                     = EXCLUDED.is_return,
                    draft                         = EXCLUDED.draft;
            `, [
                accountId, daftraInvoiceId, invoiceNo, clientId, branchId,
                currencyCode, exchangeRate, totalAmount, 0.0, totalAmount, 0.0,
                issueDate, dueDate, parseInt(inv.payment_status || 0, 10), requisitionDeliveryStatus,
                grossSubtotal, totalDiscountAmount, netRevenue, taxAmount, totalAmount,
                summaryPaid, summaryUnpaid, baseNetRevenue, baseTotalAmount,
                baseSummaryPaid, baseSummaryUnpaid, netCogs, isReturnFlag, draftFlag,
            ]);
        }

        if (jobId) {
            await incrementJobProgress(jobId, rawInvoicesList.length + rawRefundsList.length, 'fetching_invoices');
        }
    } catch (err) {
        console.error(`❌ [syncService] Invoices V2 Sync Error for ${cleanSubdomain}:`, err.message);
    }
};

// ─────────────────────────────────────────────
// 4.5 💳 SYNC INVOICE PAYMENTS & CLIENT CREDITS
// ─────────────────────────────────────────────
const syncInvoicePayments = async (accountId, cleanSubdomain, config, branchIds = [], isSingleDay = false, jobId = null) => {
    try {
        if (jobId) await updateJobProgress(jobId, { current_step: 'fetching_payments' });

        const siteQuery = await pool.query('SELECT currency_code FROM linked_accounts WHERE id = $1;', [accountId]);
        const accountBaseCurrency = (siteQuery.rows[0]?.currency_code || 'EGP').toUpperCase();

        const dateFilter = getDateRangeFilter(isSingleDay, 'date');
        const rawPayments = await fetchInvoicePaymentsFromDaftra(cleanSubdomain, config, branchIds, dateFilter);

        const fetchedPaymentIds = [];

        for (const p of rawPayments) {
            if (!p || !p.id) continue;

            const daftraPaymentId = parseInt(p.id, 10);
            fetchedPaymentIds.push(daftraPaymentId);

            const rawInvoiceId    = p.invoice_id ? parseInt(p.invoice_id, 10) : null;
            const rawClientId     = p.client_id ? parseInt(p.client_id, 10) : null;
            const paymentMethod   = p.payment_method || 'cash';
            const rawAmount       = parseFloat(p.amount || 0);
            const currencyCode    = (p.currency_code || accountBaseCurrency).toUpperCase();
            const paymentDate     = p.date || p.created || new Date();
            const treasuryId      = p.treasury_id ? parseInt(p.treasury_id, 10) : null;
            const branchId        = p.branch_id ? parseInt(p.branch_id, 10) : null;
            const notes           = p.notes || p.receipt_notes || null;

            // 🎯 1. تحديد نوع المدفوعة
            let paymentType = 'invoice_payment';
            if (rawInvoiceId !== null) {
                paymentType = rawAmount < 0 ? 'invoice_return' : 'invoice_payment';
            } else if (rawClientId !== null) {
                paymentType = rawAmount >= 0 ? 'client_credit_plus' : 'client_debit_minus';
            }

            // 🎯 2. جلب رقم الفاتورة
            let invoiceNo = null;
            if (rawInvoiceId !== null) {
                const localInvRes = await pool.query(
                    'SELECT invoice_no FROM invoices_cache WHERE account_id = $1 AND daftra_invoice_id = $2 LIMIT 1;',
                    [accountId, rawInvoiceId.toString()]
                );
                if (localInvRes.rows.length > 0) {
                    invoiceNo = localInvRes.rows[0].invoice_no;
                } else {
                    invoiceNo = await fetchSingleInvoiceNoFromDaftra(cleanSubdomain, config, rawInvoiceId);
                }
            }

            // 🎯 3. حساب سعر الصرف والمبلغ الأساسي بناءً على الفاتورة أو المدفوعة
            let exchangeRate = 1.0;
            if (currencyCode !== accountBaseCurrency) {
                if (rawInvoiceId !== null) {
                    const invRateRes = await pool.query(
                        'SELECT exchange_rate FROM invoices_cache WHERE account_id = $1 AND daftra_invoice_id = $2 LIMIT 1;',
                        [accountId, rawInvoiceId.toString()]
                    );
                    if (invRateRes.rows.length > 0 && parseFloat(invRateRes.rows[0].exchange_rate) > 0) {
                        exchangeRate = parseFloat(invRateRes.rows[0].exchange_rate);
                    } else {
                        exchangeRate = await fetchPaymentExchangeRateFromDaftra(cleanSubdomain, config, daftraPaymentId);
                    }
                } else {
                    exchangeRate = await fetchPaymentExchangeRateFromDaftra(cleanSubdomain, config, daftraPaymentId);
                }
            }
            const baseAmount = parseFloat((rawAmount * exchangeRate).toFixed(4));

            // 🎯 4. الحفظ أو التحديث
            await pool.query(`
                INSERT INTO invoice_payments_cache
                (account_id, daftra_payment_id, invoice_id, invoice_no, client_id,
                 payment_method, amount, base_amount, currency_code, exchange_rate,
                 payment_type, payment_date, treasury_id, branch_id, notes)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                ON CONFLICT (account_id, daftra_payment_id)
                DO UPDATE SET
                    invoice_id     = EXCLUDED.invoice_id,
                    invoice_no     = EXCLUDED.invoice_no,
                    client_id      = EXCLUDED.client_id,
                    payment_method = EXCLUDED.payment_method,
                    amount         = EXCLUDED.amount,
                    base_amount    = EXCLUDED.base_amount,
                    currency_code  = EXCLUDED.currency_code,
                    exchange_rate  = EXCLUDED.exchange_rate,
                    payment_type   = EXCLUDED.payment_type,
                    payment_date   = EXCLUDED.payment_date,
                    treasury_id    = EXCLUDED.treasury_id,
                    branch_id      = EXCLUDED.branch_id,
                    notes          = EXCLUDED.notes;
            `, [
                accountId, daftraPaymentId, rawInvoiceId, invoiceNo, rawClientId,
                paymentMethod, rawAmount, baseAmount, currencyCode, exchangeRate,
                paymentType, paymentDate, treasuryId, branchId, notes
            ]);
        }

        // 🎯 5. تنظيف أي مدفوعة اتحذفت من دفترة خلال الـ 30 يوماً
        if (!isSingleDay && fetchedPaymentIds.length > 0) {
            await pool.query(`
                DELETE FROM invoice_payments_cache
                WHERE account_id = $1
                  AND payment_date >= CURRENT_DATE - INTERVAL '30 days'
                  AND daftra_payment_id NOT IN (${fetchedPaymentIds.join(',')});
            `, [accountId]);
        } else if (!isSingleDay && fetchedPaymentIds.length === 0) {
            await pool.query(`
                DELETE FROM invoice_payments_cache
                WHERE account_id = $1
                  AND payment_date >= CURRENT_DATE - INTERVAL '30 days';
            `, [accountId]);
        }

        if (jobId) {
            await incrementJobProgress(jobId, rawPayments.length, 'fetching_payments');
        }
    } catch (err) {
        console.error(`❌ [syncService] Invoice Payments Sync Error for ${cleanSubdomain}:`, err.message);
    }
};

// ─────────────────────────────────────────────
// 5. SYNC CLIENTS
// ─────────────────────────────────────────────
const syncClients = async (accountId, cleanSubdomain, config, branchIds, jobId = null) => {
    try {
        if (jobId) await updateJobProgress(jobId, { current_step: 'fetching_clients' });

        const rawList = await fetchClientsFromDaftra(cleanSubdomain, config, branchIds);

        for (const clientData of rawList) {
            if (!clientData.id) continue;

            const daftraClientId  = clientData.id.toString().trim();
            const daftraCreatedAt = clientData.created || new Date();
            const branchId        = clientData.branch_id ? parseInt(clientData.branch_id, 10) : null;

            let resolvedName = clientData.business_name ? clientData.business_name.trim() : '';
            if (!resolvedName) resolvedName = `${clientData.first_name || ''} ${clientData.last_name || ''}`.trim();
            if (!resolvedName) resolvedName = `Client #${daftraClientId}`;

            const email           = clientData.email    || null;
            const phone           = clientData.phone1   || clientData.phone2 || null;
            const currency        = clientData.default_currency_code || 'EGP';
            const startingBalance = parseFloat(clientData.starting_balance || clientData.balance || clientData.current_balance || 0);

            await pool.query(`
                INSERT INTO clients_cache
                (account_id, branch_id, daftra_client_id, client_name, client_email,
                 client_phone, currency, current_balance, daftra_created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (account_id, daftra_client_id)
                DO UPDATE SET
                    branch_id       = EXCLUDED.branch_id,
                    client_name     = EXCLUDED.client_name,
                    client_email    = EXCLUDED.client_email,
                    client_phone    = EXCLUDED.client_phone,
                    currency        = EXCLUDED.currency,
                    current_balance = EXCLUDED.current_balance,
                    daftra_created_at = EXCLUDED.daftra_created_at;
            `, [accountId, branchId, daftraClientId, resolvedName, email, phone, currency, startingBalance, daftraCreatedAt]);
        }

        if (jobId) {
            await incrementJobProgress(jobId, rawList.length, 'fetching_clients');
        }
    } catch (err) {
        console.error(`❌ [syncService] Clients Sync Error for ${cleanSubdomain}:`, err.message);
    }
};

// ─────────────────────────────────────────────
// 6. SYNC PRODUCTS
// ─────────────────────────────────────────────
const syncProducts = async (accountId, cleanSubdomain, config, branchIds, jobId = null) => {
    try {
        if (jobId) await updateJobProgress(jobId, { current_step: 'fetching_products' });

        const rawProducts = await fetchProductsFromDaftra(cleanSubdomain, config, branchIds);

        for (const prod of rawProducts) {
            if (!prod.id) continue;

            const daftraProductId = prod.id.toString().trim();
            const branchId        = prod.branch_id ? parseInt(prod.branch_id, 10) : (prod.branch?.id ? parseInt(prod.branch.id, 10) : 1);
            const name            = prod.name ? prod.name.trim() : `Product #${daftraProductId}`;
            const productCode     = prod.product_code || null;
            const barcode         = prod.barcode      || null;
            const unitPrice       = parseFloat(prod.unit_price    || 0);
            const stockBalance    = parseFloat(prod.stock_balance  || 0);

            await pool.query(`
                INSERT INTO products_cache
                (account_id, daftra_product_id, branch_id, name, product_code, barcode, unit_price, stock_balance, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
                ON CONFLICT (account_id, daftra_product_id)
                DO UPDATE SET
                    branch_id     = EXCLUDED.branch_id,
                    name          = EXCLUDED.name,
                    product_code  = EXCLUDED.product_code,
                    barcode       = EXCLUDED.barcode,
                    unit_price    = EXCLUDED.unit_price,
                    stock_balance = EXCLUDED.stock_balance,
                    updated_at    = CURRENT_TIMESTAMP;
            `, [accountId, daftraProductId, branchId, name, productCode, barcode, unitPrice, stockBalance]);
        }

        if (jobId) {
            await incrementJobProgress(jobId, rawProducts.length, 'fetching_products');
        }
    } catch (err) {
        console.error(`❌ [syncService] Products Sync Error for ${cleanSubdomain}:`, err.message);
    }
};

// ─────────────────────────────────────────────
// 7. SYNC PRODUCT DAILY SALES
// ─────────────────────────────────────────────
const syncProductDailySales = async (accountId, cleanSubdomain, config, branchIds = [], specificDate = null, jobId = null) => {
    try {
        if (jobId) await updateJobProgress(jobId, { current_step: 'processing_product_sales' });

        const ratesResult = await pool.query(`
            SELECT daftra_invoice_id AS id, exchange_rate FROM invoices_cache WHERE account_id = $1
            UNION ALL
            SELECT daftra_return_id  AS id, exchange_rate FROM returns_cache  WHERE account_id = $1;
        `, [accountId]);

        const exchangeMap = {};
        ratesResult.rows.forEach(r => {
            if (r.id) exchangeMap[r.id.toString().trim()] = parseFloat(r.exchange_rate || 1.0);
        });

        const rawItems    = await fetchInvoiceItemsFromDaftra(cleanSubdomain, config, specificDate);
        const orderIdsSet = new Set();
        const itemUnitNetMap = {};

        for (const item of rawItems) {
            if (!item.product_id || !item.invoice || item.invoice.deleted_at) continue;

            const invoiceId  = item.invoice_id ? item.invoice_id.toString().trim() : (item.invoice.id ? item.invoice.id.toString().trim() : null);
            const productId  = item.product_id.toString().trim();
            const itemType   = parseInt(item.invoice.type || 0, 10);
            const reqStatus  = (item.invoice.requisition_delivery_status !== null && item.invoice.requisition_delivery_status !== undefined && item.invoice.requisition_delivery_status !== '')
                ? parseInt(item.invoice.requisition_delivery_status, 10) : null;

            if (invoiceId && itemType !== 6 && (reqStatus === 4 || reqStatus === 5)) {
                orderIdsSet.add(invoiceId);
            }

            const qty               = parseFloat(item.quantity || 1.0);
            const subtotal          = parseFloat(item.subtotal || 0);
            const tax1              = parseFloat(item.summary_tax1 || 0);
            const tax2              = parseFloat(item.summary_tax2 || 0);
            const lineNetOriginal = subtotal - tax1 - tax2;
            const rate              = (invoiceId && exchangeMap[invoiceId]) ? exchangeMap[invoiceId] : 1.0;
            const lineNetBase       = lineNetOriginal * rate;
            const unitNetBase       = qty > 0 ? (lineNetBase / qty) : 0;

            itemUnitNetMap[`${invoiceId}___${productId}`] = unitNetBase;
        }

        const orderIdsArray = Array.from(orderIdsSet);
        let requisitionsList = [];
        if (orderIdsArray.length > 0) {
            requisitionsList = await fetchRequisitionsFromDaftra(cleanSubdomain, config, branchIds, orderIdsArray);
        }

        const requisitionDetailsMap = {};
        const reqBatchSize = 10;
        for (let i = 0; i < requisitionsList.length; i += reqBatchSize) {
            const batch = requisitionsList.slice(i, i + reqBatchSize);
            await Promise.all(batch.map(async (req) => {
                if (req && req.id) {
                    const details = await fetchRequisitionSingleDetails(cleanSubdomain, config, req.id);
                    if (details) {
                        const reqObj = details.data || details;
                        requisitionDetailsMap[req.id.toString().trim()] = reqObj;
                    }
                }
            }));
        }

        const reqDeliveredQtyMap = {};
        const reqRejectedQtyMap  = {};

        Object.values(requisitionDetailsMap).forEach(reqObj => {
            const status    = parseInt(reqObj.status || 0, 10);
            const invoiceId = reqObj.order_id ? reqObj.order_id.toString().trim() : null;
            if (!invoiceId) return;

            const itemsList = reqObj.items || reqObj.RequisitionItem || [];
            if (Array.isArray(itemsList)) {
                itemsList.forEach(reqItem => {
                    if (!reqItem.product_id) return;
                    const productId = reqItem.product_id.toString().trim();
                    const qty       = parseFloat(reqItem.quantity || 0);
                    const mapKey    = `${invoiceId}___${productId}`;

                    if (status === 3)      reqDeliveredQtyMap[mapKey] = (reqDeliveredQtyMap[mapKey] || 0) + qty;
                    else if (status === 4) reqRejectedQtyMap[mapKey]  = (reqRejectedQtyMap[mapKey]  || 0) + qty;
                });
            }
        });

        const aggregation = {};

        const getAgg = (productId, branchId, saleDate) => {
            const key = `${productId}___${branchId}___${saleDate}`;
            if (!aggregation[key]) {
                aggregation[key] = { productId, branchId, saleDate, soldQty: 0, deliveredQty: 0, pendingQty: 0, returnedQty: 0, netSalesAmount: 0 };
            }
            return aggregation[key];
        };

        for (const item of rawItems) {
            if (!item.product_id || !item.invoice || item.invoice.deleted_at) continue;

            const productId  = item.product_id.toString().trim();
            const invoiceId  = item.invoice_id ? item.invoice_id.toString().trim() : (item.invoice.id ? item.invoice.id.toString().trim() : null);
            const itemType   = parseInt(item.invoice.type || 0, 10);
            const branchId   = item.invoice.branch_id ? parseInt(item.invoice.branch_id, 10) : 1;
            const rawDate    = item.invoice.issue_date || item.invoice.date || item.created;
            if (!rawDate) continue;

            const saleDate       = new Date(rawDate).toISOString().split('T')[0];
            const qty            = parseFloat(item.quantity || 0);
            const unitNetBase    = itemUnitNetMap[`${invoiceId}___${productId}`] || 0;
            const agg            = getAgg(productId, branchId, saleDate);

            if (itemType === 6) {
                agg.returnedQty   += qty;
                agg.netSalesAmount -= (qty * unitNetBase);
            } else {
                agg.soldQty += qty;
                const reqStatus = (item.invoice.requisition_delivery_status !== null && item.invoice.requisition_delivery_status !== undefined && item.invoice.requisition_delivery_status !== '')
                    ? parseInt(item.invoice.requisition_delivery_status, 10) : null;
                const mapKey = `${invoiceId}___${productId}`;

                if (reqStatus === 1 || reqStatus === 0 || reqStatus === null) {
                    agg.deliveredQty   += qty;
                    agg.netSalesAmount += (qty * unitNetBase);
                } else if (reqStatus === 2) {
                    // Rejected
                } else if (reqStatus === 3) {
                    agg.pendingQty += qty;
                } else if (reqStatus === 4 || reqStatus === 5) {
                    const reqDelivered = reqDeliveredQtyMap[mapKey] || 0;
                    const reqRejected  = reqRejectedQtyMap[mapKey]  || 0;
                    const delivered    = Math.min(qty, reqDelivered);
                    const pending      = Math.max(0, qty - delivered - reqRejected);
                    agg.deliveredQty   += delivered;
                    agg.pendingQty     += pending;
                    agg.netSalesAmount += (delivered * unitNetBase);
                } else {
                    agg.deliveredQty   += qty;
                    agg.netSalesAmount += (qty * unitNetBase);
                }
            }
        }

        for (const key of Object.keys(aggregation)) {
            const rec    = aggregation[key];
            const netQty = rec.deliveredQty - rec.returnedQty;

            await pool.query(`
                INSERT INTO daily_product_sales_cache
                (account_id, daftra_product_id, branch_id, sale_date, sold_quantity,
                 delivered_quantity, pending_quantity, returned_quantity, net_quantity,
                 net_sales_amount, updated_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP)
                ON CONFLICT (account_id, daftra_product_id, branch_id, sale_date)
                DO UPDATE SET
                    sold_quantity      = EXCLUDED.sold_quantity,
                    delivered_quantity = EXCLUDED.delivered_quantity,
                    pending_quantity   = EXCLUDED.pending_quantity,
                    returned_quantity  = EXCLUDED.returned_quantity,
                    net_quantity       = EXCLUDED.net_quantity,
                    net_sales_amount   = EXCLUDED.net_sales_amount,
                    updated_at         = CURRENT_TIMESTAMP;
            `, [
                accountId, rec.productId, rec.branchId, rec.saleDate,
                rec.soldQty, rec.deliveredQty, rec.pendingQty, rec.returnedQty, netQty, rec.netSalesAmount,
            ]);
        }
    } catch (err) {
        console.error(`❌ [syncService] Product Daily Sales Sync Error for ${cleanSubdomain}:`, err.message);
    }
};

// ─────────────────────────────────────────────
// 🚀 SINGLE ACCOUNT ORCHESTRATOR
// ─────────────────────────────────────────────
const executeFullAccountSync = async (userId, accountId, cleanSubdomain, config, jobId = null, forceFull30Days = true) => {
    try {
        if (jobId) await updateJobProgress(jobId, { status: 'processing', progress_percentage: 0, current_step: 'calculating_totals' });

        const isSingleDay = forceFull30Days ? false : (await pool.query('SELECT 1 FROM invoices_cache WHERE account_id = $1 LIMIT 1;', [accountId])).rows.length > 0;

        const branchIds          = await syncBranches(accountId, cleanSubdomain, config);
        const treasuryAccountIds = await syncTreasuries(accountId, cleanSubdomain, config);

        if (jobId) {
            let globalBaseline = 0;
            try {
                globalBaseline = await fetchExactEntityTotals(cleanSubdomain, config, branchIds, treasuryAccountIds);
            } catch (err) {
                console.error("⚠️ Baseline calculation failed, using fallback:", err.message);
            }
            await updateJobProgress(jobId, { total_records: globalBaseline, processed_records: 0, progress_percentage: 0, current_step: 'fetching_transactions' });
        }

        // 1. Chart of Accounts
        await syncChartOfAccounts(accountId, cleanSubdomain, config, isSingleDay, jobId, branchIds);

        // 2. Treasuries & Cash Transactions
        await syncTreasuryTransactions(accountId, cleanSubdomain, config, treasuryAccountIds, isSingleDay, jobId);
        await syncDailyTreasuryTotals(accountId);

        // 3. Invoices & Refunds
        await syncInvoicesV2(accountId, cleanSubdomain, config, branchIds, isSingleDay, jobId);

        // 4. Payments
        await syncInvoicePayments(accountId, cleanSubdomain, config, branchIds, isSingleDay, jobId);

        // 5. Clients
        await syncClients(accountId, cleanSubdomain, config, branchIds, jobId);

        // 6. Products & Sales
        await syncProducts(accountId, cleanSubdomain, config, branchIds, jobId);
        await syncProductDailySales(accountId, cleanSubdomain, config, branchIds, null, jobId);

        // 7. 🧹 Rolling 30-Day Cleanup
        await cleanOldCacheData(accountId);

        if (jobId) await updateJobProgress(jobId, { current_step: 'final_rollup' });
        await recalculateGlobalUserRollup(userId);

        if (jobId) {
            await pool.query("UPDATE sync_jobs SET status = 'completed', processed_records = total_records, progress_percentage = 100, updated_at = CURRENT_TIMESTAMP WHERE id = $1;", [jobId]);
            console.log(`✅ [syncService] Sync Job #${jobId} completed for Account #${accountId}.`);
        } else {
            console.log(`✅ [syncService] Silent sync completed for Account #${accountId}.`);
        }
    } catch (err) {
        console.error(`❌ [syncService] Account Sync Error for Account #${accountId}:`, err.message);
        if (jobId) await updateJobProgress(jobId, { status: 'failed', error_message: err.message });
    }
};

// ─────────────────────────────────────────────
// 🌐 GLOBAL BULK USER ORCHESTRATOR
// ─────────────────────────────────────────────
const executeBulkUserSync = async (userId, jobId = null, forceFull30Days = true) => {
    try {
        if (jobId) await updateJobProgress(jobId, { status: 'processing', progress_percentage: 0, current_step: 'calculating_totals' });

        const accountsResult = await pool.query('SELECT id, daftra_subdomain, encrypted_access_token FROM linked_accounts WHERE user_id = $1;', [userId]);

        if (accountsResult.rows.length === 0) {
            if (jobId) await pool.query("UPDATE sync_jobs SET status = 'completed', progress_percentage = 100, updated_at = CURRENT_TIMESTAMP WHERE id = $1;", [jobId]);
            return;
        }

        const preparedAccounts = [];
        for (const account of accountsResult.rows) {
            const { id: accountId, daftra_subdomain: subdomain, encrypted_access_token: token } = account;
            const cleanSubdomain     = subdomain.replace('https://', '').replace('http://', '').split('.')[0];
            const config             = { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } };

            const isSingleDay = forceFull30Days ? false : (await pool.query('SELECT 1 FROM invoices_cache WHERE account_id = $1 LIMIT 1;', [accountId])).rows.length > 0;

            const branchIds          = await syncBranches(accountId, cleanSubdomain, config);
            const treasuryAccountIds = await syncTreasuries(accountId, cleanSubdomain, config);
            preparedAccounts.push({ accountId, cleanSubdomain, config, branchIds, treasuryAccountIds, isSingleDay });
        }

        if (jobId) {
            let aggregateBaseline = 0;
            for (const item of preparedAccounts) {
                try {
                    const accountBaseline = await fetchExactEntityTotals(item.cleanSubdomain, item.config, item.branchIds, item.treasuryAccountIds);
                    aggregateBaseline += accountBaseline;
                } catch (e) {
                    aggregateBaseline += 0;
                }
            }
            await updateJobProgress(jobId, { total_records: aggregateBaseline, processed_records: 0, progress_percentage: 0, current_step: 'fetching_transactions' });
        }

        for (const item of preparedAccounts) {
            await syncChartOfAccounts(item.accountId, item.cleanSubdomain, item.config, item.isSingleDay, jobId, item.branchIds);
            await syncTreasuryTransactions(item.accountId, item.cleanSubdomain, item.config, item.treasuryAccountIds, item.isSingleDay, jobId);
            await syncDailyTreasuryTotals(item.accountId);
            await syncInvoicesV2(item.accountId, item.cleanSubdomain, item.config, item.branchIds, item.isSingleDay, jobId);
            await syncInvoicePayments(item.accountId, item.cleanSubdomain, item.config, item.branchIds, item.isSingleDay, jobId);
            await syncClients(item.accountId, item.cleanSubdomain, item.config, item.branchIds, jobId);
            await syncProducts(item.accountId, item.cleanSubdomain, item.config, item.branchIds, jobId);
            await syncProductDailySales(item.accountId, item.cleanSubdomain, item.config, item.branchIds, null, jobId);

            await cleanOldCacheData(item.accountId);
        }

        if (jobId) await updateJobProgress(jobId, { current_step: 'final_rollup' });
        await recalculateGlobalUserRollup(userId);

        if (jobId) {
            await pool.query("UPDATE sync_jobs SET status = 'completed', processed_records = total_records, progress_percentage = 100, updated_at = CURRENT_TIMESTAMP WHERE id = $1;", [jobId]);
            console.log(`✅ [syncService] Bulk Sync Job #${jobId} completed for User #${userId}.`);
        } else {
            console.log(`✅ [syncService] Silent bulk sync completed for User #${userId}.`);
        }
    } catch (err) {
        console.error(`❌ [syncService] Bulk User Sync Error for User #${userId}:`, err.message);
        if (jobId) await updateJobProgress(jobId, { status: 'failed', error_message: err.message });
    }
};

module.exports = {
    updateJobProgress,
    calculateGlobalHeadlessCount: fetchExactEntityTotals,
    recalculateGlobalUserRollup,
    syncPendingRequisitionsForAccount,
    syncBranches,
    syncTreasuries,
    syncTreasuryTransactions,
    syncDailyTreasuryTotals,
    syncChartOfAccounts,
    syncInvoicesV2,
    syncInvoicePayments,
    syncClients,
    syncProducts,
    syncProductDailySales,
    executeFullAccountSync,
    executeBulkUserSync,
    cleanOldCacheData
};