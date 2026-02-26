import chalk from 'chalk';

const BAR_WIDTH = 25;
const FILL_CHAR = '█';
const EMPTY_CHAR = '░';

const LABEL_COL = 22;

/**
 * Render a progress bar string.
 */
function bar(fraction) {
    const clamped = Math.max(0, Math.min(1, fraction));
    const filled = Math.round(clamped * BAR_WIDTH);
    const empty = BAR_WIDTH - filled;
    const pct = Math.round(clamped * 100);
    return chalk.cyan(FILL_CHAR.repeat(filled)) + chalk.dim(EMPTY_CHAR.repeat(empty)) + chalk.white(` ${String(pct).padStart(3)}%`);
}

/**
 * Format milliseconds as human-readable duration.
 */
function formatDuration(ms) {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const secs = ms / 1000;
    if (secs < 60) return `${secs.toFixed(1)}s`;
    const mins = Math.floor(secs / 60);
    const remainSecs = Math.round(secs % 60);
    return `${mins}m ${String(remainSecs).padStart(2, '0')}s`;
}

/**
 * Strip ANSI escape codes for visible length calculation.
 */
function stripAnsi(str) {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function padEnd(str, width) {
    const visible = stripAnsi(str).length;
    if (visible >= width) return str;
    return str + ' '.repeat(width - visible);
}

/**
 * Pipeline step tracker with full table display.
 *
 * TTY mode:
 *   - All steps printed upfront with ○ pending markers
 *   - Active step updates in-place via ANSI cursor movement
 *   - Completed steps update their line with ✔ and duration
 *
 * Non-TTY mode (piped):
 *   - Falls back to sequential line output (no cursor movement)
 */
export function createPipeline(steps) {
    const startTimes = new Map();
    const durations = new Map();
    const stepIndex = new Map();
    steps.forEach((s, i) => stepIndex.set(s.id, i));

    const states = new Map();
    const details = new Map();
    const fractions = new Map();

    steps.forEach(s => {
        states.set(s.id, 'pending');
        details.set(s.id, '');
        fractions.set(s.id, 0);
    });

    let headerPrinted = false;
    const isTTY = process.stderr.isTTY;
    const out = process.stderr;

    // ── Rendering helpers ──

    function renderStepLine(step) {
        const state = states.get(step.id);
        const detail = details.get(step.id);
        const fraction = fractions.get(step.id) ?? 0;
        const started = startTimes.get(step.id);
        const dur = durations.get(step.id);

        let icon, label, statusStr, timeStr;

        switch (state) {
            case 'pending':
                icon = chalk.dim('○');
                label = chalk.dim(step.label);
                statusStr = '';
                timeStr = '';
                break;
            case 'active':
                icon = chalk.yellow('◉');
                label = chalk.yellow(step.label);
                if (fraction > 0) {
                    statusStr = bar(fraction) + (detail ? chalk.dim(` ${detail}`) : '');
                } else {
                    statusStr = detail ? chalk.dim(detail) : chalk.dim('…');
                }
                if (started) {
                    const elapsed = performance.now() - started;
                    timeStr = chalk.dim(formatDuration(elapsed));
                } else {
                    timeStr = '';
                }
                break;
            case 'complete':
                icon = chalk.green('✔');
                label = chalk.green(step.label);
                statusStr = detail ? chalk.dim(detail) : '';
                timeStr = dur != null ? chalk.dim(formatDuration(dur)) : '';
                break;
            case 'failed':
                icon = chalk.red('✖');
                label = chalk.red(step.label);
                statusStr = detail ? chalk.dim(detail) : '';
                timeStr = dur != null ? chalk.dim(formatDuration(dur)) : '';
                break;
            case 'skipped':
                icon = chalk.dim('⊘');
                label = chalk.dim.strikethrough(step.label);
                statusStr = detail ? chalk.dim(detail) : '';
                timeStr = '';
                break;
        }

        const timeCol = timeStr ? `  ${timeStr}` : '';
        return `  ${icon} ${padEnd(label, LABEL_COL)} ${statusStr}${timeCol}`;
    }

    // ── TTY mode: full table with cursor updates ──

    function printFullTable() {
        out.write('\n' + chalk.bold.white('  Screenwright Compose Pipeline') + '\n\n');
        for (const step of steps) {
            out.write(renderStepLine(step) + '\n');
        }
        out.write('\n');
        headerPrinted = true;
    }

    function updateLineTTY(id) {
        if (!headerPrinted) return;
        const idx = stepIndex.get(id);
        const linesUp = (steps.length - idx) + 1; // +1 for trailing blank line
        const step = steps[idx];
        const line = renderStepLine(step);
        out.write(`\x1b[${linesUp}A\r\x1b[2K${line}\x1b[${linesUp}B\r`);
    }

    // ── Non-TTY mode: simple sequential output ──

    let nonTTYHeaderPrinted = false;
    let lastNonTTYLine = '';

    function printHeaderNonTTY() {
        if (!nonTTYHeaderPrinted) {
            out.write('\n  Screenwright Compose Pipeline\n\n');
            nonTTYHeaderPrinted = true;
        }
    }

    function printLineNonTTY(step) {
        const line = renderStepLine(step);
        out.write(line + '\n');
    }

    // ── Elapsed time ticker ──

    let tickInterval = null;
    let activeId = null;

    function startTick(id) {
        stopTick();
        activeId = id;
        if (isTTY) {
            tickInterval = setInterval(() => {
                if (activeId === id) updateLineTTY(id);
            }, 500);
        }
    }

    function stopTick() {
        if (tickInterval) {
            clearInterval(tickInterval);
            tickInterval = null;
        }
    }

    // ── Public API ──

    return {
        start(id) {
            if (isTTY) {
                if (!headerPrinted) printFullTable();
            } else {
                printHeaderNonTTY();
            }
            states.set(id, 'active');
            details.set(id, '');
            fractions.set(id, 0);
            startTimes.set(id, performance.now());
            if (isTTY) {
                updateLineTTY(id);
            }
            // Non-TTY: don't print active line — wait for complete/fail
            startTick(id);
        },

        update(id, fraction, detail) {
            fractions.set(id, fraction);
            if (detail !== undefined) details.set(id, detail);
            if (isTTY) updateLineTTY(id);
        },

        detail(id, text) {
            details.set(id, text);
            if (isTTY) updateLineTTY(id);
        },

        complete(id, detail) {
            const started = startTimes.get(id);
            const dur = started ? performance.now() - started : null;
            if (dur != null) durations.set(id, dur);
            states.set(id, 'complete');
            if (detail !== undefined) details.set(id, detail);
            if (activeId === id) stopTick();
            if (isTTY) {
                updateLineTTY(id);
            } else {
                printLineNonTTY(steps[stepIndex.get(id)]);
            }
        },

        fail(id, detail) {
            const started = startTimes.get(id);
            const dur = started ? performance.now() - started : null;
            if (dur != null) durations.set(id, dur);
            states.set(id, 'failed');
            if (detail !== undefined) details.set(id, detail);
            if (activeId === id) stopTick();
            if (isTTY) {
                updateLineTTY(id);
            } else {
                printLineNonTTY(steps[stepIndex.get(id)]);
            }
        },

        skip(id, reason) {
            states.set(id, 'skipped');
            if (reason) details.set(id, reason);
            if (activeId === id) stopTick();
            if (isTTY) {
                updateLineTTY(id);
            } else {
                printLineNonTTY(steps[stepIndex.get(id)]);
            }
        },

        summary(outputPath, sizeMB, duration, events) {
            stopTick();
            out.write('\n');
            out.write(chalk.green.bold(`  ✔ Video saved → ${outputPath}`) + '\n');
            out.write(chalk.dim(`    Duration: ${duration}  |  Size: ${sizeMB} MB  |  Events: ${events}`) + '\n');
            out.write('\n');
        },
    };
}
