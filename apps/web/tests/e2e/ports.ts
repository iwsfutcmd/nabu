/**
 * Ports of the servers the e2e tests start (playwright.config.ts). Locally a running server is
 * reused, so two checkouts testing at once each set their own pair (NABU_E2E_WEB_PORT,
 * NABU_E2E_API_PORT); otherwise one would test the other's build.
 */
const port = (name: string, fallback: number): number => {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : Number.parseInt(value, 10);
};

export const WEB_PORT = port("NABU_E2E_WEB_PORT", 4174);
export const API_PORT = port("NABU_E2E_API_PORT", 4175);
