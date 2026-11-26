"""Static regression checks for the RIO public VisitCard source.

Run from repository root:
    python -m unittest discover -s ambassades/rio/tests -v

These checks do not substitute for browser or mobile end-to-end tests.
"""
from pathlib import Path
import re
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "palaco-rio-start-v0.1.html"
PUBLIC_URL = "https://rio-preview.mauritsvang1.chatgpt.site/"
LOCALES = ("nl", "en", "de", "fr", "es", "it", "pt", "ru", "zh", "ar", "eo")


class VisitCardSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = SOURCE.read_text(encoding="utf-8")

    def test_public_link_is_canonical(self):
        self.assertIn("const publicRioUrl='" + PUBLIC_URL + "';", self.html)
        self.assertRegex(self.html, r'<a class="btn outline" href="' + re.escape(PUBLIC_URL) + r'"')
        self.assertNotIn("location.href+location.search", self.html)

    def test_share_payload_excludes_private_state(self):
        self.assertIn("navigator.share({title:m.title,url:publicRioUrl})", self.html)
        self.assertIn("navigator.clipboard.writeText(publicRioUrl)", self.html)
        self.assertNotRegex(self.html, r"navigator\.share\(\{[^}]*?(?:contacts|state|trial)", "Share payload must contain only the public URL")

    def test_languages_covered(self):
        for lang in LOCALES:
            with self.subTest(lang=lang):
                self.assertIn(" " + lang + ":{heading:", self.html)
        self.assertIn("renderRioShare();", self.html)

    def test_accessibility_and_safe_external_link(self):
        self.assertIn('aria-labelledby="rio-share-title"', self.html)
        self.assertIn('role="status" aria-live="polite"', self.html)
        self.assertIn('target="_blank" rel="noopener noreferrer"', self.html)
        self.assertIn('rel="icon" type="image/svg+xml"', self.html)

    def test_manual_copy_fallback_accessibility(self):
        self.assertIn('id="rio-share-manual" hidden', self.html)
        self.assertIn('id="rio-share-manual-url" type="text" readonly', self.html)
        self.assertIn('aria-describedby="rio-share-feedback"', self.html)
        self.assertIn('field.value=publicRioUrl;', self.html)
        self.assertIn('field.focus();', self.html)
        self.assertIn('field.select();', self.html)
        self.assertIn('revealRioManualCopy();', self.html)

    def test_manual_copy_labels_in_all_locales(self):
        self.assertIn('const rioManualLabels=', self.html)
        for lang in LOCALES:
            with self.subTest(lang=lang):
                self.assertIn('"' + lang + '":', self.html)
        self.assertIn('rioManualLabels[language]||rioManualLabels.en', self.html)

    def test_trust_status_is_explicitly_unverified(self):
        self.assertIn('id="rio-trust-title"', self.html)
        self.assertIn('Niet geverifieerd · geen autorisatie', self.html)
        self.assertIn('geen cryptografisch bewijs', self.html)
        self.assertIn('Alleen lokaal · geen echte bezorging', self.html)

    def test_trust_panel_locales_and_rendering(self):
        for lang in LOCALES:
            with self.subTest(lang=lang):
                self.assertIn(" " + lang + ":[", self.html)
        self.assertIn("renderRioTrust();", self.html)
        for key in ("title", "publicValue", "trialValue", "identityValue", "explain"):
            self.assertIn('data-rio-trust="' + key + '"', self.html)

    def test_offline_trial_boundary_remains_explicit(self):
        self.assertIn("Alles in deze proef blijft op dit apparaat.", self.html)
        self.assertIn("Berichten naar andere apparaten zijn nog niet beschikbaar.", self.html)


if __name__ == "__main__":
    unittest.main()
