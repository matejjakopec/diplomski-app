import React from 'react';

export default function ParamsSeedForm({ params, onChange }) {
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
                <legend>Inicijalno punjenje</legend>
                <div className="row">
                    <div className="label">
                        <span>Broj (po zahtjevu)</span>
                        <input
                            className="input"
                            name="count"
                            type="number"
                            min="1"
                            value={params.count}
                            onChange={onChange}
                            placeholder="100"
                        />
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
                </div>
                <div className="small">
                    Pokreće /k6/seed koji šalje POST na /api/{'{engine}'}/seed.
                </div>
            </fieldset>
        </>
    );
}
