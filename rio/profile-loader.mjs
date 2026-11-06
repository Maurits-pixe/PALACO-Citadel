import { readFileSync } from "node:fs";

function freezeJson(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}

export function readFrozenProfile(url) {
  return freezeJson(JSON.parse(readFileSync(url, "utf8")));
}
