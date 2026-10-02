import * as cashService from "../services/cash.service.js";

function handle(fn) {
  return async (req, res) => {
    try {
      return res.json(await fn(req));
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  };
}

export const current = handle(() => cashService.getCurrent());

export const open = handle((req) =>
  cashService.openSession({ userId: req.user.id, openingAmount: req.body.openingAmount }),
);

export const addMovement = handle((req) =>
  cashService.addMovement({
    userId: req.user.id,
    type: req.body.type,
    amount: req.body.amount,
    reason: req.body.reason,
  }),
);

export const close = handle((req) =>
  cashService.closeSession({ userId: req.user.id, countedCash: req.body.countedCash, notes: req.body.notes }),
);

export const list = handle(() => cashService.listSessions());

export const getOne = handle((req) => cashService.getSession(req.params.id));
