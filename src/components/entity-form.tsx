"use client";
import { useState } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { api } from "@/lib/api-client";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { useToast } from "./feedback";
import { GoogleMap, type MapLocation } from "./google-map";
export interface Field {
  name: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "password"
    | "tel"
    | "number"
    | "time"
    | "textarea"
    | "select"
    | "checkbox"
    | "upload";
  options?: { value: string; label: string }[];
  nullable?: boolean;
  bucket?: string;
  hint?: string;
}
export function EntityForm({
  schema,
  defaults,
  fields,
  path,
  onSaved,
  submitLabel = "Save changes",
  locationFields,
}: {
  schema: z.ZodType;
  defaults: Record<string, unknown>;
  fields: Field[];
  path: string;
  onSaved?: (data: unknown) => void;
  submitLabel?: string;
  locationFields?: {
    address: string;
    latitude: string;
    longitude: string;
    city?: string;
    state?: string;
    pincode?: string;
    deliveryRadius?: string;
  };
}) {
  const notify = useToast(),
    [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Record<string, unknown>>({
    defaultValues: defaults,
    resolver: zodResolver(schema as z.ZodObject<z.ZodRawShape>) as Resolver<
      Record<string, unknown>
    >,
  });
  const liveValues = useWatch({ control });
  const latitude = locationFields
      ? Number(liveValues[locationFields.latitude])
      : NaN,
    longitude = locationFields
      ? Number(liveValues[locationFields.longitude])
      : NaN,
    deliveryRadius = locationFields?.deliveryRadius
      ? Number(liveValues[locationFields.deliveryRadius])
      : undefined;
  function selectLocation(location: MapLocation) {
    if (!locationFields) return;
    setValue(locationFields.latitude, location.latitude, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(locationFields.longitude, location.longitude, {
      shouldDirty: true,
      shouldValidate: true,
    });
    const optional = [
      [locationFields.address, location.address],
      [locationFields.city, location.city],
      [locationFields.state, location.state],
      [locationFields.pincode, location.pincode],
    ] as const;
    optional.forEach(([field, value]) => {
      if (field && value)
        setValue(field, value, { shouldDirty: true, shouldValidate: true });
    });
  }
  async function submit(data: Record<string, unknown>) {
    setError(null);
    try {
      const result = await api(path, data);
      notify("Saved successfully.");
      onSaved?.(result);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <form className="form-fields" onSubmit={handleSubmit(submit)}>
      {locationFields && (
        <GoogleMap
          value={
            Number.isFinite(latitude) && Number.isFinite(longitude)
              ? { latitude, longitude }
              : null
          }
          onChange={selectLocation}
          deliveryRadiusKm={
            deliveryRadius && Number.isFinite(deliveryRadius)
              ? deliveryRadius
              : undefined
          }
          enableSearch
          showCurrentLocation
          height="compact"
        />
      )}
      {fields.map((f) => (
        <label
          key={f.name}
          className={f.type === "checkbox" ? "checkbox-label" : ""}
        >
          {f.type === "checkbox" ? (
            <>
              <input
                type="checkbox"
                aria-label={f.label}
                {...register(f.name)}
              />
              {f.label}
            </>
          ) : (
            <>
              {f.label}
              {f.type === "select" ? (
                <select
                  aria-label={f.label}
                  {...register(f.name, {
                    setValueAs: (value) =>
                      f.nullable && value === "" ? null : value,
                  })}
                >
                  {f.nullable && <option value="">None</option>}
                  {!f.nullable && <option value="">Select an option</option>}
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea aria-label={f.label} rows={3} {...register(f.name)} />
              ) : f.type === "upload" ? (
                <Upload
                  bucket={f.bucket || "avatars"}
                  onUploaded={(url) =>
                    setValue(f.name, url, { shouldValidate: true })
                  }
                />
              ) : (
                <Input
                  aria-label={f.label}
                  type={f.type || "text"}
                  step={f.type === "number" ? "any" : undefined}
                  {...register(f.name, { valueAsNumber: f.type === "number" })}
                />
              )}
            </>
          )}
          {f.hint && <small className="muted">{f.hint}</small>}
          {errors[f.name] && (
            <small className="field-error">
              {String(errors[f.name]?.message)}
            </small>
          )}
        </label>
      ))}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <Button disabled={isSubmitting} type="submit">
        {isSubmitting ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
export function Upload({
  bucket,
  room,
  onUploaded,
}: {
  bucket: string;
  room?: string;
  onUploaded: (url: string, path: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    notify = useToast();
  return (
    <div>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={busy}
        aria-label="Upload image"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          const form = new FormData();
          form.set("file", file);
          form.set("bucket", bucket);
          if (room) form.set("room", room);
          try {
            const res = await fetch("/api/upload", {
              method: "POST",
              body: form,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            onUploaded(data.url, data.path);
            setName(file.name);
          } catch (err) {
            notify((err as Error).message, true);
          } finally {
            setBusy(false);
          }
        }}
      />
      <small className="muted">
        {busy ? "Uploading…" : name || "JPEG, PNG or WebP · up to 4 MB"}
      </small>
    </div>
  );
}
