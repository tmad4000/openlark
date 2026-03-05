import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../../db/index.js";
import { users, organizations, sessions } from "../../db/schema/index.js";
import { config } from "../../config.js";
import { eq, and, isNull } from "drizzle-orm";
import type { User, Organization } from "../../db/schema/auth.js";
import crypto from "crypto";

const SALT_ROUNDS = 12;

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
  orgName: string;
  orgDomain?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  user: Omit<User, "passwordHash" | "totpSecret">;
  organization: Organization;
  token: string;
  session: { id: string; expiresAt: Date };
}

export interface TokenPayload {
  sub: string; // user id
  orgId: string;
  sessionId: string;
  email: string;
  role: string;
}

export class AuthService {
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  generateToken(payload: TokenPayload): string {
    return jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    });
  }

  verifyToken(token: string): TokenPayload {
    return jwt.verify(token, config.JWT_SECRET) as TokenPayload;
  }

  async register(input: RegisterInput): Promise<AuthResult> {
    const passwordHash = await this.hashPassword(input.password);

    // Create organization first
    const [org] = await db
      .insert(organizations)
      .values({
        name: input.orgName,
        domain: input.orgDomain,
      })
      .returning();

    if (!org) {
      throw new Error("Failed to create organization");
    }

    // Create user as primary admin
    const [user] = await db
      .insert(users)
      .values({
        orgId: org.id,
        email: input.email.toLowerCase(),
        passwordHash,
        displayName: input.displayName || input.email.split("@")[0],
        status: "active",
        role: "primary_admin",
        emailVerifiedAt: new Date(), // Auto-verify for founder
      })
      .returning();

    if (!user) {
      throw new Error("Failed to create user");
    }

    // Create session
    const sessionResult = await this.createSession(user.id, user.orgId);

    // Build token
    const token = this.generateToken({
      sub: user.id,
      orgId: org.id,
      sessionId: sessionResult.id,
      email: user.email,
      role: user.role,
    });

    // Remove sensitive fields from user
    const { passwordHash: _, totpSecret: __, ...safeUser } = user;

    return {
      user: safeUser,
      organization: org,
      token,
      session: {
        id: sessionResult.id,
        expiresAt: sessionResult.expiresAt,
      },
    };
  }

  async login(input: LoginInput): Promise<AuthResult | null> {
    const email = input.email.toLowerCase();

    // Find user by email (across all orgs for now; in multi-tenant could require org context)
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    if (!user || !user.passwordHash) {
      return null;
    }

    const validPassword = await this.verifyPassword(
      input.password,
      user.passwordHash
    );
    if (!validPassword) {
      return null;
    }

    // Get organization
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, user.orgId))
      .limit(1);

    if (!org) {
      return null;
    }

    // Create session
    const sessionResult = await this.createSession(user.id, user.orgId);

    if (!sessionResult) {
      throw new Error("Failed to create session");
    }

    // Build token
    const token = this.generateToken({
      sub: user.id,
      orgId: org.id,
      sessionId: sessionResult.id,
      email: user.email,
      role: user.role,
    });

    const { passwordHash: _, totpSecret: __, ...safeUser } = user;

    return {
      user: safeUser,
      organization: org,
      token,
      session: {
        id: sessionResult.id,
        expiresAt: sessionResult.expiresAt,
      },
    };
  }

  private async createSession(
    userId: string,
    orgId: string,
    deviceInfo?: Record<string, unknown>,
    ip?: string
  ) {
    // Parse JWT_EXPIRES_IN to calculate expiration
    const expiresIn = config.JWT_EXPIRES_IN;
    const expiresAt = this.calculateExpiry(expiresIn);

    // Generate a random token for the session (hashed in DB)
    const sessionToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(sessionToken)
      .digest("hex");

    const [session] = await db
      .insert(sessions)
      .values({
        userId,
        tokenHash,
        deviceInfo: deviceInfo || {},
        ip,
        expiresAt,
      })
      .returning();

    if (!session) {
      throw new Error("Failed to create session");
    }

    return session;
  }

  private calculateExpiry(expiresIn: string): Date {
    const now = new Date();
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      // Default to 7 days
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    const value = match[1]!;
    const unit = match[2] as "s" | "m" | "h" | "d";
    const multipliers = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    } as const;
    return new Date(now.getTime() + parseInt(value) * multipliers[unit]);
  }

  async logout(sessionId: string): Promise<void> {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, sessionId));
  }

  async getSessionById(sessionId: string) {
    const [session] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.id, sessionId),
          isNull(sessions.revokedAt)
        )
      )
      .limit(1);

    if (!session) return null;

    // Check expiration
    if (session.expiresAt < new Date()) {
      return null;
    }

    return session;
  }

  async getUserById(userId: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (!user) return null;

    const { passwordHash: _, totpSecret: __, ...safeUser } = user;
    return safeUser;
  }

  async getOrganizationById(orgId: string) {
    const [org] = await db
      .select()
      .from(organizations)
      .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
      .limit(1);

    return org || null;
  }
}

export const authService = new AuthService();
