import { useState, useEffect } from 'react';
import {
    approveAlert,
    deleteMedia as deleteMediaRequest,
    getAlertMedia,
    getSourceConfig,
    rejectAlert,
    resolveMediaUrl,
    uploadAlertMedia,
    verifyAlert
} from '../services/api';
import AlertMap from './AlertMap';
import SourceSelector from './SourceSelector';
import SystemIcon from './SystemIcon';

const MESSAGE_OPTIONS = ['concise', 'detailed', 'technical'];

function SeverityBadge({ severity }) {
    const classes = {
        CRITICAL: 'badge-critical',
        HIGH: 'badge-high',
        MEDIUM: 'badge-medium',
        LOW: 'badge-low'
    };

    return <span className={classes[severity] || classes.MEDIUM}>{severity}</span>;
}

function VerificationStatusPill({ status }) {
    const tone = {
        VERIFIED: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100',
        DISPUTED: 'border-red-400/25 bg-red-400/10 text-red-100',
        VERIFYING: 'border-amber-400/25 bg-amber-400/10 text-amber-100',
        UNVERIFIED: 'border-slate-700 bg-slate-950/60 text-slate-300'
    };

    const label = status || 'UNVERIFIED';

    return (
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${tone[label] || tone.UNVERIFIED}`}>
            {label.replace(/_/g, ' ')}
        </span>
    );
}

function StatCard({ label, value, footnote }) {
    return (
        <div className="metric-card">
            <div className="metric-label">{label}</div>
            <div className="mt-3 text-base font-semibold text-slate-100">{value}</div>
            {footnote && <div className="mt-1 text-xs text-slate-500">{footnote}</div>}
        </div>
    );
}

function SourceListCard({ icon, title, count, status, children }) {
    return (
        <details className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-950/70">
                        <SystemIcon name={icon} className="h-4 w-4 text-slate-300" />
                    </div>
                    <div>
                        <div className="text-sm font-semibold text-slate-100">{title}</div>
                        <div className="text-xs text-slate-500">{count}</div>
                    </div>
                </div>
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{status}</div>
            </summary>
            <div className="mt-4 space-y-2">{children}</div>
        </details>
    );
}

function SourceRow({ href, title, meta, body, status }) {
    const Wrapper = href ? 'a' : 'div';
    const props = href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {};
    const tone = status === 'confirmed'
        ? 'text-emerald-300'
        : status === 'rejected'
            ? 'text-red-300'
            : 'text-slate-300';

    return (
        <Wrapper
            {...props}
            className="block rounded-xl border border-slate-800 bg-slate-950/70 p-3 transition-colors hover:border-slate-700"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <div className="text-xs font-semibold text-slate-100">{title}</div>
                        {href && <SystemIcon name="link" className="h-3.5 w-3.5 text-cyan-200" />}
                    </div>
                    {meta && <div className="mt-1 text-[11px] text-slate-500">{meta}</div>}
                    {body && <div className="mt-2 text-xs leading-5 text-slate-400">{body}</div>}
                </div>
                {status && (
                    <div className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${tone}`}>
                        {status}
                    </div>
                )}
            </div>
        </Wrapper>
    );
}

function formatTime(dateStr) {
    if (!dateStr) return 'N/A';

    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return 'Invalid timestamp';

    return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatCoordinates(lat, lon) {
    if (lat == null || lon == null) return 'Unavailable';

    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);
    if (Number.isNaN(parsedLat) || Number.isNaN(parsedLon)) return 'Unavailable';

    return `${parsedLat.toFixed(4)}, ${parsedLon.toFixed(4)}`;
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

function getAlertCategoryLabel(alert) {
    return alert?.event_type?.replace(/_/g, ' ') || 'Alert';
}

function formatOriginLabel(origin) {
    switch (origin) {
        case 'analyst_upload':
            return 'Analyst Upload';
        case 'twitter':
            return 'Twitter';
        case 'news':
            return 'News';
        default:
            return origin || 'Media';
    }
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getMessagePreview(message, alert, language = 'en') {
    if (!message) return '';

    const primary = getAlertPrimaryLabel(alert);
    const category = alert?.event_type;
    const categoryLabel = getAlertCategoryLabel(alert);

    if (!primary || !category || primary === category || primary === categoryLabel) {
        return message;
    }

    const normalizedPrimary = primary.trim().replace(/\s+/g, ' ');
    let preview = message;

    if (language === 'en') {
        preview = preview.replace(
            new RegExp(`\\b${escapeRegExp(categoryLabel)}\\s+detected\\s+in\\s+your\\s+area\\b`, 'i'),
            normalizedPrimary
        );
        preview = preview.replace(
            new RegExp(`\\b${escapeRegExp(category)}\\s+detected\\s+in\\s+your\\s+area\\b`, 'i'),
            normalizedPrimary
        );
    } else if (language === 'ar') {
        preview = preview.replace(
            new RegExp(`تم\\s+اكتشاف\\s+${escapeRegExp(categoryLabel)}\\s+في\\s+منطقتك`, 'i'),
            normalizedPrimary
        );
        preview = preview.replace(
            new RegExp(`تم\\s+اكتشاف\\s+${escapeRegExp(category)}\\s+في\\s+منطقتك`, 'i'),
            normalizedPrimary
        );
    }

    preview = preview.replace(new RegExp(`\\b${escapeRegExp(categoryLabel)}\\b`, 'g'), normalizedPrimary);
    preview = preview.replace(new RegExp(`\\b${escapeRegExp(category)}\\b`, 'g'), normalizedPrimary);

    return preview;
}

function AlertReviewPanel({ selectedAlert, socket, onAlertUpdated, onClearSelection }) {
    const [approving, setApproving] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [verificationStep, setVerificationStep] = useState('');
    const [alertMedia, setAlertMedia] = useState([]);
    const [mediaLoading, setMediaLoading] = useState(false);
    const [mediaUploading, setMediaUploading] = useState(false);
    const [removingMediaId, setRemovingMediaId] = useState(null);
    const [mediaError, setMediaError] = useState(null);
    const [selectedOption, setSelectedOption] = useState('concise');
    const [customMessage, setCustomMessage] = useState('');
    const [analystNotes, setAnalystNotes] = useState('');
    const [approvalStatus, setApprovalStatus] = useState(null);
    const [verificationProviders, setVerificationProviders] = useState([]);
    const [selectedVerificationSourceIds, setSelectedVerificationSourceIds] = useState([]);
    const [sourceConfigLoaded, setSourceConfigLoaded] = useState(false);
    const [sourceConfigError, setSourceConfigError] = useState(null);

    useEffect(() => {
        let active = true;

        const loadSourceConfig = async () => {
            try {
                const response = await getSourceConfig();
                if (!active) return;

                const providers = response.data?.verification?.providers || [];
                setVerificationProviders(providers);
                setSelectedVerificationSourceIds(providers.filter((provider) => provider.default_enabled).map((provider) => provider.id));
                setSourceConfigLoaded(true);
                setSourceConfigError(null);
            } catch (err) {
                if (!active) return;
                setSourceConfigLoaded(false);
                setSourceConfigError(err.response?.data?.error || err.message);
            }
        };

        loadSourceConfig();

        return () => {
            active = false;
        };
    }, []);

    const loadAlertMedia = async (alertId = selectedAlert?.id) => {
        if (!alertId) {
            setAlertMedia([]);
            return;
        }

        setMediaLoading(true);
        try {
            const response = await getAlertMedia(alertId);
            setAlertMedia(response.data?.media || []);
            setMediaError(null);
        } catch (err) {
            setMediaError(err.response?.data?.error || err.message);
            setAlertMedia([]);
        } finally {
            setMediaLoading(false);
        }
    };

    useEffect(() => {
        setApprovalStatus(null);
        setCustomMessage('');
        setAnalystNotes('');
        setVerifying(false);
        setVerificationStep('');
        setMediaError(null);

        if (verificationProviders.length > 0) {
            setSelectedVerificationSourceIds(
                verificationProviders
                    .filter((provider) => provider.default_enabled)
                    .map((provider) => provider.id)
            );
        }

        if (selectedAlert?.selected_message_option === 'custom') {
            setCustomMessage(selectedAlert.custom_message || '');
        } else if (selectedAlert?.selected_message_option) {
            setSelectedOption(selectedAlert.selected_message_option);
        }

        if (selectedAlert?.id) {
            loadAlertMedia(selectedAlert.id);
        } else {
            setAlertMedia([]);
        }
    }, [selectedAlert?.id, verificationProviders]);

    useEffect(() => {
        if (!socket || !selectedAlert) return undefined;

        const handleVerificationProgress = (data) => {
            if (String(data.alertId) === String(selectedAlert.id)) {
                setVerificationStep(data.step);
            }
        };

        const handleVerificationComplete = (data) => {
            if (String(data.alertId) !== String(selectedAlert.id)) {
                return;
            }

            setVerifying(false);
            setVerificationStep('');
            loadAlertMedia(selectedAlert.id);

            if (!onAlertUpdated) {
                return;
            }

            if (data.alert) {
                onAlertUpdated(data.alert);
                return;
            }

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
            await verifyAlert(
                selectedAlert.id,
                sourceConfigLoaded ? selectedVerificationSourceIds : undefined
            );
        } catch (err) {
            console.error('Verification failed:', err);
            setVerifying(false);
            setVerificationStep('Verification failed');
        }
    };

    const handleUploadMedia = async (files) => {
        if (!selectedAlert || !files?.length) {
            return;
        }

        setMediaUploading(true);
        try {
            const response = await uploadAlertMedia(selectedAlert.id, files);
            setAlertMedia(response.data?.media || []);
            setMediaError(null);
        } catch (err) {
            setMediaError(err.response?.data?.error || err.message);
        } finally {
            setMediaUploading(false);
        }
    };

    const handleDeleteMedia = async (mediaId) => {
        setRemovingMediaId(mediaId);
        try {
            await deleteMediaRequest(mediaId);
            await loadAlertMedia(selectedAlert?.id);
            setMediaError(null);
        } catch (err) {
            setMediaError(err.response?.data?.error || err.message);
        } finally {
            setRemovingMediaId(null);
        }
    };

    const toggleVerificationSource = (sourceId) => {
        setSelectedVerificationSourceIds((current) => (
            current.includes(sourceId)
                ? current.filter((id) => id !== sourceId)
                : [...current, sourceId]
        ));
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

    if (!selectedAlert) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="max-w-md text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-slate-800 bg-slate-950/60">
                        <SystemIcon name="queue" className="h-7 w-7 text-slate-600" />
                    </div>
                    <h3 className="mt-5 text-xl font-semibold text-slate-100">Select an Alert to Review</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                        Click on an alert from the queue to view details
                    </p>
                </div>
            </div>
        );
    }

    const verificationData = selectedAlert.verification_data || selectedAlert.data;
    const verificationScore = selectedAlert.verification_score ?? selectedAlert.score;
    const sourcesConfirmed = selectedAlert.sources_confirmed ?? verificationData?.corroboration?.sources_corroborating ?? 0;
    const sourcesChecked = selectedAlert.sources_checked ?? verificationData?.corroboration?.total_sources_checked ?? 0;
    const verificationSourceSelection = verificationData?.source_selection;
    const verificationState = selectedAlert.verification_status || 'UNVERIFIED';
    const verificationInFlight = verifying || verificationState === 'VERIFYING';
    const canStartVerification = !verificationInFlight;
    const totalRecipients = (selectedAlert.affected_users_count?.critical || 0)
        + (selectedAlert.affected_users_count?.warning || 0)
        + (selectedAlert.affected_users_count?.watch || 0);

    const credibility = verificationData?.gemini?.overall_credibility;
    const credibilityTone = credibility === 'high'
        ? 'text-emerald-300'
        : credibility === 'medium'
            ? 'text-amber-300'
            : credibility === 'low'
                ? 'text-red-300'
                : 'text-slate-400';

    const confidenceTone = verificationScore >= 70
        ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100'
        : verificationScore >= 40
            ? 'border-amber-400/25 bg-amber-400/10 text-amber-100'
            : 'border-red-400/25 bg-red-400/10 text-red-100';

    const socialSources = verificationData?.twitter_summary?.sources || [];
    const socialSamples = verificationData?.twitter_summary?.samples || [];
    const newsSources = verificationData?.news_summary?.sources || [];
    const webSources = verificationData?.web_search?.sources || [];
    const modelSources = verificationData?.perplexity?.key_sources || [];
    const mediaSummary = verificationData?.media_analysis?.summary || {};
    const primaryLabel = getAlertPrimaryLabel(selectedAlert);
    const categoryLabel = getAlertCategoryLabel(selectedAlert);

    return (
        <div className="space-y-6">
            <section className="panel p-6">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                            <h2 className="text-2xl font-semibold text-slate-50">{primaryLabel}</h2>
                            <SeverityBadge severity={selectedAlert.severity} />
                            <VerificationStatusPill status={verificationState} />
                        </div>
                        {categoryLabel && primaryLabel !== categoryLabel && (
                            <div className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                                {categoryLabel}
                            </div>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-400">
                            <span className="inline-flex items-center gap-2">
                                <SystemIcon name="map" className="h-4 w-4" />
                                Region: {selectedAlert.region}
                            </span>
                            <span className="inline-flex items-center gap-2">
                                <SystemIcon name="pin" className="h-4 w-4" />
                                Location: {formatCoordinates(selectedAlert.lat, selectedAlert.lon)}
                            </span>
                            <span className="inline-flex items-center gap-2">
                                <SystemIcon name="clock" className="h-4 w-4" />
                                Detected At: {formatTime(selectedAlert.createdAt)}
                            </span>
                        </div>
                    </div>

                    {onClearSelection && (
                        <button type="button" onClick={onClearSelection} className="secondary-button self-start px-3 py-2" aria-label="Clear selection">
                            <SystemIcon name="x" className="h-4 w-4" />
                        </button>
                    )}
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <StatCard label="Severity" value={selectedAlert.severity} />
                    <StatCard label="Radius" value={`${selectedAlert.affected_radius_km} km`} />
                    <StatCard label="Critical" value={selectedAlert.affected_users_count?.critical || 0} />
                    <StatCard label="Warning" value={selectedAlert.affected_users_count?.warning || 0} />
                    <StatCard label="Watch" value={selectedAlert.affected_users_count?.watch || 0} />
                </div>
            </section>

            <section className="panel p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                        <div className="section-title">Verification</div>
                        <h3 className="mt-2 text-xl font-semibold text-slate-50">Deep Multi-Source Verification</h3>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                            Cross-referencing Twitter, NewsAPI and scientific data with Gemini and Perplexity
                        </p>
                    </div>

                    {verificationScore != null && (
                        <div className={`rounded-2xl border px-5 py-4 text-center ${confidenceTone}`}>
                            <div className="section-title">Confidence</div>
                            <div className="mt-2 text-3xl font-semibold">{verificationScore}%</div>
                        </div>
                    )}
                </div>

                <div className="mt-5">
                    <SourceSelector
                        title="Verification Sources"
                        helperText="Defaults come from the backend. Change the set for this verification run only."
                        providers={verificationProviders}
                        selectedIds={selectedVerificationSourceIds}
                        onToggle={toggleVerificationSource}
                        disabled={verificationInFlight}
                    />
                    {sourceConfigError && (
                        <div className="mt-3 text-xs text-amber-300">
                            Source config unavailable: {sourceConfigError}. Verification will fall back to backend defaults.
                        </div>
                    )}
                </div>

                {canStartVerification && (
                    <button
                        type="button"
                        onClick={handleVerify}
                        disabled={verifying}
                        className="command-button mt-5"
                    >
                        <span>{verificationState === 'UNVERIFIED' ? 'Start Deep Forensic Investigation' : 'Re-run Verification'}</span>
                    </button>
                )}

                {verificationInFlight && (
                    <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
                        <div className="flex items-center justify-between gap-3 text-sm text-amber-100">
                            <span>{verificationStep || 'In Progress...'}</span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-900">
                            <div className="progress-bar h-full rounded-full" style={{ width: '100%' }}></div>
                        </div>
                    </div>
                )}

                <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <div className="section-title">Media Evidence</div>
                            <div className="mt-2 text-sm font-semibold text-slate-100">
                                {mediaSummary.total_analyzed || 0} analyzed • {mediaSummary.relevant_images || 0} relevant • {mediaSummary.high_value_evidence || 0} high-value
                            </div>
                            <div className="mt-2 text-xs text-slate-500">
                                Attach images, remove weak evidence, then re-run verification to refresh the media analysis.
                            </div>
                        </div>

                        <label className="secondary-button cursor-pointer self-start">
                            <SystemIcon name="upload" className="h-4 w-4" />
                            <span>{mediaUploading ? 'Uploading...' : 'Attach Images'}</span>
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                multiple
                                className="hidden"
                                onChange={(event) => {
                                    handleUploadMedia(event.target.files);
                                    event.target.value = '';
                                }}
                            />
                        </label>
                    </div>

                    {mediaError && (
                        <div className="mt-4 rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                            {mediaError}
                        </div>
                    )}

                    {mediaLoading ? (
                        <div className="mt-4 text-sm text-slate-400">Loading media evidence...</div>
                    ) : alertMedia.length === 0 ? (
                        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-500">
                            No images attached to this alert yet.
                        </div>
                    ) : (
                        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {alertMedia.map((media) => (
                                <div key={media.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
                                    <div className="aspect-[4/3] overflow-hidden bg-slate-950/80">
                                        <img
                                            src={resolveMediaUrl(media.preview_url || media.source_url)}
                                            alt={media.analysis_summary?.description || formatOriginLabel(media.origin)}
                                            className="h-full w-full object-cover"
                                        />
                                    </div>

                                    <div className="space-y-3 p-4">
                                        <div className="flex flex-wrap gap-2">
                                            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                                                {formatOriginLabel(media.origin)}
                                            </span>
                                            <span className="rounded-full border border-slate-700 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                                                {media.analysis_status || 'PENDING'}
                                            </span>
                                        </div>

                                        <div className="text-sm font-semibold text-slate-100">
                                            {media.analysis_summary?.description || 'Pending media analysis'}
                                        </div>

                                        <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
                                            {media.analysis_summary?.evidence_type && <span>Type: {media.analysis_summary.evidence_type}</span>}
                                            {media.analysis_summary?.verification_value && <span>Value: {media.analysis_summary.verification_value}</span>}
                                            {typeof media.analysis_summary?.is_relevant === 'boolean' && (
                                                <span>{media.analysis_summary.is_relevant ? 'Relevant' : 'Not relevant'}</span>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between gap-3">
                                            {media.source_url ? (
                                                <a
                                                    href={media.source_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-cyan-200 hover:text-cyan-100"
                                                >
                                                    View source
                                                </a>
                                            ) : <span className="text-xs text-slate-500">Temporary upload</span>}

                                            <button
                                                type="button"
                                                onClick={() => handleDeleteMedia(media.id)}
                                                disabled={removingMediaId === media.id}
                                                className="secondary-button px-3 py-2 text-xs"
                                            >
                                                <SystemIcon name="x" className="h-4 w-4" />
                                                <span>{removingMediaId === media.id ? 'Removing...' : 'Remove'}</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {(verificationData || verificationScore != null || verificationState === 'VERIFIED' || verificationState === 'DISPUTED') && (
                    <div className="mt-6 grid gap-6 xl:grid-cols-[300px,minmax(0,1fr)]">
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
                                <div className="section-title">Sources Corroborating Event</div>
                                <div className="mt-3 flex items-end gap-3">
                                    <div className="text-4xl font-semibold text-slate-50">{sourcesConfirmed}</div>
                                    <div className="pb-1 text-sm text-slate-500">of {sourcesChecked} sources confirmed</div>
                                </div>
                                <div className="mt-3 text-xs text-slate-500">
                                    {sourcesChecked > 0 && sourcesConfirmed > 0
                                        ? `${Math.round((sourcesConfirmed / sourcesChecked) * 100)}% of sources confirm this event`
                                        : 'No sources confirmed this event yet'}
                                </div>
                            </div>

                            {verificationSourceSelection?.resolved_details?.length > 0 && (
                                <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
                                    <div className="section-title">Verification Sources Used</div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {verificationSourceSelection.resolved_details.map((source) => (
                                            <span
                                                key={source.id}
                                                className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-medium text-cyan-100"
                                            >
                                                {source.label}
                                            </span>
                                        ))}
                                    </div>
                                    {verificationSourceSelection.ignored_unavailable?.length > 0 && (
                                        <div className="mt-3 text-xs text-amber-300">
                                            Ignored unavailable sources: {verificationSourceSelection.ignored_unavailable.join(', ')}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
                                <div className="section-title">Gemini Analysis Summary</div>
                                <div className="mt-3 text-sm font-semibold text-slate-100">
                                    {verificationData?.gemini?.recommendation || 'N/A'}
                                </div>
                                <div className="mt-2 text-xs text-slate-400">
                                    {verificationData?.gemini?.summary || 'Analysis complete. See breakdown above.'}
                                </div>
                                <div className="mt-3 text-xs text-slate-500">
                                    Credibility: <span className={`font-semibold uppercase tracking-[0.16em] ${credibilityTone}`}>{credibility || 'N/A'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <SourceListCard
                                icon="social"
                                title="Twitter"
                                count={`${socialSources.length || socialSamples.length || 0} results`}
                                status="Click to expand"
                            >
                                {socialSources.length > 0 ? socialSources.map((tweet, index) => (
                                    <SourceRow
                                        key={index}
                                        href={tweet.url}
                                        title={`@${tweet.username || 'unknown'}`}
                                        meta={`score: ${tweet.relevance_score ?? 'n/a'} | ${tweet.relevance_reason || 'event match'}`}
                                        body={tweet.text?.substring(0, 140)}
                                        status={tweet.is_relevant === false ? 'Not relevant' : tweet.is_trusted ? 'Trusted' : 'Relevant'}
                                    />
                                )) : socialSamples.length > 0 ? socialSamples.map((tweet, index) => (
                                    <SourceRow
                                        key={index}
                                        title={`Sample ${index + 1}`}
                                        body={typeof tweet === 'string' ? tweet.substring(0, 140) : String(tweet)}
                                    />
                                )) : (
                                    <div className="text-xs text-slate-500">No tweets found</div>
                                )}
                            </SourceListCard>

                            <SourceListCard
                                icon="news"
                                title="News"
                                count={`${newsSources.length || 0} results`}
                                status="Click to expand"
                            >
                                {newsSources.length > 0 ? newsSources.map((article, index) => (
                                    <SourceRow
                                        key={index}
                                        href={article.url}
                                        title={article.title}
                                        meta={`${article.source || 'Unknown source'} | score: ${article.relevance_score ?? 'n/a'} | ${article.relevance_reason || 'same event'}`}
                                        status={article.is_relevant === false ? 'Not relevant' : 'Relevant'}
                                    />
                                )) : (
                                    <div className="text-xs text-slate-500">No news articles found</div>
                                )}
                            </SourceListCard>

                            <SourceListCard
                                icon="science"
                                title="Scientific"
                                count="Sensor and scientific confirmations"
                                status={verificationData?.scientific_verification?.seismic?.confirmed || verificationData?.scientific_verification?.weather?.confirmed ? 'Confirmed' : 'No data'}
                            >
                                {verificationData?.scientific_verification?.seismic?.confirmed && (
                                    <SourceRow
                                        href="https://earthquake.usgs.gov/earthquakes/map/"
                                        title={`USGS magnitude ${verificationData.scientific_verification.seismic.magnitude}`}
                                        meta={verificationData.scientific_verification.seismic.place}
                                        status="confirmed"
                                    />
                                )}
                                {verificationData?.scientific_verification?.weather?.confirmed && (
                                    <SourceRow
                                        title="OpenWeather"
                                        meta={verificationData.scientific_verification.weather.description}
                                        status="Confirmed"
                                    />
                                )}
                                {!verificationData?.scientific_verification?.seismic?.confirmed && !verificationData?.scientific_verification?.weather?.confirmed && (
                                    <div className="text-xs text-slate-500">No scientific data available for this event type</div>
                                )}
                            </SourceListCard>

                            <SourceListCard
                                icon="globe"
                                title="Web Search"
                                count={`${webSources.length || modelSources.length || 0} found`}
                                status="Click to expand"
                            >
                                {webSources.length > 0 ? webSources.map((source, index) => (
                                    <SourceRow
                                        key={index}
                                        href={source.url}
                                        title={source.name}
                                        status="Confirmed"
                                    />
                                )) : modelSources.length > 0 ? modelSources.map((source, index) => (
                                    <SourceRow
                                        key={index}
                                        href={verificationData?.perplexity?.source_urls?.[index]}
                                        title={source}
                                        status="Confirmed"
                                    />
                                )) : (
                                    <div className="text-xs text-slate-500">No web sources found</div>
                                )}

                                {verificationData?.perplexity?.summary && (
                                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs leading-5 text-slate-400">
                                        {verificationData.perplexity.summary}
                                    </div>
                                )}
                            </SourceListCard>
                        </div>
                    </div>
                )}
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
                <div className="panel p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="section-title">Map</div>
                            <div className="mt-2 text-sm font-semibold text-slate-100">Alert Coverage</div>
                        </div>
                        <SystemIcon name="map" className="h-5 w-5 text-cyan-200" />
                    </div>
                    <div className="mt-4 h-[320px] overflow-hidden rounded-2xl border border-slate-800">
                        <AlertMap
                            lat={parseFloat(selectedAlert.lat)}
                            lon={parseFloat(selectedAlert.lon)}
                            radius={parseFloat(selectedAlert.affected_radius_km)}
                            severity={selectedAlert.severity}
                        />
                    </div>
                </div>

                <div className="panel p-6">
                    <div className="section-title">Cost Estimate</div>
                    <div className="mt-3 text-3xl font-semibold text-slate-50">{totalRecipients}</div>
                    <div className="mt-1 text-sm text-slate-500">Total Recipients</div>

                    <div className="mt-6 space-y-3">
                        <StatCard label="Critical" value={selectedAlert.affected_users_count?.critical || 0} />
                        <StatCard label="Warning" value={selectedAlert.affected_users_count?.warning || 0} />
                        <StatCard label="Watch" value={selectedAlert.affected_users_count?.watch || 0} />
                        <StatCard label="Estimated cost" value="$0.00" footnote="Carrier partnership" />
                    </div>
                </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
                <div className="panel p-6">
                    <div className="section-title">Select Message Option</div>

                    <div className="mt-5 space-y-3">
                        {MESSAGE_OPTIONS.map((option) => (
                            <label
                                key={option}
                                className={`block cursor-pointer rounded-2xl border p-4 transition-all ${
                                    selectedOption === option && !customMessage
                                        ? 'border-cyan-300/45 bg-cyan-300/10'
                                        : 'border-slate-800 bg-slate-950/45 hover:border-slate-700'
                                }`}
                            >
                                <div className="flex items-start gap-3">
                                    <input
                                        type="radio"
                                        name="messageOption"
                                        value={option}
                                        checked={selectedOption === option && !customMessage}
                                        onChange={() => {
                                            setSelectedOption(option);
                                            setCustomMessage('');
                                        }}
                                        className="mt-1 h-4 w-4 accent-cyan-300"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-semibold capitalize text-slate-100">{option}</div>
                                        <div className="mt-2 text-sm leading-6 text-slate-400 [unicode-bidi:plaintext]" dir="ltr">
                                            {getMessagePreview(selectedAlert.alert_messages?.[option]?.en, selectedAlert, 'en') || 'Loading...'}
                                        </div>
                                        <div
                                            className="mt-3 text-right text-xs leading-6 text-slate-500 [unicode-bidi:plaintext]"
                                            dir="rtl"
                                            lang="ar"
                                        >
                                            {getMessagePreview(selectedAlert.alert_messages?.[option]?.ar, selectedAlert, 'ar') || '...'}
                                        </div>
                                    </div>
                                </div>
                            </label>
                        ))}
                    </div>

                    <div className="mt-5">
                        <label className="section-title">Or Write Custom Message:</label>
                        <textarea
                            value={customMessage}
                            onChange={(e) => setCustomMessage(e.target.value)}
                            placeholder="Enter custom alert message (will be translated to all languages)..."
                            className="surface-input mt-2 resize-none"
                            rows={4}
                        />
                    </div>
                </div>

                <div className="space-y-6">
                    <section className="panel p-6">
                        <div className="section-title">Analyst Notes:</div>
                        <textarea
                            value={analystNotes}
                            onChange={(e) => setAnalystNotes(e.target.value)}
                            placeholder="Add any notes about this decision..."
                            className="surface-input mt-3 resize-none"
                            rows={6}
                        />
                    </section>

                    {approvalStatus && (
                        <section className={`panel p-4 ${
                            approvalStatus.status === 'success'
                                ? 'border border-emerald-400/25'
                                : approvalStatus.status === 'error'
                                    ? 'border border-red-400/25'
                                    : 'border border-cyan-300/20'
                        }`}>
                            <div className="flex items-start gap-3">
                                <SystemIcon
                                    name={approvalStatus.status === 'error' ? 'alert' : approvalStatus.status === 'success' ? 'check' : 'scan'}
                                    className={`mt-0.5 h-5 w-5 ${
                                        approvalStatus.status === 'success'
                                            ? 'text-emerald-300'
                                            : approvalStatus.status === 'error'
                                                ? 'text-red-300'
                                                : 'text-cyan-200'
                                    }`}
                                />
                                <div className="text-sm text-slate-200">{approvalStatus.message}</div>
                            </div>
                        </section>
                    )}

                    <section className="panel p-6">
                        <div className="section-title">Actions</div>
                        <div className="mt-4 flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={handleApprove}
                                disabled={approving}
                                className="command-button flex-1"
                            >
                                <SystemIcon name="send" className="h-4 w-4" />
                                <span>{approving ? 'Sending...' : 'Approve & Send'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleReject}
                                className="danger-button flex-1"
                            >
                                <SystemIcon name="x" className="h-4 w-4" />
                                <span>Reject</span>
                            </button>
                        </div>
                    </section>
                </div>
            </section>
        </div>
    );
}

export default AlertReviewPanel;
