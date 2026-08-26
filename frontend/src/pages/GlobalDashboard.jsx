import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    Grid,
    Card,
    CardContent,
    Typography,
    Button,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    TableContainer,
    Paper,
    Chip,
    Backdrop,
    CircularProgress,
    IconButton,
    Tooltip,
    FormControl,
    Select,
    MenuItem,
    Snackbar,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    LinearProgress,
    useTheme
} from '@mui/material';
import {
    SyncRounded as SyncIcon,
    DeleteOutlineRounded as DeleteOutlineIcon,
    ArrowForwardRounded as ArrowForwardIcon,
    AddRounded as AddIcon,
    CurrencyExchangeRounded as ExchangeIcon,
    ReceiptLongRounded as InvoiceIcon
} from '@mui/icons-material';
import {
    PieChart,
    Pie,
    Cell,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
    CartesianGrid
} from 'recharts';
import API from '../services/api';
import Layout from '../components/Layout';
import AddAccountModal from '../components/AddAccountModal';
import { useLanguage } from '../LanguageContext';
import { formatCurrency } from '../utils/formatters';
import { getCurrencySymbol, getCurrencyFullName } from '../i18n/currencies';

const STEP_KEY_MAP = {
    initializing:             'stepInitializing',
    calculating_totals:      'stepCalculatingTotals',
    fetching_transactions:    'stepTransactions',
    fetching_invoices:        'stepInvoices',
    fetching_clients:         'stepClients',
    fetching_products:        'stepProducts',
    processing_product_sales: 'stepProductSales',
    fetching_expenses:        'stepExpenses',
    fetching_incomes:         'stepIncomes',
    final_rollup:            'stepRollup',
};

const STATUS_CHIP_MAP = {
    active:    { labelKey: 'active',           color: 'success' },
    connected: { labelKey: 'active',           color: 'success' },
    syncing:   { labelKey: 'syncStatusSyncing', color: 'warning' },
    error:     { labelKey: 'syncStatusError',   color: 'error'   },
    pending:   { labelKey: 'syncStatusPending', color: 'default' },
};

const CustomChartTooltip = ({ active, payload, label, lang, baseCurrCode, isQty = false, t }) => {
    const theme = useTheme();
    const isRtl = lang === 'ar' || t?.dir === 'rtl';

    if (active && payload && payload.length) {
        return (
            <Paper
                elevation={4}
                dir={isRtl ? 'rtl' : 'ltr'}
                sx={{
                    p: 1.5,
                    bgcolor: theme.palette.mode === 'dark' ? '#1e293b' : '#ffffff',
                    color: theme.palette.text.primary,
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 2.5,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                }}
            >
                {label && (
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.8, color: 'text.primary' }}>
                        {label}
                    </Typography>
                )}
                {payload.map((entry, index) => {
                    let fieldLabel = entry.name;
                    if (entry.dataKey === 'revenue') fieldLabel = t?.revenueLabel || 'Revenue';
                    else if (entry.dataKey === 'cogs') fieldLabel = t?.cogsCostLabel || 'Cost of Goods Sold';
                    else if (entry.dataKey === 'total_paid') fieldLabel = t?.paidInvoicesLabel || 'Paid Revenue';
                    else if (entry.dataKey === 'total_unpaid') fieldLabel = t?.unpaidInvoicesLabel || 'Balance Due';
                    else if (entry.dataKey === 'total_invoiced') fieldLabel = t?.totalInvoicedLabel || 'Total Invoiced';

                    const currCode = entry.payload?.display_currency || entry.payload?.account_currency || baseCurrCode;
                    const currSymbol = getCurrencySymbol(currCode, lang);

                    return (
                        <Box key={`item-${index}`} sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 0.3 }}>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: entry.fill || entry.color || entry.stroke, flexShrink: 0 }} />
                            <Typography variant="caption" color="text.secondary" fontWeight={500}>
                                {fieldLabel}:
                            </Typography>
                            <Typography variant="caption" fontWeight={700} color={entry.fill || entry.color || entry.stroke} sx={{ display: 'inline-flex', gap: 0.5 }}>
                                {isQty ? (
                                    <><bdi>{entry.value}</bdi> <span>{t?.unitsCount || 'pcs'}</span></>
                                ) : (
                                    <><bdi>{formatCurrency(entry.value)}</bdi> <span>{currSymbol}</span></>
                                )}
                            </Typography>
                        </Box>
                    );
                })}
            </Paper>
        );
    }
    return null;
};

const GlobalDashboard = () => {
    const navigate = useNavigate();
    const theme = useTheme();
    const { t, lang } = useLanguage();
    const isRtl = lang === 'ar' || t.dir === 'rtl';
    const userId = localStorage.getItem('userId');

    const [rawMetrics, setRawMetrics] = useState({});
    const [accounts, setAccounts] = useState([]);
    const [selectedCurrency, setSelectedCurrency] = useState('ALL');
    const [syncLoading, setSyncLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);

    const [isUnifiedFeatureEnabled, setIsUnifiedFeatureEnabled] = useState(false);
    const [availableUnifiedCurrencies, setAvailableUnifiedCurrencies] = useState(['DEFAULT']);
    const [activeTargetCurrency, setActiveTargetCurrency] = useState('DEFAULT');

    const [analyticsData, setAnalyticsData] = useState({
        summary: {},
        treasuries: [],
        paymentStatusBreakdown: [],
        topClients: [],
        branchComparison: [],
        accountPaymentStatus: []
    });

    const [widgetsData, setWidgetsData] = useState({ invoices: [], clients: [] });
    const [widgetsLoading, setWidgetsLoading] = useState(true);

    const [recentSales, setRecentSales] = useState([]);
    const [salesBreakdown, setSalesBreakdown] = useState([]);
    const [salesLoading, setSalesLoading] = useState(true);

    const [localSnackbar, setLocalSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [deleteDialog, setDeleteDialog] = useState({ open: false, accountId: null, accountName: '' });

    const [syncJobId, setSyncJobId] = useState(null);
    const [jobStatus, setJobStatus] = useState(null);
    const [confirmGlobalSyncOpen, setConfirmGlobalSyncOpen] = useState(false);

    const fetchCurrencySettings = useCallback(async () => {
        try {
            const sysCurrRes = await API.get(`/currency/system-currencies/${userId}`);
            const accountCurrencies = sysCurrRes.data?.activeAccountCurrencies || ['EGP'];

            const res = await API.get(`/currency/settings/${userId}`);
            const { is_unified_enabled, active_currency, rates } = res.data || {};

            setIsUnifiedFeatureEnabled(!!is_unified_enabled);

            const savedLocalCurr = localStorage.getItem('hub_active_currency');
            const currentActive = savedLocalCurr || active_currency || 'DEFAULT';

            if (is_unified_enabled) {
                const validSet = new Set(['DEFAULT']);
                accountCurrencies.forEach(c => validSet.add(c.toUpperCase().trim()));

                if (rates && rates.length > 0) {
                    rates.forEach(r => {
                        if (r.from_currency) validSet.add(r.from_currency.toUpperCase().trim());
                    });
                }
                setAvailableUnifiedCurrencies(Array.from(validSet));
                setActiveTargetCurrency(currentActive);
            } else {
                setAvailableUnifiedCurrencies(['DEFAULT']);
                setActiveTargetCurrency('DEFAULT');
                localStorage.removeItem('hub_active_currency');
            }
        } catch (err) {
            console.error('Error fetching user currency settings:', err);
        }
    }, [userId]);

    const fetchGlobalAnalytics = useCallback(async (targetCurr = activeTargetCurrency, filterCurr = selectedCurrency) => {
        try {
            const params = {};
            if (filterCurr !== 'ALL') params.currency = filterCurr;
            if (targetCurr !== 'DEFAULT') params.targetCurrency = targetCurr;

            const response = await API.get(`/financial/global/analytics/${userId}`, { params });
            if (response.data) setAnalyticsData(response.data);
        } catch (err) {
            console.error('Error fetching global analytics datasets:', err);
        }
    }, [userId, activeTargetCurrency, selectedCurrency]);

    const fetchRecentWidgets = useCallback(async (targetCurr = activeTargetCurrency) => {
        setWidgetsLoading(true);
        try {
            const params = {};
            if (targetCurr !== 'DEFAULT') params.targetCurrency = targetCurr;

            const response = await API.get(`/financial/global/recent-widgets/${userId}`, { params });
            if (response.data) {
                setWidgetsData({
                    invoices: response.data.invoices || [],
                    clients:  response.data.clients  || []
                });
            }
        } catch (err) {
            console.error('Error loading recent widgets:', err);
        } finally {
            setWidgetsLoading(false);
        }
    }, [userId, activeTargetCurrency]);

    const fetchRecentSalesWidgetData = useCallback(async (targetCurr = activeTargetCurrency) => {
        setSalesLoading(true);
        try {
            const params = { userId };
            if (targetCurr !== 'DEFAULT') params.targetCurrency = targetCurr;

            const response = await API.get('/financial/widgets/sales', { params });
            if (response.data) {
                setRecentSales(response.data.recentSales || []);
                setSalesBreakdown(response.data.salesBreakdown || []);
            }
        } catch (err) {
            console.error('Error fetching global sales widget data:', err);
        } finally {
            setSalesLoading(false);
        }
    }, [userId, activeTargetCurrency]);

    // 🎯 تعديل معالج تغيير العملة الموحدة لمنع إغلاق الخيار والاحتفاظ بـ Preferences في الباك إند
    const handleUnifiedCurrencyChange = async (newTargetCurr) => {
        setActiveTargetCurrency(newTargetCurr);
        localStorage.setItem('hub_active_currency', newTargetCurr);

        try {
            await API.put(`/currency/active-currency/${userId}`, { 
                userId: userId,
                active_currency: newTargetCurr,
                activeCurrency: newTargetCurr
            });
        } catch (err) {
            console.error('Failed saving active currency preference:', err);
        }

        fetchGlobalAnalytics(newTargetCurr, selectedCurrency);
        fetchRecentWidgets(newTargetCurr);
        fetchRecentSalesWidgetData(newTargetCurr);
    };
    
    const handleFilterCurrencyChange = (newFilterCurr) => {
        setSelectedCurrency(newFilterCurr);
        fetchGlobalAnalytics(activeTargetCurrency, newFilterCurr);
    };

    const fetchGlobalMetrics = useCallback(async () => {
        try {
            const response = await API.get(`/financial/summary/${userId}`);
            if (response.data) {
                const metricsObject = response.data.user_id
                    ? { [response.data.currency_code || 'EGP']: response.data }
                    : response.data;
                setRawMetrics(metricsObject);
            }
        } catch (err) {
            console.error('Error loading summary metrics:', err);
        }
    }, [userId]);

    const fetchLinkedAccounts = useCallback(async () => {
        try {
            const response = await API.get(`/auth/linked-accounts/${userId}`);
            setAccounts(response.data);
        } catch (err) {
            console.error('Error loading linked accounts:', err);
        }
    }, [userId]);

    const fetchAllDashboardData = useCallback(() => {
        fetchLinkedAccounts();
        fetchGlobalMetrics();
        fetchRecentWidgets();
        fetchRecentSalesWidgetData();
        fetchCurrencySettings();
        fetchGlobalAnalytics(activeTargetCurrency, selectedCurrency);
    }, [fetchLinkedAccounts, fetchGlobalMetrics, fetchRecentWidgets, fetchRecentSalesWidgetData, fetchCurrencySettings, fetchGlobalAnalytics, activeTargetCurrency, selectedCurrency]);

    useEffect(() => {
        if (!userId) {
            navigate('/login');
        } else {
            fetchAllDashboardData();
        }
    }, [fetchAllDashboardData, userId, navigate]);

    useEffect(() => {
        let pollingInterval = null;
        if (syncJobId) {
            pollingInterval = setInterval(async () => {
                try {
                    const res = await API.get(`/auth/sync-status/${syncJobId}`);
                    const job = res.data;
                    setJobStatus(job);

                    if (job.status === 'completed') {
                        clearInterval(pollingInterval);
                        setSyncLoading(false);
                        setSyncJobId(null);
                        setJobStatus(null);
                        fetchAllDashboardData();
                        setLocalSnackbar({ open: true, message: t.synchronizedSuccess || 'Synchronized successfully!', severity: 'success' });
                    } else if (job.status === 'failed') {
                        clearInterval(pollingInterval);
                        setSyncLoading(false);
                        setSyncJobId(null);
                        setJobStatus(null);
                        setLocalSnackbar({ open: true, message: job.error_message || t.syncFailed || 'Sync failed.', severity: 'error' });
                    }
                } catch (pollErr) {
                    console.error('Poll error:', pollErr.message);
                }
            }, 1500);
        }
        return () => { if (pollingInterval) clearInterval(pollingInterval); };
    }, [syncJobId, fetchAllDashboardData, t]);

    const handleForceSystemSyncTrigger = () => setConfirmGlobalSyncOpen(true);

    const handleForceSystemSync = async () => {
        setConfirmGlobalSyncOpen(false);
        setSyncLoading(true);
        setJobStatus(null);
        try {
            const response = await API.post(`/financial/sync-all/${userId}`);
            if (response.data?.backgroundJobLaunched) {
                setSyncJobId(response.data.jobId);
            } else {
                setSyncLoading(false);
                setLocalSnackbar({ open: true, message: response.data?.message || t.noConnectedAccountsMessage, severity: 'info' });
            }
        } catch (err) {
            console.error('Sync error:', err);
            setLocalSnackbar({ open: true, message: err.response?.data?.error || t.syncFailed, severity: 'error' });
            setSyncLoading(false);
        }
    };

    const handleAccountAddedLocally = (account, message) => {
        setModalOpen(false);
        fetchAllDashboardData();
        setLocalSnackbar({ open: true, message: message || t.connectedSuccess, severity: 'success' });
    };

    const triggerDeleteConfirmation = (accountId, accountName) => {
        setDeleteDialog({ open: true, accountId, accountName });
    };

    const executeDeleteAccount = async () => {
        const { accountId } = deleteDialog;
        setDeleteDialog({ open: false, accountId: null, accountName: '' });
        try {
            await API.delete(`/auth/linked-accounts/${accountId}`);
            fetchAllDashboardData();
            setLocalSnackbar({ open: true, message: t.deletedSuccess, severity: 'success' });
        } catch (err) {
            setLocalSnackbar({ open: true, message: err.response?.data?.error || t.errorTitle, severity: 'error' });
        }
    };

    const renderSyncStepLabel = (step) => {
        const key = STEP_KEY_MAP[step];
        return (key && t[key]) || t.stepGeneric;
    };

    const renderStatusChip = (syncStatus) => {
        const cfg = STATUS_CHIP_MAP[syncStatus] || STATUS_CHIP_MAP.active;
        return <Chip label={t[cfg.labelKey]} color={cfg.color} size="small" variant="outlined" />;
    };

    const syncIconProps = isRtl ? { endIcon: <SyncIcon /> } : { startIcon: <SyncIcon /> };
    const addIconProps  = isRtl ? { endIcon: <AddIcon /> }  : { startIcon: <AddIcon /> };

    const activeSummary = analyticsData.summary || {};
    
    const isSingleCurrencyMode = activeTargetCurrency !== 'DEFAULT' || selectedCurrency !== 'ALL';

    let breakdownEntries = Object.entries(activeSummary.breakdown_by_currency || {});
    if (selectedCurrency !== 'ALL' && !isSingleCurrencyMode) {
        breakdownEntries = breakdownEntries.filter(([curr]) => curr.toUpperCase().trim() === selectedCurrency.toUpperCase().trim());
    }

    const baseCurrCode = activeTargetCurrency !== 'DEFAULT'
        ? activeTargetCurrency
        : (selectedCurrency !== 'ALL' ? selectedCurrency : 'EGP').toUpperCase();

    const treasuriesList = analyticsData.treasuries || [];
    const treasuriesByCurrency = {};

    treasuriesList.forEach(row => {
        const curr = (row.currency_code || 'EGP').toUpperCase().trim();
        if (!treasuriesByCurrency[curr]) {
            treasuriesByCurrency[curr] = { inflow: 0, outflow: 0, closing: 0 };
        }
        treasuriesByCurrency[curr].inflow += parseFloat(row.today_inflow  || 0) + parseFloat(row.opening_balance || 0);
        treasuriesByCurrency[curr].outflow += parseFloat(row.today_outflow || 0);
        treasuriesByCurrency[curr].closing += parseFloat(row.closing_balance || 0);
    });

    let filteredTreasuriesEntries = Object.entries(treasuriesByCurrency);
    if (selectedCurrency !== 'ALL' && activeTargetCurrency === 'DEFAULT') {
        filteredTreasuriesEntries = filteredTreasuriesEntries.filter(([curr]) => curr.toUpperCase().trim() === selectedCurrency.toUpperCase().trim());
    }

    const totalTreasuryInflow   = treasuriesList.reduce((acc, row) => acc + parseFloat(row.today_inflow  || 0) + parseFloat(row.opening_balance || 0), 0);
    const totalTreasuryOutflow  = treasuriesList.reduce((acc, row) => acc + parseFloat(row.today_outflow || 0), 0);
    const totalTreasuryClosing  = treasuriesList.reduce((acc, row) => acc + parseFloat(row.closing_balance || 0), 0);

    const totalPaidCalculated    = parseFloat(activeSummary.total_paid    || 0);
    const totalUnpaidCalculated  = parseFloat(activeSummary.total_unpaid  || 0);
    const totalReturnsCalculated = parseFloat(activeSummary.total_returns || 0);

    const formattedPieData = [
        { name: t.statusPaid     || 'Paid',               value: totalPaidCalculated,    color: '#2e7d32' },
        { name: t.statusUnpaid   || 'Unpaid / Due',        value: totalUnpaidCalculated,  color: '#ed6c02' },
        { name: t.statusReturned || 'Returned / Refunded', value: totalReturnsCalculated, color: '#d32f2f' }
    ].filter(item => item.value > 0);

    const PIE_COLORS = ['#1976d2', '#2e7d32', '#ed6c02', '#9c27b0', '#00bcd4'];

    const chartAxisColor = theme.palette.text.secondary;

    const currentSingleRevenue = selectedCurrency !== 'ALL' && activeTargetCurrency === 'DEFAULT'
        ? (activeSummary.breakdown_by_currency?.[selectedCurrency]?.invoices_revenue || 0)
        : (activeSummary.invoices_revenue || activeSummary.total_revenue || 0);

    const currentSingleUnpaid = selectedCurrency !== 'ALL' && activeTargetCurrency === 'DEFAULT'
        ? (activeSummary.breakdown_by_currency?.[selectedCurrency]?.total_unpaid || 0)
        : (activeSummary.total_unpaid || 0);

    const currentSingleReturns = selectedCurrency !== 'ALL' && activeTargetCurrency === 'DEFAULT'
        ? (activeSummary.breakdown_by_currency?.[selectedCurrency]?.total_returns || 0)
        : (activeSummary.total_returns || 0);

    const currentSingleProfit = selectedCurrency !== 'ALL' && activeTargetCurrency === 'DEFAULT'
        ? (activeSummary.breakdown_by_currency?.[selectedCurrency]?.net_profit || 0)
        : (activeSummary.net_profit || 0);

    return (
        <Layout title={t.navDashboard}>
            {/* BACKDROP SYNC LOADER */}
            <Backdrop open={syncLoading} sx={{ zIndex: (th) => th.zIndex.drawer + 10, color: '#fff', flexDirection: 'column', gap: 3, p: 4 }}>
                <Box sx={{ width: '100%', maxWidth: 400, textAlign: 'center', p: 3, bgcolor: 'background.paper', borderRadius: 3, color: 'text.primary', boxShadow: 24 }}>
                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'center' }}>
                        <CircularProgress size={32} thickness={5} />
                    </Box>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
                        {t.reEvaluatingInvoices || 'Synchronizing Global Workspace'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3, minHeight: 20, fontSize: '13px' }}>
                        {jobStatus ? renderSyncStepLabel(jobStatus.current_step) : t.stepPreparing}
                    </Typography>
                    <Box sx={{ width: '100%', mb: 1.5 }}>
                        <LinearProgress
                            variant="determinate"
                            value={jobStatus ? jobStatus.progress_percentage : 0}
                            sx={{ height: 6, borderRadius: 3 }}
                        />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 0.5 }}>
                        <Typography variant="caption" fontWeight={700} color="primary.main">
                            {jobStatus ? `${jobStatus.progress_percentage}%` : '0%'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {jobStatus ? `${jobStatus.processed_records} / ${jobStatus.total_records || '?'}` : '0 / 0'}
                        </Typography>
                    </Box>
                </Box>
            </Backdrop>

            {/* Toolbar Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    {/* Filter 1: Currency Filter */}
                    <FormControl size="small" disabled={activeTargetCurrency !== 'DEFAULT'}>
                        <Select
                            id="currency-filter"
                            value={selectedCurrency}
                            onChange={(e) => handleFilterCurrencyChange(e.target.value)}
                            sx={{
                                fontSize: '12px',
                                height: '32px',
                                fontWeight: 600,
                                borderRadius: '6px',
                                minWidth: '140px',
                                bgcolor: 'background.paper'
                            }}
                        >
                            <MenuItem value="ALL" sx={{ fontSize: '12px', fontWeight: 600 }}>{t.allCurrencies || 'All Currencies'}</MenuItem>
                            {Object.keys(rawMetrics).map((curr) => (
                                <MenuItem key={curr} value={curr} sx={{ fontSize: '12px' }}>
                                    {getCurrencyFullName(curr, lang)}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    {/* Filter 2: Unified Display Currency Selector */}
                    {isUnifiedFeatureEnabled && (
                        <FormControl size="small">
                            <Select
                                id="unified-currency-selector"
                                value={activeTargetCurrency}
                                onChange={(e) => handleUnifiedCurrencyChange(e.target.value)}
                                startAdornment={<ExchangeIcon fontSize="small" sx={{ mr: 0.8, color: 'primary.main', fontSize: '16px' }} />}
                                sx={{
                                    fontSize: '12px',
                                    height: '32px',
                                    fontWeight: 700,
                                    borderRadius: '6px',
                                    minWidth: '180px',
                                    bgcolor: 'background.paper'
                                }}
                            >
                                <MenuItem value="DEFAULT" sx={{ fontSize: '12px' }}>
                                    <em>{t.multiCurrencyDefault || 'Multi-Currency (Default)'}</em>
                                </MenuItem>
                                {availableUnifiedCurrencies
                                    .filter(c => c !== 'DEFAULT')
                                    .map(code => (
                                        <MenuItem key={code} value={code} sx={{ fontSize: '12px', fontWeight: 600 }}>
                                            {code} - {getCurrencyFullName(code, lang)}
                                        </MenuItem>
                                    ))}
                            </Select>
                        </FormControl>
                    )}
                </Box>

                <Box sx={{ display: 'flex', gap: 1.5 }}>
                    <Button variant="outlined" {...syncIconProps} onClick={handleForceSystemSyncTrigger} size="small">
                        {t.syncNow || 'Synchronize All Data'}
                    </Button>
                    <Button variant="contained" {...addIconProps} onClick={() => setModalOpen(true)} size="small">
                        {t.connectNewBranch || 'Connect Branch'}
                    </Button>
                </Box>
            </Box>

            {/* ROW 1: LIVE TREASURY TOTALS + NET PROFIT */}
            <Grid container spacing={2.5} sx={{ mb: 3 }}>
                <Grid item xs={12} md={8}>
                    <Card sx={{ height: '100%', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2, display: 'flex', flexDirection: 'column' }}>
                        <CardContent sx={{ p: 2.5, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                                <Box>
                                    <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                                        {t.liveTreasuriesTitle || 'Live Daily Treasuries Overview'}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {t.liveTreasuriesSubtitle || 'Real-time aggregate cash inflow, outflow, and net drawer balance'}
                                    </Typography>
                                </Box>
                                <Chip label={t.liveDaily || 'Live Daily'} color="success" size="small" variant="outlined" sx={{ fontWeight: 700, fontSize: '11px' }} />
                            </Box>

                            {isSingleCurrencyMode ? (
                                <Grid container spacing={2} sx={{ bgcolor: theme.palette.mode === 'dark' ? '#1e293b' : '#f8fafc', p: 2, borderRadius: 2, border: `1px solid ${theme.palette.divider}`, my: 'auto' }}>
                                    <Grid item xs={4}>
                                        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', fontSize: '12px' }}>
                                            {t.inflowOpening || 'Total Inflow + Opening'}
                                        </Typography>
                                        <Typography variant="h6" fontWeight={700} color="success.main" sx={{ fontSize: '17px', mt: 0.5 }}>
                                            <bdi>{formatCurrency(totalTreasuryInflow)}</bdi> {getCurrencySymbol(baseCurrCode, lang)}
                                        </Typography>
                                    </Grid>
                                    <Grid item xs={4}>
                                        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', fontSize: '12px' }}>
                                            {t.outflow || 'Total Outflow'}
                                        </Typography>
                                        <Typography variant="h6" fontWeight={700} color="error.main" sx={{ fontSize: '17px', mt: 0.5 }}>
                                            <bdi>{formatCurrency(totalTreasuryOutflow)}</bdi> {getCurrencySymbol(baseCurrCode, lang)}
                                        </Typography>
                                    </Grid>
                                    <Grid item xs={4}>
                                        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', fontSize: '12px' }}>
                                            {t.liveDrawerBalance || 'Total Cash in Drawer'}
                                        </Typography>
                                        <Typography variant="h6" fontWeight={700} color="primary.main" sx={{ fontSize: '17px', mt: 0.5 }}>
                                            <bdi>{formatCurrency(totalTreasuryClosing)}</bdi> {getCurrencySymbol(baseCurrCode, lang)}
                                        </Typography>
                                    </Grid>
                                </Grid>
                            ) : (
                                <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2, my: 'auto' }}>
                                    <Table size="small">
                                        <TableHead sx={{ bgcolor: theme.palette.mode === 'dark' ? '#1e293b' : '#f8fafc' }}>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 700, fontSize: '11px' }}>{t.currency || 'Currency'}</TableCell>
                                                <TableCell align={isRtl ? 'left' : 'right'} sx={{ fontWeight: 700, fontSize: '11px', color: 'success.main' }}>{t.inflowOpening || 'Inflow + Opening'}</TableCell>
                                                <TableCell align={isRtl ? 'left' : 'right'} sx={{ fontWeight: 700, fontSize: '11px', color: 'error.main' }}>{t.outflow || 'Total Outflow'}</TableCell>
                                                <TableCell align={isRtl ? 'left' : 'right'} sx={{ fontWeight: 700, fontSize: '11px', color: 'primary.main' }}>{t.liveDrawerBalance || 'Cash in Drawer'}</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {filteredTreasuriesEntries.map(([curr, tData]) => (
                                                <TableRow key={curr} hover>
                                                    <TableCell sx={{ fontWeight: 700, fontSize: '12px' }}>
                                                        <Chip label={getCurrencySymbol(curr, lang)} size="small" variant="outlined" sx={{ fontWeight: 700, height: 20, fontSize: '11px' }} />
                                                    </TableCell>
                                                    <TableCell align={isRtl ? 'left' : 'right'} sx={{ fontWeight: 700, fontSize: '13px', color: 'success.main' }}>
                                                        <bdi>{formatCurrency(tData.inflow)}</bdi> {getCurrencySymbol(curr, lang)}
                                                    </TableCell>
                                                    <TableCell align={isRtl ? 'left' : 'right'} sx={{ fontWeight: 700, fontSize: '13px', color: 'error.main' }}>
                                                        <bdi>{formatCurrency(tData.outflow)}</bdi> {getCurrencySymbol(curr, lang)}
                                                    </TableCell>
                                                    <TableCell align={isRtl ? 'left' : 'right'} sx={{ fontWeight: 700, fontSize: '13px', color: 'primary.main' }}>
                                                        <bdi>{formatCurrency(tData.closing)}</bdi> {getCurrencySymbol(curr, lang)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Card sx={{ bgcolor: '#1976d2', color: '#fff', height: '100%', boxShadow: '0 4px 16px rgba(25, 118, 210, 0.2)', borderRadius: 2, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <CardContent sx={{ textAlign: 'center', py: 2.5 }}>
                            <Typography variant="overline" sx={{ fontWeight: 700, opacity: 0.9, letterSpacing: 1.1, fontSize: '12px' }}>
                                {t.netOperatingProfit30Days || 'NET OPERATING PROFIT'}
                            </Typography>

                            {isSingleCurrencyMode ? (
                                <Box sx={{ my: 1 }}>
                                    <Typography variant="h3" fontWeight={800} sx={{ fontSize: { xs: '26px', md: '32px' } }}>
                                        <bdi>{formatCurrency(currentSingleProfit)}</bdi>
                                    </Typography>
                                    <Typography variant="subtitle2" fontWeight={700} sx={{ opacity: 0.9 }}>
                                        {getCurrencySymbol(baseCurrCode, lang)}
                                    </Typography>
                                </Box>
                            ) : (
                                <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    {breakdownEntries.map(([curr, currData]) => (
                                        <Box key={curr} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 0.8, bgcolor: 'rgba(255,255,255,0.12)', borderRadius: 1.5 }}>
                                            <Chip label={getCurrencySymbol(curr, lang)} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 800, height: 20, fontSize: '11px' }} />
                                            <Typography variant="h6" fontWeight={800} sx={{ fontSize: '17px' }}>
                                                <bdi>{formatCurrency(currData.net_profit)}</bdi> {getCurrencySymbol(curr, lang)}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Box>
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* ROW 2: 3 CARDS ONLY */}
            <Grid container spacing={2.5} sx={{ mb: 3 }}>
                {/* 1. CARD: REVENUE */}
                <Grid item xs={12} md={4}>
                    <Card sx={{ borderLeft: '4px solid', borderLeftColor: 'success.main', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', borderRadius: 2, height: '100%' }}>
                        <CardContent sx={{ p: 2.5 }}>
                            <Typography variant="overline" color="text.secondary" fontWeight={700} sx={{ fontSize: '11px', letterSpacing: 0.5 }}>
                                {t.totalInvoicesRevenueIncTax || 'TOTAL INVOICES REVENUE (INC. TAX)'}
                            </Typography>

                            {isSingleCurrencyMode ? (
                                <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                                    <Typography variant="h4" fontWeight={800} color="success.main" sx={{ fontSize: '26px' }}>
                                        <bdi>{formatCurrency(currentSingleRevenue)}</bdi>
                                    </Typography>
                                    <Typography variant="subtitle2" fontWeight={700} color="text.secondary">
                                        {getCurrencySymbol(baseCurrCode, lang)}
                                    </Typography>
                                </Box>
                            ) : (
                                <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    {breakdownEntries.map(([curr, currData]) => (
                                        <Box key={curr} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.6, borderBottom: `1px solid ${theme.palette.divider}` }}>
                                            <Chip label={getCurrencySymbol(curr, lang)} size="small" variant="outlined" sx={{ fontWeight: 700, height: 20, fontSize: '10px' }} />
                                            <Typography variant="subtitle1" fontWeight={800} color="success.main" sx={{ fontSize: '16px' }}>
                                                <bdi>{formatCurrency(currData?.invoices_revenue ?? currData?.total_revenue ?? 0)}</bdi> {getCurrencySymbol(curr, lang)}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Box>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* 2. CARD: OUTSTANDING DUE */}
                <Grid item xs={12} md={4}>
                    <Card sx={{ borderLeft: '4px solid', borderLeftColor: 'warning.main', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', borderRadius: 2, height: '100%' }}>
                        <CardContent sx={{ p: 2.5 }}>
                            <Typography variant="overline" color="text.secondary" fontWeight={700} sx={{ fontSize: '11px', letterSpacing: 0.5 }}>
                                {t.outstandingReceivablesDue || 'OUTSTANDING RECEIVABLES (DUE)'}
                            </Typography>

                            {isSingleCurrencyMode ? (
                                <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                                    <Typography variant="h4" fontWeight={800} color="warning.main" sx={{ fontSize: '26px' }}>
                                        <bdi>{formatCurrency(currentSingleUnpaid)}</bdi>
                                    </Typography>
                                    <Typography variant="subtitle2" fontWeight={700} color="text.secondary">
                                        {getCurrencySymbol(baseCurrCode, lang)}
                                    </Typography>
                                </Box>
                            ) : (
                                <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    {breakdownEntries.map(([curr, currData]) => (
                                        <Box key={curr} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.6, borderBottom: `1px solid ${theme.palette.divider}` }}>
                                            <Chip label={getCurrencySymbol(curr, lang)} size="small" variant="outlined" sx={{ fontWeight: 700, height: 20, fontSize: '10px' }} />
                                            <Typography variant="subtitle1" fontWeight={800} color="warning.main" sx={{ fontSize: '16px' }}>
                                                <bdi>{formatCurrency(currData?.total_unpaid ?? 0)}</bdi> {getCurrencySymbol(curr, lang)}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Box>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* 3. CARD: RETURNS */}
                <Grid item xs={12} md={4}>
                    <Card sx={{ borderLeft: '4px solid', borderLeftColor: 'error.main', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', borderRadius: 2, height: '100%' }}>
                        <CardContent sx={{ p: 2.5 }}>
                            <Typography variant="overline" color="text.secondary" fontWeight={700} sx={{ fontSize: '11px', letterSpacing: 0.5 }}>
                                {t.totalReturnsLabel || 'TOTAL RETURNS'}
                            </Typography>

                            {isSingleCurrencyMode ? (
                                <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                                    <Typography variant="h4" fontWeight={800} color="error.main" sx={{ fontSize: '26px' }}>
                                        <bdi>{formatCurrency(currentSingleReturns)}</bdi>
                                    </Typography>
                                    <Typography variant="subtitle2" fontWeight={700} color="text.secondary">
                                        {getCurrencySymbol(baseCurrCode, lang)}
                                    </Typography>
                                </Box>
                            ) : (
                                <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    {breakdownEntries.map(([curr, currData]) => (
                                        <Box key={curr} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.6, borderBottom: `1px solid ${theme.palette.divider}` }}>
                                            <Chip label={getCurrencySymbol(curr, lang)} size="small" variant="outlined" sx={{ fontWeight: 700, height: 20, fontSize: '10px' }} />
                                            <Typography variant="subtitle1" fontWeight={800} color="error.main" sx={{ fontSize: '16px' }}>
                                                <bdi>{formatCurrency(currData?.total_returns ?? 0)}</bdi> {getCurrencySymbol(curr, lang)}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Box>
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* 🎯 قسم المبيعات والتحصيلات المحدث: كارت Donut Chart للمبيعات + كارت أحدث 5 مبيعات */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
                {/* 1. Sales Collection Breakdown Donut Chart */}
                <Grid item xs={12} md={6}>
                    <Card sx={{ height: '100%', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                        <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
                                {t.salesBreakdownChartTitle || (lang === 'ar' ? 'نسب توزيع المبيعات المحصلة' : 'Sales Collection Breakdown')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                                {t.salesBreakdownChartSubtitle || (lang === 'ar' ? 'نسبة توزيع المبيعات بحسب طريقة تحصيل الأموال بكافة الفروع' : 'Proportional breakdown of collected sales per payment method.')}
                            </Typography>

                            <Box sx={{ width: '100%', height: 210, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {salesLoading ? (
                                    <CircularProgress size={24} />
                                ) : salesBreakdown.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary">{t.noTransactions || 'No sales recorded'}</Typography>
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={salesBreakdown}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={55}
                                                outerRadius={80}
                                                paddingAngle={4}
                                                dataKey="value"
                                            >
                                                {salesBreakdown.map((entry, index) => (
                                                    <Cell key={`sales-cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <RechartsTooltip 
                                                content={<CustomChartTooltip lang={lang} baseCurrCode={baseCurrCode} t={t} />} 
                                                cursor={{ fill: 'transparent' }} 
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                )}
                            </Box>

                            <Box sx={{ mt: 'auto', pt: 1, borderTop: `1px solid ${theme.palette.divider}` }}>
                                {salesBreakdown.map((item, idx) => (
                                    <Box key={item.name} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.3 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                                            <Typography variant="caption" fontWeight={600} sx={{ textTransform: 'capitalize' }}>
                                                {item.name === 'cash' ? (lang === 'ar' ? 'نقداً (Cash)' : 'Cash') : item.name === 'bank' ? (lang === 'ar' ? 'تحويل بنكي' : 'Bank Transfer') : item.name}
                                            </Typography>
                                        </Box>
                                        <Typography variant="caption" fontWeight={700} color={PIE_COLORS[idx % PIE_COLORS.length]}>
                                            <bdi>{formatCurrency(item.value)}</bdi> {getCurrencySymbol(baseCurrCode, lang)}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                {/* 2. Recent Sales Table */}
                <Grid item xs={12} md={6}>
                    <Card sx={{ height: '100%', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="subtitle1" fontWeight={700}>
                                    {t.recentSalesTitle || (lang === 'ar' ? 'أحدث المبيعات والتحصيلات' : 'Recent Sales & Receipts')}
                                </Typography>
                                <Button size="small" onClick={() => navigate('/payments')}>
                                    {t.viewAll || 'View All'}
                                </Button>
                            </Box>

                            {salesLoading ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>
                            ) : (
                                <TableContainer component={Paper} elevation={0}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700 }}># {t.refDoc || (lang === 'ar' ? 'الفاتورة / العميل' : 'Ref Doc')}</TableCell>
                                                <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700 }}>{t.branchLabel || (lang === 'ar' ? 'الفرع' : 'Branch')}</TableCell>
                                                <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700 }}>{t.totalAmount || 'Total'}</TableCell>
                                                <TableCell sx={{ fontWeight: 700 }} align="center">{t.paymentMethod || 'Method'}</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {recentSales.length === 0 ? (
                                                <TableRow><TableCell colSpan={4} align="center" sx={{ color: 'text.secondary', py: 2 }}>{t.noTransactions || 'No sales recorded'}</TableCell></TableRow>
                                            ) : (
                                                recentSales.map((sale) => (
                                                    <TableRow key={sale.id} hover>
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 600, fontSize: '12.5px' }}>
                                                            {sale.invoice_no ? (
                                                                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                                                    <InvoiceIcon fontSize="small" color="action" sx={{ fontSize: 16 }} />
                                                                    <span>{lang === 'ar' ? `فاتورة #${sale.invoice_no}` : `Invoice #${sale.invoice_no}`}</span>
                                                                </Box>
                                                            ) : sale.client_name ? sale.client_name : `Payment #${sale.daftra_payment_id}`}
                                                        </TableCell>
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontSize: '12px', color: 'text.secondary' }}>
                                                            {sale.branch_name || sale.account_name}
                                                        </TableCell>
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontSize: '13px', fontWeight: 700, color: 'success.main' }}>
                                                            <bdi>{formatCurrency(sale.amount)}</bdi> {getCurrencySymbol(sale.display_currency || baseCurrCode, lang)}
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            <Chip label={sale.payment_method || 'cash'} size="small" variant="outlined" sx={{ fontSize: '10.5px', textTransform: 'capitalize', fontWeight: 600, height: 20 }} />
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* ROW 3: CHARTS */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12} md={7}>
                    <Card sx={{ height: '100%', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                        <CardContent>
                            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                                {t.branchComparisonTitle || 'Branch Financial Performance Comparison'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                                {t.branchComparisonSubtitle || 'Comparative view of total revenues vs. cost of goods sold (COGS) per connected branch.'}
                            </Typography>
                            <Box sx={{ width: '100%', height: 260 }} dir="ltr">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={analyticsData.branchComparison || []} margin={{ top: 10, right: 20, left: 20, bottom: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
                                        <XAxis dataKey="account_name" tick={{ fontSize: 11, fill: chartAxisColor }} />
                                        <YAxis 
                                            tick={{ fontSize: 11, fill: chartAxisColor, textAnchor: 'end' }} 
                                            width={100} 
                                            tickMargin={12} 
                                            tickFormatter={(val) => formatCurrency(val)} 
                                        />
                                        <RechartsTooltip content={<CustomChartTooltip lang={lang} baseCurrCode={baseCurrCode} t={t} />} cursor={{ fill: 'transparent' }} />
                                        <Bar dataKey="revenue" name={t.revenueLabel || 'Revenue'} fill="#2e7d32" radius={[4, 4, 0, 0]} barSize={25} />
                                        <Bar dataKey="cogs"    name={t.cogsCostLabel || 'Cost of Goods Sold'} fill="#d32f2f" radius={[4, 4, 0, 0]} barSize={25} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mt: 1.5, flexWrap: 'wrap' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                                    <Box sx={{ width: 12, height: 12, bgcolor: '#2e7d32', borderRadius: 0.5 }} />
                                    <Typography variant="caption" fontWeight={600} color="text.secondary">{t.totalRevenueLabel || 'Total Revenue'}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                                    <Box sx={{ width: 12, height: 12, bgcolor: '#d32f2f', borderRadius: 0.5 }} />
                                    <Typography variant="caption" fontWeight={600} color="text.secondary">{t.cogsCostLabel || 'Cost of Goods Sold (COGS)'}</Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={5}>
                    <Card sx={{ height: '100%', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                        <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
                                {t.paymentStatusBreakdownTitle || 'Invoice Balance Distribution'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                                {t.paymentStatusBreakdownSubtitle || 'Proportional breakdown of collected cash, pending balances, and total returns.'}
                            </Typography>
                            <Box sx={{ width: '100%', height: 210, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {formattedPieData.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary">{t.noTransactions || 'No transactions'}</Typography>
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={formattedPieData}
                                                cx="50%" cy="50%"
                                                innerRadius={55} outerRadius={80}
                                                paddingAngle={4} dataKey="value"
                                            >
                                                {formattedPieData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <RechartsTooltip content={<CustomChartTooltip lang={lang} baseCurrCode={baseCurrCode} t={t} />} cursor={{ fill: 'transparent' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                )}
                            </Box>
                            <Box sx={{ mt: 'auto', pt: 1, borderTop: `1px solid ${theme.palette.divider}` }}>
                                {formattedPieData.map((item) => (
                                    <Box key={item.name} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.3 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: item.color }} />
                                            <Typography variant="caption" fontWeight={600}>{item.name}</Typography>
                                        </Box>
                                        <Typography variant="caption" fontWeight={700} color={item.color}>
                                            <bdi>{formatCurrency(item.value)}</bdi> {getCurrencySymbol(baseCurrCode, lang)}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* ROW 4: ACCOUNT PAYMENT STATUS COMPARISON + RECENT INVOICES */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12} md={6}>
                    <Card sx={{ height: '100%', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                        <CardContent>
                            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                                {t.accountPaymentStatusTitle || (lang === 'ar' ? 'مقارنة تحصيل الفواتير حسب الحساب' : 'Invoice Collection by Account')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                                {t.accountPaymentStatusSubtitle || (lang === 'ar' ? 'استعراض المبالغ المحصلة فعلياً مقابل المستحقات المتبقية لكل حساب مرتبط.' : 'Collected vs unpaid receivables for each linked workspace.')}
                            </Typography>
                            <Box sx={{ width: '100%', height: 220 }} dir="ltr">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={analyticsData.accountPaymentStatus || []} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
                                        <XAxis dataKey="account_name" tick={{ fontSize: 11, fill: chartAxisColor }} />
                                        <YAxis 
                                            tick={{ fontSize: 11, fill: chartAxisColor, textAnchor: 'end' }} 
                                            width={100} 
                                            tickMargin={12} 
                                            tickFormatter={(val) => formatCurrency(val)} 
                                        />
                                        <RechartsTooltip content={<CustomChartTooltip lang={lang} baseCurrCode={baseCurrCode} t={t} />} cursor={{ fill: 'transparent' }} />
                                        <Bar dataKey="total_paid" name={t.paidInvoicesLabel || 'Paid Revenue'} fill="#2e7d32" radius={[4, 4, 0, 0]} barSize={22} />
                                        <Bar dataKey="total_unpaid" name={t.unpaidInvoicesLabel || 'Balance Due'} fill="#ed6c02" radius={[4, 4, 0, 0]} barSize={22} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mt: 1.5, flexWrap: 'wrap' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                                    <Box sx={{ width: 12, height: 12, bgcolor: '#2e7d32', borderRadius: 0.5 }} />
                                    <Typography variant="caption" fontWeight={600} color="text.secondary">{t.paidInvoicesLabel || 'Paid Revenue'}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                                    <Box sx={{ width: 12, height: 12, bgcolor: '#ed6c02', borderRadius: 0.5 }} />
                                    <Typography variant="caption" fontWeight={600} color="text.secondary">{t.unpaidInvoicesLabel || 'Balance Due'}</Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Card sx={{ height: '100%', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="subtitle1" fontWeight={700}>{t.recentInvoices || 'Recent Invoices'}</Typography>
                                <Button size="small" onClick={() => navigate('/invoices')}>{t.viewAll || 'View All'}</Button>
                            </Box>
                            {widgetsLoading ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>
                            ) : (
                                <TableContainer component={Paper} elevation={0}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700 }}>{t.documentId  || 'Doc ID'}</TableCell>
                                                <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700 }}>{t.branchLabel || 'Branch'}</TableCell>
                                                <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700 }}>{t.totalLabel   || 'Total'}</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {widgetsData.invoices.length === 0 ? (
                                                <TableRow><TableCell colSpan={3} align="center" sx={{ py: 2, color: 'text.secondary' }}>{t.noTransactions || 'No transactions'}</TableCell></TableRow>
                                            ) : (
                                                widgetsData.invoices.map((inv) => (
                                                    <TableRow key={inv.id} hover>
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 600 }}>#{inv.invoice_no || 'N/A'}</TableCell>
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ color: 'text.secondary', fontSize: '13px' }}>{inv.account_name}</TableCell>
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, fontSize: '13px' }}>
                                                            <bdi>{formatCurrency(inv.total_amount)}</bdi> {getCurrencySymbol(inv.display_currency || inv.currency_code, lang)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* ROW 5: TOP CLIENTS + RECENT CLIENTS */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12} md={6}>
                    <Card sx={{ height: '100%', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                        <CardContent>
                            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                                {t.topClientsChartTitle || 'Top 5 Clients by Sales Volume'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                                {t.topClientsChartSubtitle || 'Aggregate invoiced sales amount per client across all connected workspaces.'}
                            </Typography>
                            <Box sx={{ width: '100%', height: 230 }} dir="ltr">
                                {analyticsData.topClients?.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 6 }}>{t.noClients || 'No clients'}</Typography>
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart 
                                            data={analyticsData.topClients?.slice(0, 5) || []} 
                                            layout="vertical" 
                                            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                                        >
                                            <XAxis type="number" hide />
                                            <YAxis
                                                dataKey="client_name"
                                                type="category"
                                                width={140}
                                                orientation="left"
                                                tickLine={false}
                                                axisLine={{ stroke: theme.palette.divider }}
                                                interval={0}
                                                tick={{ 
                                                    fontSize: 11, 
                                                    fill: chartAxisColor,
                                                    fontWeight: 600,
                                                    textAnchor: 'end'
                                                }}
                                                tickMargin={10}
                                                tickFormatter={(value) => value.length > 18 ? `${value.substring(0, 18)}...` : value}
                                            />
                                            <RechartsTooltip 
                                                content={<CustomChartTooltip lang={lang} baseCurrCode={baseCurrCode} t={t} />} 
                                                cursor={{ fill: 'transparent' }} 
                                            />
                                            <Bar dataKey="total_invoiced" fill="#1976d2" radius={[0, 4, 4, 0]} barSize={18} minPointSize={5} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Card sx={{ height: '100%', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="subtitle1" fontWeight={700}>{t.recentClients || 'Recent Clients'}</Typography>
                                <Button size="small" onClick={() => navigate('/clients')}>{t.viewAll || 'View All'}</Button>
                            </Box>
                            {widgetsLoading ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>
                            ) : (
                                <TableContainer component={Paper} elevation={0}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700 }}>{t.clientName   || 'Client Name'}</TableCell>
                                                <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700 }}>{t.branchLabel  || 'Branch'}</TableCell>
                                                <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700 }}>{t.currency     || 'Currency'}</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {widgetsData.clients.length === 0 ? (
                                                <TableRow><TableCell colSpan={3} align="center" sx={{ py: 2, color: 'text.secondary' }}>{t.noClients || 'No clients'}</TableCell></TableRow>
                                            ) : (
                                                widgetsData.clients.map((cli) => (
                                                    <TableRow key={cli.id} hover>
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 600 }}>{cli.client_name}</TableCell>
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ color: 'text.secondary', fontSize: '13px' }}>{cli.account_name}</TableCell>
                                                        <TableCell align={isRtl ? 'right' : 'left'}>
                                                            <Chip label={getCurrencyFullName(cli.currency, lang)} size="small" variant="outlined" sx={{ fontSize: '11px', fontWeight: 600 }} />
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Connected Branches Directory */}
            <Card sx={{ mb: 3, boxShadow: '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="subtitle1" fontWeight={700}>
                            {t.latestBranchesTitle || 'Connected Workspaces'}
                        </Typography>
                        <Button size="small" onClick={() => navigate('/accounts')}>
                            {t.viewAllBranches || 'View All'}
                        </Button>
                    </Box>

                    <TableContainer component={Paper} elevation={0}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700 }}>{t.branchName || 'Branch'}</TableCell>
                                    <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700 }}>{t.subdomain  || 'Subdomain'}</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }} align="center">{t.status || 'Status'}</TableCell>
                                    <TableCell align={isRtl ? 'left' : 'right'} sx={{ fontWeight: 700 }}>{t.action || 'Action'}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {accounts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                            {t.noAccountsConnected || 'No workspace connected'}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    accounts.slice(0, 5).map((acc) => (
                                        <TableRow key={acc.id} hover>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 600 }}>{acc.account_name}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ color: 'text.secondary' }}>{acc.daftra_subdomain}</TableCell>
                                            <TableCell align="center">
                                                {renderStatusChip(acc.sync_status)}
                                            </TableCell>
                                            <TableCell align={isRtl ? 'left' : 'right'}>
                                                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                                                    <Tooltip title={t.viewLocalizedDashboard || 'View Branch'}>
                                                        <Button
                                                            size="small"
                                                            endIcon={<ArrowForwardIcon fontSize="small" sx={isRtl ? { transform: 'scaleX(-1)' } : undefined} />}
                                                            onClick={() => navigate(`/dashboard/branch/${acc.id}`, { state: { accountName: acc.account_name } })}
                                                        >
                                                            {t.view || 'View'}
                                                        </Button>
                                                    </Tooltip>
                                                    <Tooltip title={t.unlinkBranch || 'Disconnect'}>
                                                        <IconButton size="small" color="error" onClick={() => triggerDeleteConfirmation(acc.id, acc.account_name)}>
                                                            <DeleteOutlineIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </CardContent>
            </Card>

            {/* Modals & Dialogs */}
            <AddAccountModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                userId={userId}
                onAccountAdded={handleAccountAddedLocally}
            />

            <Snackbar
                open={localSnackbar.open}
                autoHideDuration={4000}
                onClose={() => setLocalSnackbar({ ...localSnackbar, open: false })}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert severity={localSnackbar.severity} variant="filled" sx={{ width: '100%', fontWeight: 600 }}>
                    {localSnackbar.message}
                </Alert>
            </Snackbar>

            <Dialog open={confirmGlobalSyncOpen} onClose={() => setConfirmGlobalSyncOpen(false)} dir={t.dir}>
                <DialogTitle fontWeight={700}>{t.confirmSyncTitle || 'Confirm Data Synchronization'}</DialogTitle>
                <DialogContent>
                    <DialogContentText fontSize="14px">
                        {t.confirmGlobalSyncBody || 'Updating ledger states across all multi-tenant branches will initiate background sequence tasks fetching transaction logs. Do you want to proceed?'}
                    </DialogContentText>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button size="small" onClick={() => setConfirmGlobalSyncOpen(false)}>{t.cancel || 'Cancel'}</Button>
                    <Button size="small" onClick={handleForceSystemSync} color="primary" variant="contained" disableElevation>{t.confirmAndSync || 'Sync Now'}</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, accountId: null, accountName: '' })} dir={t.dir}>
                <DialogTitle fontWeight={700}>{t.areYouSure || 'Are you sure?'}</DialogTitle>
                <DialogContent>
                    <DialogContentText fontSize="14px">
                        {t.unlinkConfirmText || 'Do you want to disconnect workspace'}{' '}
                        <strong style={{ color: '#ef4444' }}>{deleteDialog.accountName}</strong>
                    </DialogContentText>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button size="small" onClick={() => setDeleteDialog({ open: false, accountId: null, accountName: '' })}>{t.cancel || 'Cancel'}</Button>
                    <Button size="small" onClick={executeDeleteAccount} color="error" variant="contained" disableElevation>{t.yesDelete || 'Disconnect'}</Button>
                </DialogActions>
            </Dialog>
        </Layout>
    );
};

export default GlobalDashboard;