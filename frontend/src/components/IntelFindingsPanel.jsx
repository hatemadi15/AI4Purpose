import { useState } from 'react';
import { createAlertFromFinding } from '../services/api';
import SystemIcon from './SystemIcon';

const SEVERITY_COLORS = {
    LOW: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
    MEDIUM: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
    HIGH: 'border-orange-400/30 bg-orange-400/10 text-orange-100',
    CRITICAL: 'border-red-400/30 bg-red-400/10 text-red-100',
    UNCONFIRMED: 'border-slate-700 bg-slate-900/70 text-slate-200'
};

const SOURCE_ICONS = {
    intel_twitter: 'social',
    public_twitter: 'social',
    news: 'news',
    seismic_sensor: 'science',
    weather_sensor: 'science',
    demo: 'database',
    ministry_alert: 'command',
    web_scraper: 'globe'
};

function formatTime(dateStr) {
    if (!dateStr) return 'Unknown';

    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 60) return `${Math.max(diffMins, 1)}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function FindingsEmptyState() {
    return (
        <div className="panel p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-slate-800 bg-slate-950/60">
                <SystemIcon name="feed" className="h-6 w-6 text-slate-500" />
            </div>
            <div className="mt-4 text-sm font-semibold text-slate-200">No Intel Findings</div>
            <div className="mt-2 text-xs text-slate-500">Trigger a detection scan to gather intelligence from sources</div>
        </div>
    );
}

function IntelFindingsPanel({ findings = [], recommendations = [], region, onAlertCreated }) {
    const [creating, setCreating] = useState(null);
    const [selectedSeverity, setSelectedSeverity] = useState('HIGH');
    const [error, setError] = useState(null);

    const handleCreateAlert = async (finding) => {
        setCreating(finding.id || finding.title);
        setError(null);

        try {
            const response = await createAlertFromFinding(finding, region, selectedSeverity);
            if (response.data.success) {
                onAlertCreated?.(response.data);
            }
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setCreating(null);
        }
    };

    if (findings.length === 0 && recommendations.length === 0) {
        return <FindingsEmptyState />;
    }

    return (
        <div className="space-y-4">
            {recommendations.length > 0 && (
                <div className="panel p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="section-title">Recommended Alerts</div>
                        </div>
                        <SystemIcon name="target" className="h-5 w-5 text-cyan-200" />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="text-xs uppercase tracking-[0.16em] text-slate-500">Default Severity:</span>
                        {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((severity) => (
                            <button
                                key={severity}
                                type="button"
                                onClick={() => setSelectedSeverity(severity)}
                                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                                    selectedSeverity === severity
                                        ? 'border-cyan-300/35 bg-cyan-300/10 text-cyan-100'
                                        : 'border-slate-800 bg-slate-950/45 text-slate-400 hover:border-slate-700'
                                }`}
                            >
                                {severity}
                            </button>
                        ))}
                    </div>

                    <div className="mt-4 space-y-3">
                        {recommendations.map((recommendation, idx) => {
                            const finding = recommendation.primary_finding || recommendation;
                            const actionTone = recommendation.suggested_action === 'CREATE_ALERT'
                                ? 'border-red-400/30 bg-red-400/10 text-red-100'
                                : 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100';

                            return (
                                <div
                                    key={recommendation.id || idx}
                                    className={`rounded-2xl border p-4 ${SEVERITY_COLORS[recommendation.severity] || SEVERITY_COLORS.MEDIUM}`}
                                >
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <div className="text-sm font-semibold text-slate-50">
                                                    {recommendation.event_type?.replace(/_/g, ' ')}
                                                </div>
                                                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${actionTone}`}>
                                                    {recommendation.suggested_action === 'CREATE_ALERT' ? 'Alert' : 'Monitor'}
                                                </span>
                                            </div>
                                            <p className="mt-2 text-sm leading-6 text-slate-300">{recommendation.description}</p>
                                            <div className="mt-3 text-xs text-slate-400">
                                                {recommendation.source_count} source{recommendation.source_count > 1 ? 's' : ''}: {recommendation.sources?.join(', ')}
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => handleCreateAlert(finding)}
                                            disabled={creating === recommendation.id}
                                            className="secondary-button min-w-[160px]"
                                        >
                                            <SystemIcon name="plus" className="h-4 w-4" />
                                            <span>{creating === recommendation.id ? 'Creating...' : 'Create Alert'}</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="panel p-4">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="section-title">All Intel Findings</div>
                        <h3 className="mt-2 text-lg font-semibold text-slate-50">All Intel Findings ({findings.length})</h3>
                    </div>
                    <SystemIcon name="feed" className="h-5 w-5 text-cyan-200" />
                </div>

                {error && (
                    <div className="mt-4 rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                        {error}
                    </div>
                )}

                <div className="mt-4 space-y-2">
                    {findings.map((finding, idx) => (
                        <div
                            key={finding.id || idx}
                            className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 transition-all hover:border-slate-700"
                        >
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-950/65">
                                    <SystemIcon name={SOURCE_ICONS[finding.source_type] || 'document'} className="h-[18px] w-[18px] text-slate-300" />
                                </div>

                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="inline-flex max-w-full items-center rounded-full border border-slate-700 px-2.5 py-1 text-[9px] font-semibold uppercase leading-none tracking-[0.1em] text-slate-400 whitespace-nowrap">
                                            {finding.type?.replace(/_/g, ' ') || 'Intel'}
                                        </span>
                                        <span className="text-xs text-slate-500">{formatTime(finding.posted_at)}</span>
                                    </div>

                                    <div className="mt-2 text-sm font-semibold text-slate-100">
                                        {finding.title || finding.description}
                                    </div>

                                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                        <span>{finding.source}</span>
                                        {finding.url && (
                                            <a
                                                href={finding.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-cyan-200 hover:text-cyan-100"
                                            >
                                                <span>View</span>
                                            </a>
                                        )}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => handleCreateAlert(finding)}
                                    disabled={creating === (finding.id || finding.title)}
                                    className="secondary-button px-3 py-2 text-xs"
                                >
                                    <SystemIcon name="alert" className="h-4 w-4" />
                                    <span>{creating === (finding.id || finding.title) ? '...' : 'Alert'}</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default IntelFindingsPanel;
