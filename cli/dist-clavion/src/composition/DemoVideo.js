import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Img, staticFile, useCurrentFrame } from 'remotion';
import { CursorOverlay } from './CursorOverlay.js';
import { NarrationTrack } from './NarrationTrack.js';
import { precomputeCursorPaths } from './cursor-path.js';
import { getTransitionStyles } from './transition-styles.js';
import { resolveOutputFrame, remapEventsForOutput } from './frame-resolve.js';

// Hardcoded to avoid bundler import resolution issues
const CHROME_HEIGHT = 72;
export { CHROME_HEIGHT };

const IMG_STYLE = { width: '100%', height: '100%', display: 'block' };

/**
 * Inline Chrome browser frame — traffic lights, tab, address bar.
 */
const BrowserChrome = ({ url = 'app.cppa.care', width }) => {
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
                                _jsx("div", {
                                    style: {
                                        width: 14, height: 14, borderRadius: 3,
                                        background: '#1E3A5F', flexShrink: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 8, color: '#fff', fontWeight: 700,
                                    },
                                    children: 'C',
                                }),
                                _jsx("span", {
                                    style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                                    children: 'CPPA Dashboard',
                                }),
                                _jsx("span", {
                                    style: { fontSize: 14, color: '#5F6368', marginLeft: 4, cursor: 'default' },
                                    children: '\u00D7',
                                }),
                            ],
                        }),
                        // New tab +
                        _jsx("div", {
                            style: {
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: 24, height: 24, marginLeft: 4, marginBottom: 3,
                                fontSize: 18, color: '#5F6368',
                            },
                            children: '+',
                        }),
                    ],
                }),
                // Address bar row
                _jsxs("div", {
                    style: {
                        display: 'flex', alignItems: 'center',
                        height: 38, padding: '0 8px', gap: 6,
                        background: '#F1F3F4',
                    },
                    children: [
                        _jsx("span", { style: { fontSize: 16, color: '#5F6368', padding: '0 4px' }, children: '\u2190' }),
                        _jsx("span", { style: { fontSize: 16, color: '#C4C7CC', padding: '0 4px' }, children: '\u2192' }),
                        _jsx("span", { style: { fontSize: 16, color: '#5F6368', padding: '0 4px' }, children: '\u21BB' }),
                        _jsxs("div", {
                            style: {
                                flex: 1, height: 28, background: '#FFFFFF',
                                borderRadius: 14, display: 'flex', alignItems: 'center',
                                padding: '0 12px', fontSize: 13, color: '#202124',
                            },
                            children: [
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
                        _jsx("span", { style: { fontSize: 16, color: '#5F6368', padding: '0 4px' }, children: '\u22EE' }),
                    ],
                }),
            ],
        }),
    });
};

export const DemoVideo = ({ timeline, branding }) => {
    const fps = timeline.metadata.fps ?? 11;
    const frame = useCurrentFrame();
    const { frameManifest, transitionMarkers, viewport } = timeline.metadata;
    const resolution = resolveOutputFrame(frame, frameManifest, transitionMarkers);
    const remappedEvents = remapEventsForOutput(timeline.events, frameManifest, transitionMarkers, fps);
    const cursorEvents = precomputeCursorPaths(remappedEvents.filter((e) => e.type === 'cursor_target'));
    const clickEvents = remappedEvents.filter((e) => e.type === 'action' && e.action === 'click');
    const narrations = remappedEvents.filter((e) => e.type === 'narration');
    const rawCursorTargets = remappedEvents.filter((e) => e.type === 'cursor_target');
    const allScenes = remappedEvents.filter((e) => e.type === 'scene');
    const slideScenes = allScenes.filter((e) => !!e.slide);

    // Track current URL from navigate events for browser chrome
    const navigateEvents = remappedEvents.filter((e) => e.type === 'action' && e.action === 'navigate');
    const currentTimeMs = (frame / fps) * 1000;
    let currentUrl = '';
    for (const nav of navigateEvents) {
        if (nav.timestampMs <= currentTimeMs) {
            currentUrl = nav.selector || '';
        }
    }
    // Clean URL for display
    let displayUrl = currentUrl;
    try {
        const parsed = new URL(currentUrl);
        displayUrl = parsed.host + (parsed.pathname === '/' ? '' : parsed.pathname);
    } catch { /* keep as-is */ }

    // Determine if we're in a slide scene (no browser chrome during slides)
    // Use next scene event (not cursor target) as the slide boundary —
    // a slide ends when any new scene starts, not when the mouse first moves.
    const duringSlide = slideScenes.some(s => {
        if (currentTimeMs < s.timestampMs) return false;
        const nextScene = allScenes.find(sc => sc.timestampMs > s.timestampMs);
        return currentTimeMs < (nextScene ? nextScene.timestampMs : Infinity);
    });

    const showChrome = !duringSlide && resolution.type !== 'transition';

    let baseLayer;
    if (resolution.type === 'transition') {
        const styles = getTransitionStyles(resolution.transition, resolution.progress, viewport.width);
        const faceClip = styles.container ? {} : { overflow: 'hidden' };
        const backdropColor = styles.backdrop ?? branding?.brandColor ?? '#000000';
        const exitContent = _jsx(Img, { src: staticFile(resolution.beforeFile), style: IMG_STYLE });
        const entranceContent = _jsx(Img, { src: staticFile(resolution.afterFile), style: IMG_STYLE });
        const faces = (_jsxs(_Fragment, { children: [
            _jsx("div", { style: { position: 'absolute', inset: 0, ...faceClip, ...styles.entrance }, children: entranceContent }),
            _jsx("div", { style: { position: 'absolute', inset: 0, ...faceClip, ...styles.exit }, children: exitContent }),
            styles.exit2 && (_jsx("div", { style: { position: 'absolute', inset: 0, ...faceClip, ...styles.exit2 }, children: exitContent })),
        ] }));
        let wrappedFaces = faces;
        if (styles.container) {
            wrappedFaces = _jsx("div", { style: { position: 'absolute', inset: 0, ...styles.container }, children: faces });
        }
        if (styles.perspective) {
            wrappedFaces = _jsx("div", { style: { position: 'absolute', inset: 0, perspective: styles.perspective }, children: wrappedFaces });
        }
        baseLayer = (_jsxs(_Fragment, { children: [
            _jsx("div", { style: { position: 'absolute', inset: 0, backgroundColor: backdropColor } }),
            wrappedFaces,
        ] }));
    } else {
        baseLayer = _jsx(Img, { src: staticFile(resolution.file), style: IMG_STYLE });
    }

    const showCursor = resolution.type !== 'transition' && !duringSlide;
    const totalHeight = viewport.height + CHROME_HEIGHT;

    // ── Chrome layout: chrome on top (z-index), page content below ──
    if (showChrome) {
        return (_jsxs("div", {
            style: {
                position: 'relative',
                width: viewport.width,
                height: totalHeight,
                overflow: 'hidden',
                backgroundColor: '#FFFFFF',
            },
            children: [
                // Page content area — positioned below the chrome bar
                _jsxs("div", {
                    style: {
                        position: 'absolute',
                        top: CHROME_HEIGHT,
                        left: 0,
                        width: viewport.width,
                        height: viewport.height,
                        overflow: 'hidden',
                    },
                    children: [
                        baseLayer,
                        showCursor && (_jsx(CursorOverlay, { cursorEvents, clickEvents, fps })),
                    ],
                }),
                // Chrome frame overlay — on top with z-index
                _jsx("div", {
                    style: {
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: viewport.width,
                        zIndex: 10,
                    },
                    children: _jsx(BrowserChrome, { url: displayUrl, width: viewport.width }),
                }),
                _jsx(NarrationTrack, { narrations, fps }),
            ],
        }));
    }

    // ── Slides and transitions: full canvas, no chrome, centered ──
    return (_jsxs("div", {
        style: {
            position: 'relative',
            width: viewport.width,
            height: totalHeight,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: branding?.brandColor ?? '#000000',
        },
        children: [
            _jsx("div", {
                style: {
                    position: 'relative',
                    width: viewport.width,
                    height: viewport.height,
                    overflow: 'hidden',
                },
                children: baseLayer,
            }),
            _jsx(NarrationTrack, { narrations, fps }),
        ],
    }));
};
