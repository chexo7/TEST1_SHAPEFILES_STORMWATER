'use client';

import L from 'leaflet';
// Make sure to import GeoJSON from react-leaflet if you use the component
import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet'; 
import { useEffect, useState, ChangeEvent, useRef } from 'react'; // Added ChangeEvent, useRef
import shp from 'shpjs'; // Import shpjs

interface MapComponentProps {
  googleMapsApiKey?: string;
}

const MapComponent: React.FC<MapComponentProps> = ({ googleMapsApiKey }) => {
  const [isMounted, setIsMounted] = useState(false);
  const position: L.LatLngExpression = [51.505, -0.09]; // Default position: London
  const [geojsonData, setGeojsonData] = useState<any>(null); // State for GeoJSON
  const mapRef = useRef<L.Map | null>(null); // Ref to access map instance

  useEffect(() => {
    setIsMounted(true);
    // Attempt to fix icon path issues after component is mounted
    // This is a common workaround for Leaflet in Next.js/React
    (async () => {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: (await import('leaflet/dist/images/marker-icon-2x.png')).default.src,
        iconUrl: (await import('leaflet/dist/images/marker-icon.png')).default.src,
        shadowUrl: (await import('leaflet/dist/images/marker-shadow.png')).default.src,
      });
    })();
  }, []);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (e.target?.result instanceof ArrayBuffer) {
          try {
            const geojson = await shp.parseZip(e.target.result);
            setGeojsonData(geojson);
          } catch (error) {
            console.error("Error parsing shapefile:", error);
            alert("Error parsing shapefile. Make sure it's a valid .zip containing .shp and .dbf files.");
          }
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  if (!isMounted) {
    return null; // Don't render map on server
  }

  return (
    <div>
      <input type="file" accept=".zip" onChange={handleFileChange} />
      <MapContainer
        center={position}
        zoom={13}
        style={{ height: 'calc(100vh - 30px)', width: '100%' }} // Adjust height for input
        ref={mapRef} // Use ref prop for MapContainer
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {/* Render GeoJSON data if available */}
        {geojsonData && <GeoJSON data={geojsonData} />}
        <Marker position={position}>
          <Popup>
            A pretty CSS3 popup. <br /> Easily customizable.
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
};

export default MapComponent;
