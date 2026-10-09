interface SegmentedOption<T extends string> {
    value: T;
    label: string;
    icon?: React.ReactNode;
}

interface SegmentedProps<T extends string> {
    value: T;
    onChange: (v: T) => void;
    options: SegmentedOption<T>[];
    size?: 'sm' | 'md';
}

/** Control segmentado reutilizable (pestañas tipo pill) con tokens light/dark. */
export default function Segmented<T extends string>({ value, onChange, options, size = 'md' }: SegmentedProps<T>) {
    const pad = size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm';
    return (
        <div className="inline-flex bg-bg rounded-lg p-1 border border-line" role="tablist">
            {options.map((opt) => {
                const active = value === opt.value;
                return (
                    <button
                        key={opt.value}
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(opt.value)}
                        className={`inline-flex items-center gap-1.5 rounded-md font-medium transition-colors ${pad} ${
                            active ? 'bg-utec-cyan text-white shadow-sm' : 'text-ink-muted hover:text-ink'
                        }`}
                    >
                        {opt.icon}
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
