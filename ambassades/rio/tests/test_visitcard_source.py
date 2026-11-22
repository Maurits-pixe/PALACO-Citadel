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

    def test_offline_trial_boundary_remains_explicit(self):
        self.assertIn("Alles in deze proef blijft op dit apparaat.", self.html)
        self.assertIn("Berichten naar andere apparaten zijn nog niet beschikbaar.", self.html)


if __name__ == "__main__":
    unittest.main()
