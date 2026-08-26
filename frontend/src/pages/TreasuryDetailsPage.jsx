import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Card, CardContent, Typography, Button, Paper,
    Chip, CircularProgress, Pagination, useTheme, alpha, Grid
} from '@mui/material';
import {
    ArrowBackRounded as ArrowBackIcon,
    AccountBalanceWalletRounded as WalletIcon,
    BusinessRounded as BranchIcon,
} from '@mui/icons-material';
import API from '../services/api';
import Layout from '../components/Layout';
import { useLanguage } from '../LanguageContext';
import { getCurrencyFullName, getCurrencySymbol } from '../i18n/currencies';
import { formatCurrency } from '../utils/formatters';

const TreasuryDetailsPage = () => {
    const { accountId, journalAccountId } = useParams();
    const navigate = useNavigate();
    const theme = useTheme();
    const { t, lang } = useLanguage();
    const isRtl = lang === 'ar' || t.dir === 'rtl';
    const userId = localStorage.getItem('userId');

    const [headerLoading, setHeaderLoading] = useState(true);
    const [txnsLoading,   setTxnsLoading]   = useState(true);
    const [header,        setHeader]        = useState(null);
    const [transactions,  setTxns]          = useState([]);
    const [openingBalance, setOpeningBalance] = useState(0);

    const [page,       setPage]       = useState(1);
    const [pagination, setPagination] = useState({ totalRows: 0, totalPages: 1 });

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

    const fetchTreasuryHeader = useCallback(async () => {
        setHeaderLoading(true);
        try {
            const currentTargetCurr = await fetchCurrencySettings();
            const params = {};
            if (currentTargetCurr !== 'DEFAULT') {
                params.targetCurrency = currentTargetCurr;
            }

            const res = await API.get(`/financial/treasuries/${accountId}/${journalAccountId}/header`, { params });
            if (res.data) setHeader(res.data);
        } catch (err) {
            console.error('Failed fetching treasury header:', err);
        } finally {
            setHeaderLoading(false);
        }
    }, [accountId, journalAccountId, fetchCurrencySettings]);

    const fetchTreasuryTransactions = useCallback(async (currPage = 1) => {
        setTxnsLoading(true);
        try {
            const currentTargetCurr = await fetchCurrencySettings();
            let endpoint = `/financial/treasuries/${accountId}/${journalAccountId}/transactions?page=${currPage}&limit=20`;
            if (currentTargetCurr !== 'DEFAULT') {
                endpoint += `&targetCurrency=${currentTargetCurr}`;
            }

            const res = await API.get(endpoint);
            if (res.data) {
                setTxns(res.data.data || []);
                setOpeningBalance(res.data.openingBalance || 0);
                setPagination(res.data.pagination || { totalRows: 0, totalPages: 1 });
            }
        } catch (err) {
            console.error('Failed fetching treasury ledger transactions:', err);
        } finally {
            setTxnsLoading(false);
        }
    }, [accountId, journalAccountId, fetchCurrencySettings]);

    useEffect(() => {
        if (accountId && journalAccountId) {
            fetchTreasuryHeader();
            fetchTreasuryTransactions(1);
        }
    }, [accountId, journalAccountId, fetchTreasuryHeader, fetchTreasuryTransactions]);

    const handlePageChange = (e, newPage) => {
        setPage(newPage);
        fetchTreasuryTransactions(newPage);
    };

    const backArrow = <ArrowBackIcon sx={isRtl ? { transform: 'scaleX(-1)' } : undefined} />;

    return (
        <Layout title={header ? header.treasury_name : (t.treasuryDetailsTitle || 'Treasury Activity Ledger')}>

            <Box sx={{ mb: 3 }}>
                <Button
                    size="small"
                    startIcon={!isRtl ? backArrow : undefined}
                    endIcon={isRtl ? backArrow : undefined}
                    onClick={() => navigate(-1)}
                >
                    {t.back || t.backToBranch || 'Back'}
                </Button>
            </Box>

            {headerLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
            ) : header && (
                <Paper
                    elevation={0}
                    sx={{
                        p: 3, mb: 3, borderRadius: 3,
                        border: `1px solid ${theme.palette.divider}`,
                        bgcolor: 'background.paper',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 2,
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{
                            width: 50, height: 50, borderRadius: 2, bgcolor: theme.palette.primary.main,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                        }}>
                            <WalletIcon sx={{ fontSize: 28 }} />
                        </Box>
                        <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="h6" fontWeight={800}>{header.treasury_name}</Typography>
                                <Chip
                                    label={t.active || 'Active'} color="success" size="small"
                                    sx={{ height: 20, fontSize: '10px', fontWeight: 700 }}
                                />
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                                #{header.journal_account_id} • {header.account_name}
                            </Typography>
                        </Box>
                    </Box>

                    <Box sx={{
                        borderInlineStart: `3px solid ${theme.palette.primary.main}`,
                        px: 2,
                    }}>
                        <Typography variant="h4" fontWeight={800} color="primary.main">
                            <bdi>{formatCurrency(header.current_balance)}</bdi> {getCurrencySymbol(header.display_currency || header.currency_code, lang)}
                        </Typography>
                        <Typography variant="caption" fontWeight={700} color="text.secondary">
                            {getCurrencyFullName((header.display_currency || header.currency_code || 'EGP').toUpperCase(), lang)}
                        </Typography>
                    </Box>
                </Paper>
            )}

            <Card sx={{ boxShadow: theme.palette.mode === 'dark' ? '0 4px 20px rgba(0,0,0,0.3)' : '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                    {txnsLoading ? (
                        <Box sx={{ p: 4 }}>
                            {[...Array(5)].map((_, i) => (
                                <Box key={i} sx={{
                                    height: 48, mb: 1, borderRadius: 1,
                                    bgcolor: 'action.hover', opacity: 1 - i * 0.15,
                                }} />
                            ))}
                        </Box>
                    ) : transactions.length === 0 ? (
                        <Box sx={{ p: 6, textAlign: 'center' }}>
                            <Typography variant="body2" color="text.secondary">
                                {t.noTransactions || 'No transactions recorded'}
                            </Typography>
                        </Box>
                    ) : (
                        <Box>
                            <Box sx={{
                                p: 2, 
                                bgcolor: alpha(theme.palette.action.hover, 0.05), 
                                borderBottom: `2px solid ${theme.palette.divider}`,
                            }}>
                                <Grid container spacing={2} alignItems="center">
                                    <Grid item xs={5}>
                                        <Typography variant="caption" fontWeight={700} color="text.secondary">
                                            {t.transactionDetails || 'Transaction Details'}
                                        </Typography>
                                    </Grid>
                                    <Grid item xs={2.2} textAlign="center">
                                        <Typography variant="caption" fontWeight={700} color="success.main">
                                            {t.inflowDebit || 'Inflow (+)'}
                                        </Typography>
                                    </Grid>
                                    <Grid item xs={2.3} textAlign="center">
                                        <Typography variant="caption" fontWeight={700} color="error.main">
                                            {t.outflowCredit || 'Outflow (-)'}
                                        </Typography>
                                    </Grid>
                                    <Grid item xs={2.5} textAlign="center">
                                        <Typography variant="caption" fontWeight={700} color="text.secondary">
                                            {t.runningBalance || 'Balance After'}
                                        </Typography>
                                    </Grid>
                                </Grid>
                            </Box>

                            {transactions.map((txn) => {
                                const debitVal  = parseFloat(txn.debit || 0);
                                const creditVal = parseFloat(txn.credit || 0);
                                const currCode  = (txn.display_currency || header?.display_currency || 'EGP').toUpperCase();

                                return (
                                    <Box
                                        key={`${txn.journal_id}_${txn.id}`}
                                        sx={{
                                            p: 2.5, 
                                            borderBottom: `1px solid ${theme.palette.divider}`,
                                            '&:hover': { bgcolor: theme.palette.action.hover },
                                        }}
                                    >
                                        <Grid container spacing={2} alignItems="center">
                                            <Grid item xs={5}>
                                                <Typography variant="body2" fontWeight={700} color="text.primary">
                                                    <bdi>{new Date(txn.transaction_date).toLocaleDateString()}</bdi>
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', my: 0.2 }}>
                                                    {txn.description || t.defaultTransactionLabel}
                                                </Typography>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                                                    <Chip
                                                        icon={<BranchIcon sx={{ fontSize: '12px !important' }} />}
                                                        label={txn.branch_name} size="small"
                                                        sx={{ fontSize: '10px', height: 20 }}
                                                    />
                                                </Box>
                                            </Grid>

                                            <Grid item xs={2.2} textAlign="center">
                                                {debitVal > 0 ? (
                                                    <Typography variant="subtitle2" fontWeight={800} color="success.main">
                                                        <bdi>{formatCurrency(debitVal)}</bdi> {getCurrencySymbol(currCode, lang)}
                                                    </Typography>
                                                ) : (
                                                    <Typography variant="body2" color="text.disabled">—</Typography>
                                                )}
                                            </Grid>

                                            <Grid item xs={2.3} textAlign="center">
                                                {creditVal > 0 ? (
                                                    <Typography variant="subtitle2" fontWeight={800} color="error.main">
                                                        -<bdi>{formatCurrency(creditVal)}</bdi> {getCurrencySymbol(currCode, lang)}
                                                    </Typography>
                                                ) : (
                                                    <Typography variant="body2" color="text.disabled">—</Typography>
                                                )}
                                            </Grid>

                                            <Grid item xs={2.5} textAlign="center">
                                                <Box sx={{
                                                    bgcolor: alpha(theme.palette.action.hover, 0.08), 
                                                    py: 1, px: 1.5, borderRadius: 1.5, display: 'inline-block', minWidth: 110
                                                }}>
                                                    <Typography variant="body2" fontWeight={800} color="text.primary">
                                                        <bdi>{formatCurrency(txn.running_balance)}</bdi> {getCurrencySymbol(currCode, lang)}
                                                    </Typography>
                                                </Box>
                                            </Grid>
                                        </Grid>
                                    </Box>
                                );
                            })}

                            <Box sx={{
                                p: 2.5, 
                                bgcolor: alpha(theme.palette.action.hover, 0.05), 
                                borderTop: `2px solid ${theme.palette.divider}`,
                            }}>
                                <Grid container spacing={2} alignItems="center">
                                    <Grid item xs={9.5}>
                                        <Typography variant="subtitle1" fontWeight={800} color="text.secondary">
                                            {t.openingBalance || 'الرصيد الافتتاحي'}
                                        </Typography>
                                    </Grid>
                                    <Grid item xs={2.5} textAlign="center">
                                        <Box sx={{
                                            bgcolor: alpha(theme.palette.primary.main, 0.08), 
                                            py: 1, px: 1.5, borderRadius: 1.5, display: 'inline-block', minWidth: 110
                                        }}>
                                            <Typography variant="subtitle1" fontWeight={800} color="primary.main">
                                                <bdi>{formatCurrency(openingBalance)}</bdi> {getCurrencySymbol(header?.display_currency || 'EGP', lang)}
                                            </Typography>
                                        </Box>
                                    </Grid>
                                </Grid>
                            </Box>

                            <Box sx={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                p: 2, borderTop: `1px solid ${theme.palette.divider}`, bgcolor: 'background.paper'
                            }}>
                                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                                    <bdi>
                                        {pagination.totalRows > 0
                                            ? `${((page - 1) * 20) + 1}–${Math.min(page * 20, pagination.totalRows)} ${t.of || 'of'} ${pagination.totalRows}`
                                            : '0'}
                                    </bdi>
                                </Typography>
                                <Pagination
                                    count={pagination.totalPages}
                                    page={page}
                                    onChange={handlePageChange}
                                    color="primary" size="small" shape="rounded"
                                    showFirstButton showLastButton
                                />
                            </Box>
                        </Box>
                    )}
                </CardContent>
            </Card>
        </Layout>
    );
};

export default TreasuryDetailsPage;