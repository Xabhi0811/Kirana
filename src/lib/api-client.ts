export async function api<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const res = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  return data as T;
}
