import { FastifyInstance } from "fastify";
import crypto from "crypto";
import { db } from "../db";
import { ssoConfigs, users, sessions, organizations } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";

const SESSION_EXPIRY_DAYS = 30;

// ── Interfaces ──────────────────────────────────────────────────────

interface SsoConfigBody {
  metadata_url?: string;
  entity_id: string;
  sso_url: string;
  certificate: string;
  enabled?: boolean;
}

interface SsoConfigParams {
  configId: string;
}

interface SamlLoginQuery {
  org_id: string;
}

// ── Helpers ─────────────────────────────────────────────────────────

function buildAuthnRequest(spEntityId: string, acsUrl: string, idpSsoUrl: string): string {
  const id = `_${crypto.randomUUID()}`;
  const issueInstant = new Date().toISOString();

  const request = `<samlp:AuthnRequest
    xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="${id}"
    Version="2.0"
    IssueInstant="${issueInstant}"
    Destination="${idpSsoUrl}"
    AssertionConsumerServiceURL="${acsUrl}"
    ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
    <saml:Issuer>${spEntityId}</saml:Issuer>
    <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/>
  </samlp:AuthnRequest>`;

  return request;
}

function extractXmlValue(xml: string, tagName: string): string | null {
  // Match both <ns:tag> and <tag> forms
  const patterns = [
    new RegExp(`<[^>]*?:${tagName}[^>]*?>([^<]+)<`, "i"),
    new RegExp(`<${tagName}[^>]*?>([^<]+)<`, "i"),
  ];
  for (const re of patterns) {
    const m = xml.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

function extractAttributeValue(xml: string, attrName: string): string | null {
  // Find Attribute with given Name, then extract its AttributeValue
  const attrRe = new RegExp(
    `<[^>]*Attribute[^>]*Name=["']${attrName}["'][^>]*>[\\s\\S]*?<[^>]*AttributeValue[^>]*>([^<]+)<`,
    "i"
  );
  const m = xml.match(attrRe);
  return m ? m[1].trim() : null;
}

function parseSamlResponse(xml: string): {
  nameId: string | null;
  email: string | null;
  displayName: string | null;
  issuer: string | null;
} {
  const nameId = extractXmlValue(xml, "NameID");
  const issuer = extractXmlValue(xml, "Issuer");

  // Try to get email from attributes, fall back to NameID
  const emailAttr =
    extractAttributeValue(xml, "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress") ||
    extractAttributeValue(xml, "email") ||
    extractAttributeValue(xml, "Email") ||
    extractAttributeValue(xml, "mail");

  const displayNameAttr =
    extractAttributeValue(xml, "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name") ||
    extractAttributeValue(xml, "displayName") ||
    extractAttributeValue(xml, "name") ||
    extractAttributeValue(xml, "cn");

  const email = emailAttr || nameId;

  return { nameId, email, displayName: displayNameAttr, issuer };
}

function createSession(userId: string, ip: string, userAgent?: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

  return { token, tokenHash, expiresAt, userId, ip, userAgent };
}

// ── Routes ──────────────────────────────────────────────────────────

export async function samlRoutes(fastify: FastifyInstance) {
  // ── Admin: List SSO configs for org ─────────────────────────────
  fastify.get(
    "/admin/sso",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!request.user.orgId) {
        return reply.status(403).send({ error: "No organization" });
      }
      if (request.user.role !== "owner" && request.user.role !== "admin") {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const configs = await db
        .select({
          id: ssoConfigs.id,
          orgId: ssoConfigs.orgId,
          provider: ssoConfigs.provider,
          metadataUrl: ssoConfigs.metadataUrl,
          entityId: ssoConfigs.entityId,
          ssoUrl: ssoConfigs.ssoUrl,
          certificate: ssoConfigs.certificate,
          enabled: ssoConfigs.enabled,
          createdAt: ssoConfigs.createdAt,
          updatedAt: ssoConfigs.updatedAt,
        })
        .from(ssoConfigs)
        .where(eq(ssoConfigs.orgId, request.user.orgId));

      return reply.send({ configs });
    }
  );

  // ── Admin: Create SSO config ────────────────────────────────────
  fastify.post<{ Body: SsoConfigBody }>(
    "/admin/sso",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!request.user.orgId) {
        return reply.status(403).send({ error: "No organization" });
      }
      if (request.user.role !== "owner" && request.user.role !== "admin") {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const { metadata_url, entity_id, sso_url, certificate, enabled } = request.body;

      if (!entity_id || !sso_url || !certificate) {
        return reply.status(400).send({
          error: "entity_id, sso_url, and certificate are required",
        });
      }

      const [config] = await db
        .insert(ssoConfigs)
        .values({
          orgId: request.user.orgId,
          metadataUrl: metadata_url || null,
          entityId: entity_id,
          ssoUrl: sso_url,
          certificate,
          enabled: enabled ?? false,
        })
        .returning();

      return reply.status(201).send({ config });
    }
  );

  // ── Admin: Update SSO config ────────────────────────────────────
  fastify.put<{ Params: SsoConfigParams; Body: SsoConfigBody }>(
    "/admin/sso/:configId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!request.user.orgId) {
        return reply.status(403).send({ error: "No organization" });
      }
      if (request.user.role !== "owner" && request.user.role !== "admin") {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const { configId } = request.params;
      const { metadata_url, entity_id, sso_url, certificate, enabled } = request.body;

      const [existing] = await db
        .select()
        .from(ssoConfigs)
        .where(
          and(eq(ssoConfigs.id, configId), eq(ssoConfigs.orgId, request.user.orgId))
        )
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: "SSO config not found" });
      }

      const [updated] = await db
        .update(ssoConfigs)
        .set({
          metadataUrl: metadata_url ?? existing.metadataUrl,
          entityId: entity_id ?? existing.entityId,
          ssoUrl: sso_url ?? existing.ssoUrl,
          certificate: certificate ?? existing.certificate,
          enabled: enabled ?? existing.enabled,
          updatedAt: new Date(),
        })
        .where(eq(ssoConfigs.id, configId))
        .returning();

      return reply.send({ config: updated });
    }
  );

  // ── Admin: Delete SSO config ────────────────────────────────────
  fastify.delete<{ Params: SsoConfigParams }>(
    "/admin/sso/:configId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!request.user.orgId) {
        return reply.status(403).send({ error: "No organization" });
      }
      if (request.user.role !== "owner" && request.user.role !== "admin") {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const { configId } = request.params;

      const [existing] = await db
        .select({ id: ssoConfigs.id })
        .from(ssoConfigs)
        .where(
          and(eq(ssoConfigs.id, configId), eq(ssoConfigs.orgId, request.user.orgId))
        )
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: "SSO config not found" });
      }

      await db.delete(ssoConfigs).where(eq(ssoConfigs.id, configId));

      return reply.send({ message: "SSO config deleted" });
    }
  );

  // ── SP-initiated login: redirect to IdP ─────────────────────────
  fastify.get<{ Querystring: SamlLoginQuery }>(
    "/auth/saml/login",
    async (request, reply) => {
      const { org_id } = request.query;

      if (!org_id) {
        return reply.status(400).send({ error: "org_id query parameter required" });
      }

      // Find enabled SSO config for org
      const [config] = await db
        .select()
        .from(ssoConfigs)
        .where(and(eq(ssoConfigs.orgId, org_id), eq(ssoConfigs.enabled, true)))
        .limit(1);

      if (!config) {
        return reply.status(404).send({ error: "SSO not configured for this organization" });
      }

      // Build SAML AuthnRequest
      const baseUrl = `${request.protocol}://${request.hostname}`;
      const acsUrl = `${baseUrl}/auth/saml/callback`;
      const spEntityId = `${baseUrl}/saml/metadata`;

      const authnRequest = buildAuthnRequest(spEntityId, acsUrl, config.ssoUrl);
      const encoded = Buffer.from(authnRequest).toString("base64");

      // HTTP-Redirect binding: append SAMLRequest as query param
      const separator = config.ssoUrl.includes("?") ? "&" : "?";
      const redirectUrl = `${config.ssoUrl}${separator}SAMLRequest=${encodeURIComponent(encoded)}&RelayState=${encodeURIComponent(org_id)}`;

      return reply.redirect(redirectUrl);
    }
  );

  // ── IdP-initiated / ACS callback: process SAML response ────────
  fastify.post<{ Body: { SAMLResponse?: string; RelayState?: string } }>(
    "/auth/saml/callback",
    async (request, reply) => {
      const { SAMLResponse, RelayState } = request.body;

      if (!SAMLResponse) {
        return reply.status(400).send({ error: "SAMLResponse is required" });
      }

      // Decode the SAML response
      const decodedXml = Buffer.from(SAMLResponse, "base64").toString("utf-8");
      const parsed = parseSamlResponse(decodedXml);

      if (!parsed.email) {
        return reply.status(400).send({ error: "Could not extract email from SAML response" });
      }

      const email = parsed.email.toLowerCase();

      // Find the SSO config by issuer or RelayState (org_id)
      let orgId = RelayState || null;
      let ssoConfig: typeof ssoConfigs.$inferSelect | null = null;

      if (orgId) {
        const [found] = await db
          .select()
          .from(ssoConfigs)
          .where(and(eq(ssoConfigs.orgId, orgId), eq(ssoConfigs.enabled, true)))
          .limit(1);
        ssoConfig = found || null;
      }

      if (!ssoConfig && parsed.issuer) {
        // Try to match by issuer entity ID
        const [found] = await db
          .select()
          .from(ssoConfigs)
          .where(and(eq(ssoConfigs.entityId, parsed.issuer), eq(ssoConfigs.enabled, true)))
          .limit(1);
        ssoConfig = found || null;

        if (ssoConfig) {
          orgId = ssoConfig.orgId;
        }
      }

      if (!ssoConfig || !orgId) {
        return reply.status(400).send({ error: "Could not identify SSO configuration" });
      }

      // Auto-create or link user
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      let userId: string;

      if (existingUser) {
        // Link user to this org if not already
        if (existingUser.orgId !== orgId) {
          await db
            .update(users)
            .set({ orgId, updatedAt: new Date() })
            .where(eq(users.id, existingUser.id));
        }
        userId = existingUser.id;
      } else {
        // Auto-create user (no password needed for SSO users)
        const displayName =
          parsed.displayName || email.split("@")[0];

        const [newUser] = await db
          .insert(users)
          .values({
            email,
            displayName,
            orgId,
          })
          .returning();

        userId = newUser.id;
      }

      // Create session
      const sess = createSession(
        userId,
        request.ip,
        request.headers["user-agent"]
      );

      await db.insert(sessions).values({
        userId: sess.userId,
        tokenHash: sess.tokenHash,
        ip: sess.ip,
        deviceInfo: { userAgent: sess.userAgent },
        expiresAt: sess.expiresAt,
      });

      // Redirect to web app with session token
      const webUrl = process.env.WEB_URL || "http://localhost:3000";
      return reply.redirect(
        `${webUrl}/auth/sso-callback?token=${encodeURIComponent(sess.token)}`
      );
    }
  );
}
