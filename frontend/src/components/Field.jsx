export default function Field({ label, name, type = "text", value, onChange, placeholder }) {
    return (
        <label className="label">
            <span>{label}</span>
            <input
                className="input"
                type={type}
                name={name}
                value={value ?? ""}
                onChange={onChange}
                placeholder={placeholder}
            />
        </label>
    );
}
