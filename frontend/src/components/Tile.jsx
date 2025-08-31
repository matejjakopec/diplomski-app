import React, { useId, useState } from 'react';

export default function Tile({
                                 badge,
                                 title,
                                 subtitle,
                                 children,
                                 collapsible = true,
                                 open: controlledOpen,
                                 defaultOpen = false,
                                 onToggle,
                             }) {
    const isControlled = controlledOpen !== undefined;
    const [internalOpen, setInternalOpen] = useState(defaultOpen);
    const open = isControlled ? controlledOpen : internalOpen;

    const bodyId = useId();

    function toggle() {
        if (!collapsible) return;
        if (onToggle) onToggle(!open);
        if (!isControlled) setInternalOpen((v) => !v);
    }

    return (
        <section className={`tile ${open ? 'open' : ''}`} aria-expanded={collapsible ? open : undefined}>
            <button
                type="button"
                className="tile__header"
                onClick={toggle}
                aria-controls={bodyId}
                aria-expanded={open}
            >
                <div className="tile__left">
                    {badge && <span className="badge">{badge}</span>}
                    <div className="tile__titles">
                        <h2 className="tile__title">{title}</h2>
                        {subtitle && <div className="tile__subtitle">{subtitle}</div>}
                    </div>
                </div>
                {collapsible && <span className="chev" aria-hidden="true">▾</span>}
            </button>

            <div id={bodyId} className="tile__body" hidden={collapsible && !open}>
                {children}
            </div>
        </section>
    );
}
