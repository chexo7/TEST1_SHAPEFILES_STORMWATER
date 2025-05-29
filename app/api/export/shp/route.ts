import { NextRequest, NextResponse } from 'next/server';
// shp-write is a CJS module, so use require or dynamic import if in strict ESM context.
// For Next.js API routes (Node.js environment), require should be fine.
const shpwrite = require('shp-write');

export async function POST(request: NextRequest) {
  try {
    const geojsonFeatureCollection = await request.json();

    if (!geojsonFeatureCollection || geojsonFeatureCollection.type !== 'FeatureCollection' || !Array.isArray(geojsonFeatureCollection.features)) {
      return NextResponse.json({ error: 'Invalid GeoJSON FeatureCollection provided.' }, { status: 400 });
    }

    // Ensure features have a properties object, even if empty, as shp-write expects it.
    // Also, ensure geometries are valid, particularly polygons.
    const processedFeatures = geojsonFeatureCollection.features.map((feature: any) => {
      if (!feature.geometry || !feature.geometry.type || !feature.geometry.coordinates) {
        // Basic geometry validation
        throw new Error(`Invalid feature geometry for feature ID: ${feature.properties?.ID || 'Unknown'}`);
      }
      // Ensure polygon coordinates are correctly structured (e.g., array of arrays for rings)
      if (feature.geometry.type === "Polygon" && feature.geometry.coordinates) {
        if (!Array.isArray(feature.geometry.coordinates) || 
            !feature.geometry.coordinates.every((ring: any) => Array.isArray(ring) && 
            ring.every((point: any) => Array.isArray(point) && point.length >= 2))) {
          throw new Error(`Invalid polygon coordinate structure for feature ID: ${feature.properties?.ID || 'Unknown'}`);
        }
      }

      return {
        ...feature,
        properties: feature.properties || {}, 
      };
    });

    const processedGeoJSON = {
      ...geojsonFeatureCollection,
      features: processedFeatures,
    };

    const options = {
      folder: 'hydrocad_subcatchments', // Folder name within the zip
      types: {
        // Define output file names (without .shp extension) for each geometry type
        polygon: 'subcatchments', // Output polygons as 'subcatchments.shp', etc.
        // point: 'mypoints', 
        // line: 'mylines',
      }
    };

    // shp-write's zip function expects a GeoJSON FeatureCollection object.
    // It returns an ArrayBuffer.
    const zipArrayBuffer = shpwrite.zip(processedGeoJSON, options);
    
    // Convert ArrayBuffer to Buffer for Next.js Response object compatibility
    const zipBuffer = Buffer.from(zipArrayBuffer);

    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', 'application/zip');
    responseHeaders.set('Content-Disposition', 'attachment; filename="hydrocad_gis.zip"');

    return new Response(zipBuffer, {
      status: 200,
      headers: responseHeaders,
    });

  } catch (error: any) {
    console.error('Error in SHP export API route:');
    if (error.message.includes("Invalid feature geometry") || error.message.includes("Invalid polygon coordinate structure")) {
        console.error('Specific error:', error.message);
        return NextResponse.json({ error: `Data validation error: ${error.message}` }, { status: 400 });
    }
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    return NextResponse.json({ error: 'Failed to generate SHP file.', details: error.message }, { status: 500 });
  }
}
