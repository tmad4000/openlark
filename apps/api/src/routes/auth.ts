import { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { db } from "../db";
import { users, organizations, sessions, invitations } from "../db/schema";
import { eq, and, gt } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";

const BCRYPT_ROUNDS = 12;
const SESSION_EXPIRY_DAYS = 30;

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

interface RegisterBody {
  email: string;
  password: string;
  display_name: string;
}

interface LoginBody {
  email: string;
  password: string;
}

interface AcceptInviteParams {
  token: string;
}

interface AcceptInviteBody {
  password: string;
  display_name: string;
}

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: RegisterBody }>("/auth/register", async (request, reply) => {
    const { email, password, display_name } = request.body;

    // Validate email format
    if (!email || !EMAIL_REGEX.test(email)) {
      return reply.status(400).send({
        error: "Invalid email format",
      });
    }

    // Validate password length
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return reply.status(400).send({
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    // Validate display_name
    if (!display_name || display_name.trim().length === 0) {
      return reply.status(400).send({
        error: "Display name is required",
      });
    }

    // Check if email already exists
    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existingUser.length > 0) {
      return reply.status(409).send({
        error: "Email already exists",
      });
    }

    // Hash password with bcrypt (12 rounds)
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create personal organization for the user
    const [org] = await db
      .insert(organizations)
      .values({
        name: `${display_name}'s Workspace`,
      })
      .returning();

    // Create user
    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        displayName: display_name,
        orgId: org.id,
      })
      .returning({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        timezone: users.timezone,
        locale: users.locale,
        status: users.status,
        orgId: users.orgId,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    // Generate session token (32 bytes = 64 hex chars)
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Calculate expiry date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

    // Create session
    await db.insert(sessions).values({
      userId: user.id,
      tokenHash,
      ip: request.ip,
      deviceInfo: {
        userAgent: request.headers["user-agent"],
      },
      expiresAt,
    });

    return reply.status(201).send({
      user,
      token,
    });
  });

  // Login endpoint
  fastify.post<{ Body: LoginBody }>("/auth/login", async (request, reply) => {
    const { email, password } = request.body;

    // Validate input presence
    if (!email || !password) {
      return reply.status(401).send({
        error: "Invalid email or password",
      });
    }

    // Find user by email
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    // User not found - return generic error to prevent email enumeration
    if (!user) {
      return reply.status(401).send({
        error: "Invalid email or password",
      });
    }

    // User has no password (e.g., OAuth-only account)
    if (!user.passwordHash) {
      return reply.status(401).send({
        error: "Invalid email or password",
      });
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      return reply.status(401).send({
        error: "Invalid email or password",
      });
    }

    // Generate session token (32 bytes = 64 hex chars)
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Calculate expiry date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

    // Create session record
    await db.insert(sessions).values({
      userId: user.id,
      tokenHash,
      ip: request.ip,
      deviceInfo: {
        userAgent: request.headers["user-agent"],
      },
      expiresAt,
    });

    // Return user (without password hash) and token
    return reply.status(200).send({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
        locale: user.locale,
        status: user.status,
        orgId: user.orgId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      token,
    });
  });

  // Logout endpoint - invalidates the current session
  fastify.post(
    "/auth/logout",
    { preHandler: authMiddleware },
    async (request, reply) => {
      // Delete the current session
      await db.delete(sessions).where(eq(sessions.id, request.sessionId));

      return reply.status(200).send({
        message: "Logged out successfully",
      });
    }
  );

  // Get current user endpoint
  fastify.get(
    "/auth/me",
    { preHandler: authMiddleware },
    async (request, reply) => {
      return reply.status(200).send({
        user: request.user,
        org: request.org,
      });
    }
  );

  /**
   * GET /auth/accept-invite/:token - Validate invitation and return info
   * Returns invitation details if valid
   */
  fastify.get<{ Params: AcceptInviteParams }>(
    "/auth/accept-invite/:token",
    async (request, reply) => {
      const { token } = request.params;

      if (!token) {
        return reply.status(400).send({
          error: "Invitation token is required",
        });
      }

      // Hash the token to look up
      const tokenHash = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

      // Find the invitation
      const [invitation] = await db
        .select({
          id: invitations.id,
          email: invitations.email,
          orgId: invitations.orgId,
          status: invitations.status,
          expiresAt: invitations.expiresAt,
        })
        .from(invitations)
        .where(eq(invitations.tokenHash, tokenHash))
        .limit(1);

      if (!invitation) {
        return reply.status(404).send({
          error: "Invalid invitation token",
        });
      }

      // Check if invitation is still pending
      if (invitation.status !== "pending") {
        return reply.status(400).send({
          error: `Invitation has already been ${invitation.status}`,
        });
      }

      // Check if invitation has expired
      if (new Date() > invitation.expiresAt) {
        // Update status to expired
        await db
          .update(invitations)
          .set({ status: "expired" })
          .where(eq(invitations.id, invitation.id));

        return reply.status(400).send({
          error: "Invitation has expired",
        });
      }

      // Get organization details
      const [org] = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          logoUrl: organizations.logoUrl,
        })
        .from(organizations)
        .where(eq(organizations.id, invitation.orgId))
        .limit(1);

      if (!org) {
        return reply.status(404).send({
          error: "Organization not found",
        });
      }

      // Check if user already exists
      const [existingUser] = await db
        .select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(eq(users.email, invitation.email))
        .limit(1);

      return reply.status(200).send({
        invitation: {
          email: invitation.email,
          orgId: org.id,
          orgName: org.name,
          orgLogoUrl: org.logoUrl,
        },
        existingUser: existingUser
          ? { id: existingUser.id, displayName: existingUser.displayName }
          : null,
      });
    }
  );

  /**
   * POST /auth/accept-invite/:token - Accept invitation and create/update user
   * Creates new user or adds existing user to organization
   */
  fastify.post<{ Params: AcceptInviteParams; Body: AcceptInviteBody }>(
    "/auth/accept-invite/:token",
    async (request, reply) => {
      const { token } = request.params;
      const { password, display_name } = request.body;

      if (!token) {
        return reply.status(400).send({
          error: "Invitation token is required",
        });
      }

      // Hash the token to look up
      const tokenHash = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

      // Find the invitation
      const [invitation] = await db
        .select()
        .from(invitations)
        .where(eq(invitations.tokenHash, tokenHash))
        .limit(1);

      if (!invitation) {
        return reply.status(404).send({
          error: "Invalid invitation token",
        });
      }

      // Check if invitation is still pending
      if (invitation.status !== "pending") {
        return reply.status(400).send({
          error: `Invitation has already been ${invitation.status}`,
        });
      }

      // Check if invitation has expired
      if (new Date() > invitation.expiresAt) {
        // Update status to expired
        await db
          .update(invitations)
          .set({ status: "expired" })
          .where(eq(invitations.id, invitation.id));

        return reply.status(400).send({
          error: "Invitation has expired",
        });
      }

      // Check if user already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, invitation.email))
        .limit(1);

      let user;

      if (existingUser) {
        // Update existing user to join the new organization
        const [updatedUser] = await db
          .update(users)
          .set({
            orgId: invitation.orgId,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingUser.id))
          .returning({
            id: users.id,
            email: users.email,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
            timezone: users.timezone,
            locale: users.locale,
            status: users.status,
            orgId: users.orgId,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
          });

        user = updatedUser;
      } else {
        // Create new user - password and display_name required
        if (!password || password.length < MIN_PASSWORD_LENGTH) {
          return reply.status(400).send({
            error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
          });
        }

        if (!display_name || display_name.trim().length === 0) {
          return reply.status(400).send({
            error: "Display name is required",
          });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

        // Create new user
        const [newUser] = await db
          .insert(users)
          .values({
            email: invitation.email,
            passwordHash,
            displayName: display_name.trim(),
            orgId: invitation.orgId,
          })
          .returning({
            id: users.id,
            email: users.email,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
            timezone: users.timezone,
            locale: users.locale,
            status: users.status,
            orgId: users.orgId,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
          });

        user = newUser;
      }

      // Mark invitation as accepted
      await db
        .update(invitations)
        .set({
          status: "accepted",
          acceptedAt: new Date(),
        })
        .where(eq(invitations.id, invitation.id));

      // Generate session token
      const sessionToken = crypto.randomBytes(32).toString("hex");
      const sessionTokenHash = crypto
        .createHash("sha256")
        .update(sessionToken)
        .digest("hex");

      // Calculate expiry date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

      // Create session
      await db.insert(sessions).values({
        userId: user.id,
        tokenHash: sessionTokenHash,
        ip: request.ip,
        deviceInfo: {
          userAgent: request.headers["user-agent"],
        },
        expiresAt,
      });

      return reply.status(200).send({
        user,
        token: sessionToken,
      });
    }
  );
}
