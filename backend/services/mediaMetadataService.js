const exifr = require('exifr');

const EDITING_SOFTWARE_PATTERNS = [
    /adobe/i,
    /photoshop/i,
    /lightroom/i,
    /snapseed/i,
    /picsart/i,
    /canva/i
];

const SERIOUS_METADATA_WARNING_FLAGS = new Set([
    'capture_time_conflict',
    'gps_far_from_event',
    'editing_software_tag'
]);

function createImageArtifact({
    sourceKind = 'upload',
    source_kind = null,
    url = null,
    buffer = null,
    mimeType = null,
    mime_type = null,
    byteSize = null,
    byte_size = null,
    context = {}
} = {}) {
    return {
        source_kind: source_kind || sourceKind,
        url,
        buffer,
        mime_type: mime_type || mimeType,
        byte_size: byte_size ?? byteSize ?? (Buffer.isBuffer(buffer) ? buffer.length : null),
        context: context || {}
    };
}

function hasFields(value) {
    return Boolean(value) && typeof value === 'object' && Object.keys(value).length > 0;
}

function toFiniteNumber(...values) {
    for (const value of values) {
        if (value == null || value === '') continue;
        const parsed = typeof value === 'number' ? value : parseFloat(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return null;
}

function toIsoTimestamp(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return date.toISOString();
}

function normalizeGps(gpsSegment) {
    if (!hasFields(gpsSegment)) {
        return null;
    }

    const latitude = toFiniteNumber(gpsSegment.latitude, gpsSegment.GPSLatitude, gpsSegment.lat);
    const longitude = toFiniteNumber(gpsSegment.longitude, gpsSegment.GPSLongitude, gpsSegment.lon, gpsSegment.lng);

    if (latitude == null || longitude == null) {
        return null;
    }

    return { latitude, longitude };
}

function normalizeParsedMetadata(parsedSegments, artifact) {
    const ifd0 = parsedSegments?.ifd0 || {};
    const exif = parsedSegments?.exif || {};
    const gps = parsedSegments?.gps || {};
    const iptc = parsedSegments?.iptc || {};

    return {
        capture_time: toIsoTimestamp(
            exif.DateTimeOriginal
            || exif.CreateDate
            || exif.DateTimeDigitized
            || ifd0.DateTime
            || ifd0.ModifyDate
        ),
        gps: normalizeGps(gps),
        device_make: ifd0.Make || exif.Make || null,
        device_model: ifd0.Model || exif.Model || null,
        software: ifd0.Software || exif.Software || null,
        mime_type: artifact?.mime_type || null,
        byte_size: artifact?.byte_size ?? null,
        width: toFiniteNumber(exif.ExifImageWidth, ifd0.ImageWidth, ifd0.ExifImageWidth),
        height: toFiniteNumber(exif.ExifImageHeight, ifd0.ImageHeight, ifd0.ImageLength),
        has_exif: hasFields(ifd0) || hasFields(exif) || hasFields(gps),
        has_xmp: Boolean(parsedSegments?.xmp),
        has_iptc: hasFields(iptc)
    };
}

function createEmptyMetadata(artifact) {
    return {
        capture_time: null,
        gps: null,
        device_make: null,
        device_model: null,
        software: null,
        mime_type: artifact?.mime_type || null,
        byte_size: artifact?.byte_size ?? null,
        width: null,
        height: null,
        has_exif: false,
        has_xmp: false,
        has_iptc: false
    };
}

function haversineDistanceKm(lat1, lon1, lat2, lon2) {
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;

    return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hasAnyMetadata(metadata) {
    return Boolean(
        metadata?.capture_time
        || metadata?.gps
        || metadata?.device_make
        || metadata?.device_model
        || metadata?.software
        || metadata?.width
        || metadata?.height
        || metadata?.has_exif
        || metadata?.has_xmp
        || metadata?.has_iptc
    );
}

function buildMetadataAssessment({ artifact, metadata, eventDetails = {} }) {
    const normalizedArtifact = createImageArtifact(artifact);
    const normalizedMetadata = metadata || createEmptyMetadata(normalizedArtifact);
    const flags = [];
    const notes = [];

    const hasAnyEmbeddedMetadata = normalizedMetadata.has_exif || normalizedMetadata.has_xmp || normalizedMetadata.has_iptc;
    const socialCopyMetadataMissing = normalizedArtifact.source_kind === 'twitter_url' && !hasAnyEmbeddedMetadata;

    if (socialCopyMetadataMissing) {
        flags.push('social_copy_metadata_missing');
        notes.push('Metadata unavailable on social copy; this is common for Twitter/X images.');
    }

    if (!socialCopyMetadataMissing && !normalizedMetadata.capture_time) {
        flags.push('capture_time_missing');
        notes.push('Original capture time not available.');
    }

    const tweetCreatedAt = toIsoTimestamp(normalizedArtifact.context?.tweet_created_at);
    if (normalizedMetadata.capture_time && tweetCreatedAt) {
        const captureTimeMs = Date.parse(normalizedMetadata.capture_time);
        const tweetTimeMs = Date.parse(tweetCreatedAt);

        if (captureTimeMs > tweetTimeMs || (tweetTimeMs - captureTimeMs) > (72 * 60 * 60 * 1000)) {
            flags.push('capture_time_conflict');
            notes.push('Capture time conflicts with the source tweet timing.');
        }
    }

    if (!socialCopyMetadataMissing && !normalizedMetadata.gps) {
        flags.push('gps_missing');
        notes.push('GPS location not available.');
    }

    if (normalizedMetadata.gps) {
        const eventLat = toFiniteNumber(eventDetails.lat);
        const eventLon = toFiniteNumber(eventDetails.lon);

        if (eventLat != null && eventLon != null) {
            const distanceKm = haversineDistanceKm(
                normalizedMetadata.gps.latitude,
                normalizedMetadata.gps.longitude,
                eventLat,
                eventLon
            );

            normalizedMetadata.gps = {
                ...normalizedMetadata.gps,
                distance_km_to_event: Number(distanceKm.toFixed(1))
            };

            if (distanceKm > 100) {
                flags.push('gps_far_from_event');
                notes.push(`Embedded GPS is ${distanceKm.toFixed(1)} km from the claimed event.`);
            }
        }
    }

    if (normalizedMetadata.software && EDITING_SOFTWARE_PATTERNS.some((pattern) => pattern.test(normalizedMetadata.software))) {
        flags.push('editing_software_tag');
        notes.push(`Metadata references editing software: ${normalizedMetadata.software}.`);
    }

    const metadataAvailable = hasAnyMetadata(normalizedMetadata);
    const hasSeriousWarning = flags.some((flag) => SERIOUS_METADATA_WARNING_FLAGS.has(flag));

    if (metadataAvailable && !hasSeriousWarning) {
        flags.push('metadata_present_no_conflict');
        notes.push('Available metadata does not show an obvious time or location conflict.');
    }

    return {
        metadata: normalizedMetadata,
        metadata_flags: [...new Set(flags)],
        metadata_notes: [...new Set(notes)],
        metadata_available: metadataAvailable,
        metadata_warning: hasSeriousWarning
    };
}

async function extractMetadataFromArtifact(artifact, eventDetails = {}) {
    const normalizedArtifact = createImageArtifact(artifact);
    const fallbackMetadata = createEmptyMetadata(normalizedArtifact);

    if (!Buffer.isBuffer(normalizedArtifact.buffer) || normalizedArtifact.buffer.length === 0) {
        return buildMetadataAssessment({
            artifact: normalizedArtifact,
            metadata: fallbackMetadata,
            eventDetails
        });
    }

    try {
        const parsedSegments = await exifr.parse(normalizedArtifact.buffer, {
            mergeOutput: false,
            sanitize: true,
            ifd0: true,
            exif: true,
            gps: true,
            iptc: true,
            xmp: { parse: false }
        });

        return buildMetadataAssessment({
            artifact: normalizedArtifact,
            metadata: normalizeParsedMetadata(parsedSegments || {}, normalizedArtifact),
            eventDetails
        });
    } catch (error) {
        return buildMetadataAssessment({
            artifact: normalizedArtifact,
            metadata: fallbackMetadata,
            eventDetails
        });
    }
}

module.exports = {
    buildMetadataAssessment,
    createImageArtifact,
    extractMetadataFromArtifact,
    normalizeParsedMetadata
};
