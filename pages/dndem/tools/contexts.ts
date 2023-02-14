import { createContext } from 'react';

export const painting = {
    tool: "none",
    size: 2,
    color: "rgb(172, 217, 100)"
};

export const PaintingContext = createContext(
    painting // default value
);

export const languageContext = createContext('en');

export const themes = {
    light: {
        foreground: '#000000',
        background: '#ffffff',
    },
    dark: {
        foreground: '#ffffff',
        background: '#2B2B2B',
    }
};

export const ThemeContext = createContext(
    themes.dark // default value
);