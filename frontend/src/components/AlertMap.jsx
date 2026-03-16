import { useEffect, useRef } from 'react';
import L from 'leaflet';

function AlertMap({ lat, lon, radius, severity = 'MEDIUM' }) {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);

    useEffect(() => {
        if (!mapRef.current) return;

        if (!mapInstance.current) {
            mapInstance.current = L.map(mapRef.current, {
                zoomControl: true
            }).setView([lat, lon], 10);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors',
                maxZoom: 20
            }).addTo(mapInstance.current);
        } else {
            mapInstance.current.setView([lat, lon], 10);
        }

        mapInstance.current.eachLayer((layer) => {
            if (layer instanceof L.Circle || layer instanceof L.Marker) {
                mapInstance.current.removeLayer(layer);
            }
        });

        const multiplier = {
            LOW: 1.0,
            MEDIUM: 1.5,
            HIGH: 2.0,
            CRITICAL: 2.5
        }[severity] || 1.5;

        const adjustedRadius = radius * multiplier;
        const criticalRadius = adjustedRadius / 3;
        const warningRadius = (adjustedRadius / 3) * 2;
        const watchRadius = adjustedRadius;

        L.circle([lat, lon], {
            radius: watchRadius * 1000,
            color: '#d3b15d',
            fillColor: '#d3b15d',
            fillOpacity: 0.08,
            weight: 1.5,
            dashArray: '5 5'
        }).addTo(mapInstance.current).bindPopup('Watch zone');

        L.circle([lat, lon], {
            radius: warningRadius * 1000,
            color: '#d98a54',
            fillColor: '#d98a54',
            fillOpacity: 0.12,
            weight: 1.5,
            dashArray: '4 4'
        }).addTo(mapInstance.current).bindPopup('Warning zone');

        L.circle([lat, lon], {
            radius: criticalRadius * 1000,
            color: '#d96666',
            fillColor: '#d96666',
            fillOpacity: 0.16,
            weight: 2
        }).addTo(mapInstance.current).bindPopup('Critical zone');

        const epicenterIcon = L.divIcon({
            className: 'custom-marker',
            html: `
                <div style="
                    width: 18px;
                    height: 18px;
                    border-radius: 999px;
                    background: #6fd6df;
                    border: 3px solid rgba(5, 8, 13, 0.95);
                    box-shadow: 0 0 0 4px rgba(111, 214, 223, 0.18);
                "></div>
            `,
            iconSize: [18, 18],
            iconAnchor: [9, 9]
        });

        L.marker([lat, lon], { icon: epicenterIcon })
            .addTo(mapInstance.current)
            .bindPopup(`
                <strong>Incident center</strong><br>
                Lat: ${lat.toFixed(4)}<br>
                Lon: ${lon.toFixed(4)}
            `);

        mapInstance.current.fitBounds([
            [lat - (watchRadius / 111), lon - (watchRadius / 111)],
            [lat + (watchRadius / 111), lon + (watchRadius / 111)]
        ]);
    }, [lat, lon, radius, severity]);

    useEffect(() => (
        () => {
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        }
    ), []);

    return (
        <div
            ref={mapRef}
            className="h-full min-h-[280px] w-full rounded-2xl"
        />
    );
}

export default AlertMap;
