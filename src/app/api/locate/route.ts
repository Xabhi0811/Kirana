import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  const clientIp = forwarded
    ? forwarded.split(",")[0].trim()
    : request.headers.get("x-real-ip");
  const isLocal =
    !clientIp ||
    clientIp === "127.0.0.1" ||
    clientIp === "::1" ||
    clientIp.startsWith("192.168.") ||
    clientIp.startsWith("10.");

  let geo: {
    latitude: number;
    longitude: number;
    city: string;
    region: string;
    country: string;
    address: string;
  } | null = null;

  // 1. Try ipwho.is (works with IPv4 & IPv6)
  try {
    const url = isLocal ? "https://ipwho.is/" : `https://ipwho.is/${clientIp}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    if (data && (data.success || data.latitude)) {
      geo = {
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        city: data.city || "",
        region: data.region || "",
        country: data.country || "India",
        address: [data.city, data.region, data.country].filter(Boolean).join(", "),
      };
    }
  } catch {
    // Fallback
  }

  // 2. Try freeipapi.com
  if (!geo) {
    try {
      const url = isLocal
        ? "https://freeipapi.com/api/json"
        : `https://freeipapi.com/api/json/${clientIp}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      const data = await res.json();
      if (data && data.latitude) {
        geo = {
          latitude: Number(data.latitude),
          longitude: Number(data.longitude),
          city: data.cityName || "",
          region: data.regionName || "",
          country: data.countryName || "India",
          address: [data.cityName, data.regionName, data.countryName]
            .filter(Boolean)
            .join(", "),
        };
      }
    } catch {
      // Fallback
    }
  }

  // 3. Try ip-api.com
  if (!geo) {
    try {
      const url = isLocal
        ? "http://ip-api.com/json"
        : `http://ip-api.com/json/${clientIp}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      const data = await res.json();
      if (data && data.status === "success") {
        geo = {
          latitude: Number(data.lat),
          longitude: Number(data.lon),
          city: data.city || "",
          region: data.regionName || "",
          country: data.country || "India",
          address: [data.city, data.regionName, data.country]
            .filter(Boolean)
            .join(", "),
        };
      }
    } catch {
      // Fallback
    }
  }

  if (geo) {
    // If the detected IP is in Madhya Pradesh / Indore gateway or local dev,
    // the user is located in Gwalior (ISP routes all MP traffic through Indore).
    if (
      geo.city === "Indore" ||
      geo.region === "Madhya Pradesh" ||
      isLocal ||
      process.env.DEFAULT_CITY === "Gwalior"
    ) {
      geo = {
        latitude: 26.2124,
        longitude: 78.1772,
        city: "Gwalior",
        region: "Madhya Pradesh",
        country: "India",
        address: "City Center, Gwalior, Madhya Pradesh 474011, India",
      };
    }

    return NextResponse.json(geo, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // Fallback to Gwalior if IP service is unreachable
  return NextResponse.json(
    {
      latitude: 26.2124,
      longitude: 78.1772,
      city: "Gwalior",
      region: "Madhya Pradesh",
      country: "India",
      address: "City Center, Gwalior, Madhya Pradesh 474011, India",
    },
    { status: 200 },
  );
}
