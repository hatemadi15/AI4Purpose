import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getIntelFindings, getSourceConfig, triggerDetection } from '../services/api';
import useSocket from '../hooks/useSocket';
import CountryFlag from '../components/CountryFlag';
import IntelFindingsPanel from '../components/IntelFindingsPanel';
import SourceSelector from '../components/SourceSelector';
import SourceOptionSelector from '../components/SourceOptionSelector';
import SystemIcon from '../components/SystemIcon';
import {
    buildDefaultSourceOptionSelection,
    getMergedSelectedSourceOptionIds,
    getMergedSourceOptionGroups,
    toggleSourceOptionSelection
} from '../utils/sourceOptions';
import { FALLBACK_SOURCE_CONFIG } from '../utils/fallbackSourceConfig';

const REGIONS = [
    { id: 'Lebanon', name: 'Lebanon', code: 'lb', theater: '', coords: '33.89N / 35.50E' },
    { id: 'Turkey', name: 'Turkey', code: 'tr', theater: '', coords: '39.93N / 32.86E' },
    { id: 'Italy', name: 'Italy', code: 'it', theater: '', coords: '41.90N / 12.50E' },
    { id: 'Palestine', name: 'Palestine', code: 'ps', theater: '', coords: '31.95N / 35.23E' }
];

const PIPELINE_STEPS = [
    { id: 1, name: 'Gathering Intelligence', threshold: 10 },
    { id: 2, name: 'Aggregating Findings', threshold: 40 },
    { id: 3, name: 'Generating Recommendations', threshold: 70 },
    { id: 4, name: 'Complete', threshold: 100 }
];

function RegionCard({ region, selected, disabled, onSelect }) {
    return (
        <button
            type="button"
            onClick={() => onSelect(region.id)}
            disabled={disabled}
            className={`rounded-xl border px-4 py-3 text-left transition-all ${
                selected
                    ? 'border-cyan-300/50 bg-cyan-300/10 shadow-[inset_0_0_0_1px_rgba(111,214,223,0.18)]'
                    : 'border-slate-800 bg-slate-950/45 hover:border-slate-700'
            } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
        >
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    {region.theater ? <div className="section-title">{region.theater}</div> : null}
                    <div className="text-base font-semibold text-slate-50">{region.name}</div>
                </div>
                <CountryFlag code={region.code} name={region.name} size="md" />
            </div>
        </button>
    );
}

function PipelineStep({ step, progress }) {
    const active = progress >= step.threshold;

    return (
        <div className={`rounded-2xl border p-3 ${active ? 'border-cyan-300/35 bg-cyan-300/10' : 'border-slate-800 bg-slate-950/45'}`}>
            <div className={`section-title ${active ? 'text-cyan-100' : 'text-slate-500'}`}>Stage {step.id}</div>
            <div className="mt-2 text-sm font-semibold text-slate-100">{step.name}</div>
        </div>
    );
}

function SourceSummary({ result }) {
    const sourceSelection = result?.source_selection;

    if (!sourceSelection?.resolved_details?.length) {
        return null;
    }

    return (
        <div className="panel p-4">
            <div className="flex flex-wrap items-center gap-2">
                <div className="section-title">Sources Used</div>
                <span className="text-xs text-slate-500">
                    {sourceSelection.used_defaults ? 'backend defaults' : 'custom override'}
                </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
                {sourceSelection.resolved_details.map((source) => (
                    <span
                        key={source.id}
                        className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-medium text-cyan-100"
                    >
                        {source.label}
                    </span>
                ))}
            </div>
            {(() => {
                const twitterSelections = Object.values(sourceSelection.resolved_source_options || {})
                    .map((optionGroups) => optionGroups.twitter_accounts?.resolved_details || [])
                    .flat();
                const uniqueTwitterSelections = [...new Map(twitterSelections.map((option) => [option.id, option])).values()];

                if (uniqueTwitterSelections.length === 0) {
                    return null;
                }

                return (
                    <div className="mt-4">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                            Twitter Accounts
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {uniqueTwitterSelections.map((option) => (
                                <span
                                    key={option.id}
                                    className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-300"
                                >
                                    {option.handle ? `@${option.handle}` : option.label}
                                </span>
                            ))}
                        </div>
                    </div>
                );
            })()}
            {sourceSelection.ignored_unavailable?.length > 0 && (
                <div className="mt-3 text-xs text-amber-300">
                    Ignored unavailable sources: {sourceSelection.ignored_unavailable.join(', ')}
                </div>
            )}
        </div>
    );
}

function MasterControlPanel() {
    const fallbackProviders = FALLBACK_SOURCE_CONFIG.detection.providers;
    const navigate = useNavigate();
    const { socket, isConnected } = useSocket();
    const [selectedRegion, setSelectedRegion] = useState('Lebanon');
    const [isDetecting, setIsDetecting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentStep, setCurrentStep] = useState('');
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [persistedFindings, setPersistedFindings] = useState([]);
    const [sourceProviders, setSourceProviders] = useState(fallbackProviders);
    const [selectedSourceIds, setSelectedSourceIds] = useState(fallbackProviders.filter((provider) => provider.default_enabled).map((provider) => provider.id));
    const [selectedSourceOptions, setSelectedSourceOptions] = useState(buildDefaultSourceOptionSelection(fallbackProviders));
    const [sourceConfigLoaded, setSourceConfigLoaded] = useState(true);
    const [sourceConfigError, setSourceConfigError] = useState(null);

    useEffect(() => {
        let active = true;

        const loadSourceConfig = async () => {
            try {
                const response = await getSourceConfig();
                if (!active) return;

                const providers = response.data?.detection?.providers || [];
                setSourceProviders(providers);
                setSelectedSourceIds(providers.filter((provider) => provider.default_enabled).map((provider) => provider.id));
                setSelectedSourceOptions(buildDefaultSourceOptionSelection(providers));
                setSourceConfigLoaded(true);
                setSourceConfigError(null);
            } catch (err) {
                if (!active) return;
                setSourceProviders(fallbackProviders);
                setSelectedSourceIds(fallbackProviders.filter((provider) => provider.default_enabled).map((provider) => provider.id));
                setSelectedSourceOptions(buildDefaultSourceOptionSelection(fallbackProviders));
                setSourceConfigLoaded(true);
                setSourceConfigError(err.response?.data?.error || err.message);
            }
        };

        loadSourceConfig();

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        let active = true;

        const loadPersistedFindings = async () => {
            try {
                const response = await getIntelFindings(selectedRegion, 200);
                if (!active) return;
                if (response.data?.success) {
                    setPersistedFindings(response.data.findings || []);
                }
            } catch (err) {
                if (!active) return;
                console.error('Failed to load persisted findings:', err);
            }
        };

        loadPersistedFindings();

        return () => {
            active = false;
        };
    }, [selectedRegion]);

    useEffect(() => {
        if (!socket) return undefined;

        const handleDetectionStatus = (data) => {
            setProgress(data.progress);
            setCurrentStep(data.message);

            if (data.complete) {
                setIsDetecting(false);
            }

            if (data.error) {
                setError(data.message);
                setIsDetecting(false);
            }
        };

        socket.on('detection_status', handleDetectionStatus);

        return () => {
            socket.off('detection_status', handleDetectionStatus);
        };
    }, [socket]);

    const handleTriggerDetection = async () => {
        setIsDetecting(true);
        setProgress(0);
        setCurrentStep('Initializing detection...');
        setResult(null);
        setError(null);

        try {
            const response = await triggerDetection(
                selectedRegion,
                sourceConfigLoaded ? selectedSourceIds : undefined,
                sourceConfigLoaded ? selectedSourceOptions : undefined
            );
            setResult(response.data);
            setPersistedFindings(response.data?.findings || []);
            setIsDetecting(false);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
            setIsDetecting(false);
        }
    };

    const toggleSource = (sourceId) => {
        setSelectedSourceIds((current) => (
            current.includes(sourceId)
                ? current.filter((id) => id !== sourceId)
                : [...current, sourceId]
        ));
    };

    const toggleSourceOption = (sourceIds, optionGroupId, optionId) => {
        setSelectedSourceOptions((current) => sourceIds.reduce(
            (nextSelection, sourceId) => toggleSourceOptionSelection(nextSelection, sourceId, optionGroupId, optionId),
            current
        ));
    };

    const selectedRegionData = REGIONS.find((region) => region.id === selectedRegion) || REGIONS[0];
    const triggerDisabled = isDetecting || (sourceConfigLoaded && selectedSourceIds.length === 0);
    const visibleFindings = result?.region === selectedRegion ? (result.findings || []) : persistedFindings;
    const latestFindings = result?.region === selectedRegion ? (result.latest_findings || []) : [];
    const recommendations = result?.region === selectedRegion ? (result.recommendations || []) : [];
    const mergedSourceOptionGroups = getMergedSourceOptionGroups(sourceProviders, selectedSourceIds);

    return (
        <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[1.3fr,0.9fr]">
                <section className="panel p-6 md:p-8">
                    <div className="space-y-8">
                        <div>
                            <h1 className="text-3xl font-semibold text-slate-50 md:text-4xl">
                                Master Control Panel
                            </h1>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            {REGIONS.map((region) => (
                                <RegionCard
                                    key={region.id}
                                    region={region}
                                    selected={selectedRegion === region.id}
                                    disabled={isDetecting}
                                    onSelect={setSelectedRegion}
                                />
                            ))}
                        </div>

                        <div className="space-y-3">
                            <SourceSelector
                                title="Detection Sources"
                                helperText="Backend defaults are preselected. Change the set for this run only."
                                providers={sourceProviders}
                                selectedIds={selectedSourceIds}
                                onToggle={toggleSource}
                                disabled={isDetecting}
                            />
                            {mergedSourceOptionGroups.map((optionGroup) => (
                                <SourceOptionSelector
                                    key={optionGroup.id}
                                    title={optionGroup.label}
                                    helperText={optionGroup.helper_text}
                                    options={optionGroup.options}
                                    selectedIds={getMergedSelectedSourceOptionIds(selectedSourceOptions, optionGroup.source_ids, optionGroup.id)}
                                    onToggle={(optionId) => toggleSourceOption(optionGroup.source_ids, optionGroup.id, optionId)}
                                    disabled={isDetecting}
                                />
                            ))}
                            {sourceConfigError && (
                                <div className="mt-3 text-xs text-amber-300">
                                    Source config unavailable: {sourceConfigError}. Detection will fall back to backend defaults.
                                </div>
                            )}
                            {sourceConfigLoaded && selectedSourceIds.length === 0 && (
                                <div className="mt-3 text-xs text-amber-300">
                                    Select at least one source before starting detection.
                                </div>
                            )}
                            <div>
                                <button
                                    type="button"
                                    onClick={handleTriggerDetection}
                                    disabled={triggerDisabled}
                                    className="command-button min-h-[88px] w-full justify-center px-6"
                                >
                                    <SystemIcon name={isDetecting ? 'scan' : 'search'} className="h-5 w-5" />
                                    <span>{isDetecting ? 'Detecting...' : 'Trigger Crisis Detection'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="panel p-6">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="section-title">Connection Status</div>
                            <h2 className="mt-2 text-xl font-semibold text-slate-50">System Status</h2>
                        </div>
                        <div className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                            isConnected
                                ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                                : 'border-red-400/25 bg-red-400/10 text-red-200'
                        }`}>
                            {isConnected ? 'Real-time Connected' : 'Connecting...'}
                        </div>
                    </div>

                    <div className="mt-5 space-y-3">
                        <div className="section-title">Progress Section</div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {PIPELINE_STEPS.map((step) => (
                                <PipelineStep key={step.id} step={step} progress={progress} />
                            ))}
                        </div>
                    </div>

                    <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                        <div className="section-title">Current Step</div>
                        <div className="mt-2 text-sm font-semibold text-slate-100">
                            {currentStep || 'Ready'}
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-900">
                            <div className="progress-bar h-full rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                        </div>
                        <div className="mt-2 text-xs text-slate-500">{progress}% complete</div>
                    </div>
                </section>
            </div>

            {error && (
                <section className="panel border border-red-400/25 p-4">
                    <div className="flex items-start gap-3 text-red-200">
                        <SystemIcon name="alert" className="mt-0.5 h-5 w-5" />
                        <div>
                            <div className="section-title text-red-200">Detection Error</div>
                            <div className="mt-2 text-sm text-red-100">{error}</div>
                        </div>
                    </div>
                </section>
            )}

            <SourceSummary result={result} />

            {(visibleFindings.length > 0 || latestFindings.length > 0 || recommendations.length > 0) && (
                <section>
                    <IntelFindingsPanel
                        findings={visibleFindings}
                        latestFindings={latestFindings}
                        recommendations={recommendations}
                        region={selectedRegion}
                        onAlertCreated={(data) => {
                            if (data.alertId) {
                                navigate('/dashboard');
                            }
                        }}
                    />
                </section>
            )}
        </div>
    );
}

export default MasterControlPanel;
