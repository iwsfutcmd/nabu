/**
 * Where a report goes (ADR 0115), which its confirmation and Your reports say: to the course's
 * reviewers, to them once the learner signs in, or nowhere.
 */
import { describe, expect, it } from "vitest";
import { reachOf } from "../../src/reports.ts";
import type { Account } from "../../src/sync.ts";

const account: Account = { server: "https://nabu.example", token: "t", user: { id: "u", email: "learner@example.org" } };
const none = { server: undefined, account: undefined, ageRefused: false };

describe("where a report made now goes", () => {
  it("to the reviewers: through the deployment's intake, or with an account", () => {
    expect(reachOf(true, none)).toBe("reviewers");
    expect(reachOf(false, { server: account.server, account, ageRefused: false })).toBe("reviewers");
    expect(reachOf(true, { server: account.server, account: undefined, ageRefused: false })).toBe("reviewers");
  });

  it("to them once the learner signs in: a server, no account (the outbox uploads at sign-in)", () => {
    expect(reachOf(false, { server: account.server, account: undefined, ageRefused: false })).toBe("sign-in");
  });

  it("nowhere: no intake and no server, or a server whose age gate turned the person away (ADR 0069)", () => {
    expect(reachOf(false, none)).toBe("device");
    expect(reachOf(false, { server: account.server, account: undefined, ageRefused: true })).toBe("device");
  });
});
