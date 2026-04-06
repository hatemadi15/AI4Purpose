import { useEffect, useState } from 'react';
import SystemIcon from './SystemIcon';

const EVENT_TYPES = [
    { value: 'EARTHQUAKE', label: 'Earthquake' },
    { value: 'AIRSTRIKE', label: 'Airstrike' },
    { value: 'MISSILE_ATTACK', label: 'Missile attack' },
    { value: 'EXPLOSION', label: 'Explosion' },
    { value: 'FLOOD', label: 'Flood' },
    { value: 'WILDFIRE', label: 'Wildfire' },
    { value: 'SEVERE_WEATHER', label: 'Severe weather' },
    { value: 'SECURITY_INCIDENT', label: 'Security incident' },
    { value: 'HUMANITARIAN', label: 'Humanitarian crisis' },
    { value: 'OTHER', label: 'Other' }
];

const SEVERITY_LEVELS = [
    { value: 'LOW', label: 'Low' },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'HIGH', label: 'High' },
    { value: 'CRITICAL', label: 'Critical' }
];

const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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
    const [selectedImages, setSelectedImages] = useState([]);
    const [imagePreviews, setImagePreviews] = useState([]);
    const [imageError, setImageError] = useState('');

    useEffect(() => {
        const previews = selectedImages.map((file) => ({
            name: file.name,
            url: URL.createObjectURL(file)
        }));

        setImagePreviews(previews);

        return () => {
            previews.forEach((preview) => {
                URL.revokeObjectURL(preview.url);
            });
        };
    }, [selectedImages]);

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleImageSelection = (e) => {
        const files = Array.from(e.target.files || []);
        const valid = [];

        for (const file of files.slice(0, MAX_IMAGES)) {
            if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
                setImageError('Only JPEG, PNG, and WebP images are supported.');
                continue;
            }

            if (file.size > MAX_IMAGE_SIZE_BYTES) {
                setImageError('Each image must be 10 MB or smaller.');
                continue;
            }

            valid.push(file);
        }

        setSelectedImages(valid);
        if (valid.length > 0) {
            setImageError('');
        }
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
                    .map((source) => source.trim())
                    .filter(Boolean),
                images: selectedImages
            };
            await onSubmit(submitData);
            setSelectedImages([]);
            setImageError('');
            onClose();
        } catch (error) {
            console.error('Manual alert error:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="panel w-full max-w-2xl overflow-y-auto">
                <div className="flex items-center justify-between border-b border-slate-800/80 px-6 py-5">
                    <div>
                        <h2 className="text-xl font-semibold text-slate-50">Create Manual Alert</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="secondary-button px-3 py-2"
                    >
                        <SystemIcon name="x" className="h-4 w-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6">
                    <div>
                        <label className="section-title">Event Type</label>
                        <select
                            name="event_type"
                            value={formData.event_type}
                            onChange={handleChange}
                            className="surface-input mt-2"
                        >
                            {EVENT_TYPES.map((type) => (
                                <option key={type.value} value={type.value}>
                                    {type.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="section-title">Latitude</label>
                            <input
                                type="number"
                                name="lat"
                                step="0.0001"
                                value={formData.lat}
                                onChange={handleChange}
                                className="surface-input mt-2"
                            />
                        </div>
                        <div>
                            <label className="section-title">Longitude</label>
                            <input
                                type="number"
                                name="lon"
                                step="0.0001"
                                value={formData.lon}
                                onChange={handleChange}
                                className="surface-input mt-2"
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="section-title">Affected Radius (km)</label>
                            <input
                                type="number"
                                name="affected_radius_km"
                                value={formData.affected_radius_km}
                                onChange={handleChange}
                                className="surface-input mt-2"
                            />
                        </div>
                        <div>
                            <label className="section-title">Severity</label>
                            <select
                                name="severity"
                                value={formData.severity}
                                onChange={handleChange}
                                className="surface-input mt-2"
                            >
                                {SEVERITY_LEVELS.map((level) => (
                                    <option key={level.value} value={level.value}>
                                        {level.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="section-title">Alert Message</label>
                        <textarea
                            name="message"
                            value={formData.message}
                            onChange={handleChange}
                            rows={4}
                            required
                            placeholder="Enter the alert message (will be auto-translated to 5 languages)"
                            className="surface-input mt-2 resize-none"
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="section-title">Analyst Name</label>
                            <input
                                type="text"
                                name="analyst_name"
                                value={formData.analyst_name}
                                onChange={handleChange}
                                placeholder="Your name"
                                className="surface-input mt-2"
                            />
                        </div>
                        <div>
                            <label className="section-title">Intel Sources (comma separated)</label>
                            <input
                                type="text"
                                name="intel_sources"
                                value={formData.intel_sources}
                                onChange={handleChange}
                                placeholder="@sentdefender, Local report"
                                className="surface-input mt-2"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="section-title">Internal Notes</label>
                        <textarea
                            name="analyst_notes"
                            value={formData.analyst_notes}
                            onChange={handleChange}
                            rows={3}
                            placeholder="Optional notes for internal reference"
                            className="surface-input mt-2 resize-none"
                        />
                    </div>

                    <div>
                        <label className="section-title">Attach Images</label>
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            onChange={handleImageSelection}
                            className="surface-input mt-2"
                        />
                        <div className="mt-2 text-xs text-slate-500">
                            Up to {MAX_IMAGES} images, 10 MB each. Images are analyzed during verification.
                        </div>
                        {imageError && (
                            <div className="mt-3 rounded-xl border border-red-400/25 bg-red-400/10 px-3 py-2 text-xs text-red-100">
                                {imageError}
                            </div>
                        )}
                        {imagePreviews.length > 0 && (
                            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {imagePreviews.map((preview) => (
                                    <div key={preview.url} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/45">
                                        <img src={preview.url} alt={preview.name} className="h-28 w-full object-cover" />
                                        <div className="truncate px-3 py-2 text-xs text-slate-400">{preview.name}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-3 pt-2">
                        <button type="button" onClick={onClose} className="secondary-button flex-1">
                            <span>Cancel</span>
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !formData.message}
                            className="command-button flex-1"
                        >
                            <SystemIcon name="plus" className="h-4 w-4" />
                            <span>{isSubmitting ? 'Creating...' : 'Create Alert'}</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default ManualAlertModal;
