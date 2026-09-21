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
  const geocode = searchParams.get("geocode");

  // ── Place Details (by placeId) ─────────────────────────────
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
      console.warn("[places] Place Details status:", data.status, data.error_message);
      return NextResponse.json({ error: "Place details not found", apiStatus: data.status }, { status: 404 });
    } catch {
      return NextResponse.json({ error: "Failed to fetch place details" }, { status: 500 });
    }
  }

  // ── Geocode text search (returns actual lat/lng for a query) ──
  if (geocode) {
    // Strategy: try Google Geocoding API first, then Find Place From Text, then Nominatim
    // This ensures the search finds actual locations even if one API is not enabled.

    // 1. Google Geocoding API
    try {
      const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(geocode)}&region=in&key=${apiKey}`;
      const res = await fetch(geoUrl, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      if (data.status === "OK" && data.results?.[0]) {
        const result = data.results[0];
        const loc = result.geometry.location;
        return NextResponse.json({
          latitude: loc.lat,
          longitude: loc.lng,
          address: result.formatted_address,
        });
      }
      if (data.status !== "ZERO_RESULTS") {
        console.warn("[places] Geocoding status:", data.status, data.error_message);
      }
    } catch (e) {
      console.warn("[places] Geocoding fetch error:", e);
    }

    // 2. Google Find Place From Text API
    try {
      const fpUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(geocode)}&inputtype=textquery&fields=geometry,formatted_address,name&locationbias=circle:500000@22.5,78.9&key=${apiKey}`;
      const res = await fetch(fpUrl, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      if (data.status === "OK" && data.candidates?.[0]?.geometry?.location) {
        const candidate = data.candidates[0];
        return NextResponse.json({
          latitude: candidate.geometry.location.lat,
          longitude: candidate.geometry.location.lng,
          address: candidate.formatted_address || candidate.name || geocode,
        });
      }
    } catch (e) {
      console.warn("[places] Find Place fetch error:", e);
    }

    // 3. Nominatim (OpenStreetMap) as final fallback — no API key needed
    try {
      const nUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(geocode + ", India")}&limit=1&addressdetails=1`;
      const res = await fetch(nUrl, {
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": "Kirana-App/1.0" },
      });
      const data = await res.json();
      if (data?.[0]) {
        return NextResponse.json({
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon),
          address: data[0].display_name,
        });
      }
    } catch (e) {
      console.warn("[places] Nominatim fetch error:", e);
    }

    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  // ── Autocomplete predictions ───────────────────────────────
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
      if (data.status !== "ZERO_RESULTS") {
        console.warn("[places] Autocomplete status:", data.status, data.error_message);
      }
      return NextResponse.json({ predictions: [] });
    } catch {
      return NextResponse.json({ predictions: [] });
    }
  }

  return NextResponse.json({ error: "Provide input, placeId, or geocode" }, { status: 400 });
}

