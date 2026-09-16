"use client";
import { useState } from "react";
import { useQuery } from "@/hooks/use-query";
import { platformSettingsSchema, complaintSchema } from "@/lib/validation";
import type { PlatformSettings, OrderReportRow } from "@/lib/types";
import { money } from "@/lib/utils";
import { EntityForm } from "./entity-form";
import { Loading, Failure } from "./feedback";
import { ManagementPage } from "./management-pages";
import { Button } from "./ui/button";
import { BRAND_NAME, displayMarketplaceName } from "@/lib/brand";

export function PlatformSettingsPage() {
  const result = useQuery<PlatformSettings>("platform-settings");
  return (
    <div className="page">
      <h1>Platform settings</h1>
      <p className="muted mb-5">
        Public marketplace information. Do not enter secrets here.
      </p>
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <Failure message={result.error} retry={result.refresh} />
      ) : (
        result.data && (
          <div className="surface max-w-xl">
            <EntityForm
              key={result.data.updated_at}
              schema={platformSettingsSchema}
              defaults={{
                ...result.data,
                marketplace_name: displayMarketplaceName(
                  result.data.marketplace_name,
                ),
              }}
              path="platform-settings"
              fields={[
                { name: "marketplace_name", label: "Marketplace name" },
                {
                  name: "support_email",
                  label: "Support email",
                  type: "email",
                },
                {
                  name: "announcement",
                  label: "Public announcement",
                  type: "textarea",
                  hint: "Up to 500 characters; leave blank to hide.",
                },
              ]}
              onSaved={result.refresh}
            />
          </div>
        )
      )}
    </div>
  );
}

export function ReportsPage() {
  const [days, setDays] = useState(30);
  const result = useQuery<OrderReportRow[]>("reports?days=" + days);
  const totals = (result.data || []).reduce(
    (sum, row) => ({
      orders: sum.orders + Number(row.orders),
      delivered: sum.delivered + Number(row.delivered),
      cancelled: sum.cancelled + Number(row.cancelled),
      value: sum.value + Number(row.delivered_order_value),
    }),
    { orders: 0, delivered: 0, cancelled: 0, value: 0 },
  );
  function download() {
    const rows = [
      [
        "UTC order date",
        "Orders",
        "Delivered",
        "Cancelled",
        "Delivered order value INR",
      ],
      ...(result.data || []).map((r) => [
        r.day,
        r.orders,
        r.delivered,
        r.cancelled,
        r.delivered_order_value,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob([rows.map((r) => r.join(",")).join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `kirana-orders-${days}-days.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="page">
      <h1>Reports & analytics</h1>
      <p className="muted mb-5">
        Orders grouped by creation date in UTC, using their current status.
        Order value is not payment revenue.
      </p>
      <div className="flex gap-4 mb-5">
        <label>
          Report range{" "}
          <select
            aria-label="Report range"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[7, 30, 90].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          onClick={download}
          disabled={result.loading || !!result.error || !result.data}
        >
          Download CSV
        </Button>
      </div>
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <Failure message={result.error} retry={result.refresh} />
      ) : (
        <>
          <div className="stats-grid mb-5">
            {Object.entries({
              Orders: totals.orders,
              Delivered: totals.delivered,
              Cancelled: totals.cancelled,
              "Delivered order value": money(totals.value),
            }).map(([key, value]) => (
              <div className="surface stat" key={key}>
                <small>{key}</small>
                <b>{value}</b>
              </div>
            ))}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>UTC order date</th>
                  <th>Orders</th>
                  <th>Delivered</th>
                  <th>Cancelled</th>
                  <th>Delivered order value</th>
                </tr>
              </thead>
              <tbody>
                {result.data?.map((r) => (
                  <tr key={r.day}>
                    <td>{r.day}</td>
                    <td>{r.orders}</td>
                    <td>{r.delivered}</td>
                    <td>{r.cancelled}</td>
                    <td>{money(Number(r.delivered_order_value))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export function ComplaintsPage({ shopId = "" }: { shopId?: string }) {
  const [revision, setRevision] = useState(0);
  return (
    <>
      <div className="page pb-0">
        <h1>Customer support</h1>
        <p className="muted mb-5">
          Raise a shop or marketplace problem here. For an order problem, use
          “Raise a complaint” on that order.
        </p>
        <div className="surface max-w-xl">
          <EntityForm
            schema={complaintSchema}
            defaults={{
              order_id: null,
              shop_id: shopId || null,
              subject: "",
              description: "",
            }}
            fields={[
              { name: "subject", label: "Subject" },
              {
                name: "description",
                label: "Describe the problem",
                type: "textarea",
              },
            ]}
            path="complaints"
            submitLabel="Send complaint"
            onSaved={() => setRevision((r) => r + 1)}
          />
        </div>
      </div>
      <ManagementPage key={revision} resource="complaints" />
    </>
  );
}

export function MarketplaceNotice() {
  const result = useQuery<PlatformSettings>("platform-settings");
  if (!result.data) return null;
  const settings = result.data;
  const marketplaceName = displayMarketplaceName(settings.marketplace_name);
  return settings.announcement ||
    settings.support_email ||
    marketplaceName !== BRAND_NAME ? (
    <div
      className="management-note section"
      aria-label="Marketplace information"
    >
      <strong>{marketplaceName}</strong>
      {settings.announcement && <p>{settings.announcement}</p>}
      {settings.support_email && (
        <a href={`mailto:${settings.support_email}`}>
          Contact marketplace support
        </a>
      )}
    </div>
  ) : null;
}
