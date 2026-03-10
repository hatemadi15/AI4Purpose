import { useState } from 'react';

const EVENT_TYPES = [
    { value: 'EARTHQUAKE', label: '🌍 Earthquake' },
    { value: 'AIRSTRIKE', label: '💥 Airstrike' },
    { value: 'MISSILE_ATTACK', label: '🚀 Missile Attack' },
    { value: 'EXPLOSION', label: '💣 Explosion' },
    { value: 'FLOOD', label: '🌊 Flood' },
    { value: 'WILDFIRE', label: '🔥 Wildfire' },
    { value: 'SEVERE_WEATHER', label: '⛈️ Severe Weather' },
    { value: 'SECURITY_INCIDENT', label: '⚠️ Security Incident' },
    { value: 'HUMANITARIAN', label: '🏥 Humanitarian Crisis' },
    { value: 'OTHER', label: '📢 Other' }
];

const SEVERITY_LEVELS = [
    { value: 'LOW', label: 'Low', color: 'text-green-400' },
    { value: 'MEDIUM', label: 'Medium', color: 'text-yellow-400' },
    { value: 'HIGH', label: 'High', color: 'text-orange-400' },
    { value: 'CRITICAL', label: 'Critical', color: 'text-red-400' }
];

function ManualAlertModal({ isOpen, onClose, onSubmit }) {
    const [formData, setFormData] = useState({
        event_type: 'SECURITY_INCIDENT',
        lat: 33.8938,
        lon: 35.5018,
        affected_radius_km: 30,
        severity: 'MEDIUM',
        message: '',
        analyst_name: '',
        analyst_notes: '',
        intel_sources: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const submitData = {
                ...formData,
                lat: parseFloat(formData.lat),
                lon: parseFloat(formData.lon),
                affected_radius_km: parseFloat(formData.affected_radius_km),
                intel_sources: formData.intel_sources
                    .split(',')
                    .map(s => s.trim())
                    .filter(s => s)
            };
            await onSubmit(submitData);
            onClose();
        } catch (error) {
            console.error('Manual alert error:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-white">Create Manual Alert</h2>
                        <button
                            onClick={onClose}
                            className="text-slate-400 hover:text-white text-2xl"
                        >
                            ×
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Event Type */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                Event Type
                            </label>
                            <select
                                name="event_type"
                                value={formData.event_type}
                                onChange={handleChange}
                                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white focus:border-primary-500 focus:outline-none"
                            >
                                {EVENT_TYPES.map(type => (
                                    <option key={type.value} value={type.value}>
                                        {type.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Location */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                    Latitude
                                </label>
                                <input
                                    type="number"
                                    name="lat"
                                    step="0.0001"
                                    value={formData.lat}
                                    onChange={handleChange}
                                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white focus:border-primary-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                    Longitude
                                </label>
                                <input
                                    type="number"
                                    name="lon"
                                    step="0.0001"
                                    value={formData.lon}
                                    onChange={handleChange}
                                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white focus:border-primary-500 focus:outline-none"
                                />
                            </div>
                        </div>

                        {/* Radius and Severity */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                    Affected Radius (km)
                                </label>
                                <input
                                    type="number"
                                    name="affected_radius_km"
                                    value={formData.affected_radius_km}
                                    onChange={handleChange}
                                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white focus:border-primary-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                    Severity
                                </label>
                                <select
                                    name="severity"
                                    value={formData.severity}
                                    onChange={handleChange}
                                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white focus:border-primary-500 focus:outline-none"
                                >
                                    {SEVERITY_LEVELS.map(level => (
                                        <option key={level.value} value={level.value}>
                                            {level.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Alert Message */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                Alert Message <span className="text-red-400">*</span>
                            </label>
                            <textarea
                                name="message"
                                value={formData.message}
                                onChange={handleChange}
                                rows={3}
                                required
                                placeholder="Enter the alert message (will be auto-translated to 5 languages)"
                                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white focus:border-primary-500 focus:outline-none resize-none"
                            />
                        </div>

                        {/* Analyst Info */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                    Analyst Name
                                </label>
                                <input
                                    type="text"
                                    name="analyst_name"
                                    value={formData.analyst_name}
                                    onChange={handleChange}
                                    placeholder="Your name"
                                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white focus:border-primary-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                    Intel Sources (comma separated)
                                </label>
                                <input
                                    type="text"
                                    name="intel_sources"
                                    value={formData.intel_sources}
                                    onChange={handleChange}
                                    placeholder="@sentdefender, Local report"
                                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white focus:border-primary-500 focus:outline-none"
                                />
                            </div>
                        </div>

                        {/* Notes */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                Internal Notes
                            </label>
                            <textarea
                                name="analyst_notes"
                                value={formData.analyst_notes}
                                onChange={handleChange}
                                rows={2}
                                placeholder="Optional notes for internal reference"
                                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white focus:border-primary-500 focus:outline-none resize-none"
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-4 pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting || !formData.message}
                                className="flex-1 py-3 px-4 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? 'Creating...' : 'Create Alert'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default ManualAlertModal;
