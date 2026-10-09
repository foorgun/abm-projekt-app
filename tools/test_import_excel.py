"""Tests für die Bereinigungsregeln. Aufruf: python3 -m unittest discover -s tools -p "test_*.py" """
import datetime as dt
import unittest

import import_excel as ie


class DateRules(unittest.TestCase):
    def test_real_date_passes_unchanged(self):
        self.assertEqual(ie.parse_date(dt.datetime(2026, 3, 5)), (dt.date(2026, 3, 5), None))

    def test_typo_year_is_fixed_and_flagged(self):
        day, note = ie.parse_date("23.04.206")
        self.assertEqual(day, dt.date(2026, 4, 23))
        self.assertIn("korrigiert", note)

    def test_leading_zero_year(self):
        self.assertEqual(ie.parse_date("29.05.0206")[0], dt.date(2026, 5, 29))

    def test_excel_serial_number(self):
        # Excel zählt ab 1900; 46023 ist der 01.01.2026, 46128 liegt 105 Tage später
        self.assertEqual(ie.parse_date(46023)[0], dt.date(2026, 1, 1))
        day, note = ie.parse_date(46128)
        self.assertEqual(day, dt.date(2026, 4, 16))
        self.assertIn("Seriennummer", note)

    def test_garbage_is_not_guessed(self):
        self.assertIsNone(ie.parse_date("bald")[0])
        self.assertIsNone(ie.parse_date("12.03.1999x")[0])

    def test_empty(self):
        self.assertEqual(ie.parse_date(None), (None, None))


class TextRules(unittest.TestCase):
    def test_planer_spacing_and_storno(self):
        self.assertEqual(ie.normalize_planer("L.Tas"), ("L. Tas", False))
        self.assertEqual(ie.normalize_planer("K. Keller"), ("K. Keller", False))
        self.assertEqual(ie.normalize_planer("Storno (?)"), (None, True))
        self.assertEqual(ie.normalize_planer("STORNO"), (None, True))

    def test_baubetreuung_trailing_dot(self):
        self.assertEqual(ie.normalize_baubetreuung("3.1+3.2."), "3.1+3.2")
        self.assertEqual(ie.normalize_baubetreuung("3.1+3.2 Leidl"), "3.1+3.2 Leidl")
        self.assertIsNone(ie.normalize_baubetreuung("  "))

    def test_month_header(self):
        self.assertEqual(ie.parse_month_header("März 2026"), dt.date(2026, 3, 1))
        self.assertIsNone(ie.parse_month_header("96"))

    def test_storno_detection(self):
        self.assertTrue(ie.detect_storno(["Eder", "STORNO"], 0))
        self.assertTrue(ie.detect_storno(["Bader"], 14))
        self.assertFalse(ie.detect_storno(["Müller"], 1))

    def test_sql_quoting(self):
        self.assertEqual(ie.q("O'Brien"), "'O''Brien'")
        self.assertEqual(ie.q(None), "null")
        self.assertEqual(ie.q(dt.date(2026, 1, 2)), "'2026-01-02'")


class Matching(unittest.TestCase):
    def _contact(self, row, name, address, building):
        return ie.Contact(row, name, address, None, None, building, None, None, None, None, None)

    def _project(self, row, label, location):
        return ie.Project(row, None, "neubau", "aktiv", None, None, label, location, None, None, None, None)

    def test_requires_name_and_place(self):
        contacts = [self._contact(2, "Julia und Andreas Muster", "Dahlienweg 4\n97816 Lohr", "Rombergstr. 5 Lohr")]
        hit = ie.match_contacts([self._project(10, "Muster", "Lohr am Main")], contacts)
        miss_place = ie.match_contacts([self._project(11, "Muster", "Hamburg")], contacts)
        self.assertEqual(hit, {10: 2})
        self.assertEqual(miss_place, {})

    def test_ambiguous_match_is_dropped(self):
        contacts = [self._contact(2, "Anna Muster", "Weg 1 Lohr", None),
                    self._contact(3, "Peter Muster", "Weg 2 Lohr", None)]
        self.assertEqual(ie.match_contacts([self._project(10, "Muster", "Lohr")], contacts), {})


if __name__ == "__main__":
    unittest.main()
