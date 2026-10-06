"""HTTP and shared-operation contracts; bounds are technical, not activity rules."""
import re
from datetime import date, datetime
from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    AwareDatetime, BaseModel, BeforeValidator, ConfigDict, Field, HttpUrl,
    StrictBool, StrictStr, StringConstraints, TypeAdapter, ValidationError,
    field_validator, model_validator,
)

MAX_WINDOW_DAYS = 366


class FrontState(StrEnum):
    OPEN = "open"
    STANDBY = "standby"
    ARCHIVED = "archived"


def _trim_name(value):
    if isinstance(value, str):
        if "\x00" in value:
            raise ValueError("Names cannot contain NUL characters")
        return value.strip()
    return value


Name = Annotated[
    str, StringConstraints(strict=True, min_length=1, max_length=200),
    BeforeValidator(_trim_name),
]
_reference_adapter = TypeAdapter(Annotated[HttpUrl, Field(max_length=2048)])


def _reference(value):
    if not isinstance(value, str):
        raise ValueError("Reference must be an HTTP(S) URL")
    try:
        return str(_reference_adapter.validate_python(value))
    except ValidationError:
        raise ValueError("Reference must be an HTTP(S) URL of at most 2048 characters") from None


Reference = Annotated[str, BeforeValidator(_reference)]


def _iso_date(value):
    if type(value) is date:
        return value  # Typed internal callers can supply calendar dates, never datetimes.
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
        raise ValueError("Use an ISO YYYY-MM-DD calendar date")
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValueError("Use a valid ISO YYYY-MM-DD calendar date") from None


ISODate = Annotated[date, BeforeValidator(_iso_date)]


class InputContract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AccessCodeLogin(InputContract):
    code: StrictStr = Field(max_length=128, description="Generated private access code; never logged or stored raw.")


class SignupRequest(InputContract):
    pass


class SignupOut(BaseModel):
    account_id: UUID
    code: str


class SessionOut(BaseModel):
    authenticated: StrictBool
    account_id: UUID
    csrf_token: str
    expires_at: AwareDatetime


class FrontCreate(InputContract):
    name: Name = Field(description="Trimmed, nonblank name, 1–200 characters, no NUL. Names are not unique.")
    reference: Reference | None = Field(default=None, description="Optional HTTP(S) URL, at most 2048 characters; never fetched.")
    state: FrontState = FrontState.OPEN


class FrontPatch(InputContract):
    name: Name | None = None
    reference: Reference | None = Field(default=None, description="Explicit null clears the link; omission preserves it.")
    state: FrontState | None = None

    @model_validator(mode="after")
    def validate_patch(self):
        if not self.model_fields_set:
            raise ValueError("Specify at least one field")
        if any(field in self.model_fields_set and getattr(self, field) is None for field in ("name", "state")):
            raise ValueError("Name and state cannot be null")
        return self


class CheckWrite(InputContract):
    day: StrictStr = Field(description="Exact YYYY-MM-DD, today, or yesterday. Aliases use Europe/Madrid; no future writes.")
    marked: StrictBool = Field(description="Desired value, not a toggle. False removes the row.")

    @field_validator("day")
    @classmethod
    def validate_day(cls, value):
        if value not in ("today", "yesterday"):
            _iso_date(value)
        return value


class FrontQuery(InputContract):
    states: list[FrontState] = Field(default_factory=list, max_length=3, description="Repeated state filter; omission includes all states.")
    search: Name | None = Field(default=None, description="Literal substring; SQLite LIKE case behavior (ASCII case-insensitive).")
    limit: int = Field(default=50, ge=1, le=100)
    offset: int = Field(default=0, ge=0, le=100_000)


class DateWindow(InputContract):
    start: ISODate = Field(description="Inclusive ISO date; intervals are limited to 366 calendar days.")
    end: ISODate = Field(description="Inclusive ISO date, not before start.")

    @model_validator(mode="after")
    def validate_window(self):
        if self.end < self.start:
            raise ValueError("End cannot be before start")
        if (self.end - self.start).days + 1 > MAX_WINDOW_DAYS:
            raise ValueError("Interval cannot exceed 366 days")
        return self


class HistoryQuery(DateWindow):
    front_id: UUID | None = Field(default=None, description="An unknown front ID returns 404, even for an empty interval.")
    limit: int = Field(default=100, ge=1, le=1000)
    offset: int = Field(default=0, ge=0, le=100_000)


class DashboardQuery(FrontQuery, DateWindow):
    front_id: UUID | None = Field(default=None, description="An unknown front ID returns 404, regardless of other filters.")
    order: Literal["created", "activity_desc"] = Field(
        default="created", description="Order before pagination: creation/UUID ascending, or selected-interval count descending with creation/UUID ties.",
    )


class FrontOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    reference: str | None
    state: FrontState
    created_at: AwareDatetime
    updated_at: AwareDatetime


class FrontPage(BaseModel):
    items: list[FrontOut]
    total: int
    limit: int
    offset: int


class CheckOut(BaseModel):
    front_id: UUID
    day: date
    marked: bool


class HistoryPage(BaseModel):
    items: list[CheckOut]
    total: int
    limit: int
    offset: int
    start: date
    end: date
    front_id: UUID | None


class DashboardItem(BaseModel):
    front: FrontOut
    marked_dates: list[date]
    last_registered_day: date | None = Field(description="Global last marked day, not limited to the selected interval.")
    count: int = Field(description="Number of marked days within the inclusive selected interval.")


class DashboardPage(BaseModel):
    items: list[DashboardItem]
    total: int
    limit: int
    offset: int
    start: date
    end: date
