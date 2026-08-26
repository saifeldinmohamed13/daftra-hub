import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
    Box, Card, CardContent, TextField, Button,
    Typography, Alert, Avatar, IconButton, Tooltip, Stack,
} from '@mui/material';
import {
    StorageRounded as StorageIcon,
    TranslateRounded as TranslateIcon,
    LightModeOutlined as LightModeIcon,
    DarkModeOutlined as DarkModeIcon,
} from '@mui/icons-material';
import API from '../services/api';
import { useLanguage } from '../LanguageContext';
import { useColorMode } from '../ThemeContext';

const Login = () => {
    const [email,    setEmail]    = useState('');
    const [password, setPassword] = useState('');
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState('');

    const navigate = useNavigate();
    const { lang, toggleLang, t } = useLanguage();
    const { toggleColorMode, mode } = useColorMode();

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await API.post('/auth/login', { email, password });

            // Persist session — token is used by api.js interceptor for all future requests
            localStorage.setItem('token',     response.data.token);
            localStorage.setItem('userId',    response.data.user.id);
            localStorage.setItem('userEmail', response.data.user.email);
            localStorage.setItem('userName',  response.data.user.name || response.data.user.email.split('@')[0]);

            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.error || t.invalidCredentialsError);
        } finally {
            setLoading(false);
        }
    };

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
                        <Typography variant="h6" fontWeight={700} align="center">{t.loginTitle}</Typography>
                    </Box>

                    {error && (
                        <Alert severity="error" sx={{ mb: 3, fontSize: '13px', fontWeight: 600 }}>
                            {error}
                        </Alert>
                    )}

                    <Box component="form" onSubmit={handleLoginSubmit}>
                        <Stack spacing={2.5}>
                            <TextField
                                label={t.emailAddress} type="email" placeholder="admin@hub.com"
                                value={email} onChange={(e) => setEmail(e.target.value)}
                                fullWidth required
                            />
                            <TextField
                                label={t.password} type="password" placeholder="••••••••"
                                value={password} onChange={(e) => setPassword(e.target.value)}
                                fullWidth required
                            />
                            <Button
                                type="submit" variant="contained" size="large"
                                fullWidth disabled={loading} sx={{ py: 1.2, fontWeight: 700 }}
                            >
                                {loading ? t.authenticating : t.login}
                            </Button>
                        </Stack>
                    </Box>

                    <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 3, fontWeight: 500 }}>
                        {t.noAccount}{' '}
                        <Link to="/register" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>
                            {t.registerHere}
                        </Link>
                    </Typography>
                </CardContent>
            </Card>
        </Box>
    );
};

export default Login;
