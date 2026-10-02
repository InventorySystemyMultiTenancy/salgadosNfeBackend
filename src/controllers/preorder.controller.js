import * as preorderService from "../services/preorder.service.js";
import { getIO } from "../socket.js";

// Toda mudança avisa a cozinha, que mostra as encomendas das próximas 48h na fila de produção.
function handle(fn, { notify = false, status = 200 } = {}) {
  return async (req, res) => {
    try {
      const result = await fn(req);
      if (notify) getIO().to("kitchen").emit("preorder:updated", result);
      return res.status(status).json(result);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  };
}

export const list = handle((req) =>
  preorderService.listPreorders({ scope: req.query.scope, from: req.query.from, to: req.query.to }),
);

export const production = handle(() => preorderService.getProductionQueue());

export const create = handle((req) => preorderService.createPreorder({ userId: req.user.id, ...req.body }), {
  notify: true,
  status: 201,
});

export const update = handle((req) => preorderService.updatePreorder(req.params.id, req.body), { notify: true });

export const setStatus = handle((req) => preorderService.setStatus(req.params.id, req.body.status), {
  notify: true,
});

export const deliver = handle(
  (req) => preorderService.deliverPreorder(req.params.id, { balanceMethod: req.body.balanceMethod }),
  { notify: true },
);

export const cancel = handle((req) => preorderService.cancelPreorder(req.params.id), { notify: true });
