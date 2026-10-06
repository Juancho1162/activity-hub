"""Shared registration rules. All mutations commit atomically with their replay log."""
import json
from contextlib import contextmanager
from copy import copy
from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import func, select

from activity_hub.contracts import (
    CheckOut, CheckWrite, DashboardItem, DashboardPage, DashboardQuery,
    FrontCreate, FrontOut, FrontPage, FrontPatch, FrontQuery, HistoryPage, HistoryQuery,
)
from activity_hub.database import Database
from activity_hub.errors import DomainError
from activity_hub.models import Account, ActivityCheck, Front, IdempotencyRequest

MADRID = ZoneInfo("Europe/Madrid")


class Operations:
    def __init__(self, database: Database, clock=None, *, authorize=None):
        self.database = database
        self.clock = clock if clock is not None else lambda: datetime.now(UTC)
        self._authorize = authorize
        self._account_id = None

    def with_account(self, account_id, authorize=None):
        # Per-request copy, preserving test instrumentation/subclasses. Never
        # mutate the shared operations instance or keep a global permission flag.
        operations = copy(self)
        operations._account_id = account_id
        operations._authorize = authorize
        return operations

    @contextmanager
    def _transaction(self, *, write=False):
        if not isinstance(self._account_id, UUID):
            raise DomainError(401, "Authentication required")
        with self.database.transaction(write=write) as session:
            if self._authorize is not None:
                # Same SQLite snapshot/BEGIN IMMEDIATE as the operation, BEFORE
                # any lookup or replay. Revocation cannot commit between these.
                self._authorize(session)
            if session.get(Account, self._account_id) is None:
                raise DomainError(401, "Authentication required")
            yield session

    def _now(self):
        now = self.clock()
        if now.tzinfo is None or now.utcoffset() is None:
            raise ValueError("The clock must provide an aware datetime")
        return now.astimezone(UTC)

    def _front(self, session, front_id):
        front = session.scalar(select(Front).where(Front.id == front_id, Front.account_id == self._account_id))
        if front is None:
            raise DomainError(404, "Front not found")
        return front

    @staticmethod
    def _payload(data):
        return json.dumps(data.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))

    def _replay(self, session, request_id, operation, target, payload, response_type):
        previous = session.get(IdempotencyRequest, (self._account_id, request_id))
        if previous is None:
            return None
        if (previous.operation, previous.target, previous.payload) != (operation, target, payload):
            raise DomainError(409, "Idempotency key already used for a different request")
        # Replays return the original result, never reapply a mutation over later edits.
        return response_type.model_validate_json(previous.response)

    def _remember(self, session, request_id, operation, target, payload, response, now):
        session.add(IdempotencyRequest(
            account_id=self._account_id, key=request_id, operation=operation, target=target, payload=payload,
            response=response.model_dump_json(), created_at=now,
        ))

    def create_front(self, data: FrontCreate, request_id: UUID) -> FrontOut:
        payload = self._payload(data)
        with self._transaction(write=True) as session:
            replay = self._replay(session, request_id, "create_front", None, payload, FrontOut)
            if replay is not None:
                return replay
            now = self._now()
            front = Front(id=uuid4(), account_id=self._account_id, **data.model_dump(), created_at=now, updated_at=now)
            session.add(front)
            session.flush()
            result = FrontOut.model_validate(front)
            self._remember(session, request_id, "create_front", None, payload, result, now)
            return result

    def get_front(self, front_id: UUID) -> FrontOut:
        with self._transaction() as session:
            return FrontOut.model_validate(self._front(session, front_id))

    def patch_front(self, front_id: UUID, data: FrontPatch) -> FrontOut:
        with self._transaction(write=True) as session:
            front = self._front(session, front_id)
            for field, value in data.model_dump(exclude_unset=True).items():
                setattr(front, field, value)
            front.updated_at = self._now()
            session.flush()
            return FrontOut.model_validate(front)

    def write_check(self, front_id: UUID, data: CheckWrite, request_id: UUID) -> CheckOut:
        payload = self._payload(data)
        with self._transaction(write=True) as session:
            self._front(session, front_id)  # Foreign IDs are 404 even on retries/key conflicts.
            replay = self._replay(session, request_id, "write_check", front_id, payload, CheckOut)
            if replay is not None:
                return replay
            now = self._now()  # Resolve once, after acquiring the write transaction.
            today = now.astimezone(MADRID).date()
            if data.day == "today":
                day = today
            elif data.day == "yesterday":
                day = today - timedelta(days=1)
            else:
                day = date.fromisoformat(data.day)
            if day > today:
                raise DomainError(422, "Activity cannot be recorded for a future day")
            check = session.get(ActivityCheck, (front_id, day))
            if data.marked and check is None:
                session.add(ActivityCheck(front_id=front_id, day=day))
            elif not data.marked and check is not None:
                session.delete(check)
            session.flush()
            result = CheckOut(front_id=front_id, day=day, marked=data.marked)
            self._remember(session, request_id, "write_check", front_id, payload, result, now)
            return result

    def _front_filters(self, query):
        filters = [Front.account_id == self._account_id]
        if query.states:
            filters.append(Front.state.in_(query.states))
        if query.search is not None:
            filters.append(Front.name.contains(query.search, autoescape=True))
        return filters

    @staticmethod
    def _front_page(session, query, filters, *, order_by=()):
        total = session.scalar(select(func.count()).select_from(Front).where(*filters))
        rows = session.scalars(
            select(Front).where(*filters).order_by(*order_by, Front.created_at, Front.id)
            .offset(query.offset).limit(query.limit)
        ).all()
        return total, rows

    def list_fronts(self, query: FrontQuery) -> FrontPage:
        with self._transaction() as session:
            total, rows = self._front_page(session, query, self._front_filters(query))
            return FrontPage(items=[FrontOut.model_validate(row) for row in rows], total=total,
                             limit=query.limit, offset=query.offset)

    def history(self, query: HistoryQuery) -> HistoryPage:
        with self._transaction() as session:
            filters = [Front.account_id == self._account_id, ActivityCheck.day >= query.start, ActivityCheck.day <= query.end]
            if query.front_id is not None:
                self._front(session, query.front_id)
                filters.append(ActivityCheck.front_id == query.front_id)
            total = session.scalar(select(func.count()).select_from(ActivityCheck).join(Front).where(*filters))
            rows = session.scalars(
                select(ActivityCheck).join(Front).where(*filters).order_by(ActivityCheck.day, ActivityCheck.front_id)
                .offset(query.offset).limit(query.limit)
            ).all()
            return HistoryPage(
                items=[CheckOut(front_id=row.front_id, day=row.day, marked=True) for row in rows],
                total=total, limit=query.limit, offset=query.offset, start=query.start, end=query.end,
                front_id=query.front_id,
            )

    def dashboard(self, query: DashboardQuery) -> DashboardPage:
        with self._transaction() as session:
            filters = self._front_filters(query)
            if query.front_id is not None:
                self._front(session, query.front_id)
                filters.append(Front.id == query.front_id)
            order_by = ()
            if query.order == "activity_desc":
                # Correlate to each account-filtered front before applying pagination.
                range_count = (
                    select(func.count()).select_from(ActivityCheck)
                    .where(ActivityCheck.front_id == Front.id, ActivityCheck.day >= query.start,
                           ActivityCheck.day <= query.end)
                    .correlate(Front).scalar_subquery()
                )
                order_by = (range_count.desc(),)
            total, fronts = self._front_page(session, query, filters, order_by=order_by)
            ids = [front.id for front in fronts]
            latest = {}
            marked = {front_id: [] for front_id in ids}
            if ids:
                # Deliberately global, not filtered by the selected date interval.
                latest = dict(session.execute(
                    select(ActivityCheck.front_id, func.max(ActivityCheck.day)).join(Front)
                    .where(Front.account_id == self._account_id, ActivityCheck.front_id.in_(ids)).group_by(ActivityCheck.front_id)
                ).all())
                for front_id, day in session.execute(
                    select(ActivityCheck.front_id, ActivityCheck.day).join(Front)
                    .where(Front.account_id == self._account_id, ActivityCheck.front_id.in_(ids), ActivityCheck.day >= query.start,
                           ActivityCheck.day <= query.end).order_by(ActivityCheck.day)
                ):
                    marked[front_id].append(day)
            return DashboardPage(
                items=[DashboardItem(front=FrontOut.model_validate(front), marked_dates=marked[front.id],
                                     last_registered_day=latest.get(front.id), count=len(marked[front.id]))
                       for front in fronts],
                total=total, limit=query.limit, offset=query.offset, start=query.start, end=query.end,
            )
