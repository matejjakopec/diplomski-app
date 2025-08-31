import React, { useMemo } from 'react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from 'recharts';

const toNum = (v) => (v === null || v === undefined ? null : Number(v));
const has = (v) => v !== null && v !== undefined;

function pick(summary, path, fallback = null) {
    try {
        return path.split('.').reduce((obj, k) => (obj ? obj[k] : undefined), summary) ?? fallback;
    } catch {
        return fallback;
    }
}

function msTick(v) {
    if (v == null || Number.isNaN(Number(v))) return '';
    return `${Math.round(Number(v))}`;
}

function msTooltip(v) {
    if (v == null || Number.isNaN(Number(v))) return '-';
    return `${Number(v).toFixed(1)} ms`;
}

function CompactTooltip({ active, payload, label }) {
    if (!active || !payload || !payload.length) return null;
    return (
        <div className="card" style={{ padding: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
            {payload.map((p) => (
                <div key={p.dataKey}>
                    <span
                        style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            background: p.color,
                            marginRight: 6,
                        }}
                    />
                    {p.name}: {msTooltip(p.value)}
                </div>
            ))}
        </div>
    );
}

const METRICS = [
    {
        key: 'total_avg',
        title: 'Latencija (prosjek)',
        getP: (s) => toNum(pick(s, 'latency_ms.avg')),
        getS: (s) => toNum(pick(s, 'latency_ms.avg')),
    },
    {
        key: 'waiting_avg',
        title: 'Čekanje – poslužitelj (prosjek)',
        getP: (s) => toNum(pick(s, 'latency_breakdown_ms.waiting')),
        getS: (s) => toNum(pick(s, 'latency_breakdown_ms.waiting')),
    },
    {
        key: 'receiving_avg',
        title: 'Primanje (prosjek)',
        getP: (s) => toNum(pick(s, 'latency_breakdown_ms.receiving')),
        getS: (s) => toNum(pick(s, 'latency_breakdown_ms.receiving')),
    },
    {
        key: 'blocked_avg',
        title: 'Blokirano (prosjek)',
        getP: (s) => toNum(pick(s, 'connection_ms.blocked')),
        getS: (s) => toNum(pick(s, 'connection_ms.blocked')),
    },
    {
        key: 'connecting_avg',
        title: 'Povezivanje (prosjek)',
        getP: (s) => toNum(pick(s, 'connection_ms.connecting')),
        getS: (s) => toNum(pick(s, 'connection_ms.connecting')),
    },
    {
        key: 'server_app_avg',
        title: 'Poslužiteljska aplikacija (prosjek)',
        getP: (s) => toNum(pick(s, 'server_timing_ms.app_avg')),
        getS: (s) => toNum(pick(s, 'server_timing_ms.app_avg')),
    },
];

function MetricChart({ title, pVal, sVal }) {
    if (!has(pVal) && !has(sVal)) return null;

    const data = useMemo(
        () => [{ metric: title, pimcore: pVal, symfony: sVal }],
        [title, pVal, sVal]
    );

    const maxVal = Math.max(pVal ?? 0, sVal ?? 0);
    const domainMax = maxVal > 0 ? Math.ceil(maxVal * 1.2) : 1;

    return (
        <div className="card" style={{ padding: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
            <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                    <BarChart data={data} margin={{ left: 8, right: 8, top: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="metric" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} domain={[0, domainMax]} tickFormatter={msTick} />
                        <Tooltip content={<CompactTooltip />} />
                        <Legend />
                        <Bar
                            name="Pimcore"
                            dataKey="pimcore"
                            fill="var(--color-pimcore, #60a5fa)"
                            radius={[4, 4, 0, 0]}
                        />
                        <Bar
                            name="Symfony"
                            dataKey="symfony"
                            fill="var(--color-symfony, #f59e0b)"
                            radius={[4, 4, 0, 0]}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

export default function ComparisonCharts({ pimcore, symfony }) {
    if (!pimcore || !symfony) {
        return <div className="small">Pokrenite oba testa kako biste vidjeli usporedne grafikone.</div>;
    }

    const charts = METRICS.map((m) => {
        const p = m.getP(pimcore);
        const s = m.getS(symfony);
        return <MetricChart key={m.key} title={m.title} pVal={p} sVal={s} />;
    }).filter(Boolean);

    if (!charts.length) {
        return <div className="small">Nema dostupnih usporedivih metrika.</div>;
    }

    return (
        <div
            className="charts-grid"
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 12,
            }}
        >
            {charts}
        </div>
    );
}
