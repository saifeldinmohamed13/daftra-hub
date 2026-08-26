import React, { createContext, useState, useMemo, useContext } from 'react';
import { CacheProvider } from '@emotion/react';
import { ThemeProvider as MuiThemeProvider, CssBaseline } from '@mui/material';
import { getTheme } from './theme';
import { createEmotionCache } from './createEmotionCache';
import { useLanguage } from './LanguageContext';

const ColorModeContext = createContext({ toggleColorMode: () => {}, mode: 'light' });

export const useColorMode = () => {
    const context = useContext(ColorModeContext);
    if (!context) {
        // حماية إضافية عشان نضمن إن الـ Hook ميتناداش في مكان غلط بره الـ Provider
        console.warn("useColorMode must be used within a CustomThemeProvider");
    }
    return context;
};

export const CustomThemeProvider = ({ children }) => {
    const [mode, setMode] = useState(localStorage.getItem('themeMode') || 'light');
    const { t } = useLanguage();

    const colorMode = useMemo(() => ({
        toggleColorMode: () => {
            setMode((prevMode) => {
                const newMode = prevMode === 'light' ? 'dark' : 'light';
                localStorage.setItem('themeMode', newMode);
                return newMode;
            });
        },
        mode,
    }), [mode]);

    // Rebuilding both the theme (direction + font) and the emotion cache
    // (stylis-plugin-rtl) whenever the language direction changes is what
    // makes MUI's spacing/margins actually mirror correctly for Arabic —
    // just flipping the HTML `dir` attribute isn't enough on its own.
    const theme = useMemo(() => getTheme(mode, t.dir), [mode, t.dir]);
    const emotionCache = useMemo(() => createEmotionCache(t.dir), [t.dir]);

    return (
        <ColorModeContext.Provider value={colorMode}>
            <CacheProvider value={emotionCache}>
                <MuiThemeProvider theme={theme}>
                    <CssBaseline />
                    {/*
                      key={t.dir} forces React to fully unmount and remount the whole
                      app tree whenever the language direction flips. Swapping the
                      emotion cache alone (RTL <-> LTR) can leave stale style tags
                      behind in <head> from the previous direction, which is what
                      caused things to render incorrectly right after switching —
                      this guarantees a clean slate every time.
                    */}
                    <React.Fragment key={t.dir}>
                        {children}
                    </React.Fragment>
                </MuiThemeProvider>
            </CacheProvider>
        </ColorModeContext.Provider>
    );
};
