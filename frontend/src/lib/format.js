export function prettyNum(n) {
    if (n == null || Number.isNaN(n)) return '-';
    return Intl.NumberFormat().format(Number(n));
}

export function fmtMs(n) {
    if (n == null || Number.isNaN(Number(n))) return '-';
    return Number(n).toFixed(1);
}

export function fmtPct(rate) {
    if (rate == null) return '-';
    return `${(Number(rate) * 100).toFixed(2)}%`;
}

export function fmtBytes(n) {
    if (n == null) return '-';
    const b = Number(n);
    if (b < 1024) return `${b} B`;
    const kb = b / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
}