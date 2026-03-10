// Messenger module exports
export { messengerRoutes } from "./messenger.routes.js";
export { messengerService, MessengerService } from "./messenger.service.js";
export * from "./messenger.schemas.js";
export {
  registerWebSocketRoutes,
  publishMessageEvent,
  notifyUserJoinedChat,
} from "./websocket.js";
