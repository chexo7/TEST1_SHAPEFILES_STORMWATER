'use client';

import { useEffect } from 'react';
import { MapContainer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import L from 'leaflet';
import 'leaflet.gridlayer.googlemutant'; // For side effects

// Fix for default icon issue with Webpack
delete (L.Icon.Default.prototype as any)._getIconUrl; // eslint-disable-line @typescript-eslint/no-explicit-any

L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Helper component to manage map layers via useEffect
function MapLayerManager() {
  const map = useMap();

  useEffect(() => {
    // Clear existing tile/grid layers to avoid duplicates
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer || layer instanceof L.GridLayer) { 
        try {
          map.removeLayer(layer);
        } catch (e) {
          console.error("Failed to remove layer:", layer, e);
        }
      }
    });

    if (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
      const googleLayer = L.gridLayer.googleMutant({
        type: 'satellite', // Or 'roadmap', 'terrain'
        // apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, // Removed due to TypeScript error
      });
      googleLayer.addTo(map);
    } else {
      const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      });
      osmLayer.addTo(map);
    }
  }, [map]); // Only map is a dependency, API key is constant post-build.

  return null; // This component does not render anything itself
}

export default function Map() {
  const position: L.LatLngTuple = [51.505, -0.09]; // Default position (London)

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <MapContainer center={position} zoom={13} style={{ height: '100%', width: '100%' }}>
        <MapLayerManager />
        <Marker position={position}>
          <Popup>
            A pretty CSS3 popup. <br /> Easily customizable.
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
