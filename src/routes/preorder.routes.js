import { Router } from "express";
import * as preorderController from "../controllers/preorder.controller.js";
import { verifyToken, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyToken);

router.get("/production", requireRole("ADMIN", "SELLER", "KITCHEN"), preorderController.production);
router.put("/:id/status", requireRole("ADMIN", "SELLER", "KITCHEN"), preorderController.setStatus);

router.get("/", requireRole("ADMIN", "SELLER"), preorderController.list);
router.post("/", requireRole("ADMIN", "SELLER"), preorderController.create);
router.put("/:id", requireRole("ADMIN", "SELLER"), preorderController.update);
router.post("/:id/deliver", requireRole("ADMIN", "SELLER"), preorderController.deliver);
router.post("/:id/cancel", requireRole("ADMIN", "SELLER"), preorderController.cancel);

export default router;
