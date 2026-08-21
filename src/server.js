import "dotenv/config";
import { createServer } from "node:http";
import app from "./app.js";
import { initSocket } from "./socket.js";

const port = process.env.PORT || 3001;

const httpServer = createServer(app);
initSocket(httpServer);

httpServer.listen(port, () => {
  console.log(`Backend rodando em http://localhost:${port}`);
});
