import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { ssoConfigs } from "../../db/schema/index.js";

class SsoService {
  async getConfig(orgId: string) {
    const configs = await db
      .select()
      .from(ssoConfigs)
      .where(eq(ssoConfigs.orgId, orgId))
      .limit(1);
    return configs[0] || null;
  }

  async createConfig(
    orgId: string,
    data: { entityId: string; ssoUrl: string; certificate: string }
  ) {
    const [config] = await db
      .insert(ssoConfigs)
      .values({
        orgId,
        entityId: data.entityId,
        ssoUrl: data.ssoUrl,
        certificate: data.certificate,
      })
      .returning();
    return config;
  }

  async updateConfig(
    orgId: string,
    data: {
      entityId?: string;
      ssoUrl?: string;
      certificate?: string;
      isEnabled?: boolean;
    }
  ) {
    const updates: Record<string, unknown> = {};
    if (data.entityId !== undefined) updates.entityId = data.entityId;
    if (data.ssoUrl !== undefined) updates.ssoUrl = data.ssoUrl;
    if (data.certificate !== undefined) updates.certificate = data.certificate;
    if (data.isEnabled !== undefined) updates.isEnabled = data.isEnabled;
    updates.updatedAt = new Date();

    const [config] = await db
      .update(ssoConfigs)
      .set(updates)
      .where(eq(ssoConfigs.orgId, orgId))
      .returning();
    return config || null;
  }
}

export const ssoService = new SsoService();
