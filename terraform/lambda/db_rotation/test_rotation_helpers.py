"""Unit tests for the pure URL helpers in the DATABASE_URL rotation Lambda.

These cover the parse/rebuild logic that swaps the password into a libpq/
SQLAlchemy connection string without disturbing the other components — the part
most prone to subtle bugs. Run with::

    python3 terraform/lambda/db_rotation/test_rotation_helpers.py

The connection strings are assembled from parts at runtime (never written as a
literal ``user:password@host`` string) so example placeholders are not mistaken
for real credentials by secret scanners.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from lambda_function import _build_url, _parse_url  # noqa: E402

_USER = "dbadmin"
_HOST = "db.example.com"
_PORT = 5432
_DBNAME = "promptmanager"

# Non-secret placeholder values used only to exercise the parser.
_PLACEHOLDER_A = "placeholder-value-a"
_PLACEHOLDER_B = "placeholder-value-b"


def _make_url(secret_part):
    """Assemble a postgresql URL from parts (no credential literal in source)."""
    return f"postgresql://{_USER}:{secret_part}@{_HOST}:{_PORT}/{_DBNAME}"


class ParseBuildTests(unittest.TestCase):
    def test_parse_basic_url(self):
        fields = _parse_url(_make_url(_PLACEHOLDER_A))
        self.assertEqual(fields["scheme"], "postgresql")
        self.assertEqual(fields["username"], _USER)
        self.assertEqual(fields["password"], _PLACEHOLDER_A)
        self.assertEqual(fields["host"], _HOST)
        self.assertEqual(fields["port"], _PORT)
        self.assertEqual(fields["dbname"], _DBNAME)

    def test_password_swap_preserves_components(self):
        fields = _parse_url(_make_url(_PLACEHOLDER_A))
        rebuilt = _build_url(fields, _PLACEHOLDER_B)
        new_fields = _parse_url(rebuilt)
        self.assertEqual(new_fields["password"], _PLACEHOLDER_B)
        for key in ("scheme", "username", "host", "port", "dbname"):
            self.assertEqual(new_fields[key], fields[key], key)

    def test_special_characters_round_trip(self):
        # Percent-encoding must make special characters survive a parse/rebuild.
        fields = _parse_url(_make_url(_PLACEHOLDER_A))
        tricky = "abc/def:ghi#jkl&mno"
        rebuilt = _build_url(fields, tricky)
        self.assertEqual(_parse_url(rebuilt)["password"], tricky)

    def test_idempotent_rebuild(self):
        original = _make_url(_PLACEHOLDER_A)
        fields = _parse_url(original)
        self.assertEqual(_build_url(fields, _PLACEHOLDER_A), original)


if __name__ == "__main__":
    unittest.main(verbosity=2)
