import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Maps API key not configured" },
      { status: 500 },
    );
  }

  const { searchParams } = request.nextUrl;
  const input = searchParams.get("input");
  const placeId = searchParams.get("placeId");

  if (placeId) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=geometry,formatted_address&key=${apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      if (data.status === "OK" && data.result?.geometry?.location) {
        return NextResponse.json({
          latitude: data.result.geometry.location.lat,
          longitude: data.result.geometry.location.lng,
          address: data.result.formatted_address,
        });
      }
      return NextResponse.json({ error: "Place details not found" }, { status: 404 });
    } catch {
      return NextResponse.json({ error: "Failed to fetch place details" }, { status: 500 });
    }
  }

  if (input) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&components=country:in&key=${apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      if (data.status === "OK" && Array.isArray(data.predictions)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const predictions = data.predictions.map((p: any) => ({
          placeId: p.place_id,
          description: p.description,
          mainText: p.structured_formatting?.main_text || p.description,
          secondaryText: p.structured_formatting?.secondary_text || "",
        }));
        return NextResponse.json({ predictions });
      }
      return NextResponse.json({ predictions: [] });
    } catch {
      return NextResponse.json({ predictions: [] });
    }
  }

  return NextResponse.json({ error: "Provide input or placeId" }, { status: 400 });
}
