export function getFrontendUrl() {
  const raw = process.env.FRONTEND_URL || "http://localhost:5173";
  const withScheme = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/$/, "");
}
