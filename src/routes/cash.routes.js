import { Router } from "express";
import * as cashController from "../controllers/cash.controller.js";
import { verifyToken, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyToken);

router.get("/current", requireRole("ADMIN", "SELLER"), cashController.current);
router.post("/open", requireRole("ADMIN", "SELLER"), cashController.open);
router.post("/movements", requireRole("ADMIN", "SELLER"), cashController.addMovement);
router.post("/close", requireRole("ADMIN", "SELLER"), cashController.close);
router.get("/sessions", requireRole("ADMIN"), cashController.list);
router.get("/sessions/:id", requireRole("ADMIN"), cashController.getOne);

export default router;
