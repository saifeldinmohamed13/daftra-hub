import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Box,
    Drawer,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    AppBar,
    Toolbar,
    IconButton,
    Avatar,
    Typography,
    Divider,
    Badge,
    Tooltip,
    Menu,
    MenuItem,
} from '@mui/material';
import {
    SpaceDashboardOutlined as DashboardIcon,
    StorageRounded as StorageIcon,
    NotificationsNoneRounded as NotificationsNoneIcon,
    LightModeOutlined as LightModeIcon,
    DarkModeOutlined as DarkModeIcon,
    TranslateRounded as TranslateIcon,
    MenuRounded as MenuIcon,
    ChevronLeftRounded as ChevronLeftIcon,
    ChevronRightRounded as ChevronRightIcon,
    ReceiptLongRounded as InvoiceIcon,
    PeopleAltRounded as ClientsIcon,
    AccountTreeRounded as BranchesIcon,
    AccountBalanceWalletRounded as TreasuriesIcon,
    PaymentsRounded as PaymentsIcon,
    SettingsRounded as SettingsIcon,
    LogoutRounded as LogoutIcon,
} from '@mui/icons-material';
import { useColorMode } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';

const BASE_DRAWER_WIDTH = 260;
const COLLAPSED_DRAWER_WIDTH = 70;

const Layout = ({ children, title, subtitle }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const userEmail = localStorage.getItem('userEmail') || '';
    const userName = localStorage.getItem('userName') || userEmail;
    const { toggleColorMode, mode } = useColorMode();
    const { lang, toggleLang, t } = useLanguage();
    const isRtl = t.dir === 'rtl';

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [anchorEl, setAnchorEl] = useState(null);
    const isUserMenuOpen = Boolean(anchorEl);

    const handleLogout = () => {
        localStorage.clear();
        navigate('/login');
    };

    const handleNavigateSettings = () => {
        setAnchorEl(null);
        navigate('/settings');
    };

    const getUserInitials = (nameString) => {
        if (!nameString) return 'U';
        const parts = nameString.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return parts[0].slice(0, 2).toUpperCase();
    };

    const currentWidth = isCollapsed ? COLLAPSED_DRAWER_WIDTH : BASE_DRAWER_WIDTH;

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }} dir={t.dir}>
            <Drawer
                variant="permanent"
                sx={{
                    width: currentWidth,
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    transition: (theme) => theme.transitions.create('width', {
                        easing: theme.transitions.easing.sharp,
                        duration: theme.transitions.duration.enteringScreen,
                    }),
                    '& .MuiDrawer-paper': {
                        width: currentWidth,
                        boxSizing: 'border-box',
                        bgcolor: 'background.paper',
                        borderRight: '1px solid',
                        borderLeft: 'none',
                        borderColor: 'divider',
                        overflowX: 'hidden',
                        transition: (theme) => theme.transitions.create('width', {
                            easing: theme.transitions.easing.sharp,
                            duration: theme.transitions.duration.enteringScreen,
                        }),
                    },
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'space-between', px: 2, py: 2, minHeight: '64px', height: '64px', boxSizing: 'border-box' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, overflow: 'hidden' }}>
                        <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <StorageIcon sx={{ color: '#fff', fontSize: 20 }} />
                        </Box>
                        {!isCollapsed && (
                            <Box sx={{ minWidth: 0 }}>
                                <Typography variant="subtitle2" fontWeight={700} noWrap>{t.appName}</Typography>
                                <Typography variant="caption" color="text.secondary" noWrap>{t.appTagline}</Typography>
                            </Box>
                        )}
                    </Box>
                    {!isCollapsed && (
                        <IconButton onClick={() => setIsCollapsed(true)} size="small">
                            {isRtl ? <ChevronRightIcon /> : <ChevronLeftIcon />}
                        </IconButton>
                    )}
                </Box>
                
                <Divider />
                
                <List sx={{ px: 1, py: 1.5 }}>
                    {/* 1. Global Dashboard Links */}
                    <Tooltip title={isCollapsed ? t.navDashboard : ""} placement={isRtl ? "left" : "right"}>
                        <ListItemButton 
                            selected={location.pathname === '/dashboard'} 
                            sx={{ borderRadius: 2, mb: 0.5, justifyContent: isCollapsed ? 'center' : 'flex-start', px: isCollapsed ? 1.5 : 2 }} 
                            onClick={() => navigate('/dashboard')}
                        >
                            <ListItemIcon sx={{ minWidth: isCollapsed ? 0 : 36, color: location.pathname === '/dashboard' ? 'primary.main' : 'inherit' }}><DashboardIcon fontSize="small" /></ListItemIcon>
                            {!isCollapsed && <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }} primary={t.navDashboard} />}
                        </ListItemButton>
                    </Tooltip>

                    {/* 2. Full Invoices Links */}
                    <Tooltip title={isCollapsed ? t.navInvoices : ""} placement={isRtl ? "left" : "right"}>
                        <ListItemButton 
                            selected={location.pathname === '/invoices'} 
                            sx={{ borderRadius: 2, mb: 0.5, justifyContent: isCollapsed ? 'center' : 'flex-start', px: isCollapsed ? 1.5 : 2 }} 
                            onClick={() => navigate('/invoices')}
                        >
                            <ListItemIcon sx={{ minWidth: isCollapsed ? 0 : 36, color: location.pathname === '/invoices' ? 'primary.main' : 'inherit' }}><InvoiceIcon fontSize="small" /></ListItemIcon>
                            {!isCollapsed && <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }} primary={t.navInvoices} />}
                        </ListItemButton>
                    </Tooltip>

                    {/* 3. Full Payments & Receipts Link (🎯 الجديدة) */}
                    <Tooltip title={isCollapsed ? (t.navPayments || 'Payments') : ""} placement={isRtl ? "left" : "right"}>
                        <ListItemButton 
                            selected={location.pathname === '/payments'} 
                            sx={{ borderRadius: 2, mb: 0.5, justifyContent: isCollapsed ? 'center' : 'flex-start', px: isCollapsed ? 1.5 : 2 }} 
                            onClick={() => navigate('/payments')}
                        >
                            <ListItemIcon sx={{ minWidth: isCollapsed ? 0 : 36, color: location.pathname === '/payments' ? 'primary.main' : 'inherit' }}><PaymentsIcon fontSize="small" /></ListItemIcon>
                            {!isCollapsed && <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }} primary={t.navPayments || 'Payments'} />}
                        </ListItemButton>
                    </Tooltip>

                    {/* 4. Full Clients Links */}
                    <Tooltip title={isCollapsed ? t.navClients : ""} placement={isRtl ? "left" : "right"}>
                        <ListItemButton 
                            selected={location.pathname === '/clients'} 
                            sx={{ borderRadius: 2, mb: 0.5, justifyContent: isCollapsed ? 'center' : 'flex-start', px: isCollapsed ? 1.5 : 2 }} 
                            onClick={() => navigate('/clients')}
                        >
                            <ListItemIcon sx={{ minWidth: isCollapsed ? 0 : 36, color: location.pathname === '/clients' ? 'primary.main' : 'inherit' }}><ClientsIcon fontSize="small" /></ListItemIcon>
                            {!isCollapsed && <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }} primary={t.navClients} />}
                        </ListItemButton>
                    </Tooltip>

                    {/* 5. Treasuries & Bank Accounts Link */}
                    <Tooltip title={isCollapsed ? (t.navTreasuries || 'Treasuries') : ""} placement={isRtl ? "left" : "right"}>
                        <ListItemButton 
                            selected={location.pathname === '/treasuries'} 
                            sx={{ borderRadius: 2, mb: 0.5, justifyContent: isCollapsed ? 'center' : 'flex-start', px: isCollapsed ? 1.5 : 2 }} 
                            onClick={() => navigate('/treasuries')}
                        >
                            <ListItemIcon sx={{ minWidth: isCollapsed ? 0 : 36, color: location.pathname === '/treasuries' ? 'primary.main' : 'inherit' }}><TreasuriesIcon fontSize="small" /></ListItemIcon>
                            {!isCollapsed && <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }} primary={t.navTreasuries || 'Treasuries & Bank Accounts'} />}
                        </ListItemButton>
                    </Tooltip>

                    <Divider sx={{ my: 1 }} />

                    {/* 6. Accounts Directory Navigation */}
                    <Tooltip title={isCollapsed ? t.allBranches : ""} placement={isRtl ? "left" : "right"}>
                        <ListItemButton 
                            selected={location.pathname === '/accounts'} 
                            sx={{ borderRadius: 2, mb: 0.5, justifyContent: isCollapsed ? 'center' : 'flex-start', px: isCollapsed ? 1.5 : 2 }} 
                            onClick={() => navigate('/accounts')}
                        >
                            <ListItemIcon sx={{ minWidth: isCollapsed ? 0 : 36, color: location.pathname === '/accounts' ? 'primary.main' : 'inherit' }}><BranchesIcon fontSize="small" /></ListItemIcon>
                            {!isCollapsed && <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }} primary={t.allBranches} />}
                        </ListItemButton>
                    </Tooltip>

                    {/* 7. System Settings Navigation */}
                    <Tooltip title={isCollapsed ? (t.settingsTitle || 'Settings') : ""} placement={isRtl ? "left" : "right"}>
                        <ListItemButton 
                            selected={location.pathname === '/settings'} 
                            sx={{ borderRadius: 2, mb: 0.5, justifyContent: isCollapsed ? 'center' : 'flex-start', px: isCollapsed ? 1.5 : 2 }} 
                            onClick={() => navigate('/settings')}
                        >
                            <ListItemIcon sx={{ minWidth: isCollapsed ? 0 : 36, color: location.pathname === '/settings' ? 'primary.main' : 'inherit' }}><SettingsIcon fontSize="small" /></ListItemIcon>
                            {!isCollapsed && <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }} primary={t.settingsTitle || 'Settings'} />}
                        </ListItemButton>
                    </Tooltip>
                </List>
            </Drawer>

            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <AppBar
                    position="fixed"
                    color="inherit"
                    elevation={0}
                    sx={{
                        width: `calc(100% - ${currentWidth}px)`,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        boxShadow: '0px 2px 4px rgba(0,0,0,0.02)',
                        bgcolor: 'background.paper',
                        backgroundImage: 'none',
                        transition: (theme) => theme.transitions.create(['width', 'margin'], {
                            easing: theme.transitions.easing.sharp,
                            duration: theme.transitions.duration.enteringScreen,
                        }),
                    }}
                >
                    <Toolbar sx={{ justifyContent: 'space-between', px: 3, minHeight: '64px', height: '64px' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                            {isCollapsed && (
                                <IconButton onClick={() => setIsCollapsed(false)} size="small" sx={{ mr: 1, ml: 0 }}>
                                    <MenuIcon />
                                </IconButton>
                            )}
                            <Box sx={{ minWidth: 0 }}>
                                <Typography variant="subtitle1" fontWeight={700} noWrap>{title}</Typography>
                                {subtitle && <Typography variant="caption" color="text.secondary" noWrap>{subtitle}</Typography>}
                            </Box>
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Tooltip title={lang === 'en' ? 'التبديل للعربية' : 'Switch to English'}>
                                <IconButton onClick={toggleLang} color="inherit" size="small" sx={{ px: 1, borderRadius: '8px' }}>
                                    <TranslateIcon fontSize="small" />
                                    <Typography variant="caption" fontWeight={700} sx={{ mx: 0.5 }}>{lang === 'en' ? 'AR' : 'EN'}</Typography>
                                </IconButton>
                            </Tooltip>

                            <Tooltip title={mode === 'light' ? t.switchToDark : t.switchToLight}>
                                <IconButton onClick={toggleColorMode} color="inherit" size="small">
                                    {mode === 'light' ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />}
                                </IconButton>
                            </Tooltip>

                            <Tooltip title={t.notifications}>
                                <IconButton color="inherit" size="small">
                                    <Badge color="primary" variant="dot"><NotificationsNoneIcon fontSize="small" /></Badge>
                                </IconButton>
                            </Tooltip>

                            <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 1.5 }} />
                            
                            <Tooltip title={userName}>
                                <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} size="small" sx={{ p: 0.5 }}>
                                    <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 12, fontWeight: 700, letterSpacing: '0.5px' }}>
                                        {getUserInitials(userName)}
                                    </Avatar>
                                </IconButton>
                            </Tooltip>

                            <Menu
                                anchorEl={anchorEl}
                                open={isUserMenuOpen}
                                onClose={() => setAnchorEl(null)}
                                PaperProps={{ sx: { mt: 1, minWidth: 180, borderRadius: '10px', boxShadow: '0px 4px 20px rgba(0,0,0,0.08)' } }}
                            >
                                <Box sx={{ px: 2, py: 1.5 }}>
                                    <Typography variant="subtitle2" fontWeight={700} noWrap>{userName}</Typography>
                                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{userEmail}</Typography>
                                </Box>
                                <Divider />
                                <MenuItem onClick={handleNavigateSettings} sx={{ fontSize: 13, py: 1 }}>
                                    <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
                                    {t.settingsTitle || 'Settings'}
                                </MenuItem>
                                <Divider />
                                <MenuItem onClick={handleLogout} sx={{ fontSize: 13, py: 1, color: 'error.main', '& .MuiListItemIcon-root': { color: 'error.main' } }}>
                                    <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
                                    {t.signOut}
                                </MenuItem>
                            </Menu>
                        </Box>
                    </Toolbar>
                </AppBar>

                <Box component="main" sx={{ flexGrow: 1, width: '100%', p: { xs: 2, md: 3 }, mt: '64px' }}>
                    {children}
                </Box>
            </Box>
        </Box>
    );
};

export default Layout;