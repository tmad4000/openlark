import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../../db/index.js";
import {
  users,
  organizations,
  sessions,
  invitations,
  departments,
  departmentMembers,
} from "../../db/schema/index.js";
import { config } from "../../config.js";
import { eq, and, isNull, gt, ilike } from "drizzle-orm";
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

  async createOrganization(
    input: { name: string; domain?: string },
    creatorUserId: string
  ) {
    const [org] = await db
      .insert(organizations)
      .values({
        name: input.name,
        domain: input.domain,
      })
      .returning();

    if (!org) {
      throw new Error("Failed to create organization");
    }

    // Move creator to the new org as primary_admin
    await db
      .update(users)
      .set({
        orgId: org.id,
        role: "primary_admin",
        updatedAt: new Date(),
      })
      .where(eq(users.id, creatorUserId));

    return org;
  }

  async updateOrganization(
    orgId: string,
    input: {
      name?: string;
      logoUrl?: string | null;
      industry?: string;
      settings?: Record<string, unknown>;
    }
  ) {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.logoUrl !== undefined) updates.logoUrl = input.logoUrl;
    if (input.industry !== undefined) updates.industry = input.industry;
    if (input.settings !== undefined) updates.settingsJson = input.settings;

    const [org] = await db
      .update(organizations)
      .set(updates)
      .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
      .returning();

    return org || null;
  }

  async getOrganizationById(orgId: string) {
    const [org] = await db
      .select()
      .from(organizations)
      .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
      .limit(1);

    return org || null;
  }

  /**
   * Get all active sessions for a user
   * FR-1.10: Session management — view active sessions
   */
  async getUserSessions(userId: string) {
    const now = new Date();
    return db
      .select({
        id: sessions.id,
        deviceInfo: sessions.deviceInfo,
        ip: sessions.ip,
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now)
        )
      )
      .orderBy(sessions.createdAt);
  }

  /**
   * Search for users in the same organization
   * Used for attendee selection in calendar events, chat member selection, etc.
   */
  async searchOrgUsers(orgId: string, query?: string, limit = 20) {
    // Build conditions
    const conditions = [
      eq(users.orgId, orgId),
      isNull(users.deletedAt),
      eq(users.status, "active"),
    ];

    // Add search filter if query provided
    if (query && query.trim().length > 0) {
      conditions.push(ilike(users.displayName, `%${query.trim()}%`));
    }

    const results = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(and(...conditions))
      .orderBy(users.displayName)
      .limit(limit);

    return results;
  }

  /**
   * Revoke a specific session
   * FR-1.10: Session management — revoke remotely
   */
  async revokeSession(sessionId: string, userId: string): Promise<boolean> {
    // Verify the session belongs to the user
    const [session] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt)
        )
      )
      .limit(1);

    if (!session) {
      return false;
    }

    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, sessionId));

    return true;
  }
  /**
   * Create invitations for one or more emails
   */
  async createInvitations(
    orgId: string,
    emails: string[],
    createdBy: string
  ) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const results: Array<{
      email: string;
      token: string;
      id: string;
    }> = [];

    for (const rawEmail of emails) {
      const email = rawEmail.toLowerCase();
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

      try {
        const [invitation] = await db
          .insert(invitations)
          .values({
            orgId,
            email,
            tokenHash,
            expiresAt,
            createdBy,
          })
          .returning();

        if (invitation) {
          results.push({ email, token, id: invitation.id });
        }
      } catch (error) {
        // Skip duplicates (unique constraint on pending invitations)
        if (
          error instanceof Error &&
          error.message.includes("unique constraint")
        ) {
          continue;
        }
        throw error;
      }
    }

    return results;
  }

  /**
   * Get pending invitations for an organization
   */
  async getOrgInvitations(orgId: string) {
    return db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        createdAt: invitations.createdAt,
        expiresAt: invitations.expiresAt,
        createdBy: invitations.createdBy,
      })
      .from(invitations)
      .where(
        and(
          eq(invitations.orgId, orgId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt)
        )
      )
      .orderBy(invitations.createdAt);
  }

  /**
   * Find a valid invitation by token
   */
  async getInvitationByToken(token: string) {
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const [invitation] = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.tokenHash, tokenHash),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt)
        )
      )
      .limit(1);

    if (!invitation) return null;

    // Check expiration
    if (invitation.expiresAt < new Date()) {
      return null;
    }

    return invitation;
  }

  /**
   * Accept an invitation: create user in org (or add existing user to org)
   */
  async acceptInvitation(
    token: string,
    input: { password: string; displayName?: string }
  ): Promise<AuthResult | null> {
    const invitation = await this.getInvitationByToken(token);
    if (!invitation) return null;

    // Get the organization
    const org = await this.getOrganizationById(invitation.orgId);
    if (!org) return null;

    // Check if user already exists in this org
    const [existingUser] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.email, invitation.email),
          eq(users.orgId, invitation.orgId),
          isNull(users.deletedAt)
        )
      )
      .limit(1);

    if (existingUser) {
      // User already in org, just mark invitation as accepted
      await db
        .update(invitations)
        .set({ acceptedAt: new Date() })
        .where(eq(invitations.id, invitation.id));

      const sessionResult = await this.createSession(
        existingUser.id,
        existingUser.orgId
      );
      const authToken = this.generateToken({
        sub: existingUser.id,
        orgId: org.id,
        sessionId: sessionResult.id,
        email: existingUser.email,
        role: existingUser.role,
      });
      const { passwordHash: _, totpSecret: __, ...safeUser } = existingUser;
      return {
        user: safeUser,
        organization: org,
        token: authToken,
        session: { id: sessionResult.id, expiresAt: sessionResult.expiresAt },
      };
    }

    // Create new user in the org
    const passwordHash = await this.hashPassword(input.password);
    const [user] = await db
      .insert(users)
      .values({
        orgId: invitation.orgId,
        email: invitation.email,
        passwordHash,
        displayName:
          input.displayName || invitation.email.split("@")[0],
        status: "active",
        role: invitation.role,
        emailVerifiedAt: new Date(),
      })
      .returning();

    if (!user) {
      throw new Error("Failed to create user");
    }

    // Mark invitation as accepted
    await db
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, invitation.id));

    // Create session
    const sessionResult = await this.createSession(user.id, user.orgId);
    const authToken = this.generateToken({
      sub: user.id,
      orgId: org.id,
      sessionId: sessionResult.id,
      email: user.email,
      role: user.role,
    });

    const { passwordHash: _pw, totpSecret: _totp, ...safeUser } = user;

    return {
      user: safeUser,
      organization: org,
      token: authToken,
      session: { id: sessionResult.id, expiresAt: sessionResult.expiresAt },
    };
  }

  /**
   * Revoke an invitation
   */
  async revokeInvitation(
    invitationId: string,
    orgId: string
  ): Promise<boolean> {
    const [inv] = await db
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.orgId, orgId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt)
        )
      )
      .returning();

    return !!inv;
  }
  // ── Department management ──────────────────────────────────────

  async getOrgDepartments(orgId: string) {
    return db
      .select()
      .from(departments)
      .where(and(eq(departments.orgId, orgId), isNull(departments.deletedAt)))
      .orderBy(departments.name);
  }

  async getDepartmentById(deptId: string, orgId: string) {
    const [dept] = await db
      .select()
      .from(departments)
      .where(
        and(
          eq(departments.id, deptId),
          eq(departments.orgId, orgId),
          isNull(departments.deletedAt)
        )
      )
      .limit(1);
    return dept || null;
  }

  async createDepartment(
    orgId: string,
    input: { name: string; parentId?: string },
    createdBy?: string
  ) {
    // If parentId given, verify it exists in the same org
    if (input.parentId) {
      const parent = await this.getDepartmentById(input.parentId, orgId);
      if (!parent) return null;
    }

    const [dept] = await db
      .insert(departments)
      .values({
        orgId,
        name: input.name,
        parentId: input.parentId,
        createdBy,
      })
      .returning();
    return dept || null;
  }

  async updateDepartment(
    deptId: string,
    orgId: string,
    input: { name?: string; parentId?: string | null }
  ) {
    // If moving to a new parent, verify parent exists
    if (input.parentId) {
      const parent = await this.getDepartmentById(input.parentId, orgId);
      if (!parent) return null;
      // Prevent setting self as parent
      if (input.parentId === deptId) return null;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.parentId !== undefined) updates.parentId = input.parentId;

    const [dept] = await db
      .update(departments)
      .set(updates)
      .where(
        and(
          eq(departments.id, deptId),
          eq(departments.orgId, orgId),
          isNull(departments.deletedAt)
        )
      )
      .returning();
    return dept || null;
  }

  async deleteDepartment(deptId: string, orgId: string): Promise<{ success: boolean; reason?: string }> {
    // Check if department has members
    const members = await db
      .select()
      .from(departmentMembers)
      .where(eq(departmentMembers.departmentId, deptId))
      .limit(1);

    if (members.length > 0) {
      return { success: false, reason: "Department has members. Remove all members first." };
    }

    const [dept] = await db
      .update(departments)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(departments.id, deptId),
          eq(departments.orgId, orgId),
          isNull(departments.deletedAt)
        )
      )
      .returning();

    return dept ? { success: true } : { success: false, reason: "Department not found" };
  }

  async addDepartmentMember(
    deptId: string,
    userId: string,
    role: string = "member"
  ) {
    try {
      const [member] = await db
        .insert(departmentMembers)
        .values({ departmentId: deptId, userId, role })
        .returning();
      return member || null;
    } catch (error) {
      if (error instanceof Error && error.message.includes("unique")) {
        return null; // Already a member
      }
      throw error;
    }
  }

  async removeDepartmentMember(deptId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(departmentMembers)
      .where(
        and(
          eq(departmentMembers.departmentId, deptId),
          eq(departmentMembers.userId, userId)
        )
      )
      .returning();
    return result.length > 0;
  }

  // ── User profile management ──────────────────────────────────────

  async getUserProfile(userId: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (!user) return null;

    // Get department memberships
    const memberships = await db
      .select({
        departmentId: departmentMembers.departmentId,
        role: departmentMembers.role,
        departmentName: departments.name,
      })
      .from(departmentMembers)
      .innerJoin(departments, eq(departmentMembers.departmentId, departments.id))
      .where(
        and(
          eq(departmentMembers.userId, userId),
          isNull(departments.deletedAt)
        )
      );

    const { passwordHash: _, totpSecret: __, ...safeUser } = user;
    return { ...safeUser, departments: memberships };
  }

  async updateUserProfile(
    userId: string,
    input: {
      displayName?: string;
      avatarUrl?: string | null;
      timezone?: string;
      locale?: string;
      workingHoursStart?: string;
      workingHoursEnd?: string;
      phone?: string | null;
    }
  ) {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.displayName !== undefined) updates.displayName = input.displayName;
    if (input.avatarUrl !== undefined) updates.avatarUrl = input.avatarUrl;
    if (input.timezone !== undefined) updates.timezone = input.timezone;
    if (input.locale !== undefined) updates.locale = input.locale;
    if (input.workingHoursStart !== undefined) updates.workingHoursStart = input.workingHoursStart;
    if (input.workingHoursEnd !== undefined) updates.workingHoursEnd = input.workingHoursEnd;
    if (input.phone !== undefined) updates.phone = input.phone;

    const [user] = await db
      .update(users)
      .set(updates)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .returning();

    if (!user) return null;

    const { passwordHash: _, totpSecret: __, ...safeUser } = user;
    return safeUser;
  }

  async getPublicProfile(userId: string, requestingOrgId: string) {
    const [user] = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        status: users.status,
        orgId: users.orgId,
      })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (!user) return null;

    // Only show users in the same org
    if (user.orgId !== requestingOrgId) return null;

    // Get department info
    const memberships = await db
      .select({
        departmentId: departmentMembers.departmentId,
        role: departmentMembers.role,
        departmentName: departments.name,
      })
      .from(departmentMembers)
      .innerJoin(departments, eq(departmentMembers.departmentId, departments.id))
      .where(
        and(
          eq(departmentMembers.userId, userId),
          isNull(departments.deletedAt)
        )
      );

    const { orgId: _orgId, ...publicUser } = user;
    return { ...publicUser, departments: memberships };
  }

  async getDepartmentMembers(deptId: string) {
    return db
      .select({
        userId: departmentMembers.userId,
        role: departmentMembers.role,
        createdAt: departmentMembers.createdAt,
        displayName: users.displayName,
        email: users.email,
        avatarUrl: users.avatarUrl,
      })
      .from(departmentMembers)
      .innerJoin(users, eq(departmentMembers.userId, users.id))
      .where(eq(departmentMembers.departmentId, deptId));
  }
}

export const authService = new AuthService();
