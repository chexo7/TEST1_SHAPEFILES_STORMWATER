'use client';

import L, { LatLngExpression } from 'leaflet';
import 'leaflet-draw'; 
import { MapContainer, Marker, Popup, GeoJSON } from 'react-leaflet';
import { useEffect, useState, ChangeEvent, useRef } from 'react';
import shp from 'shpjs';
import * as turf from '@turf/turf';
import cnLookupData from '@/data/cn-lookup.json';

interface MapComponentProps {
  googleMapsApiKey?: string;
}

const MapComponent: React.FC<MapComponentProps> = ({ googleMapsApiKey }) => {
  const [isMounted, setIsMounted] = useState(false);
  const position: LatLngExpression = [51.505, -0.09];
  const [geojsonData, setGeojsonData] = useState<any>(null); 
  const mapRef = useRef<L.Map | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const [drawnFeatures, setDrawnFeatures] = useState<any[]>([]); 

  useEffect(() => {
    setIsMounted(true);
    (async () => {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: (await import('leaflet/dist/images/marker-icon-2x.png')).default.src,
        iconUrl: (await import('leaflet/dist/images/marker-icon.png')).default.src,
        shadowUrl: (await import('leaflet/dist/images/marker-shadow.png')).default.src,
      });
    })();
  }, []);

  useEffect(() => {
    if (!isMounted || !mapRef.current) return;
    require('leaflet.gridlayer.googlemutant');
    if (L.gridLayer && (L.gridLayer as any).googleMutant) {
      const googleLayer = (L.gridLayer as any).googleMutant({ type: 'satellite', maxZoom: 22 });
      mapRef.current.addLayer(googleLayer);
      return () => {
        if (mapRef.current && mapRef.current.hasLayer(googleLayer)) {
          mapRef.current.removeLayer(googleLayer);
        }
      };
    } else { console.error("Leaflet GoogleMutant plugin not loaded."); }
  }, [isMounted, mapRef]);

  useEffect(() => {
    if (!isMounted || !mapRef.current || !L.Control.Draw) {
      console.error("Leaflet Draw not available or map not ready.");
      return;
    }
    
    drawnItemsRef.current = new L.FeatureGroup();
    mapRef.current.addLayer(drawnItemsRef.current);

    const drawControl = new L.Control.Draw({
      edit: { featureGroup: drawnItemsRef.current },
      draw: { /* ... draw options ... */ 
        polygon: { allowIntersection: false, shapeOptions: { color: '#e65c00' } },
        rectangle: { shapeOptions: { color: '#e6b800' } },
        polyline: false, circle: false, marker: false, circlemarker: false,
      },
    });
    mapRef.current.addControl(drawControl);

    const onDrawCreated = (event: any) => { /* ... existing onDrawCreated ... */ 
      const { layer } = event;
      drawnItemsRef.current?.addLayer(layer);
      const geojson = layer.toGeoJSON();
      if (!layer.options.customProps) layer.options.customProps = {};

      let areaPopupContent = "Calculating area...";
      if (geojson.geometry.type === 'Polygon') {
        try {
          const polyArea = turf.area(geojson as turf.Feature<turf.Polygon>);
          areaPopupContent = `Area: ${polyArea.toFixed(2)} sq meters.`;
          layer.options.customProps.areaSqMeters = polyArea; 
        } catch(e) { areaPopupContent = `Could not calculate area.`; }
      } else { areaPopupContent = `Shape drawn. Not a polygon.`; }
      layer.bindPopup(`${areaPopupContent} Fetching HSG...`).openPopup();

      if (geojson.geometry.type === 'Polygon') {
        fetch('/api/sda', { /* ... SDA fetch ... */ 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geojson),
        })
        .then(res => res.ok ? res.json() : res.json().then(err => Promise.reject(err)))
        .then(data => {
          let hsgDisplay = "HSG: Error fetching.";
          if (data.error) { hsgDisplay = `HSG Error: ${data.error}`; }
          else if (data.hsgData && data.hsgData.length > 0) {
            const primaryHsg = data.hsgData[0];
            layer.options.customProps.hsg = primaryHsg;
            hsgDisplay = `HSG: ${primaryHsg}.`;
          } else { hsgDisplay = `HSG: Not found.`; }
          layer.setPopupContent(`${areaPopupContent} ${hsgDisplay} (Land use/CN deferred)`);
        })
        .catch(err => layer.setPopupContent(`${areaPopupContent} HSG: Request failed.`));
      } else { layer.setPopupContent(`${areaPopupContent} (HSG query skipped)`); }
      setDrawnFeatures(prev => [...prev, geojson]);
    };
    const onDrawEdited = (event: any) => { /* ... existing onDrawEdited ... */ 
        event.layers.eachLayer((layer: any) => {
            if (!layer.options.customProps) layer.options.customProps = {};
            const editedGeojson = layer.toGeoJSON();
            // Simplified state update
            setDrawnFeatures(prev => {
                const updatedFeatures: any[] = [];
                drawnItemsRef.current?.getLayers().forEach(l => updatedFeatures.push(l.toGeoJSON()));
                return updatedFeatures;
            });
            if (editedGeojson.geometry.type === 'Polygon') {
              try {
                const polyArea = turf.area(editedGeojson as turf.Feature<turf.Polygon>);
                layer.options.customProps.areaSqMeters = polyArea;
                let hsgText = layer.options.customProps.hsg ? `HSG: ${layer.options.customProps.hsg}.` : "HSG not fetched.";
                layer.bindPopup(`Area: ${polyArea.toFixed(2)} sq m (edited). ${hsgText} (Land use/CN update deferred)`).openPopup();
              } catch(e) { console.error("Error re-calculating area:", e); }
            }
          });
    };
    const onDrawDeleted = (event: any) => { /* ... existing onDrawDeleted ... */ 
        setDrawnFeatures(prev => {
            const remainingFeatures: any[] = [];
            drawnItemsRef.current?.getLayers().forEach(l => {
                if (!Object.values(event.layers._layers).find(delLayer => (delLayer as any)._leaflet_id === (l as any)._leaflet_id)) {
                     remainingFeatures.push(l.toGeoJSON());
                }
            });
            return remainingFeatures;
          });
    };

    mapRef.current.on(L.Draw.Event.CREATED, onDrawCreated);
    mapRef.current.on(L.Draw.Event.EDITED, onDrawEdited);
    mapRef.current.on(L.Draw.Event.DELETED, onDrawDeleted);

    return () => { /* ... cleanup ... */ 
        if (mapRef.current) {
            mapRef.current.off(L.Draw.Event.CREATED, onDrawCreated);
            mapRef.current.off(L.Draw.Event.EDITED, onDrawEdited);
            mapRef.current.off(L.Draw.Event.DELETED, onDrawDeleted);
            if (drawnItemsRef.current) mapRef.current.removeLayer(drawnItemsRef.current);
          }
    };
  }, [isMounted, mapRef]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => { /* ... existing ... */ 
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (e.target?.result instanceof ArrayBuffer) {
          const arrayBuffer = e.target.result;
          try {
            let geojsonFromFile;
            if (file.name.toLowerCase().endsWith('.zip')) geojsonFromFile = await shp.parseZip(arrayBuffer);
            else if (file.name.toLowerCase().endsWith('.shp')) {
              geojsonFromFile = await shp(arrayBuffer);
              alert("Parsing .shp only. Attributes might be missing. Use .zip for full data.");
            } else { alert("Unsupported file type."); return; }
            setGeojsonData(geojsonFromFile);
          } catch (error) { alert("Error parsing shapefile."); }
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleExportCSV = async () => { /* ... existing ... */ 
    if (!drawnItemsRef.current) { alert("No drawn items."); return; }
    const layers = drawnItemsRef.current.getLayers();
    if (layers.length === 0) { alert("No sub-catchments to export."); return; }

    const subcatchmentsData = layers.map((layer: any, index: number) => {
      const areaSqMeters = layer.options.customProps?.areaSqMeters || 0;
      const areaAcres = areaSqMeters * 0.000247105;
      return {
        id: layer._leaflet_id || `Sub-${index + 1}`, area: areaAcres.toFixed(2),
        cn: layer.options.customProps?.cn || 0, tc: layer.options.customProps?.tc || 0,
        description: layer.options.customProps?.description || `Drawn Feature ${layer._leaflet_id || index + 1}`,
        slope: layer.options.customProps?.slope || 0, hsg: layer.options.customProps?.hsg || "N/A",
      };
    });
    try {
      const response = await fetch('/api/export/csv', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subcatchments: subcatchmentsData }),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Export failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'subcatchments.csv'; document.body.appendChild(a);
      a.click(); window.URL.revokeObjectURL(url); a.remove();
    } catch (error: any) { alert(`Export CSV failed: ${error.message}`); }
  };

  const handleExportSHP = async () => {
    if (!drawnItemsRef.current) { alert("No drawn items layer found."); return; }
    const layers = drawnItemsRef.current.getLayers();
    if (layers.length === 0) { alert("No sub-catchments to export."); return; }

    const features = layers.map((layer: any, index: number) => {
      const geojsonFeature = layer.toGeoJSON(); // This is already a GeoJSON Feature object
      const areaSqMeters = layer.options.customProps?.areaSqMeters || 0;
      const areaAcres = areaSqMeters * 0.000247105;

      // Ensure geometry is present and valid, especially for polygons
      let geometry = geojsonFeature.geometry;
      if (geometry.type === 'Polygon' && geometry.coordinates) {
          // shp-write expects specific structure, ensure Leaflet's output matches
          // For simple polygons, Leaflet toGeoJSON() output is usually correct: [[ [lng, lat], ... ]]
      } else if (geometry.type === 'MultiPolygon' && geometry.coordinates) {
          // Also usually correct
      } else {
          // Handle or filter out non-polygonal or invalid geometries if necessary
          console.warn(`Layer ${layer._leaflet_id} is not a valid polygon/multipolygon for SHP export.`);
          // geometry = null; // Or skip this feature
      }
      
      return {
        type: 'Feature',
        geometry: geometry, // Use the geometry from layer.toGeoJSON()
        properties: {
          ID: String(layer._leaflet_id || `Sub-${index + 1}`), // Ensure ID is a string
          Area_sqm: parseFloat(areaSqMeters.toFixed(2)),
          Area_ac: parseFloat(areaAcres.toFixed(2)),
          HSG: String(layer.options.customProps?.hsg || 'N/A'),
          CN: parseInt(String(layer.options.customProps?.cn || 0), 10),
          Tc_min: parseFloat(String(layer.options.customProps?.tc || 0)),
          Desc: String(layer.options.customProps?.description || `Feature ${layer._leaflet_id || index + 1}`),
        }
      };
    }).filter(feature => feature.geometry); // Filter out features that had null geometry

    if (features.length === 0) {
        alert("No valid polygonal features to export.");
        return;
    }

    const featureCollection = { type: 'FeatureCollection', features: features };

    try {
      const response = await fetch('/api/export/shp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(featureCollection),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown SHP export error."}));
        throw new Error(errorData.error || `Failed to export SHP: ${response.statusText}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'hydrocad_gis.zip'; document.body.appendChild(a);
      a.click(); window.URL.revokeObjectURL(url); a.remove();
    } catch (error: any) {
      console.error("Export SHP failed:", error);
      alert(`Export SHP failed: ${error.message}`);
    }
  };

  if (!isMounted) { return null; }

  return (
    <div>
      <input type="file" accept=".zip,.shp" onChange={handleFileChange} style={{ marginBottom: '10px' }} />
      <button onClick={handleExportCSV} style={{ marginBottom: '10px', marginRight: '5px', display: 'inline-block' }}>Export to CSV</button>
      <button onClick={handleExportSHP} style={{ marginBottom: '10px', display: 'inline-block' }}>Export to SHP (GIS)</button>
      <MapContainer
        center={position}
        zoom={13}
        style={{ height: 'calc(100vh - 70px)', width: '100%' }}
        whenCreated={mapInstance => { mapRef.current = mapInstance; }}
      >
        {geojsonData && <GeoJSON data={geojsonData} />}
        <Marker position={position}><Popup>Base Location</Popup></Marker>
      </MapContainer>
    </div>
  );
};

export default MapComponent;
