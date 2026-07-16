import { createElement } from "react";
import { env } from "cloudflare:workers";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { action as authAction, loader as authLoader } from "~/routes/api.auth";
import SignIn, { loader as signInLoader } from "~/routes/auth.sign-in";
import Profile, {
  action as profileAction,
  loader as profileLoader,
} from "~/routes/me.profile";
import * as identity from "~/services/identity.server";

function cloudflareContext() {
  return {
    cloudflare: {
      env,
      ctx: {
        waitUntil: () => undefined,
        passThroughOnException: () => undefined,
      } as unknown as ExecutionContext,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("creator auth routes", () => {
  it("renders Google and GitHub OAuth sign-in as POST forms", async () => {
    const request = new Request("https://store.test/en/auth/sign-in");
    const data = await signInLoader({
      request,
      params: { locale: "en" },
      context: cloudflareContext(),
      unstable_pattern: "/:locale/auth/sign-in",
      unstable_url: new URL(request.url),
    } as never);

    const html = renderToStaticMarkup(
      createElement(SignIn, {
        loaderData: data,
        params: { locale: "en" },
      } as never),
    );

    expect(html).toContain('method="post"');
    expect(html).toContain('action="/api/auth/sign-in/social"');
    expect(html).toContain('name="provider"');
    expect(html).toContain('value="google"');
    expect(html).toContain('value="github"');
    expect(html).toContain('name="callbackURL"');
    expect(html).toContain('value="/en"');
    expect(html.toLowerCase()).toContain("google");
    expect(html.toLowerCase()).toContain("github");
  });

  it("forwards auth handler responses with multiple Set-Cookie headers", async () => {
    const headers = new Headers();
    headers.append("Set-Cookie", "session_token=abc; Path=/; HttpOnly");
    headers.append("Set-Cookie", "session_data=xyz; Path=/; HttpOnly");

    const handlerResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers,
    });

    const realCreateAuth = identity.createAuth;
    vi.spyOn(identity, "createAuth").mockImplementation((envArg, origin) => {
      const auth = realCreateAuth(envArg, origin);
      return Object.assign(auth, {
        handler: vi.fn().mockResolvedValue(handlerResponse),
      });
    });

    const request = new Request("https://store.test/api/auth/get-session", {
      method: "GET",
    });

    const loaderResult = await authLoader({
      request,
      params: {},
      context: cloudflareContext(),
      unstable_pattern: "/api/auth/*",
      unstable_url: new URL(request.url),
    } as never);

    expect(loaderResult).toBeInstanceOf(Response);
    expect((loaderResult as Response).headers.getSetCookie()).toEqual([
      "session_token=abc; Path=/; HttpOnly",
      "session_data=xyz; Path=/; HttpOnly",
    ]);

    const actionRequest = new Request(
      "https://store.test/api/auth/sign-in/social",
      { method: "POST" },
    );
    const actionResult = await authAction({
      request: actionRequest,
      params: {},
      context: cloudflareContext(),
      unstable_pattern: "/api/auth/*",
      unstable_url: new URL(actionRequest.url),
    } as never);
    expect(actionResult).toBeInstanceOf(Response);
    expect((actionResult as Response).headers.getSetCookie()).toEqual([
      "session_token=abc; Path=/; HttpOnly",
      "session_data=xyz; Path=/; HttpOnly",
    ]);
  });

  it("redirects unauthenticated profile page visitors to sign-in", async () => {
    const request = new Request("https://store.test/en/me/profile");
    await expect(
      profileLoader({
        request,
        params: { locale: "en" },
        context: cloudflareContext(),
        unstable_pattern: "/:locale/me/profile",
        unstable_url: new URL(request.url),
      } as never),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof Response)) return false;
      if (error.status !== 302 && error.status !== 303) return false;
      const location = error.headers.get("Location") ?? "";
      return location.endsWith("/en/auth/sign-in");
    });
  });

  it("exports a profile form component", () => {
    expect(typeof Profile).toBe("function");
    expect(typeof profileAction).toBe("function");
  });
});
