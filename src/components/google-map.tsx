"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixed, Search } from "lucide-react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import type { Shop } from "@/lib/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export type MapLocation = {
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
};

type Props = {
  value: { latitude: number; longitude: number } | null;
  onChange?: (location: MapLocation) => void;
  shops?: Shop[];
  selectedShopId?: string;
  onShopSelect?: (shop: Shop) => void;
  deliveryRadiusKm?: number;
  customerLocation?: { latitude: number; longitude: number } | null;
  primaryLabel?: string;
  enableSearch?: boolean;
  showCurrentLocation?: boolean;
  height?: "compact" | "regular";
};

let configuredKey: string | null = null;
const noShops: Shop[] = [];

function configureMaps(key: string) {
  if (configuredKey && configuredKey !== key)
    throw new Error("Google Maps was initialized with a different API key.");
  if (!configuredKey) {
    setOptions({
      key,
      v: "weekly",
      region: "IN",
      authReferrerPolicy: "origin",
    });
    configuredKey = key;
  }
}

function component(
  parts: google.maps.places.AddressComponent[] | undefined,
  type: string,
) {
  return parts?.find((part) => part.types.includes(type))?.longText || "";
}

export function GoogleMap({
  value,
  onChange,
  shops = noShops,
  selectedShopId,
  onShopSelect,
  deliveryRadiusKm,
  customerLocation,
  primaryLabel = "You",
  enableSearch = false,
  showCurrentLocation = false,
  height = "regular",
}: Props) {
  const mapNode = useRef<HTMLDivElement>(null),
    searchNode = useRef<HTMLDivElement>(null),
    onChangeRef = useRef(onChange),
    onShopSelectRef = useRef(onShopSelect),
    mapInstanceRef = useRef<google.maps.Map | null>(null),
    selectionMarkerRef = useRef<google.maps.Marker | null>(null),
    [searchQuery, setSearchQuery] = useState(""),
    [searching, setSearching] = useState(false),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [locating, setLocating] = useState(false);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const placesEnabled =
    process.env.NEXT_PUBLIC_GOOGLE_PLACES_ENABLED === "true";
  const valueLatitude = value?.latitude,
    valueLongitude = value?.longitude;

  useEffect(() => {
    onChangeRef.current = onChange;
    onShopSelectRef.current = onShopSelect;
  }, [onChange, onShopSelect]);

  useEffect(() => {
    if (!apiKey || !mapNode.current) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const cleanups: (() => void)[] = [];
    async function initialize() {
      try {
        configureMaps(apiKey!);
        const [{ Map, InfoWindow }, places] = await Promise.all([
          importLibrary("maps"),
          enableSearch && placesEnabled
            ? importLibrary("places")
            : Promise.resolve(null),
        ]);
        if (cancelled || !mapNode.current) return;
        let center = { lat: 26.2124, lng: 78.1772 }; // Default to Gwalior
        let initialZoom = 14;

        if (valueLatitude != null && valueLongitude != null) {
          center = { lat: valueLatitude, lng: valueLongitude };
          initialZoom = 14;
        } else if (shops[0]) {
          center = { lat: shops[0].latitude, lng: shops[0].longitude };
          initialZoom = 13;
        } else {
          try {
            const locRes = await fetch("/api/locate");
            if (locRes.ok) {
              const data = await locRes.json();
              if (data.latitude && data.longitude) {
                center = { lat: Number(data.latitude), lng: Number(data.longitude) };
                initialZoom = 13;
              }
            }
          } catch {
            // Fallback to India center
          }
        }

        const map = new Map(mapNode.current, {
          center,
          zoom: initialZoom,
          clickableIcons: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
        });
        mapInstanceRef.current = map;
        const info = new InfoWindow();
        const bounds = new google.maps.LatLngBounds();

        function attachMarker(point: google.maps.LatLng | google.maps.LatLngLiteral) {
          if (!selectionMarkerRef.current && mapInstanceRef.current) {
            const m = new google.maps.Marker({
              map: mapInstanceRef.current,
              position: point,
              title: "Drag me to your exact location",
              label: primaryLabel,
              draggable: true,
              zIndex: 10,
            });
            m.addListener("dragend", async (e: google.maps.MapMouseEvent) => {
              const pt = e.latLng;
              if (!pt) return;
              const lat = pt.lat();
              const lng = pt.lng();
              let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
              try {
                if (typeof google !== "undefined" && google.maps?.Geocoder) {
                  const geocoder = new google.maps.Geocoder();
                  const res = await geocoder.geocode({ location: { lat, lng } });
                  if (res.results && res.results[0]) {
                    address = res.results[0].formatted_address;
                  }
                }
              } catch {
                // Ignore
              }
              onChangeRef.current?.({ latitude: lat, longitude: lng, address });
            });
            selectionMarkerRef.current = m;
          } else if (selectionMarkerRef.current) {
            selectionMarkerRef.current.setPosition(point);
            selectionMarkerRef.current.setDraggable(true);
          }
        }

        if (valueLatitude != null && valueLongitude != null) {
          const point = { lat: valueLatitude, lng: valueLongitude };
          attachMarker(point);
          bounds.extend(point);
          if (deliveryRadiusKm && deliveryRadiusKm > 0)
            new google.maps.Circle({
              map,
              center: point,
              radius: deliveryRadiusKm * 1000,
              fillColor: "#638352",
              fillOpacity: 0.12,
              strokeColor: "#638352",
              strokeOpacity: 0.65,
              strokeWeight: 2,
              clickable: false,
            });
        }
        if (customerLocation) {
          const customerPoint = {
            lat: customerLocation.latitude,
            lng: customerLocation.longitude,
          };
          new google.maps.Marker({
            map,
            position: customerPoint,
            title: "Your delivery location",
            label: "You",
            zIndex: 9,
          });
          bounds.extend(customerPoint);
        }
        shops.forEach((shop) => {
          const position = { lat: shop.latitude, lng: shop.longitude };
          const marker = new google.maps.Marker({
            map,
            position,
            title: shop.name,
            label: shop.id === selectedShopId ? "S" : undefined,
          });
          bounds.extend(position);
          marker.addListener("click", () => {
            onShopSelectRef.current?.(shop);
            const content = document.createElement("div");
            const title = document.createElement("strong");
            const details = document.createElement("p");
            const link = document.createElement("a");
            title.textContent = shop.name;
            details.textContent = `${shop.address} · ${shop.status.toLowerCase()}${shop.distance == null ? "" : ` · ${shop.distance.toFixed(1)} km`}`;
            link.href = `/shops/${shop.id}`;
            link.textContent = "Open shop details";
            content.append(title, details, link);
            info.setContent(content);
            info.open({ map, anchor: marker });
          });
        });
        if (valueLatitude != null && (shops.length || customerLocation))
          map.fitBounds(bounds, 48);

        if (onChangeRef.current) {
          const listener = map.addListener(
            "click",
            async (event: google.maps.MapMouseEvent) => {
              const point = event.latLng;
              if (point) {
                const lat = point.lat();
                const lng = point.lng();

                attachMarker(point);

                let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                try {
                  if (typeof google !== "undefined" && google.maps?.Geocoder) {
                    const geocoder = new google.maps.Geocoder();
                    const res = await geocoder.geocode({ location: { lat, lng } });
                    if (res.results && res.results[0]) {
                      address = res.results[0].formatted_address;
                    }
                  }
                } catch {
                  // Geocode is optional
                }

                onChangeRef.current?.({
                  latitude: lat,
                  longitude: lng,
                  address,
                });
              }
            },
          );
          cleanups.push(() => listener.remove());
        }

        if (places && searchNode.current) {
          const autocomplete = new places.PlaceAutocompleteElement({
            includedRegionCodes: ["in"],
          });
          autocomplete.placeholder = "Search for an address";
          searchNode.current.replaceChildren(autocomplete);
          const select = async (
            event: google.maps.places.PlacePredictionSelectEvent,
          ) => {
            try {
              const place = event.placePrediction.toPlace();
              await place.fetchFields({
                fields: ["formattedAddress", "location", "addressComponents"],
              });
              if (!place.location) return;
              const location = {
                latitude: place.location.lat(),
                longitude: place.location.lng(),
                address: place.formattedAddress || "",
                city:
                  component(place.addressComponents, "locality") ||
                  component(
                    place.addressComponents,
                    "administrative_area_level_2",
                  ),
                state: component(
                  place.addressComponents,
                  "administrative_area_level_1",
                ),
                pincode: component(place.addressComponents, "postal_code"),
              };
              map.panTo(place.location);
              map.setZoom(17);
              onChangeRef.current?.(location);
            } catch {
              setError(
                "That address could not be loaded. You can still enter it manually.",
              );
            }
          };
          autocomplete.addEventListener("gmp-select", select);
          cleanups.push(() =>
            autocomplete.removeEventListener("gmp-select", select),
          );
        }
        if (!cancelled) setLoading(false);
      } catch {
        if (!cancelled) {
          setLoading(false);
          setError(
            "Map is unavailable right now. You can still enter your address manually.",
          );
        }
      }
    }
    void initialize();
    return () => {
      cancelled = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [
    apiKey,
    customerLocation,
    deliveryRadiusKm,
    enableSearch,
    placesEnabled,
    selectedShopId,
    shops,
    primaryLabel,
    valueLatitude,
  ]);

  useEffect(() => {
    if (mapInstanceRef.current && valueLatitude != null && valueLongitude != null && typeof google !== "undefined") {
      const pt = new google.maps.LatLng(valueLatitude, valueLongitude);
      mapInstanceRef.current.panTo(pt);
      mapInstanceRef.current.setZoom(15);
      if (selectionMarkerRef.current) {
        selectionMarkerRef.current.setPosition(pt);
        selectionMarkerRef.current.setDraggable(true);
      } else {
        const m = new google.maps.Marker({
          map: mapInstanceRef.current,
          position: pt,
          title: "Drag me to your exact location",
          label: primaryLabel,
          draggable: true,
          zIndex: 10,
        });
        m.addListener("dragend", async (e: google.maps.MapMouseEvent) => {
          const point = e.latLng;
          if (!point) return;
          const lat = point.lat();
          const lng = point.lng();
          let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          try {
            if (typeof google !== "undefined" && google.maps?.Geocoder) {
              const geocoder = new google.maps.Geocoder();
              const res = await geocoder.geocode({ location: { lat, lng } });
              if (res.results && res.results[0]) {
                address = res.results[0].formatted_address;
              }
            }
          } catch {
            // Ignore
          }
          onChangeRef.current?.({ latitude: lat, longitude: lng, address });
        });
        selectionMarkerRef.current = m;
      }
    }
  }, [valueLatitude, valueLongitude, primaryLabel]);

  async function locate() {
    setLocating(true);
    setError(null);
    try {
      const getBrowserCoords = (): Promise<{ lat: number; lng: number } | null> => {
        return new Promise((resolve) => {
          if (!navigator.geolocation) return resolve(null);
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 },
          );
        });
      };

      let coords = await getBrowserCoords();

      if (!coords) {
        try {
          const res = await fetch("/api/locate");
          if (res.ok) {
            const data = await res.json();
            if (data.latitude && data.longitude) {
              coords = { lat: Number(data.latitude), lng: Number(data.longitude) };
            }
          }
        } catch {
          // Ignore
        }
      }

      if (!coords) {
        setLocating(false);
        setError("Could not detect location. Please search your area or click on the map.");
        return;
      }

      if (mapInstanceRef.current && typeof google !== "undefined") {
        const point = new google.maps.LatLng(coords.lat, coords.lng);
        mapInstanceRef.current.panTo(point);
        mapInstanceRef.current.setZoom(15);
        if (!selectionMarkerRef.current) {
          selectionMarkerRef.current = new google.maps.Marker({
            map: mapInstanceRef.current,
            position: point,
            title: "Selected location",
            label: primaryLabel,
            zIndex: 10,
          });
        } else {
          selectionMarkerRef.current.setPosition(point);
        }
      }

      let address = `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
      try {
        if (typeof google !== "undefined" && google.maps?.Geocoder) {
          const geocoder = new google.maps.Geocoder();
          const gRes = await geocoder.geocode({ location: { lat: coords.lat, lng: coords.lng } });
          if (gRes.results && gRes.results[0]) {
            address = gRes.results[0].formatted_address;
          }
        }
      } catch {
        // Ignore
      }

      onChangeRef.current?.({
        latitude: coords.lat,
        longitude: coords.lng,
        address,
      });
    } catch {
      setError("Could not detect location.");
    } finally {
      setLocating(false);
    }
  }

  async function handleSearch(queryToSearch?: string) {
    const q = (queryToSearch ?? searchQuery).trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      // 1. Server-side geocode (chains Google Geocoding → Find Place → Nominatim)
      try {
        const res = await fetch(`/api/places?geocode=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.latitude && data.longitude) {
            const lat = Number(data.latitude);
            const lng = Number(data.longitude);
            if (mapInstanceRef.current && typeof google !== "undefined") {
              const point = new google.maps.LatLng(lat, lng);
              mapInstanceRef.current.panTo(point);
              mapInstanceRef.current.setZoom(15);
              if (!selectionMarkerRef.current) {
                selectionMarkerRef.current = new google.maps.Marker({
                  map: mapInstanceRef.current,
                  position: point,
                  title: "Selected location",
                  label: primaryLabel,
                  zIndex: 10,
                });
              } else {
                selectionMarkerRef.current.setPosition(point);
              }
            }
            onChangeRef.current?.({
              latitude: lat,
              longitude: lng,
              address: data.address || q,
            });
            setSearching(false);
            return;
          }
        }
      } catch {
        // Server geocode failed, try client-side fallback
      }

      // 2. Client-side Google Geocoder fallback
      if (typeof window !== "undefined" && window.google?.maps?.Geocoder) {
        try {
          const geocoder = new window.google.maps.Geocoder();
          const res = await geocoder.geocode({ address: q, region: "in" });
          if (res.results && res.results[0]) {
            const loc = res.results[0].geometry.location;
            const lat = loc.lat();
            const lng = loc.lng();
            if (mapInstanceRef.current) {
              mapInstanceRef.current.panTo(loc);
              mapInstanceRef.current.setZoom(15);
              if (!selectionMarkerRef.current) {
                selectionMarkerRef.current = new window.google.maps.Marker({
                  map: mapInstanceRef.current,
                  position: loc,
                  title: "Selected location",
                  label: primaryLabel,
                  zIndex: 10,
                });
              } else {
                selectionMarkerRef.current.setPosition(loc);
              }
            }
            onChangeRef.current?.({
              latitude: lat,
              longitude: lng,
              address: res.results[0].formatted_address,
            });
            setSearching(false);
            return;
          }
        } catch {
          // Client-side geocoder failed (API may not be enabled)
        }
      }

      setError("Location not found. Try a more specific search or click directly on the map.");
    } catch {
      setError("Could not search location. Please click on the map or enter coordinates.");
    } finally {
      setSearching(false);
    }
  }


  const [predictions, setPredictions] = useState<
    Array<{ placeId: string; description: string; mainText: string; secondaryText: string }>
  >([]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setPredictions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places?input=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.predictions)) {
            setPredictions(data.predictions);
          }
        }
      } catch {
        // Ignore
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  async function selectPrediction(placeId: string, description?: string) {
    setSearching(true);
    setPredictions([]);
    try {
      const res = await fetch(`/api/places?placeId=${encodeURIComponent(placeId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.latitude && data.longitude) {
          const lat = data.latitude;
          const lng = data.longitude;
          const addr = data.address || "Selected location";
          setSearchQuery(addr);
          if (mapInstanceRef.current && typeof google !== "undefined") {
            const pt = new google.maps.LatLng(lat, lng);
            mapInstanceRef.current.panTo(pt);
            mapInstanceRef.current.setZoom(15);
            if (selectionMarkerRef.current) {
              selectionMarkerRef.current.setPosition(pt);
            } else {
              selectionMarkerRef.current = new google.maps.Marker({
                map: mapInstanceRef.current,
                position: pt,
                title: "Selected location",
                label: primaryLabel,
                zIndex: 10,
              });
            }
          }
          onChangeRef.current?.({
            latitude: lat,
            longitude: lng,
            address: addr,
          });
          return;
        }
      }
      // Place details failed — fall back to geocode search with the description text
      if (description) {
        setSearching(false);
        await handleSearch(description);
        return;
      }
    } catch {
      // Fall back to text search
      if (description) {
        setSearching(false);
        await handleSearch(description);
        return;
      }
    } finally {
      setSearching(false);
    }
  }


  if (!apiKey)
    return (
      <p className="map-message">
        Map is not configured. You can still enter the address and coordinates
        manually.
      </p>
    );
  return (
    <div className="google-map-panel">
      {enableSearch && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (predictions.length > 0) {
              void selectPrediction(predictions[0].placeId, predictions[0].description);
            } else {
              void handleSearch();
            }
          }}
          className="map-search-bar"
        >
          <div className="search-container">
            <Input
              type="text"
              placeholder="Search your city or colony (e.g. Gwalior, Thatipur, Lashkar)…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {predictions.length > 0 && (
              <div className="search-dropdown">
                {predictions.map((p) => (
                  <button
                    key={p.placeId}
                    type="button"
                    className="search-prediction-item"
                    onClick={() => void selectPrediction(p.placeId, p.description)}
                  >
                    <Search size={14} style={{ marginTop: "3px", flexShrink: 0, color: "#64748b" }} />
                    <div>
                      <div className="search-prediction-main">{p.mainText}</div>
                      {p.secondaryText && (
                        <div className="search-prediction-sub">{p.secondaryText}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button
            type="submit"
            variant="outline"
            disabled={searching || !searchQuery.trim()}
          >
            <Search size={15} />
            {searching ? "Searching…" : "Search"}
          </Button>
        </form>
      )}
      {showCurrentLocation && onChange && (
        <Button
          type="button"
          variant="outline"
          onClick={locate}
          disabled={locating}
        >
          <LocateFixed size={16} />
          {locating ? "Finding location…" : "Use current location"}
        </Button>
      )}
      {error && (
        <p className="map-message" role="alert">
          {error}
        </p>
      )}
      {loading && <p className="map-loading">Loading map…</p>}
      <div
        ref={mapNode}
        className={`google-map google-map-${height}`}
        aria-label="Interactive Google map"
      />
      {onChange && (
        <small className="muted" style={{ display: "block", marginTop: "6px", fontWeight: 500 }}>
          🎯 Drag the red pin or click anywhere on the map to pinpoint your exact home/shop.
        </small>
      )}
    </div>
  );
}
