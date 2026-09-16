export const BRAND_NAME = "Kirana";

// Display-only compatibility: existing database defaults are not rewritten.
// Preserve a marketplace name deliberately customized by its administrator.
export function displayMarketplaceName(name: string) {
  return /^local[-_ ]?(kart|mart)$/i.test(name.trim()) ? BRAND_NAME : name;
}
