"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { MapPin, Plus } from "lucide-react";
import { EntityForm, type Field } from "./entity-form";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Empty, Failure, Loading, useToast } from "./feedback";
import { registerSchema, addressSchema, profileSchema } from "@/lib/validation";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api-client";
import { useStore } from "@/lib/store";
import type { Address } from "@/lib/types";
import { useProfile } from "./shell";
export function AuthPage({
  mode,
  oauthError,
}: {
  mode: "login" | "register" | "forgot-password" | "reset-password";
  oauthError?: string;
}) {
  const router = useRouter(),
    notify = useToast();
  const register = mode === "register";
  const [showConfirmationForm, setShowConfirmationForm] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const fields: Field[] = register
    ? [
        { name: "name", label: "Your name" },
        { name: "email", label: "Email", type: "email" },
        { name: "phone", label: "Phone", type: "tel" },
        {
          name: "password",
          label: "Password",
          type: "password",
          hint: "At least 10 characters, with uppercase, lowercase and a number.",
        },
        {
          name: "role",
          label: "I want to",
          type: "select",
          options: [
            { value: "CUSTOMER", label: "Shop in my neighbourhood" },
            { value: "SHOPKEEPER", label: "Bring my shop online" },
          ],
        },
      ]
    : mode === "reset-password"
      ? [{ name: "password", label: "New password", type: "password" }]
      : mode === "forgot-password"
        ? [{ name: "email", label: "Your email", type: "email" }]
        : [
            { name: "email", label: "Email", type: "email" },
            { name: "password", label: "Password", type: "password" },
          ];
  const schema = register
    ? registerSchema
    : mode === "reset-password"
      ? z.object({ password: registerSchema.shape.password })
      : mode === "forgot-password"
        ? z.object({ email: z.email() })
        : z.object({ email: z.email(), password: z.string().min(1) });
  return (
    <div className="page">
      <div className="auth-card">
        <p className="eyebrow">WELCOME TO YOUR NEIGHBOURHOOD</p>
        <h1>
          {register
            ? "A little more local."
            : mode === "login"
              ? "Good to see you again."
              : mode === "forgot-password"
                ? "Forgot your password?"
                : "Choose a new password"}
        </h1>
        <p className="muted">
          {register
            ? "Join the shops and people around you."
            : "Your local marketplace is just a step away."}
        </p>
        {oauthError && (
          <p role="alert" className="field-error auth-error">
            {oauthError}
          </p>
        )}
        {(mode === "login" || mode === "register") && (
          <>
            <Button
              variant="outline"
              className="google-auth-button"
              asChild
            >
              <a href="/auth/google">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  style={{ marginRight: "8px" }}
                >
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.04h3.88c2.27-2.09 3.66-5.17 3.66-9.14z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.04c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.13C3.26 21.36 7.33 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.28c-.25-.72-.38-1.49-.38-2.28s.13-1.56.38-2.28V6.59H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.41l4.03-3.13z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.59l4.03 3.13c.95-2.83 3.6-4.97 6.72-4.97z"
                  />
                </svg>
                Continue with Google
              </a>
            </Button>
            <div className="auth-divider">or continue with email</div>
          </>
        )}
        <EntityForm
          schema={schema}
          defaults={{
            name: "",
            email: "",
            phone: "",
            password: "",
            role: "CUSTOMER",
          }}
          fields={fields}
          path={"auth/" + mode}
          submitLabel={
            register
              ? "Create account"
              : mode === "login"
                ? "Sign in"
                : mode === "forgot-password"
                  ? "Send reset link"
                  : "Update password"
          }
          onSaved={(data) => {
            if (mode === "forgot-password") {
              notify((data as { message: string }).message);
              return;
            }
            if (register) {
              router.push(
                (data as { role?: string }).role === "SHOPKEEPER"
                  ? "/shopkeeper"
                  : "/",
              );
              router.refresh();
            } else {
              router.push(
                mode === "login" &&
                  (data as { role: string }).role === "SHOPKEEPER"
                  ? "/shopkeeper"
                  : "/",
              );
              router.refresh();
            }
          }}
        />

        {mode === "login" && (
          <div className="auth-links">
            <Link href="/register">Create an account</Link>
            <Link href="/forgot-password">Forgot password?</Link>
          </div>
        )}
        {register && (
          <p className="muted">
            Already a member? <Link href="/login">Sign in</Link>
          </p>
        )}
      </div>
    </div>
  );
}

export function ProfilePage() {
  const profile = useProfile(),
    router = useRouter(),
    notify = useToast();
  if (!profile) return null;
  return (
    <div className="page narrow">
      <div className="page-heading">
        <p className="eyebrow">YOUR ACCOUNT</p>
        <h1>Make yourself at home.</h1>
        <p>
          {profile.email} · {profile.role.toLowerCase()}
        </p>
      </div>
      <section className="surface">
        <EntityForm
          schema={profileSchema}
          defaults={{
            name: profile.name,
            phone: profile.phone || "",
            avatar_url: profile.avatar_url,
          }}
          fields={[
            { name: "name", label: "Name" },
            { name: "phone", label: "Phone", type: "tel" },
            {
              name: "avatar_url",
              label: "Profile photo",
              type: "upload",
              bucket: "avatars",
            },
          ]}
          path="profile"
          onSaved={() => router.refresh()}
        />
        <p className="muted mt-5">
          To change your password,{" "}
          <Link href="/forgot-password">request a secure reset link</Link>.
        </p>
        <h3 className="mt-8">Update email</h3>
        <EntityForm
          schema={z.object({ email: z.email() })}
          defaults={{ email: profile.email }}
          fields={[{ name: "email", label: "New email", type: "email" }]}
          path="auth/update-email"
          submitLabel="Send confirmation"
          onSaved={(data) => notify((data as { message: string }).message)}
        />
      </section>
    </div>
  );
}
export function AddressesPage() {
  const result = useQuery<Address[]>("addresses"),
    [edit, setEdit] = useState<Address | null | undefined>(undefined),
    notify = useToast();
  const location = useStore((s) => s.location);
  const defaults = edit
    ? { ...edit }
    : {
        label: "Home",
        full_address: "",
        latitude: location?.latitude ?? "",
        longitude: location?.longitude ?? "",
        city: "",
        state: "",
        pincode: "",
        is_default: !result.data?.length,
      };
  const fields: Field[] = [
    { name: "label", label: "Label (Home, Office…) " },
    { name: "full_address", label: "Full address", type: "textarea" },
    { name: "latitude", label: "Latitude", type: "number" },
    { name: "longitude", label: "Longitude", type: "number" },
    { name: "city", label: "City" },
    { name: "state", label: "State" },
    { name: "pincode", label: "PIN code" },
    {
      name: "is_default",
      label: "Make this my default address",
      type: "checkbox",
    },
  ];
  return (
    <div className="page">
      <div className="page-heading horizontal">
        <div>
          <p className="eyebrow">WHERE GOOD THINGS ARRIVE</p>
          <h1>Your addresses</h1>
          <p>Save the places you shop from.</p>
        </div>
        <Button onClick={() => setEdit(null)}>
          <Plus size={16} />
          Add address
        </Button>
      </div>
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <Failure message={result.error} retry={result.refresh} />
      ) : result.data?.length ? (
        <div className="address-grid">
          {result.data.map((a) => (
            <div className="surface" key={a.id}>
              <MapPin size={22} className="green-text" />
              <h3>
                {a.label}{" "}
                {a.is_default && <span className="badge">Default</span>}
              </h3>
              <p>{a.full_address}</p>
              <p className="muted">
                {a.city}, {a.state} — {a.pincode}
              </p>
              <div className="dialog-actions">
                <Button size="sm" variant="outline" onClick={() => setEdit(a)}>
                  Edit
                </Button>
                {!a.is_default && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await api("addresses/" + a.id, {
                          ...a,
                          is_default: true,
                        });
                        result.refresh();
                      } catch (e) {
                        notify((e as Error).message, true);
                      }
                    }}
                  >
                    Set default
                  </Button>
                )}
                <ConfirmAction
                  label="Delete"
                  onConfirm={async () => {
                    await api("addresses/" + a.id, {}, "DELETE");
                    result.refresh();
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title="Where should we deliver?"
          text="Add an address with its coordinates so your shopkeeper can find you."
        />
      )}
      <Dialog
        open={edit !== undefined}
        onOpenChange={(open) => !open && setEdit(undefined)}
      >
        <DialogContent>
          <DialogTitle className="dialog-title">
            {edit ? "Edit address" : "Add an address"}
          </DialogTitle>
          <DialogDescription className="muted mb-5">
            Use your current coordinates or enter the coordinates for this
            address.
          </DialogDescription>
          <EntityForm
            key={edit?.id || "new"}
            schema={addressSchema}
            defaults={defaults}
            fields={fields}
            path={"addresses" + (edit ? "/" + edit.id : "")}
            locationFields={{
              address: "full_address",
              latitude: "latitude",
              longitude: "longitude",
              city: "city",
              state: "state",
              pincode: "pincode",
            }}
            onSaved={() => {
              setEdit(undefined);
              result.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function ConfirmAction({
  label,
  onConfirm,
  title = "Are you sure?",
}: {
  label: string;
  onConfirm: () => Promise<unknown>;
  title?: string;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    notify = useToast();
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle className="dialog-title">{title}</DialogTitle>
          <DialogDescription className="muted">
            Confirm this action to continue.
          </DialogDescription>
          <div className="dialog-actions">
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                  setOpen(false);
                  notify("Updated successfully.");
                } catch (e) {
                  notify((e as Error).message, true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Updating…" : "Confirm"}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Keep it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
