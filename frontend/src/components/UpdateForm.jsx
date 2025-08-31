import React from 'react';

export default function UpdateForm({ params, onChange, onBodyChange }) {
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
                <div className="row">
                    <div className="label">
                        <span>ID proizvoda</span>
                        <input
                            className="input"
                            name="id"
                            type="number"
                            min="1"
                            value={params.id}
                            onChange={onChange}
                            placeholder="npr. 123"
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
            </fieldset>

            <fieldset>
                <legend>JSON tijelo za PATCH</legend>
                <div className="label">
                    <span>Tijelo</span>
                    <textarea
                        className="input"
                        rows={10}
                        value={params.body}
                        onChange={(e) => onBodyChange(e.target.value)}
                        spellCheck={false}
                        placeholder={`{
  "name": "Novi naziv",
  "stockQuantity": 42,
  "price": { "value": 12.99, "unit": "EUR" },
  "brandId": 5,
  "categoryId": 7,
  "published": true
}`}
                    />
                </div>
                <div className="small">
                    Bilo koja valjana polja koja vaš API prihvaća na <code>PATCH /api/{'{engine}'}/product/{'{id}'}</code>.
                </div>
            </fieldset>
        </>
    );
}
