import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
    Box,
    Grid,
    Card,
    CardContent,
    Typography,
    Button,
    Paper,
    Chip,
    CircularProgress,
    Table,
    TableBody,
    TableCell,
    TableRow,
    TableContainer,
    Alert,
    Snackbar,
    useTheme,
    alpha
} from '@mui/material';
import {
    ArrowBackRounded as ArrowBackIcon,
    PrintRounded as PrintIcon,
    RefreshRounded as RefreshIcon,
    AccountBalanceWalletRounded as WalletIcon,
    TrendingUpRounded as IncomeIcon,
    TrendingDownRounded as ExpenseIcon,
    ReceiptLongRounded as ReportHeaderIcon,
    CalendarTodayRounded as CalendarIcon
} from '@mui/icons-material';
import API from '../services/api';
import Layout from '../components/Layout';
import { useLanguage } from '../LanguageContext';
import { getCurrencyFullName, getCurrencySymbol } from '../i18n/currencies';

const formatCurrency = (val) => {
    const num = parseFloat(val || 0);
    return num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

const FinancialReportPage = () => {
    const navigate = useNavigate();
    const theme = useTheme();
    const [searchParams] = useSearchParams();
    const { t, lang } = useLanguage();
    const isRtl = lang === 'ar' || t.dir === 'rtl';

    const accountId = searchParams.get('accountId');
    const userId = localStorage.getItem('userId');

    const [loading, setLoading] = useState(true);
    const [syncingChart, setSyncingChart] = useState(false);
    const [summaryByCurrency, setSummaryByCurrency] = useState({});
    const [activeTargetCurrency, setActiveTargetCurrency] = useState('DEFAULT');

    const [alertInfo, setAlertInfo] = useState({ open: false, message: '', severity: 'success' });

    // جلب إعدادات العملة الموحدة مع القراءة الذكية من local storage
    const fetchCurrencySettings = useCallback(async () => {
        try {
            const res = await API.get(`/currency/settings/${userId}`);
            const { is_unified_enabled, active_currency } = res.data || {};
            const savedLocalCurr = localStorage.getItem('hub_active_currency');

            if (is_unified_enabled) {
                const currentActive = savedLocalCurr || active_currency || 'DEFAULT';
                setActiveTargetCurrency(currentActive);
                return currentActive;
            } else {
                setActiveTargetCurrency('DEFAULT');
                return 'DEFAULT';
            }
        } catch (err) {
            console.error('Error fetching user currency settings:', err);
            return 'DEFAULT';
        }
    }, [userId]);

    const fetchSummaryData = useCallback(async () => {
        setLoading(true);
        try {
            const currentTargetCurr = await fetchCurrencySettings();

            // تثبيت الفترة على آخر 30 يوماً دائماً
            let endpoint = accountId
                ? `/financial/branch/${accountId}/summary?period=30days`
                : `/financial/summary/${userId}?period=30days`;

            if (currentTargetCurr !== 'DEFAULT') {
                endpoint += `&targetCurrency=${currentTargetCurr}`;
            }

            const response = await API.get(endpoint);
            if (response.data) {
                const raw = response.data;
                const normalized = raw.user_id || raw.invoices_revenue !== undefined || raw.incomes !== undefined
                    ? { [raw.currency_code || 'EGP']: raw }
                    : raw;

                setSummaryByCurrency(normalized);
            }
        } catch (err) {
            console.error('Failed fetching financial report metrics:', err);
        } finally {
            setLoading(false);
        }
    }, [accountId, userId, fetchCurrencySettings]);

    useEffect(() => {
        if (userId) {
            fetchSummaryData();
        }
    }, [userId, fetchSummaryData]);

    const handleSyncChartOnly = async () => {
        if (!accountId && !userId) return;
        setSyncingChart(true);
        try {
            const syncEndpoint = accountId
                ? `/financial/branch/${accountId}/sync-chart`
                : `/financial/sync-all/${userId}`;

            await API.post(syncEndpoint);
            
            setAlertInfo({
                open: true,
                message: t.chartSyncSuccess || (lang === 'ar' ? 'تم تحديث شجرة الحسابات والتقرير بنجاح!' : 'Chart of Accounts refreshed successfully!'),
                severity: 'success'
            });

            await fetchSummaryData();
        } catch (err) {
            console.error('Failed syncing chart of accounts:', err);
            setAlertInfo({
                open: true,
                message: t.chartSyncError || (lang === 'ar' ? 'فشل تحديث شجرة الحسابات، حاول مرة أخرى.' : 'Failed to refresh Chart of Accounts.'),
                severity: 'error'
            });
        } finally {
            setSyncingChart(false);
        }
    };

    const handleBack = () => {
        if (accountId) {
            navigate(`/dashboard/branch/${accountId}`);
        } else {
            navigate('/dashboard');
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const backArrow = <ArrowBackIcon sx={isRtl ? { transform: 'scaleX(-1)' } : undefined} />;
    const currenciesList = Object.keys(summaryByCurrency);

    return (
        <Layout title={t.viewFinancialReport || 'Financial Statement Report'}>
            <style>
                {`
                    @media print {
                        @page {
                            size: A4 portrait;
                            margin: 8mm 10mm;
                        }

                        .no-print, header, nav, sidebar, button, .MuiDrawer-root, .MuiAppBar-root {
                            display: none !important;
                        }

                        html, body, #root, main {
                            background-color: #ffffff !important;
                            color: #000000 !important;
                            padding: 0 !important;
                            margin: 0 !important;
                            width: 100% !important;
                            height: auto !important;
                            overflow: visible !important;
                        }

                        .print-report-card {
                            border: 1px solid #cbd5e1 !important;
                            box-shadow: none !important;
                            padding: 12px 16px !important;
                            margin-bottom: 0 !important;
                            border-radius: 6px !important;
                            page-break-inside: avoid !important;
                            break-inside: avoid !important;
                            background-color: #ffffff !important;
                            color: #000000 !important;
                        }

                        .main-statement-panel {
                            width: 63% !important;
                            max-width: 63% !important;
                            flex-basis: 63% !important;
                            float: ${isRtl ? 'right' : 'left'} !important;
                        }

                        .side-cashflow-panel {
                            width: 34% !important;
                            max-width: 34% !important;
                            flex-basis: 34% !important;
                            float: ${isRtl ? 'left' : 'right'} !important;
                        }

                        .MuiTypography-h6 {
                            font-size: 16px !important;
                        }

                        .MuiTypography-h5 {
                            font-size: 18px !important;
                        }

                        .MuiTableCell-root {
                            padding: 4px 8px !important;
                            font-size: 12px !important;
                            color: #000000 !important;
                        }
                    }
                `}
            </style>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }} className="no-print">
                <Button
                    size="small"
                    startIcon={!isRtl ? backArrow : undefined}
                    endIcon={isRtl ? backArrow : undefined}
                    onClick={handleBack}
                >
                    {accountId ? (t.backToBranch || 'Back to Branch') : (t.backToGlobalWorkspace || 'Back to Dashboard')}
                </Button>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    {/* 🎯 العرض المباشر الأنيق لبيان فترة التقرير (آخر 30 يوماً) بدلاً من القائمة المنسدلة */}
                    <Chip
                        icon={<CalendarIcon sx={{ fontSize: '16px !important' }} />}
                        label={t.last30Days || 'آخر 30 يوماً'}
                        variant="outlined"
                        color="primary"
                        sx={{ 
                            height: '32px', 
                            fontSize: '12px', 
                            fontWeight: 700, 
                            borderRadius: '6px',
                            bgcolor: 'background.paper',
                            px: 0.5
                        }}
                    />

                    <Button
                        variant="outlined"
                        color="primary"
                        startIcon={syncingChart ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                        onClick={handleSyncChartOnly}
                        disabled={syncingChart || loading}
                        size="small"
                        sx={{ textTransform: 'none', fontWeight: 600, height: '32px' }}
                    >
                        {syncingChart 
                            ? (t.refreshingChart || (lang === 'ar' ? 'جاري التحديث...' : 'Refreshing...')) 
                            : (t.refreshChartBtn || (lang === 'ar' ? 'تحديث الحسابات' : 'Sync Chart'))
                        }
                    </Button>

                    <Button
                        variant="contained"
                        color="primary"
                        startIcon={<PrintIcon />}
                        onClick={handlePrint}
                        size="small"
                        sx={{ textTransform: 'none', fontWeight: 600, height: '32px' }}
                    >
                        {t.print || 'Print Report'}
                    </Button>
                </Box>
            </Box>

            <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }} className="no-print">
                {t.languageNotice || 'تنويه: يتم عرض مسميات بنود الأستاذ العام بنفس لغة إدخالها المباشرة في دفترة.'}
            </Alert>

            {loading ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10, gap: 2 }}>
                    <CircularProgress />
                    <Typography variant="body2" color="text.secondary">
                        {t.compilingSheets || 'Compiling financial statements...'}
                    </Typography>
                </Box>
            ) : currenciesList.length === 0 ? (
                <Card sx={{ p: 6, textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                    <Typography variant="h6" color="text.secondary">
                        {t.noTransactions || 'No financial records available to compile statement.'}
                    </Typography>
                </Card>
            ) : (
                <Grid container spacing={3}>
                    {currenciesList.map((currencyCode) => {
                        const data = summaryByCurrency[currencyCode] || {};

                        const incomesList = data.incomes || [];
                        const expensesList = data.expenses || [];

                        const totalIncomes = parseFloat(data.total_incomes || data.total_revenue || 0);
                        const totalExpenses = parseFloat(data.total_expenses || data.total_costs || 0);
                        const netProfit = parseFloat(data.net_profit || (totalIncomes - totalExpenses));

                        const totalPaid = parseFloat(data.total_paid || 0);
                        const totalUnpaid = parseFloat(data.total_unpaid || 0);
                        const totalReturns = parseFloat(data.total_returns || 0);

                        return (
                            <Grid item xs={12} key={currencyCode}>
                                <Paper 
                                    elevation={0} 
                                    className="print-report-card"
                                    sx={{ 
                                        p: { xs: 2.5, md: 3.5 }, 
                                        borderRadius: 3, 
                                        border: `1px solid ${theme.palette.divider}`,
                                        boxShadow: theme.palette.mode === 'dark' ? '0 4px 20px rgba(0,0,0,0.4)' : '0 4px 20px rgba(0,0,0,0.03)',
                                        bgcolor: 'background.paper',
                                    }}
                                >
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, pb: 1.5, borderBottom: `2px solid ${theme.palette.divider}` }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                            <ReportHeaderIcon color="primary" sx={{ fontSize: 28 }} />
                                            <Box>
                                                <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                                                    {t.incomeStatementTitle || 'Statement of Profit & Loss'}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {t.last30Days || 'آخر 30 يوماً'}
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <Chip 
                                            icon={<WalletIcon sx={{ fontSize: '16px !important' }} />}
                                            label={getCurrencyFullName(currencyCode, lang)} 
                                            color="primary" 
                                            variant="filled" 
                                            sx={{ fontWeight: 700, fontSize: '13px', px: 1 }} 
                                        />
                                    </Box>

                                    <Grid container spacing={3}>
                                        <Grid item xs={12} md={8} className="main-statement-panel">
                                            <Box sx={{ mb: 3 }}>
                                                <Typography 
                                                    variant="subtitle2" 
                                                    color="success.main" 
                                                    fontWeight={700} 
                                                    sx={{ 
                                                        display: 'flex', 
                                                        alignItems: 'center', 
                                                        gap: 1, 
                                                        mb: 1,
                                                        justifyContent: 'flex-start' 
                                                    }}
                                                >
                                                    <IncomeIcon fontSize="small" sx={{ transform: isRtl ? 'scaleX(-1)' : 'none' }} />
                                                    {t.revenueSectionTitle || '1. REVENUE & INCOMES'}
                                                </Typography>
                                                
                                                <TableContainer component={Box} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2, bgcolor: alpha(theme.palette.success.main, 0.02) }}>
                                                    <Table size="small" dir={isRtl ? 'rtl' : 'ltr'}>
                                                        <TableBody>
                                                            {incomesList.length === 0 ? (
                                                                <TableRow>
                                                                    <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontSize: '13.5px', color: 'text.secondary' }}>
                                                                        {t.invoicesRevenueLabel || 'Sales Invoices Revenue'}
                                                                    </TableCell>
                                                                    <TableCell align={isRtl ? 'left' : 'right'} sx={{ fontWeight: 700, fontSize: '13.5px' }}>
                                                                        <bdi>{formatCurrency(totalIncomes)}</bdi> {getCurrencySymbol(currencyCode, lang)}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ) : (
                                                                incomesList.map((item) => (
                                                                    <TableRow key={item.id}>
                                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontSize: '13.5px', color: 'text.primary', fontWeight: 500 }}>
                                                                            {item.code ? `${item.code} - ` : ''}{item.name}
                                                                        </TableCell>
                                                                        <TableCell align={isRtl ? 'left' : 'right'} sx={{ fontWeight: 700, fontSize: '13.5px' }}>
                                                                            <bdi>{formatCurrency(item.total_amount)}</bdi> {getCurrencySymbol(currencyCode, lang)}
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ))
                                                            )}
                                                            <TableRow sx={{ bgcolor: alpha(theme.palette.success.main, 0.08) }}>
                                                                <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, fontSize: '14px', color: 'success.main' }}>
                                                                    {t.totalRevenueLabel || 'Total Revenue'}
                                                                </TableCell>
                                                                <TableCell align={isRtl ? 'left' : 'right'} sx={{ fontWeight: 800, fontSize: '14px', color: 'success.main' }}>
                                                                    <bdi>{formatCurrency(totalIncomes)}</bdi> {getCurrencySymbol(currencyCode, lang)}
                                                                </TableCell>
                                                            </TableRow>
                                                        </TableBody>
                                                    </Table>
                                                </TableContainer>
                                            </Box>

                                            <Box sx={{ mb: 3 }}>
                                                <Typography 
                                                    variant="subtitle2" 
                                                    color="error.main" 
                                                    fontWeight={700} 
                                                    sx={{ 
                                                        display: 'flex', 
                                                        alignItems: 'center', 
                                                        gap: 1, 
                                                        mb: 1,
                                                        justifyContent: 'flex-start'
                                                    }}
                                                >
                                                    <ExpenseIcon fontSize="small" sx={{ transform: isRtl ? 'scaleX(-1)' : 'none' }} />
                                                    {t.costSectionTitle || '2. COSTS & OPERATIONAL EXPENSES'}
                                                </Typography>

                                                <TableContainer component={Box} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2, bgcolor: alpha(theme.palette.error.main, 0.02) }}>
                                                    <Table size="small" dir={isRtl ? 'rtl' : 'ltr'}>
                                                        <TableBody>
                                                            {expensesList.length === 0 ? (
                                                                <TableRow>
                                                                    <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontSize: '13.5px', color: 'text.secondary' }}>
                                                                        {t.operatingExpensesLabel || 'Operational Expenses'}
                                                                    </TableCell>
                                                                    <TableCell align={isRtl ? 'left' : 'right'} sx={{ fontWeight: 700, fontSize: '13.5px' }}>
                                                                        <bdi>{formatCurrency(totalExpenses)}</bdi> {getCurrencySymbol(currencyCode, lang)}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ) : (
                                                                expensesList.map((item) => (
                                                                    <TableRow key={item.id}>
                                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontSize: '13.5px', color: 'text.primary', fontWeight: 500 }}>
                                                                            {item.code ? `${item.code} - ` : ''}{item.name}
                                                                        </TableCell>
                                                                        <TableCell align={isRtl ? 'left' : 'right'} sx={{ fontWeight: 700, fontSize: '13.5px' }}>
                                                                            <bdi>{formatCurrency(item.total_amount)}</bdi> {getCurrencySymbol(currencyCode, lang)}
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ))
                                                            )}
                                                            <TableRow sx={{ bgcolor: alpha(theme.palette.error.main, 0.08) }}>
                                                                <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, fontSize: '14px', color: 'error.main' }}>
                                                                    {t.totalCostsLabel || 'Total Costs & Expenses'}
                                                                </TableCell>
                                                                <TableCell align={isRtl ? 'left' : 'right'} sx={{ fontWeight: 800, fontSize: '14px', color: 'error.main' }}>
                                                                    <bdi>{formatCurrency(totalExpenses)}</bdi> {getCurrencySymbol(currencyCode, lang)}
                                                                </TableCell>
                                                            </TableRow>
                                                        </TableBody>
                                                    </Table>
                                                </TableContainer>
                                            </Box>

                                            <Paper 
                                                elevation={0}
                                                sx={{ 
                                                    p: 2, 
                                                    borderRadius: 2, 
                                                    bgcolor: netProfit >= 0 ? alpha(theme.palette.success.main, 0.1) : alpha(theme.palette.error.main, 0.1),
                                                    border: '1px solid',
                                                    borderColor: netProfit >= 0 ? 'success.main' : 'error.main',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    flexWrap: 'wrap',
                                                    gap: 1
                                                }}
                                            >
                                                <Typography variant="subtitle1" fontWeight={700} color={netProfit >= 0 ? 'success.main' : 'error.main'}>
                                                    {t.netProfitLabel || 'NET OPERATING PROFIT / LOSS'}
                                                </Typography>
                                                <Typography variant="h5" fontWeight={800} color={netProfit >= 0 ? 'success.main' : 'error.main'}>
                                                    <bdi>{formatCurrency(netProfit)}</bdi> {getCurrencySymbol(currencyCode, lang)}
                                                </Typography>
                                            </Paper>
                                        </Grid>

                                        <Grid item xs={12} md={4} className="side-cashflow-panel">
                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%', justifyContent: 'flex-start' }}>
                                                <Typography variant="subtitle2" color="text.secondary" fontWeight={700} align={isRtl ? 'right' : 'left'}>
                                                    {t.cashflowMetricsTitle || 'CASHFLOW & BALANCES'}
                                                </Typography>

                                                <Card sx={{ bgcolor: alpha(theme.palette.success.main, 0.04), borderLeft: isRtl ? 'none' : '4px solid', borderRight: isRtl ? '4px solid' : 'none', borderColor: 'success.main', elevation: 0 }}>
                                                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 }, textAlign: isRtl ? 'right' : 'left' }}>
                                                        <Typography variant="caption" color="text.secondary" fontWeight={600}>
                                                            {t.collectedCashPaidExclTax || 'Collected Revenue (Excl. Tax)'}
                                                        </Typography>
                                                        <Typography variant="h6" fontWeight={700} color="success.main">
                                                            <bdi>{formatCurrency(totalPaid)}</bdi> {getCurrencySymbol(currencyCode, lang)}
                                                        </Typography>
                                                    </CardContent>
                                                </Card>

                                                <Card sx={{ bgcolor: alpha(theme.palette.warning.main, 0.04), borderLeft: isRtl ? 'none' : '4px solid', borderRight: isRtl ? '4px solid' : 'none', borderColor: 'warning.main', elevation: 0 }}>
                                                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 }, textAlign: isRtl ? 'right' : 'left' }}>
                                                        <Typography variant="caption" color="text.secondary" fontWeight={600}>
                                                            {t.outstandingReceivablesInclTax || 'Outstanding Receivables (Incl. Tax)'}
                                                        </Typography>
                                                        <Typography variant="h6" fontWeight={700} color="warning.main">
                                                            <bdi>{formatCurrency(totalUnpaid)}</bdi> {getCurrencySymbol(currencyCode, lang)}
                                                        </Typography>
                                                    </CardContent>
                                                </Card>

                                                <Card sx={{ bgcolor: alpha(theme.palette.error.main, 0.04), borderLeft: isRtl ? 'none' : '4px solid', borderRight: isRtl ? '4px solid' : 'none', borderColor: 'error.main', elevation: 0 }}>
                                                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 }, textAlign: isRtl ? 'right' : 'left' }}>
                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <Typography variant="caption" color="text.secondary" fontWeight={600}>
                                                                {t.totalReturnsInclTax || 'Total Returns (Incl. Tax)'}
                                                            </Typography>
                                                            <Chip label={t.informationalOnly || 'Informational'} size="small" sx={{ fontSize: '9px', height: 18 }} />
                                                        </Box>
                                                        <Typography variant="h6" fontWeight={700} color="error.main">
                                                            <bdi>{formatCurrency(totalReturns)}</bdi> {getCurrencySymbol(currencyCode, lang)}
                                                        </Typography>
                                                    </CardContent>
                                                </Card>
                                            </Box>
                                        </Grid>
                                    </Grid>
                                </Paper>
                            </Grid>
                        );
                    })}
                </Grid>
            )}

            <Snackbar
                open={alertInfo.open}
                autoHideDuration={4000}
                onClose={() => setAlertInfo({ ...alertInfo, open: false })}
            >
                <Alert severity={alertInfo.severity} sx={{ width: '100%' }}>
                    {alertInfo.message}
                </Alert>
            </Snackbar>
        </Layout>
    );
};

export default FinancialReportPage;