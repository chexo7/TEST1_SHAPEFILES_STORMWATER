import { NextRequest, NextResponse } from 'next/server';
import { Parser } from 'json2csv';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const subcatchments = body.subcatchments; 

    if (!subcatchments || !Array.isArray(subcatchments)) {
      return NextResponse.json({ error: 'Subcatchment data is missing or not an array.' }, { status: 400 });
    }

    // Define fields for the CSV output
    const fields = [
      { label: 'Subcatchment', value: 'Subcatchment' },
      { label: 'Area (ac)', value: 'Area_ac' },
      { label: 'Curve Number', value: 'CurveNumber' },
      { label: 'Tc (min)', value: 'Tc_min' },
      { label: 'Description', value: 'Description' },
      { label: 'Slope (%)', value: 'Slope_percent' }
    ];
    
    // Process subcatchments to ensure all fields are present, using defaults if necessary
    const processedSubcatchments = subcatchments.map((sub, index) => ({
      Subcatchment: sub.id || `Sub-${index + 1}`,
      Area_ac: sub.area || 0, 
      CurveNumber: sub.cn || 0, // Placeholder, to be updated when CN logic is in place
      Tc_min: sub.tc || 0,      // Placeholder, to be updated when Tc logic is in place
      Description: sub.description || `Generated Feature ${sub.id || index + 1}`, 
      Slope_percent: sub.slope || 0, // Placeholder, to be updated when slope logic is in place
    }));

    const parser = new Parser({ fields, header: true }); // header:true is default but explicit
    const csv = parser.parse(processedSubcatchments);

    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', 'text/csv');
    responseHeaders.set('Content-Disposition', 'attachment; filename="subcatchments.csv"');

    return new Response(csv, {
      status: 200,
      headers: responseHeaders,
    });

  } catch (error: any) {
    console.error('Error in CSV export API route:', error.message);
    let errorMessage = 'Failed to generate CSV file.';
    if (error instanceof SyntaxError && error.message.includes("JSON")) {
        errorMessage = "Invalid JSON data received in the request body.";
    } else if (error.message) {
        errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage, details: error.message }, { status: 500 });
  }
}
