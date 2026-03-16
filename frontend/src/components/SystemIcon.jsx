function iconMarkup(name) {
    switch (name) {
        case 'command':
            return (
                <>
                    <path d="M4 7h16" />
                    <path d="M4 12h10" />
                    <path d="M4 17h7" />
                    <path d="m16 12 4 4-4 4" />
                </>
            );
        case 'monitor':
            return (
                <>
                    <rect x="3" y="4" width="18" height="13" rx="2" />
                    <path d="M8 20h8" />
                    <path d="M12 17v3" />
                </>
            );
        case 'queue':
            return (
                <>
                    <rect x="4" y="5" width="16" height="4" rx="1" />
                    <rect x="4" y="11" width="11" height="4" rx="1" />
                    <rect x="4" y="17" width="8" height="2" rx="1" />
                </>
            );
        case 'feed':
            return (
                <>
                    <path d="M5 18a13 13 0 0 1 13-13" />
                    <path d="M5 12a7 7 0 0 1 7-7" />
                    <path d="M5 6h.01" />
                    <circle cx="6" cy="18" r="1.5" />
                </>
            );
        case 'search':
            return (
                <>
                    <circle cx="11" cy="11" r="6" />
                    <path d="m20 20-4.2-4.2" />
                </>
            );
        case 'plus':
            return (
                <>
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                </>
            );
        case 'bell':
            return (
                <>
                    <path d="M8 18h8" />
                    <path d="M10 21h4" />
                    <path d="M6 18V11a6 6 0 1 1 12 0v7" />
                </>
            );
        case 'mobile':
            return (
                <>
                    <rect x="7" y="3" width="10" height="18" rx="2" />
                    <path d="M10 6h4" />
                    <path d="M11.5 17h1" />
                </>
            );
        case 'map':
            return (
                <>
                    <path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2z" />
                    <path d="M9 4v14" />
                    <path d="M15 6v14" />
                </>
            );
        case 'pin':
            return (
                <>
                    <path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z" />
                    <circle cx="12" cy="10" r="2.5" />
                </>
            );
        case 'link':
            return (
                <>
                    <path d="M10 14 7 17a3 3 0 0 1-4-4l3-3" />
                    <path d="m14 10 3-3a3 3 0 1 1 4 4l-3 3" />
                    <path d="M9 15 15 9" />
                </>
            );
        case 'news':
            return (
                <>
                    <rect x="4" y="5" width="16" height="14" rx="2" />
                    <path d="M8 9h8" />
                    <path d="M8 13h8" />
                    <path d="M8 17h5" />
                </>
            );
        case 'social':
            return (
                <>
                    <path d="M18 8a4 4 0 0 0-3-2 6 6 0 0 1-4 4 5 5 0 0 1-5 5" />
                    <path d="M6 18c5 0 8-3 8-8v-1l2-2" />
                    <path d="M8 6c1 1 2 1 3 1" />
                </>
            );
        case 'science':
            return (
                <>
                    <path d="M10 3v4l-4 7a4 4 0 0 0 3.5 6h5A4 4 0 0 0 18 14l-4-7V3" />
                    <path d="M9 11h6" />
                </>
            );
        case 'globe':
            return (
                <>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18" />
                    <path d="M12 3a14 14 0 0 1 0 18" />
                    <path d="M12 3a14 14 0 0 0 0 18" />
                </>
            );
        case 'database':
            return (
                <>
                    <ellipse cx="12" cy="6" rx="7" ry="3" />
                    <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
                    <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
                </>
            );
        case 'check':
            return (
                <>
                    <path d="m5 13 4 4L19 7" />
                </>
            );
        case 'x':
            return (
                <>
                    <path d="M6 6 18 18" />
                    <path d="m18 6-12 12" />
                </>
            );
        case 'clock':
            return (
                <>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                </>
            );
        case 'users':
            return (
                <>
                    <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="10" cy="8" r="3" />
                    <path d="M20 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 5.13a3 3 0 0 1 0 5.74" />
                </>
            );
        case 'chevron':
            return (
                <>
                    <path d="m6 9 6 6 6-6" />
                </>
            );
        case 'alert':
            return (
                <>
                    <path d="m12 3 9 16H3z" />
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                </>
            );
        case 'target':
            return (
                <>
                    <circle cx="12" cy="12" r="8" />
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v3" />
                    <path d="M12 19v3" />
                    <path d="M2 12h3" />
                    <path d="M19 12h3" />
                </>
            );
        case 'layers':
            return (
                <>
                    <path d="m12 4 8 4-8 4-8-4 8-4Z" />
                    <path d="m4 12 8 4 8-4" />
                    <path d="m4 16 8 4 8-4" />
                </>
            );
        case 'language':
            return (
                <>
                    <path d="M4 6h10" />
                    <path d="M9 6a16 16 0 0 1-4 11" />
                    <path d="M7 11h4" />
                    <path d="M15 18h6" />
                    <path d="m18 6 3 12" />
                    <path d="m21 6-3 12" />
                </>
            );
        case 'signal':
            return (
                <>
                    <path d="M5 19h2" />
                    <path d="M9 15h2" />
                    <path d="M13 11h2" />
                    <path d="M17 7h2" />
                    <path d="M6 19V9" />
                    <path d="M10 15V7" />
                    <path d="M14 11V5" />
                    <path d="M18 7V3" />
                </>
            );
        case 'document':
            return (
                <>
                    <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
                    <path d="M14 3v6h6" />
                </>
            );
        case 'scan':
            return (
                <>
                    <path d="M4 7V4h3" />
                    <path d="M20 7V4h-3" />
                    <path d="M4 17v3h3" />
                    <path d="M20 17v3h-3" />
                    <path d="M6 12h12" />
                </>
            );
        case 'send':
            return (
                <>
                    <path d="M22 2 11 13" />
                    <path d="m22 2-7 20-4-9-9-4Z" />
                </>
            );
        case 'radar':
            return (
                <>
                    <circle cx="12" cy="12" r="8" />
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 4v8l5 5" />
                </>
            );
        default:
            return (
                <>
                    <circle cx="12" cy="12" r="8" />
                    <path d="M12 8v4" />
                    <path d="M12 16h.01" />
                </>
            );
    }
}

function SystemIcon({ name, className = '', strokeWidth = 1.8 }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            {iconMarkup(name)}
        </svg>
    );
}

export default SystemIcon;
