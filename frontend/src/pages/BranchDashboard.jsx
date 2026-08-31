import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { 
    ArrowBackRounded as ArrowBackIcon, 
    SyncRounded as SyncIcon,
    AssessmentRounded as ReportIcon,
    AccountBalanceWalletRounded as WalletIcon,
    ReceiptLongRounded as InvoiceIcon
} from '@mui/icons-material';
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
    CircularProgress,
    FormControl,
    Select,
    MenuItem,
    Backdrop,
    Snackbar,
    Alert,
    LinearProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    useTheme,
    alpha
} from '@mui/material';
import { 
    PieChart, 
    Pie, 
    Cell, 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    Tooltip as RechartsTooltip, 
    ResponsiveContainer 
} from 'recharts';
import API from '../services/api';
import Layout from '../components/Layout';
import { useLanguage } from '../LanguageContext';
import { formatCurrency } from '../utils/formatters';
import { getCurrencySymbol, getCurrencyFullName } from '../i18n/currencies';

const getStatusMap = (t) => ({
    0: { label: t.statusUnpaid || 'Unpaid', color: 'warning' },
    1: { label: t.statusPartial || 'Partially Paid', color: 'info' },
    2: { label: t.statusPaid || 'Paid', color: 'success' },
    3: { label: t.statusReturned || 'Returned', color: 'error' },
});

const PaymentStatusChip = ({ statusId, t }) => {
    const statusMap = getStatusMap(t);
    const status = statusMap[parseInt(statusId, 10)] || { label: t.statusUnknown || 'Unknown', color: 'default' };
    return <Chip label={status.label} color={status.color} size="small" variant="outlined" />;
};

const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
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
                    const fieldLabel = isQty 
                        ? (t?.netSoldQtyLabel || 'Net Sold Qty') 
                        : (t?.totalInvoicedLabel || 'Total Invoiced');

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

const BranchDashboard = () => {
    const { accountId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const theme = useTheme();
    const { t, lang } = useLanguage();
    const isRtl = lang === 'ar' || t.dir === 'rtl';
    const userId = localStorage.getItem('userId');

    const branchName = location.state?.accountName || t.localizedBranchWorkspace || 'Branch Workspace';

    const [loading, setLoading] = useState(true);
    const [localSyncLoading, setLocalSyncLoading] = useState(false);
    const [rawMetrics, setRawMetrics] = useState({}); 
    const [selectedCurrency, setSelectedCurrency] = useState('ALL');
    const [activeTargetCurrency, setActiveTargetCurrency] = useState('DEFAULT');

    const [analyticsData, setAnalyticsData] = useState({
        summary: {},
        treasuries: [],
        paymentStatusBreakdown: [],
        topClients: []
    });

    const [branchWidgets, setBranchWidgets] = useState({ invoices: [], clients: [] });
    const [widgetsLoading, setWidgetsLoading] = useState(true);

    const [recentSales, setRecentSales] = useState([]);
    const [salesBreakdown, setSalesBreakdown] = useState([]);
    const [salesLoading, setSalesLoading] = useState(true);

    const [topProducts, setTopProducts] = useState([]);
    const [recentProducts, setRecentProducts] = useState([]);
    const [productsLoading, setProductsLoading] = useState(true);

    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [syncJobId, setSyncJobId] = useState(null);
    const [jobStatus, setJobStatus] = useState(null);
    const [confirmSyncOpen, setConfirmSyncOpen] = useState(false);

    // 🎯 جلب إعدادات العملة الموحدة مع قراءة الـ localStorage أولاً لضمان التطابق
    const fetchCurrencySettings = useCallback(async () => {
        try {
            const res = await API.get(`/currency/settings/${userId}`);
            const { is_unified_enabled, active_currency } = res.data || {};
            const savedLocalCurr = localStorage.getItem('hub_active_currency');
            
            if (is_unified_enabled) {
                const currentActive = savedLocalCurr || active_currency || 'DEFAULT';
                setActiveTargetCurrency(currentActive);
            } else {
                setActiveTargetCurrency('DEFAULT');
            }
        } catch (err) {
            console.error('Error fetching user currency settings:', err);
        }
    }, [userId]);

    const fetchBranchAnalytics = useCallback(async () => {
        try {
            const params = {};
            if (selectedCurrency !== 'ALL') params.currency = selectedCurrency;
            if (activeTargetCurrency !== 'DEFAULT') params.targetCurrency = activeTargetCurrency;

            const res = await API.get(`/financial/branch/${accountId}/analytics`, { params });
            if (res.data) {
                setAnalyticsData(res.data);
            }
        } catch (err) {
            console.error('Error loading branch analytics visualization dataset:', err);
        }
    }, [accountId, selectedCurrency, activeTargetCurrency]);

    const fetchBranchWidgetsData = useCallback(async () => {
        setWidgetsLoading(true);
        try {
            const params = {};
            if (activeTargetCurrency !== 'DEFAULT') params.targetCurrency = activeTargetCurrency;

            const response = await API.get(`/financial/branch/recent-widgets/${accountId}`, { params });
            if (response.data) {
                setBranchWidgets({
                    invoices: response.data.invoices || [],
                    clients: response.data.clients || []
                });
            }
        } catch (err) {
            console.error('Error fetching dynamic branch recent elements:', err);
        } finally {
            setWidgetsLoading(false);
        }
    }, [accountId, activeTargetCurrency]);

    // 🎯 جلب أحدث مبيعات الفرع مع تمرير accountId حظرياً بدون إرسال userId حتى لا يُلغى فلتر الفرع
    const fetchRecentSalesWidgetData = useCallback(async () => {
        setSalesLoading(true);
        try {
            const params = { accountId };
            if (activeTargetCurrency !== 'DEFAULT') params.targetCurrency = activeTargetCurrency;

            const response = await API.get('/financial/widgets/sales', { params });
            if (response.data) {
                setRecentSales(response.data.recentSales || []);
                setSalesBreakdown(response.data.salesBreakdown || []);
            }
        } catch (err) {
            console.error('Error loading branch sales widget data:', err);
        } finally {
            setSalesLoading(false);
        }
    }, [accountId, activeTargetCurrency]);

    const fetchProductsSectionData = useCallback(async () => {
        setProductsLoading(true);
        try {
            const params = {};
            if (activeTargetCurrency !== 'DEFAULT') params.targetCurrency = activeTargetCurrency;

            const [topRes, recentRes] = await Promise.all([
                API.get(`/products/account/${accountId}/top-5`, { params }),
                API.get(`/products/account/${accountId}/list?limit=5`, { params })
            ]);

            if (topRes.data && topRes.data.success) {
                setTopProducts(topRes.data.data || []);
            }
            if (recentRes.data && recentRes.data.success) {
                setRecentProducts(recentRes.data.data || []);
            }
        } catch (err) {
            console.error('Error loading products dashboard widget:', err);
        } finally {
            setProductsLoading(false);
        }
    }, [accountId, activeTargetCurrency]);

    const fetchBranchData = useCallback(async () => {
        setLoading(true);
        try {
            await fetchCurrencySettings();
            const metricsRes = await API.get(`/financial/branch/${accountId}/summary`);
            if (metricsRes.data) {
                const wrappedData = metricsRes.data.total_revenue !== undefined 
                    ? { [metricsRes.data.currency_code || 'EGP']: metricsRes.data } 
                    : metricsRes.data;
                setRawMetrics(wrappedData);
            }
            await Promise.all([
                fetchBranchWidgetsData(),
                fetchRecentSalesWidgetData(),
                fetchBranchAnalytics(),
                fetchProductsSectionData()
            ]);
        } catch (err) {
            console.error('Error loading localized branch environment:', err);
        } finally {
            setLoading(false);
        }
    }, [accountId, fetchCurrencySettings, fetchBranchWidgetsData, fetchRecentSalesWidgetData, fetchBranchAnalytics, fetchProductsSectionData]);

    useEffect(() => {
        if (accountId) {
            fetchBranchData();
        }
    }, [accountId, selectedCurrency, fetchBranchData]);

    useEffect(() => {
        let pollingInterval = null;
        if (syncJobId) {
            pollingInterval = setInterval(async () => {
                try {
                    const res = await API.get(`/auth/sync-status/${syncJobId}`, { showLoader: false });
                    const job = res.data;
                    setJobStatus(job);

                    if (job.status === 'completed') {
                        clearInterval(pollingInterval);
                        setLocalSyncLoading(false);
                        setSyncJobId(null);
                        setJobStatus(null);
                        fetchBranchData(); 
                        setSnackbar({ open: true, message: t.synchronizedSuccess || 'Branch records synchronized successfully!', severity: 'success' });
                    } else if (job.status === 'failed') {
                        clearInterval(pollingInterval);
                        setLocalSyncLoading(false);
                        setSyncJobId(null);
                        setJobStatus(null);
                        setSnackbar({ open: true, message: job.error_message || t.syncFailed || 'Synchronization failed', severity: 'error' });
                    }
                } catch (pollErr) {
                    console.error("Branch telemetry track step failure:", pollErr.message);
                }
            }, 1500);
        }
        return () => {
            if (pollingInterval) clearInterval(pollingInterval);
        };
    }, [syncJobId, fetchBranchData, t]);

    const handleIsolatedBranchSyncTrigger = () => {
        setConfirmSyncOpen(true);
    };

    const handleIsolatedBranchSync = async () => {
        setConfirmSyncOpen(false); 
        setLocalSyncLoading(true);
        setJobStatus(null);
        try {
            const response = await API.post(`/financial/sync-branch/${accountId}`, {}, { showLoader: false });
            if (response.data?.backgroundJobLaunched) {
                setSyncJobId(response.data.jobId);
            }
        } catch (err) {
            console.error('Isolated branch context synchronization failure node:', err);
            setSnackbar({ 
                open: true, 
                message: err.response?.data?.error || t.syncFailed || 'Sync failed', 
                severity: 'error' 
            });
            setLocalSyncLoading(false);
        }
    };

    const renderBranchSyncStepLabel = (step) => {
        const stepMessages = {
            initializing: t.stepInitializing,
            fetching_clients: t.stepClients,
            fetching_invoices: t.stepInvoices,
            fetching_expenses: t.stepExpenses,
            fetching_incomes: t.stepIncomes,
            final_rollup: t.stepRollup,
        };
        return stepMessages[step] || t.stepGeneric;
    };

    const backArrow = <ArrowBackIcon sx={isRtl ? { transform: 'scaleX(-1)' } : undefined} />;
    const backIconProps = isRtl ? { endIcon: backArrow } : { startIcon: backArrow };
    const refreshIconProps = isRtl ? { endIcon: <SyncIcon /> } : { startIcon: <SyncIcon /> };

    const activeSummary = analyticsData.summary || {};
    
    // 🎯 قراءة رمز العملة الديناميكي الموثوق من بيانات الحساب المسجلة
    const nativeAccountCurrency = analyticsData.summary?.account_currency || Object.keys(rawMetrics)[0] || 'EGP';
    const baseCurrCode = activeTargetCurrency !== 'DEFAULT'
        ? activeTargetCurrency
        : (selectedCurrency !== 'ALL' ? selectedCurrency : nativeAccountCurrency).toUpperCase();

    const treasuriesList = analyticsData.treasuries || [];
    const totalTreasuryInflow = treasuriesList.reduce((acc, row) => acc + parseFloat(row.today_inflow || 0) + parseFloat(row.opening_balance || 0), 0);
    const totalTreasuryOutflow = treasuriesList.reduce((acc, row) => acc + parseFloat(row.today_outflow || 0), 0);
    const totalTreasuryClosing = treasuriesList.reduce((acc, row) => acc + parseFloat(row.closing_balance || 0), 0);

    const totalPaidCalculated = parseFloat(activeSummary.total_paid || 0);
    const totalUnpaidCalculated = parseFloat(activeSummary.total_unpaid || 0);
    const totalReturnsCalculated = parseFloat(activeSummary.total_returns || 0);

    const formattedPieData = [
        { name: t.statusPaid || 'Paid', value: totalPaidCalculated, color: '#2e7d32' },
        { name: t.statusUnpaid || 'Unpaid / Due', value: totalUnpaidCalculated, color: '#ed6c02' },
        { name: t.statusReturned || 'Returned / Refunded', value: totalReturnsCalculated, color: '#d32f2f' }
    ].filter(item => item.value > 0);

    const PIE_COLORS = ['#1976d2', '#2e7d32', '#ed6c02', '#9c27b0', '#00bcd4'];

    const chartAxisColor = theme.palette.text.secondary;

    return (
        <Layout title={branchName} subtitle={`${t.localizedWorkspaceId || 'Branch ID'}: #${accountId}`}>
            <Backdrop open={localSyncLoading} sx={{ zIndex: 9999, color: '#fff', flexDirection: 'column', gap: 3, p: 4 }}>
                <Box sx={{ width: '100%', maxWidth: 400, textAlign: 'center', p: 3, bgcolor: 'background.paper', borderRadius: 3, color: 'text.primary', boxShadow: 24 }}>
                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'center' }}>
                        <CircularProgress size={32} thickness={5} />
                    </Box>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
                        {t.refreshLocalLedger || 'Refreshing Branch Ledger'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3, minHeight: 20, fontSize: '13px' }}>
                        {jobStatus ? renderBranchSyncStepLabel(jobStatus.current_step) : t.stepPreparing}
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

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    <Button {...backIconProps} onClick={() => navigate('/dashboard')} size="small">
                        {t.backToGlobal || 'Back to Global Workspace'}
                    </Button>

                    {!loading && Object.keys(rawMetrics).length > 0 && (
                        <FormControl size="small">
                            <Select
                                id="branch-currency-filter"
                                value={selectedCurrency}
                                onChange={(e) => setSelectedCurrency(e.target.value)}
                                sx={{ 
                                    fontSize: '12px', 
                                    height: '32px', 
                                    fontWeight: 600,
                                    borderRadius: '6px',
                                    minWidth: '150px',
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
                    )}
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    <Button
                        variant="outlined"
                        color="primary"
                        startIcon={<WalletIcon />}
                        onClick={() => navigate(`/treasuries?accountId=${accountId}`)}
                        size="small"
                        sx={{ textTransform: 'none', fontWeight: 600 }}
                    >
                        {t.navTreasuries || 'Treasuries & Bank Accounts'}
                    </Button>

                    <Button
                        variant="contained"
                        color="primary"
                        disableElevation
                        startIcon={<ReportIcon />}
                        onClick={() => navigate(`/financial-report?accountId=${accountId}`)}
                        size="small"
                        sx={{ textTransform: 'none', fontWeight: 600 }}
                    >
                        {t.viewFinancialReport || 'Financial Statement'}
                    </Button>

                    <Button
                        variant="outlined"
                        {...refreshIconProps}
                        onClick={handleIsolatedBranchSyncTrigger}
                        size="small"
                        disabled={loading || localSyncLoading}
                    >
                        {t.refreshLocalLedger || 'Sync Branch'}
                    </Button>
                </Box>
            </Box>

            {loading ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8, gap: 2 }}>
                    <CircularProgress />
                    <Typography variant="body2" color="text.secondary">
                        {t.compilingSheets || 'Compiling branch financial metrics...'}
                    </Typography>
                </Box>
            ) : (
                <>
                    <Grid container spacing={2.5} sx={{ mb: 3 }}>
                        <Grid item xs={12} md={8}>
                            <Card sx={{ height: '100%', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2, display: 'flex', flexDirection: 'column' }}>
                                <CardContent sx={{ p: 2.5, flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
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

                                    <Grid container spacing={2} sx={{ bgcolor: alpha(theme.palette.action.hover, 0.05), p: 2.5, borderRadius: 2, border: `1px solid ${theme.palette.divider}`, my: 'auto' }}>
                                        <Grid item xs={4}>
                                            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', fontSize: '12px' }}>
                                                {t.inflowOpening || 'Total Inflow + Opening'}
                                            </Typography>
                                            <Typography variant="h6" fontWeight={700} color="success.main" sx={{ fontSize: '18px', mt: 0.5 }}>
                                                <bdi>{formatCurrency(totalTreasuryInflow)}</bdi> {getCurrencySymbol(baseCurrCode, lang)}
                                            </Typography>
                                        </Grid>
                                        <Grid item xs={4}>
                                            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', fontSize: '12px' }}>
                                                {t.outflow || 'Total Outflow'}
                                            </Typography>
                                            <Typography variant="h6" fontWeight={700} color="error.main" sx={{ fontSize: '18px', mt: 0.5 }}>
                                                <bdi>{formatCurrency(totalTreasuryOutflow)}</bdi> {getCurrencySymbol(baseCurrCode, lang)}
                                            </Typography>
                                        </Grid>
                                        <Grid item xs={4}>
                                            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', fontSize: '12px' }}>
                                                {t.liveDrawerBalance || 'Total Cash in Drawer'}
                                            </Typography>
                                            <Typography variant="h6" fontWeight={700} color="primary.main" sx={{ fontSize: '18px', mt: 0.5 }}>
                                                <bdi>{formatCurrency(totalTreasuryClosing)}</bdi> {getCurrencySymbol(baseCurrCode, lang)}
                                            </Typography>
                                        </Grid>
                                    </Grid>
                                </CardContent>
                            </Card>
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <Card sx={{ bgcolor: theme.palette.primary.main, color: '#fff', height: '100%', boxShadow: '0 4px 16px rgba(25, 118, 210, 0.2)', borderRadius: 2, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <CardContent sx={{ textAlign: 'center', py: 3 }}>
                                    <Typography variant="overline" sx={{ fontWeight: 700, opacity: 0.9, letterSpacing: 1.1, fontSize: '12px' }}>
                                        {t.netOperatingProfit30Days || "NET OPERATING PROFIT"}
                                    </Typography>
                                    <Typography variant="h3" fontWeight={800} sx={{ my: 1.5, fontSize: { xs: '28px', md: '36px' } }}>
                                        <bdi>{formatCurrency(activeSummary.net_profit)}</bdi>
                                    </Typography>
                                    <Typography variant="subtitle2" fontWeight={700} sx={{ opacity: 0.9 }}>
                                        {getCurrencySymbol(baseCurrCode, lang)}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>

                    <Grid container spacing={2.5} sx={{ mb: 3 }}>
                        <Grid item xs={12} md={4}>
                            <Card sx={{ borderLeft: '4px solid', borderLeftColor: 'success.main', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', borderRadius: 2 }}>
                                <CardContent sx={{ p: 2.5 }}>
                                    <Typography variant="overline" color="text.secondary" fontWeight={700} sx={{ fontSize: '11px', letterSpacing: 0.5 }}>
                                        {t.totalInvoicesRevenueIncTax || "TOTAL INVOICES REVENUE (INC. TAX)"}
                                    </Typography>
                                    <Box sx={{ mt: 1, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                                        <Typography variant="h4" fontWeight={800} color="success.main" sx={{ fontSize: '26px' }}>
                                            <bdi>{formatCurrency(activeSummary.invoices_revenue)}</bdi>
                                        </Typography>
                                        <Typography variant="subtitle2" fontWeight={700} color="text.secondary">
                                            {getCurrencySymbol(baseCurrCode, lang)}
                                        </Typography>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <Card sx={{ borderLeft: '4px solid', borderLeftColor: 'warning.main', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', borderRadius: 2 }}>
                                <CardContent sx={{ p: 2.5 }}>
                                    <Typography variant="overline" color="text.secondary" fontWeight={700} sx={{ fontSize: '11px', letterSpacing: 0.5 }}>
                                        {t.outstandingReceivablesDue || "OUTSTANDING RECEIVABLES (DUE)"}
                                    </Typography>
                                    <Box sx={{ mt: 1, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                                        <Typography variant="h4" fontWeight={800} color="warning.main" sx={{ fontSize: '26px' }}>
                                            <bdi>{formatCurrency(activeSummary.total_unpaid)}</bdi>
                                        </Typography>
                                        <Typography variant="subtitle2" fontWeight={700} color="text.secondary">
                                            {getCurrencySymbol(baseCurrCode, lang)}
                                        </Typography>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <Card sx={{ borderLeft: '4px solid', borderLeftColor: 'error.main', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', borderRadius: 2 }}>
                                <CardContent sx={{ p: 2.5 }}>
                                    <Typography variant="overline" color="text.secondary" fontWeight={700} sx={{ fontSize: '11px', letterSpacing: 0.5 }}>
                                        {t.totalReturnsLabel || "TOTAL RETURNS"}
                                    </Typography>
                                    <Box sx={{ mt: 1, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                                        <Typography variant="h4" fontWeight={800} color="error.main" sx={{ fontSize: '26px' }}>
                                            <bdi>{formatCurrency(activeSummary.total_returns)}</bdi>
                                        </Typography>
                                        <Typography variant="subtitle2" fontWeight={700} color="text.secondary">
                                            {getCurrencySymbol(baseCurrCode, lang)}
                                        </Typography>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>

                    {/* 🎯 قسم المبيعات الجديد الخاص بالفرع */}
                    <Grid container spacing={3} sx={{ mb: 3 }}>
                        {/* 1. Sales Collection Breakdown Donut Chart */}
                        <Grid item xs={12} md={6}>
                            <Card sx={{ height: '100%', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                                <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                                    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
                                        {t.salesBreakdownChartTitle || (lang === 'ar' ? 'نسب توزيع المبيعات المحصلة' : 'Sales Collection Breakdown')}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                                        {t.salesBreakdownChartSubtitle || (lang === 'ar' ? 'نسبة توزيع المبيعات بحسب طريقة تحصيل الأموال بفرعك' : 'Proportional breakdown of collected sales per payment method.')}
                                    </Typography>

                                    <Box sx={{ width: '100%', height: 210, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {salesLoading ? (
                                            <CircularProgress size={24} />
                                        ) : salesBreakdown.length === 0 ? (
                                            <Typography variant="body2" color="text.secondary">{t.noTransactions || 'No sales available'}</Typography>
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
                                        <Button size="small" onClick={() => navigate(`/payments?accountId=${accountId}`)}>
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
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700 }}>{t.totalAmount || 'Total'}</TableCell>
                                                        <TableCell sx={{ fontWeight: 700 }} align="center">{t.paymentMethod || 'Method'}</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {recentSales.length === 0 ? (
                                                        <TableRow><TableCell colSpan={3} align="center" sx={{ color: 'text.secondary', py: 2 }}>{t.noTransactions || 'No sales recorded'}</TableCell></TableRow>
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

                    <Grid container spacing={3} sx={{ mb: 3 }}>
                        <Grid item xs={12} md={6}>
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
                                            <Typography variant="body2" color="text.secondary">{t.noTransactions || 'No transactions available'}</Typography>
                                        ) : (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={formattedPieData}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={55}
                                                        outerRadius={80}
                                                        paddingAngle={4}
                                                        dataKey="value"
                                                    >
                                                        {formattedPieData.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.color} />
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

                        <Grid item xs={12} md={6}>
                            <Card sx={{ height: '100%', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                                <CardContent>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                        <Typography variant="subtitle1" fontWeight={700}>{t.recentInvoices || 'Recent Invoices'}</Typography>
                                        <Button size="small" onClick={() => navigate(`/invoices?accountId=${accountId}`)}>{t.viewAll || 'View All'}</Button>
                                    </Box>
                                    {widgetsLoading ? (
                                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>
                                    ) : (
                                        <TableContainer component={Paper} elevation={0}>
                                            <Table size="small">
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700 }}>{t.documentId || 'Invoice #'}</TableCell>
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700 }}>{t.totalAmount || 'Total'}</TableCell>
                                                        <TableCell sx={{ fontWeight: 700 }} align="center">{t.status || 'Status'}</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {branchWidgets.invoices.length === 0 ? (
                                                        <TableRow><TableCell colSpan={3} align="center" sx={{ color: 'text.secondary', py: 2 }}>{t.noTransactions || 'No transactions available'}</TableCell></TableRow>
                                                    ) : (
                                                        branchWidgets.invoices.map((inv) => (
                                                            <TableRow key={inv.id} hover>
                                                                <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 600 }}>#{inv.invoice_no || 'N/A'}</TableCell>
                                                                <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontSize: '13px', fontWeight: 700 }}>
                                                                    <bdi>{formatCurrency(inv.total_amount)}</bdi> {getCurrencySymbol(inv.display_currency || inv.currency_code || baseCurrCode, lang)}
                                                                </TableCell>
                                                                <TableCell align="center"><PaymentStatusChip statusId={inv.payment_status} t={t} /></TableCell>
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

                    <Grid container spacing={3} sx={{ mb: 3 }}>
                        {/* Top Clients Bar Chart */}
                        <Grid item xs={12} md={6}>
                            <Card sx={{ height: '100%', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                                <CardContent>
                                    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                                        {t.topClientsChartTitle || 'Top 5 Clients by Volume'}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                                        {t.topClientsChartSubtitle || 'Aggregate invoiced sales amount per client in this branch.'}
                                    </Typography>

                                    <Box sx={{ width: '100%', height: 230 }} dir="ltr">
                                        {analyticsData.topClients?.length === 0 ? (
                                            <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 6 }}>{t.noClients || 'No clients found'}</Typography>
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
                                                        tickFormatter={(val) => val.length > 18 ? `${val.substring(0, 18)}...` : val}
                                                    />
                                                    <RechartsTooltip 
                                                        content={<CustomChartTooltip lang={lang} baseCurrCode={baseCurrCode} t={t} />} 
                                                        cursor={{ fill: 'transparent' }} 
                                                    />
                                                    <Bar 
                                                        dataKey="total_invoiced" 
                                                        fill="#1976d2" 
                                                        radius={[0, 4, 4, 0]} 
                                                        barSize={18} 
                                                        minPointSize={5}
                                                    />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        )}
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Recent Clients Table */}
                        <Grid item xs={12} md={6}>
                            <Card sx={{ height: '100%', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                                <CardContent>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                        <Typography variant="subtitle1" fontWeight={700}>{t.recentClients || 'Recent Clients'}</Typography>
                                        <Button size="small" onClick={() => navigate(`/clients?accountId=${accountId}`)}>{t.viewAll || 'View All'}</Button>
                                    </Box>
                                    {widgetsLoading ? (
                                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>
                                    ) : (
                                        <TableContainer component={Paper} elevation={0}>
                                            <Table size="small">
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700 }}>{t.clientName || 'Client Name'}</TableCell>
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700 }}>{t.currency || 'Currency'}</TableCell>
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700 }}>{t.createdAt || 'Created At'}</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {branchWidgets.clients.length === 0 ? (
                                                        <TableRow><TableCell colSpan={3} align="center" sx={{ color: 'text.secondary', py: 2 }}>{t.noClients || 'No clients found'}</TableCell></TableRow>
                                                    ) : (
                                                        branchWidgets.clients.map((cli) => (
                                                            <TableRow key={cli.id} hover>
                                                                <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 600, fontSize: '13px' }}>{cli.client_name}</TableCell>
                                                                <TableCell align={isRtl ? 'right' : 'left'}>
                                                                    <Chip label={getCurrencyFullName(cli.currency || baseCurrCode, lang)} size="small" variant="outlined" sx={{ fontSize: '11px', fontWeight: 600 }} />
                                                                </TableCell>
                                                                <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontSize: '12px', color: 'text.secondary' }}>
                                                                    <bdi>{formatDate(cli.daftra_created_at || cli.created_at)}</bdi>
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

                    <Grid container spacing={3} sx={{ mb: 3 }}>
                        {/* Top 5 Sold Products Chart */}
                        <Grid item xs={12} md={6}>
                            <Card sx={{ height: '100%', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                                <CardContent>
                                    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
                                        {t.topProductsTitle || 'Top 5 Sold Products (Last 30 Days)'}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                                        {t.topProductsSubtitle || 'Best selling products by net quantity sold'}
                                    </Typography>

                                    <Box sx={{ width: '100%', height: 230 }} dir="ltr">
                                        {productsLoading ? (
                                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={24} /></Box>
                                        ) : topProducts.length === 0 ? (
                                            <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 6 }}>{t.noTransactions || 'No products sold'}</Typography>
                                        ) : (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart 
                                                    data={topProducts?.slice(0, 5) || []} 
                                                    layout="vertical" 
                                                    margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                                                >
                                                    <XAxis type="number" hide />
                                                    <YAxis 
                                                        dataKey="product_name" 
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
                                                        tickFormatter={(val) => val.length > 18 ? `${val.substring(0, 18)}...` : val}
                                                    />
                                                    <RechartsTooltip 
                                                        content={<CustomChartTooltip lang={lang} baseCurrCode={baseCurrCode} isQty t={t} />} 
                                                        cursor={{ fill: 'transparent' }} 
                                                    />
                                                    <Bar 
                                                        dataKey="total_sold_qty" 
                                                        fill={theme.palette.primary.main} 
                                                        radius={[0, 4, 4, 0]} 
                                                        barSize={18} 
                                                        minPointSize={5}
                                                    />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        )}
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Recent Products Table */}
                        <Grid item xs={12} md={6}>
                            <Card sx={{ height: '100%', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                                <CardContent>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                        <div>
                                            <Typography variant="subtitle1" fontWeight={700}>{t.recentProductsTitle || 'Recent Products'}</Typography>
                                            <Typography variant="caption" color="text.secondary">{t.recentProductsSubtitle || 'Overview of inventory'}</Typography>
                                        </div>
                                        <Button size="small" onClick={() => navigate(`/dashboard/branch/${accountId}/products`)}>{t.viewAll || 'View All'}</Button>
                                    </Box>

                                    {productsLoading ? (
                                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>
                                    ) : (
                                        <TableContainer component={Paper} elevation={0}>
                                            <Table size="small">
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700 }}>{t.productName || 'Product'}</TableCell>
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700 }}>{t.branchLabel || 'Branch'}</TableCell>
                                                        <TableCell sx={{ fontWeight: 700 }} align="center">{t.soldQty || 'Sold'}</TableCell>
                                                        <TableCell sx={{ fontWeight: 700 }} align="center">{t.availableStock || 'Available'}</TableCell>
                                                        <TableCell sx={{ fontWeight: 700 }} align="center">{t.pendingStock || 'Pending'}</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {recentProducts.length === 0 ? (
                                                        <TableRow><TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 2 }}>{t.noTransactions || 'No products found'}</TableCell></TableRow>
                                                    ) : (
                                                        recentProducts.map((p) => (
                                                            <TableRow key={p.daftra_product_id} hover>
                                                                <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 600, fontSize: '13px' }}>{p.product_name}</TableCell>
                                                                <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontSize: '12px', color: 'text.secondary' }}>{p.branch_name}</TableCell>
                                                                <TableCell align="center" sx={{ fontWeight: 700, color: 'primary.main' }}><bdi>{p.total_sold_qty}</bdi></TableCell>
                                                                <TableCell align="center" sx={{ fontWeight: 700, color: 'success.main' }}><bdi>{p.available_stock}</bdi></TableCell>
                                                                <TableCell align="center" sx={{ fontWeight: 700, color: 'warning.main' }}><bdi>{p.pending_stock}</bdi></TableCell>
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
                </>
            )}

            <Dialog open={confirmSyncOpen} onClose={() => setConfirmSyncOpen(false)} dir={t.dir}>
                <DialogTitle fontWeight={700}>{t.confirmSyncTitle || 'Confirm Data Synchronization'}</DialogTitle>
                <DialogContent>
                    <DialogContentText fontSize="14px">
                        {t.confirmSyncBody || 'Updating ledger states requires fetching and mapping historical logs directly from Daftra APIs. For active environments, this might take some time. Would you like to proceed?'}
                    </DialogContentText>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button size="small" onClick={() => setConfirmSyncOpen(false)}>{t.cancel || 'Cancel'}</Button>
                    <Button size="small" onClick={handleIsolatedBranchSync} color="primary" variant="contained" disableElevation>{t.confirmAndSync || 'Sync Now'}</Button>
                </DialogActions>
            </Dialog>

            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
                <Alert severity={snackbar.severity} variant="filled" onClose={() => setSnackbar({ ...snackbar, open: false })} sx={{ width: '100%', fontWeight: 600 }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Layout>
    );
};

export default BranchDashboard;