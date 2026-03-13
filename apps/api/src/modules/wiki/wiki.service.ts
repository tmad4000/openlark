import { db } from "../../db/index.js";
import {
  wikiSpaces,
  wikiSpaceMembers,
  wikiPages,
  documents,
  documentPermissions,
  type WikiSpace,
  type WikiSpaceMember,
  type WikiPage,
} from "../../db/schema/index.js";
import { eq, and, isNull, or, asc } from "drizzle-orm";
import type {
  CreateWikiSpaceInput,
  UpdateWikiSpaceInput,
  CreateWikiPageInput,
  UpdateWikiPageInput,
} from "./wiki.schemas.js";
import * as Y from "yjs";

export class WikiService {
  // ============ SPACE CRUD ============

  async createSpace(
    input: CreateWikiSpaceInput,
    userId: string,
    orgId: string
  ): Promise<WikiSpace> {
    const [space] = await db
      .insert(wikiSpaces)
      .values({
        orgId,
        name: input.name,
        description: input.description,
        icon: input.icon,
        type: input.type,
        createdBy: userId,
      })
      .returning();

    if (!space) {
      throw new Error("Failed to create wiki space");
    }

    // Add creator as admin member
    await db.insert(wikiSpaceMembers).values({
      spaceId: space.id,
      userId,
      role: "admin",
    });

    return space;
  }

  async getUserSpaces(userId: string, orgId: string): Promise<WikiSpace[]> {
    // Get spaces where user is a member
    const memberSpaceRows = await db
      .select({ spaceId: wikiSpaceMembers.spaceId })
      .from(wikiSpaceMembers)
      .where(eq(wikiSpaceMembers.userId, userId));

    const memberSpaceIds = memberSpaceRows.map((r) => r.spaceId);

    // Get all spaces user can see: member of, or public in their org
    const spaces = await db
      .select()
      .from(wikiSpaces)
      .where(
        and(
          eq(wikiSpaces.orgId, orgId),
          isNull(wikiSpaces.deletedAt),
          memberSpaceIds.length > 0
            ? or(
                eq(wikiSpaces.type, "public"),
                ...memberSpaceIds.map((id) => eq(wikiSpaces.id, id))
              )
            : eq(wikiSpaces.type, "public")
        )
      )
      .orderBy(asc(wikiSpaces.name));

    return spaces;
  }

  async getSpaceById(spaceId: string): Promise<WikiSpace | null> {
    const [space] = await db
      .select()
      .from(wikiSpaces)
      .where(and(eq(wikiSpaces.id, spaceId), isNull(wikiSpaces.deletedAt)));

    return space ?? null;
  }

  async updateSpace(
    spaceId: string,
    input: UpdateWikiSpaceInput,
    userId: string
  ): Promise<WikiSpace | null> {
    // Check admin permission
    const isAdmin = await this.isSpaceAdmin(spaceId, userId);
    if (!isAdmin) {
      throw new Error("Not authorized to update this space");
    }

    const [updated] = await db
      .update(wikiSpaces)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(and(eq(wikiSpaces.id, spaceId), isNull(wikiSpaces.deletedAt)))
      .returning();

    return updated ?? null;
  }

  async deleteSpace(spaceId: string, userId: string): Promise<boolean> {
    const isAdmin = await this.isSpaceAdmin(spaceId, userId);
    if (!isAdmin) {
      throw new Error("Not authorized to delete this space");
    }

    const result = await db
      .update(wikiSpaces)
      .set({ deletedAt: new Date() })
      .where(and(eq(wikiSpaces.id, spaceId), isNull(wikiSpaces.deletedAt)))
      .returning({ id: wikiSpaces.id });

    return result.length > 0;
  }

  // ============ MEMBERSHIP ============

  async isSpaceMember(spaceId: string, userId: string): Promise<boolean> {
    const [member] = await db
      .select()
      .from(wikiSpaceMembers)
      .where(
        and(
          eq(wikiSpaceMembers.spaceId, spaceId),
          eq(wikiSpaceMembers.userId, userId)
        )
      );

    return !!member;
  }

  async isSpaceAdmin(spaceId: string, userId: string): Promise<boolean> {
    const [member] = await db
      .select()
      .from(wikiSpaceMembers)
      .where(
        and(
          eq(wikiSpaceMembers.spaceId, spaceId),
          eq(wikiSpaceMembers.userId, userId),
          eq(wikiSpaceMembers.role, "admin")
        )
      );

    return !!member;
  }

  async canAccessSpace(spaceId: string, userId: string): Promise<boolean> {
    const space = await this.getSpaceById(spaceId);
    if (!space) return false;

    // Public spaces are accessible to all org members
    if (space.type === "public") return true;

    return this.isSpaceMember(spaceId, userId);
  }

  // ============ PAGE CRUD ============

  async createPage(
    spaceId: string,
    input: CreateWikiPageInput,
    userId: string,
    orgId: string
  ): Promise<WikiPage & { document: { id: string; title: string } }> {
    // Create linked document
    const ydoc = new Y.Doc();
    const state = Y.encodeStateAsUpdate(ydoc);

    const [document] = await db
      .insert(documents)
      .values({
        title: input.title,
        type: "doc",
        ownerId: userId,
        orgId,
        yjsState: state,
        lastEditedBy: userId,
        lastEditedAt: new Date(),
      })
      .returning();

    if (!document) {
      throw new Error("Failed to create document for wiki page");
    }

    // Add owner permission on the document
    await db.insert(documentPermissions).values({
      documentId: document.id,
      principalId: userId,
      principalType: "user",
      role: "owner",
      createdBy: userId,
    });

    // Determine position if not specified
    let position = input.position ?? 0;
    if (input.position === undefined) {
      const siblings = await db
        .select()
        .from(wikiPages)
        .where(
          and(
            eq(wikiPages.spaceId, spaceId),
            input.parentPageId
              ? eq(wikiPages.parentPageId, input.parentPageId)
              : isNull(wikiPages.parentPageId),
            isNull(wikiPages.deletedAt)
          )
        );
      position = siblings.length;
    }

    // Create wiki page
    const [page] = await db
      .insert(wikiPages)
      .values({
        spaceId,
        documentId: document.id,
        parentPageId: input.parentPageId,
        position,
        createdBy: userId,
      })
      .returning();

    if (!page) {
      throw new Error("Failed to create wiki page");
    }

    return {
      ...page,
      document: { id: document.id, title: document.title },
    };
  }

  async getSpacePages(
    spaceId: string
  ): Promise<(WikiPage & { document: { id: string; title: string } })[]> {
    const pages = await db
      .select({
        id: wikiPages.id,
        spaceId: wikiPages.spaceId,
        documentId: wikiPages.documentId,
        parentPageId: wikiPages.parentPageId,
        position: wikiPages.position,
        createdBy: wikiPages.createdBy,
        createdAt: wikiPages.createdAt,
        updatedAt: wikiPages.updatedAt,
        deletedAt: wikiPages.deletedAt,
        documentTitle: documents.title,
      })
      .from(wikiPages)
      .leftJoin(documents, eq(wikiPages.documentId, documents.id))
      .where(
        and(eq(wikiPages.spaceId, spaceId), isNull(wikiPages.deletedAt))
      )
      .orderBy(asc(wikiPages.position));

    return pages.map((p) => ({
      id: p.id,
      spaceId: p.spaceId,
      documentId: p.documentId,
      parentPageId: p.parentPageId,
      position: p.position,
      createdBy: p.createdBy,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      deletedAt: p.deletedAt,
      document: {
        id: p.documentId,
        title: p.documentTitle ?? "Untitled",
      },
    }));
  }

  async updatePage(
    pageId: string,
    input: UpdateWikiPageInput,
    userId: string
  ): Promise<WikiPage | null> {
    const [page] = await db
      .select()
      .from(wikiPages)
      .where(and(eq(wikiPages.id, pageId), isNull(wikiPages.deletedAt)));

    if (!page) return null;

    // Check space access
    const canAccess = await this.canAccessSpace(page.spaceId, userId);
    if (!canAccess) {
      throw new Error("Not authorized to update this page");
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.parentPageId !== undefined) {
      updateData.parentPageId = input.parentPageId;
    }
    if (input.position !== undefined) {
      updateData.position = input.position;
    }

    const [updated] = await db
      .update(wikiPages)
      .set(updateData)
      .where(eq(wikiPages.id, pageId))
      .returning();

    return updated ?? null;
  }

  async deletePage(pageId: string, userId: string): Promise<boolean> {
    const [page] = await db
      .select()
      .from(wikiPages)
      .where(and(eq(wikiPages.id, pageId), isNull(wikiPages.deletedAt)));

    if (!page) return false;

    const canAccess = await this.canAccessSpace(page.spaceId, userId);
    if (!canAccess) {
      throw new Error("Not authorized to delete this page");
    }

    const result = await db
      .update(wikiPages)
      .set({ deletedAt: new Date() })
      .where(eq(wikiPages.id, pageId))
      .returning({ id: wikiPages.id });

    return result.length > 0;
  }
}

export const wikiService = new WikiService();
