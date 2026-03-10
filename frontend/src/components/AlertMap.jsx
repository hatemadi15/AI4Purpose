import { useEffect, useRef } from 'react';
import L from 'leaflet';

function AlertMap({ lat, lon, radius, severity = 'MEDIUM' }) {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);

    useEffect(() => {
        if (!mapRef.current) return;

        // Initialize map if not already done
        if (!mapInstance.current) {
            mapInstance.current = L.map(mapRef.current).setView([lat, lon], 10);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(mapInstance.current);
        } else {
            mapInstance.current.setView([lat, lon], 10);
        }

        // Clear existing layers
        mapInstance.current.eachLayer(layer => {
            if (layer instanceof L.Circle || layer instanceof L.Marker) {
                mapInstance.current.removeLayer(layer);
            }
        });

        // Severity multiplier
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

        // Add radius circles
        // Watch zone (outer)
        L.circle([lat, lon], {
            radius: watchRadius * 1000,
            color: '#eab308',
            fillColor: '#eab308',
            fillOpacity: 0.1,
            weight: 2,
            dashArray: '5, 5'
        }).addTo(mapInstance.current).bindPopup('Watch Zone');

        // Warning zone (middle)
        L.circle([lat, lon], {
            radius: warningRadius * 1000,
            color: '#f97316',
            fillColor: '#f97316',
            fillOpacity: 0.15,
            weight: 2,
            dashArray: '5, 5'
        }).addTo(mapInstance.current).bindPopup('Warning Zone');

        // Critical zone (inner)
        L.circle([lat, lon], {
            radius: criticalRadius * 1000,
            color: '#ef4444',
            fillColor: '#ef4444',
            fillOpacity: 0.2,
            weight: 2
        }).addTo(mapInstance.current).bindPopup('Critical Zone');

        // Add epicenter marker
        const epicenterIcon = L.divIcon({
            className: 'custom-marker',
            html: `
        <div style="
          width: 24px;
          height: 24px;
          background: #ef4444;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 0 10px rgba(239, 68, 68, 0.5);
          animation: pulse 2s infinite;
        "></div>
      `,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        L.marker([lat, lon], { icon: epicenterIcon })
            .addTo(mapInstance.current)
            .bindPopup(`
        <strong>Epicenter</strong><br>
        Lat: ${lat.toFixed(4)}<br>
        Lon: ${lon.toFixed(4)}
      `);

        // Fit bounds to show all circles
        mapInstance.current.fitBounds([
            [lat - (watchRadius / 111), lon - (watchRadius / 111)],
            [lat + (watchRadius / 111), lon + (watchRadius / 111)]
        ]);

        return () => {
            // Cleanup handled by React
        };
    }, [lat, lon, radius, severity]);

    return (
        <div
            ref={mapRef}
            className="w-full h-full min-h-[250px] rounded-xl"
            style={{ background: '#1e293b' }}
        />
    );
}

export default AlertMap;
