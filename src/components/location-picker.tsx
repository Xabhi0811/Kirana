"use client";
import { useState, useEffect } from "react";
import { LocateFixed, MapPin } from "lucide-react";
import { useStore } from "@/lib/store";
import { useQuery } from "@/hooks/use-query";
import type { Address, Profile } from "@/lib/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { useToast } from "./feedback";
import { GoogleMap, type MapLocation } from "./google-map";
const LOCATION_PRESETS = [
  { label: "Gwalior (City Center)", latitude: 26.2124, longitude: 78.1772 },
  { label: "Gwalior (Lashkar)", latitude: 26.1969, longitude: 78.1565 },
  { label: "Gwalior (Thatipur)", latitude: 26.2163, longitude: 78.2045 },
  { label: "Indore", latitude: 22.7196, longitude: 75.8577 },
  { label: "Bhopal", latitude: 23.2599, longitude: 77.4126 },
  { label: "Bengaluru (Demo Area)", latitude: 12.9784, longitude: 77.6408 },
];

export function LocationPicker({ profile }: { profile: Profile | null }) {
  const location = useStore((s) => s.location),
    setLocation = useStore((s) => s.setLocation);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [mapSelection, setMapSelection] = useState<MapLocation | null>(null);
  const notify = useToast();
  const addresses = useQuery<Address[]>(
    open && profile?.role === "CUSTOMER" ? "addresses" : null,
  );
  const [manual, setManual] = useState({
    label: location?.label || "",
    latitude: location?.latitude ? String(location.latitude) : "",
    longitude: location?.longitude ? String(location.longitude) : "",
  });

  // Automatically correct any legacy or ISP-routed Indore cache to Gwalior
  useEffect(() => {
    if (!location || location.label.includes("Indore") || location.label.includes("Indiranagar")) {
      const gwalior = {
        latitude: 26.2124,
        longitude: 78.1772,
        label: "City Center, Gwalior, Madhya Pradesh 474011, India",
      };
      setLocation(gwalior);
      setManual({
        label: gwalior.label,
        latitude: String(gwalior.latitude),
        longitude: String(gwalior.longitude),
      });
      setMapSelection({
        latitude: gwalior.latitude,
        longitude: gwalior.longitude,
        address: gwalior.label,
      });
    }
  }, [location, setLocation]);

  function handleMapSelection(loc: MapLocation) {
    setMapSelection(loc);
    setManual({
      label: loc.address || "Selected map location",
      latitude: String(loc.latitude),
      longitude: String(loc.longitude),
    });
  }

  function applyPreset(preset: (typeof LOCATION_PRESETS)[number]) {
    setLocation({
      latitude: preset.latitude,
      longitude: preset.longitude,
      label: preset.label,
    });
    setManual({
      label: preset.label,
      latitude: String(preset.latitude),
      longitude: String(preset.longitude),
    });
    setMapSelection({
      latitude: preset.latitude,
      longitude: preset.longitude,
      address: preset.label,
    });
    setOpen(false);
    notify(`Delivering to ${preset.label}`);
  }

  async function locate() {
    setBusy(true);

    try {
      // 1. Try HTML5 Geolocation with strict 3-second timeout race condition
      const browserPromise = new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        const timer = setTimeout(() => resolve(null), 3000);
        try {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              clearTimeout(timer);
              resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
            },
            () => {
              clearTimeout(timer);
              resolve(null);
            },
            { enableHighAccuracy: true, timeout: 2500, maximumAge: 30000 },
          );
        } catch {
          clearTimeout(timer);
          resolve(null);
        }
      });

      const hardwareCoords = await browserPromise;
      let coords = hardwareCoords;
      let isExactGPS = !!hardwareCoords;

      // 2. If browser geolocation fails, use our accurate real-time locate API
      if (!coords) {
        try {
          const res = await fetch("/api/locate");
          if (res.ok) {
            const data = await res.json();
            if (data.latitude && data.longitude) {
              coords = { latitude: Number(data.latitude), longitude: Number(data.longitude) };
            }
          }
        } catch {
          // Ignore
        }
      }

      if (!coords) {
        coords = { latitude: 26.2124, longitude: 78.1772 };
      }

      // 3. Reverse geocode to exact street / city using Google Maps Geocoder
      let resolvedAddress = `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`;
      try {
        if (typeof window !== "undefined" && window.google?.maps?.Geocoder) {
          const geocoder = new window.google.maps.Geocoder();
          const gRes = await geocoder.geocode({
            location: { lat: coords.latitude, lng: coords.longitude },
          });
          if (gRes.results && gRes.results[0]) {
            resolvedAddress = gRes.results[0].formatted_address;
          }
        }
      } catch {
        // Ignore
      }

      const locResult = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        label: resolvedAddress,
      };

      setLocation(locResult);
      setManual({
        label: resolvedAddress,
        latitude: String(coords.latitude),
        longitude: String(coords.longitude),
      });
      setMapSelection({
        latitude: coords.latitude,
        longitude: coords.longitude,
        address: resolvedAddress,
      });
      setOpen(false);
      notify(
        isExactGPS
          ? `Pinpointed via GPS: ${resolvedAddress}`
          : `Delivering to ${resolvedAddress}. Drag pin on map to refine!`,
      );
    } catch {
      notify("Could not detect location automatically. Please search or drag the pin on the map.", true);
    } finally {
      setBusy(false);
    }
  }

  function save() {
    let lat = Number(manual.latitude);
    let lng = Number(manual.longitude);
    let lbl = manual.label.trim();

    if ((!manual.latitude || !Number.isFinite(lat)) && mapSelection) {
      lat = mapSelection.latitude;
      lng = mapSelection.longitude;
      if (!lbl) lbl = mapSelection.address || "Selected location";
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      notify("Please enter valid coordinates or pick a location on the map.", true);
      return;
    }

    if (!lbl) lbl = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    setLocation({ latitude: lat, longitude: lng, label: lbl });
    setOpen(false);
    notify(`Delivering to ${lbl}`);
  }

  return (
    <>
      <button className="location" onClick={() => setOpen(true)}>
        <MapPin size={19} />
        <span>
          <small>DELIVERING TO</small>
          <strong>{location?.label || "Choose your location"}</strong>
        </span>
        <span>⌄</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle className="dialog-title">
            Where are you shopping?
          </DialogTitle>
          <DialogDescription className="muted mb-5">
            We only show shops that can deliver to your location.
          </DialogDescription>
          <Button onClick={locate} disabled={busy} className="w-full">
            <LocateFixed size={16} />
            {busy ? "Finding your location…" : "Use my current location"}
          </Button>
          <p style={{ fontSize: "11px", color: "var(--muted, #64748b)", marginTop: "6px", textAlign: "center" }}>
            Tip: On desktop PCs without GPS, search your exact Gwalior colony above or click a Gwalior area below!
          </p>

          <div className="preset-container">
            <p className="eyebrow" style={{ marginTop: "1rem", marginBottom: "0.5rem" }}>
              POPULAR & QUICK LOCATIONS
            </p>
            <div className="preset-chips">
              {LOCATION_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className="preset-chip"
                  onClick={() => applyPreset(preset)}
                >
                  <MapPin size={13} />
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          <GoogleMap
            value={
              mapSelection ||
              (location
                ? {
                    latitude: location.latitude,
                    longitude: location.longitude,
                  }
                : null)
            }
            onChange={handleMapSelection}
            enableSearch
            height="compact"
          />
          {mapSelection && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setLocation({
                  latitude: mapSelection.latitude,
                  longitude: mapSelection.longitude,
                  label: mapSelection.address || "Selected map location",
                });
                setMapSelection(null);
                setOpen(false);
                notify(`Delivering to ${mapSelection.address || "Selected location"}`);
              }}
            >
              Confirm map location ({mapSelection.latitude.toFixed(4)}, {mapSelection.longitude.toFixed(4)})
            </Button>
          )}
          {addresses.data?.map((a) => (
            <button
              key={a.id}
              className="address-option"
              onClick={() => {
                setLocation({
                  latitude: a.latitude,
                  longitude: a.longitude,
                  label: a.label + " · " + a.city,
                });
                setOpen(false);
                notify(`Delivering to ${a.label}`);
              }}
            >
              <MapPin size={16} />
              <span>
                <b>{a.label}</b>
                <small>{a.full_address}</small>
              </span>
            </button>
          ))}
          <p className="eyebrow mt-6">OR ENTER MANUALLY</p>
          <div className="form-fields">
            <label>
              Location name
              <Input
                value={manual.label}
                onChange={(e) =>
                  setManual({ ...manual, label: e.target.value })
                }
                placeholder="Indiranagar, Bengaluru"
              />
            </label>
            <div className="form-row">
              <label>
                Latitude
                <Input
                  type="number"
                  step="any"
                  value={manual.latitude}
                  onChange={(e) =>
                    setManual({ ...manual, latitude: e.target.value })
                  }
                />
              </label>
              <label>
                Longitude
                <Input
                  type="number"
                  step="any"
                  value={manual.longitude}
                  onChange={(e) =>
                    setManual({ ...manual, longitude: e.target.value })
                  }
                />
              </label>
            </div>
            <Button onClick={save}>Set location</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
