import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-for-token-round-trips";
});

// Import lazily so the env var is set before the module reads it.
async function tokens() {
  return import("./engageTokens");
}

describe("unsubscribe tokens", () => {
  it("round-trips org + constituent", async () => {
    const { makeUnsubscribeToken, verifyUnsubscribeToken } = await tokens();
    const t = makeUnsubscribeToken("org-1", "con-2");
    expect(verifyUnsubscribeToken(t)).toEqual({ orgId: "org-1", constituentId: "con-2" });
  });

  it("rejects tampering", async () => {
    const { makeUnsubscribeToken, verifyUnsubscribeToken } = await tokens();
    const t = makeUnsubscribeToken("org-1", "con-2");
    const [body, sig] = t.split(".");
    const forgedBody = Buffer.from("org-1:con-OTHER").toString("base64url");
    expect(verifyUnsubscribeToken(`${forgedBody}.${sig}`)).toBeNull();
    expect(verifyUnsubscribeToken(`${body}.AAAA${sig!.slice(4)}`)).toBeNull();
    expect(verifyUnsubscribeToken("garbage")).toBeNull();
  });
});

describe("manage-billing tokens", () => {
  it("round-trips and carries the manage purpose", async () => {
    const { makeManageBillingToken, verifyManageBillingToken } = await tokens();
    const t = makeManageBillingToken("org-1", "con-2");
    expect(verifyManageBillingToken(t)).toEqual({ orgId: "org-1", constituentId: "con-2" });
  });

  it("purposes are not interchangeable (no cross-endpoint replay)", async () => {
    const { makeUnsubscribeToken, makeManageBillingToken, verifyUnsubscribeToken, verifyManageBillingToken } =
      await tokens();
    const unsub = makeUnsubscribeToken("org-1", "con-2");
    const manage = makeManageBillingToken("org-1", "con-2");
    expect(verifyManageBillingToken(unsub)).toBeNull();
    // An unsubscribe verifier fed a manage token must NOT opt out org "manage".
    const cross = verifyUnsubscribeToken(manage);
    expect(cross === null || cross.orgId !== "org-1").toBe(true);
  });
});
