const DAY_MS = 24 * 60 * 60 * 1000;

// Período opcional vindo da query string (ISO). Sem `from` nem `to` devolve null = sem filtro de
// data; com só um dos lados, o outro fica aberto.
export function parseOptionalRange({ from, to } = {}, { maxDays = 3700 } = {}) {
  if (!from && !to) return null;
  const start = from ? new Date(from) : null;
  const end = to ? new Date(to) : null;
  if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime()))) {
    throw new Error("Período inválido.");
  }
  if (start && end && start >= end) {
    throw new Error("A data inicial precisa ser antes da final.");
  }
  if (start && end && end - start > maxDays * DAY_MS) {
    throw new Error("Período longo demais.");
  }
  return { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) };
}

export function parsePage({ page, pageSize } = {}, { defaultSize = 50, maxSize = 200 } = {}) {
  const size = Math.min(Math.max(Number(pageSize) || defaultSize, 1), maxSize);
  const current = Math.max(Number(page) || 1, 1);
  return { page: current, pageSize: size, skip: (current - 1) * size, take: size };
}

export function parseId(value) {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Identificador inválido.");
  return id;
}
