import { createTheme } from '@mui/material/styles';

const fontStack = (dir) =>
    dir === 'rtl'
        ? "'Cairo', 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif"
        : "'Inter', 'Segoe UI', Roboto, Arial, sans-serif";

const sharedDesignTokens = (dir, mode) => ({
    direction: dir,
    shape: {
        borderRadius: 10,
    },
    typography: {
        fontFamily: fontStack(dir),
        ...(dir === 'rtl' && {
            body1: { lineHeight: 1.9, letterSpacing: 0 },
            body2: { lineHeight: 1.85, letterSpacing: 0 },
            button: { letterSpacing: 0 },
            h6: { letterSpacing: 0 },
            subtitle1: { letterSpacing: 0 },
            subtitle2: { letterSpacing: 0 },
            caption: { letterSpacing: 0, lineHeight: 1.7 },
            overline: { letterSpacing: 0.5 },
        }),
        button: {
            textTransform: 'none',
            fontWeight: 600,
            ...(dir === 'rtl' && { letterSpacing: 0 }),
        },
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    backgroundColor: mode === 'dark' ? '#0b0f19' : '#f8fafc',
                    color: mode === 'dark' ? '#f8fafc' : '#0f172a',
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: ({ theme }) => ({
                    backgroundImage: 'none',
                    backgroundColor: theme.palette.background.paper,
                    color: theme.palette.text.primary,
                }),
            },
        },
        MuiCard: {
            styleOverrides: {
                root: ({ theme }) => ({
                    backgroundImage: 'none',
                    backgroundColor: theme.palette.background.paper,
                    color: theme.palette.text.primary,
                    boxShadow: mode === 'dark' ? '0 4px 20px rgba(0,0,0,0.3)' : '0 1px 3px rgba(15, 23, 42, 0.08)',
                    border: `1px solid ${theme.palette.divider}`,
                }),
            },
        },
        MuiTableCell: {
            styleOverrides: {
                root: ({ theme }) => ({
                    textAlign: dir === 'rtl' ? 'right' : 'left',
                    borderColor: theme.palette.divider,
                    color: theme.palette.text.primary,
                }),
            },
        },
    },
});

const lightPalette = {
    mode: 'light',
    primary: { main: '#2563eb', contrastText: '#ffffff' },
    secondary: { main: '#475569' },
    success: { main: '#059669' },
    warning: { main: '#d97706' },
    error: { main: '#dc2626' },
    background: { default: '#f8fafc', paper: '#ffffff' },
    text: { primary: '#0f172a', secondary: '#64748b' },
    divider: 'rgba(15, 23, 42, 0.08)',
};

const darkPalette = {
    mode: 'dark',
    primary: { main: '#3b82f6', contrastText: '#ffffff' },
    secondary: { main: '#94a3b8' },
    success: { main: '#10b981' },
    warning: { main: '#f59e0b' },
    error: { main: '#ef4444' },
    background: { default: '#0b0f19', paper: '#1e293b' },
    text: { primary: '#f8fafc', secondary: '#94a3b8' },
    divider: 'rgba(148, 163, 184, 0.12)',
};

export const getTheme = (mode, dir) => {
    const palette = mode === 'dark' ? darkPalette : lightPalette;
    return createTheme({
        palette,
        ...sharedDesignTokens(dir, mode),
    });
};