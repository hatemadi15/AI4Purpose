import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { triggerDetection } from '../services/api';
import useSocket from '../hooks/useSocket';
import IntelFindingsPanel from '../components/IntelFindingsPanel';

const REGIONS = [
    { id: 'Lebanon', name: 'Lebanon', flag: '🇱🇧', coords: '33.89°N, 35.50°E' },
    { id: 'Turkey', name: 'Turkey', flag: '🇹🇷', coords: '39.93°N, 32.86°E' },
    { id: 'Italy', name: 'Italy', flag: '🇮🇹', coords: '41.90°N, 12.50°E' },
    { id: 'Palestine', name: 'Palestine', flag: '🇵🇸', coords: '31.95°N, 35.23°E' }
];

function MasterControlPanel() {
    const navigate = useNavigate();
    const { socket, isConnected } = useSocket();
    const [selectedRegion, setSelectedRegion] = useState('Lebanon');
    const [isDetecting, setIsDetecting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentStep, setCurrentStep] = useState('');
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (socket) {
            socket.on('detection_status', (data) => {
                setProgress(data.progress);
                setCurrentStep(data.message);

                if (data.complete) {
                    setIsDetecting(false);
                }

                if (data.error) {
                    setError(data.message);
                    setIsDetecting(false);
                }
            });

            return () => {
                socket.off('detection_status');
            };
        }
    }, [socket]);

    const handleTriggerDetection = async () => {
        setIsDetecting(true);
        setProgress(0);
        setCurrentStep('Initializing detection...');
        setResult(null);
        setError(null);

        try {
            const response = await triggerDetection(selectedRegion, false); // No demo mode
            setResult(response.data);
            setIsDetecting(false);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
            setIsDetecting(false);
        }
    };

    const steps = [
        { id: 1, name: 'Gathering Intelligence', threshold: 10 },
        { id: 2, name: 'Aggregating Findings', threshold: 40 },
        { id: 3, name: 'Generating Recommendations', threshold: 70 },
        { id: 4, name: 'Complete', threshold: 100 }
    ];

    return (
        <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="text-center mb-12">
                <h1 className="text-4xl font-bold text-white mb-4">
                    Master Control Panel
                </h1>
                <p className="text-slate-400 text-lg">
                    Trigger crisis detection for Mediterranean regions
                </p>
            </div>

            {/* Connection Status */}
            <div className="flex justify-center mb-8">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
                    <span className="text-sm font-medium">
                        {isConnected ? 'Real-time Connected' : 'Connecting...'}
                    </span>
                </div>
            </div>

            {/* Region Selector */}
            <div className="glass-card p-6 mb-8">
                <h3 className="text-lg font-semibold text-white mb-4">Select Region</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {REGIONS.map(region => (
                        <button
                            key={region.id}
                            onClick={() => setSelectedRegion(region.id)}
                            disabled={isDetecting}
                            className={`p-4 rounded-xl border-2 transition-all duration-200 ${selectedRegion === region.id
                                ? 'border-primary-500 bg-primary-500/20'
                                : 'border-slate-600 hover:border-slate-500 bg-slate-800/50'
                                } ${isDetecting ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <div className="text-3xl mb-2">{region.flag}</div>
                            <div className="text-white font-medium">{region.name}</div>
                            <div className="text-xs text-slate-400">{region.coords}</div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Detection Button */}
            <div className="text-center mb-8">
                <button
                    onClick={handleTriggerDetection}
                    disabled={isDetecting}
                    className={`glow-button px-12 py-6 rounded-2xl text-white font-bold text-xl transition-all duration-300 ${isDetecting ? 'opacity-70 cursor-not-allowed' : ''
                        }`}
                >
                    {isDetecting ? (
                        <div className="flex items-center gap-3">
                            <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            <span>Detecting...</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">🔍</span>
                            <span>Trigger Crisis Detection</span>
                        </div>
                    )}
                </button>
            </div>

            {/* Progress Section */}
            {isDetecting && (
                <div className="glass-card p-6 mb-8">
                    <div className="mb-4">
                        <div className="flex justify-between mb-2">
                            <span className="text-sm text-slate-400">{currentStep}</span>
                            <span className="text-sm text-primary-400">{progress}%</span>
                        </div>
                        <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                            <div
                                className="h-full progress-bar rounded-full transition-all duration-500"
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                    </div>

                    <div className="grid grid-cols-6 gap-2">
                        {steps.map(step => (
                            <div
                                key={step.id}
                                className={`text-center p-2 rounded-lg transition-all ${progress >= step.threshold
                                    ? 'bg-primary-500/20 text-primary-400'
                                    : 'bg-slate-800 text-slate-500'
                                    }`}
                            >
                                <div className="text-lg mb-1">
                                    {progress >= step.threshold ? '✓' : step.id}
                                </div>
                                <div className="text-xs">{step.name}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className="glass-card p-6 mb-8 border-red-500/50">
                    <div className="flex items-center gap-3 text-red-400">
                        <span className="text-2xl">❌</span>
                        <div>
                            <h4 className="font-semibold">Detection Error</h4>
                            <p className="text-sm text-red-300">{error}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Intel Findings Panel - Shows after detection */}
            {result && result.findings && (
                <div className="mb-8">
                    <IntelFindingsPanel
                        findings={result.findings}
                        recommendations={result.recommendations}
                        region={selectedRegion}
                        onAlertCreated={(data) => {
                            if (data.alertId) {
                                navigate('/dashboard');
                            }
                        }}
                    />
                </div>
            )}

            {/* Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
                <div className="glass-card p-4">
                    <div className="text-2xl mb-2">📡</div>
                    <h4 className="font-semibold text-white mb-1">Multi-Source Intel</h4>
                    <p className="text-sm text-slate-400">Twitter, News, Weather, Seismic APIs</p>
                </div>
                <div className="glass-card p-4">
                    <div className="text-2xl mb-2">🔍</div>
                    <h4 className="font-semibold text-white mb-1">Intelligence Analysis</h4>
                    <p className="text-sm text-slate-400">Verification + Alert Drafting</p>
                </div>
                <div className="glass-card p-4">
                    <div className="text-2xl mb-2">🌍</div>
                    <h4 className="font-semibold text-white mb-1">5 Languages</h4>
                    <p className="text-sm text-slate-400">Arabic, English, Turkish, Italian, Hebrew</p>
                </div>
            </div>
        </div>
    );
}

export default MasterControlPanel;
