import { Hocuspocus } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { DocsService } from "./docs.service.js";
import jwt from "jsonwebtoken";
import { config } from "../../config.js";

const docsService = new DocsService();

interface TokenPayload {
  sub: string;
  orgId: string;
  email: string;
  role: string;
  sessionId: string;
  iat: number;
  exp: number;
}

/**
 * Verify JWT token and return payload
 */
function verifyToken(token: string): TokenPayload | null {
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as TokenPayload;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Create Hocuspocus server for document collaboration
 * This is used when running Hocuspocus as a separate server
 */
export function createHocuspocusServer(): Hocuspocus {
  const server = new Hocuspocus({
    name: "openlark-collab",
    timeout: 30000,
    debounce: 2000,

    // Authentication hook
    async onAuthenticate({ token, documentName }) {
      if (!token) {
        throw new Error("No authentication token provided");
      }

      const payload = verifyToken(token);
      if (!payload) {
        throw new Error("Invalid authentication token");
      }

      // Check document permission
      const hasPermission = await docsService.checkPermission(
        documentName,
        payload.sub,
        "viewer"
      );

      if (!hasPermission) {
        throw new Error("No permission to access this document");
      }

      // Check if user can edit (determines read-only mode)
      const canEdit = await docsService.checkPermission(
        documentName,
        payload.sub,
        "editor"
      );

      return {
        user: {
          id: payload.sub,
          name: payload.email,
          orgId: payload.orgId,
          canEdit,
        },
      };
    },

    // Connection event logging
    async onConnect({ documentName, context }) {
      const user = context?.user as { id: string; name: string } | undefined;
      console.log(
        `User ${user?.id || "unknown"} connected to document ${documentName}`
      );
    },

    async onDisconnect({ documentName, context }) {
      const user = context?.user as { id: string; name: string } | undefined;
      console.log(
        `User ${user?.id || "unknown"} disconnected from document ${documentName}`
      );
    },

    // Document persistence via Database extension
    extensions: [
      new Database({
        // Fetch document state from PostgreSQL
        fetch: async ({ documentName }) => {
          try {
            const state = await docsService.loadYjsState(documentName);
            return state ?? null;
          } catch (error) {
            console.error(`Error loading document ${documentName}:`, error);
            return null;
          }
        },

        // Store document state to PostgreSQL
        store: async ({ documentName, state, context }) => {
          try {
            const user = context?.user as { id: string } | undefined;
            await docsService.storeYjsState(documentName, state, user?.id);
          } catch (error) {
            console.error(`Error storing document ${documentName}:`, error);
          }
        },
      }),
    ],
  });

  return server;
}

/**
 * Create Hocuspocus instance for integration with existing Fastify WebSocket
 * This allows running Hocuspocus alongside Fastify on the same port
 */
export function createHocuspocusInstance(): Hocuspocus {
  return createHocuspocusServer();
}

// Export the service for use in routes
export { docsService };
