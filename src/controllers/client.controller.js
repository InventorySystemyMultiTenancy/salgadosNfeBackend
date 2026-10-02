import * as clientService from "../services/client.service.js";

export async function list(req, res) {
  const clients = await clientService.listClients();
  return res.json(clients);
}

export async function create(req, res) {
  try {
    const client = await clientService.createClient(req.body);
    return res.status(201).json(client);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

export async function update(req, res) {
  try {
    const client = await clientService.updateClient(req.params.id, req.body);
    return res.json(client);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

export async function remove(req, res) {
  try {
    await clientService.deactivateClient(req.params.id);
    return res.status(204).send();
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

export async function duePanel(req, res) {
  const clients = await clientService.getDuePanel();
  return res.json(clients);
}

export async function statement(req, res) {
  try {
    const result = await clientService.getStatement(req.params.id);
    return res.json(result);
  } catch (error) {
    return res.status(404).json({ error: error.message });
  }
}

export async function pay(req, res) {
  try {
    const client = await clientService.settleDebt(
      req.params.id,
      Number(req.body.amount),
      req.body.paymentMethod || undefined,
    );
    return res.json(client);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}
