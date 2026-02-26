function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
function fade(p) {
    return {
        exit: { opacity: 1 - p },
        entrance: { opacity: p },
    };
}
function wipe(p) {
    return {
        exit: { clipPath: `inset(0 0 0 ${p * 100}%)` },
        entrance: {},
    };
}
function slideUp(p) {
    return {
        exit: { transform: `translateY(${-p * 100}%)` },
        entrance: { transform: `translateY(${(1 - p) * 100}%)` },
    };
}
function slideLeft(p) {
    return {
        exit: { transform: `translateX(${-p * 100}%)` },
        entrance: { transform: `translateX(${(1 - p) * 100}%)` },
    };
}
function zoom(p) {
    return {
        exit: { transform: `scale(${1 + p * 0.5})`, opacity: 1 - p },
        entrance: { transform: `scale(${0.5 + p * 0.5})`, opacity: p },
    };
}
function doorway(p) {
    const scale = 0.33 + p * 0.67;
    return {
        exit: { clipPath: 'inset(0 50% 0 0)', transform: `translateX(${-p * 50}%)` },
        exit2: { clipPath: 'inset(0 0 0 50%)', transform: `translateX(${p * 50}%)` },
        entrance: { transform: `scale(${scale})` },
        backdrop: '#000000',
    };
}
function swap(p) {
    return {
        exit: {
            transform: `perspective(1200px) translateX(${-p * 100}%) rotateY(${p * 45}deg) scale(${1 - p * 0.35})`,
        },
        entrance: {
            transform: `perspective(1200px) translateX(${(1 - p) * 100}%) rotateY(${-(1 - p) * 45}deg) scale(${0.65 + p * 0.35})`,
        },
        backdrop: '#000000',
    };
}
function cube(p, vw = 1920) {
    const half = vw / 2;
    return {
        perspective: vw * 2,
        container: {
            transformStyle: 'preserve-3d',
            transform: `translateZ(${-half}px) rotateY(${-p * 90}deg)`,
        },
        exit: {
            transform: `translateZ(${half}px)`,
        },
        entrance: {
            transform: `rotateY(90deg) translateZ(${half}px)`,
        },
        backdrop: '#000000',
    };
}
const strategies = {
    'fade': fade,
    'wipe': wipe,
    'slide-up': slideUp,
    'slide-left': slideLeft,
    'zoom': zoom,
    'doorway': doorway,
    'swap': swap,
    'cube': cube,
};
export function getTransitionStyles(type, progress, viewportWidth) {
    const p = easeInOut(Math.max(0, Math.min(1, progress)));
    if (type === 'cube' && viewportWidth)
        return cube(p, viewportWidth);
    return strategies[type](p);
}
