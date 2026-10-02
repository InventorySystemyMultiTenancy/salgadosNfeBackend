import { Router } from "express";
import * as stockController from "../controllers/stock.controller.js";
import { verifyToken, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyToken);

// Lançamento: a cozinha também registra a produção do dia.
router.post("/entries", requireRole("ADMIN", "SELLER", "KITCHEN"), stockController.createEntries);
router.get("/movements", requireRole("ADMIN"), stockController.listMovements);
router.post("/counts", requireRole("ADMIN", "SELLER"), stockController.applyCount);
router.get("/counts", requireRole("ADMIN"), stockController.listCounts);
router.get("/counts/:id", requireRole("ADMIN"), stockController.getCount);

export default router;
