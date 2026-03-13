import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { verifyToken, checkPermission } from "./auth.js";
import { loadYjsState, storeYjsState } from "./persistence.js";

function log(level: string, msg: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "test") {
    process.stdout.write(JSON.stringify({ level, msg, ...data }) + "\n");
  }
}

function logError(msg: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "test") {
    process.stderr.write(JSON.stringify({ level: "error", msg, ...data }) + "\n");
  }
}

/**
 * Create the standalone Hocuspocus collaboration server
 */
export function createCollabServer(): Server {
  const server = new Server({
    name: "openlark-collab",
    timeout: 30000,
    debounce: 2000,

    // Auth hook: validate session token, check document permissions
    async onAuthenticate({ token, documentName }) {
      if (!token) {
        throw new Error("No authentication token provided");
      }

      const payload = await verifyToken(token);
      if (!payload) {
        throw new Error("Invalid or expired authentication token");
      }

      // Check document permission
      const hasPermission = await checkPermission(
        documentName,
        payload.sub,
        "viewer"
      );

      if (!hasPermission) {
        throw new Error("No permission to access this document");
      }

      // Check if user can edit
      const canEdit = await checkPermission(
        documentName,
        payload.sub,
        "editor"
      );

      // Return user context — used by Hocuspocus awareness for cursor positions
      return {
        user: {
          id: payload.sub,
          name: payload.email,
          orgId: payload.orgId,
          canEdit,
        },
      };
    },

    // onConnect: log connection, Yjs doc loaded automatically via Database extension
    async onConnect({ documentName, context }) {
      const user = context?.user as
        | { id: string; name: string }
        | undefined;
      log("info", "collab_connect", {
        documentName,
        userId: user?.id ?? "unknown",
      });
    },

    async onDisconnect({ documentName, context }) {
      const user = context?.user as
        | { id: string; name: string }
        | undefined;
      log("info", "collab_disconnect", {
        documentName,
        userId: user?.id ?? "unknown",
      });
    },

    // Document persistence via Database extension
    extensions: [
      new Database({
        // onConnect: load Yjs doc from DB or create new
        fetch: async ({ documentName }) => {
          try {
            const state = await loadYjsState(documentName);
            return state ?? null;
          } catch (error) {
            logError("collab_fetch_error", {
              documentName,
              error: String(error),
            });
            return null;
          }
        },

        // onStoreDocument: persist Yjs binary state to documents table
        store: async ({ documentName, state, context }) => {
          try {
            const user = context?.user as { id: string } | undefined;
            await storeYjsState(documentName, state, user?.id);
          } catch (error) {
            logError("collab_store_error", {
              documentName,
              error: String(error),
            });
          }
        },
      }),
    ],
  });

  return server;
}
