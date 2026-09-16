import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import { serverSupabase } from "@/lib/supabase/server";
import * as v from "@/lib/validation";
import type { Profile, Role, Product } from "@/lib/types";
import {
  authFailure,
  databaseSetupMessage,
  missingDatabaseObject,
} from "@/lib/service-errors";

type Context = { params: Promise<{ path: string[] }> };
class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
async function limitedBody(
  request: NextRequest,
  max: number,
): Promise<ArrayBuffer> {
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new HttpError("Request too large. Images must be under 4 MB.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}
async function jsonBody(request: NextRequest) {
  return z
    .record(z.string(), z.unknown())
    .parse(
      JSON.parse(
        new TextDecoder().decode(await limitedBody(request, 100 * 1024)),
      ),
    );
}
const ok = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
function checked<T>(result: {
  data: T;
  error: { message: string; code?: string } | null;
}): T {
  if (result.error) {
    const e = result.error;
    if (missingDatabaseObject(e.code))
      throw new HttpError(databaseSetupMessage, 503);
    if (e.code === "23505")
      throw new HttpError(
        "A record with these details already exists. Phone numbers must be unique and orders can be reviewed only once.",
        409,
      );
    if (e.code === "23503")
      throw new HttpError(
        "This entry is used by other records and cannot be removed.",
      );
    if (e.code === "42501")
      throw new HttpError(
        "You do not have permission to perform this action.",
        403,
      );
    if (e.code === "PGRST116")
      throw new HttpError("The requested record was not found.", 404);
    if (e.code === "P0001")
      throw new HttpError(
        e.message,
        /Unauthorized|denied|only/.test(e.message) ? 403 : 400,
      );
    throw new HttpError(
      "Unable to complete the request. Check your connection and database setup.",
      503,
    );
  }
  return result.data;
}
async function actor(
  db: Awaited<ReturnType<typeof serverSupabase>>,
  roles?: Role[],
) {
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new HttpError("Please sign in to continue.", 401);
  const status = checked(await db.rpc("my_account_status"));
  if (status === "SUSPENDED")
    throw new HttpError(
      "Your account is suspended. Contact customer support.",
      403,
    );
  const p = checked(
    await db
      .from("users")
      .select("id,name,email,phone,avatar_url,role,status")
      .eq("id", user.id)
      .single(),
  ) as Profile;
  if (p.status !== "ACTIVE" || (roles && !roles.includes(p.role)))
    throw new HttpError("You do not have access to this page.", 403);
  return p;
}
function search(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  return v.searchSchema.parse({
    latitude: p.get("lat"),
    longitude: p.get("lng"),
    q: p.get("q") || "",
    category: p.get("category") || null,
    in_stock: p.get("in_stock") === "true",
    open_only: p.get("open_only") === "true",
    sort_by: p.get("sort") || "distance",
    page: p.get("page") || 0,
    shop: p.get("shop") || null,
    unit: p.get("unit") || null,
    brand: p.get("brand") || null,
  });
}
const orderSelect = "*,shops(name),order_items(*),order_tracking(*)";
async function execute(request: NextRequest, context: Context) {
  const path = (await context.params).path,
    [resource, target, action] = path,
    method = request.method;
  if (path.length > 3) throw new HttpError("Endpoint not found.", 404);
  if (method !== "GET" && method !== "POST") {
    const deletion =
      method === "DELETE" &&
      ((["addresses", "lists", "list-items", "reviews"].includes(resource) &&
        !!target &&
        !action) ||
        (resource === "manage" &&
          ["products", "categories"].includes(target) &&
          !!action));
    const patch =
      method === "PATCH" && resource === "platform-settings" && !target;
    if (!deletion && !patch) throw new HttpError("Method not allowed.", 405);
  }
  const db = await serverSupabase();
  if (method === "GET") {
    const page = z.coerce
        .number()
        .int()
        .min(0)
        .max(10000)
        .parse(request.nextUrl.searchParams.get("page") || 0),
      start = page * 24;
    if (resource === "categories")
      return ok(
        checked(
          await db
            .from("categories")
            .select("*")
            .order("name")
            .range(start, start + 99),
        ),
      );
    if (resource === "platform-settings")
      return ok(
        checked(
          await db
            .from("platform_settings")
            .select("marketplace_name,support_email,announcement,updated_at")
            .single(),
        ),
      );
    if (resource === "search") {
      if (
        !request.nextUrl.searchParams.has("lat") ||
        !request.nextUrl.searchParams.has("lng")
      )
        throw new HttpError(
          "Set your location to find shops that deliver to you.",
        );
      const s = search(request);
      const args = {
        lat: s.latitude,
        lng: s.longitude,
        q: s.q,
        category: s.category,
        open_only: s.open_only,
        sort_by: s.sort_by,
        page: s.page,
      };
      return ok(
        checked(
          await db.rpc(
            target === "shops" ? "discover_shops" : "discover_products",
            target === "shops"
              ? args
              : {
                  ...args,
                  in_stock: s.in_stock,
                  shop: s.shop,
                  unit_filter: s.unit,
                  brand_filter: s.brand,
                },
          ),
        ),
      );
    }
    if (resource === "shops" && target) {
      z.uuid().parse(target);
      const s = search(request);
      const shop = checked(
        await db.from("shops").select("*").eq("id", target).single(),
      );
      const nearby = checked(
        await db.rpc("discover_shops", {
          lat: s.latitude,
          lng: s.longitude,
          shop: target,
        }),
      );
      const match = nearby?.find((x: { id: string }) => x.id === target);
      if (!match)
        throw new HttpError(
          "This shop does not deliver to your selected location.",
          403,
        );
      return ok({ ...shop, ...match });
    }
    if (resource === "products" && target) {
      z.uuid().parse(target);
      const s = search(request);
      const p = checked(
        await db.from("products").select("*").eq("id", target).single(),
      );
      const results = checked(
        await db.rpc("discover_shops", {
          lat: s.latitude,
          lng: s.longitude,
          shop: p.shop_id,
        }),
      );
      const eligibleShop = results?.[0];
      if (!eligibleShop || !p.is_active)
        throw new HttpError(
          "This product is unavailable at your location.",
          404,
        );
      return ok({
        ...p,
        shop_name: eligibleShop.name,
        shop_status: eligibleShop.status,
        distance: eligibleShop.distance,
        rating: eligibleShop.rating,
      });
    }
    if (resource === "shop-reviews") {
      z.uuid().parse(target);
      return ok(
        checked(
          await db
            .from("reviews")
            .select("*")
            .eq("shop_id", target)
            .order("created_at", { ascending: false })
            .range(start, start + 23),
        ),
      );
    }
    const p = await actor(db);
    if (resource === "profile") return ok(p);
    if (resource === "addresses")
      return ok(
        checked(
          await db
            .from("addresses")
            .select("*")
            .eq("user_id", p.id)
            .order("is_default", { ascending: false }),
        ),
      );
    if (resource === "lists")
      return ok(
        checked(
          await db
            .from("shopping_lists")
            .select("*,shopping_list_items(*)")
            .eq("user_id", p.id)
            .order("updated_at", { ascending: false })
            .range(start, start + 23),
        ),
      );
    if (resource === "orders") {
      const query = db
        .from("orders")
        .select(orderSelect)
        .order("created_at", { ascending: false });
      if (target) {
        z.uuid().parse(target);
        return ok(checked(await query.eq("id", target).single()));
      }
      return ok(checked(await query.range(start, start + 23)));
    }
    if (resource === "chat") {
      if (target && action === "messages") {
        z.uuid().parse(target);
        return ok(
          checked(
            await db
              .from("chat_messages")
              .select("*")
              .eq("chat_room_id", target)
              .order("created_at", { ascending: false })
              .range(page * 50, page * 50 + 49),
          ),
        );
      }
      return ok(checked(await db.rpc("chat_summaries")));
    }
    if (resource === "reviews") {
      let query = db
        .from("reviews")
        .select("*")
        .order("created_at", { ascending: false });
      if (p.role === "CUSTOMER") query = query.eq("customer_id", p.id);
      if (p.role === "SHOPKEEPER") {
        const ids = checked(
          await db.from("shops").select("id").eq("owner_id", p.id),
        );
        query = query.in(
          "shop_id",
          (ids || []).map((x: { id: string }) => x.id),
        );
      }
      return ok(checked(await query.range(start, start + 23)));
    }
    if (resource === "complaints")
      return ok(
        checked(
          await db
            .from("complaints")
            .select("*")
            .order("created_at", { ascending: false })
            .range(start, start + 23),
        ),
      );
    if (resource === "stats") {
      await actor(db, ["SHOPKEEPER", "ADMIN"]);
      return ok(checked(await db.rpc("dashboard_stats")));
    }
    if (resource === "reports") {
      await actor(db, ["ADMIN"]);
      const days = z.coerce
        .number()
        .int()
        .min(1)
        .max(90)
        .parse(request.nextUrl.searchParams.get("days") || 30);
      return ok(checked(await db.rpc("admin_order_report", { days })));
    }
    if (resource === "manage") {
      await actor(db, ["SHOPKEEPER", "ADMIN"]);
      if (
        !["shops", "products", "users", "categories", "audit_logs"].includes(
          target,
        )
      )
        throw new HttpError("Not found", 404);
      if (
        ["users", "categories", "audit_logs"].includes(target) &&
        p.role !== "ADMIN"
      )
        throw new HttpError("Administrator access required.", 403);
      let query = db
        .from(target)
        .select("*")
        .order(target === "categories" ? "name" : "created_at", {
          ascending: false,
        });
      if (p.role === "SHOPKEEPER" && target === "shops")
        query = query.eq("owner_id", p.id);
      if (p.role === "SHOPKEEPER" && target === "products") {
        const ids = checked(
          await db.from("shops").select("id").eq("owner_id", p.id),
        );
        query = query.in(
          "shop_id",
          (ids || []).map((x: { id: string }) => x.id),
        );
      }
      return ok(checked(await query.range(start, start + 23)));
    }
    throw new HttpError("Page not found.", 404);
  }
  // Cookie authenticated mutations require a same-origin request.
  const origin = request.headers.get("origin");
  const allowed = [
    request.nextUrl.origin,
    process.env.NEXT_PUBLIC_SITE_URL,
  ].filter(Boolean);
  if (
    (origin && !allowed.includes(origin)) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new HttpError("Request origin denied.", 403);
  if (resource === "auth") {
    if (method !== "POST") throw new HttpError("Method not allowed.", 405);
    const body = await jsonBody(request);
    if (target === "register") {
      const data = v.registerSchema.parse(body);
      // Avoid creating Auth-only accounts when the application profile table is absent.
      checked(await db.from("users").select("id").limit(0));
      const { error } = await db.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: { name: data.name, phone: data.phone, role: data.role },
          emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin}/auth/confirm`,
        },
      });
      if (error) {
        const failure = authFailure(error, "register");
        throw new HttpError(failure.message, failure.status);
      }
      return ok({
        success: true,
        message:
          "Account created. Check your email if confirmation is required.",
      });
    }
    if (target === "login") {
      const data = z
        .object({ email: z.email(), password: z.string().min(1).max(128) })
        .parse(body);
      const { error } = await db.auth.signInWithPassword(data);
      if (error) {
        const failure = authFailure(error, "login");
        throw new HttpError(failure.message, failure.status);
      }
      try {
        return ok(await actor(db));
      } catch (error) {
        await db.auth.signOut();
        throw error;
      }
    }
    if (target === "resend-confirmation") {
      const { email } = z.object({ email: z.email() }).parse(body);
      const { error } = await db.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin}/auth/confirm`,
        },
      });
      if (error) {
        const failure = authFailure(error, "register");
        throw new HttpError(failure.message, failure.status);
      }
      return ok({
        message:
          "If this account needs confirmation, a new link has been sent. Check your inbox and spam folder, then open the link before signing in.",
      });
    }
    if (target === "logout") {
      await db.auth.signOut();
      return ok({ success: true });
    }
    if (target === "forgot-password") {
      const { email } = z.object({ email: z.email() }).parse(body);
      const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin}/auth/callback`,
      });
      if (error)
        throw new HttpError(
          "The reset email could not be sent. Please try again later.",
          error.status === 429 ? 429 : 503,
        );
      return ok({
        message: "If an account exists, a reset link has been sent.",
      });
    }
    if (target === "reset-password") {
      await actor(db);
      const { password } = z
        .object({ password: v.registerSchema.shape.password })
        .parse(body);
      const { error } = await db.auth.updateUser({ password });
      if (error)
        throw new HttpError(
          "Password could not be updated. Try a new reset link.",
        );
      return ok({ success: true });
    }
    if (target === "update-email") {
      await actor(db);
      const { email } = z.object({ email: z.email() }).parse(body);
      const { error } = await db.auth.updateUser(
        { email },
        {
          emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin}/auth/confirm`,
        },
      );
      if (error)
        throw new HttpError("Email could not be changed. Please try again.");
      return ok({ message: "Check your email to confirm the address change." });
    }
    throw new HttpError("Not found", 404);
  }
  const p = await actor(db);
  if (resource === "platform-settings") {
    await actor(db, ["ADMIN"]);
    if (request.method !== "POST" && request.method !== "PATCH")
      throw new HttpError("Method not allowed.", 405);
    const data = v.platformSettingsSchema.parse(await jsonBody(request));
    return ok(
      checked(
        await db
          .from("platform_settings")
          .update(data)
          .eq("id", "00000000-0000-0000-0000-000000000001")
          .select()
          .single(),
      ),
    );
  }
  if (resource === "upload") {
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
      throw new HttpError("Select an image to upload.");
    const form = await new Response(
        await limitedBody(request, 4.25 * 1024 * 1024),
        { headers: { "Content-Type": request.headers.get("content-type")! } },
      ).formData(),
      file = form.get("file"),
      bucket = form.get("bucket"),
      room = form.get("room");
    if (file instanceof File && file.size > 4 * 1024 * 1024)
      throw new HttpError("Select an image under 4 MB.", 413);
    if (!(file instanceof File) || file.size < 12)
      throw new HttpError("Select an image under 4 MB.");
    if (
      ![
        "avatars",
        "shop-images",
        "product-images",
        "chat-images",
        "category-images",
      ].includes(String(bucket))
    )
      throw new HttpError("Invalid upload destination.");
    if (bucket === "category-images" && p.role !== "ADMIN")
      throw new HttpError("Administrator access required.", 403);
    if (
      ["shop-images", "product-images"].includes(String(bucket)) &&
      p.role !== "SHOPKEEPER"
    )
      throw new HttpError("Shopkeeper access required.", 403);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
        (x, i) => bytes[i] === x,
      ),
      jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
      webp =
        String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
        String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    const mime = png
      ? "image/png"
      : jpeg
        ? "image/jpeg"
        : webp
          ? "image/webp"
          : null;
    if (!mime || mime !== file.type)
      throw new HttpError(
        "Only valid JPEG, PNG and WebP images are supported.",
      );
    try {
      // Magic bytes alone accept corrupt files. Decode before publishing them.
      await sharp(bytes, {
        limitInputPixels: 25000000,
        failOn: "error",
      }).stats();
    } catch {
      throw new HttpError(
        "The image is damaged or too large to decode. Choose another image.",
      );
    }
    const path = `${p.id}/${bucket === "chat-images" ? z.uuid().parse(room) + "/" : ""}${crypto.randomUUID()}.${png ? "png" : jpeg ? "jpg" : "webp"}`;
    checked(
      await db.storage
        .from(String(bucket))
        .upload(path, bytes, { contentType: mime, upsert: false }),
    );
    return ok({
      path,
      url:
        bucket === "chat-images"
          ? null
          : db.storage.from(String(bucket)).getPublicUrl(path).data.publicUrl,
    });
  }
  const body = method === "DELETE" ? {} : await jsonBody(request);
  if (target && resource !== "manage") z.uuid().parse(target);
  if (resource === "profile") {
    const data = v.profileSchema.parse(body);
    return ok(
      checked(
        await db.from("users").update(data).eq("id", p.id).select().single(),
      ),
    );
  }
  if (resource === "addresses") {
    if (method === "DELETE")
      return ok(
        checked(
          await db
            .from("addresses")
            .delete()
            .eq("id", target)
            .eq("user_id", p.id)
            .select(),
        ),
      );
    const data = v.addressSchema.parse(body);
    return ok({
      id: checked(
        await db.rpc("save_address", { input: data, target: target || null }),
      ),
    });
  }
  if (resource === "lists") {
    if (action === "resolve") {
      const input = z
        .object({
          shop_id: z.uuid(),
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
        })
        .parse(body);
      const list = checked(
        await db
          .from("shopping_lists")
          .select("*,shopping_list_items(*)")
          .eq("id", target)
          .eq("user_id", p.id)
          .single(),
      );
      const found = new Map<string, Product & { quantity: number }>();
      const missing: string[] = [];
      if (list.shopping_list_items.length > 100)
        throw new HttpError("Convert lists of at most 100 items at a time.");
      for (const item of list.shopping_list_items as {
        name: string;
        quantity: number;
        unit: string;
        product_id: string | null;
      }[]) {
        const results = checked(
          await db.rpc("discover_products", {
            lat: input.latitude,
            lng: input.longitude,
            q: item.name,
            shop: input.shop_id,
            open_only: true,
            in_stock: true,
          }),
        );
        const product = results?.find(
          (x: {
            id: string;
            name: string;
            unit: string;
            stock_quantity: number;
          }) =>
            x.stock_quantity >= item.quantity &&
            (x.id === item.product_id ||
              (x.name.toLowerCase() === item.name.toLowerCase() &&
                (item.unit === "item" ||
                  x.unit.toLowerCase() === item.unit.toLowerCase()))),
        );
        if (product) {
          const quantity =
            (found.get(product.id)?.quantity || 0) + item.quantity;
          if (quantity > product.stock_quantity || quantity > 999)
            missing.push(item.name);
          else found.set(product.id, { ...product, quantity });
        } else missing.push(item.name);
      }
      return ok({ products: [...found.values()], missing });
    }
    if (method === "DELETE")
      return ok(
        checked(
          await db
            .from("shopping_lists")
            .delete()
            .eq("id", target)
            .eq("user_id", p.id)
            .select(),
        ),
      );
    const data = z
      .object({ name: z.string().trim().min(1).max(100) })
      .parse(body);
    return ok(
      checked(
        target
          ? await db
              .from("shopping_lists")
              .update(data)
              .eq("id", target)
              .eq("user_id", p.id)
              .select()
              .single()
          : await db
              .from("shopping_lists")
              .insert({ ...data, user_id: p.id })
              .select()
              .single(),
      ),
    );
  }
  if (resource === "list-items") {
    if (method === "DELETE")
      return ok(
        checked(
          await db
            .from("shopping_list_items")
            .delete()
            .eq("id", target)
            .select(),
        ),
      );
    const data = v.listItemSchema.parse(body);
    return ok(
      checked(
        target
          ? await db
              .from("shopping_list_items")
              .update(data)
              .eq("id", target)
              .select()
              .single()
          : await db.from("shopping_list_items").insert(data).select().single(),
      ),
    );
  }
  if (resource === "orders") {
    if (target) {
      const data = z
        .object({
          status: z.enum([
            "ACCEPTED",
            "PREPARING",
            "OUT_FOR_DELIVERY",
            "DELIVERED",
            "CANCELLED",
          ]),
          note: z.string().max(1000).default(""),
        })
        .parse(body);
      checked(
        await db.rpc("transition_order", {
          target,
          next_status: data.status,
          status_note: data.note,
        }),
      );
      return ok({ success: true });
    }
    const data = v.orderSchema.parse(body);
    return ok(
      {
        id: checked(
          await db.rpc("place_order", {
            shop: data.shop_id,
            address: data.address_id,
            items: data.items,
            request_id: data.request_id,
            order_notes: data.notes,
          }),
        ),
      },
      201,
    );
  }
  if (resource === "chat") {
    if (action === "read") {
      checked(await db.rpc("read_messages", { room: target }));
      return ok({ success: true });
    }
    if (action === "messages") {
      const data = v.messageSchema.parse({ ...body, room_id: target });
      return ok(
        {
          id: checked(
            await db.rpc("send_message", {
              room: target,
              kind: data.message_type,
              text_content: data.message,
              reference_id: data.reference_id || null,
              image_path: data.image_path || null,
            }),
          ),
        },
        201,
      );
    }
    const { shop_id } = z.object({ shop_id: z.uuid() }).parse(body);
    return ok({ id: checked(await db.rpc("open_chat", { shop: shop_id })) });
  }
  if (resource === "reviews") {
    if (method === "DELETE") {
      await actor(db, ["ADMIN"]);
      return ok(
        checked(await db.from("reviews").delete().eq("id", target).select()),
      );
    }
    return ok(
      checked(
        await db
          .from("reviews")
          .insert({ ...v.reviewSchema.parse(body), customer_id: p.id })
          .select()
          .single(),
      ),
    );
  }
  if (resource === "complaints") {
    if (target) {
      await actor(db, ["ADMIN"]);
      const data = z
        .object({ status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]) })
        .parse(body);
      return ok(
        checked(
          await db
            .from("complaints")
            .update(data)
            .eq("id", target)
            .select()
            .single(),
        ),
      );
    }
    return ok(
      checked(
        await db
          .from("complaints")
          .insert({ ...v.complaintSchema.parse(body), user_id: p.id })
          .select()
          .single(),
      ),
    );
  }
  if (resource === "manage") {
    await actor(db, ["SHOPKEEPER", "ADMIN"]);
    if (action) z.uuid().parse(action);
    if (target === "shops") {
      if (p.role === "ADMIN" && action) {
        const data = z
          .object({
            approval_status: z.enum([
              "PENDING",
              "APPROVED",
              "REJECTED",
              "SUSPENDED",
            ]),
          })
          .parse(body);
        return ok(
          checked(
            await db
              .from("shops")
              .update(data)
              .eq("id", action)
              .select()
              .single(),
          ),
        );
      }
      const data = v.shopSchema.parse(body);
      return ok(
        checked(
          action
            ? await db
                .from("shops")
                .update(data)
                .eq("id", action)
                .select()
                .single()
            : await db
                .from("shops")
                .insert({ ...data, owner_id: p.id })
                .select()
                .single(),
        ),
      );
    }
    if (target === "products") {
      if (method === "DELETE")
        return ok(
          checked(
            await db
              .from("products")
              .update({ is_active: false })
              .eq("id", action)
              .select()
              .single(),
          ),
        );
      const data = v.productSchema.parse(body);
      return ok(
        checked(
          action
            ? await db
                .from("products")
                .update(data)
                .eq("id", action)
                .select()
                .single()
            : await db.from("products").insert(data).select().single(),
        ),
      );
    }
    await actor(db, ["ADMIN"]);
    if (target === "users") {
      const data = z
        .object({ status: z.enum(["ACTIVE", "SUSPENDED"]) })
        .parse(body);
      if (action === p.id)
        throw new HttpError("You cannot suspend your own admin account.");
      return ok(
        checked(
          await db
            .from("users")
            .update(data)
            .eq("id", action)
            .select()
            .single(),
        ),
      );
    }
    if (target === "categories") {
      if (method === "DELETE")
        return ok(
          checked(
            await db.from("categories").delete().eq("id", action).select(),
          ),
        );
      const data = v.categorySchema.parse(body);
      return ok(
        checked(
          action
            ? await db
                .from("categories")
                .update(data)
                .eq("id", action)
                .select()
                .single()
            : await db.from("categories").insert(data).select().single(),
        ),
      );
    }
  }
  throw new HttpError("Endpoint not found.", 404);
}
async function handle(request: NextRequest, context: Context) {
  try {
    return await execute(request, context);
  } catch (error) {
    if (error instanceof z.ZodError)
      return ok(
        { error: error.issues[0]?.message || "Check the form fields." },
        400,
      );
    if (error instanceof HttpError)
      return ok({ error: error.message }, error.status);
    if (error instanceof SyntaxError)
      return ok({ error: "Invalid request body." }, 400);
    return ok(
      {
        error:
          "The service is unavailable. Check your Supabase configuration and try again.",
      },
      503,
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
