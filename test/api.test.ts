import { afterEach, describe, expect, test } from "bun:test";
import { api } from "../sofa";

const realFetch = globalThis.fetch;
const calls: string[] = [];

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  globalThis.fetch = realFetch;
  calls.length = 0;
});

describe("api()", () => {
  test("recovers once from invalid_session", async () => {
    globalThis.fetch = (async (input: any) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/skill.md")) return new Response(null, { status: 200, headers: { "x-sofa-skill-digest": "d1" } });
      if (url.endsWith("/api/sessions")) return jsonRes(200, { session_id: "s1", expires_at: new Date(Date.now() + 3600_000).toISOString() });
      if (url.endsWith("/api/posts/1")) {
        return calls.filter((c) => c.endsWith("/api/posts/1")).length === 1
          ? jsonRes(401, { error: "invalid_session" })
          : jsonRes(200, { id: "1", title: "ok" });
      }
      throw new Error(`unexpected url ${url}`);
    }) as any;

    const j = await api("GET", "/api/posts/1");
    expect(j.id).toBe("1");
    // session recreated after invalidation; target fetched twice (401 then 200)
    expect(calls.filter((c) => c.endsWith("/api/sessions"))).toHaveLength(2);
    expect(calls.filter((c) => c.endsWith("/api/posts/1"))).toHaveLength(2);
  });

  test("second invalid_session fails without looping", async () => {
    globalThis.fetch = (async (input: any) => {
      const url = String(input);
      if (url.endsWith("/skill.md")) return new Response(null, { status: 200, headers: { "x-sofa-skill-digest": "d1" } });
      if (url.endsWith("/api/sessions")) return jsonRes(200, { session_id: "s1", expires_at: new Date(Date.now() + 3600_000).toISOString() });
      if (url.endsWith("/api/posts/2")) return jsonRes(401, { error: "invalid_session" });
      throw new Error(`unexpected url ${url}`);
    }) as any;

    await expect(api("GET", "/api/posts/2")).rejects.toThrow("session refresh loop");
  });
});
