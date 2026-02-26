import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { Audio, Sequence, staticFile } from 'remotion';
export const NarrationTrack = ({ narrations, fps }) => {
    return (_jsx(_Fragment, { children: narrations
            .filter(n => n.audioFile)
            .map((n, i) => (_jsx(Sequence, { from: Math.round((n.timestampMs / 1000) * fps), children: _jsx(Audio, { src: staticFile(n.audioFile) }) }, n.id))) }));
};
