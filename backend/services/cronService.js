const cron = require('node-cron');
const pool = require('../config/db');
const { executeBulkUserSync } = require('./syncService');

/**
 * ⏰ NIGHTLY SYNC CRON JOB
 * Runs at 12:00 AM (Midnight) according to the server's local environment time.
 * Calls executeBulkUserSync directly — no self-HTTP round-trip needed.
 */
const initNightlySyncCron = () => {
    // '0 0 * * *' = Runs every day at 12:00 AM (00:00) System Local Time
    cron.schedule('0 0 * * *', async () => {
        console.log('⏰ [CronService] Automated System-Wide Nightly Sync Initiated...');

        try {
            const usersResult = await pool.query('SELECT id FROM users;');

            for (const userRow of usersResult.rows) {
                const userId = userRow.id;
                console.log(`   ⏳ [CronService] Dispatching silent bulk sync for User ID: [${userId}]`);

                try {
                    // Run silently with no jobId — progress tracking not needed for automated runs
                    await executeBulkUserSync(userId, null);
                    console.log(`   ✅ [CronService] Silent sync completed for User: [${userId}]`);
                } catch (innerError) {
                    console.error(`   ❌ [CronService] Sync failed for User [${userId}]:`, innerError.message);
                }
            }

            console.log('🏁 [CronService] Daily system-wide sync dispatch completed.');
        } catch (globalCronError) {
            console.error('❌ [CronService] Critical failure during nightly cron execution:', globalCronError.message);
        }
    });
};

module.exports = { initNightlySyncCron };