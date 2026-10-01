import * as paymentService from "../services/payment.service.js";

// Todas as operações aqui podem falhar por motivo "de negócio" (config faltando, erro do banco,
// cobrança já na maquininha) — a mensagem vai direto pro operador, no mesmo formato do fiscal.
function handle(fn) {
  return async (req, res) => {
    try {
      return await fn(req, res);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  };
}

export const getSettings = handle(async (req, res) => res.json(await paymentService.getSettings()));

export const getPublicSettings = handle(async (req, res) => res.json(await paymentService.getPublicSettings()));

export const updateSettings = handle(async (req, res) => res.json(await paymentService.updateSettings(req.body)));

export const listTerminals = handle(async (req, res) => res.json(await paymentService.listTerminals()));

export const pairTerminal = handle(async (req, res) =>
  res.status(201).json(await paymentService.pairTerminal({ pairingCode: req.body.pairingCode, name: req.body.name })),
);

export const setupTerminal = handle(async (req, res) => {
  await paymentService.setupTerminal(req.params.terminalId);
  return res.json({ ok: true });
});

export const createCharge = handle(async (req, res) => {
  const payment = await paymentService.createCharge({
    amount: req.body.amount,
    paymentMethod: req.body.paymentMethod,
    sellerId: req.user.id,
  });
  return res.status(201).json(payment);
});

export const getCharge = handle(async (req, res) => res.json(await paymentService.getCharge(req.params.id)));

export const cancelCharge = handle(async (req, res) => res.json(await paymentService.cancelCharge(req.params.id)));
