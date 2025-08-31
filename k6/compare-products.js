import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

// ---- CHOOSE TARGET ----
const BACKEND = (__ENV.BACKEND || 'pimcore').toLowerCase(); // pimcore|symfony
const ENGINE  = (__ENV.ENGINE  || 'es').toLowerCase();      // es|sql

// Are we calling via the DDEV router from inside containers?
const USE_ROUTER = __ENV.USE_ROUTER === '1';                 // set to 1 inside ddev

// Bases
const BASES = {
    pimcore: __ENV.BASE_PIMCORE || 'https://pimcore-api.ddev.site',
    symfony: __ENV.BASE_SYMFONY || 'https://symfony-api.ddev.site',
};

// If using router, we go through http://ddev-router and set Host header.
// Otherwise, use the normal per-project base.
const BASE = USE_ROUTER ? 'http://ddev-router' : (__ENV.BASE || BASES[BACKEND]);

// ProductQuery params
const QP = {
    brandId:    __ENV.brandId,
    categoryId: __ENV.categoryId,
    q:          __ENV.q,
    priceMin:   __ENV.priceMin,
    priceMax:   __ENV.priceMax,
    stockMin:   __ENV.stockMin,
    stockMax:   __ENV.stockMax,
    sort:       __ENV.sort || 'name',
    dir:        __ENV.dir  || 'asc',
    page:       __ENV.page || '1',
    perPage:    __ENV.perPage || '25',
};

// ---- OPTIONS ----
const REQS      = Number(__ENV.REQS || '0');    // if >0 => exact N concurrent (vus=iterations=N)
const NO_THRESH = __ENV.NO_THRESH === '1';

export const options = (() => {
    const base = {
        insecureSkipTLSVerify: !USE_ROUTER, // only needed when using https *.ddev.site
        vus: Number(__ENV.VUS || '50'),
        duration: __ENV.DURATION || '30s',
        thresholds: NO_THRESH ? {} : {
            http_req_duration: ['p(95)<2000'],
            errors: ['rate<0.01'],
        },
    };
    if (REQS > 0) {
        delete base.duration;
        base.vus = REQS;
        base.iterations = REQS;
    }
    return base;
})();

// ---- METRICS ----
const latency     = new Trend('latency_ms');
const bytes_recv  = new Trend('bytes_received');
const errors      = new Rate('errors');
const status_2xx  = new Counter('status_2xx');
const status_3xx  = new Counter('status_3xx');
const status_4xx  = new Counter('status_4xx');
const status_5xx  = new Counter('status_5xx');

// Server-Timing custom trends
const st_app = new Trend('server_app_ms');
const st_db  = new Trend('server_db_ms');
const st_es  = new Trend('server_es_ms');

// ---- DEBUG / SAMPLING ----
const DEBUG         = __ENV.DEBUG === '1';
const SAMPLE_MODE   = (__ENV.SAMPLE_MODE || 'fail').toLowerCase(); // fail|success|all
const FAIL_SAMPLE   = Number(__ENV.FAIL_SAMPLE || '5');
const MAX_BODY      = Number(__ENV.MAX_BODY || '1000');
const PRINT_SAMPLES = __ENV.PRINT_SAMPLES === '1';
let samples = [];

// ---- HELPERS ----
function qs(obj) {
    return Object.entries(obj)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
}

function targetUrl() {
    const path = `/api/${ENGINE}/product`;
    const query = qs(QP);
    return query ? `${BASE}${path}?${query}` : `${BASE}${path}`;
}

function shouldSample(ok) {
    if (!DEBUG || samples.length >= FAIL_SAMPLE) return false;
    if (SAMPLE_MODE === 'all') return true;
    if (SAMPLE_MODE === 'fail') return !ok;
    if (SAMPLE_MODE === 'success') return ok;
    return false;
}

function parseServerTiming(headerVal) {
    // Example: "app;dur=23.5, db;dur=12.1, es;dur=45.7"
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

// ---- TEST LOOP ----
export default function () {
    const url = targetUrl();

    const headers = {
        accept: 'application/json',
    };

    // When using router, tell Traefik which vhost to route to
    if (USE_ROUTER) {
        headers.Host = BACKEND === 'pimcore'
            ? 'pimcore-api.ddev.site'
            : 'symfony-api.ddev.site';
    }

    const res = http.get(url, { headers });

    const ok = check(res, {
        'status is 2xx/3xx': r => r.status >= 200 && r.status < 400,
    });

    latency.add(res.timings.duration);
    bytes_recv.add(res.body ? res.body.length : 0);

    const s = res.status;
    if (s >= 200 && s < 300) status_2xx.add(1);
    else if (s >= 300 && s < 400) status_3xx.add(1);
    else if (s >= 400 && s < 500) status_4xx.add(1);
    else status_5xx.add(1);

    if (!ok) errors.add(1);

    // ---- Server-Timing header capture ----
    const stHeader =
        res.headers['Server-Timing'] ??
        res.headers['Server-timing'] ??
        res.headers['server-timing'];
    const st = parseServerTiming(stHeader);
    if (st.app != null) st_app.add(st.app, { backend: BACKEND, engine: ENGINE });
    if (st.db  != null) st_db.add(st.db,   { backend: BACKEND, engine: ENGINE });
    if (st.es  != null) st_es.add(st.es,   { backend: BACKEND, engine: ENGINE });

    // ---- Optional sampling ----
    if (shouldSample(ok)) {
        const snippet = (res.body || '').slice(0, MAX_BODY);
        const item = { status: s, url, headers: res.headers, snippet };
        samples.push(item);
        if (PRINT_SAMPLES) {
            console.log(`\n[Sample] ${s} ${url}\nHeaders: ${JSON.stringify(res.headers)}\nBody: ${snippet}\n`);
        }
    }

    const SLEEP = Number(__ENV.SLEEP || '0.2');
    if (SLEEP > 0) sleep(SLEEP);
}

// ---- SUMMARY ----
export function handleSummary(data) {
    // try best-effort duration (works when duration mode used)
    const durStr = (typeof options.duration === 'string') ? options.duration.trim() : null;
    const httpReqs = data.metrics.http_reqs?.values?.count ?? 0;
    let estSeconds = null;
    if (durStr && durStr.endsWith('s')) estSeconds = Number(durStr.slice(0, -1));
    if (durStr && durStr.endsWith('m')) estSeconds = Number(durStr.slice(0, -1)) * 60;

    const summary = {
        backend: BACKEND,
        engine: ENGINE,
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
            waiting:   data.metrics.http_req_waiting?.values['avg'] ?? null,   // ~server time
            receiving: data.metrics.http_req_receiving?.values['avg'] ?? null,
        },
        connection_ms: {
            blocked:        data.metrics.http_req_blocked?.values['avg'] ?? null,
            connecting:     data.metrics.http_req_connecting?.values['avg'] ?? null,
            tls_handshaking:data.metrics.http_req_tls_handshaking?.values['avg'] ?? null,
        },
        iteration_duration_ms: {
            avg: data.metrics.iteration_duration?.values['avg'] ?? null,
            min: data.metrics.iteration_duration?.values['min'] ?? null,
            max: data.metrics.iteration_duration?.values['max'] ?? null,
        },
        throughput: {
            est_rps: (estSeconds && estSeconds > 0) ? +(httpReqs / estSeconds).toFixed(2) : null,
            avg_bytes_per_req: httpReqs
                ? +((data.metrics.data_received?.values?.count ?? 0) / httpReqs).toFixed(1)
                : null,
        },
        server_timing_ms: {
            app_avg: data.metrics.server_app_ms?.values?.avg ?? null,
            db_avg:  data.metrics.server_db_ms?.values?.avg ?? null,
            es_avg:  data.metrics.server_es_ms?.values?.avg ?? null,
            app_p95: data.metrics.server_app_ms?.values?.['p(95)'] ?? null,
            db_p95:  data.metrics.server_db_ms?.values?.['p(95)'] ?? null,
            es_p95:  data.metrics.server_es_ms?.values?.['p(95)'] ?? null,
        },
        samples: DEBUG ? samples.slice(0, 10) : [],
    };

    console.log(`
Requests: ${summary.totals.http_reqs}, Fail rate: ${summary.totals.http_req_failed}
Latency (ms): avg=${summary.latency_ms.avg}, p95=${summary.latency_ms.p95}, max=${summary.latency_ms.max}
Waiting(avg)=${summary.latency_breakdown_ms.waiting}  Connect=${summary.connection_ms.connecting}  TLS=${summary.connection_ms.tls_handshaking}
ServerTiming(avg): app=${summary.server_timing_ms.app_avg} db=${summary.server_timing_ms.db_avg} es=${summary.server_timing_ms.es_avg}
`);

    return { 'summary.json': JSON.stringify(summary, null, 2) };
}
