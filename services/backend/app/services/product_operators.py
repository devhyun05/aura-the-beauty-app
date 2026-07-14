"""Database-backed RBAC for privileged product recommendation operations."""

from __future__ import annotations

from typing import Any, Iterable
from uuid import UUID

from app.core.errors import AppError


CATALOG_ADMIN = "catalog_admin"
SEASONAL_EDITOR = "seasonal_editor"
SEASONAL_REVIEWER = "seasonal_reviewer"
SEASONAL_PUBLISHER = "seasonal_publisher"
SEASONAL_OPERATOR = "seasonal_operator"

PRODUCT_OPERATOR_ROLES = frozenset(
  {
    CATALOG_ADMIN,
    SEASONAL_EDITOR,
    SEASONAL_REVIEWER,
    SEASONAL_PUBLISHER,
    SEASONAL_OPERATOR,
  }
)


async def require_product_operator(
  connection: Any,
  *,
  user_id: UUID,
  roles: Iterable[str],
  error_code: str,
  message: str,
) -> dict[str, Any]:
  required = sorted(set(roles))
  if not required or not set(required).issubset(PRODUCT_OPERATOR_ROLES):
    raise ValueError("A supported product operator role is required.")
  row = await connection.fetchrow(
    """select operator.user_id,operator.roles
      from product_recommendation_operators operator
      join users actor on actor.id=operator.user_id and actor.deleted_at is null
      where operator.user_id=$1 and operator.is_active=true
        and operator.roles && $2::text[]""",
    user_id,
    required,
  )
  if not row:
    raise AppError(403, error_code, message)
  return dict(row)
