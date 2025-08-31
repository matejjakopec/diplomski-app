export default function Select({ label, name, value, onChange, options }) {
    return (
        <label className="label">
            <span>{label}</span>
            <select className="input" name={name} value={value} onChange={onChange}>
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
        </label>
    );
}
