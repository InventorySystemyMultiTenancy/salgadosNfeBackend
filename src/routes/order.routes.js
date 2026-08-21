import { Router } from "express";
import * as orderController from "../controllers/order.controller.js";
import { verifyToken, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyToken);

router.get("/kitchen-queue", requireRole("ADMIN", "KITCHEN"), orderController.kitchenQueue);
router.put("/:id/kitchen-status", requireRole("ADMIN", "KITCHEN"), orderController.updateKitchenStatus);
router.get("/audit/stock", requireRole("ADMIN"), orderController.stockAudit);
router.post("/:id/emit-fiscal", requireRole("ADMIN"), orderController.emitFiscal);

router.get("/", requireRole("ADMIN"), orderController.list);
router.get("/:id", requireRole("ADMIN", "SELLER"), orderController.getOne);
router.post("/", requireRole("ADMIN", "SELLER"), orderController.create);

export default router;
