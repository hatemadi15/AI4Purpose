import { useState, useEffect } from 'react';
import { approveAlert, rejectAlert, verifyAlert } from '../services/api';
import AlertMap from './AlertMap';

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

function AlertReviewPanel({ selectedAlert, socket, onAlertUpdated, onClearSelection }) {
    const [approving, setApproving] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [verificationStep, setVerificationStep] = useState('');
    const [selectedOption, setSelectedOption] = useState('concise');
    const [customMessage, setCustomMessage] = useState('');
    const [analystNotes, setAnalystNotes] = useState('');
    const [approvalStatus, setApprovalStatus] = useState(null);

    // Reset local state when a different alert is selected
    useEffect(() => {
        setApprovalStatus(null);
        setCustomMessage('');
        setAnalystNotes('');
        setVerifying(false);
        setVerificationStep('');

        if (selectedAlert?.selected_message_option === 'custom') {
            setCustomMessage(selectedAlert.custom_message || '');
        } else if (selectedAlert?.selected_message_option) {
            setSelectedOption(selectedAlert.selected_message_option);
        }
    }, [selectedAlert?.id]);

    // Socket listener for verification progress
    useEffect(() => {
        if (!socket || !selectedAlert) return;

        const handleVerificationProgress = (data) => {
            if (String(data.alertId) === String(selectedAlert.id)) {
                setVerificationStep(data.step);
            }
        };

        const handleVerificationComplete = (data) => {
            if (String(data.alertId) === String(selectedAlert.id)) {
                setVerifying(false);
                setVerificationStep('');
                if (onAlertUpdated) {
                    if (data.alert) {
                        onAlertUpdated(data.alert);
                    } else {
                        const merged = { ...selectedAlert, ...data };
                        if (!merged.verification_data && data.data) {
                            merged.verification_data = data.data;
                        }
                        if (merged.verification_score == null && data.score != null) {
                            merged.verification_score = data.score;
                        }
                        if (data.data?.corroboration) {
                            if (merged.sources_checked == null) {
                                merged.sources_checked = data.data.corroboration.total_sources_checked;
                            }
                            if (merged.sources_confirmed == null) {
                                merged.sources_confirmed = data.data.corroboration.sources_corroborating;
                            }
                        }
                        onAlertUpdated(merged);
                    }
                }
            }
        };

        socket.on('verification_progress', handleVerificationProgress);
        socket.on('verification_complete', handleVerificationComplete);

        return () => {
            socket.off('verification_progress', handleVerificationProgress);
            socket.off('verification_complete', handleVerificationComplete);
        };
    }, [socket, selectedAlert, onAlertUpdated]);


    const handleVerify = async () => {
        if (!selectedAlert) return;
        setVerifying(true);
        setVerificationStep('Initializing verification...');
        try {
            await verifyAlert(selectedAlert.id);
        } catch (err) {
            console.error('Verification failed:', err);
            setVerifying(false);
            setVerificationStep('Verification failed. Try again.');
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
            // Dashboard socket listener will handle the success/removal
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
            // Dashboard socket listener will handle the removal
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

    if (!selectedAlert) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center">
                    <div className="text-6xl mb-4">📋</div>
                    <h3 className="text-xl font-semibold text-white mb-2">Select an Alert to Review</h3>
                    <p className="text-slate-400">Click on an alert from the queue to view details</p>
                </div>
            </div>
        );
    }

    const verificationData = selectedAlert.verification_data || selectedAlert.data;
    const verificationScore = selectedAlert.verification_score ?? selectedAlert.score;
    const sourcesConfirmed = selectedAlert.sources_confirmed ?? verificationData?.corroboration?.sources_corroborating ?? 0;
    const sourcesChecked = selectedAlert.sources_checked ?? verificationData?.corroboration?.total_sources_checked ?? 0;

    return (
        <div className="space-y-6">
            {/* Alert Header */}
            <div className="flex items-start justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-2xl font-bold text-white">{selectedAlert.event_type}</h2>
                        <SeverityBadge severity={selectedAlert.severity} />
                    </div>
                    <p className="text-slate-400">
                        Location: {parseFloat(selectedAlert.lat).toFixed(4)}°N, {parseFloat(selectedAlert.lon).toFixed(4)}°E
                    </p>
                </div>
                <div className="text-right">
                    <div className="text-sm text-slate-400">Affected Users</div>
                    <div className="flex gap-2 mt-1">
                        <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs">
                            {selectedAlert.affected_users_count?.critical || 0} Critical
                        </span>
                        <span className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded text-xs">
                            {selectedAlert.affected_users_count?.warning || 0} Warning
                        </span>
                        <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs">
                            {selectedAlert.affected_users_count?.watch || 0} Watch
                        </span>
                    </div>
                </div>
            </div>

            {/* Event Details Table */}
            <div className="bg-slate-800/50 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">Event Details</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <div className="text-xs text-slate-400">Type</div>
                        <div className="text-white font-medium">{selectedAlert.event_type}</div>
                    </div>
                    <div>
                        <div className="text-xs text-slate-400">Severity</div>
                        <div className="text-white font-medium">{selectedAlert.severity}</div>
                    </div>
                    <div>
                        <div className="text-xs text-slate-400">Radius</div>
                        <div className="text-white font-medium">{selectedAlert.affected_radius_km} km</div>
                    </div>
                    <div>
                        <div className="text-xs text-slate-400">Region</div>
                        <div className="text-white font-medium">{selectedAlert.region}</div>
                    </div>
                    <div>
                        <div className="text-xs text-slate-400">Detected At</div>
                        <div className="text-white font-medium">{formatTime(selectedAlert.createdAt)}</div>
                    </div>
                </div>
            </div>

            {/* Deep Multi-Source Verification Layer */}
            <div className="glass-card border border-primary-500/30 p-5 rounded-xl bg-slate-900/50 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-10">
                    <span className="text-8xl">🕵️‍♂️</span>
                </div>

                <div className="flex items-center justify-between mb-4 relative z-10">
                    <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            Deep Multi-Source Verification
                            {selectedAlert.verification_status === 'VERIFIED' && <span className="text-green-400 text-sm">✅ Verified</span>}
                            {selectedAlert.verification_status === 'DISPUTED' && <span className="text-red-400 text-sm">❌ Disputed</span>}
                            {selectedAlert.verification_status === 'VERIFYING' && <span className="text-yellow-400 text-sm animate-pulse">⏳ In Progress...</span>}
                        </h3>
                        <p className="text-xs text-slate-400">Cross-referencing Twitter, NewsAPI & Scientific Data with Gemini+Perplexity</p>
                    </div>
                    {/* Verification Score Badge */}
                    {verificationScore !== null && (
                        <div className={`text-center px-4 py-2 rounded-lg border ${verificationScore >= 70 ? 'bg-green-500/20 border-green-500 text-green-400' :
                            verificationScore >= 40 ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400' :
                                'bg-red-500/20 border-red-500 text-red-400'
                            }`}>
                            <div className="text-xs uppercase tracking-wider font-bold">Confidence</div>
                            <div className="text-2xl font-black">{verificationScore}%</div>
                        </div>
                    )}
                </div>

                {/* Action/Progress Area */}
                {(selectedAlert.verification_status === 'UNVERIFIED' || !selectedAlert.verification_status) && selectedAlert.verification_status !== 'DISPUTED' ? (
                    <button
                        onClick={handleVerify}
                        disabled={verifying}
                        className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-lg shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2"
                    >
                        {verifying ? (
                            <>
                                <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                {verificationStep}
                            </>
                        ) : (
                            <>🚀 Start Deep Forensic Investigation</>
                        )}
                    </button>
                ) : verifying ? (
                    <div className="w-full bg-slate-700/50 rounded-full h-4 overflow-hidden relative">
                        <div className="absolute top-0 left-0 h-full bg-blue-500 animate-pulse w-full"></div>
                        <div className="absolute top-0 left-0 h-full flex items-center justify-center w-full text-[10px] font-bold text-white uppercase tracking-widest">
                            {verificationStep}
                        </div>
                    </div>
                ) : (
                    /* Results Panel */
                    <div className="space-y-4 animate-fadeIn">
                        {/* Big Corroboration Display */}
                        <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-xl p-4 text-center">
                            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Sources Corroborating Event</div>
                            <div className="text-4xl font-black text-white">
                                <span className={sourcesConfirmed > 0 ? 'text-green-400' : 'text-red-400'}>
                                    {sourcesConfirmed || 0}
                                </span>
                                <span className="text-slate-500 mx-2">/</span>
                                <span>{sourcesChecked || 0}</span>
                            </div>
                            <div className="text-xs text-slate-400 mt-1">
                                {sourcesChecked > 0 && sourcesConfirmed > 0
                                    ? `${Math.round((sourcesConfirmed / sourcesChecked) * 100)}% of sources confirm this event`
                                    : 'No sources confirmed this event yet'}
                            </div>
                        </div>

                        {/* Source Breakdown Grid */}
                        <div className="grid grid-cols-2 gap-3">
                            {/* Twitter Sources */}
                            <details className="bg-black/30 rounded-lg p-3 cursor-pointer group">
                                <summary className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
                                    <span>🐦 Twitter ({verificationData?.twitter_summary?.count || 0})</span>
                                    <span className="text-[10px] text-slate-500">Click to expand</span>
                                </summary>
                                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                                    {verificationData?.twitter_summary?.sources?.length > 0 ? (
                                        verificationData.twitter_summary.sources.map((tweet, i) => (
                                            <a
                                                key={i}
                                                href={tweet.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block text-[10px] text-blue-300 hover:text-blue-200 bg-slate-800/50 p-2 rounded"
                                            >
                                                <div className="flex items-center gap-1 mb-1">
                                                    🔗 <span className="font-bold">@{tweet.username}</span>
                                                    {tweet.is_trusted && <span className="text-green-400 text-[8px]">✓ Trusted</span>}
                                                    <span className={`text-[8px] ${tweet.is_relevant === false ? 'text-red-400' : 'text-green-400'}`}>
                                                        {tweet.is_relevant === false ? 'Not relevant' : 'Relevant'}
                                                    </span>
                                                </div>
                                                <div className="text-[9px] text-slate-500 mb-1">
                                                    score: {tweet.relevance_score ?? 'n/a'} · {tweet.relevance_reason || 'event match'}
                                                </div>
                                                <span className="text-slate-300">"{tweet.text?.substring(0, 100)}..."</span>
                                            </a>
                                        ))
                                    ) : verificationData?.twitter_summary?.samples?.map((tweet, i) => (
                                        <div key={i} className="text-[10px] text-slate-300 bg-slate-800/50 p-2 rounded">
                                            "{typeof tweet === 'string' ? tweet.substring(0, 80) : tweet}..."
                                        </div>
                                    )) || <div className="text-[10px] text-slate-500">No tweets found</div>}
                                </div>
                            </details>

                            {/* News Sources */}
                            <details className="bg-black/30 rounded-lg p-3 cursor-pointer group">
                                <summary className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
                                    <span>📰 News ({verificationData?.news_summary?.count || 0})</span>
                                    <span className="text-[10px] text-slate-500">Click to expand</span>
                                </summary>
                                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                                    {verificationData?.news_summary?.sources?.length > 0 ? (
                                        verificationData.news_summary.sources.map((article, i) => (
                                            <a
                                                key={i}
                                                href={article.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block text-[10px] text-blue-300 hover:text-blue-200 bg-slate-800/50 p-2 rounded"
                                            >
                                                🔗 {article.title} <span className="text-slate-500">({article.source})</span>
                                                <div className="text-[9px] text-slate-500 mt-1">
                                                    <span className={`${article.is_relevant === false ? 'text-red-400' : 'text-green-400'}`}>
                                                        {article.is_relevant === false ? 'Not relevant' : 'Relevant'}
                                                    </span>
                                                    {' '}· score: {article.relevance_score ?? 'n/a'} · {article.relevance_reason || 'same-event'}
                                                </div>
                                            </a>
                                        ))
                                    ) : <div className="text-[10px] text-slate-500">No news articles found</div>}
                                </div>
                            </details>

                            {/* Scientific Sources */}
                            <details className="bg-black/30 rounded-lg p-3 cursor-pointer group">
                                <summary className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
                                    <span>🔬 Scientific</span>
                                    <span className={`text-[10px] ${verificationData?.scientific_verification?.seismic?.confirmed || verificationData?.scientific_verification?.weather?.confirmed ? 'text-green-400' : 'text-slate-500'}`}>
                                        {verificationData?.scientific_verification?.seismic?.confirmed || verificationData?.scientific_verification?.weather?.confirmed ? '✓ Confirmed' : 'No data'}
                                    </span>
                                </summary>
                                <div className="mt-2 space-y-1">
                                    {verificationData?.scientific_verification?.seismic?.confirmed && (
                                        <a href="https://earthquake.usgs.gov/earthquakes/map/" target="_blank" rel="noopener noreferrer" className="block text-[10px] text-blue-300 hover:text-blue-200 bg-slate-800/50 p-2 rounded">
                                            🔗 USGS: M{verificationData.scientific_verification.seismic.magnitude} at {verificationData.scientific_verification.seismic.place}
                                        </a>
                                    )}
                                    {verificationData?.scientific_verification?.weather?.confirmed && (
                                        <div className="text-[10px] text-green-300 bg-slate-800/50 p-2 rounded">
                                            ☁️ OpenWeather: {verificationData.scientific_verification.weather.description}
                                        </div>
                                    )}
                                    {!verificationData?.scientific_verification?.seismic?.confirmed && !verificationData?.scientific_verification?.weather?.confirmed && (
                                        <div className="text-[10px] text-slate-500">No scientific data available for this event type</div>
                                    )}
                                </div>
                            </details>

                            {/* Perplexity Web Search */}
                            <details className="bg-black/30 rounded-lg p-3 cursor-pointer group">
                                <summary className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
                                    <span>🌐 Web Search</span>
                                    <span className={`text-[10px] ${verificationData?.web_search?.count > 0 || verificationData?.perplexity?.independent_confirmation_found ? 'text-green-400' : 'text-yellow-400'}`}>
                                        {verificationData?.web_search?.count || verificationData?.perplexity?.corroborating_sources || 0} found
                                    </span>
                                </summary>
                                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                                    {verificationData?.web_search?.sources?.length > 0 ? (
                                        verificationData.web_search.sources.map((source, i) => (
                                            source.url ? (
                                                <a
                                                    key={i}
                                                    href={source.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="block text-[10px] text-blue-300 hover:text-blue-200 bg-slate-800/50 p-2 rounded flex items-center gap-1"
                                                >
                                                    🔗 <span className="text-green-400">✓</span> {source.name}
                                                </a>
                                            ) : (
                                                <div key={i} className="text-[10px] text-slate-300 bg-slate-800/50 p-2 rounded flex items-center gap-1">
                                                    <span className="text-green-400">✓</span> {source.name}
                                                </div>
                                            )
                                        ))
                                    ) : verificationData?.perplexity?.key_sources?.map((source, i) => (
                                        verificationData?.perplexity?.source_urls?.[i] ? (
                                            <a
                                                key={i}
                                                href={verificationData.perplexity.source_urls[i]}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block text-[10px] text-blue-300 hover:text-blue-200 bg-slate-800/50 p-2 rounded flex items-center gap-1"
                                            >
                                                🔗 <span className="text-green-400">✓</span> {source}
                                            </a>
                                        ) : (
                                            <div key={i} className="text-[10px] text-slate-300 bg-slate-800/50 p-2 rounded flex items-center gap-1">
                                                <span className="text-green-400">✓</span> {source}
                                            </div>
                                        )
                                    )) || <div className="text-[10px] text-slate-500">No web sources found</div>}
                                    {verificationData?.perplexity?.summary && (
                                        <p className="text-[10px] text-slate-400 italic mt-2 border-l-2 border-slate-600 pl-2">
                                            {verificationData.perplexity.summary}
                                        </p>
                                    )}
                                </div>
                            </details>
                        </div>

                        {/* Gemini Summary */}
                        <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 rounded-lg p-3 border border-purple-500/20">
                            <h4 className="text-xs font-bold text-purple-300 mb-2">🤖 Gemini Analysis Summary</h4>
                            <p className="text-xs text-slate-300">
                                {verificationData?.gemini?.summary || 'Analysis complete. See breakdown above.'}
                            </p>
                            <div className="flex gap-4 mt-2 text-[10px]">
                                <span className="text-slate-400">Credibility: <span className={`font-bold ${verificationData?.gemini?.overall_credibility === 'high' ? 'text-green-400' : verificationData?.gemini?.overall_credibility === 'medium' ? 'text-yellow-400' : 'text-red-400'}`}>{verificationData?.gemini?.overall_credibility?.toUpperCase() || 'N/A'}</span></span>
                                <span className="text-slate-400">Recommendation: <span className="font-bold text-white">{verificationData?.gemini?.recommendation || 'N/A'}</span></span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Map */}
            <div className="h-48 rounded-xl overflow-hidden shadow-inner border border-slate-700">
                <AlertMap
                    lat={parseFloat(selectedAlert.lat)}
                    lon={parseFloat(selectedAlert.lon)}
                    radius={parseFloat(selectedAlert.affected_radius_km)}
                    severity={selectedAlert.severity}
                />
            </div>

            {/* Message Options */}
            <div className="bg-slate-800/50 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">Select Message Option</h3>
                <div className="space-y-3">
                    {['concise', 'detailed', 'technical'].map(option => (
                        <label
                            key={option}
                            className={`flex items-start p-3 rounded-lg cursor-pointer transition-all ${selectedOption === option && !customMessage
                                ? 'bg-primary-500/20 border border-primary-500'
                                : 'bg-slate-700/50 border border-transparent hover:border-slate-600'
                                }`}
                        >
                            <input
                                type="radio"
                                name="messageOption"
                                value={option}
                                checked={selectedOption === option && !customMessage}
                                onChange={() => {
                                    setSelectedOption(option);
                                    setCustomMessage('');
                                }}
                                className="mt-1 mr-3"
                            />
                            <div className="flex-1">
                                <div className="text-white font-medium capitalize mb-1">{option}</div>
                                <div className="text-xs text-slate-400 mb-2">
                                    {selectedAlert.alert_messages?.[option]?.en || 'Loading...'}
                                </div>
                                <div className="text-xs text-slate-500" dir="rtl">
                                    {selectedAlert.alert_messages?.[option]?.ar || '...'}
                                </div>
                            </div>
                        </label>
                    ))}

                    {/* Custom Message */}
                    <div className="mt-4">
                        <label className="text-sm text-slate-300 mb-2 block">Or Write Custom Message:</label>
                        <textarea
                            value={customMessage}
                            onChange={(e) => setCustomMessage(e.target.value)}
                            placeholder="Enter custom alert message (will be translated to all languages)..."
                            className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500"
                            rows={2}
                        />
                    </div>
                </div>
            </div>

            {/* Analyst Notes */}
            <div>
                <label className="text-sm text-slate-300 mb-2 block">Analyst Notes:</label>
                <textarea
                    value={analystNotes}
                    onChange={(e) => setAnalystNotes(e.target.value)}
                    placeholder="Add any notes about this decision..."
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500"
                    rows={2}
                />
            </div>

            {/* Cost Estimate */}
            <div className="bg-slate-800/50 rounded-xl p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-sm text-slate-400">Total Recipients</div>
                        <div className="text-2xl font-bold text-white">
                            {(selectedAlert.affected_users_count?.critical || 0) +
                                (selectedAlert.affected_users_count?.warning || 0) +
                                (selectedAlert.affected_users_count?.watch || 0)}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-sm text-slate-400">Estimated Cost</div>
                        <div className="text-2xl font-bold text-green-400">$0.00</div>
                        <div className="text-xs text-slate-500">Carrier Partnership</div>
                    </div>
                </div>
            </div>

            {/* Approval Status */}
            {approvalStatus && (
                <div className={`rounded-xl p-4 ${approvalStatus.status === 'success' ? 'bg-green-500/20' :
                    approvalStatus.status === 'error' ? 'bg-red-500/20' :
                        'bg-primary-500/20'
                    }`}>
                    <div className="flex items-center gap-2">
                        {approvalStatus.status === 'processing' && (
                            <svg className="animate-spin h-5 w-5 text-primary-400" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        )}
                        <span className={
                            approvalStatus.status === 'success' ? 'text-green-400' :
                                approvalStatus.status === 'error' ? 'text-red-400' :
                                    'text-primary-400'
                        }>
                            {approvalStatus.message}
                        </span>
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4">
                <button
                    onClick={handleApprove}
                    disabled={approving}
                    className="flex-1 py-4 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-lg transition-all disabled:opacity-50"
                >
                    {approving ? 'Sending...' : '✅ Approve & Send'}
                </button>
                <button
                    onClick={handleReject}
                    className="flex-1 py-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-lg transition-all"
                >
                    ❌ Reject
                </button>
            </div>
        </div>
    );
}

export default AlertReviewPanel;
