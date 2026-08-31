import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
    Box, Card, CardContent, Grid, Typography, Button,
    CircularProgress, Chip, Paper, Tooltip, Avatar, useTheme, alpha
} from '@mui/material';
import {
    ArrowBackRounded as ArrowBackIcon,
    AccountBalanceWalletRounded as WalletIcon,
    ArrowForwardRounded as ArrowForwardIcon,
} from '@mui/icons-material';
import API from '../services/api';
import Layout from '../components/Layout';
import { useLanguage } from '../LanguageContext';
import { formatCurrency } from '../utils/formatters';
import { getCurrencyFullName, getCurrencySymbol } from '../i18n/currencies';

const TreasuryStatusChip = ({ status, t }) => {
    const theme = useTheme();
    const map = {
        active:   { label: t?.active   || 'Active',   color: theme.palette.success.main },
        inactive: { label: t?.inactive || 'Inactive', color: theme.palette.text.secondary },
        frozen:   { label: t?.frozen   || 'Frozen',   color: theme.palette.error.main },
    };
    const cfg = map[status] || map.active;

    return (
        <Chip
            label={cfg.label} 
            size="small" 
            sx={{ 
                height: 22, 
                fontSize: '10.5px', 
                fontWeight: 700,
                borderRadius: '6px',
                bgcolor: alpha(cfg.color, 0.1),
                color: cfg.color,
                border: `1px solid ${alpha(cfg.color, 0.2)}`
            }}
        />
    );
};

const TreasuriesPage = () => {
    const navigate = useNavigate();
    const theme = useTheme();
    const [searchParams] = useSearchParams();
    const { t, lang } = useLanguage();
    const isRtl = lang === 'ar' || t.dir === 'rtl';

    const accountId = searchParams.get('accountId');
    const userId    = localStorage.getItem('userId');

    const [loading,    setLoading]    = useState(true);
    const [treasuries, setTreasuries] = useState([]);

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

    const fetchTreasuries = useCallback(async () => {
        setLoading(true);
        try {
            const currentTargetCurr = await fetchCurrencySettings();

            const params = accountId ? { accountId } : {};
            if (currentTargetCurr !== 'DEFAULT') {
                params.targetCurrency = currentTargetCurr;
            }

            const response = await API.get(`/financial/treasuries/user/${userId}`, { params });
            if (response.data) setTreasuries(response.data);
        } catch (err) {
            console.error('Failed fetching treasuries list:', err);
        } finally {
            setLoading(false);
        }
    }, [userId, accountId, fetchCurrencySettings]);

    useEffect(() => {
        if (userId) fetchTreasuries();
    }, [userId, accountId, fetchTreasuries]);

    const handleBackNavigation = () => {
        if (accountId) navigate(`/dashboard/branch/${accountId}`);
        else           navigate('/dashboard');
    };

    const backArrow = <ArrowBackIcon sx={isRtl ? { transform: 'scaleX(-1)' } : undefined} />;

    return (
        <Layout title={t.allTreasuriesTitle || 'Treasuries & Bank Accounts'}>
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

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress />
                </Box>
            ) : treasuries.length === 0 ? (
                <Card sx={{ p: 6, textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                    <WalletIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                    <Typography variant="h6" color="text.secondary">
                        {t.noTreasuriesFound || 'No treasuries or bank accounts connected.'}
                    </Typography>
                </Card>
            ) : (
                <Grid container spacing={3}>
                    {treasuries.map((item) => {
                        const activeCurr = (item.display_currency || item.currency_code || 'EGP').toUpperCase().trim();
                        const currSymbol = getCurrencySymbol(activeCurr, lang);
                        const currFullName = getCurrencyFullName(activeCurr, lang);
                        const balanceVal = parseFloat(item.current_balance || 0);

                        return (
                            <Grid item xs={12} sm={6} md={4} key={`${item.account_id}_${item.journal_account_id}`}>
                                <Card
                                    elevation={0}
                                    sx={{
                                        height: '100%',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justify: 'space-between',
                                        borderRadius: 3,
                                        border: `1px solid ${theme.palette.divider}`,
                                        background: theme.palette.mode === 'dark'
                                            ? '#1e293b'
                                            : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                                        transition: 'all 0.25s ease-in-out',
                                        '&:hover': {
                                            transform: 'translateY(-4px)',
                                            boxShadow: theme.palette.mode === 'dark'
                                                ? '0 12px 24px -10px rgba(0,0,0,0.5)'
                                                : '0 12px 24px -10px rgba(15, 23, 42, 0.08)',
                                            borderColor: alpha(theme.palette.primary.main, 0.4),
                                        }
                                    }}
                                >
                                    <CardContent sx={{ p: 2.5, pb: 2 }}>
                                        {/* 1. Header: Icon + Name + Active Status */}
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2.5 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                <Avatar
                                                    sx={{
                                                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                                                        color: 'primary.main',
                                                        width: 44,
                                                        height: 44,
                                                        borderRadius: 2.5
                                                    }}
                                                >
                                                    <WalletIcon />
                                                </Avatar>
                                                <Box>
                                                    <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                                                        {item.treasury_name}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                                                        {item.account_name} • {item.branch_name} 
                                                    </Typography>
                                                </Box>
                                            </Box>

                                            <TreasuryStatusChip status={item.status || 'active'} t={t} />
                                        </Box>

                                        {/* 2. Balance Container */}
                                        <Box
                                            sx={{
                                                p: 2,
                                                borderRadius: 2.5,
                                                bgcolor: theme.palette.mode === 'dark'
                                                    ? alpha(theme.palette.background.default, 0.6)
                                                    : alpha(theme.palette.primary.main, 0.03),
                                                border: `1px solid ${alpha(theme.palette.primary.main, 0.08)}`,
                                                textAlign: isRtl ? 'right' : 'left'
                                            }}
                                        >
                                            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ letterSpacing: 0.3 }}>
                                                {t.liveBalance || 'Current Balance'}
                                            </Typography>

                                            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.8, mt: 0.5, flexWrap: 'wrap' }}>
                                                <Typography
                                                    variant="h5"
                                                    fontWeight={800}
                                                    color={balanceVal >= 0 ? 'primary.main' : 'error.main'}
                                                    sx={{ fontSize: { xs: '22px', sm: '24px' }, letterSpacing: -0.5 }}
                                                >
                                                    <bdi>{formatCurrency(balanceVal)}</bdi>
                                                </Typography>

                                                <Tooltip title={currFullName} arrow placement="top">
                                                    <Typography
                                                        component="span"
                                                        variant="subtitle2"
                                                        fontWeight={700}
                                                        color="text.secondary"
                                                        sx={{ cursor: 'pointer' }}
                                                    >
                                                        {currSymbol}
                                                    </Typography>
                                                </Tooltip>
                                            </Box>
                                        </Box>
                                    </CardContent>

                                    {/* 3. Footer Action Button */}
                                    <Box sx={{ px: 2.5, pb: 2.5 }}>
                                        <Button
                                            fullWidth
                                            variant="outlined"
                                            color="primary"
                                            size="small"
                                            endIcon={!isRtl ? <ArrowForwardIcon /> : undefined}
                                            startIcon={isRtl ? <ArrowForwardIcon sx={{ transform: 'scaleX(-1)' }} /> : undefined}
                                            onClick={() => navigate(`/treasuries/${item.account_id}/${item.journal_account_id}`)}
                                            sx={{
                                                borderRadius: 2,
                                                py: 0.8,
                                                fontWeight: 700,
                                                textTransform: 'none',
                                                fontSize: '13px',
                                                borderWidth: '1.5px',
                                                '&:hover': {
                                                    borderWidth: '1.5px',
                                                    bgcolor: alpha(theme.palette.primary.main, 0.04)
                                                }
                                            }}
                                        >
                                            {t.viewLedger || 'View Statement'}
                                        </Button>
                                    </Box>
                                </Card>
                            </Grid>
                        );
                    })}
                </Grid>
            )}
        </Layout>
    );
};

export default TreasuriesPage;