import * as storeSettingsService from "../services/storeSettings.service.js";

export async function get(req, res) {
  return res.json(await storeSettingsService.getSettings());
}

export async function update(req, res) {
  try {
    return res.json(await storeSettingsService.updateSettings(req.body));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

export async function approveDiscount(req, res) {
  try {
    return res.json(
      await storeSettingsService.approveDiscount({
        email: req.body.email,
        password: req.body.password,
        discountAmount: req.body.discountAmount,
      }),
    );
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}
