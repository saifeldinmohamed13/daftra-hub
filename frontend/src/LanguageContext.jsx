import React, { createContext, useState, useMemo, useContext, useEffect } from 'react';
import { getTranslations } from './i18n/translations';

const LanguageContext = createContext({ lang: 'en', setLang: () => {}, toggleLang: () => {}, t: getTranslations('en') });

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) {
        console.warn('useLanguage must be used within a LanguageProvider');
    }
    return context;
};

export const LanguageProvider = ({ children }) => {
    const [lang, setLangState] = useState(localStorage.getItem('lang') || 'en');

    const setLang = (newLang) => {
        localStorage.setItem('lang', newLang);
        setLangState(newLang);
    };

    const toggleLang = () => setLang(lang === 'en' ? 'ar' : 'en');

    const t = useMemo(() => getTranslations(lang), [lang]);

    useEffect(() => {
        document.documentElement.dir = t.dir;
        document.documentElement.lang = lang;
    }, [lang, t.dir]);

    const value = useMemo(() => ({ lang, setLang, toggleLang, t }), [lang, t]);

    return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};
