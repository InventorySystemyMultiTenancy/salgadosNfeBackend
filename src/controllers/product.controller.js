import * as productService from "../services/product.service.js";
import { uploadProductImage } from "../uploads/cloudinaryClient.js";

export async function list(req, res) {
  const products = await productService.listProducts();
  return res.json(products);
}

export async function create(req, res) {
  try {
    const product = await productService.createProduct(req.body);
    return res.status(201).json(product);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

export async function update(req, res) {
  try {
    const product = await productService.updateProduct(req.params.id, req.body);
    return res.json(product);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

export async function uploadImage(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: "Nenhum arquivo enviado." });
  }

  try {
    const imageUrl = await uploadProductImage(req.file.buffer, req.file.originalname);
    const product = await productService.setProductImage(req.params.id, imageUrl);
    return res.json(product);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

export async function remove(req, res) {
  try {
    await productService.deactivateProduct(req.params.id);
    return res.status(204).send();
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}
