import { Router } from "express";
import multer from "multer";
import * as productController from "../controllers/product.controller.js";
import { verifyToken, requireRole } from "../middlewares/auth.middleware.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Arquivo precisa ser uma imagem."));
    }
    cb(null, true);
  },
});

const router = Router();

router.use(verifyToken);

router.get("/", requireRole("ADMIN", "SELLER", "KITCHEN"), productController.list);
router.post("/", requireRole("ADMIN"), productController.create);
router.put("/:id", requireRole("ADMIN"), productController.update);
router.post("/:id/image", requireRole("ADMIN"), (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    next();
  });
}, productController.uploadImage);
router.delete("/:id", requireRole("ADMIN"), productController.remove);

export default router;
