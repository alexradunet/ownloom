export function createLogController(logElement) {
  return function log(message, data) {
    const suffix = data === undefined ? "" : ` ${stringifySafe(redact(data))}`;
    const line = `[${new Date().toLocaleTimeString()}] ${message}${suffix}`;
    logElement.textContent = `${line}\n${logElement.textContent}`.slice(0, 12000);
  };
}

function stringifySafe(value) {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

function redact(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);
  const copy = {};
  for (const [key, item] of Object.entries(value)) {
    if (/token|authorization|auth/i.test(key)) copy[key] = "[redacted]";
    else copy[key] = redact(item);
  }
  return copy;
}
