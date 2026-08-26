import { prisma } from "../prismaClient.js";
import * as clientRepository from "../repositories/client.repository.js";
import * as clientPaymentRepository from "../repositories/clientPayment.repository.js";

export function listClients() {
  return clientRepository.findAll();
}

export function createClient(data) {
  if (!data.name || !data.phone) {
    throw new Error("Nome e telefone/WhatsApp são obrigatórios.");
  }
  if (data.dueDay != null && (data.dueDay < 1 || data.dueDay > 31)) {
    throw new Error("Dia de vencimento deve ser entre 1 e 31.");
  }

  return clientRepository.create({
    name: data.name,
    phone: data.phone,
    cpf: data.cpf ?? null,
    cnpj: data.cnpj ?? null,
    stateRegistration: data.stateRegistration ?? null,
    dueDay: data.dueDay ?? null,
    creditLimit: data.creditLimit ?? 0,
    addressStreet: data.addressStreet ?? null,
    addressNumber: data.addressNumber ?? null,
    addressDistrict: data.addressDistrict ?? null,
    addressCity: data.addressCity ?? null,
    addressCityCode: data.addressCityCode ?? null,
    addressState: data.addressState ?? null,
    addressPostalCode: data.addressPostalCode ?? null,
  });
}

export async function updateClient(id, data) {
  const existing = await clientRepository.findById(Number(id));
  if (!existing) {
    throw new Error("Cliente não encontrado.");
  }
  if (data.dueDay != null && (data.dueDay < 1 || data.dueDay > 31)) {
    throw new Error("Dia de vencimento deve ser entre 1 e 31.");
  }

  return clientRepository.update(Number(id), {
    name: data.name ?? existing.name,
    phone: data.phone ?? existing.phone,
    cpf: data.cpf ?? existing.cpf,
    cnpj: data.cnpj ?? existing.cnpj,
    stateRegistration: data.stateRegistration !== undefined ? data.stateRegistration : existing.stateRegistration,
    dueDay: data.dueDay ?? existing.dueDay,
    creditLimit: data.creditLimit ?? existing.creditLimit,
    addressStreet: data.addressStreet !== undefined ? data.addressStreet : existing.addressStreet,
    addressNumber: data.addressNumber !== undefined ? data.addressNumber : existing.addressNumber,
    addressDistrict: data.addressDistrict !== undefined ? data.addressDistrict : existing.addressDistrict,
    addressCity: data.addressCity !== undefined ? data.addressCity : existing.addressCity,
    addressCityCode: data.addressCityCode !== undefined ? data.addressCityCode : existing.addressCityCode,
    addressState: data.addressState !== undefined ? data.addressState : existing.addressState,
    addressPostalCode:
      data.addressPostalCode !== undefined ? data.addressPostalCode : existing.addressPostalCode,
  });
}

export async function deactivateClient(id) {
  const existing = await clientRepository.findById(Number(id));
  if (!existing) {
    throw new Error("Cliente não encontrado.");
  }
  return clientRepository.deactivate(Number(id));
}

export function getDuePanel() {
  const today = new Date().getDate();
  return clientRepository.findDueOrOverdue(today);
}

export async function getStatement(id) {
  const client = await clientRepository.findById(Number(id));
  if (!client) {
    throw new Error("Cliente não encontrado.");
  }

  const orders = await prisma.order.findMany({
    where: { clientId: client.id, paymentMethod: "TAB" },
    include: { items: { include: { product: true } } },
    orderBy: { createdAt: "asc" },
  });
  const payments = await clientPaymentRepository.findByClient(client.id);

  const entries = [
    ...orders.map((order) => ({
      type: "charge",
      date: order.createdAt,
      amount: Number(order.totalAmount),
      description: order.items.map((item) => `${item.quantity}x ${item.product.name}`).join(", "),
    })),
    ...payments.map((payment) => ({
      type: "payment",
      date: payment.createdAt,
      amount: Number(payment.amount),
      description: "Pagamento recebido",
    })),
  ].sort((a, b) => a.date - b.date);

  const messageLines = [
    `Extrato - ${client.name}`,
    ...entries.map(
      (entry) =>
        `${entry.date.toLocaleDateString("pt-BR")} - ${entry.type === "charge" ? "+" : "-"}R$ ${entry.amount.toFixed(2)} (${entry.description})`,
    ),
    `Saldo devedor atual: R$ ${Number(client.currentBalance).toFixed(2)}`,
  ];

  return { client, entries, message: messageLines.join("\n") };
}

export async function settleDebt(id, amount) {
  const client = await clientRepository.findById(Number(id));
  if (!client) {
    throw new Error("Cliente não encontrado.");
  }
  if (!amount || amount <= 0) {
    throw new Error("Valor do pagamento deve ser maior que zero.");
  }
  if (amount > Number(client.currentBalance)) {
    throw new Error("Valor do pagamento é maior que o saldo devedor.");
  }

  return prisma.$transaction(async (tx) => {
    await clientPaymentRepository.create(client.id, amount, tx);
    return tx.client.update({
      where: { id: client.id },
      data: { currentBalance: { decrement: amount } },
    });
  });
}
