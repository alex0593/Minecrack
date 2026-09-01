import pytest
from fastapi import HTTPException

from app.main import _parse_range


def test_full_and_partial_ranges():
    assert _parse_range(None, 100) == (0, 99, False)
    assert _parse_range("bytes=10-19", 100) == (10, 19, True)
    assert _parse_range("bytes=90-", 100) == (90, 99, True)
    assert _parse_range("bytes=-10", 100) == (90, 99, True)


@pytest.mark.parametrize("value", ["items=0-1", "bytes=100-101", "bytes=20-10", "bytes=0-1,3-4"])
def test_invalid_ranges_return_416(value):
    with pytest.raises(HTTPException) as error:
        _parse_range(value, 100)
    assert error.value.status_code == 416

