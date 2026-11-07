/** The Cloudflare Worker: the platform's clock, randomness and fetch, handed to the relay. */
import type { TokenCell } from "./oauth.ts";
import { handle, type Env } from "./relay.ts";

const cell: TokenCell = { token: null, expires: 0 };

export default {
  fetch: (request: Request, env: Env): Promise<Response> =>
    handle(request, env, {
      fetch: (input, init) => fetch(input, init),
      now: () => Date.now(),
      random: (size) => crypto.getRandomValues(new Uint8Array(size)),
      cell,
    }),
};
