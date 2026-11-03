import { describe, expect, it } from "vitest";
import { publicRoutes as app } from "../src/app.ts";

describe("api", () => {
  it("is healthy", async () => {
    const res = await app.request("/healthz");
    expect(await res.json()).toEqual({ ok: true });
  });

  it("negotiates the UI locale from Accept-Language", async () => {
    const res = await app.request("/v0/ui-locale", { headers: { "Accept-Language": "fa-IR, en-GB;q=0.8" } });
    expect(res.headers.get("vary")).toBe("Accept-Language");
    expect(await res.json()).toMatchObject({ locale: "en", source: "accept-language", dir: "ltr" });
  });

  it("honours the user's setting, including pseudo-locales", async () => {
    const res = await app.request("/v0/ui-locale?ui=ar-XB", { headers: { "Accept-Language": "en" } });
    expect(await res.json()).toMatchObject({ locale: "ar-XB", source: "user", dir: "rtl" });
  });
});
