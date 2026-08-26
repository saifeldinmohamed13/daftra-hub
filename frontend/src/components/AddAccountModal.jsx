import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Button,
    Box,
    Typography,
    Alert,
    InputAdornment,
    IconButton,
    LinearProgress,
} from '@mui/material';
import { StorageRounded as StorageIcon, Visibility, VisibilityOff, WarningRounded as WarningIcon, Launch as LaunchIcon } from '@mui/icons-material';
import API from '../services/api';
import { useLanguage } from '../LanguageContext';

const AddAccountModal = ({ open, onClose, userId, onAccountAdded }) => {
    const { t } = useLanguage();
    const [subdomain, setSubdomain] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [isAppDeactivated, setIsAppDeactivated] = useState(false);

    // Structural Background Progress States
    const [showConfirm, setShowConfirm] = useState(false);
    const [syncJobId, setSyncJobId] = useState(null);
    const [jobStatus, setJobStatus] = useState(null);

    // Clean states reset function
    const resetAndClose = () => {
        setSubdomain('');
        setEmail('');
        setPassword('');
        setError('');
        setIsAppDeactivated(false);
        setLoading(false);
        setShowConfirm(false);
        setSyncJobId(null);
        setJobStatus(null);
        onClose();
    };

    // Step 1: Preliminary form validation trigger before showing confirmation warning
    const handlePreSubmit = (e) => {
        e.preventDefault();
        setError('');
        setIsAppDeactivated(false);
        setShowConfirm(true);
    };

    // Step 2: User confirmed -> Execute rapid handshake request
    const handleLaunchSync = async () => {
        setShowConfirm(false);
        setLoading(true);
        setError('');
        setIsAppDeactivated(false);

        try {
            const response = await API.post('/auth/daftra-login', {
                subdomain,
                email,
                password,
                userId,
            });

            if (response.data?.backgroundJobLaunched) {
                setSyncJobId(response.data.jobId);
                localStorage.setItem('temp_last_account', JSON.stringify(response.data.account));
            }
        } catch (err) {
            const backendError = err.response?.data?.error || t.daftraAuthFailedError;
            setError(backendError);

            // 🎯 كشف إذا كان الخطأ بسبب إلغاء تفعيل التطبيق
            if (err.response?.status === 403 || backendError.includes('غير مفعل') || backendError.includes('deactivated')) {
                setIsAppDeactivated(true);
            }

            setLoading(false);
        }
    };

    // Step 3: Polling Telemetry Mechanism loop
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
                        const savedAccount = JSON.parse(localStorage.getItem('temp_last_account')) || {};
                        const successMessage = t.connectSuccessMessage ? t.connectSuccessMessage(job.total_records) : `Successfully imported ${job.total_records} historical components!`;
                        
                        onAccountAdded(savedAccount, successMessage);
                        resetAndClose();
                    } else if (job.status === 'failed') {
                        clearInterval(pollingInterval);
                        setError(job.error_message || t.criticalSyncFailureError);
                        setLoading(false);
                        setSyncJobId(null);
                        setJobStatus(null);
                    }
                } catch (pollErr) {
                    console.error("Telemetry polling failed:", pollErr.message);
                }
            }, 1500);
        }

        return () => {
            if (pollingInterval) clearInterval(pollingInterval);
        };
    }, [syncJobId]);

    const renderStepMessage = (step) => {
        const stepsMap = {
            initializing: t.stepInitializing,
            fetching_clients: t.stepClients,
            fetching_invoices: t.stepInvoices,
            fetching_expenses: t.stepExpenses,
            fetching_incomes: t.stepIncomes,
            final_rollup: t.stepRollup,
        };
        return stepsMap[step] || t.stepGeneric;
    };

    const cleanSubdomainStr = subdomain.replace('https://', '').replace('http://', '').split('.')[0].trim();

    return (
        <Dialog open={open} onClose={loading ? undefined : resetAndClose} fullWidth maxWidth="sm" dir={t.dir}>
            {/* ⚠️ LAYOUT A: WARNING CONFIRMATION SCREEN */}
            {showConfirm ? (
                <Box>
                    <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
                        <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: 'rgba(245, 158, 11, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <WarningIcon sx={{ color: 'warning.main' }} fontSize="small" />
                        </Box>
                        <Typography variant="subtitle1" fontWeight={700}>
                            {t.warningTitle || 'Large Database Volume Notice'}
                        </Typography>
                    </DialogTitle>
                    <DialogContent>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.6 }}>
                            {t.warningBody || 'Connecting this workspace requires importing historical transactions, invoices, and clients dynamically. For large branch databases, this process runs as a safe async background thread. Do you want to proceed into verification cycles?'}
                        </Typography>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2.5 }}>
                        <Button onClick={() => setShowConfirm(false)} color="inherit">{t.cancel}</Button>
                        <Button onClick={handleLaunchSync} variant="contained" color="warning">{t.confirmAndSync || 'Proceed'}</Button>
                    </DialogActions>
                </Box>
            ) : syncJobId ? (
                /* 📊 LAYOUT B: LIVE SYSTEM PROGRESS LOADER SCREEN */
                <Box sx={{ p: 4, textAlign: 'center' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
                        <StorageIcon color="primary" sx={{ fontSize: 44, animation: 'pulse 2s infinite' }} />
                    </Box>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                        {t.syncingDataTitle || 'Ingesting Multi-Tenant Workspace Logs'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        {jobStatus ? renderStepMessage(jobStatus.current_step) : t.stepPreparing}
                    </Typography>

                    <Box sx={{ width: '100%', mb: 2 }}>
                        <LinearProgress 
                            variant="determinate" 
                            value={jobStatus ? jobStatus.progress_percentage : 0} 
                            sx={{ height: 8, borderRadius: 4 }}
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
            ) : (
                /* 🛠️ LAYOUT C: STANDARD FORMS CREDENTIALS CAPTURE INPUT LAYOUT */
                <Box component="form" onSubmit={handlePreSubmit}>
                    <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
                        <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: 'rgba(37, 99, 235, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <StorageIcon color="primary" fontSize="small" />
                        </Box>
                        <Box>
                            <Typography variant="subtitle1" fontWeight={700}>{t.connectNewBranch}</Typography>
                            <Typography variant="caption" color="text.secondary">{t.connectNewBranchSub}</Typography>
                        </Box>
                    </DialogTitle>

                    <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }} style={{ paddingTop: 15 }}>
                        {error && (
                            <Alert 
                                severity="error"
                                action={
                                    isAppDeactivated && cleanSubdomainStr ? (
                                        <Button 
                                            color="inherit" 
                                            size="small" 
                                            endIcon={<LaunchIcon fontSize="inherit" />}
                                            href={`https://${cleanSubdomainStr}.daftra.com/owner/apps`}
                                            target="_blank"
                                        >
                                            تفعيل الآن
                                        </Button>
                                    ) : null
                                }
                            >
                                {error}
                            </Alert>
                        )}

                        <TextField
                            label={t.daftraSubdomain}
                            placeholder="branch-subdomain"
                            value={subdomain}
                            onChange={(e) => setSubdomain(e.target.value)}
                            size="small"
                            fullWidth
                            required
                            disabled={loading}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end" dir="ltr">.daftra.com</InputAdornment>
                                ),
                            }}
                        />
                        <TextField
                            label={t.daftraEmail}
                            type="email"
                            placeholder="user@daftra.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            size="small"
                            fullWidth
                            required
                            disabled={loading}
                        />
                        <TextField
                            label={t.daftraPassword}
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            size="small"
                            fullWidth
                            required
                            disabled={loading}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton size="small" onClick={() => setShowPassword((s) => !s)} edge="end">
                                            {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                                        </IconButton>
                                    </InputAdornment>
                                ),
                            }}
                        />
                    </DialogContent>

                    <DialogActions sx={{ px: 3, pb: 2.5 }}>
                        <Button onClick={resetAndClose} color="inherit" disabled={loading}>{t.cancel}</Button>
                        <Button type="submit" variant="contained" disabled={loading}>
                            {loading ? t.verifying || 'Verifying...' : t.verifyAndAdd}
                        </Button>
                    </DialogActions>
                </Box>
            )}
        </Dialog>
    );
};

export default AddAccountModal;