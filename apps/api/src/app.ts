import { DEFAULT_UI_LOCALE, directionOf, negotiateLocale, PSEUDO_LOCALES, UI_LOCALES } from "@nabu/i18n";
import { Hono } from "hono";

export const app = new Hono()
  .get("/healthz", (c) => c.json({ ok: true }))
  /** Which UI locale this server would serve: ?ui= (the user's setting), then Accept-Language. */
  .get("/v0/ui-locale", (c) => {
    const negotiated = negotiateLocale({
      userSetting: c.req.query("ui"),
      accepted: c.req.header("accept-language"),
      available: UI_LOCALES,
      pseudo: PSEUDO_LOCALES,
      defaultLocale: DEFAULT_UI_LOCALE,
    });
    c.header("Vary", "Accept-Language");
    c.header("Content-Language", negotiated.locale);
    return c.json({ ...negotiated, dir: directionOf(negotiated.locale) });
  });

export type App = typeof app;
