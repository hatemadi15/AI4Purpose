import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./AlertMap', () => ({
    default: () => null
}));

import { MediaAnalysisCard } from './AlertReviewPanel.jsx';

describe('MediaAnalysisCard', () => {
    it('renders metadata-present media without warning state', () => {
        render(
            <MediaAnalysisCard
                mediaAnalysis={{
                    analyzed: true,
                    summary: {
                        total_analyzed: 1,
                        high_value_evidence: 1,
                        metadata_available_count: 1,
                        metadata_warning_count: 0,
                        reverse_search_performed_count: 0,
                        reverse_search_warning_count: 0
                    },
                    images: [{
                        url: 'https://example.com/image.jpg',
                        evidence_type: 'damage',
                        verification_value: 'high',
                        description: 'Damaged building exterior',
                        metadata: {
                            capture_time: '2026-04-05T09:10:00.000Z',
                            gps: { latitude: 33.8938, longitude: 35.5018, distance_km_to_event: 0.2 },
                            device_make: 'Google',
                            device_model: 'Pixel 8',
                            software: null,
                            width: 1200,
                            height: 900,
                            mime_type: 'image/jpeg'
                        },
                        metadata_flags: ['metadata_present_no_conflict'],
                        metadata_notes: ['Available metadata does not show an obvious time or location conflict.'],
                        context: {
                            username: 'trustedreporter',
                            tweet_created_at: '2026-04-05T09:15:00.000Z',
                            is_trusted: true
                        }
                    }]
                }}
            />
        );

        expect(screen.getByText('No metadata conflict')).toBeInTheDocument();
        expect(screen.getByText(/Metadata available on 1 image\.\s+Warnings found on 0 images\.\s+Reverse search ran on 0 images and flagged 0 as possibly older\./)).toBeInTheDocument();
        expect(screen.getByText(/Damaged building exterior/)).toBeInTheDocument();
        expect(screen.getByText(/Trusted account/)).toBeInTheDocument();
        expect(screen.getByText(/Google Pixel 8/)).toBeInTheDocument();
    });

    it('renders neutral messaging for stripped social-copy metadata', () => {
        render(
            <MediaAnalysisCard
                mediaAnalysis={{
                    analyzed: true,
                    summary: {
                        total_analyzed: 1,
                        high_value_evidence: 0,
                        metadata_available_count: 0,
                        metadata_warning_count: 0,
                        reverse_search_performed_count: 1,
                        reverse_search_warning_count: 0
                    },
                    images: [{
                        url: 'https://example.com/social.jpg',
                        evidence_type: 'smoke',
                        verification_value: 'medium',
                        description: 'Smoke plume over skyline',
                        metadata: {
                            mime_type: 'image/jpeg'
                        },
                        metadata_flags: ['social_copy_metadata_missing'],
                        metadata_notes: ['Metadata unavailable on social copy; this is common for Twitter/X images.'],
                        reverse_image_search: {
                            performed: true,
                            status: 'searched',
                            likely_old: false,
                            confidence: 'medium',
                            summary: 'No earlier use was found in the sources checked.',
                            earliest_known_use: null,
                            matches: [],
                            notes: ['Reverse image search did not find an older publication.']
                        },
                        context: {
                            username: 'citizenreport',
                            tweet_created_at: '2026-04-05T09:20:00.000Z',
                            is_trusted: false
                        }
                    }]
                }}
            />
        );

        expect(screen.getByText('Social copy metadata unavailable')).toBeInTheDocument();
        expect(screen.getByText('No older match found')).toBeInTheDocument();
        expect(screen.getByText('Metadata stripped on social copy')).toBeInTheDocument();
        expect(screen.getByText(/Metadata unavailable on social copy/)).toBeInTheDocument();
        expect(screen.getByText(/No earlier use was found in the sources checked/)).toBeInTheDocument();
    });

    it('renders conflict flags when metadata warnings are present', () => {
        render(
            <MediaAnalysisCard
                mediaAnalysis={{
                    analyzed: true,
                    summary: {
                        total_analyzed: 1,
                        high_value_evidence: 0,
                        metadata_available_count: 1,
                        metadata_warning_count: 1,
                        reverse_search_performed_count: 1,
                        reverse_search_warning_count: 1
                    },
                    images: [{
                        url: 'https://example.com/conflict.jpg',
                        evidence_type: 'aftermath',
                        verification_value: 'low',
                        description: 'Street scene after incident',
                        metadata: {
                            capture_time: '2026-04-08T11:00:00.000Z',
                            software: 'Adobe Photoshop',
                            mime_type: 'image/jpeg'
                        },
                        metadata_flags: ['capture_time_conflict', 'editing_software_tag'],
                        metadata_notes: [
                            'Capture time conflicts with the source tweet timing.',
                            'Metadata references editing software: Adobe Photoshop.'
                        ],
                        reverse_image_search: {
                            performed: true,
                            status: 'searched',
                            likely_old: true,
                            confidence: 'high',
                            summary: 'The image appears in archived reporting from 2024.',
                            earliest_known_use: '2024-10-12T08:00:00.000Z',
                            matches: [{
                                title: 'Archived article',
                                url: 'https://example.com/archive',
                                published_at: '2024-10-12T08:00:00.000Z',
                                reason: 'Same building facade and smoke pattern.'
                            }],
                            notes: ['Earlier reporting predates the claimed incident.']
                        },
                        context: {
                            username: 'eyewitness',
                            tweet_created_at: '2026-04-05T09:20:00.000Z',
                            is_trusted: false
                        }
                    }]
                }}
            />
        );

        expect(screen.getByText('Metadata warning')).toBeInTheDocument();
        expect(screen.getByText('Possible older image')).toBeInTheDocument();
        expect(screen.getByText('Capture time conflict')).toBeInTheDocument();
        expect(screen.getByText('Editing software tag')).toBeInTheDocument();
        expect(screen.getByText(/Capture time conflicts with the source tweet timing/)).toBeInTheDocument();
        expect(screen.getByText(/The image appears in archived reporting from 2024/)).toBeInTheDocument();
        expect(screen.getByText(/Earlier reporting predates the claimed incident/)).toBeInTheDocument();
        expect(screen.getByText(/Archived article/)).toBeInTheDocument();
        expect(screen.getAllByText(/Adobe Photoshop/)).toHaveLength(2);
    });
});
