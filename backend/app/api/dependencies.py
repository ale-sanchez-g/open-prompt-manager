from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.database.base import get_db
from app.models.auth import User
from app.services.auth_service import (
    ROLE_ADMIN,
    AuthError,
    TokenValidationError,
    decode_token,
    get_user_by_id,
)


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Resolve the authenticated user from the bearer access token.

    Decodes the ``Authorization`` header directly so the dependency works on
    both ``/api`` routes (already guarded by the auth middleware) and ``/auth``
    routes (which the middleware lets through).
    """
    authorization_header = request.headers.get('Authorization')
    if authorization_header is None:
        raise AuthError(status_code=401, error='missing_token')

    scheme, _, token = authorization_header.partition(' ')
    if scheme.lower() != 'bearer' or not token:
        raise AuthError(status_code=401, error='invalid_token')

    try:
        payload = decode_token(token, expected_type='access')
    except TokenValidationError as exc:
        raise AuthError(status_code=401, error=exc.error) from exc

    user = get_user_by_id(db, payload['sub'])
    if user is None:
        raise AuthError(status_code=401, error='invalid_token')
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Allow the request only when the authenticated user has the admin role."""
    if user.role != ROLE_ADMIN:
        raise AuthError(status_code=403, error='admin_required')
    return user
