import * as reportService from "../services/report.service.js";

export async function sales(req, res) {
  try {
    const summary = await reportService.getSalesSummary({
      from: req.query.from,
      to: req.query.to,
      tzOffset: req.query.tzOffset,
    });
    return res.json(summary);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}
