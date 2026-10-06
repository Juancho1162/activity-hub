import json
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

from pydantic import ValidationError
from sqlalchemy import event, func, select, text

from activity_hub.contracts import (
    CheckWrite, DashboardQuery, FrontCreate, FrontPatch, FrontQuery, HistoryQuery,
)
from activity_hub.database import Database
from activity_hub.errors import DomainError, StorageUnavailable
from activity_hub.models import ActivityCheck, Front, IdempotencyRequest
from activity_hub.operations import Operations
from tests.helpers import create_account, migrate

NOW = datetime(2026, 10, 3, 12, 30, tzinfo=UTC)


class OperationsAcceptance(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "activity.sqlite3"
        migrate(self.path)
        self.database = Database(self.path)
        self.addCleanup(self.database.dispose)
        self.now = NOW
        self.account_id = create_account(self.database, clock=lambda: self.now)
        self.operations = Operations(self.database, clock=lambda: self.now).with_account(self.account_id)

    def create(self, name="Guitarra", **fields):
        return self.operations.create_front(FrontCreate(name=name, **fields), uuid4())

    def mark(self, front, day="today", marked=True, key=None):
        return self.operations.write_check(
            front.id, CheckWrite(day=day, marked=marked), key or uuid4(),
        )

    def counts(self):
        with self.database.transaction() as session:
            return tuple(session.scalar(select(func.count()).select_from(model))
                         for model in (Front, ActivityCheck, IdempotencyRequest))

    def assert_domain(self, status, call):
        with self.assertRaises(DomainError) as caught:
            call()
        self.assertEqual(caught.exception.status_code, status)

    def test_same_name_creates_independent_fronts(self):
        first = self.operations.create_front(FrontCreate(name="Guitarra"), uuid4())
        second = self.operations.create_front(FrontCreate(name="Guitarra"), uuid4())
        self.assertIsNotNone(first, "Creation must return a durably saved front")
        self.assertIsNotNone(second, "Each independent request must create a front")
        self.assertNotEqual(first.id, second.id)
        self.assertIsInstance(first.id, UUID)
        self.assertEqual(first.name, second.name)
        self.assertEqual(first.state, "open")
        self.assertEqual(self.counts(), (2, 0, 2))
        self.assertEqual(first.created_at, NOW)
        self.assertEqual(first.updated_at, NOW)

    def test_patch_omission_link_clear_and_state_preserve_history(self):
        front = self.create(name="  Formación  ", reference="https://example.test/course")
        self.assertEqual(front.name, "Formación")
        self.mark(front, "1999-01-01")  # Dates before creation are intentionally allowed.
        self.now += timedelta(seconds=1)
        archived = self.operations.patch_front(front.id, FrontPatch(state="archived"))
        self.assertEqual(archived.name, front.name)
        self.assertEqual(archived.reference, front.reference)
        self.assertEqual(archived.created_at, front.created_at)
        self.assertGreater(archived.updated_at, front.updated_at)
        cleared = self.operations.patch_front(front.id, FrontPatch(reference=None))
        self.assertIsNone(cleared.reference)
        self.assertEqual(cleared.state, "archived")
        history = self.operations.history(HistoryQuery(
            start="1999-01-01", end="1999-01-01", front_id=front.id,
        ))
        self.assertEqual([row.day for row in history.items], [date(1999, 1, 1)])

    def test_checks_in_all_states_are_desired_values_not_toggles(self):
        for state in ("open", "standby", "archived"):
            with self.subTest(state=state):
                front = self.create(state=state)
                self.mark(front)
                self.mark(front)  # Independent desired-true requests still yield one row.
                self.assertEqual(self.operations.get_front(front.id).state, state)
                history = self.operations.history(HistoryQuery(
                    start="2026-10-03", end="2026-10-03", front_id=front.id,
                ))
                self.assertEqual(history.total, 1)
                self.assertTrue(history.items[0].marked)
                self.mark(front, marked=False)
                self.mark(front, marked=False)
                self.assertEqual(self.operations.get_front(front.id).state, state)
                self.assertEqual(self.operations.history(HistoryQuery(
                    start="2026-10-03", end="2026-10-03", front_id=front.id,
                )).total, 0)
        self.assertEqual(self.counts()[1], 0)  # Unmark means no row, not a stored false claim.

    def test_create_replay_is_persistent_snapshot_not_a_later_edit_rollback(self):
        key = uuid4()
        payload = FrontCreate(name="Original", reference="https://example.test/")
        original = self.operations.create_front(payload, key)
        edited = self.operations.patch_front(original.id, FrontPatch(name="Edited", state="standby"))
        self.database.dispose()
        reopened = Database(self.path)
        self.addCleanup(reopened.dispose)
        operations = Operations(reopened, clock=lambda: NOW + timedelta(days=1)).with_account(self.account_id)
        self.assertEqual(operations.create_front(payload, key), original)
        self.assertEqual(operations.get_front(original.id), edited)
        self.assertEqual(self.counts(), (1, 0, 1))
        with reopened.transaction() as session:
            record = session.get(IdempotencyRequest, (self.account_id, key))
            self.assertEqual(json.loads(record.payload)["name"], "Original")
            self.assertEqual(json.loads(record.response)["name"], "Original")

    def test_canonical_defaults_and_trim_replay_the_same_request(self):
        key = uuid4()
        first = self.operations.create_front(FrontCreate(name="  Same  "), key)
        again = self.operations.create_front(FrontCreate(name="Same", reference=None, state="open"), key)
        self.assertEqual(first, again)
        self.assertEqual(self.counts(), (1, 0, 1))

    def test_key_conflicts_on_changed_payload_target_or_operation(self):
        key = uuid4()
        original = self.operations.create_front(FrontCreate(name="Original"), key)
        other = self.create(name="Other")
        # The database now has the new name; replay must compare the original request, not current data.
        self.operations.patch_front(original.id, FrontPatch(name="Changed"))
        self.assert_domain(409, lambda: self.operations.create_front(FrontCreate(name="Changed"), key))
        self.assert_domain(409, lambda: self.mark(original, key=key))
        check_key = uuid4()
        self.mark(original, key=check_key)
        self.assert_domain(409, lambda: self.mark(original, marked=False, key=check_key))
        self.assert_domain(409, lambda: self.mark(other, key=check_key))
        self.assert_domain(409, lambda: self.mark(original, day="2026-10-03", key=check_key))
        self.assertEqual(self.counts(), (2, 1, 3))

    def test_check_replay_survives_restart_midnight_and_does_not_reapply(self):
        self.now = datetime(2026, 10, 3, 21, 59, tzinfo=UTC)  # Madrid 23:59.
        front = self.create()
        key = uuid4()
        response = self.mark(front, key=key)
        self.assertEqual(response.day, date(2026, 10, 3))
        self.mark(front, day="2026-10-03", marked=False)
        self.database.dispose()
        reopened = Database(self.path)
        self.addCleanup(reopened.dispose)
        next_day = Operations(reopened, clock=lambda: datetime(2026, 10, 3, 22, 1, tzinfo=UTC)).with_account(self.account_id)
        replay = next_day.write_check(front.id, CheckWrite(day="today", marked=True), key)
        self.assertEqual(response, replay)
        self.assertEqual(self.counts()[1], 0)
        new_response = next_day.write_check(front.id, CheckWrite(day="today", marked=True), uuid4())
        self.assertEqual(new_response.day, date(2026, 10, 4))
        self.assertEqual(self.operations.history(HistoryQuery(
            start="2026-10-03", end="2026-10-04", front_id=front.id,
        )).items[0].day, date(2026, 10, 4))

    def test_unmark_replay_does_not_remove_a_later_mark(self):
        front = self.create()
        key = uuid4()
        unmarked = self.mark(front, marked=False, key=key)
        self.mark(front)
        self.assertEqual(self.mark(front, marked=False, key=key), unmarked)
        self.assertEqual(self.counts()[1], 1)

    def test_aliases_use_one_aware_clock_and_madrid_dst_calendar(self):
        front = self.create()
        cases = [
            (datetime(2026, 3, 28, 22, 59, tzinfo=UTC), date(2026, 3, 28)),
            (datetime(2026, 3, 28, 23, 1, tzinfo=UTC), date(2026, 3, 29)),
            (datetime(2026, 3, 29, 0, 59, tzinfo=UTC), date(2026, 3, 29)),
            (datetime(2026, 3, 29, 1, 1, tzinfo=UTC), date(2026, 3, 29)),
            (datetime(2026, 3, 29, 22, 1, tzinfo=UTC), date(2026, 3, 30)),
            (datetime(2026, 10, 24, 22, 1, tzinfo=UTC), date(2026, 10, 25)),
            (datetime(2026, 10, 25, 0, 59, tzinfo=UTC), date(2026, 10, 25)),
            (datetime(2026, 10, 25, 1, 1, tzinfo=UTC), date(2026, 10, 25)),
            (datetime(2026, 10, 25, 22, 59, tzinfo=UTC), date(2026, 10, 25)),
            (datetime(2026, 10, 25, 23, 1, tzinfo=UTC), date(2026, 10, 26)),
        ]
        for moment, today in cases:
            with self.subTest(moment=moment):
                calls = []
                def clock():
                    calls.append(True)
                    return moment
                operations = Operations(self.database, clock=clock).with_account(self.account_id)
                result = operations.write_check(front.id, CheckWrite(day="yesterday", marked=True), uuid4())
                self.assertEqual(result.day, today - timedelta(days=1))
                self.assertEqual(len(calls), 1)
                calls.clear()
                result = operations.write_check(front.id, CheckWrite(day="today", marked=True), uuid4())
                self.assertEqual(result.day, today)
                self.assertEqual(len(calls), 1)

    def test_invalid_and_missing_writes_leave_no_partial_records(self):
        front = self.create()
        baseline = self.counts()
        bad_key = uuid4()
        self.assert_domain(422, lambda: self.mark(front, "2026-10-04", key=bad_key))
        self.assert_domain(404, lambda: self.operations.write_check(
            uuid4(), CheckWrite(day="today", marked=True), uuid4(),
        ))
        self.assertEqual(self.counts(), baseline)
        # A failed request has not reserved its key.
        self.mark(front, "2026-10-03", key=bad_key)
        self.assertEqual(self.counts(), (1, 1, 2))
        with self.assertRaises(ValidationError):
            FrontCreate(name=" ")
        with self.assertRaises(ValidationError):
            CheckWrite(day="today", marked=1)
        self.assertEqual(self.counts(), (1, 1, 2))

    def test_storage_failure_rolls_back_front_and_request_log_together(self):
        with self.database.engine.begin() as connection:
            connection.exec_driver_sql("CREATE TRIGGER test_reject_log BEFORE INSERT ON idempotency_requests "
                                       "BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END")
        with self.assertRaises(StorageUnavailable):
            self.create()
        self.assertEqual(self.counts(), (0, 0, 0))

    def test_missing_ids_consistently_return_404(self):
        missing = uuid4()
        calls = [
            lambda: self.operations.get_front(missing),
            lambda: self.operations.patch_front(missing, FrontPatch(state="archived")),
            lambda: self.operations.history(HistoryQuery(start="2026-01-01", end="2026-01-02", front_id=missing)),
            lambda: self.operations.dashboard(DashboardQuery(start="2026-01-01", end="2026-01-02", front_id=missing)),
        ]
        for call in calls:
            self.assert_domain(404, call)

    def test_dashboard_global_last_range_count_marked_dates_and_empty_fronts(self):
        front = self.create()
        empty = self.create(name="Empty")
        self.mark(front, "2026-01-01")
        self.mark(front, "2026-01-03")
        self.mark(front, "2026-09-30")
        self.operations.patch_front(front.id, FrontPatch(state="archived"))
        dashboard = self.operations.dashboard(DashboardQuery(start="2026-01-01", end="2026-01-31"))
        self.assertEqual(dashboard.total, 2)
        by_id = {item.front.id: item for item in dashboard.items}
        self.assertEqual(by_id[front.id].last_registered_day, date(2026, 9, 30))
        self.assertEqual(by_id[front.id].marked_dates, [date(2026, 1, 1), date(2026, 1, 3)])
        self.assertEqual(by_id[front.id].count, 2)
        self.assertEqual(by_id[front.id].front.state, "archived")
        self.assertIsNone(by_id[empty.id].last_registered_day)
        self.assertEqual(by_id[empty.id].count, 0)
        self.assertEqual(by_id[empty.id].marked_dates, [])

    def test_dashboard_default_preserves_created_and_uuid_order(self):
        earliest = self.create(name="Earliest")
        self.now += timedelta(seconds=1)
        tied = [self.create(name="Tie") for _ in range(2)]
        tied_ids = sorted(front.id for front in tied)
        active = next(front for front in tied if front.id == tied_ids[-1])
        self.mark(active, "2026-01-01")
        self.mark(active, "2026-01-03")
        expected = [earliest.id, *tied_ids]
        window = {"start": "2026-01-01", "end": "2026-01-03"}
        dashboard = self.operations.dashboard(DashboardQuery(**window))
        self.assertEqual([item.front.id for item in dashboard.items], expected)
        self.assertEqual([item.id for item in self.operations.list_fronts(FrontQuery()).items], expected)
        page = self.operations.dashboard(DashboardQuery(**window, limit=1, offset=1))
        self.assertEqual(page.total, 3)
        self.assertEqual([item.front.id for item in page.items], [tied_ids[0]])

    def test_dashboard_activity_order_is_global_range_only_with_stable_ties_and_zeros(self):
        empty_early = self.create(name="Empty early")
        self.now += timedelta(seconds=1)
        all_time = self.create(name="More all-time activity")
        self.now += timedelta(seconds=1)
        tied = [self.create(name="Activity tie") for _ in range(2)]
        self.now += timedelta(seconds=1)
        empty_tied = [self.create(name="Empty tie") for _ in range(2)]
        self.now += timedelta(seconds=1)
        winner = self.create(name="Later-created range winner")
        for day in ("2025-12-31", "2026-01-02", "2026-01-04", "2026-04-01", "2026-09-30"):
            self.mark(all_time, day)
        for front, day in zip(tied, ("2026-01-01", "2026-01-03")):
            self.mark(front, day)
        for day in ("2026-01-01", "2026-01-02", "2026-01-03"):
            self.mark(winner, day)
        window = {"start": "2026-01-01", "end": "2026-01-03", "order": "activity_desc"}
        expected = [winner.id, all_time.id, *sorted(front.id for front in tied),
                    empty_early.id, *sorted(front.id for front in empty_tied)]
        items = []
        for offset in range(0, 7, 2):
            page = self.operations.dashboard(DashboardQuery(**window, limit=2, offset=offset))
            self.assertEqual((page.total, page.limit, page.offset), (7, 2, offset))
            self.assertEqual((page.start, page.end), (date(2026, 1, 1), date(2026, 1, 3)))
            self.assertEqual([item.front.id for item in page.items], expected[offset:offset + 2])
            items.extend(page.items)
        self.assertEqual([item.count for item in items], [3, 1, 1, 1, 0, 0, 0])
        by_id = {item.front.id: item for item in items}
        self.assertEqual(by_id[winner.id].marked_dates, [date(2026, 1, day) for day in (1, 2, 3)])
        self.assertEqual(by_id[all_time.id].marked_dates, [date(2026, 1, 2)])
        self.assertEqual(by_id[all_time.id].last_registered_day, date(2026, 9, 30))
        self.assertEqual(by_id[winner.id].last_registered_day, date(2026, 1, 3))
        for front in (empty_early, *empty_tied):
            self.assertEqual(by_id[front.id].marked_dates, [])
            self.assertIsNone(by_id[front.id].last_registered_day)

    def test_dashboard_activity_order_preserves_filters_front_lookup_and_total(self):
        slow = self.create(name="Literal%_slow")
        self.now += timedelta(seconds=1)
        fast = self.create(name="Literal%_fast", state="standby")
        self.now += timedelta(seconds=1)
        archived = self.create(name="Literal%_archived", state="archived")
        wrong_search = self.create(name="LiteralX_wrong search")
        empty = self.create(name="Literal%_empty")
        for front, days in ((slow, (2,)), (fast, (1, 3)), (archived, (1, 2, 3)),
                            (wrong_search, (1, 2, 3))):
            for day in days:
                self.mark(front, f"2026-01-0{day}")
        filters = {"start": "2026-01-01", "end": "2026-01-03", "order": "activity_desc",
                   "states": ["open", "standby"], "search": "%_"}
        for offset, front in enumerate((fast, slow, empty)):
            page = self.operations.dashboard(DashboardQuery(**filters, limit=1, offset=offset))
            self.assertEqual(page.total, 3)
            self.assertEqual([item.front.id for item in page.items], [front.id])
        past_end = self.operations.dashboard(DashboardQuery(**filters, limit=1, offset=3))
        self.assertEqual((past_end.total, past_end.items), (3, []))
        selected = self.operations.dashboard(DashboardQuery(**filters, front_id=fast.id))
        self.assertEqual(selected.total, 1)
        self.assertEqual([item.front.id for item in selected.items], [fast.id])
        self.assertEqual(selected.items[0].front.state, "standby")
        excluded = self.operations.dashboard(DashboardQuery(**filters, front_id=archived.id))
        self.assertEqual((excluded.total, excluded.items), (0, []))
        self.assert_domain(404, lambda: self.operations.dashboard(DashboardQuery(**filters, front_id=uuid4())))

    def test_list_search_filters_and_deterministic_pagination(self):
        fronts = [self.create(name="Same", state=state) for state in ("open", "standby", "archived")]
        page1 = self.operations.list_fronts(FrontQuery(limit=1))
        page2 = self.operations.list_fronts(FrontQuery(limit=1, offset=1))
        self.assertEqual(page1.total, 3)
        self.assertNotEqual(page1.items[0].id, page2.items[0].id)
        all_ids = [item.id for item in self.operations.list_fronts(FrontQuery()).items]
        self.assertEqual(all_ids, sorted(front.id for front in fronts))  # Same creation instant, UUID tiebreaker.
        self.assertEqual(self.operations.list_fronts(FrontQuery(limit=1, offset=100)).items, [])
        self.assertEqual(self.operations.list_fronts(FrontQuery(states=["standby", "archived"])).total, 2)
        self.assertEqual(self.operations.list_fronts(FrontQuery(search="am")).total, 3)
        self.create(name="Literal%_name")
        self.assertEqual(self.operations.list_fronts(FrontQuery(search="%_")).total, 1)
        page = self.operations.dashboard(DashboardQuery(start="2026-01-01", end="2026-01-02", limit=1, offset=1))
        self.assertEqual(page.total, 4)
        self.assertEqual(len(page.items), 1)

    def test_history_pagination_and_inclusive_interval(self):
        front = self.create()
        for day in ("2026-01-01", "2026-01-02", "2026-01-03"):
            self.mark(front, day)
        first = self.operations.history(HistoryQuery(start="2026-01-01", end="2026-01-03", limit=1))
        last = self.operations.history(HistoryQuery(start="2026-01-01", end="2026-01-03", limit=1, offset=2))
        self.assertEqual(first.total, 3)
        self.assertEqual(first.items[0].day, date(2026, 1, 1))
        self.assertEqual(last.items[0].day, date(2026, 1, 3))
        self.assertEqual(self.operations.history(HistoryQuery(
            start="2026-01-02", end="2026-01-02", front_id=front.id,
        )).total, 1)

    def race(self, calls):
        barrier = threading.Barrier(len(calls))
        identities = []
        lock = threading.Lock()
        operations = []
        for _ in calls:
            database = Database(self.path)
            self.addCleanup(database.dispose)
            @event.listens_for(database.engine, "connect")
            def synchronize(dbapi_connection, record):
                with lock:
                    identities.append(id(dbapi_connection))
                barrier.wait(timeout=5)
            operations.append(Operations(database, clock=lambda: NOW).with_account(self.account_id))
        with ThreadPoolExecutor(max_workers=len(calls)) as pool:
            futures = [pool.submit(call, operation) for call, operation in zip(calls, operations)]
            results = [future.result(timeout=10) for future in futures]
        self.assertEqual(len(set(identities)), len(calls), "Race must use genuinely separate connections")
        return results

    def test_simultaneous_repeated_creation_is_one_durable_front(self):
        key = uuid4()
        def call(operations):
            return operations.create_front(FrontCreate(name="Same"), key)
        results = self.race([call] * 4)
        self.assertTrue(all(result == results[0] for result in results))
        self.assertEqual(self.counts(), (1, 0, 1))

    def test_simultaneous_repeated_check_is_one_durable_check(self):
        front = self.create()
        key = uuid4()
        def call(operations):
            return operations.write_check(front.id, CheckWrite(day="today", marked=True), key)
        results = self.race([call] * 4)
        self.assertTrue(all(result == results[0] for result in results))
        self.assertEqual(self.counts(), (1, 1, 2))

    def test_simultaneous_independent_same_day_checks_remain_unique(self):
        front = self.create()
        def call(operations):
            return operations.write_check(front.id, CheckWrite(day="today", marked=True), uuid4())
        self.race([call] * 4)
        self.assertEqual(self.counts(), (1, 1, 5))

    def test_simultaneous_conflicting_key_has_one_winner(self):
        key = uuid4()
        def call(name):
            def perform(operations):
                try:
                    return operations.create_front(FrontCreate(name=name), key)
                except DomainError as error:
                    return error.status_code
            return perform
        results = self.race([call("A"), call("B")])
        self.assertEqual(sum(result == 409 for result in results), 1)
        self.assertEqual(self.counts(), (1, 0, 1))


if __name__ == "__main__":
    unittest.main()
