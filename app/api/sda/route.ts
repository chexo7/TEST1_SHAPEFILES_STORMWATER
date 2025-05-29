import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

function geojsonToWkt(geojson: any): string | null {
  if (geojson && geojson.geometry && geojson.geometry.type === 'Polygon' && geojson.geometry.coordinates && geojson.geometry.coordinates.length > 0) {
    const coords = geojson.geometry.coordinates[0]; // Exterior ring
    if (coords.length < 3) { // A polygon needs at least 3 distinct points + closing point, so coords array should have 4 points if closed
      console.error("Invalid polygon for WKT: not enough coordinates. Needs at least 3 distinct points.");
      // If the shape has just been drawn, it might not be closed by Leaflet.Draw yet in toGeoJSON()
      // However, for WKT, it must be closed.
      return null; 
    }
    
    // Ensure the polygon is closed for WKT
    const firstPoint = coords[0];
    const lastPoint = coords[coords.length - 1];
    let closedCoords = [...coords]; // Create a mutable copy
    if (firstPoint[0] !== lastPoint[0] || firstPoint[1] !== lastPoint[1]) {
      closedCoords.push(firstPoint); // Close the polygon
    }
    if (closedCoords.length < 4) { // After attempting to close, check again.
        console.error("Invalid polygon for WKT: not enough coordinates after closing. Needs at least 3 distinct points.");
        return null;
    }

    const wktCoords = closedCoords.map((p: number[]) => `${p[0]} ${p[1]}`).join(', ');
    return `POLYGON((${wktCoords}))`;
  }
  console.error("Invalid GeoJSON for WKT conversion:", geojson);
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const geojsonPolygon = await request.json();
    const wktPolygon = geojsonToWkt(geojsonPolygon);

    if (!wktPolygon) {
      return NextResponse.json({ error: 'Invalid GeoJSON polygon provided or failed to convert to WKT.' }, { status: 400 });
    }

    const sql = `
      SELECT mu.mukey, mu.muname, mu.hydgrp
      FROM mapunit mu
      WHERE mu.mupolygonkey IN (
          SELECT mupolygonkey
          FROM SDA_Get_Mupolygon_From_Geometry('EPSG:4326', '${wktPolygon}')
      )
    `;

    const sdaEndpoint = process.env.SDA_ENDPOINT;
    if (!sdaEndpoint) {
      console.error('SDA_ENDPOINT environment variable is not set.');
      return NextResponse.json({ error: 'SDA endpoint is not configured.' }, { status: 500 });
    }

    const sdaResponse = await axios.post(
      sdaEndpoint,
      {
        format: 'JSON+COLUMNHEADERS', // Data in JSON format with column headers as the first row
        query: sql,
      },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded', // SDA often expects form-urlencoded
        },
      }
    );
    
    const sdaData = sdaResponse.data;

    if (sdaData && sdaData.Table && sdaData.Table.length > 1) {
      const headers = sdaData.Table[0];
      const hydgrpIndex = headers.indexOf('hydgrp');

      if (hydgrpIndex === -1) {
        console.error('hydgrp column not found in SDA response:', sdaData.Table);
        return NextResponse.json({ error: 'Could not find hydgrp in SDA response.' }, { status: 500 });
      }
      
      const hydgrpValues = sdaData.Table.slice(1) // Skip header row
                                       .map((row: any[]) => row[hydgrpIndex])
                                       .filter((value: any) => value !== null && value !== undefined); // Filter out null/undefined

      return NextResponse.json({ hsgData: hydgrpValues.length > 0 ? hydgrpValues : [] }); // Return empty array if no valid HSG
    } else if (sdaData && sdaData.Table && sdaData.Table.length <= 1) {
      // This means headers might be present, but no data rows, or it's an empty table.
      return NextResponse.json({ hsgData: [], message: 'No soil data found for the given polygon.' });
    } else {
      console.error('Unexpected SDA response structure:', sdaData);
      return NextResponse.json({ error: 'Unexpected response structure from SDA service.' }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Error in SDA API route:');
    if (error.response) {
      // Axios error with response
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
      console.error('Data:', error.response.data);
    } else if (error.request) {
      // Axios error with no response (e.g. network error)
      console.error('Request data:', error.request);
    } else {
      // Other errors
      console.error('Error message:', error.message);
    }
    return NextResponse.json({ error: 'Failed to fetch soil data.', details: error.message }, { status: 500 });
  }
}
