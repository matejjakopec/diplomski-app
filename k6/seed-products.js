import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

// ---- TARGET & ROUTING ----
const BACKEND    = (__ENV.BACKEND || 'pimcore').toLowerCase(); // pimcore|symfony
const ENGINE     = (__ENV.ENGINE  || 'es').toLowerCase();      // es|sql
const USE_ROUTER = __ENV.USE_ROUTER === '1';

const BASES = {
    pimcore: __ENV.BASE_PIMCORE || 'https://pimcore-api.ddev.site',
    symfony: __ENV.BASE_SYMFONY || 'https://symfony-api.ddev.site',
};
const BASE = USE_ROUTER ? 'http://ddev-router' : (__ENV.BASE || BASES[BACKEND]);

// ---- PAYLOAD ----
const COUNT = Number(__ENV.COUNT || '100'); // products per request

// ---- EXECUTION ----
const REQS      = Number(__ENV.REQS || '0'); // if >0 => vus=iterations=REQS
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

// ---- METRICS ----
const latency     = new Trend('latency_ms');
const bytes_recv  = new Trend('bytes_received');
const errors      = new Rate('errors');
const status_2xx  = new Counter('status_2xx');
const status_3xx  = new Counter('status_3xx');
const status_4xx  = new Counter('status_4xx');
const status_5xx  = new Counter('status_5xx');

// Optional server-timing capture
const st_app = new Trend('server_app_ms');
const st_db  = new Trend('server_db_ms');
const st_es  = new Trend('server_es_ms');

const DEBUG         = __ENV.DEBUG === '1';
const SAMPLE_MODE   = (__ENV.SAMPLE_MODE || 'fail').toLowerCase(); // fail|success|all
const FAIL_SAMPLE   = Number(__ENV.FAIL_SAMPLE || '5');
const MAX_BODY      = Number(__ENV.MAX_BODY || '1000');
const PRINT_SAMPLES = __ENV.PRINT_SAMPLES === '1';
let samples = [];

function shouldSample(ok) {
    if (!DEBUG || samples.length >= FAIL_SAMPLE) return false;
    if (SAMPLE_MODE === 'all') return true;
    if (SAMPLE_MODE === 'fail') return !ok;
    if (SAMPLE_MODE === 'success') return ok;
    return false;
}

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

// ✅ correct route here
function targetUrl() {
    return `${BASE}/api/${ENGINE}/product/seed`;
}

export default function () {
    const url = targetUrl();
    const headers = { 'content-type': 'application/json', accept: 'application/json' };

    if (USE_ROUTER) {
        headers.Host = BACKEND === 'pimcore' ? 'pimcore-api.ddev.site' : 'symfony-api.ddev.site';
    }

    const body = JSON.stringify({ count: COUNT });
    const res = http.post(url, body, { headers });

    const ok = check(res, { 'status is 2xx/3xx': r => r.status >= 200 && r.status < 400 });

    latency.add(res.timings.duration);
    bytes_recv.add(res.body ? res.body.length : 0);

    const s = res.status;
    if (s >= 200 && s < 300) status_2xx.add(1);
    else if (s >= 300 && s < 400) status_3xx.add(1);
    else if (s >= 400 && s < 500) status_4xx.add(1);
    else status_5xx.add(1);

    if (!ok) errors.add(1);

    const stHeader =
        res.headers['Server-Timing'] ??
        res.headers['Server-timing'] ??
        res.headers['server-timing'];
    const st = parseServerTiming(stHeader);
    if (st.app != null) st_app.add(st.app);
    if (st.db  != null) st_db.add(st.db);
    if (st.es  != null) st_es.add(st.es);

    if (shouldSample(ok)) {
        const snippet = (res.body || '').slice(0, MAX_BODY);
        const item = { status: s, url, headers: res.headers, snippet };
        samples.push(item);
        if (PRINT_SAMPLES) {
            console.log(`\n[Sample] ${s} ${url}\nHeaders: ${JSON.stringify(res.headers)}\nBody: ${snippet}\n`);
        }
    }

    const SLEEP = Number(__ENV.SLEEP || '0');
    if (SLEEP > 0) sleep(SLEEP);
}

export function handleSummary(data) {
    const httpReqs = data.metrics.http_reqs?.values?.count ?? 0;

    const summary = {
        kind: 'seed',
        backend: BACKEND,
        engine: ENGINE,
        count_per_request: COUNT,
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
        samples: DEBUG ? samples.slice(0, 10) : [],
    };
    return { 'summary.json': JSON.stringify(summary, null, 2) };
}
