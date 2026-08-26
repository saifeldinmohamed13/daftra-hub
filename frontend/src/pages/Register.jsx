import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
    Box, Card, CardContent, TextField, Button, Typography,
    Alert, Avatar, IconButton, Tooltip, Stack,
} from '@mui/material';
import {
    StorageRounded as StorageIcon,
    TranslateRounded as TranslateIcon,
    LightModeOutlined as LightModeIcon,
    DarkModeOutlined as DarkModeIcon,
    CheckCircleRounded as CheckIcon,
    CancelRounded as CancelIcon,
} from '@mui/icons-material';
import API from '../services/api';
import { useLanguage } from '../LanguageContext';
import { useColorMode } from '../ThemeContext';

const Register = () => {
    const [name,            setName]            = useState('');
    const [email,           setEmail]           = useState('');
    const [password,        setPassword]        = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading,         setLoading]         = useState(false);
    const [error,           setError]           = useState('');

    const navigate = useNavigate();
    const { lang, toggleLang, t } = useLanguage();
    const { toggleColorMode, mode } = useColorMode();
    const isRtl = t.dir === 'rtl';

    // Live password rules evaluation
    const passwordRules = {
        minChar:      password.length >= 8,
        hasNumber:    /\d/.test(password),
        hasUpperCase: /[A-Z]/.test(password),
        hasSpecial:   /[@$!%*?&#]/.test(password),
    };
    const isPasswordValid = Object.values(passwordRules).every(Boolean);

    const handleRegisterSubmit = async (e) => {
        e.preventDefault();
        setError('');

        // Client-side validation before touching the network
        if (password !== confirmPassword) {
            setError(t.passwordMismatch || 'Passwords do not match!');
            return;
        }
        if (!isPasswordValid) {
            setError(t.passwordTooWeak || 'Password does not meet all requirements.');
            return;
        }

        // Only start loading after validation passes
        setLoading(true);
        try {
            // Register the new user
            await API.post('/auth/register', { name, email, password });

            // Auto-login to get the session token
            const loginResponse = await API.post('/auth/login', { email, password });

            // Persist session — same pattern as Login.jsx
            localStorage.setItem('token',     loginResponse.data.token);
            localStorage.setItem('userId',    loginResponse.data.user.id);
            localStorage.setItem('userEmail', loginResponse.data.user.email);
            localStorage.setItem('userName',  loginResponse.data.user.name || name);

            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.error || t.registrationFailedError);
        } finally {
            setLoading(false);
        }
    };

    // Inline rule status indicator
    const RuleItem = ({ isPassed, label }) => (
        <Stack direction="row" spacing={0.8} alignItems="center" sx={{ opacity: isPassed ? 1 : 0.6 }}>
            {isPassed
                ? <CheckIcon  sx={{ fontSize: '14px', color: 'success.main' }} />
                : <CancelIcon sx={{ fontSize: '14px', color: 'text.secondary' }} />
            }
            <Typography
                variant="caption" fontWeight={600}
                color={isPassed ? 'success.main' : 'text.secondary'}
                sx={{ transition: 'color 0.2s ease' }}
            >
                {label}
            </Typography>
        </Stack>
    );

    return (
        <Box
            dir={t.dir}
            sx={{
                minHeight: '100vh', display: 'flex', alignItems: 'center',
                justifyContent: 'center', bgcolor: 'background.default',
                position: 'relative', p: 2,
            }}
        >
            {/* Top-right toolbar */}
            <Box sx={{ position: 'absolute', top: 16, insetInlineEnd: 16, display: 'flex', gap: 0.5 }}>
                <Tooltip title={lang === 'en' ? 'التبديل للعربية' : 'Switch to English'}>
                    <IconButton onClick={toggleLang} size="small">
                        <TranslateIcon fontSize="small" />
                        <Typography variant="caption" fontWeight={700} sx={{ mx: 0.5 }}>
                            {lang === 'en' ? 'AR' : 'EN'}
                        </Typography>
                    </IconButton>
                </Tooltip>
                <Tooltip title={mode === 'light' ? t.switchToDark : t.switchToLight}>
                    <IconButton onClick={toggleColorMode} size="small">
                        {mode === 'light' ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />}
                    </IconButton>
                </Tooltip>
            </Box>

            <Card sx={{ width: '100%', maxWidth: 420, border: '1px solid', borderColor: 'divider' }} elevation={0}>
                <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
                        <Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48, mb: 1.5 }}>
                            <StorageIcon />
                        </Avatar>
                        <Typography variant="h6" fontWeight={700} align="center">{t.registerTitle}</Typography>
                    </Box>

                    {error && (
                        <Alert severity="error" sx={{ mb: 3, fontSize: '13px', fontWeight: 600 }}>
                            {error}
                        </Alert>
                    )}

                    <Box component="form" onSubmit={handleRegisterSubmit}>
                        <Stack spacing={2.5}>
                            <TextField
                                label={t.fullName || 'Full Name'} type="text" placeholder="Saif Izam"
                                value={name} onChange={(e) => setName(e.target.value)}
                                fullWidth required
                            />
                            <TextField
                                label={t.platformEmail} type="email" placeholder="admin@hub.com"
                                value={email} onChange={(e) => setEmail(e.target.value)}
                                fullWidth required
                            />
                            <TextField
                                label={t.platformPassword} type="password" placeholder="••••••••"
                                value={password} onChange={(e) => setPassword(e.target.value)}
                                fullWidth required
                            />

                            {/* Live password rules panel */}
                            {password.length > 0 && (
                                <Box sx={{ bgcolor: 'action.hover', p: 1.5, borderRadius: '8px', mt: -1.5 }}>
                                    <Stack spacing={0.8}>
                                        <RuleItem isPassed={passwordRules.minChar}      label={t.pwdMinChar} />
                                        <RuleItem isPassed={passwordRules.hasNumber}    label={t.pwdNumber} />
                                        <RuleItem isPassed={passwordRules.hasUpperCase} label={t.pwdUpperCase} />
                                        <RuleItem isPassed={passwordRules.hasSpecial}   label={t.pwdSpecialChar} />
                                    </Stack>
                                </Box>
                            )}

                            <TextField
                                label={t.confirmPassword || 'Confirm Password'} type="password" placeholder="••••••••"
                                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                                fullWidth required
                            />
                            <Button
                                type="submit" variant="contained" size="large"
                                fullWidth disabled={loading} sx={{ py: 1.2, fontWeight: 700 }}
                            >
                                {loading ? t.creatingAccount : t.registerAndEnter}
                            </Button>
                        </Stack>
                    </Box>

                    <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 3, fontWeight: 500 }}>
                        {t.haveAccount}{' '}
                        <Link to="/login" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>
                            {t.loginHere}
                        </Link>
                    </Typography>
                </CardContent>
            </Card>
        </Box>
    );
};

export default Register;
