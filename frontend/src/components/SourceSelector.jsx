import { useState } from 'react';
import SystemIcon from './SystemIcon';

function SourceSelector({
    title,
    helperText,
    providers = [],
    selectedIds = [],
    onToggle,
    disabled = false,
    defaultCollapsed = true
}) {
    const selectedSet = new Set(selectedIds);
    const [isExpanded, setIsExpanded] = useState(!defaultCollapsed);

    return (
        <div className="panel-muted p-3">
            <button
                type="button"
                onClick={() => setIsExpanded((current) => !current)}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 text-left"
                aria-expanded={isExpanded}
            >
                <div className="min-w-0">
                    <div className="section-title">{title}</div>
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 text-xs font-semibold text-cyan-100">
                        {selectedIds.length} selected
                    </span>
                    {helperText && (
                        <span className="text-xs text-slate-400">{helperText}</span>
                    )}
                </div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    <span>{isExpanded ? 'Hide' : 'Show'}</span>
                </div>
            </button>

            {isExpanded && (
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {providers.map((provider) => {
                        const isSelected = selectedSet.has(provider.id);
                        const isUnavailable = !provider.available;

                        return (
                            <label
                                key={provider.id}
                                className={`rounded-2xl border p-3 transition-all ${
                                    isUnavailable
                                        ? 'border-slate-900 bg-slate-950/60 opacity-65'
                                        : isSelected
                                            ? 'border-cyan-300/45 bg-cyan-300/10 shadow-[inset_0_0_0_1px_rgba(111,214,223,0.14)]'
                                            : 'border-slate-800 bg-slate-950/45 hover:border-slate-700'
                                }`}
                            >
                                <div className="flex items-start gap-3">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        disabled={disabled || isUnavailable}
                                        onChange={() => onToggle?.(provider.id)}
                                        className="mt-1 h-4 w-4 accent-cyan-300"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <SystemIcon name="database" className="h-4 w-4 text-slate-500" />
                                            <span className="text-sm font-medium text-slate-100">{provider.label}</span>
                                            {provider.default_enabled && (
                                                <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-cyan-100">
                                                    default
                                                </span>
                                            )}
                                        </div>
                                        <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                                            {provider.id}
                                        </div>
                                        {isUnavailable && provider.reason_unavailable && (
                                            <div className="mt-2 text-[11px] text-amber-300">
                                                {provider.reason_unavailable}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </label>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default SourceSelector;
