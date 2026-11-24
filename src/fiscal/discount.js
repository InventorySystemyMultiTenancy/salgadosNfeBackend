// Reparte o desconto do pedido entre os itens, proporcional ao valor de cada um (a nota fiscal
// exige o desconto por item — tag vDesc). Centavos de arredondamento vão pro último item, pra
// soma bater exatamente com o desconto do pedido.
export function splitDiscount(order) {
  const discount = Number(order.discountAmount ?? 0);
  const gross = order.items.map((item) => Number(item.unitPrice) * item.quantity);
  if (!discount) return gross.map(() => 0);

  const totalGross = gross.reduce((sum, value) => sum + value, 0);
  const shares = gross.map((value) => Math.floor(((value / totalGross) * discount) * 100) / 100);
  const assigned = shares.reduce((sum, value) => sum + value, 0);
  shares[shares.length - 1] = Math.round((shares[shares.length - 1] + discount - assigned) * 100) / 100;
  return shares;
}
