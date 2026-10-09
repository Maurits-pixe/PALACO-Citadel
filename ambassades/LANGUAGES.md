# Embassy website languages

The public embassy overview and personal access page offer Dutch (nl), English (en), German (de), French (fr), Spanish (es), Italian (it), Portuguese (pt), Russian (ru), Simplified Chinese (zh), Modern Standard Arabic (ar), and Esperanto (eo).

Choose a language in either header. A supported ?lang= URL value takes priority over the saved browser preference; Dutch is the initial fallback. Cross-page links preserve the choice and selected seat. Only the language code is stored in localStorage, and blocked storage does not prevent language selection. If translation data fails to load, the complete Dutch source documents remain readable.

i18n.js reads the public locales.json catalogs and replaces matched Dutch source text and accessibility/description attributes with plain text. The portal uses the same catalogs for changing login/account status and seat messages. Translated search terms match visible post titles and descriptions; category identifiers and all seat IDs remain stable.

Arabic sets dir=rtl. Switching away restores dir=ltr. Fixed seat IDs have left-to-right direction, and interpolated seat labels are isolated for correct mixed-script display; those controls never enter an API URL.

Maintain all catalogs with identical keys and placeholder sets. Each existing Dutch text maps to one stable translation key. New or edited source text requires a matching catalog update; organization names and technical state/seat codes stay unchanged. Translations describe governance design and personal access only; they do not grant authority or activate accounts.

Verification covers all eleven language reading/search/category/access journeys on mobile and desktop, language persistence, URL priority, blocked storage, fallback on missing data, and placeholder parity. The existing authentication denial checks still run. Container startup verifies that the translation assets are included and published while private runtime paths remain closed.
