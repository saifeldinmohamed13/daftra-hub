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
    CircularProgress,
    Pagination,
    Select,
    MenuItem,
    Typography,
    Chip,
    Tooltip,
    useTheme,
    alpha
} from '@mui/material';
import { ArrowBackRounded as ArrowBackIcon } from '@mui/icons-material';
import API from '../services/api';
import Layout from '../components/Layout';
import { useLanguage } from '../LanguageContext';
import { getCurrencySymbol, getCurrencyFullName } from '../i18n/currencies';

const getPaymentStatusMap = (t) => ({
    0: { label: t.statusUnpaid || 'Unpaid', color: 'warning' },
    1: { label: t.statusPartial || 'Partially Paid', color: 'info' },
    2: { label: t.statusPaid || 'Paid', color: 'success' },
    3: { label: t.statusReturned || 'Returned', color: 'error' },
});

const PaymentStatusChip = ({ statusId, t }) => {
    const statusMap = getPaymentStatusMap(t);
    const status = statusMap[parseInt(statusId, 10)] || { label: t.statusUnknown || 'Unknown', color: 'default' };
    return <Chip label={status.label} color={status.color} size="small" variant="filled" sx={{ fontSize: '11px', fontWeight: 700, height: 22 }} />;
};

const getDeliveryStatusMap = (t) => ({
    1: { label: t.deliveryReceived || 'Received', color: 'success' },
    2: { label: t.deliveryRejected || 'Rejected', color: 'error' },
    3: { label: t.deliveryPending || 'Pending', color: 'warning' },
    4: { label: t.deliveryPartialReceived || 'Partially Received', color: 'info' },
    5: { label: t.deliveryPartialRejected || 'Partially Rejected', color: 'default' },
});

const DeliveryStatusChip = ({ statusId, t }) => {
    if (statusId === null || statusId === undefined || statusId === 0) {
        return <Chip label={t.deliveryDirect || 'Immediate'} size="small" variant="outlined" color="primary" sx={{ fontSize: '11px', fontWeight: 600, height: 22 }} />;
    }
    const statusMap = getDeliveryStatusMap(t);
    const status = statusMap[parseInt(statusId, 10)] || { label: t.statusUnknown || 'Unknown', color: 'default' };
    return <Chip label={status.label} color={status.color} size="small" variant="outlined" sx={{ fontSize: '11px', fontWeight: 600, height: 22 }} />;
};

const formatCurrency = (val) => {
    const num = parseFloat(val || 0);
    return num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

const CurrencyDisplay = ({
    amount,
    baseAmount,
    currencyCode,
    baseCurrencyCode,
    exchangeRate,
    isUnified = false,
    displayCurrency,
    lang,
    isBold = false,
    color = 'text.primary',
    size = 'body2'
}) => {
    const activeCurr = (isUnified ? displayCurrency : (baseCurrencyCode || 'EGP')).toUpperCase().trim();
    const invCurr = (currencyCode || 'EGP').toUpperCase().trim();
    const rate = parseFloat(exchangeRate || 1);

    // القيمة الأصلية بـ عملة الفاتورة
    const origVal = parseFloat(amount || 0);

    // القيمة المحولة صراحة بعملة الفرع الأساسية
    const baseVal = (baseAmount !== undefined && baseAmount !== null && !isNaN(parseFloat(baseAmount)))
        ? parseFloat(baseAmount)
        : (origVal * rate);

    // 🎯 شرط كشف العملة الأجنبية: إما باختلاف رمز العملة أو بوجود فرق رقمي بين المبلغان
    const isForeign = !isUnified && (invCurr !== activeCurr || Math.abs(baseVal - origVal) > 0.01);

    const origFullName = getCurrencyFullName(invCurr, lang);
    const activeFullName = getCurrencyFullName(activeCurr, lang);

    const origSymbol = getCurrencySymbol(invCurr, lang);
    const activeSymbol = getCurrencySymbol(activeCurr, lang);

    const fontSize = size === 'caption' ? '11px' : '13px';
    const subFontSize = size === 'caption' ? '9.5px' : '11px';

    if (!isForeign) {
        return (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant={size} sx={{ fontSize, fontWeight: isBold ? 700 : 500, color }}>
                    <bdi>{formatCurrency(origVal)}</bdi>
                </Typography>
                <Tooltip title={origFullName} arrow placement="top">
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
                        ({origSymbol})
                    </Typography>
                </Tooltip>
            </Box>
        );
    }

    const calculatedRate = origVal > 0 ? (baseVal / origVal) : rate;
    const tooltipTitle = `1 ${origSymbol} = ${formatCurrency(calculatedRate)} ${activeSymbol} (${activeFullName})`;

    return (
        <Box sx={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.2 }}>
            {/* السطر العلوي: القيمة بالعملة الأساسية (EGP) */}
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

            {/* السطر السفلي: القيمة الأصلية بالفاتورة ($) */}
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

const InvoicesPage = () => {
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
    const [invoices, setInvoices] = useState([]);
    const [totalRows, setTotalRows] = useState(0);
    const [activeTargetCurrency, setActiveTargetCurrency] = useState('DEFAULT');

    const totalPages = Math.ceil(totalRows / rowsPerPage);

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
            console.error('Error fetching currency settings:', err);
            return 'DEFAULT';
        }
    }, [userId]);

    const fetchPaginatedInvoices = useCallback(async () => {
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

            const response = await API.get('/financial/ledgers/paginated', { params });
            if (response.data) {
                const invoiceData = response.data.data || [];
                
                const sortedInvoices = [...invoiceData].sort((a, b) => {
                    const numA = parseInt(a.invoice_no, 10) || 0;
                    const numB = parseInt(b.invoice_no, 10) || 0;
                    if (numA !== 0 && numB !== 0) {
                        return numB - numA;
                    }
                    return String(b.invoice_no || '').localeCompare(String(a.invoice_no || ''), undefined, { numeric: true, sensitivity: 'base' });
                });

                setInvoices(sortedInvoices);
                setTotalRows(response.data.pagination?.totalRows || 0);
            }
        } catch (err) {
            console.error('Failed compiling paginated core invoice node ledger:', err);
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
            fetchPaginatedInvoices();
        }
    }, [searchParams, userId, page, rowsPerPage, fetchPaginatedInvoices, setSearchParams, accountId]);

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

    const backArrow = <ArrowBackIcon sx={isRtl ? { transform: 'scaleX(-1)' } : undefined} />;

    const getStickyCellStyle = (isHeader = false) => ({
        position: 'sticky',
        insetInlineStart: 0,
        zIndex: isHeader ? 10 : 5,
        backgroundColor: theme.palette.background.paper,
        backgroundImage: 'none',
        borderInlineEnd: `1px solid ${theme.palette.divider}`,
        minWidth: 160,
    });

    return (
        <Layout title={t.allInvoicesTitle || 'Master Invoices Ledger'}>
            <Box sx={{ mb: 3 }}>
                <Button 
                    size="small" 
                    startIcon={!isRtl ? backArrow : undefined}
                    endIcon={isRtl ? backArrow : undefined}
                    onClick={handleBackNavigation}
                >
                    {accountId ? t.backToBranch : t.backToGlobalWorkspace}
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
                                <Table size="small" sx={{ minWidth: 1250 }}>
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
                                                {t.documentId}
                                            </TableCell>

                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 180 }}>
                                                {!accountId ? (t.accountAndBranch || 'Account / Branch') : (t.branchLabel || 'Branch')}
                                            </TableCell>

                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 150 }}>{t.grossSubtotal || 'Gross Subtotal'}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 140 }}>{t.netRevenueLabel || 'Net Revenue'}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 120 }}>{t.taxLabel || 'Tax'}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 170 }}>{t.totalLabel || 'Gross Total'}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 140 }}>{t.totalFleetCogs || 'COGS Cost'}</TableCell>
                                            <TableCell sx={{ fontWeight: 700, py: 2, minWidth: 130 }} align="center">{t.paymentStatusLabel || 'Payment'}</TableCell>
                                            <TableCell sx={{ fontWeight: 700, py: 2, minWidth: 140 }} align="center">{t.deliveryStatusLabel || 'Delivery'}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, px: 2, minWidth: 130 }}>{t.createdAt}</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {invoices.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={10} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                                                    {t.noTransactions}
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            invoices.map((inv) => {
                                                const returnedAmount = parseFloat(inv.total_returned || 0);

                                                return (
                                                    <TableRow 
                                                        key={inv.id} 
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
                                                                fontWeight: 700, 
                                                                py: 1.8, 
                                                                px: 2,
                                                                color: 'text.primary',
                                                                ...getStickyCellStyle(false)
                                                            }}
                                                        >
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                #{inv.invoice_no || 'N/A'}
                                                                {inv.is_return === 1 && (
                                                                    <Chip 
                                                                        label={t.statusReturned || (lang === 'ar' ? 'مرتجع' : 'Returned')} 
                                                                        size="small" 
                                                                        color="error" 
                                                                        variant="filled" 
                                                                        sx={{ height: 18, fontSize: '10px', fontWeight: 700 }} 
                                                                    />
                                                                )}
                                                                {inv.is_return === 2 && (
                                                                    <Chip 
                                                                        label={t.statusPartialReturned || (lang === 'ar' ? 'مرتجع جزئياً' : 'Partially Returned')} 
                                                                        size="small" 
                                                                        color="warning" 
                                                                        variant="filled" 
                                                                        sx={{ height: 18, fontSize: '10px', fontWeight: 700 }} 
                                                                    />
                                                                )}
                                                            </Box>
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ color: 'text.secondary', fontSize: '13px', py: 1.8 }}>
                                                            {!accountId ? (
                                                                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                                                    <Typography variant="body2" sx={{ fontSize: '13px', fontWeight: 600, color: 'text.primary' }}>
                                                                        {inv.account_name || '—'}
                                                                    </Typography>
                                                                    {inv.branch_name && (
                                                                        <Typography variant="caption" sx={{ fontSize: '11px', color: 'primary.main', fontWeight: 500 }}>
                                                                            {inv.branch_name}
                                                                        </Typography>
                                                                    )}
                                                                </Box>
                                                            ) : (
                                                                <Typography variant="body2" sx={{ fontSize: '13px', fontWeight: 600, color: 'text.primary' }}>
                                                                    {inv.branch_name || '—'}
                                                                </Typography>
                                                            )}
                                                        </TableCell>

                                                        {/* Gross Subtotal */}
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 1.8 }}>
                                                            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                                                <CurrencyDisplay
                                                                    amount={inv.gross_subtotal}
                                                                    baseAmount={inv.base_gross_subtotal}
                                                                    currencyCode={inv.currency_code}
                                                                    baseCurrencyCode={inv.account_base_currency}
                                                                    exchangeRate={inv.exchange_rate}
                                                                    isUnified={inv.is_unified}
                                                                    displayCurrency={inv.display_currency}
                                                                    lang={lang}
                                                                />
                                                                {parseFloat(inv.total_discount || 0) > 0 && (
                                                                    <Typography variant="caption" color="error.main" sx={{ fontSize: '11px', fontWeight: 600, mt: 0.2 }}>
                                                                        -<bdi>{formatCurrency(inv.total_discount)}</bdi> {t.discount || 'Discount'}
                                                                    </Typography>
                                                                )}
                                                            </Box>
                                                        </TableCell>

                                                        {/* Net Revenue */}
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 1.8 }}>
                                                            <CurrencyDisplay
                                                                amount={inv.net_revenue}
                                                                baseAmount={inv.base_net_revenue}
                                                                currencyCode={inv.currency_code}
                                                                baseCurrencyCode={inv.account_base_currency}
                                                                exchangeRate={inv.exchange_rate}
                                                                isUnified={inv.is_unified}
                                                                displayCurrency={inv.display_currency}
                                                                lang={lang}
                                                                isBold
                                                            />
                                                        </TableCell>

                                                        {/* Tax */}
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 1.8 }}>
                                                            <CurrencyDisplay
                                                                amount={inv.tax_amount}
                                                                baseAmount={inv.base_tax_amount}
                                                                currencyCode={inv.currency_code}
                                                                baseCurrencyCode={inv.account_base_currency}
                                                                exchangeRate={inv.exchange_rate}
                                                                isUnified={inv.is_unified}
                                                                displayCurrency={inv.display_currency}
                                                                lang={lang}
                                                                color="text.secondary"
                                                            />
                                                        </TableCell>

                                                        {/* Gross Total */}
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 1.8 }}>
                                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                                                                <CurrencyDisplay
                                                                    amount={inv.total_amount}
                                                                    baseAmount={inv.base_total_amount}
                                                                    currencyCode={inv.currency_code}
                                                                    baseCurrencyCode={inv.account_base_currency}
                                                                    exchangeRate={inv.exchange_rate}
                                                                    isUnified={inv.is_unified}
                                                                    displayCurrency={inv.display_currency}
                                                                    lang={lang}
                                                                    isBold
                                                                />

                                                                {returnedAmount > 0 && (
                                                                    <Typography variant="caption" color="error.main" sx={{ fontSize: '11px', fontWeight: 700, mt: 0.2 }}>
                                                                        -<bdi>{formatCurrency(returnedAmount)}</bdi> {getCurrencySymbol(inv.display_currency || inv.account_base_currency, lang)} ({lang === 'ar' ? 'مرتجع' : 'Returned'})
                                                                    </Typography>
                                                                )}

                                                                {parseInt(inv.payment_status, 10) === 1 && (
                                                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.1, mt: 0.2 }}>
                                                                        <CurrencyDisplay
                                                                            amount={inv.summary_paid}
                                                                            baseAmount={inv.base_summary_paid}
                                                                            currencyCode={inv.currency_code}
                                                                            baseCurrencyCode={inv.account_base_currency}
                                                                            exchangeRate={inv.exchange_rate}
                                                                            isUnified={inv.is_unified}
                                                                            displayCurrency={inv.display_currency}
                                                                            lang={lang}
                                                                            size="caption"
                                                                            color="success.main"
                                                                        />
                                                                        <CurrencyDisplay
                                                                            amount={inv.summary_unpaid}
                                                                            baseAmount={inv.base_summary_unpaid}
                                                                            currencyCode={inv.currency_code}
                                                                            baseCurrencyCode={inv.account_base_currency}
                                                                            exchangeRate={inv.exchange_rate}
                                                                            isUnified={inv.is_unified}
                                                                            displayCurrency={inv.display_currency}
                                                                            lang={lang}
                                                                            size="caption"
                                                                            color="warning.main"
                                                                        />
                                                                    </Box>
                                                                )}
                                                            </Box>
                                                        </TableCell>

                                                        {/* COGS */}
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 1.8 }}>
                                                            <CurrencyDisplay
                                                                amount={inv.total_cogs}
                                                                baseAmount={inv.total_cogs}
                                                                currencyCode={inv.account_base_currency || inv.currency_code}
                                                                baseCurrencyCode={inv.account_base_currency}
                                                                exchangeRate={1}
                                                                isUnified={inv.is_unified}
                                                                displayCurrency={inv.display_currency}
                                                                lang={lang}
                                                            />
                                                        </TableCell>

                                                        <TableCell align="center"><PaymentStatusChip statusId={inv.payment_status} t={t} /></TableCell>
                                                        <TableCell align="center"><DeliveryStatusChip statusId={inv.requisition_delivery_status} t={t} /></TableCell>
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontSize: '12px', color: 'text.secondary', px: 2 }}>
                                                            <bdi>{new Date(inv.issue_date).toLocaleDateString()}</bdi>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>

                            {/* FOOTER PAGINATION */}
                            <Box 
                                sx={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justify: 'space-between', 
                                    p: 2, 
                                    flexWrap: 'wrap',
                                    gap: 2,
                                    borderTop: `1px solid ${theme.palette.divider}`,
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                                        {t.rowsPerPage || 'Rows per page:'}
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
                                        <bdi>{`${((page - 1) * rowsPerPage) + 1}-${Math.min(page * rowsPerPage, totalRows)} ${t.of || 'of'} ${totalRows}`}</bdi>
                                    </Typography>

                                    <Pagination
                                        count={totalPages || 1}
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
        </Layout>
    );
};

export default InvoicesPage;