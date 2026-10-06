import unittest

from pydantic import ValidationError

from activity_hub.contracts import (
    CheckWrite, DashboardQuery, FrontCreate, FrontPatch, FrontQuery, HistoryQuery,
)


class ContractAcceptance(unittest.TestCase):
    def test_name_is_trimmed_and_bounded(self):
        self.assertEqual(FrontCreate(name=" \t Nombre \n ").name, "Nombre")
        self.assertEqual(len(FrontCreate(name="x" * 200).name), 200)
        for name in ("", " \t\n\u2003", "\x00", "A\x00B", "x" * 201, None, 17, True):
            with self.subTest(name_type=type(name), length=len(name) if isinstance(name, str) else None):
                with self.assertRaises(ValidationError):
                    FrontCreate(name=name)

    def test_reference_is_optional_http_only_and_bounded(self):
        self.assertIsNone(FrontCreate(name="A").reference)
        self.assertEqual(FrontCreate(name="A", reference="http://example.test").reference, "http://example.test/")
        for reference in ("javascript:alert(1)", "data:text/plain,x", "file:///tmp/x", "ftp://example.test", "https://", "not-url", "", 1, "https://example.test/" + "x" * 2048):
            with self.subTest(reference_type=type(reference)):
                with self.assertRaises(ValidationError):
                    FrontCreate(name="A", reference=reference)

    def test_states_and_patch_do_not_accept_null_or_unknown_fields(self):
        for state in ("open", "standby", "archived"):
            self.assertEqual(FrontCreate(name="A", state=state).state, state)
        for payload in ({"state": "closed"}, {"name": None}, {"state": None}, {}, {"task": "X"}):
            with self.subTest(payload=payload):
                with self.assertRaises(ValidationError):
                    FrontPatch(**payload)
        self.assertEqual(FrontPatch(reference=None).model_dump(exclude_unset=True), {"reference": None})
        for state in (None, "OPEN", "", 1):
            with self.assertRaises(ValidationError):
                FrontCreate(name="A", state=state)
        with self.assertRaises(ValidationError):
            FrontCreate(name="A", score=1)

    def test_strict_bool_and_strict_iso_day_or_exact_alias(self):
        for day in ("today", "yesterday", "2024-02-29", "0001-01-01"):
            self.assertEqual(CheckWrite(day=day, marked=True).day, day)
        for value in (1, 0, "true", "false", None, [], {}):
            with self.subTest(value=value):
                with self.assertRaises(ValidationError):
                    CheckWrite(day="today", marked=value)
        for day in ("2026-1-01", "20260101", "2026-02-30", "2026-10-03T00:00:00Z", " Today ", "ayer", 1234, "0000-01-01", "２０２６-10-03"):
            with self.subTest(day=day):
                with self.assertRaises(ValidationError):
                    CheckWrite(day=day, marked=True)

    def test_dashboard_order_is_validated_and_not_a_front_query_field(self):
        window = {"start": "2026-01-01", "end": "2026-01-03"}
        self.assertEqual(DashboardQuery(**window).order, "created")
        for order in ("created", "activity_desc"):
            with self.subTest(order=order):
                self.assertEqual(DashboardQuery(**window, order=order).order, order)
                with self.assertRaises(ValidationError):
                    FrontQuery(order=order)
        for order in ("", "CREATED", "activity_asc", "count", None, 1, True):
            with self.subTest(order=order):
                with self.assertRaises(ValidationError):
                    DashboardQuery(**window, order=order)

    def test_read_intervals_and_pagination_have_explicit_bounds(self):
        for model in (HistoryQuery, DashboardQuery):
            good = model(start="2024-01-01", end="2024-12-31")
            self.assertLessEqual(good.limit, 1000)
            for values in (
                {"start": "2026-02-02", "end": "2026-02-01"},
                {"start": "2024-01-01", "end": "2025-01-01"},
                {"start": "today", "end": "today"},
                {"start": "2026-1-01", "end": "2026-01-02"},
            ):
                with self.subTest(model=model, values=values):
                    with self.assertRaises(ValidationError):
                        model(**values)
        for values in ({"limit": 0}, {"limit": 101}, {"offset": -1}, {"offset": 100001}, {"states": ["closed"]}, {"search": " "}, {"search": "x" * 201}):
            with self.subTest(values=values):
                with self.assertRaises(ValidationError):
                    FrontQuery(**values)
        with self.assertRaises(ValidationError):
            HistoryQuery(start="2026-01-01", end="2026-01-02", limit=1001)
        with self.assertRaises(ValidationError):
            DashboardQuery(start="2026-01-01", end="2026-01-02", limit=101)


if __name__ == "__main__":
    unittest.main()
