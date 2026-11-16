"""Run against a local Astro server: python3 tests/skills-layout.test.py."""

import os
import unittest

from playwright.sync_api import sync_playwright


class SkillsLayoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.base_url = os.environ.get("SKILLS_BASE_URL", "http://127.0.0.1:4329")
        self.context = self.browser.new_context(reduced_motion="reduce")
        # Keep these tests local and exercise readable labels when CDNs fail.
        self.context.route("**/*", lambda route: route.continue_()
                           if route.request.url.startswith(self.base_url + "/")
                           else route.abort())
        self.page = self.context.new_page()

    def tearDown(self):
        self.context.close()

    def open_skills(self, path="/", width=1280):
        self.page.set_viewport_size({"width": width, "height": 900})
        self.page.goto(self.base_url + path, wait_until="networkidle")
        return self.page.locator("#skills")

    def test_names_are_visible_without_hover_in_every_locale(self):
        for path in ("/", "/es/", "/gl/"):
            with self.subTest(path=path):
                skills = self.open_skills(path)
                links = skills.get_by_role("link")
                self.assertGreater(links.count(), 50)
                for link in links.all():
                    self.assertTrue(link.inner_text().strip(),
                                    "Every skill link needs a visible name, not just an icon")
                    self.assertTrue(link.is_visible())

    def test_groups_use_two_columns_on_desktop_and_one_on_mobile(self):
        for width, columns in ((1280, 2), (768, 2), (390, 1), (320, 1)):
            with self.subTest(width=width):
                skills = self.open_skills(width=width)
                groups = skills.locator(".skill-group")
                self.assertEqual(groups.count(), 6)
                positions = [round(group.bounding_box()["x"]) for group in groups.all()]
                self.assertEqual(len(set(positions)), columns)
                self.assertFalse(self.page.evaluate(
                    "document.documentElement.scrollWidth > innerWidth"))

    def test_architecture_has_icons_and_visible_names_in_every_locale(self):
        for path, heading in (("/", "Architecture"), ("/es/", "Arquitectura"),
                              ("/gl/", "Arquitectura")):
            with self.subTest(path=path):
                skills = self.open_skills(path)
                self.assertEqual(skills.get_by_role("heading", level=3).count(), 6)
                architecture = skills.locator(".skill-group").filter(
                    has=self.page.get_by_role("heading", name=heading, exact=True))
                self.assertEqual(architecture.count(), 1)
                for link in architecture.get_by_role("link").all():
                    self.assertTrue(link.inner_text().strip())
                    icon = link.locator("svg")
                    self.assertEqual(icon.count(), 1)
                    self.assertTrue(icon.is_visible())
                    self.assertEqual(icon.get_attribute("aria-hidden"), "true")

    def test_bdd_is_removed_without_removing_tdd(self):
        for path in ("/", "/es/", "/gl/"):
            with self.subTest(path=path):
                skills = self.open_skills(path)
                self.assertEqual(skills.get_by_text("BDD", exact=True).count(), 0)
                self.assertEqual(skills.get_by_role("link", name="TDD", exact=True).count(), 1)

    def test_existing_links_and_language_levels_are_preserved(self):
        for path, language, level in (("/", "Spanish", "Native"),
                                      ("/es/", "Español", "Nativo"),
                                      ("/gl/", "Español", "Nativo")):
            with self.subTest(path=path):
                skills = self.open_skills(path)
                vue = skills.get_by_role("link", name="Vue", exact=True)
                self.assertEqual(vue.get_attribute("href"), "https://vuejs.org")
                self.assertEqual(vue.get_attribute("target"), "_blank")
                self.assertIn("noopener", vue.get_attribute("rel"))
                self.assertIn(language.casefold(), skills.inner_text().casefold())
                self.assertIn(level, skills.inner_text())


if __name__ == "__main__":
    unittest.main()
