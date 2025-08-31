const API_BASE = import.meta?.env?.VITE_API_BASE || ''; // same-origin by default

function toQuery(params) {
    const esc = encodeURIComponent;
    return Object.entries(params)
        .filter(([, v]) => v !== '' && v !== null && v !== undefined)
        .map(([k, v]) => `${esc(k)}=${esc(String(v))}`)
        .join('&');
}

export async function runK6(backend, params) {
    const { engine, reqs, ...rest } = params;
    const qs = toQuery({ engine, reqs, ...rest });
    const url = `${API_BASE}/k6/run?backend=${backend}&${qs}`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    const json = await r.json();
    if (!r.ok || json.ok === false) {
        throw new Error(json?.error || `HTTP ${r.status}`);
    }
    return json.summary || json;
}

export async function seedK6(backend, { count, reqs, vus, duration, sleep }) {
    const qs = new URLSearchParams({
        backend,
        count: String(count ?? 100),
        reqs:  String(reqs  ?? 1),
        vus:   vus ? String(vus) : '',
        duration: duration || '',
        sleep:    sleep || '',
    });
    const res = await fetch(`/k6/seed?${qs.toString()}`);
    if (!res.ok) throw new Error(await res.text());
    const out = await res.json();
    // Normalize shape so the UI always gets a plain k6 summary
    return out.summary ?? out;
}

export async function updateK6(backend, { engine, id, reqs, vus, duration, sleep, payload }) {
    const qs = new URLSearchParams({
        backend,
        engine,
        id: String(id),
        reqs:  reqs != null ? String(reqs) : '',
        vus:   vus ? String(vus) : '',
        duration: duration || '',
        sleep:    sleep || '',
    });
    const res = await fetch(`/k6/update?${qs.toString()}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload || {}),
    });
    if (!res.ok) throw new Error(await res.text());
    const out = await res.json();
    return out.summary ?? out;
}

export async function bulkPriceK6(backend, { engine, percent, count, reqs, vus, duration, sleep }) {
    const qs = new URLSearchParams({
        backend,
        engine,
        percent: String(percent),
        count: count !== undefined && count !== '' ? String(count) : '',
        reqs:  reqs != null ? String(reqs) : '',
        vus:   vus ? String(vus) : '',
        duration: duration || '',
        sleep:    sleep || '',
    });
    const res = await fetch(`/k6/bulk-price?${qs.toString()}`);
    if (!res.ok) throw new Error(await res.text());
    const out = await res.json();
    return out.summary ?? out; // keep shape consistent with other tiles
}

