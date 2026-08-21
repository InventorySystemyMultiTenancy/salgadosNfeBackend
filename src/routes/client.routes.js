import { Router } from "express";
import * as clientController from "../controllers/client.controller.js";
import { verifyToken, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyToken);

router.get("/due-today", requireRole("ADMIN"), clientController.duePanel);
router.get("/", requireRole("ADMIN", "SELLER"), clientController.list);
router.post("/", requireRole("ADMIN"), clientController.create);
router.put("/:id", requireRole("ADMIN"), clientController.update);
router.delete("/:id", requireRole("ADMIN"), clientController.remove);
router.get("/:id/statement", requireRole("ADMIN"), clientController.statement);
router.post("/:id/payments", requireRole("ADMIN"), clientController.pay);

export default router;
