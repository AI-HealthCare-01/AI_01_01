from __future__ import annotations

from typing import Any


def build_feature_row(source: dict[str, Any]) -> dict[str, Any]:
    """
    Minimal feature row builder placeholder.
    Domain ETL layers can pass their aggregated row into this function
    so infer provider contracts remain the single source of truth.
    """
    if not isinstance(source, dict):
        return {}
    return dict(source)
