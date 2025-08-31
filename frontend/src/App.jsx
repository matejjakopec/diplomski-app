import React, { useState } from 'react';
import './styles/theme.css';
import Tile from './components/Tile';
import ParamsForm from './components/ParamsForm';
import ResultsCard from './components/ResultsCard';
import ComparisonCharts from './components/ComparisonCharts';
import UpdateForm from './components/UpdateForm';
import ParamsSeedForm from './components/ParamsSeedForm';
import { runK6, seedK6, updateK6 } from './lib/api';
import ParamsBulkForm from './components/ParamsBulkForm';
import { bulkPriceK6 } from './lib/api';

export default function App() {
    const [params, setParams] = useState({
        engine: 'es',
        reqs: 1,
        perPage: 25,
        sort: 'name',
        dir: 'asc',
        page: 1,
        q: '',
        brandId: '',
        categoryId: '',
        priceMin: '',
        priceMax: '',
        stockMin: '',
        stockMax: '',
    });

    const [seedParams, setSeedParams] = useState({
        engine: 'es',
        count: 100,
        reqs: 1,
    });

    const [upd, setUpd] = useState({
        engine: 'es',
        id: '',
        reqs: 1,
        body: `{\n  "name": "Novi naziv",\n  "stockQuantity": 42\n}`,
    });

    const [bulkParams, setBulkParams] = useState({
        engine: 'es',
        percent: 10,
        count: '',
        reqs: 1,
    });

    const [loading, setLoading] = useState({ pimcore: false, symfony: false });
    const [seedLoading, setSeedLoading] = useState({ pimcore: false, symfony: false });
    const [updLoading, setUpdLoading] = useState({ pimcore: false, symfony: false });
    const [err, setErr] = useState('');
    const [seedErr, setSeedErr] = useState('');
    const [bulkLoading, setBulkLoading] = useState({ pimcore: false, symfony: false });
    const [bulkErr, setBulkErr] = useState('');

    const [resP, setResP] = useState(null);
    const [resS, setResS] = useState(null);
    const [seedP, setSeedP] = useState(null);
    const [seedS, setSeedS] = useState(null);
    const [updP, setUpdP] = useState(null);
    const [updS, setUpdS] = useState(null);
    const [bulkP, setBulkP] = useState(null);
    const [bulkS, setBulkS] = useState(null);

    const [open1, setOpen1] = useState(true);
    const [seedOpen, setSeedOpen] = useState(false);
    const [open3, setOpen3] = useState(false);
    const [open4, setOpen4] = useState(false);

    function onChange(e) {
        const { name, value } = e.target;
        setParams((p) => ({ ...p, [name]: value }));
    }
    function onSeedChange(e) {
        const { name, value } = e.target;
        setSeedParams((p) => ({ ...p, [name]: value }));
    }
    function onUpdChange(e) {
        const { name, value } = e.target;
        setUpd((p) => ({ ...p, [name]: value }));
    }
    function onUpdBodyChange(v) {
        setUpd((p) => ({ ...p, body: v }));
    }
    function onBulkChange(e) {
        const { name, value } = e.target;
        setBulkParams((p) => ({ ...p, [name]: value }));
    }

    async function call(backend) {
        setErr('');
        setLoading((s) => ({ ...s, [backend]: true }));
        try {
            const summary = await runK6(backend, params);
            if (backend === 'pimcore') setResP(summary);
            else setResS(summary);
            setOpen1(true);
        } catch (e) {
            setErr(e.message);
        } finally {
            setLoading((s) => ({ ...s, [backend]: false }));
        }
    }

    async function callSeed(backend) {
        setSeedErr('');
        setSeedLoading((s) => ({ ...s, [backend]: true }));
        try {
            const summary = await seedK6(backend, {
                engine: seedParams.engine,
                count: Number(seedParams.count) || 1,
                reqs: Number(seedParams.reqs) || 1,
            });
            if (backend === 'pimcore') setSeedP(summary);
            else setSeedS(summary);
            setSeedOpen(true);
        } catch (e) {
            setSeedErr(e.message);
        } finally {
            setSeedLoading((s) => ({ ...s, [backend]: false }));
        }
    }

    async function callUpdate(backend) {
        setErr('');
        setUpdLoading((s) => ({ ...s, [backend]: true }));
        try {
            let payload = {};
            if (upd.body && upd.body.trim().length) {
                try {
                    payload = JSON.parse(upd.body);
                } catch {
                    throw new Error('Tijelo zahtjeva mora biti valjan JSON.');
                }
            }
            const summary = await updateK6(backend, {
                engine: upd.engine,
                id: upd.id,
                reqs: Number(upd.reqs) || 1,
                payload,
            });
            if (backend === 'pimcore') setUpdP(summary);
            else setUpdS(summary);
            setOpen3(true);
        } catch (e) {
            setErr(e.message);
        } finally {
            setUpdLoading((s) => ({ ...s, [backend]: false }));
        }
    }

    async function callBulk(backend) {
        setBulkErr('');
        setBulkLoading((s) => ({ ...s, [backend]: true }));
        try {
            const summary = await bulkPriceK6(backend, {
                engine: bulkParams.engine,
                percent: Number(bulkParams.percent),
                count: bulkParams.count !== '' ? Number(bulkParams.count) : undefined,
                reqs: Number(bulkParams.reqs) || 1,
            });
            if (backend === 'pimcore') setBulkP(summary);
            else setBulkS(summary);
            setOpen4(true);
        } catch (e) {
            setBulkErr(e.message);
        } finally {
            setBulkLoading((s) => ({ ...s, [backend]: false }));
        }
    }

    return (
        <div className="container">
            <h1 className="h1">API Bench – Nadzorna ploča</h1>
            <p className="sub">Pokrenite k6 putem Symfonyja nad Pimcore/Symfony API-jima. Prilagodite parametre i usporedite.</p>

            {err && <div className="alert">{err}</div>}

            <div className="stack">
                <Tile
                    collapsible
                    open={open1}
                    onToggle={setOpen1}
                    badge="Kartica 1"
                    title="Usporedni test pretraživanja proizvoda"
                    subtitle={`Poziva /k6/run → /api/${params.engine}/product s vašim parametrima`}
                >
                    <ParamsForm params={params} onChange={onChange} />

                    <div className="btnbar">
                        <button className="btn" disabled={loading.pimcore} onClick={() => call('pimcore')}>
                            {loading.pimcore ? 'Pozivam Pimcore…' : 'Pozovi Pimcore'}
                        </button>
                        <button className="btn outline" disabled={loading.symfony} onClick={() => call('symfony')}>
                            {loading.symfony ? 'Pozivam Symfony…' : 'Pozovi Symfony'}
                        </button>
                    </div>

                    <div className="hr" />
                    <div className="row">
                        <ResultsCard title="Rezultat Pimcore-a" summary={resP} />
                        <ResultsCard title="Rezultat Symfonyja" summary={resS} />
                    </div>

                    <div className="hr" />
                    <ComparisonCharts pimcore={resP} symfony={resS} />
                </Tile>

                {seedErr && <div className="alert">{seedErr}</div>}
                <Tile
                    collapsible
                    open={seedOpen}
                    onToggle={setSeedOpen}
                    badge="Kartica 2"
                    title="Usporedni test inicijalnog punjenja"
                    subtitle="Poziva /k6/seed → POST /api/{engine}/seed s {count}"
                >
                    <ParamsSeedForm params={seedParams} onChange={onSeedChange} />

                    <div className="btnbar">
                        <button className="btn" disabled={seedLoading.pimcore} onClick={() => callSeed('pimcore')}>
                            {seedLoading.pimcore ? 'Inicijalno punim Pimcore…' : 'Inicijalno punjenje Pimcore-a'}
                        </button>
                        <button className="btn outline" disabled={seedLoading.symfony} onClick={() => callSeed('symfony')}>
                            {seedLoading.symfony ? 'Inicijalno punim Symfony…' : 'Inicijalno punjenje Symfonyja'}
                        </button>
                    </div>

                    <div className="hr" />
                    <div className="row">
                        <ResultsCard title="Rezultat inicijalnog punjenja – Pimcore" summary={seedP} />
                        <ResultsCard title="Rezultat inicijalnog punjenja – Symfony" summary={seedS} />
                    </div>

                    <div className="hr" />
                    <ComparisonCharts pimcore={seedP} symfony={seedS} />
                </Tile>

                <Tile
                    collapsible
                    open={open3}
                    onToggle={setOpen3}
                    badge="Kartica 3"
                    title="Ažuriranje proizvoda (PATCH)"
                    subtitle="Poziva /k6/update → PATCH /api/{engine}/product/{id} s vašim JSON tijelom zahtjeva"
                >
                    <UpdateForm params={upd} onChange={onUpdChange} onBodyChange={onUpdBodyChange} />
                    <div className="btnbar">
                        <button className="btn" disabled={updLoading.pimcore} onClick={() => callUpdate('pimcore')}>
                            {updLoading.pimcore ? 'Ažuriram Pimcore…' : 'Ažuriraj Pimcore'}
                        </button>
                        <button className="btn outline" disabled={updLoading.symfony} onClick={() => callUpdate('symfony')}>
                            {updLoading.symfony ? 'Ažuriram Symfony…' : 'Ažuriraj Symfony'}
                        </button>
                    </div>

                    <div className="hr" />
                    <div className="row">
                        <ResultsCard title="Rezultat ažuriranja – Pimcore" summary={updP} />
                        <ResultsCard title="Rezultat ažuriranja – Symfony" summary={updS} />
                    </div>

                    <div className="hr" />
                    <ComparisonCharts pimcore={updP} symfony={updS} />
                </Tile>

                {bulkErr && <div className="alert">{bulkErr}</div>}
                <Tile
                    collapsible
                    open={open4}
                    onToggle={setOpen4}
                    badge="Kartica 4"
                    title="Skupno ažuriranje cijena"
                    subtitle="Poziva /k6/bulk-price → POST /api/{engine}/bulk-price s { percent, count? }"
                >
                    <ParamsBulkForm params={bulkParams} onChange={onBulkChange} />

                    <div className="btnbar">
                        <button className="btn" disabled={bulkLoading.pimcore} onClick={() => callBulk('pimcore')}>
                            {bulkLoading.pimcore ? 'Skupno ažuriram Pimcore…' : 'Skupno ažuriranje – Pimcore'}
                        </button>
                        <button className="btn outline" disabled={bulkLoading.symfony} onClick={() => callBulk('symfony')}>
                            {bulkLoading.symfony ? 'Skupno ažuriram Symfony…' : 'Skupno ažuriranje – Symfony'}
                        </button>
                    </div>

                    <div className="hr" />
                    <div className="row">
                        <ResultsCard title="Rezultat skupnog ažuriranja – Pimcore" summary={bulkP} />
                        <ResultsCard title="Rezultat skupnog ažuriranja – Symfony" summary={bulkS} />
                    </div>

                    <div className="hr" />
                    <ComparisonCharts pimcore={bulkP} symfony={bulkS} />
                </Tile>
            </div>
        </div>
    );
}
