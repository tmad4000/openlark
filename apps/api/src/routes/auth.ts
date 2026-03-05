import { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { db } from "../db";
import { users, organizations, sessions } from "../db/schema";
import { eq } from "drizzle-orm";

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
}
