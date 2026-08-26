import createCache from '@emotion/cache';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';

// MUI (and most CSS-in-JS libs) hard-code physical left/right values
// (marginLeft, paddingRight, etc). Without this, RTL only reverses element
// order, not spacing — which is exactly why icons/buttons looked "broken"
// in Arabic. stylis-plugin-rtl rewrites the generated CSS so left/right
// (and startIcon/endIcon spacing) are mirrored correctly for Arabic.
export const createEmotionCache = (direction) => {
    if (direction === 'rtl') {
        return createCache({
            key: 'muirtl',
            stylisPlugins: [prefixer, rtlPlugin],
        });
    }
    return createCache({ key: 'mui' });
};
