import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
    Box,
    Card,
    CardContent,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    TableContainer,
    Paper,
    Button,
    Chip,
    CircularProgress,
    Pagination,
    Select,
    MenuItem,
    Typography,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    IconButton,
    useTheme,
    alpha
} from '@mui/material';
import { 
    ArrowBackRounded as ArrowBackIcon,
    DescriptionRounded as StatementIcon,
    PhoneRounded as PhoneIcon,
    EmailRounded as EmailIcon,
    CloseRounded as CloseIcon
} from '@mui/icons-material';
import API from '../services/api';
import Layout from '../components/Layout';
import { useLanguage } from '../LanguageContext';
import { getCurrencySymbol, getCurrencyFullName } from '../i18n/currencies';

const formatCurrency = (val) => {
    const num = parseFloat(val || 0);
    return num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

// 💳 Component for Dual-Currency Display
const CurrencyDisplay = ({
    amount,
    baseAmount,
    currencyCode,
    baseCurrencyCode,
    isUnified = false,
    displayCurrency,
    lang,
    isBold = false,
    color = 'text.primary',
    size = 'body2'
}) => {
    const activeCurr = (isUnified ? displayCurrency : (baseCurrencyCode || currencyCode || 'EGP')).toUpperCase();
    const cliCurr = (currencyCode || 'EGP').toUpperCase();

    const origVal = parseFloat(amount || 0);
    const baseVal = baseAmount !== undefined && baseAmount !== null 
        ? parseFloat(baseAmount || 0) 
        : origVal;

    let calculatedRate = 1;
    if (origVal !== 0 && baseVal !== 0 && Math.abs(origVal - baseVal) > 0.001) {
        calculatedRate = Math.abs(baseVal / origVal);
    }

    const isForeign = !isUnified && (cliCurr !== activeCurr);

    const origFullName = getCurrencyFullName(cliCurr, lang);
    const activeFullName = getCurrencyFullName(activeCurr, lang);
    
    const origSymbol = getCurrencySymbol(cliCurr, lang);
    const activeSymbol = getCurrencySymbol(activeCurr, lang);

    const fontSize = size === 'caption' ? '11px' : '13px';
    const subFontSize = size === 'caption' ? '9.5px' : '11px';

    if (!isForeign) {
        return (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant={size} sx={{ fontSize, fontWeight: isBold ? 700 : 500, color }}>
                    <bdi>{formatCurrency(baseVal)}</bdi>
                </Typography>
                <Tooltip title={activeFullName} arrow placement="top">
                    <Typography
                        component="span"
                        variant={size}
                        sx={{
                            fontSize,
                            fontWeight: isBold ? 700 : 600,
                            color: color !== 'text.primary' ? color : 'text.secondary',
                            cursor: 'pointer',
                        }}
                    >
                        ({activeSymbol})
                    </Typography>
                </Tooltip>
            </Box>
        );
    }

    const tooltipTitle = `1 ${origSymbol} = ${formatCurrency(calculatedRate)} ${activeSymbol} (${activeFullName})`;

    return (
        <Box sx={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant={size} sx={{ fontSize, fontWeight: isBold ? 700 : 600, color }}>
                    <bdi>{formatCurrency(baseVal)}</bdi>
                </Typography>
                <Tooltip title={activeFullName} arrow placement="top">
                    <Typography
                        component="span"
                        variant={size}
                        sx={{ fontSize, fontWeight: 700, color: color !== 'text.primary' ? color : 'text.secondary', cursor: 'pointer' }}
                    >
                        ({activeSymbol})
                    </Typography>
                </Tooltip>
            </Box>

            <Tooltip title={tooltipTitle} arrow placement="top">
                <Typography
                    variant="caption"
                    sx={{
                        fontSize: subFontSize,
                        color: color !== 'text.primary' ? color : 'text.secondary',
                        fontWeight: 500,
                        cursor: 'pointer',
                        width: 'fit-content',
                        mt: 0.1
                    }}
                >
                    <bdi>{formatCurrency(origVal)}</bdi> ({origSymbol})
                </Typography>
            </Tooltip>
        </Box>
    );
};

const ClientsPage = () => {
    const navigate = useNavigate();
    const theme = useTheme();
    const [searchParams, setSearchParams] = useSearchParams();
    const { t, lang } = useLanguage();
    const isRtl = lang === 'ar' || t.dir === 'rtl';

    const accountId = searchParams.get('accountId');
    const userId = localStorage.getItem('userId');

    const page = parseInt(searchParams.get('page') || '1', 10);
    const rowsPerPage = parseInt(searchParams.get('limit') || '10', 10);

    const [loading, setLoading] = useState(true);
    const [clients, setClients] = useState([]);
    const [totalRows, setTotalRows] = useState(0);

    const [statementModal, setStatementModal] = useState({
        open: false,
        clientName: '',
        statementUrl: '',
    });

    const totalPages = Math.ceil(totalRows / rowsPerPage) || 1;

    // جلب حالة وتفعيل العملة الموحدة من السيرفر والـ LocalStorage
    const fetchCurrencySettings = useCallback(async () => {
        try {
            const res = await API.get(`/currency/settings/${userId}`);
            const { is_unified_enabled, active_currency } = res.data || {};
            const savedLocalCurr = localStorage.getItem('hub_active_currency');

            if (is_unified_enabled) {
                return savedLocalCurr || active_currency || 'DEFAULT';
            }
            return 'DEFAULT';
        } catch (err) {
            console.error('Error fetching currency settings:', err);
            return 'DEFAULT';
        }
    }, [userId]);

    const fetchPaginatedClients = useCallback(async () => {
        setLoading(true);
        try {
            const currentTargetCurr = await fetchCurrencySettings();

            const params = {
                page: page,
                limit: rowsPerPage,
                userId: accountId ? undefined : userId,
                accountId: accountId || undefined,
                targetCurrency: currentTargetCurr !== 'DEFAULT' ? currentTargetCurr : undefined
            };

            const response = await API.get('/financial/clients/paginated', { params });
            if (response.data) {
                setClients(response.data.data || []);
                setTotalRows(response.data.pagination?.totalRows || 0);
            }
        } catch (err) {
            console.error('Failed compiling matrix directory node for clients:', err);
        } finally {
            setLoading(false);
        }
    }, [accountId, userId, page, rowsPerPage, fetchCurrencySettings]);

    useEffect(() => {
        if (userId) {
            if (!searchParams.get('page') || !searchParams.get('limit')) {
                setSearchParams({
                    accountId: accountId || '',
                    page: String(page),
                    limit: String(rowsPerPage)
                }, { replace: true });
            }
            fetchPaginatedClients();
        }
    }, [searchParams, userId, page, rowsPerPage, fetchPaginatedClients]);

    const handlePageNumberChange = (event, newPage) => {
        setSearchParams({
            accountId: accountId || '',
            page: String(newPage),
            limit: String(rowsPerPage)
        });
    };

    const handleChangeRowsPerPage = (event) => {
        const newLimit = event.target.value;
        setSearchParams({
            accountId: accountId || '',
            page: '1',
            limit: String(newLimit)
        });
    };

    const handleBackNavigation = () => {
        if (accountId) {
            navigate(`/dashboard/branch/${accountId}`);
        } else {
            navigate('/dashboard');
        }
    };

    const handleOpenStatement = (client, e) => {
        if (e) e.stopPropagation();

        const baseURL = API.defaults.baseURL || '/api';
        const proxyUrl = `${baseURL}/financial/client-statement-proxy/${client.account_id}/${client.daftra_client_id}`;

        setStatementModal({
            open: true,
            clientName: client.client_name,
            statementUrl: proxyUrl
        });
    };

    const backArrow = <ArrowBackIcon sx={isRtl ? { transform: 'scaleX(-1)' } : undefined} />;

    // 🎯 تنظيف العمود الثابت وإلغاء الشادو خلفه
    const getStickyCellStyle = (isHeader = false) => ({
        position: 'sticky',
        insetInlineStart: 0,
        zIndex: isHeader ? 10 : 5,
        backgroundColor: theme.palette.background.paper,
        backgroundImage: 'none',
        borderInlineEnd: `1px solid ${theme.palette.divider}`,
        minWidth: 230,
    });

    return (
        <Layout title={t.allClientsTitle || (lang === 'ar' ? 'دليل العملاء الرئيسي' : 'Master Clients Directory')}>
            <Box sx={{ mb: 3 }}>
                <Button 
                    size="small" 
                    startIcon={!isRtl ? backArrow : undefined}
                    endIcon={isRtl ? backArrow : undefined}
                    onClick={handleBackNavigation}
                >
                    {accountId ? (t.backToBranch || (lang === 'ar' ? 'العودة للفرع' : 'Back to Branch')) : (t.backToGlobalWorkspace || (lang === 'ar' ? 'العودة للوحة الرئيسية' : 'Back to Dashboard'))}
                </Button>
            </Box>

            <Card sx={{ boxShadow: '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
                    ) : (
                        <>
                            <TableContainer 
                                component={Paper} 
                                elevation={0} 
                                dir={isRtl ? 'rtl' : 'ltr'}
                                sx={{ 
                                    borderRadius: 0, 
                                    overflowX: 'auto',
                                    position: 'relative',
                                    '& .MuiTable-root': {
                                        borderCollapse: 'separate',
                                        borderSpacing: 0,
                                    }
                                }}
                            >
                                <Table size="medium" sx={{ minWidth: 1100 }}>
                                    <TableHead sx={{ bgcolor: alpha(theme.palette.action.hover, 0.05) }}>
                                        <TableRow>
                                            <TableCell 
                                                align={isRtl ? 'right' : 'left'}
                                                sx={{ 
                                                    fontWeight: 700, 
                                                    py: 2, 
                                                    px: 2,
                                                    color: 'text.primary',
                                                    ...getStickyCellStyle(true)
                                                }}
                                            >
                                                {t.clientName || (lang === 'ar' ? 'اسم العميل' : 'Client Name')}
                                            </TableCell>

                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 170 }}>
                                                {!accountId ? (t.accountAndBranch || (lang === 'ar' ? 'الحساب / الفرع' : 'Workspace / Branch')) : (t.branchLabel || (lang === 'ar' ? 'الفرع' : 'Branch'))}
                                            </TableCell>

                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 180 }}>
                                                {t.clientTotalInvoiced || (lang === 'ar' ? 'إجمالي المبيعات' : 'Total Invoiced')}
                                            </TableCell>

                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 200 }}>
                                                {t.clientFinancialSummary || (lang === 'ar' ? 'الملخص المالي للعميل' : 'Financial Balance')}
                                            </TableCell>

                                            <TableCell align="center" sx={{ fontWeight: 700, py: 2, minWidth: 160 }}>
                                                {t.status || (lang === 'ar' ? 'الحالة' : 'Status')}
                                            </TableCell>

                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 120 }}>
                                                {t.currency || (lang === 'ar' ? 'عملة العميل' : 'Currency')}
                                            </TableCell>

                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, px: 2, minWidth: 130 }}>
                                                {t.createdAt || (lang === 'ar' ? 'تاريخ الإضافة' : 'Created At')}
                                            </TableCell>

                                            <TableCell align="center" sx={{ fontWeight: 700, py: 2, px: 2, minWidth: 120 }}>
                                                {t.action || (lang === 'ar' ? 'الإجراءات' : 'Action')}
                                            </TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {clients.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                                                    {t.noClients || (lang === 'ar' ? 'لا يوجد عملاء مسجلين' : 'No clients found')}
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            clients.map((cli) => {
                                                const overdueCount = parseInt(cli.overdue_count || 0, 10);
                                                const returnedVal = parseFloat(cli.total_returned || 0);

                                                return (
                                                    <TableRow 
                                                        key={cli.id} 
                                                        hover 
                                                        sx={{ 
                                                            '&:hover .sticky-cell': { 
                                                                backgroundColor: theme.palette.mode === 'dark' ? '#1e293b' : '#f1f5f9'
                                                            } 
                                                        }}
                                                    >
                                                        <TableCell 
                                                            align={isRtl ? 'right' : 'left'}
                                                            className="sticky-cell"
                                                            sx={{ 
                                                                py: 2, 
                                                                px: 2,
                                                                color: 'text.primary',
                                                                ...getStickyCellStyle(false)
                                                            }}
                                                        >
                                                            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                                                <Typography 
                                                                    variant="subtitle2" 
                                                                    fontWeight={700}
                                                                    sx={{ color: 'text.primary' }}
                                                                >
                                                                    {cli.client_name}
                                                                </Typography>
                                                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3, mt: 0.5 }}>
                                                                    {cli.client_email && (
                                                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '11px' }}>
                                                                            <EmailIcon sx={{ fontSize: '12px' }} /> <bdi>{cli.client_email}</bdi>
                                                                        </Typography>
                                                                    )}
                                                                    {cli.client_phone && (
                                                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '11px' }}>
                                                                            <PhoneIcon sx={{ fontSize: '12px' }} /> <bdi>{cli.client_phone}</bdi>
                                                                        </Typography>
                                                                    )}
                                                                </Box>
                                                            </Box>
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 2 }}>
                                                            {!accountId ? (
                                                                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                                                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '13px', color: 'text.primary' }}>
                                                                        {cli.account_name}
                                                                    </Typography>
                                                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '11px' }}>
                                                                        {cli.branch_name || t.defaultBranchName || (lang === 'ar' ? 'الفرع الرئيسي' : 'Main Branch')}
                                                                    </Typography>
                                                                </Box>
                                                            ) : (
                                                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '13px' }}>
                                                                    {cli.branch_name || t.defaultBranchName || (lang === 'ar' ? 'الفرع الرئيسي' : 'Main Branch')}
                                                                </Typography>
                                                            )}
                                                        </TableCell>

                                                        {/* TOTAL INVOICED DUAL CURRENCY */}
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 2 }}>
                                                            <CurrencyDisplay
                                                                amount={cli.orig_total_invoiced || cli.total_invoiced}
                                                                baseAmount={cli.total_invoiced}
                                                                currencyCode={cli.currency}
                                                                baseCurrencyCode={cli.account_base_currency}
                                                                isUnified={cli.is_unified}
                                                                displayCurrency={cli.display_currency}
                                                                lang={lang}
                                                                isBold
                                                            />
                                                        </TableCell>

                                                        {/* FINANCIAL BALANCE DUAL CURRENCY */}
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 2 }}>
                                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                    <Typography variant="caption" color="success.main" sx={{ fontWeight: 600, fontSize: '11px' }}>
                                                                        {t.paidLabel || (lang === 'ar' ? 'المحصل' : 'Paid')}:
                                                                    </Typography>
                                                                    <CurrencyDisplay
                                                                        amount={cli.orig_total_paid || cli.total_paid}
                                                                        baseAmount={cli.total_paid}
                                                                        currencyCode={cli.currency}
                                                                        baseCurrencyCode={cli.account_base_currency}
                                                                        isUnified={cli.is_unified}
                                                                        displayCurrency={cli.display_currency}
                                                                        lang={lang}
                                                                        size="caption"
                                                                        color="success.main"
                                                                    />
                                                                </Box>

                                                                {returnedVal > 0 && (
                                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                        <Typography variant="caption" color="error.main" sx={{ fontWeight: 600, fontSize: '11px' }}>
                                                                            {t.statusReturned || (lang === 'ar' ? 'مرتجع' : 'Returned')}:
                                                                        </Typography>
                                                                        <CurrencyDisplay
                                                                            amount={returnedVal}
                                                                            baseAmount={returnedVal}
                                                                            currencyCode={cli.account_base_currency}
                                                                            baseCurrencyCode={cli.account_base_currency}
                                                                            isUnified={cli.is_unified}
                                                                            displayCurrency={cli.display_currency}
                                                                            lang={lang}
                                                                            size="caption"
                                                                            color="error.main"
                                                                        />
                                                                    </Box>
                                                                )}

                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                    <Typography variant="caption" color="warning.main" sx={{ fontWeight: 600, fontSize: '11px' }}>
                                                                        {t.unpaidLabel || (lang === 'ar' ? 'المتبقي' : 'Due')}:
                                                                    </Typography>
                                                                    <CurrencyDisplay
                                                                        amount={cli.orig_total_unpaid || cli.total_unpaid}
                                                                        baseAmount={cli.total_unpaid}
                                                                        currencyCode={cli.currency}
                                                                        baseCurrencyCode={cli.account_base_currency}
                                                                        isUnified={cli.is_unified}
                                                                        displayCurrency={cli.display_currency}
                                                                        lang={lang}
                                                                        size="caption"
                                                                        color="warning.main"
                                                                    />
                                                                </Box>
                                                            </Box>
                                                        </TableCell>

                                                        <TableCell align="center" sx={{ py: 2 }}>
                                                            {overdueCount > 0 ? (
                                                                <Chip 
                                                                    label={typeof t.overdueInvoicesBadge === 'function' ? t.overdueInvoicesBadge(overdueCount) : `${overdueCount} ${lang === 'ar' ? 'متأخرة' : 'Overdue'}`}
                                                                    color="error"
                                                                    size="small"
                                                                    variant="filled"
                                                                    sx={{ fontSize: '10.5px', fontWeight: 700, height: 22 }}
                                                                />
                                                            ) : (
                                                                <Chip 
                                                                    label={t.noOverdueInvoices || (lang === 'ar' ? 'منتظم' : 'No Overdue')}
                                                                    color="success"
                                                                    size="small"
                                                                    variant="outlined"
                                                                    sx={{ fontSize: '10.5px', fontWeight: 600, height: 22 }}
                                                                />
                                                            )}
                                                        </TableCell>

                                                        {/* 🎯 تثبيت عرض عملة العميل الأصلية المسجلة بالدفترة بدون التأثر بالعملة الموحدة */}
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 2 }}>
                                                            <Chip 
                                                                label={getCurrencyFullName(cli.currency || 'EGP', lang)} 
                                                                size="small" 
                                                                variant="outlined" 
                                                                sx={{ fontSize: '11px', fontWeight: 600 }} 
                                                            />
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontSize: '12px', color: 'text.secondary', px: 2 }}>
                                                            <bdi>{cli.daftra_created_at ? new Date(cli.daftra_created_at).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : '—'}</bdi>
                                                        </TableCell>

                                                        <TableCell align="center" sx={{ px: 2 }}>
                                                            <Tooltip title={t.viewClientStatement || (lang === 'ar' ? 'عرض كشف الحساب' : 'View Statement')}>
                                                                <Button
                                                                    size="small"
                                                                    variant="outlined"
                                                                    color="primary"
                                                                    startIcon={<StatementIcon fontSize="small" />}
                                                                    onClick={(e) => handleOpenStatement(cli, e)}
                                                                    sx={{ fontSize: '11px', fontWeight: 600, textTransform: 'none', py: 0.3 }}
                                                                >
                                                                    {t.viewClientStatement || (lang === 'ar' ? 'كشف الحساب' : 'Statement')}
                                                                </Button>
                                                            </Tooltip>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>

                            <Box 
                                sx={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'space-between', 
                                    p: 2, 
                                    flexWrap: 'wrap',
                                    gap: 2,
                                    borderTop: `1px solid ${theme.palette.divider}`,
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                                        {t.rowsPerPage || (lang === 'ar' ? 'عدد الصفوف لكل صفحة:' : 'Rows per page:')}
                                    </Typography>
                                    <Select
                                        value={rowsPerPage}
                                        onChange={handleChangeRowsPerPage}
                                        size="small"
                                        variant="outlined"
                                        sx={{ height: 30, fontSize: '0.75rem', borderRadius: '4px', '.MuiOutlinedInput-input': { py: 0.5 } }}
                                    >
                                        {[5, 10, 20, 50].map((option) => (
                                            <MenuItem key={option} value={option} sx={{ fontSize: '0.75rem' }}>
                                                {option}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </Box>

                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                                        <bdi>{totalRows > 0 ? `${((page - 1) * rowsPerPage) + 1}-${Math.min(page * rowsPerPage, totalRows)} ${t.of || (lang === 'ar' ? 'من' : 'of')} ${totalRows}` : '0-0 of 0'}</bdi>
                                    </Typography>

                                    <Pagination
                                        count={totalPages}
                                        page={page}
                                        onChange={handlePageNumberChange}
                                        color="primary"
                                        size="small"
                                        shape="rounded"
                                        showFirstButton
                                        showLastButton
                                    />
                                </Box>
                            </Box>
                        </>
                    )}
                </CardContent>
            </Card>

            <Dialog
                open={statementModal.open}
                onClose={() => setStatementModal({ open: false, clientName: '', statementUrl: '' })}
                maxWidth="lg"
                fullWidth
                dir={t.dir}
                PaperProps={{
                    sx: { height: '85vh', borderRadius: 3 }
                }}
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
                    <Typography variant="h6" fontWeight={700}>
                        {t.clientStatementTitle || (lang === 'ar' ? 'كشف حساب العميل اللحظي' : 'Live Client Statement')}: {statementModal.clientName}
                    </Typography>
                    <IconButton onClick={() => setStatementModal({ open: false, clientName: '', statementUrl: '' })}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ p: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {statementModal.statementUrl ? (
                        <iframe
                            src={statementModal.statementUrl}
                            title="Daftra Client Statement"
                            style={{
                                width: '100%',
                                height: '100%',
                                border: 'none',
                            }}
                        />
                    ) : (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                            <CircularProgress />
                        </Box>
                    )}
                </DialogContent>
            </Dialog>
        </Layout>
    );
};

export default ClientsPage;