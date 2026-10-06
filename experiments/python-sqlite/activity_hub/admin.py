"""Nonoperational compatibility stub: accounts are created only by web signup."""
import sys


def main(argv=None):
    # Deliberately no parser, credential arguments, database imports or access.
    print("Create accounts using web signup. Account codes are permanent; no reset or recovery exists.",
          file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
