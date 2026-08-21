import express from "express";
import cors from "cors";
import routes from "./routes/index.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use("/", routes);

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "Erro interno do servidor." });
});

export default app;
