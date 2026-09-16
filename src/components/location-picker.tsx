"use client";
import { useState } from "react";
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
export function LocationPicker({ profile }: { profile: Profile | null }) {
  const location = useStore((s) => s.location),
    setLocation = useStore((s) => s.setLocation);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const notify = useToast();
  const addresses = useQuery<Address[]>(
    open && profile?.role === "CUSTOMER" ? "addresses" : null,
  );
  const [manual, setManual] = useState({
    label: "",
    latitude: "",
    longitude: "",
  });
  function locate() {
    if (!navigator.geolocation) {
      notify("Geolocation is not available in this browser.", true);
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocation({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          label: "Current location",
        });
        setBusy(false);
        setOpen(false);
      },
      (e) => {
        setBusy(false);
        notify(
          e.code === 1
            ? "Location permission denied. Choose an address or enter coordinates."
            : "Location unavailable. Please enter your location manually.",
          true,
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }
  function save() {
    const lat = Number(manual.latitude),
      lng = Number(manual.longitude);
    if (
      !manual.label.trim() ||
      !manual.latitude ||
      !manual.longitude ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      notify("Enter a location name and valid coordinates.", true);
      return;
    }
    setLocation({ latitude: lat, longitude: lng, label: manual.label });
    setOpen(false);
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
