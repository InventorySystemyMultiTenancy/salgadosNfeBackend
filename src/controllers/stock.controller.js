import * as stockService from "../services/stock.service.js";

function handle(fn, status = 200) {
  return async (req, res) => {
    try {
      return res.status(status).json(await fn(req));
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  };
}

export const createEntries = handle(
  (req) =>
    stockService.createEntries({
      userId: req.user.id,
      type: req.body.type,
      reason: req.body.reason,
      items: req.body.items,
    }),
  201,
);

export const listMovements = handle((req) =>
  stockService.listMovements({
    productId: req.query.productId,
    type: req.query.type,
    from: req.query.from,
    to: req.query.to,
  }),
);

export const applyCount = handle(
  (req) => stockService.applyCount({ userId: req.user.id, notes: req.body.notes, items: req.body.items }),
  201,
);

export const listCounts = handle(() => stockService.listCounts());

export const getCount = handle((req) => stockService.getCount(req.params.id));
