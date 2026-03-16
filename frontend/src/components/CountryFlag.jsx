const SIZE_MAP = {
    sm: { width: 20, height: 15, oneX: 'w40', twoX: 'w80' },
    md: { width: 28, height: 21, oneX: 'w40', twoX: 'w80' },
    lg: { width: 40, height: 30, oneX: 'w80', twoX: 'w160' }
};

function CountryFlag({ code, name, size = 'md', className = '' }) {
    if (!code) return null;

    const config = SIZE_MAP[size] || SIZE_MAP.md;
    const normalizedCode = String(code).toLowerCase();
    const src = `https://flagcdn.com/${config.oneX}/${normalizedCode}.png`;
    const srcSet = `https://flagcdn.com/${config.oneX}/${normalizedCode}.png 1x, https://flagcdn.com/${config.twoX}/${normalizedCode}.png 2x`;

    return (
        <img
            src={src}
            srcSet={srcSet}
            width={config.width}
            height={config.height}
            loading="lazy"
            alt={`${name} flag`}
            className={`rounded-[3px] border border-white/10 object-cover shadow-sm ${className}`.trim()}
        />
    );
}

export default CountryFlag;
