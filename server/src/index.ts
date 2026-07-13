import "dotenv/config";
import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { createApp } from "./app";

const PORT = process.env.PORT ?? 4000;

const app = createApp();
const httpServer = createServer(app);

export const io = new SocketIOServer(httpServer, {
  cors: { origin: "*" },
});

httpServer.listen(PORT, () => {
  console.log(`server listening on port ${PORT}`);
});
