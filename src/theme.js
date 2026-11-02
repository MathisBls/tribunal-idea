const THEME_KEY = 'tribunal.theme';
const THEMES = ['light', 'dark'];

const readStoredTheme = () => {
    try {
        const theme = localStorage.getItem(THEME_KEY);
        return THEMES.includes(theme) ? theme : null;
    } catch {
        return null;
    }
};

const readSystemTheme = () => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export const readTheme = () => readStoredTheme() ?? readSystemTheme();

export function applyStoredTheme() {
    const theme = readStoredTheme();
    if (theme) document.documentElement.dataset.theme = theme;
}

export function storeTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try {
        localStorage.setItem(THEME_KEY, theme);
    } catch {
        // The theme still applies for this visit.
    }
}
