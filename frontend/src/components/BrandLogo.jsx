const sizeClasses = {
    sm: 'h-10 w-auto max-w-[200px]',
    md: 'h-12 w-auto max-w-[260px]',
    lg: 'h-20 w-auto max-w-[460px]'
};

function BrandLogo({
    size = 'md',
    className = '',
    subtitle,
    src = '/tanbih-logo.jpeg'
}) {
    return (
        <div className={className}>
            <img
                src={src}
                alt="TANBIH logo"
                className={`${sizeClasses[size] || sizeClasses.md} object-contain`}
            />
        </div>
    );
}

export default BrandLogo;
