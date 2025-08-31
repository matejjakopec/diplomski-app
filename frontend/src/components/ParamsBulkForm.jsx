import React from 'react';

export default function ParamsBulkForm({ params, onChange }) {
    return (
        <>
            <fieldset>
                <legend>Odredište</legend>
                <div className="label">
                    <span>Mehanizam</span>
                    <select name="engine" value={params.engine} onChange={onChange}>
                        <option value="es">ES</option>
                        <option value="sql">SQL</option>
                    </select>
                </div>
            </fieldset>

            <fieldset>
                <legend>Skupno ažuriranje cijena</legend>
                <div className="row">
                    <div className="label">
                        <span>Postotak (može biti negativan)</span>
                        <input
                            className="input"
                            name="percent"
                            type="number"
                            step="0.01"
                            value={params.percent}
                            onChange={onChange}
                            placeholder="10 za +10%, -5 za -5%"
                        />
                    </div>
                    <div className="label">
                        <span>Broj (neobvezno)</span>
                        <input
                            className="input"
                            name="count"
                            type="number"
                            min="1"
                            value={params.count}
                            onChange={onChange}
                            placeholder="(ograniči broj proizvoda)"
                        />
                    </div>
                </div>
                <div className="label">
                    <span>REQS (VUs = iteracije)</span>
                    <input
                        className="input"
                        name="reqs"
                        type="number"
                        min="1"
                        value={params.reqs}
                        onChange={onChange}
                        placeholder="1"
                    />
                </div>
            </fieldset>
        </>
    );
}
