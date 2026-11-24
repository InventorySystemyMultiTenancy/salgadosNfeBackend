import { Router } from "express";
import * as storeSettingsController from "../controllers/storeSettings.controller.js";
import { verifyToken, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyToken);

router.get("/", requireRole("ADMIN", "SELLER"), storeSettingsController.get);
router.put("/", requireRole("ADMIN"), storeSettingsController.update);
// O vendedor chama, mas quem autentica aqui é o administrador (e-mail/senha dele no corpo).
router.post("/approve-discount", requireRole("ADMIN", "SELLER"), storeSettingsController.approveDiscount);

export default router;
