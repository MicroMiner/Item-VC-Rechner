// Shared, dependency-free helpers for public portal JSON. No economy API access.
export async function loadData(path, collection) {
  const response = await fetch(path);
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!data || data.version !== 1 || !Array.isArray(data[collection]))
    throw Error("Ungültiges Datenformat");
  return data[collection];
}
export function safeUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, document.baseURI);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
