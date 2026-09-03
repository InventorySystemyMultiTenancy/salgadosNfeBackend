import * as fiscalService from "../services/fiscal.service.js";

export async function getSettings(req, res) {
  const settings = await fiscalService.getSettings();
  return res.json(settings);
}

export async function getPublicSettings(req, res) {
  const settings = await fiscalService.getPublicSettings();
  return res.json(settings);
}

export async function updateSettings(req, res) {
  try {
    const settings = await fiscalService.updateSettings(req.body);
    return res.json(settings);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}
