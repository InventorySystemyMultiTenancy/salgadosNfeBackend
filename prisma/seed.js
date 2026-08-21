import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@salgaderia.com" },
    update: {},
    create: {
      name: "Administrador",
      email: "admin@salgaderia.com",
      passwordHash,
      role: "ADMIN",
    },
  });

  console.log(`Usuário admin pronto: ${admin.email} / senha: admin123`);

  await prisma.product.createMany({
    data: [
      { name: "Coxinha", category: "Salgados", price: 7.5, stockQuantity: 50 },
      { name: "Risole de Carne", category: "Salgados", price: 7.5, stockQuantity: 50 },
      { name: "Kibe", category: "Salgados", price: 7.0, stockQuantity: 50 },
      { name: "Refrigerante Lata", category: "Bebidas", price: 6.0, stockQuantity: 30 },
      { name: "Suco Natural", category: "Bebidas", price: 8.0, stockQuantity: 20 },
    ],
    skipDuplicates: true,
  });

  console.log("Produtos de exemplo cadastrados.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
