import { Router } from "express";
import * as paymentController from "../controllers/payment.controller.js";
import { verifyToken, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyToken);

router.get("/settings/public", paymentController.getPublicSettings);

router.post("/charges", requireRole("ADMIN", "SELLER"), paymentController.createCharge);
router.get("/charges/:id", requireRole("ADMIN", "SELLER"), paymentController.getCharge);
router.post("/charges/:id/cancel", requireRole("ADMIN", "SELLER"), paymentController.cancelCharge);

router.get("/settings", requireRole("ADMIN"), paymentController.getSettings);
router.put("/settings", requireRole("ADMIN"), paymentController.updateSettings);
router.get("/terminals", requireRole("ADMIN"), paymentController.listTerminals);
router.post("/terminals/pair", requireRole("ADMIN"), paymentController.pairTerminal);
router.post("/terminals/:terminalId/setup", requireRole("ADMIN"), paymentController.setupTerminal);

export default router;
