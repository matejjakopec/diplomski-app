import { prettyNum, fmtMs, fmtPct, fmtBytes } from '../lib/format';

function has(v) {
    return v !== null && v !== undefined;
}

function Row({ label, value, show = true }) {
    if (!show) return null;
    return (
        <>
            <div className="k">{label}</div>
            <div>{value}</div>
        </>
    );
}

export default function ResultsCard({ title, summary }) {
    if (!summary) {
        return (
            <div>
                <h3 style={{ marginTop: 0 }}>{title}</h3>
                <div className="small">Još nije pokrenuto.</div>
            </div>
        );
    }

    const totals = summary.totals ?? {};
    const L = summary.latency_ms ?? {};
    const LB = summary.latency_breakdown_ms ?? {};
    const CONN = summary.connection_ms ?? {};
    const THR = summary.throughput ?? {};
    const ST = summary.server_timing_ms ?? {};

    const latParts = [];
    if (has(L.avg)) latParts.push(fmtMs(L.avg));
    if (has(L.p95)) latParts.push(fmtMs(L.p95));
    if (has(L.p99)) latParts.push(fmtMs(L.p99));
    const latMain = latParts.length ? latParts.join(' / ') : null;

    const latMinMaxParts = [];
    if (has(L.min)) latMinMaxParts.push(fmtMs(L.min));
    if (has(L.max)) latMinMaxParts.push(fmtMs(L.max));
    const latMinMax = latMinMaxParts.length ? latMinMaxParts.join(' / ') : null;

    const stApp =
        has(ST.app_avg) ? `${fmtMs(ST.app_avg)}${has(ST.app_p95) ? ' / ' + fmtMs(ST.app_p95) : ''}` : null;
    const stDb =
        has(ST.db_avg) ? `${fmtMs(ST.db_avg)}${has(ST.db_p95) ? ' / ' + fmtMs(ST.db_p95) : ''}` : null;
    const stEs =
        has(ST.es_avg) ? `${fmtMs(ST.es_avg)}${has(ST.es_p95) ? ' / ' + fmtMs(ST.es_p95) : ''}` : null;

    return (
        <div>
            <h3 style={{ marginTop: 0 }}>{title}</h3>

            <div className="kv" style={{ marginBottom: 8 }}>
                <Row label="Zahtjevi" value={prettyNum(totals.http_reqs)} />
                <Row label="Stopa neuspjeha" value={fmtPct(totals.http_req_failed)} />
                <Row
                    label="2xx / 3xx / 4xx / 5xx"
                    value={`${prettyNum(totals.status_2xx)} / ${prettyNum(totals.status_3xx)} / ${prettyNum(
                        totals.status_4xx
                    )} / ${prettyNum(totals.status_5xx)}`}
                    show={
                        has(totals.status_2xx) ||
                        has(totals.status_3xx) ||
                        has(totals.status_4xx) ||
                        has(totals.status_5xx)
                    }
                />
                <Row label="Primljeni podaci" value={fmtBytes(totals.data_received)} show={has(totals.data_received)} />
            </div>

            <div className="kv" style={{ marginBottom: 8 }}>
                <Row label="Latencija prosjek / p95 / p99 (ms)" value={latMain} show={!!latMain} />
                <Row label="Latencija min / maks (ms)" value={latMinMax} show={!!latMinMax} />
            </div>

            <div className="kv" style={{ marginBottom: 8 }}>
                <Row label="Slanje (prosjek, ms)" value={fmtMs(LB.sending)} show={has(LB.sending)} />
                <Row label="Čekanje – poslužitelj (prosjek, ms)" value={fmtMs(LB.waiting)} show={has(LB.waiting)} />
                <Row label="Primanje (prosjek, ms)" value={fmtMs(LB.receiving)} show={has(LB.receiving)} />
            </div>

            <div className="kv" style={{ marginBottom: 8 }}>
                <Row label="Blokirano (prosjek, ms)" value={fmtMs(CONN.blocked)} show={has(CONN.blocked)} />
                <Row label="Povezivanje (prosjek, ms)" value={fmtMs(CONN.connecting)} show={has(CONN.connecting)} />
                <Row
                    label="TLS rukovanje (prosjek, ms)"
                    value={fmtMs(CONN.tls_handshaking)}
                    show={has(CONN.tls_handshaking)}
                />
            </div>

            <div className="kv" style={{ marginBottom: 8 }}>
                <Row label="Procijenjeni RPS" value={THR.est_rps} show={has(THR.est_rps)} />
                <Row label="Prosječno bajtova po zahtjevu" value={THR.avg_bytes_per_req} show={has(THR.avg_bytes_per_req)} />
            </div>

            <div className="kv">
                <Row label="Aplikacija na poslužitelju prosjek / p95 (ms)" value={stApp} show={!!stApp} />
                <Row label="Baza podataka na poslužitelju prosjek / p95 (ms)" value={stDb} show={!!stDb} />
                <Row label="Elasticsearch na poslužitelju prosjek / p95 (ms)" value={stEs} show={!!stEs} />
            </div>
        </div>
    );
}
