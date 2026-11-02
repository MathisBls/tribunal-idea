import {useState} from 'react';

import {readTheme, storeTheme} from '../theme.js';

const DARK = 'dark';
const LIGHT = 'light';

export default function ThemeToggle() {
    const [theme, setTheme] = useState(readTheme);
    const isDark = theme === DARK;

    const toggle = () => {
        const next = isDark ? LIGHT : DARK;
        storeTheme(next);
        setTheme(next);
    };

    return (
        <button type="button" className="theme-toggle" onClick={toggle} aria-label={isDark ? 'Passer en thème clair' : 'Passer en thème sombre'} title={isDark ? 'Thème clair' : 'Thème sombre'}>
            {isDark ? (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
            ) : (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
                </svg>
            )}
        </button>
    );
}
