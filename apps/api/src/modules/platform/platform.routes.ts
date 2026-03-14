import type { FastifyInstance } from "fastify";
import { authenticate, requireAdmin } from "../auth/middleware.js";
import { authService } from "../auth/auth.service.js";
import { platformService } from "./platform.service.js";
import { webhookService } from "./webhook.service.js";

/**
 * Platform routes for app registration and management
 * Mounted under /platform
 */
export async function platformRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /platform/apps - List all apps for the org
  app.get("/apps", { preHandler: requireAdmin }, async (req, reply) => {
    const apps = await platformService.listApps(req.user!.orgId);
    return reply.send({ data: { apps } });
  });

  // POST /platform/apps - Create a new app
  app.post<{
    Body: {
      name: string;
      description?: string;
      redirectUris?: string[];
      scopes?: string[];
      botEnabled?: boolean;
      webhookUrl?: string;
    };
  }>("/apps", { preHandler: requireAdmin }, async (req, reply) => {
    const body = req.body as {
      name: string;
      description?: string;
      redirectUris?: string[];
      scopes?: string[];
      botEnabled?: boolean;
      webhookUrl?: string;
    };

    if (!body.name?.trim()) {
      return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Name is required" });
    }

    const result = await platformService.createApp({
      orgId: req.user!.orgId,
      ...body,
    });

    return reply.status(201).send({ data: { app: result } });
  });

  // GET /platform/apps/:id - Get app details
  app.get<{ Params: { id: string } }>(
    "/apps/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const app = await platformService.getApp(req.params.id, req.user!.orgId);
      if (!app) {
        return reply.status(404).send({ code: "NOT_FOUND", message: "App not found" });
      }
      return reply.send({
        data: {
          app: {
            id: app.id,
            orgId: app.orgId,
            name: app.name,
            description: app.description,
            appId: app.appId,
            redirectUris: app.redirectUris,
            scopes: app.scopes,
            botEnabled: app.botEnabled,
            webhookUrl: app.webhookUrl,
            createdAt: app.createdAt,
          },
        },
      });
    }
  );

  // PATCH /platform/apps/:id - Update app
  app.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      description?: string;
      redirectUris?: string[];
      scopes?: string[];
      botEnabled?: boolean;
      webhookUrl?: string;
    };
  }>("/apps/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const updated = await platformService.updateApp(
      req.params.id,
      req.user!.orgId,
      req.body as Record<string, unknown>
    );
    if (!updated) {
      return reply.status(404).send({ code: "NOT_FOUND", message: "App not found" });
    }
    return reply.send({ data: { app: updated } });
  });

  // DELETE /platform/apps/:id - Delete app
  app.delete<{ Params: { id: string } }>(
    "/apps/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const deleted = await platformService.deleteApp(req.params.id, req.user!.orgId);
      if (!deleted) {
        return reply.status(404).send({ code: "NOT_FOUND", message: "App not found" });
      }
      return reply.send({ data: { success: true } });
    }
  );

  // POST /platform/apps/:id/regenerate-secret - Regenerate app secret
  app.post<{ Params: { id: string } }>(
    "/apps/:id/regenerate-secret",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const result = await platformService.regenerateSecret(
        req.params.id,
        req.user!.orgId
      );
      if (!result) {
        return reply.status(404).send({ code: "NOT_FOUND", message: "App not found" });
      }
      return reply.send({ data: result });
    }
  );

  // Event subscriptions
  app.get<{ Params: { id: string } }>(
    "/apps/:id/subscriptions",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const subs = await platformService.listSubscriptions(req.params.id);
      return reply.send({ data: { subscriptions: subs } });
    }
  );

  app.post<{
    Params: { id: string };
    Body: { eventType: string; callbackUrl: string };
  }>(
    "/apps/:id/subscriptions",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const body = req.body as { eventType: string; callbackUrl: string };
      const sub = await platformService.addSubscription(
        req.params.id,
        body.eventType,
        body.callbackUrl
      );
      return reply.status(201).send({ data: { subscription: sub } });
    }
  );

  // Webhook delivery logs
  app.get<{
    Params: { id: string };
    Querystring: { limit?: string; offset?: string };
  }>(
    "/apps/:id/deliveries",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const deliveries = await webhookService.getDeliveries(
        req.params.id,
        req.query.limit ? parseInt(req.query.limit) : 50,
        req.query.offset ? parseInt(req.query.offset) : 0
      );
      return reply.send({ data: { deliveries } });
    }
  );
}

/**
 * OAuth routes (public-facing, no auth middleware)
 * Mounted under /auth/oauth
 */
export async function oauthRoutes(app: FastifyInstance) {
  // GET /auth/oauth/authorize - Authorization endpoint
  // In production this would render a consent page;
  // for now, auto-authorize if user is logged in
  app.get<{
    Querystring: {
      client_id: string;
      redirect_uri: string;
      response_type: string;
      scope?: string;
      state?: string;
    };
  }>("/authorize", async (req, reply) => {
    const { client_id, redirect_uri, response_type, scope, state } = req.query;

    if (response_type !== "code") {
      return reply.status(400).send({
        code: "UNSUPPORTED_RESPONSE_TYPE",
        message: "Only 'code' response type is supported",
      });
    }

    // Validate app
    const platformApp = await platformService.getAppByAppId(client_id);
    if (!platformApp) {
      return reply.status(400).send({
        code: "INVALID_CLIENT",
        message: "Unknown client_id",
      });
    }

    const uris = platformApp.redirectUris as string[];
    if (!uris.includes(redirect_uri)) {
      return reply.status(400).send({
        code: "INVALID_REDIRECT_URI",
        message: "Redirect URI not registered",
      });
    }

    // Check auth
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({
        code: "UNAUTHORIZED",
        message: "Login required to authorize",
      });
    }

    let userId: string;
    let orgId: string;
    try {
      const payload = authService.verifyToken(authHeader.slice(7));
      const session = await authService.getSessionById(payload.sessionId);
      if (!session) {
        return reply.status(401).send({ code: "SESSION_EXPIRED", message: "Session expired" });
      }
      userId = payload.sub;
      orgId = payload.orgId;
    } catch {
      return reply.status(401).send({ code: "INVALID_TOKEN", message: "Invalid token" });
    }

    const scopes = scope ? scope.split(" ") : [];
    const code = await platformService.createAuthorizationCode(
      platformApp.id,
      userId,
      orgId,
      scopes,
      redirect_uri
    );

    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (state) redirectUrl.searchParams.set("state", state);

    return reply.redirect(redirectUrl.toString());
  });

  // POST /auth/oauth/token - Token exchange endpoint
  app.post<{
    Body: {
      grant_type: string;
      code?: string;
      redirect_uri?: string;
      client_id?: string;
      client_secret?: string;
    };
  }>("/token", async (req, reply) => {
    const body = req.body as {
      grant_type: string;
      code?: string;
      redirect_uri?: string;
      client_id?: string;
      client_secret?: string;
    };

    if (body.grant_type !== "authorization_code") {
      return reply.status(400).send({
        code: "UNSUPPORTED_GRANT_TYPE",
        message: "Only 'authorization_code' grant type is supported",
      });
    }

    if (!body.code || !body.redirect_uri || !body.client_id || !body.client_secret) {
      return reply.status(400).send({
        code: "MISSING_PARAMS",
        message: "code, redirect_uri, client_id, and client_secret are required",
      });
    }

    // Verify client secret
    const platformApp = await platformService.getAppByAppId(body.client_id);
    if (!platformApp) {
      return reply.status(400).send({ code: "INVALID_CLIENT", message: "Unknown client" });
    }

    if (!platformService.verifyAppSecret(body.client_secret, platformApp.appSecretHash)) {
      return reply.status(401).send({ code: "INVALID_SECRET", message: "Invalid client secret" });
    }

    // Exchange code for token
    const result = await platformService.exchangeCode(body.code, body.client_id, body.redirect_uri);
    if (!result) {
      return reply.status(400).send({ code: "INVALID_CODE", message: "Invalid or expired authorization code" });
    }

    // Generate access token for the user
    const token = authService.generateToken({
      sub: result.userId,
      orgId: result.orgId,
      sessionId: "oauth",
      email: "",
      role: "member",
    });

    return reply.send({
      access_token: token,
      token_type: "Bearer",
      scope: result.scopes.join(" "),
    });
  });
}
