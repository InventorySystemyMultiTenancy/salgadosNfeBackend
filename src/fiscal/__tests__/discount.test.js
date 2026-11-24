import { describe, it, expect } from "vitest";
import { splitDiscount } from "../discount.js";

const order = (discountAmount, items) => ({ discountAmount, items });

describe("fiscal.splitDiscount", () => {
  it("sem desconto devolve zeros", () => {
    expect(splitDiscount(order(0, [{ unitPrice: "7.50", quantity: 2 }]))).toEqual([0]);
  });

  it("reparte proporcional e a soma bate com o desconto", () => {
    // 15,00 + 6,00 + 3,50 = 24,50; desconto 5,00
    const shares = splitDiscount(
      order("5.00", [
        { unitPrice: "7.50", quantity: 2 },
        { unitPrice: "6.00", quantity: 1 },
        { unitPrice: "3.50", quantity: 1 },
      ]),
    );
    expect(shares[0]).toBeCloseTo(3.06, 2);
    expect(shares[1]).toBeCloseTo(1.22, 2);
    expect(Math.round(shares.reduce((a, b) => a + b, 0) * 100) / 100).toBe(5);
  });

  it("dízima: centavos sobram pro último item", () => {
    const shares = splitDiscount(
      order("1.00", [
        { unitPrice: "1", quantity: 1 },
        { unitPrice: "1", quantity: 1 },
        { unitPrice: "1", quantity: 1 },
      ]),
    );
    expect(shares).toEqual([0.33, 0.33, 0.34]);
  });
});
