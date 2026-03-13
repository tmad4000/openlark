import { FastifyInstance } from "fastify";
import crypto from "crypto";
import { db } from "../db";
import { oauthApps, eventSubscriptions, webhookDeliveries } from "../db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// In-memory authorization code store (expires after 10 minutes)
const authorizationCodes = new Map<
  string,
  {
    appId: string;
    userId: string;
    orgId: string;
    scopes: string[];
    redirectUri: string;
    expiresAt: number;
  }
>();

// Clean up expired codes periodically
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of authorizationCodes) {
    if (data.expiresAt < now) {
      authorizationCodes.delete(code);
    }
  }
}, 60_000);

async function requireAdmin(request: any, reply: any): Promise<boolean> {
  if (!request.user.orgId) {
    reply.status(403).send({ error: "No organization" });
    return false;
  }
  if (request.user.role !== "owner" && request.user.role !== "admin") {
    reply.status(403).send({ error: "Admin access required" });
    return false;
  }
  return true;
}

// ── Interfaces ──────────────────────────────────────────────────────

interface CreateAppBody {
  name: string;
  description?: string;
  redirect_uris?: string[];
  scopes?: string[];
  bot_enabled?: boolean;
  webhook_url?: string;
}

interface UpdateAppBody {
  name?: string;
  description?: string;
  redirect_uris?: string[];
  scopes?: string[];
  bot_enabled?: boolean;
  webhook_url?: string;
}

interface AppParams {
  appId: string;
}

interface OAuthAuthorizeQuery {
  client_id: string;
  redirect_uri: string;
  response_type: string;
  scope?: string;
  state?: string;
}

interface OAuthTokenBody {
  grant_type: string;
  code: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

interface CreateSubscriptionBody {
  event_type: string;
  callback_url: string;
}

interface SubscriptionParams {
  appId: string;
  subscriptionId: string;
}

export async function oauthRoutes(fastify: FastifyInstance) {
  // ── App CRUD ────────────────────────────────────────────────────────

  // List all apps for the current org
  fastify.get(
    "/apps",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const apps = await db
        .select({
          id: oauthApps.id,
          orgId: oauthApps.orgId,
          name: oauthApps.name,
          description: oauthApps.description,
          appId: oauthApps.appId,
          redirectUris: oauthApps.redirectUris,
          scopes: oauthApps.scopes,
          botEnabled: oauthApps.botEnabled,
          webhookUrl: oauthApps.webhookUrl,
          createdAt: oauthApps.createdAt,
        })
        .from(oauthApps)
        .where(eq(oauthApps.orgId, request.user.orgId!));

      return reply.status(200).send({ apps });
    }
  );

  // Create a new app
  fastify.post<{ Body: CreateAppBody }>(
    "/apps",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { name, description, redirect_uris, scopes, bot_enabled, webhook_url } =
        request.body;

      if (!name || name.trim().length === 0) {
        return reply.status(400).send({ error: "App name is required" });
      }

      // Generate unique app_id and app_secret
      const appId = `cli_${crypto.randomBytes(16).toString("hex")}`;
      const appSecret = `sec_${crypto.randomBytes(32).toString("hex")}`;
      const appSecretHash = crypto
        .createHash("sha256")
        .update(appSecret)
        .digest("hex");

      const [app] = await db
        .insert(oauthApps)
        .values({
          orgId: request.user.orgId!,
          name: name.trim(),
          description: description || null,
          appId,
          appSecretHash,
          redirectUris: redirect_uris || [],
          scopes: scopes || [],
          botEnabled: bot_enabled || false,
          webhookUrl: webhook_url || null,
        })
        .returning({
          id: oauthApps.id,
          orgId: oauthApps.orgId,
          name: oauthApps.name,
          description: oauthApps.description,
          appId: oauthApps.appId,
          redirectUris: oauthApps.redirectUris,
          scopes: oauthApps.scopes,
          botEnabled: oauthApps.botEnabled,
          webhookUrl: oauthApps.webhookUrl,
          createdAt: oauthApps.createdAt,
        });

      // Return the secret only once — it won't be retrievable again
      return reply.status(201).send({
        app,
        app_secret: appSecret,
      });
    }
  );

  // Get a single app
  fastify.get<{ Params: AppParams }>(
    "/apps/:appId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { appId } = request.params;
      if (!UUID_REGEX.test(appId)) {
        return reply.status(400).send({ error: "Invalid app ID" });
      }

      const [app] = await db
        .select({
          id: oauthApps.id,
          orgId: oauthApps.orgId,
          name: oauthApps.name,
          description: oauthApps.description,
          appId: oauthApps.appId,
          redirectUris: oauthApps.redirectUris,
          scopes: oauthApps.scopes,
          botEnabled: oauthApps.botEnabled,
          webhookUrl: oauthApps.webhookUrl,
          createdAt: oauthApps.createdAt,
        })
        .from(oauthApps)
        .where(
          and(
            eq(oauthApps.id, appId),
            eq(oauthApps.orgId, request.user.orgId!)
          )
        )
        .limit(1);

      if (!app) {
        return reply.status(404).send({ error: "App not found" });
      }

      // Fetch event subscriptions for this app
      const subs = await db
        .select()
        .from(eventSubscriptions)
        .where(eq(eventSubscriptions.appId, app.id));

      return reply.status(200).send({ app, eventSubscriptions: subs });
    }
  );

  // Update an app
  fastify.patch<{ Params: AppParams; Body: UpdateAppBody }>(
    "/apps/:appId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { appId } = request.params;
      if (!UUID_REGEX.test(appId)) {
        return reply.status(400).send({ error: "Invalid app ID" });
      }

      const { name, description, redirect_uris, scopes, bot_enabled, webhook_url } =
        request.body;

      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description;
      if (redirect_uris !== undefined) updates.redirectUris = redirect_uris;
      if (scopes !== undefined) updates.scopes = scopes;
      if (bot_enabled !== undefined) updates.botEnabled = bot_enabled;
      if (webhook_url !== undefined) updates.webhookUrl = webhook_url;

      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({ error: "No fields to update" });
      }

      const [app] = await db
        .update(oauthApps)
        .set(updates)
        .where(
          and(
            eq(oauthApps.id, appId),
            eq(oauthApps.orgId, request.user.orgId!)
          )
        )
        .returning({
          id: oauthApps.id,
          orgId: oauthApps.orgId,
          name: oauthApps.name,
          description: oauthApps.description,
          appId: oauthApps.appId,
          redirectUris: oauthApps.redirectUris,
          scopes: oauthApps.scopes,
          botEnabled: oauthApps.botEnabled,
          webhookUrl: oauthApps.webhookUrl,
          createdAt: oauthApps.createdAt,
        });

      if (!app) {
        return reply.status(404).send({ error: "App not found" });
      }

      return reply.status(200).send({ app });
    }
  );

  // Delete an app
  fastify.delete<{ Params: AppParams }>(
    "/apps/:appId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { appId } = request.params;
      if (!UUID_REGEX.test(appId)) {
        return reply.status(400).send({ error: "Invalid app ID" });
      }

      const deleted = await db
        .delete(oauthApps)
        .where(
          and(
            eq(oauthApps.id, appId),
            eq(oauthApps.orgId, request.user.orgId!)
          )
        )
        .returning({ id: oauthApps.id });

      if (deleted.length === 0) {
        return reply.status(404).send({ error: "App not found" });
      }

      return reply.status(200).send({ message: "App deleted" });
    }
  );

  // Regenerate app secret
  fastify.post<{ Params: AppParams }>(
    "/apps/:appId/regenerate-secret",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { appId } = request.params;
      if (!UUID_REGEX.test(appId)) {
        return reply.status(400).send({ error: "Invalid app ID" });
      }

      const newSecret = `sec_${crypto.randomBytes(32).toString("hex")}`;
      const newSecretHash = crypto
        .createHash("sha256")
        .update(newSecret)
        .digest("hex");

      const [app] = await db
        .update(oauthApps)
        .set({ appSecretHash: newSecretHash })
        .where(
          and(
            eq(oauthApps.id, appId),
            eq(oauthApps.orgId, request.user.orgId!)
          )
        )
        .returning({ id: oauthApps.id, appId: oauthApps.appId });

      if (!app) {
        return reply.status(404).send({ error: "App not found" });
      }

      return reply.status(200).send({
        app_id: app.appId,
        app_secret: newSecret,
      });
    }
  );

  // ── Event Subscriptions ─────────────────────────────────────────────

  // Create event subscription
  fastify.post<{ Params: { appId: string }; Body: CreateSubscriptionBody }>(
    "/apps/:appId/subscriptions",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { appId } = request.params;
      if (!UUID_REGEX.test(appId)) {
        return reply.status(400).send({ error: "Invalid app ID" });
      }

      const { event_type, callback_url } = request.body;
      if (!event_type || !callback_url) {
        return reply
          .status(400)
          .send({ error: "event_type and callback_url are required" });
      }

      // Verify app belongs to org
      const [app] = await db
        .select({ id: oauthApps.id })
        .from(oauthApps)
        .where(
          and(
            eq(oauthApps.id, appId),
            eq(oauthApps.orgId, request.user.orgId!)
          )
        )
        .limit(1);

      if (!app) {
        return reply.status(404).send({ error: "App not found" });
      }

      const [sub] = await db
        .insert(eventSubscriptions)
        .values({
          appId: app.id,
          eventType: event_type,
          callbackUrl: callback_url,
        })
        .returning();

      return reply.status(201).send({ subscription: sub });
    }
  );

  // Delete event subscription
  fastify.delete<{ Params: SubscriptionParams }>(
    "/apps/:appId/subscriptions/:subscriptionId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { appId, subscriptionId } = request.params;
      if (!UUID_REGEX.test(appId) || !UUID_REGEX.test(subscriptionId)) {
        return reply.status(400).send({ error: "Invalid ID" });
      }

      // Verify app belongs to org
      const [app] = await db
        .select({ id: oauthApps.id })
        .from(oauthApps)
        .where(
          and(
            eq(oauthApps.id, appId),
            eq(oauthApps.orgId, request.user.orgId!)
          )
        )
        .limit(1);

      if (!app) {
        return reply.status(404).send({ error: "App not found" });
      }

      const deleted = await db
        .delete(eventSubscriptions)
        .where(
          and(
            eq(eventSubscriptions.id, subscriptionId),
            eq(eventSubscriptions.appId, app.id)
          )
        )
        .returning({ id: eventSubscriptions.id });

      if (deleted.length === 0) {
        return reply.status(404).send({ error: "Subscription not found" });
      }

      return reply.status(200).send({ message: "Subscription deleted" });
    }
  );

  // ── Webhook Delivery Logs ──────────────────────────────────────────

  // Get webhook delivery logs for an app
  fastify.get<{ Params: { appId: string }; Querystring: { limit?: string } }>(
    "/apps/:appId/deliveries",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { appId } = request.params;
      if (!UUID_REGEX.test(appId)) {
        return reply.status(400).send({ error: "Invalid app ID" });
      }

      // Verify app belongs to org
      const [app] = await db
        .select({ id: oauthApps.id })
        .from(oauthApps)
        .where(
          and(
            eq(oauthApps.id, appId),
            eq(oauthApps.orgId, request.user.orgId!)
          )
        )
        .limit(1);

      if (!app) {
        return reply.status(404).send({ error: "App not found" });
      }

      // Get all subscription IDs for this app
      const subs = await db
        .select({ id: eventSubscriptions.id })
        .from(eventSubscriptions)
        .where(eq(eventSubscriptions.appId, app.id));

      const subIds = subs.map((s) => s.id);
      if (subIds.length === 0) {
        return reply.status(200).send({ deliveries: [] });
      }

      const queryLimit = Math.min(
        parseInt(request.query.limit || "50", 10) || 50,
        200
      );

      const deliveries = await db
        .select()
        .from(webhookDeliveries)
        .where(inArray(webhookDeliveries.subscriptionId, subIds))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(queryLimit);

      return reply.status(200).send({ deliveries });
    }
  );

  // ── OAuth 2.0 Authorization Code Flow ───────────────────────────────

  // Authorization endpoint — user grants access to an app
  fastify.get<{ Querystring: OAuthAuthorizeQuery }>(
    "/auth/oauth/authorize",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { client_id, redirect_uri, response_type, scope, state } =
        request.query;

      if (response_type !== "code") {
        return reply
          .status(400)
          .send({ error: "Only response_type=code is supported" });
      }

      if (!client_id || !redirect_uri) {
        return reply
          .status(400)
          .send({ error: "client_id and redirect_uri are required" });
      }

      // Look up the app by its public app_id
      const [app] = await db
        .select()
        .from(oauthApps)
        .where(eq(oauthApps.appId, client_id))
        .limit(1);

      if (!app) {
        return reply.status(404).send({ error: "App not found" });
      }

      // Validate redirect_uri
      if (
        app.redirectUris.length > 0 &&
        !app.redirectUris.includes(redirect_uri)
      ) {
        return reply.status(400).send({ error: "Invalid redirect_uri" });
      }

      // Generate authorization code (valid for 10 minutes)
      const code = crypto.randomBytes(32).toString("hex");
      authorizationCodes.set(code, {
        appId: app.appId,
        userId: request.user.id,
        orgId: request.user.orgId!,
        scopes: scope ? scope.split(" ") : [],
        redirectUri: redirect_uri,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      // Redirect back to the app with the code
      const url = new URL(redirect_uri);
      url.searchParams.set("code", code);
      if (state) url.searchParams.set("state", state);

      return reply.redirect(url.toString());
    }
  );

  // Token endpoint — exchange authorization code for access token
  fastify.post<{ Body: OAuthTokenBody }>(
    "/auth/oauth/token",
    async (request, reply) => {
      const { grant_type, code, client_id, client_secret, redirect_uri } =
        request.body;

      if (grant_type !== "authorization_code") {
        return reply
          .status(400)
          .send({ error: "Only grant_type=authorization_code is supported" });
      }

      if (!code || !client_id || !client_secret || !redirect_uri) {
        return reply.status(400).send({ error: "Missing required parameters" });
      }

      // Validate app credentials
      const [app] = await db
        .select()
        .from(oauthApps)
        .where(eq(oauthApps.appId, client_id))
        .limit(1);

      if (!app) {
        return reply.status(401).send({ error: "Invalid client credentials" });
      }

      const secretHash = crypto
        .createHash("sha256")
        .update(client_secret)
        .digest("hex");

      if (secretHash !== app.appSecretHash) {
        return reply.status(401).send({ error: "Invalid client credentials" });
      }

      // Look up and validate authorization code
      const codeData = authorizationCodes.get(code);
      if (!codeData) {
        return reply
          .status(400)
          .send({ error: "Invalid or expired authorization code" });
      }

      // Code can only be used once
      authorizationCodes.delete(code);

      if (codeData.expiresAt < Date.now()) {
        return reply.status(400).send({ error: "Authorization code expired" });
      }

      if (codeData.appId !== client_id) {
        return reply
          .status(400)
          .send({ error: "Code does not match client_id" });
      }

      if (codeData.redirectUri !== redirect_uri) {
        return reply
          .status(400)
          .send({ error: "redirect_uri does not match" });
      }

      // Generate access token (valid for 2 hours)
      const accessToken = crypto.randomBytes(32).toString("hex");

      return reply.status(200).send({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 7200,
        scope: codeData.scopes.join(" "),
        user_id: codeData.userId,
        org_id: codeData.orgId,
      });
    }
  );
}
