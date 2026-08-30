const cron = require('node-cron');
const pool = require('../config/db');
const { checkDaftraAppActive } = require('./daftraService');
const {
    syncBranches,
    syncInvoicesV2,
    syncClients,
    syncTreasuries,
    syncTreasuryTransactions,
    syncDailyTreasuryTotals,
    syncChartOfAccounts,
    syncProducts,
    syncProductDailySales,
    cleanOldCacheData,
    syncPendingRequisitionsForAccount // 🎯 تم استدعاء الدالة المختصة
} = require('./syncService');

/**
 * 🔄 ROUND-ROBIN DISTRIBUTED SCHEDULER
 * Runs every 10 minutes, checking app active state and triggering domain syncs.
 */
const initDistributedSweeperCron = () => {
    cron.schedule('*/10 * * * *', async () => {
        const currentMinute = new Date().getMinutes();
        console.log(`⏰ [SweeperCron] Round-Robin cycle started at minute :${currentMinute}`);

        try {
            // جلب الحسابات بغض النظر عن الحالة لفحص التفعيل
            const accountsResult = await pool.query('SELECT id, daftra_subdomain, encrypted_access_token, sync_status FROM linked_accounts;');
            if (accountsResult.rows.length === 0) return;

            for (const account of accountsResult.rows) {
                const { id: accountId, daftra_subdomain: subdomain, encrypted_access_token: token, sync_status: currentSyncStatus } = account;
                const cleanSubdomain = subdomain.replace('https://', '').replace('http://', '').split('.')[0];
                const config = { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } };

                // 🎯 1. فحص هل التطبيق ما زال مفعل في دفترة
                const isAppActive = await checkDaftraAppActive(cleanSubdomain, config);

                if (!isAppActive) {
                    if (currentSyncStatus !== 'app_deactivated') {
                        console.log(`⚠️ App #641 is DEACTIVATED for Account #${accountId}. Updating sync_status = 'app_deactivated'`);
                        await pool.query("UPDATE linked_accounts SET sync_status = 'app_deactivated' WHERE id = $1;", [accountId]);
                    }
                    // تخطي المزامنة الكثيفة للحسابات التي توقف تفعيل تطبيقها
                    continue;
                } else {
                    // إذا أعاد العميل تفعيل التطبيق، ارجع حالته إلى connected
                    if (currentSyncStatus === 'app_deactivated') {
                        console.log(`✅ App #641 was RE-ACTIVATED for Account #${accountId}. Updating sync_status = 'connected'`);
                        await pool.query("UPDATE linked_accounts SET sync_status = 'connected' WHERE id = $1;", [accountId]);
                    }
                }

                // 2. استكمال المزامنة الدوريّة للحسابات المفعلة
                const existingCheck = await pool.query('SELECT 1 FROM invoices_cache WHERE account_id = $1 LIMIT 1;', [accountId]);
                const isSingleDay = existingCheck.rows.length > 0;

                const branchIds = await syncBranches(accountId, cleanSubdomain, config);

                if (currentMinute >= 0 && currentMinute < 10) {
                    console.log(` 📦 [Module 1: Invoices & Returns] Syncing Account #${accountId}`);
                    await syncInvoicesV2(accountId, cleanSubdomain, config, branchIds, isSingleDay, null);
                    await cleanOldCacheData(accountId);
                } 
                else if (currentMinute >= 10 && currentMinute < 20) {
                    console.log(` 🚚 [Module 2: COGS & Requisitions] Refreshing Delivery Status for Account #${accountId}`);
                    await syncPendingRequisitionsForAccount(accountId); // 🎯 استدعاء الدالة المختصة
                } 
                else if (currentMinute >= 20 && currentMinute < 30) {
                    console.log(` 👥 [Module 3: Clients] Syncing Clients for Account #${accountId}`);
                    await syncClients(accountId, cleanSubdomain, config, branchIds, null);
                } 
                else if (currentMinute >= 30 && currentMinute < 40) {
                    console.log(` 🏦 [Module 4: Treasuries] Syncing Cashflow for Account #${accountId}`);
                    const treasuryAccountIds = await syncTreasuries(accountId, cleanSubdomain, config);
                    await syncTreasuryTransactions(accountId, cleanSubdomain, config, treasuryAccountIds, isSingleDay, null);
                    await syncDailyTreasuryTotals(accountId);
                } 
                else if (currentMinute >= 40 && currentMinute < 50) {
                    console.log(` 🛒 [Module 5: Products] Syncing Inventory for Account #${accountId}`);
                    await syncProducts(accountId, cleanSubdomain, config, branchIds, null);
                    await syncProductDailySales(accountId, cleanSubdomain, config, branchIds, null, null);
                } 
                else if (currentMinute >= 50) {
                    console.log(` 📊 [Module 6: Chart of Accounts] Refreshing P&L Categories for Account #${accountId}`);
                    await syncChartOfAccounts(accountId, cleanSubdomain, config, isSingleDay, null, branchIds);
                }
            }
            console.log(`✅ [SweeperCron] Round-Robin cycle for minute :${currentMinute} completed successfully.`);
        } catch (err) {
            console.error('❌ [SweeperCron] Error during round-robin sync execution:', err.message);
        }
    });
};

module.exports = { initDistributedSweeperCron };