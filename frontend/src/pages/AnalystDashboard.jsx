import { useState, useEffect } from 'react';
import { getAlerts, createManualAlert, getIntelFindings } from '../services/api';
import useSocket from '../hooks/useSocket';
import ManualAlertModal from '../components/ManualAlertModal';
import IntelFindingsPanel from '../components/IntelFindingsPanel';
import AlertReviewPanel from '../components/AlertReviewPanel';
import SystemIcon from '../components/SystemIcon';

function SeverityBadge({ severity }) {
    const classes = {
        CRITICAL: 'badge-critical',
        HIGH: 'badge-high',
        MEDIUM: 'badge-medium',
        LOW: 'badge-low'
    };

    return (
        <span className={classes[severity] || classes.MEDIUM}>
            {severity}
        </span>
    );
}

function formatTime(dateStr) {
    if (!dateStr) return 'No timestamp';

    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return 'Invalid timestamp';

    return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getAlertPrimaryLabel(alert) {
    const finding = alert?.detection_data?.finding || alert?.all_intel_findings?.finding;

    return (
        finding?.title
        || finding?.headline
        || finding?.description
        || alert?.custom_message
        || alert?.event_type
        || 'Alert'
    );
}

function getAlertSecondaryLabel(alert) {
    const parts = [];

    if (alert?.event_type) {
        parts.push(alert.event_type.replace(/_/g, ' '));
    }

    const source = alert?.detection_data?.finding?.source || alert?.intel_sources?.[0]?.name;
    if (source) {
        parts.push(source);
    }

    return parts.join(' | ');
}

function AnalystDashboard() {
    const { socket, isConnected, joinDashboard } = useSocket();
    const [alerts, setAlerts] = useState([]);
    const [selectedAlert, setSelectedAlert] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showManualModal, setShowManualModal] = useState(false);
    const [intelFindings, setIntelFindings] = useState([]);
    const [intelRecommendations, setIntelRecommendations] = useState([]);
    const [selectedRegion, setSelectedRegion] = useState('Lebanon');

    useEffect(() => {
        loadAlerts();
        loadIntelFindings();
        joinDashboard();
    }, [joinDashboard]);

    const loadIntelFindings = async () => {
        try {
            const response = await getIntelFindings(null, 100);
            if (response.data.success) {
                setIntelFindings(response.data.findings);
            }
        } catch (err) {
            console.error('Failed to load intel findings:', err);
        }
    };

    useEffect(() => {
        if (!socket) return undefined;

        const handleNewAlert = (data) => {
            setAlerts((prev) => [data.alert, ...prev]);
        };

        const handleAlertApproved = (data) => {
            setAlerts((prev) => prev.filter((alert) => alert.id !== data.alert.id));
            if (selectedAlert?.id === data.alert.id) {
                setSelectedAlert(null);
            }
        };

        const handleAlertRejected = (data) => {
            setAlerts((prev) => prev.filter((alert) => alert.id !== data.alertId));
            if (selectedAlert?.id === data.alertId) {
                setSelectedAlert(null);
            }
        };

        const handleIntelFindings = (data) => {
            setIntelFindings(data.findings || []);
            setIntelRecommendations(data.recommendations || []);
            setSelectedRegion(data.region || 'Lebanon');
        };

        socket.on('new_alert_for_review', handleNewAlert);
        socket.on('alert_approved', handleAlertApproved);
        socket.on('alert_rejected', handleAlertRejected);
        socket.on('intel_findings', handleIntelFindings);

        return () => {
            socket.off('new_alert_for_review', handleNewAlert);
            socket.off('alert_approved', handleAlertApproved);
            socket.off('alert_rejected', handleAlertRejected);
            socket.off('intel_findings', handleIntelFindings);
        };
    }, [socket, selectedAlert]);

    const loadAlerts = async () => {
        try {
            const response = await getAlerts('PENDING_REVIEW');
            setAlerts(response.data.alerts);
        } catch (err) {
            console.error('Failed to load alerts:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="grid min-h-[calc(100vh-7rem)] items-start gap-6 xl:grid-cols-[340px,minmax(0,1.45fr),400px] 2xl:grid-cols-[360px,minmax(0,1.75fr),440px]">
            <section className="panel flex min-h-0 flex-col self-start p-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="section-title">Alert Queue</div>
                        <h2 className="mt-2 text-xl font-semibold text-slate-50">Pending Alerts</h2>
                    </div>
                    <div className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                        isConnected
                            ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                            : 'border-red-400/25 bg-red-400/10 text-red-200'
                    }`}>
                        {isConnected ? 'Live' : 'Offline'}
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => setShowManualModal(true)}
                    className="secondary-button mt-4 w-full"
                >
                    <SystemIcon name="plus" className="h-4 w-4" />
                    <span>Create Manual Alert</span>
                </button>

                <div className="mt-4 flex-1 overflow-y-auto pr-1">
                    {loading ? (
                        <div className="panel-muted flex h-full items-center justify-center p-6 text-sm text-slate-400">
                            Loading...
                        </div>
                    ) : alerts.length === 0 ? (
                        <div className="panel-muted flex h-full flex-col items-center justify-center p-6 text-center">
                            <SystemIcon name="queue" className="h-10 w-10 text-slate-600" />
                            <div className="mt-4 text-sm font-semibold text-slate-200">No pending alerts</div>
                            <div className="mt-2 text-xs text-slate-500">Alerts will appear here in real-time</div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {alerts.map((alert) => (
                                <button
                                    key={alert.id}
                                    type="button"
                                    onClick={() => setSelectedAlert(alert)}
                                    className={`w-full rounded-2xl border p-4 text-left transition-all ${
                                        selectedAlert?.id === alert.id
                                            ? 'border-cyan-300/45 bg-cyan-300/10 shadow-[inset_0_0_0_1px_rgba(111,214,223,0.16)]'
                                            : 'border-slate-800 bg-slate-950/45 hover:border-slate-700'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <SeverityBadge severity={alert.severity} />
                                        <span className="text-xs text-slate-500">#{alert.id}</span>
                                    </div>
                                    <div className="mt-3 text-sm font-semibold leading-5 text-slate-50">{getAlertPrimaryLabel(alert)}</div>
                                    <div className="mt-1 text-xs text-slate-400">{getAlertSecondaryLabel(alert) || alert.region}</div>
                                    <div className="mt-1 text-xs text-slate-500">{alert.region}</div>
                                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                                        <SystemIcon name="clock" className="h-3.5 w-3.5" />
                                        <span>{formatTime(alert.createdAt)}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            <section className="panel self-start p-6">
                <AlertReviewPanel
                    selectedAlert={selectedAlert}
                    socket={socket}
                    onAlertUpdated={(updatedAlert) => {
                        setAlerts((prev) => prev.map((alert) => (alert.id === updatedAlert.id ? updatedAlert : alert)));
                        setSelectedAlert(updatedAlert);
                    }}
                    onClearSelection={() => setSelectedAlert(null)}
                />
            </section>

            <section className="panel flex min-h-0 flex-col self-start p-4 xl:max-h-[calc(100vh-9rem)] xl:overflow-y-auto">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="section-title">Intel Feed</div>
                        <h2 className="mt-2 text-xl font-semibold text-slate-50">Latest Findings</h2>
                    </div>
                    <div className="rounded-full border border-slate-800 bg-slate-950/50 px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                        {selectedRegion}
                    </div>
                </div>
                <div className="mt-4">
                    <IntelFindingsPanel
                        findings={intelFindings}
                        recommendations={intelRecommendations}
                        region={selectedRegion}
                        onAlertCreated={() => {}}
                    />
                </div>
            </section>

            <ManualAlertModal
                isOpen={showManualModal}
                onClose={() => setShowManualModal(false)}
                onSubmit={async (data) => {
                    try {
                        await createManualAlert(data);
                        setShowManualModal(false);
                    } catch (err) {
                        console.error('Manual alert failed:', err);
                    }
                }}
            />
        </div>
    );
}

export default AnalystDashboard;
