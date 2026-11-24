import * as productRepository from "../repositories/product.repository.js";

// Quantas unidades dá pra vender agora. Produto normal: o estoque. Combo: quantos dá pra montar
// com o estoque dos componentes (o componente mais escasso manda); componente inativo = 0.
export function availableQuantity(product) {
  if (!product.isCombo) return product.stockQuantity;
  if (!product.comboItems?.length) return 0;
  return Math.max(
    0,
    Math.min(
      ...product.comboItems.map((item) =>
        item.component.active ? Math.floor(item.component.stockQuantity / item.quantity) : 0,
      ),
    ),
  );
}

function withAvailability(product) {
  return { ...product, availableQuantity: availableQuantity(product) };
}

export async function listProducts() {
  const products = await productRepository.findAll();
  return products.map(withAvailability);
}

// Valida a composição do combo: produtos que existem, ativos, que não são combo (sem combo dentro
// de combo), sem repetir e com quantidade inteira.
async function resolveComboItems(rawItems, comboId = null) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error("Um combo precisa ter ao menos um produto dentro.");
  }
  const items = rawItems.map((item) => ({ productId: Number(item.productId), quantity: Number(item.quantity) }));
  const ids = items.map((item) => item.productId);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Produto repetido no combo — some as quantidades numa linha só.");
  }
  if (comboId && ids.includes(comboId)) {
    throw new Error("Um combo não pode conter ele mesmo.");
  }
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error("Quantidade dos itens do combo precisa ser um número inteiro maior que zero.");
    }
  }
  const components = await productRepository.findManyByIds(ids);
  for (const id of ids) {
    const component = components.find((c) => c.id === id);
    if (!component || !component.active) throw new Error(`Produto ${id} não encontrado.`);
    if (component.isCombo) throw new Error(`"${component.name}" já é um combo — combo não pode ter outro combo dentro.`);
  }
  return items;
}

export async function createProduct(data, userId) {
  if (!data.name || !data.category || data.price == null) {
    throw new Error("Nome, categoria e preço são obrigatórios.");
  }
  const isCombo = Boolean(data.isCombo);
  const comboItems = isCombo ? await resolveComboItems(data.comboItems) : [];

  const product = await productRepository.create(
    {
      name: data.name,
      category: data.category,
      price: data.price,
      // Combo não tem estoque próprio: vale o estoque dos componentes.
      stockQuantity: isCombo ? 0 : (data.stockQuantity ?? 0),
      ncm: data.ncm ?? null,
      cfop: data.cfop ?? null,
      minStockAlert: isCombo ? null : (data.minStockAlert ?? null),
      isCombo,
    },
    userId,
    comboItems,
  );
  return withAvailability(product);
}

export async function updateProduct(id, data, userId) {
  const existing = await productRepository.findById(Number(id));
  if (!existing) {
    throw new Error("Produto não encontrado.");
  }
  const isCombo = data.isCombo === undefined ? existing.isCombo : Boolean(data.isCombo);
  if (isCombo && !existing.isCombo && existing.stockQuantity !== 0) {
    throw new Error(
      `"${existing.name}" ainda tem ${existing.stockQuantity} em estoque — zere o estoque (lançamento de saída) antes de transformar em combo.`,
    );
  }
  let comboItems;
  if (isCombo) {
    comboItems = data.comboItems !== undefined ? await resolveComboItems(data.comboItems, existing.id) : undefined;
    if (comboItems === undefined && !existing.isCombo) {
      throw new Error("Informe os produtos que vão dentro do combo.");
    }
  } else if (existing.isCombo) {
    comboItems = []; // deixou de ser combo: apaga a composição
  }

  const product = await productRepository.update(
    Number(id),
    {
      name: data.name ?? existing.name,
      category: data.category ?? existing.category,
      price: data.price ?? existing.price,
      stockQuantity: isCombo ? 0 : (data.stockQuantity ?? existing.stockQuantity),
      ncm: data.ncm ?? existing.ncm,
      cfop: data.cfop ?? existing.cfop,
      minStockAlert: isCombo ? null : (data.minStockAlert ?? existing.minStockAlert),
      isCombo,
    },
    userId,
    comboItems,
  );
  return withAvailability(product);
}

export async function setProductImage(id, imageUrl) {
  const existing = await productRepository.findById(Number(id));
  if (!existing) {
    throw new Error("Produto não encontrado.");
  }
  return withAvailability(await productRepository.update(Number(id), { imageUrl }));
}

export async function deactivateProduct(id) {
  const existing = await productRepository.findById(Number(id));
  if (!existing) {
    throw new Error("Produto não encontrado.");
  }

  return productRepository.deactivate(Number(id));
}
