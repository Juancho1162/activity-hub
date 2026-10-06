"""Only fixed, non-sensitive messages cross the HTTP boundary."""


class DomainError(Exception):
    def __init__(self, status_code: int, detail: str, *, headers=None):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.headers = headers


class StorageUnavailable(DomainError):
    def __init__(self):
        super().__init__(503, "Service unavailable")
