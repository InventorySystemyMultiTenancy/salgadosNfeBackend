import { Router } from "express";
import * as fiscalController from "../controllers/fiscal.controller.js";
import { verifyToken, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/settings/public", verifyToken, fiscalController.getPublicSettings);

router.use(verifyToken, requireRole("ADMIN"));

router.get("/settings", fiscalController.getSettings);
router.put("/settings", fiscalController.updateSettings);

export default router;
