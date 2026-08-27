import * as productRepository from "../repositories/product.repository.js";

export function listProducts() {
  return productRepository.findAll();
}

export function createProduct(data) {
  if (!data.name || !data.category || data.price == null) {
    throw new Error("Nome, categoria e preço são obrigatórios.");
  }

  return productRepository.create({
    name: data.name,
    category: data.category,
    price: data.price,
    stockQuantity: data.stockQuantity ?? 0,
    ncm: data.ncm ?? null,
    cfop: data.cfop ?? null,
    minStockAlert: data.minStockAlert ?? null,
  });
}

export async function updateProduct(id, data) {
  const existing = await productRepository.findById(Number(id));
  if (!existing) {
    throw new Error("Produto não encontrado.");
  }

  return productRepository.update(Number(id), {
    name: data.name ?? existing.name,
    category: data.category ?? existing.category,
    price: data.price ?? existing.price,
    stockQuantity: data.stockQuantity ?? existing.stockQuantity,
    ncm: data.ncm ?? existing.ncm,
    cfop: data.cfop ?? existing.cfop,
    minStockAlert: data.minStockAlert ?? existing.minStockAlert,
  });
}

export async function setProductImage(id, imageUrl) {
  const existing = await productRepository.findById(Number(id));
  if (!existing) {
    throw new Error("Produto não encontrado.");
  }
  return productRepository.update(Number(id), { imageUrl });
}

export async function deactivateProduct(id) {
  const existing = await productRepository.findById(Number(id));
  if (!existing) {
    throw new Error("Produto não encontrado.");
  }

  return productRepository.deactivate(Number(id));
}
