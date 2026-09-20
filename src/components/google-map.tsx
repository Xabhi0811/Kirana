"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixed } from "lucide-react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import type { Shop } from "@/lib/types";
import { Button } from "./ui/button";

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
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [locating, setLocating] = useState(false);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
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
          enableSearch ? importLibrary("places") : Promise.resolve(null),
        ]);
        if (cancelled || !mapNode.current) return;
        const fallback = { lat: 12.9716, lng: 77.5946 };
        const center =
          valueLatitude != null && valueLongitude != null
            ? { lat: valueLatitude, lng: valueLongitude }
            : shops[0]
              ? { lat: shops[0].latitude, lng: shops[0].longitude }
              : fallback;
        const map = new Map(mapNode.current, {
          center,
          zoom: valueLatitude != null || shops.length ? 14 : 11,
          clickableIcons: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
        });
        const info = new InfoWindow();
        const bounds = new google.maps.LatLngBounds();

        if (valueLatitude != null && valueLongitude != null) {
          const point = { lat: valueLatitude, lng: valueLongitude };
          new google.maps.Marker({
            map,
            position: point,
            title: "Selected location",
            label: primaryLabel,
            zIndex: 10,
          });
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
            (event: google.maps.MapMouseEvent) => {
              const point = event.latLng;
              if (point)
                onChangeRef.current?.({
                  latitude: point.lat(),
                  longitude: point.lng(),
                });
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
    selectedShopId,
    shops,
    primaryLabel,
    valueLatitude,
    valueLongitude,
  ]);

  function locate() {
    if (!navigator.geolocation) {
      setError("Geolocation is not available in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange?.({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocating(false);
      },
      (locationError) => {
        setLocating(false);
        setError(
          locationError.code === 1
            ? "Location permission was denied. Search or enter the location manually."
            : "Your location is unavailable. Search or enter it manually.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
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
      {enableSearch && <div ref={searchNode} className="place-search" />}
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
        <small className="muted">
          Search above or click the map to choose coordinates.
        </small>
      )}
    </div>
  );
}
