import { useState, useEffect } from 'react';
import { getAlerts, approveAlert, rejectAlert, createManualAlert, getIntelFindings } from '../services/api';
import useSocket from '../hooks/useSocket';
import AlertMap from '../components/AlertMap';
import ManualAlertModal from '../components/ManualAlertModal';
import IntelFindingsPanel from '../components/IntelFindingsPanel';
import AlertReviewPanel from '../components/AlertReviewPanel';

function SeverityBadge({ severity }) {
    const classes = {
        CRITICAL: 'badge-critical',
        HIGH: 'badge-high',
        MEDIUM: 'badge-medium',
        LOW: 'badge-low'
    };

    return (
        <span className={`px-2 py-1 rounded-full text-xs font-bold ${classes[severity] || classes.MEDIUM}`}>
            {severity}
        </span>
    );
}

function AnalystDashboard() {
    const { socket, isConnected, joinDashboard } = useSocket();
    const [alerts, setAlerts] = useState([]);
    const [selectedAlert, setSelectedAlert] = useState(null);
    const [loading, setLoading] = useState(true);
    const [approving, setApproving] = useState(false);
    const [selectedOption, setSelectedOption] = useState('concise');
    const [customMessage, setCustomMessage] = useState('');
    const [analystNotes, setAnalystNotes] = useState('');
    const [approvalStatus, setApprovalStatus] = useState(null);
    const [showManualModal, setShowManualModal] = useState(false);
    const [intelFindings, setIntelFindings] = useState([]);
    const [intelRecommendations, setIntelRecommendations] = useState([]);
    const [selectedRegion, setSelectedRegion] = useState('Lebanon');

    useEffect(() => {
        loadAlerts();
        loadIntelFindings();
        joinDashboard();
    }, [joinDashboard]);

    // Load saved intel findings from database
    const loadIntelFindings = async () => {
        try {
            const response = await getIntelFindings(null, 100);
            if (response.data.success) {
                setIntelFindings(response.data.findings);
                console.log(`Loaded ${response.data.count} saved intel findings`);
            }
        } catch (err) {
            console.error('Failed to load intel findings:', err);
        }
    };

    useEffect(() => {
        if (socket) {
            socket.on('new_alert_for_review', (data) => {
                setAlerts(prev => [data.alert, ...prev]);
            });

            socket.on('approval_status', (data) => {
                if (selectedAlert && data.alertId === selectedAlert.id) {
                    setApprovalStatus(data);
                }
            });

            socket.on('alert_approved', (data) => {
                setAlerts(prev => prev.filter(a => a.id !== data.alert.id));
                if (selectedAlert?.id === data.alert.id) {
                    setSelectedAlert(null);
                    setApprovalStatus({ status: 'success', message: 'Alert approved and notifications sent!' });
                }
            });

            socket.on('alert_rejected', (data) => {
                setAlerts(prev => prev.filter(a => a.id !== data.alertId));
                if (selectedAlert?.id === data.alertId) {
                    setSelectedAlert(null);
                }
            });

            // Listen for intel findings from detection
            socket.on('intel_findings', (data) => {
                console.log('Received intel findings:', data);
                setIntelFindings(data.findings || []);
                setIntelRecommendations(data.recommendations || []);
                setSelectedRegion(data.region || 'Lebanon');
            });

            return () => {
                socket.off('new_alert_for_review');
                socket.off('approval_status');
                socket.off('alert_approved');
                socket.off('alert_rejected');
                socket.off('intel_findings');
            };
        }
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

    const handleApprove = async () => {
        if (!selectedAlert) return;

        setApproving(true);
        setApprovalStatus({ status: 'processing', message: 'Processing...' });

        try {
            await approveAlert(selectedAlert.id, {
                message_option: selectedOption,
                custom_message: customMessage || null,
                analyst_notes: analystNotes,
                analyst_name: 'Demo Analyst'
            });
        } catch (err) {
            setApprovalStatus({ status: 'error', message: err.response?.data?.error || err.message });
        } finally {
            setApproving(false);
        }
    };

    const handleReject = async () => {
        if (!selectedAlert) return;

        try {
            await rejectAlert(selectedAlert.id, {
                analyst_notes: analystNotes,
                analyst_name: 'Demo Analyst'
            });
        } catch (err) {
            console.error('Reject failed:', err);
        }
    };

    const formatTime = (dateStr) => {
        if (!dateStr) return 'N/A';
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? 'Invalid Date' : d.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    return (
        <div className="flex gap-4 h-[calc(100vh-6rem)]">
            {/* Left Sidebar - Alert Queue */}
            <div className="w-80 flex-shrink-0 glass-card p-4 overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-white">Alert Queue</h2>
                    <div className={`flex items-center gap-1 text-xs ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
                        Live
                    </div>
                </div>

                {/* Manual Alert Button */}
                <button
                    onClick={() => setShowManualModal(true)}
                    className="w-full mb-4 py-2 px-4 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                    <span>+</span> Create Manual Alert
                </button>

                {loading ? (
                    <div className="text-center py-8 text-slate-400">Loading...</div>
                ) : alerts.length === 0 ? (
                    <div className="text-center py-8">
                        <div className="text-4xl mb-2">📭</div>
                        <p className="text-slate-400">No pending alerts</p>
                        <p className="text-xs text-slate-500 mt-2">Alerts will appear here in real-time</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {alerts.map(alert => (
                            <button
                                key={alert.id}
                                onClick={() => {
                                    setSelectedAlert(alert);
                                    setApprovalStatus(null);
                                    setCustomMessage('');
                                    setAnalystNotes('');
                                }}
                                className={`w-full p-3 rounded-xl text-left transition-all ${selectedAlert?.id === alert.id
                                    ? 'bg-primary-500/30 border border-primary-500'
                                    : 'bg-slate-800/50 hover:bg-slate-700/50 border border-transparent'
                                    }`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <SeverityBadge severity={alert.severity} />
                                    <span className="text-xs text-slate-400">#{alert.id}</span>
                                </div>
                                <div className="text-white font-medium mb-1">{alert.event_type}</div>
                                <div className="text-xs text-slate-400">{alert.region}</div>
                                <div className="text-xs text-slate-500 mt-1">{formatTime(alert.createdAt)}</div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Right Panel - Alert Review */}
            <div className="flex-1 glass-card p-6 overflow-y-auto">
                <AlertReviewPanel
                    selectedAlert={selectedAlert}
                    socket={socket}
                    onAlertUpdated={(updatedAlert) => {
                        setAlerts(prev => prev.map(a => a.id === updatedAlert.id ? updatedAlert : a));
                        setSelectedAlert(updatedAlert);
                    }}
                    onClearSelection={() => setSelectedAlert(null)}
                />
            </div>

            {/* Right Sidebar - Intel Findings */}
            <div className="w-96 flex-shrink-0 glass-card p-4 overflow-y-auto">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <span>📡</span> Intel Feed
                </h2>
                <IntelFindingsPanel
                    findings={intelFindings}
                    recommendations={intelRecommendations}
                    region={selectedRegion}
                    onAlertCreated={(data) => {
                        console.log('Alert created from finding:', data);
                    }}
                />
            </div>

            {/* Manual Alert Modal */}
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
