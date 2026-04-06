const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildMetadataAssessment,
    createImageArtifact
} = require('../services/mediaMetadataService');

function createMetadata(overrides = {}) {
    return {
        capture_time: null,
        gps: null,
        device_make: null,
        device_model: null,
        software: null,
        mime_type: 'image/jpeg',
        byte_size: 2048,
        width: null,
        height: null,
        has_exif: false,
        has_xmp: false,
        has_iptc: false,
        ...overrides
    };
}

test('no metadata on a Twitter image returns social_copy_metadata_missing', () => {
    const artifact = createImageArtifact({
        sourceKind: 'twitter_url',
        url: 'https://example.com/image.jpg',
        context: { tweet_created_at: '2026-04-05T10:00:00.000Z' }
    });

    const result = buildMetadataAssessment({
        artifact,
        metadata: createMetadata()
    });

    assert.ok(result.metadata_flags.includes('social_copy_metadata_missing'));
    assert.equal(result.metadata_warning, false);
});

test('GPS near the event returns no conflict', () => {
    const artifact = createImageArtifact({
        sourceKind: 'upload',
        url: 'https://example.com/image.jpg'
    });

    const result = buildMetadataAssessment({
        artifact,
        metadata: createMetadata({
            gps: { latitude: 33.9001, longitude: 35.5001 },
            has_exif: true
        }),
        eventDetails: { lat: 33.8938, lon: 35.5018 }
    });

    assert.ok(!result.metadata_flags.includes('gps_far_from_event'));
    assert.ok(result.metadata_flags.includes('metadata_present_no_conflict'));
    assert.equal(result.metadata_warning, false);
});

test('GPS far from the event returns gps_far_from_event', () => {
    const artifact = createImageArtifact({
        sourceKind: 'upload',
        url: 'https://example.com/image.jpg'
    });

    const result = buildMetadataAssessment({
        artifact,
        metadata: createMetadata({
            gps: { latitude: 40.7128, longitude: -74.0060 },
            has_exif: true
        }),
        eventDetails: { lat: 33.8938, lon: 35.5018 }
    });

    assert.ok(result.metadata_flags.includes('gps_far_from_event'));
    assert.equal(result.metadata_warning, true);
});

test('editing software tag returns editing_software_tag', () => {
    const artifact = createImageArtifact({
        sourceKind: 'upload',
        url: 'https://example.com/image.jpg'
    });

    const result = buildMetadataAssessment({
        artifact,
        metadata: createMetadata({
            software: 'Adobe Photoshop',
            has_exif: true
        })
    });

    assert.ok(result.metadata_flags.includes('editing_software_tag'));
    assert.equal(result.metadata_warning, true);
});

test('capture time after tweet returns capture_time_conflict', () => {
    const artifact = createImageArtifact({
        sourceKind: 'twitter_url',
        url: 'https://example.com/image.jpg',
        context: { tweet_created_at: '2026-04-05T10:00:00.000Z' }
    });

    const result = buildMetadataAssessment({
        artifact,
        metadata: createMetadata({
            capture_time: '2026-04-05T10:05:00.000Z',
            has_exif: true
        })
    });

    assert.ok(result.metadata_flags.includes('capture_time_conflict'));
    assert.equal(result.metadata_warning, true);
});
