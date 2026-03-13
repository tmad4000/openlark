import { FastifyInstance } from "fastify";
import crypto from "crypto";
import { db } from "../db";
import { organizations, users, apiKeys, invitations } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";

const INVITATION_EXPIRY_DAYS = 7;

interface CreateOrgBody {
  name: string;
  domain?: string;
}

interface UpdateOrgBody {
  name?: string;
  logo_url?: string;
  industry?: string;
  settings?: Record<string, unknown>;
}

interface OrgParams {
  id: string;
}

interface CreateInvitationsBody {
  emails: string[];
}

export async function orgsRoutes(fastify: FastifyInstance) {
  /**
   * POST /orgs - Create a new organization
   * Creator becomes the primary admin
   */
  fastify.post<{ Body: CreateOrgBody }>(
    "/orgs",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { name, domain } = request.body;

      // Validate name
      if (!name || name.trim().length === 0) {
        return reply.status(400).send({
          error: "Organization name is required",
        });
      }

      // Check if domain is already taken (if provided)
      if (domain) {
        const existingOrg = await db
          .select({ id: organizations.id })
          .from(organizations)
          .where(eq(organizations.domain, domain.toLowerCase()))
          .limit(1);

        if (existingOrg.length > 0) {
          return reply.status(409).send({
            error: "Domain already in use",
          });
        }
      }

      // Create organization with current user as primary admin
      const [org] = await db
        .insert(organizations)
        .values({
          name: name.trim(),
          domain: domain?.toLowerCase() || null,
        })
        .returning();

      // Update user to belong to the new organization
      await db
        .update(users)
        .set({
          orgId: org.id,
          updatedAt: new Date(),
        })
        .where(eq(users.id, request.user.id));

      return reply.status(201).send({
        org,
      });
    }
  );

  /**
   * GET /orgs/:id - Get organization details
   */
  fastify.get<{ Params: OrgParams }>(
    "/orgs/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return reply.status(400).send({
          error: "Invalid organization ID format",
        });
      }

      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, id))
        .limit(1);

      if (!org) {
        return reply.status(404).send({
          error: "Organization not found",
        });
      }

      // Users can only view organizations they belong to
      if (request.user.orgId !== org.id) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      return reply.status(200).send({
        org,
      });
    }
  );

  /**
   * PATCH /orgs/:id - Update organization settings
   * Only primary admin or users with org.manage scope can update
   */
  fastify.patch<{ Params: OrgParams; Body: UpdateOrgBody }>(
    "/orgs/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { name, logo_url, industry, settings } = request.body;

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return reply.status(400).send({
          error: "Invalid organization ID format",
        });
      }

      // Find the organization
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, id))
        .limit(1);

      if (!org) {
        return reply.status(404).send({
          error: "Organization not found",
        });
      }

      // Check authorization: must be org member with manage scope via API key
      const isPrimaryAdmin = false; // TODO: implement admin role check

      // Check if user has org.manage scope
      let hasManageScope = false;
      if (!isPrimaryAdmin) {
        // Check API keys for org.manage scope
        const [key] = await db
          .select()
          .from(apiKeys)
          .where(
            and(
              eq(apiKeys.userId, request.user.id),
              eq(apiKeys.orgId, id)
            )
          )
          .limit(1);

        if (key && key.scopes.includes("org.manage")) {
          hasManageScope = true;
        }
      }

      if (!isPrimaryAdmin && !hasManageScope) {
        return reply.status(403).send({
          error: "Only primary admin or users with org.manage scope can update organization",
        });
      }

      // Build update object
      const updates: Partial<{
        name: string;
        logoUrl: string | null;
        industry: string | null;
        settings: Record<string, unknown>;
        updatedAt: Date;
      }> = {
        updatedAt: new Date(),
      };

      if (name !== undefined) {
        if (name.trim().length === 0) {
          return reply.status(400).send({
            error: "Organization name cannot be empty",
          });
        }
        updates.name = name.trim();
      }

      if (logo_url !== undefined) {
        updates.logoUrl = logo_url;
      }

      if (industry !== undefined) {
        updates.industry = industry;
      }

      if (settings !== undefined) {
        updates.settings = settings;
      }

      // Update organization
      const [updatedOrg] = await db
        .update(organizations)
        .set(updates)
        .where(eq(organizations.id, id))
        .returning();

      return reply.status(200).send({
        org: updatedOrg,
      });
    }
  );

  /**
   * POST /orgs/:id/invitations - Send invitations to join the organization
   * Returns invitation links for each email
   */
  fastify.post<{ Params: OrgParams; Body: CreateInvitationsBody }>(
    "/orgs/:id/invitations",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { emails } = request.body;

      // Validate UUID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return reply.status(400).send({
          error: "Invalid organization ID format",
        });
      }

      // Validate emails array
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return reply.status(400).send({
          error: "At least one email is required",
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalidEmails = emails.filter(
        (email) => !emailRegex.test(email)
      );
      if (invalidEmails.length > 0) {
        return reply.status(400).send({
          error: `Invalid email format: ${invalidEmails.join(", ")}`,
        });
      }

      // Find the organization
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, id))
        .limit(1);

      if (!org) {
        return reply.status(404).send({
          error: "Organization not found",
        });
      }

      // Check user belongs to organization
      if (request.user.orgId !== org.id) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Calculate expiry date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

      // Create invitations for each email
      const invitationResults: Array<{
        email: string;
        link: string;
        token: string;
      }> = [];

      for (const email of emails) {
        const normalizedEmail = email.toLowerCase().trim();

        // Check if user already exists in this org
        const [existingUser] = await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.email, normalizedEmail),
              eq(users.orgId, org.id)
            )
          )
          .limit(1);

        if (existingUser) {
          // Skip users already in org
          continue;
        }

        // Check if there's already a pending invitation
        const [existingInvitation] = await db
          .select({ id: invitations.id })
          .from(invitations)
          .where(
            and(
              eq(invitations.orgId, org.id),
              eq(invitations.email, normalizedEmail),
              eq(invitations.status, "pending")
            )
          )
          .limit(1);

        if (existingInvitation) {
          // Skip if already invited
          continue;
        }

        // Generate invitation token (32 bytes = 64 hex chars)
        const token = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto
          .createHash("sha256")
          .update(token)
          .digest("hex");

        // Create invitation
        await db.insert(invitations).values({
          orgId: org.id,
          email: normalizedEmail,
          tokenHash,
          invitedById: request.user.id,
          expiresAt,
        });

        // Build invitation link
        const baseUrl = process.env.WEB_URL || "http://localhost:3000";
        const link = `${baseUrl}/accept-invite/${token}`;

        invitationResults.push({
          email: normalizedEmail,
          link,
          token,
        });
      }

      return reply.status(201).send({
        invitations: invitationResults,
        orgId: org.id,
        orgName: org.name,
      });
    }
  );
}
