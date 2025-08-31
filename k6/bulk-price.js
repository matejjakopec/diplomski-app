import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

// Target
const BACKEND = (__ENV.BACKEND || 'pimcore').toLowerCase(); // pimcore|symfony
const ENGINE  = (__ENV.ENGINE  || 'es').toLowerCase();      // es|sql
const USE_ROUTER = __ENV.USE_ROUTER === '1';

// Bases
const BASES = {
    pimcore: __ENV.BASE_PIMCORE || 'https://pimcore-api.ddev.site',
    symfony: __ENV.BASE_SYMFONY || 'https://symfony-api.ddev.site',
};
const BASE = USE_ROUTER ? 'http://ddev-router' : (__ENV.BASE || BASES[BACKEND]);

// Allow overriding the exact bulk endpoint path if needed, else default
// e.g. BULK_PATH="/api/es/bulk-price" or "/bulk-price"
const BULK_PATH = __ENV.BULK_PATH || `/api/${ENGINE}/bulk-price`;

// Body
const PERCENT = Number(__ENV.PERCENT || '0');
const COUNT   = __ENV.COUNT && String(__ENV.COUNT).length ? Number(__ENV.COUNT) : null;

// Options
const REQS      = Number(__ENV.REQS || '0');
const NO_THRESH = __ENV.NO_THRESH === '1';

export const options = (() => {
    const base = {
        insecureSkipTLSVerify: !USE_ROUTER,
        vus: Number(__ENV.VUS || '10'),
        duration: __ENV.DURATION || '10s',
        thresholds: NO_THRESH ? {} : {
            http_req_duration: ['p(95)<5000'],
            errors: ['rate<0.05'],
        },
    };
    if (REQS > 0) {
        delete base.duration;
        base.vus = REQS;
        base.iterations = REQS;
    }
    return base;
})();

// Metrics
const latency     = new Trend('latency_ms');
const bytes_recv  = new Trend('bytes_received');
const errors      = new Rate('errors');
const status_2xx  = new Counter('status_2xx');
const status_3xx  = new Counter('status_3xx');
const status_4xx  = new Counter('status_4xx');
const status_5xx  = new Counter('status_5xx');

// Server-Timing trends (if your API sends them)
const st_app = new Trend('server_app_ms');
const st_db  = new Trend('server_db_ms');
const st_es  = new Trend('server_es_ms');

function parseServerTiming(headerVal) {
    const out = {};
    if (!headerVal) return out;
    headerVal.split(',').forEach((part) => {
        const [name, ...params] = part.trim().split(';');
        const map = new Map(params.map((p) => p.split('=')));
        const dur = map.get('dur') ? Number(map.get('dur')) : null;
        if (dur != null && !Number.isNaN(dur)) out[name] = dur;
    });
    return out;
}

function url() {
    return `${BASE}${BULK_PATH.startsWith('/') ? '' : '/'}${BULK_PATH}`;
}

export default function () {
    const headers = { 'content-type': 'application/json', accept: 'application/json' };
    if (USE_ROUTER) {
        headers.Host = BACKEND === 'pimcore' ? 'pimcore-api.ddev.site' : 'symfony-api.ddev.site';
    }

    const body = { percent: PERCENT };
    if (COUNT && COUNT > 0) body.count = COUNT;

    const res = http.post(url(), JSON.stringify(body), { headers });

    const ok = check(res, { 'status is 2xx/3xx': (r) => r.status >= 200 && r.status < 400 });

    latency.add(res.timings.duration);
    bytes_recv.add(res.body ? res.body.length : 0);

    const s = res.status;
    if (s >= 200 && s < 300) status_2xx.add(1);
    else if (s >= 300 && s < 400) status_3xx.add(1);
    else if (s >= 400 && s < 500) status_4xx.add(1);
    else status_5xx.add(1);

    if (!ok) {
        errors.add(1);
        // Helpful during debugging:
        console.log(`[bulk] ${s} ${url()} body=${JSON.stringify(body)} resp=${(res.body || '').slice(0, 500)}`);
    }

    // Capture Server-Timing if present
    const stHeader = res.headers['Server-Timing'] ?? res.headers['server-timing'];
    const st = parseServerTiming(stHeader);
    if (st.app != null) st_app.add(st.app, { backend: BACKEND, engine: ENGINE });
    if (st.db  != null) st_db.add(st.db,   { backend: BACKEND, engine: ENGINE });
    if (st.es  != null) st_es.add(st.es,   { backend: BACKEND, engine: ENGINE });

    const SLEEP = Number(__ENV.SLEEP || '0.1');
    if (SLEEP > 0) sleep(SLEEP);
}

export function handleSummary(data) {
    const httpReqs = data.metrics.http_reqs?.values?.count ?? 0;
    const durStr = (typeof options.duration === 'string') ? options.duration.trim() : null;
    let estSeconds = null;
    if (durStr && durStr.endsWith('s')) estSeconds = Number(durStr.slice(0, -1));
    if (durStr && durStr.endsWith('m')) estSeconds = Number(durStr.slice(0, -1)) * 60;

    const summary = {
        kind: 'bulk',
        backend: BACKEND,
        engine: ENGINE,
        percent: PERCENT,
        count: COUNT,
        path: BULK_PATH,
        vus: options.vus,
        duration: options.duration,
        totals: {
            http_reqs: httpReqs,
            http_req_failed: data.metrics.http_req_failed?.values?.rate ?? 0,
            data_received: data.metrics.data_received?.values?.count ?? 0,
            data_sent: data.metrics.data_sent?.values?.count ?? 0,
            status_2xx: data.metrics.status_2xx?.values?.count ?? 0,
            status_3xx: data.metrics.status_3xx?.values?.count ?? 0,
            status_4xx: data.metrics.status_4xx?.values?.count ?? 0,
            status_5xx: data.metrics.status_5xx?.values?.count ?? 0,
        },
        latency_ms: {
            avg:  data.metrics.http_req_duration?.values['avg'] ?? null,
            min:  data.metrics.http_req_duration?.values['min'] ?? null,
            max:  data.metrics.http_req_duration?.values['max'] ?? null,
            p50:  data.metrics.http_req_duration?.values['p(50)'] ?? null,
            p90:  data.metrics.http_req_duration?.values['p(90)'] ?? null,
            p95:  data.metrics.http_req_duration?.values['p(95)'] ?? null,
            p99:  data.metrics.http_req_duration?.values['p(99)'] ?? null,
        },
        latency_breakdown_ms: {
            sending:   data.metrics.http_req_sending?.values['avg'] ?? null,
            waiting:   data.metrics.http_req_waiting?.values['avg'] ?? null,
            receiving: data.metrics.http_req_receiving?.values['avg'] ?? null,
        },
        connection_ms: {
            blocked:         data.metrics.http_req_blocked?.values['avg'] ?? null,
            connecting:      data.metrics.http_req_connecting?.values['avg'] ?? null,
            tls_handshaking: data.metrics.http_req_tls_handshaking?.values['avg'] ?? null,
        },
        server_timing_ms: {
            app_avg: data.metrics.server_app_ms?.values?.avg ?? null,
            db_avg:  data.metrics.server_db_ms?.values?.avg ?? null,
            es_avg:  data.metrics.server_es_ms?.values?.avg ?? null,
            app_p95: data.metrics.server_app_ms?.values?.['p(95)'] ?? null,
            db_p95:  data.metrics.server_db_ms?.values?.['p(95)'] ?? null,
            es_p95:  data.metrics.server_es_ms?.values?.['p(95)'] ?? null,
        },
        throughput: {
            est_rps: (estSeconds && estSeconds > 0) ? +(httpReqs / estSeconds).toFixed(2) : null,
            avg_bytes_per_req: httpReqs
                ? +((data.metrics.data_received?.values?.count ?? 0) / httpReqs).toFixed(1)
                : null,
        },
    };

    return { 'summary.json': JSON.stringify(summary, null, 2) };
}
