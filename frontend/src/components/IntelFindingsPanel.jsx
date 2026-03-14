import { useState } from 'react';
import { createAlertFromFinding } from '../services/api';

const SEVERITY_COLORS = {
    LOW: 'border-green-500 bg-green-500/10',
    MEDIUM: 'border-yellow-500 bg-yellow-500/10',
    HIGH: 'border-orange-500 bg-orange-500/10',
    CRITICAL: 'border-red-500 bg-red-500/10',
    UNCONFIRMED: 'border-slate-500 bg-slate-500/10'
};

const SOURCE_ICONS = {
    'intel_twitter': '🐦',
    'news': '📰',
    'seismic_sensor': '🌍',
    'weather_sensor': '⛈️',
    'demo': '🧪',
    'ministry_alert': '🏛️'
};

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

    const formatTime = (dateStr) => {
        if (!dateStr) return 'Unknown';
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);

        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return date.toLocaleDateString();
    };

    if (findings.length === 0 && recommendations.length === 0) {
        return (
            <div className="glass-card p-6 text-center">
                <div className="text-4xl mb-3">📡</div>
                <h3 className="text-lg font-semibold text-white mb-2">No Intel Findings</h3>
                <p className="text-slate-400 text-sm">
                    Trigger a detection scan to gather intelligence from sources
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Recommendations Section */}
            {recommendations.length > 0 && (
                <div className="glass-card p-4">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <span>🎯</span> Recommended Alerts
                    </h3>

                    {/* Severity Selector */}
                    <div className="flex gap-2 mb-4">
                        <span className="text-sm text-slate-400">Default Severity:</span>
                        {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(sev => (
                            <button
                                key={sev}
                                onClick={() => setSelectedSeverity(sev)}
                                className={`px-2 py-1 rounded text-xs font-medium transition-all ${selectedSeverity === sev
                                    ? 'bg-primary-500 text-white'
                                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                    }`}
                            >
                                {sev}
                            </button>
                        ))}
                    </div>

                    <div className="space-y-3">
                        {recommendations.map((rec, idx) => (
                            <div
                                key={rec.id || idx}
                                className={`p-4 rounded-xl border-l-4 ${SEVERITY_COLORS[rec.severity] || SEVERITY_COLORS.MEDIUM}`}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-white font-semibold">
                                                {rec.event_type?.replace(/_/g, ' ')}
                                            </span>
                                            <span className={`px-2 py-0.5 rounded text-xs ${rec.suggested_action === 'CREATE_ALERT'
                                                ? 'bg-red-500/30 text-red-400'
                                                : 'bg-blue-500/30 text-blue-400'
                                                }`}>
                                                {rec.suggested_action === 'CREATE_ALERT' ? '⚠️ Alert' : '👁️ Monitor'}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-300 mb-2">{rec.description}</p>
                                        <div className="text-xs text-slate-400">
                                            {rec.source_count} source{rec.source_count > 1 ? 's' : ''}: {rec.sources?.join(', ')}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleCreateAlert(rec.primary_finding)}
                                        disabled={creating === rec.id}
                                        className="ml-4 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 text-sm whitespace-nowrap"
                                    >
                                        {creating === rec.id ? 'Creating...' : 'Create Alert'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* All Findings Section */}
            <div className="glass-card p-4">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <span>📰</span> All Intel Findings ({findings.length})
                </h3>

                {error && (
                    <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                        {error}
                    </div>
                )}

                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {findings.map((finding, idx) => (
                        <div
                            key={finding.id || idx}
                            className="p-3 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition-colors"
                        >
                            <div className="flex items-start gap-3">
                                <span className="text-xl">
                                    {SOURCE_ICONS[finding.source_type] || '📋'}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs px-2 py-0.5 bg-slate-700 rounded text-slate-300">
                                            {finding.type?.replace(/_/g, ' ') || 'INTEL'}
                                        </span>
                                        <span className="text-xs text-slate-500">
                                            {formatTime(finding.posted_at)}
                                        </span>
                                    </div>
                                    <p className="text-sm text-white mb-1 truncate">
                                        {finding.title || finding.description}
                                    </p>
                                    <div className="flex items-center gap-2 text-xs text-slate-400">
                                        <span>{finding.source}</span>
                                        {finding.url && (
                                            <a
                                                href={finding.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-primary-400 hover:underline"
                                            >
                                                View →
                                            </a>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleCreateAlert(finding)}
                                    disabled={creating === (finding.id || finding.title)}
                                    className="px-3 py-1 bg-slate-700 hover:bg-primary-600 text-white rounded text-xs transition-colors disabled:opacity-50"
                                >
                                    {creating === (finding.id || finding.title) ? '...' : 'Alert'}
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
