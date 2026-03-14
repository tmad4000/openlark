import { randomBytes, createHash } from "crypto";
import { db } from "../../db/index.js";
import { apps, eventSubscriptions, oauthCodes } from "../../db/schema/platform.js";
import { eq, and } from "drizzle-orm";

function generateAppId(): string {
  return "cli_" + randomBytes(16).toString("hex");
}

function generateAppSecret(): string {
  return randomBytes(32).toString("hex");
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function generateCode(): string {
  return randomBytes(32).toString("hex");
}

export interface CreateAppInput {
  orgId: string;
  name: string;
  description?: string;
  redirectUris?: string[];
  scopes?: string[];
  botEnabled?: boolean;
  webhookUrl?: string;
}

export interface AppWithSecret {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  appId: string;
  appSecret: string; // Only returned on creation
  redirectUris: string[];
  scopes: string[];
  botEnabled: boolean;
  webhookUrl: string | null;
  createdAt: Date;
}

class PlatformService {
  async createApp(input: CreateAppInput): Promise<AppWithSecret> {
    const appId = generateAppId();
    const appSecret = generateAppSecret();
    const appSecretHash = hashSecret(appSecret);

    const [app] = await db
      .insert(apps)
      .values({
        orgId: input.orgId,
        name: input.name,
        description: input.description ?? null,
        appId,
        appSecretHash,
        redirectUris: input.redirectUris ?? [],
        scopes: input.scopes ?? [],
        botEnabled: input.botEnabled ?? false,
        webhookUrl: input.webhookUrl ?? null,
      })
      .returning();

    return {
      id: app!.id,
      orgId: app!.orgId,
      name: app!.name,
      description: app!.description,
      appId: app!.appId,
      appSecret, // Only returned once
      redirectUris: app!.redirectUris as string[],
      scopes: app!.scopes as string[],
      botEnabled: app!.botEnabled,
      webhookUrl: app!.webhookUrl,
      createdAt: app!.createdAt,
    };
  }

  async listApps(orgId: string) {
    return db
      .select({
        id: apps.id,
        orgId: apps.orgId,
        name: apps.name,
        description: apps.description,
        appId: apps.appId,
        redirectUris: apps.redirectUris,
        scopes: apps.scopes,
        botEnabled: apps.botEnabled,
        webhookUrl: apps.webhookUrl,
        createdAt: apps.createdAt,
      })
      .from(apps)
      .where(eq(apps.orgId, orgId))
      .orderBy(apps.createdAt);
  }

  async getApp(id: string, orgId: string) {
    const [app] = await db
      .select()
      .from(apps)
      .where(and(eq(apps.id, id), eq(apps.orgId, orgId)));
    return app ?? null;
  }

  async getAppByAppId(appId: string) {
    const [app] = await db
      .select()
      .from(apps)
      .where(eq(apps.appId, appId));
    return app ?? null;
  }

  async updateApp(
    id: string,
    orgId: string,
    data: Partial<Pick<CreateAppInput, "name" | "description" | "redirectUris" | "scopes" | "botEnabled" | "webhookUrl">>
  ) {
    const [updated] = await db
      .update(apps)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(apps.id, id), eq(apps.orgId, orgId)))
      .returning();
    return updated ?? null;
  }

  async deleteApp(id: string, orgId: string) {
    const [deleted] = await db
      .delete(apps)
      .where(and(eq(apps.id, id), eq(apps.orgId, orgId)))
      .returning();
    return deleted ?? null;
  }

  async regenerateSecret(id: string, orgId: string): Promise<{ appSecret: string } | null> {
    const newSecret = generateAppSecret();
    const hash = hashSecret(newSecret);
    const [updated] = await db
      .update(apps)
      .set({ appSecretHash: hash, updatedAt: new Date() })
      .where(and(eq(apps.id, id), eq(apps.orgId, orgId)))
      .returning();
    if (!updated) return null;
    return { appSecret: newSecret };
  }

  // Event subscriptions
  async addSubscription(appId: string, eventType: string, callbackUrl: string) {
    const [sub] = await db
      .insert(eventSubscriptions)
      .values({ appId, eventType, callbackUrl })
      .returning();
    return sub;
  }

  async listSubscriptions(appId: string) {
    return db
      .select()
      .from(eventSubscriptions)
      .where(eq(eventSubscriptions.appId, appId));
  }

  async removeSubscription(id: string) {
    await db.delete(eventSubscriptions).where(eq(eventSubscriptions.id, id));
  }

  // OAuth authorization code flow
  async createAuthorizationCode(
    appId: string,
    userId: string,
    orgId: string,
    scopes: string[],
    redirectUri: string
  ): Promise<string> {
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await db.insert(oauthCodes).values({
      code,
      appId,
      userId,
      orgId,
      scopes,
      redirectUri,
      expiresAt,
    });

    return code;
  }

  async exchangeCode(code: string, appId: string, redirectUri: string) {
    const [row] = await db
      .select()
      .from(oauthCodes)
      .where(eq(oauthCodes.code, code));

    if (!row) return null;
    if (row.usedAt) return null;
    if (row.expiresAt < new Date()) return null;
    if (row.redirectUri !== redirectUri) return null;

    // Verify app
    const app = await this.getAppByAppId(appId);
    if (!app || app.id !== row.appId) return null;

    // Mark used
    await db
      .update(oauthCodes)
      .set({ usedAt: new Date() })
      .where(eq(oauthCodes.id, row.id));

    return {
      userId: row.userId,
      orgId: row.orgId,
      scopes: row.scopes as string[],
    };
  }

  verifyAppSecret(secret: string, hash: string): boolean {
    return hashSecret(secret) === hash;
  }
}

export const platformService = new PlatformService();
