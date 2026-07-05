import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { timestamp, name, calories, protein, fat, carbs, salt } = body;

    const keyStr = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    if (!keyStr || !spreadsheetId) {
      return NextResponse.json({ error: 'Google Sheets credentials not configured' }, { status: 500 });
    }

    let creds;
    try {
      creds = JSON.parse(keyStr);
    } catch (e) {
      return NextResponse.json({ error: 'Invalid GOOGLE_SERVICE_ACCOUNT_KEY JSON' }, { status: 500 });
    }

    const jwtClient = new google.auth.JWT(
      creds.client_email,
      undefined,
      creds.private_key,
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    await jwtClient.authorize();

    const sheets = google.sheets({ version: 'v4', auth: jwtClient });

    // Ensure header exists on Sheet1 (A1:G1)
    const headerRange = 'Sheet1!A1:G1';
    const headerRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: headerRange }).catch(() => null);
    const desiredHeader = ['timestamp', 'name', 'calories', 'protein', 'fat', 'carbs', 'salt'];

    const headerValues = headerRes?.data?.values?.[0];
    if (!headerValues || headerValues.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: headerRange,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [desiredHeader] },
      }).catch(() => {});
    }

    const values = [[timestamp, name, calories, protein, fat, carbs, salt]];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:G',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
