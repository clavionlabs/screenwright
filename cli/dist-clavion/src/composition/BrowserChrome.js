import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";

const CHROME_HEIGHT = 72;

export { CHROME_HEIGHT };

/**
 * Fake Chrome browser frame overlay.
 * Renders a toolbar with traffic lights, tab, address bar.
 */
export const BrowserChrome = ({ url = 'app.cppa.care', width }) => {
    return _jsx("div", {
        style: {
            width,
            height: CHROME_HEIGHT,
            background: '#DEE1E6',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            userSelect: 'none',
        },
        children: _jsxs("div", {
            style: { display: 'flex', flexDirection: 'column', height: '100%' },
            children: [
                // Tab bar
                _jsxs("div", {
                    style: {
                        display: 'flex',
                        alignItems: 'flex-end',
                        height: 34,
                        paddingLeft: 76,
                        paddingRight: 8,
                        gap: 0,
                    },
                    children: [
                        // Traffic lights
                        _jsxs("div", {
                            style: {
                                position: 'absolute',
                                left: 12,
                                top: 10,
                                display: 'flex',
                                gap: 8,
                            },
                            children: [
                                _jsx("div", { style: { width: 12, height: 12, borderRadius: '50%', background: '#FF5F57' } }),
                                _jsx("div", { style: { width: 12, height: 12, borderRadius: '50%', background: '#FEBC2E' } }),
                                _jsx("div", { style: { width: 12, height: 12, borderRadius: '50%', background: '#28C840' } }),
                            ],
                        }),
                        // Active tab
                        _jsxs("div", {
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                height: 30,
                                padding: '0 14px',
                                background: '#F1F3F4',
                                borderRadius: '8px 8px 0 0',
                                fontSize: 12,
                                color: '#202124',
                                maxWidth: 220,
                                position: 'relative',
                            },
                            children: [
                                // Favicon
                                _jsx("div", {
                                    style: {
                                        width: 14,
                                        height: 14,
                                        borderRadius: 3,
                                        background: '#1E3A5F',
                                        flexShrink: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 8,
                                        color: '#fff',
                                        fontWeight: 700,
                                    },
                                    children: 'C',
                                }),
                                _jsx("span", {
                                    style: {
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    },
                                    children: 'CPPA Dashboard',
                                }),
                                // Close button
                                _jsx("span", {
                                    style: { fontSize: 14, color: '#5F6368', marginLeft: 4, cursor: 'default' },
                                    children: '\u00D7',
                                }),
                            ],
                        }),
                        // New tab +
                        _jsx("div", {
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 24,
                                height: 24,
                                marginLeft: 4,
                                marginBottom: 3,
                                fontSize: 18,
                                color: '#5F6368',
                            },
                            children: '+',
                        }),
                    ],
                }),
                // Address bar row
                _jsxs("div", {
                    style: {
                        display: 'flex',
                        alignItems: 'center',
                        height: 38,
                        padding: '0 8px',
                        gap: 6,
                        background: '#F1F3F4',
                    },
                    children: [
                        // Nav buttons
                        _jsx("span", { style: { fontSize: 16, color: '#5F6368', padding: '0 4px' }, children: '\u2190' }),
                        _jsx("span", { style: { fontSize: 16, color: '#C4C7CC', padding: '0 4px' }, children: '\u2192' }),
                        _jsx("span", { style: { fontSize: 16, color: '#5F6368', padding: '0 4px' }, children: '\u21BB' }),
                        // Address bar
                        _jsxs("div", {
                            style: {
                                flex: 1,
                                height: 28,
                                background: '#FFFFFF',
                                borderRadius: 14,
                                display: 'flex',
                                alignItems: 'center',
                                padding: '0 12px',
                                fontSize: 13,
                                color: '#202124',
                            },
                            children: [
                                // Lock icon
                                _jsx("span", {
                                    style: { fontSize: 13, color: '#5F6368', marginRight: 6 },
                                    children: '\uD83D\uDD12',
                                }),
                                _jsxs("span", {
                                    children: [
                                        _jsx("span", { style: { color: '#5F6368' }, children: 'https://' }),
                                        _jsx("span", { style: { color: '#202124', fontWeight: 500 }, children: url }),
                                    ],
                                }),
                            ],
                        }),
                        // Extensions area
                        _jsx("span", { style: { fontSize: 16, color: '#5F6368', padding: '0 4px' }, children: '\u22EE' }),
                    ],
                }),
            ],
        }),
    });
};
