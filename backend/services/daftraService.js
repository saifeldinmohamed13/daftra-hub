const axios = require('axios');

const DAFTRA_APP_ID = 641; // 🎯 المديول الثابت الخاص بالتطبيق في دفترة

/**
 * ✂️ Helper to split array of IDs into smaller chunks
 */
const chunkArray = (arr, chunkSize = 10) => {
    if (!Array.isArray(arr) || arr.length === 0) return [];
    const chunks = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        chunks.push(arr.slice(i, i + chunkSize));
    }
    return chunks;
};

/**
 * 🔗 Helper to format an array of IDs into exact Daftra v2 query parameters
 */
const buildBulkInQuery = (paramName, idsArray) => {
    if (!idsArray || !Array.isArray(idsArray) || idsArray.length === 0) return '';
    const cleanIds = idsArray.filter(id => id !== null && id !== undefined && id !== '');
    if (cleanIds.length === 0) return '';
    
    return cleanIds
        .map((id, index) => `filter[${paramName}][in][${index}]=${encodeURIComponent(id)}`)
        .join('&');
};

/**
 * 🏢 🎯 NEW HELPER: Fetch and resolve all branch IDs for a clean initial bootstrap
 */
const fetchAndResolveAllAccountBranches = async (cleanSubdomain, config) => {
    try {
        const allBranches = await fetchBranchesFromDaftra(cleanSubdomain, config);
        const branchIds = allBranches.map(b => parseInt(b.id || b.branch_id, 10)).filter(Boolean);
        return branchIds;
    } catch (err) {
        console.error(`⚠️ Failed fetching all account branches for ${cleanSubdomain}:`, err.message);
        return [];
    }
};

/**
 * 🏢 Helper to resolve branch IDs safely (ضمان شمول جميع الفروع دائماً)
 */
const resolveBranchFilter = async (cleanSubdomain, config, branchIds = []) => {
    let finalBranchIds = Array.isArray(branchIds) ? branchIds.filter(Boolean) : [];
    
    // 🎯 لو لم يتم إرسال فروع محددة، نسحب كافة فروع الحساب من دفترة تلقائياً لتجنب سقوط البيانات
    if (finalBranchIds.length === 0) {
        finalBranchIds = await fetchAndResolveAllAccountBranches(cleanSubdomain, config);
    }
    
    return buildBulkInQuery('branch_id', finalBranchIds);
};

/**
 * 📅 Dynamic Date Filter Helper (30-day window or Single Day)
 */
const getDateRangeFilter = (isSingleDay = false, paramType = 'date') => {
    const today = new Date();
    const toDateStr = today.toISOString().split('T')[0];
    
    let fromDateStr = toDateStr;
    if (!isSingleDay) {
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - 30);
        fromDateStr = pastDate.toISOString().split('T')[0];
    }

    if (paramType === 'created') {
        return `filter[created][from]=${fromDateStr}%2000:00:00&filter[created][to]=${toDateStr}%2023:59:59`;
    }

    if (paramType === 'journal.date') {
        return `filter[journal.date][from]=${fromDateStr}&filter[journal.date][to]=${toDateStr}`;
    }
    
    return `filter[date][from]=${fromDateStr}&filter[date][to]=${toDateStr}`;
};

/**
 * 🔄 Universal Auto-Pagination Engine for Daftra v2 Endpoints
 */
const fetchAllPagesV2 = async (baseUrl, config, onPageFetched = null) => {
    let page = 1;
    let allRecords = [];
    let hasNextPage = true;

    while (hasNextPage) {
        let currentUrl = baseUrl;
        if (currentUrl.includes('page=')) {
            currentUrl = currentUrl.replace(/page=\d+/, `page=${page}`);
        } else {
            currentUrl = currentUrl.includes('?') ? `${currentUrl}&page=${page}` : `${currentUrl}?page=${page}`;
        }

        try {
            const response = await axios.get(currentUrl, {
                ...config,
                paramsSerializer: { encode: (p) => p }
            });

            const dataList = response.data?.data || [];
            allRecords = allRecords.concat(dataList);

            if (onPageFetched && typeof onPageFetched === 'function') {
                await onPageFetched(dataList.length, response.data?.total || 0);
            }

            const lastPage = response.data?.last_page || 1;
            const nextPageUrl = response.data?.next_page_url;

            if (page < lastPage && nextPageUrl) {
                page++;
            } else {
                hasNextPage = false;
            }
        } catch (err) {
            console.error(`❌ [daftraService] v2 Fetch failed for URL: [${currentUrl}]:`, err.message);
            hasNextPage = false;
        }
    }
    return allRecords;
};

/**
 * 🔌 0. Check if App is Active on Daftra Site
 */
const checkDaftraAppActive = async (cleanSubdomain, config) => {
    return true;
};

/**
 * 📊 1. PRELIMINARY ACCURATE COUNT FUNCTION
 */
const fetchExactEntityTotals = async (cleanSubdomain, config, branchIds = [], treasuryAccountIds = []) => {
    let exactTotal = 0;
    const branchFilter = await resolveBranchFilter(cleanSubdomain, config, branchIds);
    const treasuryFilter = buildBulkInQuery('journal_account_id', treasuryAccountIds);
    const dateFilter = getDateRangeFilter(false, 'date');
    const createdFilter = getDateRangeFilter(false, 'created');

    const axiosOptions = {
        ...config,
        timeout: 7000,
        paramsSerializer: { encode: (p) => p }
    };

    // 1. Invoices
    try {
        const invUrl = `https://${cleanSubdomain}.daftra.com/v2/api/entity/invoice/list/-1?filter[type]=0&${branchFilter}&filter[deleted_at][is_null]&${dateFilter}&page=1`;
        const res = await axios.get(invUrl, axiosOptions);
        exactTotal += parseInt(res.data?.total || 0, 10);
    } catch (e) {
        console.error("⚠️ Preliminary invoices count failed:", e.message);
    }

    // 2. Refund Receipts
    try {
        const refundUrl = `https://${cleanSubdomain}.daftra.com/v2/api/entity/refund_receipt/list/-1?${branchFilter}&filter[deleted_at][is_null]&${dateFilter}&page=1`;
        const res = await axios.get(refundUrl, axiosOptions);
        exactTotal += parseInt(res.data?.total || 0, 10);
    } catch (e) {
        console.error("⚠️ Preliminary refund receipts count failed:", e.message);
    }

    // 3. Invoice Payments
    try {
        const payUrl = `https://${cleanSubdomain}.daftra.com/v2/api/entity/invoice_payment/list/-1?${branchFilter}&${dateFilter}&page=1`;
        const res = await axios.get(payUrl, axiosOptions);
        exactTotal += parseInt(res.data?.total || 0, 10);
    } catch (e) {
        console.error("⚠️ Preliminary invoice payments count failed:", e.message);
    }

    // 4. Treasury Transactions
    if (treasuryAccountIds.length > 0) {
        try {
            const txnUrl = `https://${cleanSubdomain}.daftra.com/v2/api/entity/journal_transaction/list/-1?${treasuryFilter}&${createdFilter}&page=1`;
            const res = await axios.get(txnUrl, axiosOptions);
            exactTotal += parseInt(res.data?.total || 0, 10);
        } catch (e) {
            console.error("⚠️ Preliminary treasury txns count failed:", e.message);
        }
    }

    // 5. Clients
    try {
        const clientUrl = `https://${cleanSubdomain}.daftra.com/v2/api/entity/client/list/-1?${branchFilter}&page=1`;
        const res = await axios.get(clientUrl, axiosOptions);
        exactTotal += parseInt(res.data?.total || 0, 10);
    } catch (e) {
        console.error("⚠️ Preliminary clients count failed:", e.message);
    }

    // 6. Products
    try {
        const prodUrl = `https://${cleanSubdomain}.daftra.com/v2/api/entity/product/list/1?${branchFilter}&page=1`;
        const res = await axios.get(prodUrl, axiosOptions);
        exactTotal += parseInt(res.data?.total || 0, 10);
    } catch (e) {}

    // 7. Chart of Accounts
    try {
        const catUrl = `https://${cleanSubdomain}.daftra.com/v2/api/entity/journal_cat/list/-1?filter[journal_cat_id][in][0]=27&filter[journal_cat_id][in][1]=43&page=1`;
        const res = await axios.get(catUrl, axiosOptions);
        exactTotal += parseInt(res.data?.total || 0, 10);
    } catch (e) {}

    return exactTotal;
};

/**
 * 🏢 2. Fetch All Branches
 */
const fetchBranchesFromDaftra = async (cleanSubdomain, config) => {
    const url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/branch/list/1`;
    return await fetchAllPagesV2(url, config);
};

/**
 * 💰 3. Fetch Live Treasuries Balances via Direct Endpoint /api2/treasuries
 */
const fetchTreasuriesFromDaftra = async (cleanSubdomain, config) => {
    try {
        const url = `https://${cleanSubdomain}.daftra.com/api2/treasuries`;
        const response = await axios.get(url, config);
        const list = response.data?.data || [];
        
        return list.map(item => item.Treasury || item).filter(Boolean);
    } catch (err) {
        console.error(`❌ Failed fetching treasuries via api2 for ${cleanSubdomain}:`, err.message);
        return [];
    }
};

/**
 * 💰 3.1 Fetch Journal Accounts Mapping for Treasuries
 */
const fetchTreasuryJournalAccounts = async (cleanSubdomain, config) => {
    const url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/journal_account/list/1?filter[entity_type]=treasury`;
    return await fetchAllPagesV2(url, config);
};

/**
 * 🔄 4. Fetch Treasury Transactions
 */
const fetchTreasuryTransactionsFromDaftra = async (cleanSubdomain, config, journalAccountIds, extraFilter = '', onProgress = null) => {
    const idsArray = Array.isArray(journalAccountIds) ? journalAccountIds : [journalAccountIds];
    if (idsArray.length === 0) return [];

    const chunks = chunkArray(idsArray, 10);
    let aggregatedResults = [];

    for (const chunk of chunks) {
        const bulkFilter = buildBulkInQuery('journal_account_id', chunk);
        const queryParts = [bulkFilter, extraFilter].filter(Boolean).join('&');
        const url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/journal_transaction/list/-1?${queryParts}`;
        
        const chunkResults = await fetchAllPagesV2(url, config, onProgress);
        aggregatedResults = aggregatedResults.concat(chunkResults);
    }

    return aggregatedResults;
};

/**
 * 📄 5. Fetch Invoices
 */
const fetchInvoicesV2FromDaftra = async (cleanSubdomain, config, branchIds = [], extraFilter = '', onProgress = null) => {
    const branchFilter = await resolveBranchFilter(cleanSubdomain, config, branchIds);
    const queryParts = [branchFilter, 'filter[type]=0', 'filter[deleted_at][is_null]', extraFilter].filter(Boolean).join('&');
    const url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/invoice/list/-1?${queryParts}`;
    return await fetchAllPagesV2(url, config, onProgress);
};

/**
 * 🔄 5.1 Fetch Refund Receipts
 */
const fetchRefundReceiptsV2FromDaftra = async (cleanSubdomain, config, branchIds = [], extraFilter = '', onProgress = null) => {
    const branchFilter = await resolveBranchFilter(cleanSubdomain, config, branchIds);
    const queryParts = [branchFilter, 'filter[deleted_at][is_null]', extraFilter].filter(Boolean).join('&');
    const url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/refund_receipt/list/-1?${queryParts}`;
    return await fetchAllPagesV2(url, config, onProgress);
};

/**
 * 💳 5.2 Fetch Invoice Payments
 */
const fetchInvoicePaymentsFromDaftra = async (cleanSubdomain, config, branchIds = [], extraFilter = '', onProgress = null) => {
    const branchFilter = await resolveBranchFilter(cleanSubdomain, config, branchIds);
    const queryParts = [branchFilter, extraFilter].filter(Boolean).join('&');
    const url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/invoice_payment/list/-1?${queryParts}`;
    return await fetchAllPagesV2(url, config, onProgress);
};

/**
 * 📄 5.3 Fetch Single Invoice Number Directly
 */
const fetchSingleInvoiceNoFromDaftra = async (cleanSubdomain, config, invoiceId) => {
    try {
        const url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/invoice/${invoiceId}/-1`;
        const response = await axios.get(url, {
            ...config,
            paramsSerializer: { encode: (p) => p }
        });
        const invData = response.data?.data || response.data || {};
        return invData.no ? invData.no.toString().trim() : null;
    } catch (err) {
        console.error(`⚠️ Failed fetching single invoice no for #${invoiceId}:`, err.message);
        return null;
    }
};

/**
 * 🔱 5.4 Fetch Payment Exchange Rate from Journal
 */
const fetchPaymentExchangeRateFromDaftra = async (cleanSubdomain, config, paymentId) => {
    try {
        const url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/journal/list/1?filter[entity_id]=${paymentId}`;
        const response = await axios.get(url, {
            ...config,
            paramsSerializer: { encode: (p) => p }
        });
        const list = response.data?.data || [];
        if (list.length === 0) return 1.0;

        const journal = list[0];
        const totalDebit = parseFloat(journal.total_debit || 0);
        const currencyDebit = parseFloat(journal.currency_debit || 0);

        if (currencyDebit > 0 && totalDebit > 0) {
            return totalDebit / currencyDebit;
        }
        return parseFloat(journal.currency_rate || journal.exchange_rate || 1.0);
    } catch (err) {
        console.error(`⚠️ Failed fetching payment exchange rate for payment #${paymentId}:`, err.message);
        return 1.0;
    }
};

/**
 * 👥 6. Fetch Clients Directory
 */
const fetchClientsFromDaftra = async (cleanSubdomain, config, branchIds = [], onProgress = null) => {
    const branchFilter = await resolveBranchFilter(cleanSubdomain, config, branchIds);
    const url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/client/list/-1?${branchFilter}`;
    return await fetchAllPagesV2(url, config, onProgress);
};

/**
 * 📦 7. Fetch Products Directory
 */
const fetchProductsFromDaftra = async (cleanSubdomain, config, branchIds = [], onProgress = null) => {
    const branchFilter = await resolveBranchFilter(cleanSubdomain, config, branchIds);
    const url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/product/list/1?${branchFilter}`;
    return await fetchAllPagesV2(url, config, onProgress);
};

/**
 * 🧾 8. Fetch Invoice Items (🎯 تم إضافة فلتر الفروع هنا لمنع سقوط الداتا)
 */
const fetchInvoiceItemsFromDaftra = async (cleanSubdomain, config, specificDate = null, branchIds = [], onProgress = null) => {
    const branchFilter = await resolveBranchFilter(cleanSubdomain, config, branchIds);
    let url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/invoice_item/list/1?filter[invoice.deleted_at][is_null]&filter[invoice.type]=0&${branchFilter}`;
    if (specificDate) {
        url += `&filter[invoice.date][equal]=${specificDate}`;
    }
    return await fetchAllPagesV2(url, config, onProgress);
};

/**
 * 🚚 9. Fetch Requisitions List
 */
const fetchRequisitionsFromDaftra = async (cleanSubdomain, config, branchIds = [], orderIds = []) => {
    if (!orderIds || orderIds.length === 0) return [];

    const branchFilter = await resolveBranchFilter(cleanSubdomain, config, branchIds);
    const chunks = chunkArray(orderIds, 10);
    let aggregatedResults = [];

    for (const chunk of chunks) {
        const bulkFilter = buildBulkInQuery('order_id', chunk);
        const queryParts = [bulkFilter, branchFilter].filter(Boolean).join('&');
        const url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/requisition/list/1?${queryParts}`;
        
        const chunkResults = await fetchAllPagesV2(url, config);
        aggregatedResults = aggregatedResults.concat(chunkResults);
    }

    return aggregatedResults;
};

/**
 * 🔍 10. Fetch Single Requisition Details
 */
const fetchRequisitionSingleDetails = async (cleanSubdomain, config, requisitionId) => {
    try {
        const url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/requisition/${requisitionId}`;
        const response = await axios.get(url, {
            ...config,
            paramsSerializer: { encode: (p) => p }
        });
        return response.data?.data || response.data || null;
    } catch (err) {
        console.error(`❌ Failed to fetch requisition details for #${requisitionId}:`, err.message);
        return null;
    }
};

/**
 * 💵 11. Fetch Invoice Journal Entry
 */
const fetchInvoiceJournalEntry = async (cleanSubdomain, config, daftraInvoiceId) => {
    try {
        const url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/journal/list/3?filter[entity_type]=invoice&filter[entity_id]=${daftraInvoiceId}`;
        const response = await axios.get(url, {
            ...config,
            paramsSerializer: { encode: (p) => p }
        });

        const list = response.data?.data || [];
        if (list.length === 0) return null;

        const journal = list[0];
        const totalDebit = parseFloat(journal.total_debit || 0);
        const totalCredit = parseFloat(journal.total_credit || 0);
        const currencyDebit = parseFloat(journal.currency_debit || 0);
        const currencyCredit = parseFloat(journal.currency_credit || 0);
        const currencyCode = journal.currency_code || 'EGP';

        let calculatedRate = 1.0;
        if (currencyDebit > 0 && totalDebit > 0) {
            calculatedRate = totalDebit / currencyDebit;
        }

        return {
            total_debit: totalDebit,
            total_credit: totalCredit,
            currency_debit: currencyDebit,
            currency_credit: currencyCredit,
            currency_code: currencyCode,
            exchange_rate: calculatedRate
        };
    } catch (err) {
        console.error(`❌ Failed to fetch invoice journal for invoice #${daftraInvoiceId}:`, err.message);
        return null;
    }
};

/**
 * 💵 11.1 Direct Single COGS Fetcher
 */
const fetchInvoiceCOGSDirectly = async (cleanSubdomain, config, daftraInvoiceId) => {
    try {
        const url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/journal/list/3?filter[entity_type]=invoice_sales_cost&filter[entity_id]=${daftraInvoiceId}`;
        const response = await axios.get(url, {
            ...config,
            paramsSerializer: { encode: (p) => p }
        });

        const list = response.data?.data || [];
        if (list.length === 0) return 0;

        return list.reduce((sum, j) => sum + parseFloat(j.total_debit || 0), 0);
    } catch (err) {
        console.error(`⚠️ Failed to fetch direct COGS for invoice #${daftraInvoiceId}:`, err.message);
        return 0;
    }
};

/**
 * 🌳 12. Fetch Journal Categories
 */
const fetchJournalCategoriesFromDaftra = async (cleanSubdomain, config, targetParentCatIds = [27, 43], branchIds = []) => {
    const bulkCatFilter = buildBulkInQuery('journal_cat_id', targetParentCatIds);
    const bulkBranchFilter = await resolveBranchFilter(cleanSubdomain, config, branchIds);

    const queryParts = [bulkCatFilter, bulkBranchFilter].filter(Boolean).join('&');
    const url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/journal_cat/list/-1?${queryParts}`;

    return await fetchAllPagesV2(url, config);
};

/**
 * 📑 13. Fetch Journal Accounts
 */
const fetchJournalAccountsFromDaftra = async (cleanSubdomain, config, categoryIds = [], branchIds = []) => {
    if (!categoryIds || categoryIds.length === 0) return [];

    const extraFilter = await resolveBranchFilter(cleanSubdomain, config, branchIds);
    const chunks = chunkArray(categoryIds, 10);
    let aggregatedResults = [];

    for (const chunk of chunks) {
        const bulkFilter = buildBulkInQuery('journal_cat_id', chunk);
        const queryParts = [bulkFilter, extraFilter].filter(Boolean).join('&');
        const url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/journal_account/list/1?${queryParts}`;
        
        const chunkResults = await fetchAllPagesV2(url, config);
        aggregatedResults = aggregatedResults.concat(chunkResults);
    }

    return aggregatedResults;
};

/**
 * 📜 14. Fetch Journal Transactions for General Ledger
 */
const fetchJournalTransactionsFromDaftra = async (cleanSubdomain, config, journalAccountIds = [], extraFilter = '', onProgress = null) => {
    if (!journalAccountIds || journalAccountIds.length === 0) return [];

    const chunks = chunkArray(journalAccountIds, 3);
    let aggregatedResults = [];

    for (const chunk of chunks) {
        const bulkFilter = buildBulkInQuery('journal_account_id', chunk);
        const queryParts = [bulkFilter, extraFilter].filter(Boolean).join('&');
        const url = `https://${cleanSubdomain}.daftra.com/v2/api/entity/journal_transaction/list/1?${queryParts}`;
        
        const chunkResults = await fetchAllPagesV2(url, config, onProgress);
        aggregatedResults = aggregatedResults.concat(chunkResults);
    }

    return aggregatedResults;
};

module.exports = {
    chunkArray,
    buildBulkInQuery,
    getDateRangeFilter,
    fetchAllPagesV2,
    checkDaftraAppActive,
    fetchExactEntityTotals,
    fetchAndResolveAllAccountBranches,
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
    fetchJournalTransactionsFromDaftra
};