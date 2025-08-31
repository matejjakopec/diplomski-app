import Field from './Field';
import Select from './Select';

export default function ParamsForm({ params, onChange }) {
    return (
        <>
            <details open>
                <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: 12 }}>
                    Parametri
                </summary>

                <fieldset>
                    <legend>Mehanizam i opterećenje</legend>
                    <div className="row">
                        <Select
                            label="Mehanizam"
                            name="engine"
                            value={params.engine}
                            onChange={onChange}
                            options={[
                                { value: 'es', label: 'Elasticsearch' },
                                { value: 'sql', label: 'SQL' },
                            ]}
                        />
                        <Field
                            label="Zahtjevi (istodobni)"
                            name="reqs"
                            type="number"
                            value={params.reqs}
                            onChange={onChange}
                        />
                    </div>
                </fieldset>

                <fieldset>
                    <legend>Upit proizvoda</legend>
                    <div className="row">
                        <Field label="q (pretraga)" name="q" value={params.q} onChange={onChange} placeholder="slobodan tekst" />
                        <Field label="perPage" name="perPage" type="number" value={params.perPage} onChange={onChange} />
                    </div>
                    <div className="row">
                        <Field label="sort" name="sort" value={params.sort} onChange={onChange} />
                        <Select
                            label="dir"
                            name="dir"
                            value={params.dir}
                            onChange={onChange}
                            options={[
                                { value: 'asc', label: 'asc' },
                                { value: 'desc', label: 'desc' },
                            ]}
                        />
                    </div>
                    <div className="row">
                        <Field label="page" name="page" type="number" value={params.page} onChange={onChange} />
                        <Field label="brandId" name="brandId" type="number" value={params.brandId} onChange={onChange} />
                    </div>
                    <div className="row">
                        <Field label="categoryId" name="categoryId" type="number" value={params.categoryId} onChange={onChange} />
                        <Field label="priceMin" name="priceMin" type="number" value={params.priceMin} onChange={onChange} />
                    </div>
                    <div className="row">
                        <Field label="priceMax" name="priceMax" type="number" value={params.priceMax} onChange={onChange} />
                        <Field label="stockMin" name="stockMin" type="number" value={params.stockMin} onChange={onChange} />
                    </div>
                    <div className="row">
                        <Field label="stockMax" name="stockMax" type="number" value={params.stockMax} onChange={onChange} />
                        <div />
                    </div>
                </fieldset>
            </details>
        </>
    );
}
