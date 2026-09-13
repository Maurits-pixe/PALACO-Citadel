import { readFileSync } from "node:fs";

export const localeProfile = JSON.parse(readFileSync(new URL("./locales.json", import.meta.url), "utf8"));

export function resolveLocale(requestedLocale = localeProfile.default_locale) {
  const requested = typeof requestedLocale === "string" ? requestedLocale.trim().toLowerCase() : "";
  const base = requested.split("-")[0];
  const resolved = localeProfile.supported_locales.includes(base)
    ? base
    : localeProfile.fallback_locale;
  const definition = localeProfile.locales[resolved];

  return {
    requested: requested || null,
    resolved,
    fallback_used: resolved !== base,
    direction: definition.direction,
    name: definition.name
  };
}

export function translate(messageId, requestedLocale) {
  const locale = resolveLocale(requestedLocale);
  const localized = localeProfile.locales[locale.resolved].messages[messageId];
  const fallback = localeProfile.locales[localeProfile.fallback_locale].messages[messageId];

  if (localized === undefined && fallback === undefined) {
    return {
      ok: false,
      errors: [`message ${messageId} is not defined`],
      locale
    };
  }

  return {
    ok: true,
    errors: [],
    message_id: messageId,
    text: localized ?? fallback,
    locale: {
      ...locale,
      fallback_used: locale.fallback_used || localized === undefined
    }
  };
}
