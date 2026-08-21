import { Router } from "express";
import * as productController from "../controllers/product.controller.js";
import { verifyToken, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyToken);

router.get("/", requireRole("ADMIN", "SELLER"), productController.list);
router.post("/", requireRole("ADMIN"), productController.create);
router.put("/:id", requireRole("ADMIN"), productController.update);
router.delete("/:id", requireRole("ADMIN"), productController.remove);

export default router;
