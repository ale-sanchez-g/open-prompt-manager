from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import require_admin
from app.database.base import get_db
from app.models.auth import User
from app.models.schemas import UserCreate, UserResponse, UserUpdate
from app.services.auth_service import (
    AuthError,
    create_user,
    delete_user,
    get_user_by_email,
    get_user_by_id,
    list_users,
    normalize_email,
    update_user_password,
    update_user_role,
    validate_email,
    validate_password,
    validate_role,
)

router = APIRouter(prefix='/api/admin', tags=['admin'])


@router.get(
    '/users',
    response_model=list[UserResponse],
    summary='List all users',
    description='Returns every registered user with their role. Requires an admin access token.',
    response_description='Array of user accounts ordered by creation time.',
    responses={401: {'description': 'Authentication required.'}, 403: {'description': 'Admin role required.'}},
)
def admin_list_users(_admin: Annotated[User, Depends(require_admin)], db: Annotated[Session, Depends(get_db)]) -> list[User]:
    return list_users(db)


@router.post(
    '/users',
    response_model=UserResponse,
    status_code=201,
    summary='Create a user',
    description=(
        'Creates a new user account and assigns the requested role. '
        'Passwords must meet the same complexity rules as self-registration. Requires an admin access token.'
    ),
    response_description='The newly created user account.',
    responses={
        401: {'description': 'Authentication required.'},
        403: {'description': 'Admin role required.'},
        409: {'description': 'Email already registered.'},
        422: {'description': 'Email, password, or role validation failed.'},
    },
)
def admin_create_user(
    payload: UserCreate,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    normalized_email = normalize_email(payload.email)
    if not validate_email(normalized_email):
        raise AuthError(status_code=422, error='Invalid email address')
    if not validate_role(payload.role):
        raise AuthError(status_code=422, error='Invalid role')
    if not validate_password(payload.password):
        raise AuthError(status_code=422, error='Password does not meet complexity requirements')
    if get_user_by_email(db, normalized_email) is not None:
        raise AuthError(status_code=409, error='Email already registered')
    return create_user(db, normalized_email, payload.password, role=payload.role)


@router.patch(
    '/users/{user_id}',
    response_model=UserResponse,
    summary='Update a user',
    description=(
        "Updates a user's role and/or password. Admins cannot remove their own admin role, "
        'which prevents the system from being left without an administrator. Requires an admin access token.'
    ),
    response_description='The updated user account.',
    responses={
        400: {'description': 'Admins cannot demote themselves.'},
        401: {'description': 'Authentication required.'},
        403: {'description': 'Admin role required.'},
        404: {'description': 'User not found.'},
        422: {'description': 'Password or role validation failed.'},
    },
)
def admin_update_user(
    user_id: str,
    payload: UserUpdate,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    user = get_user_by_id(db, user_id)
    if user is None:
        raise AuthError(status_code=404, error='User not found')

    if payload.role is not None:
        if not validate_role(payload.role):
            raise AuthError(status_code=422, error='Invalid role')
        if user.id == admin.id and payload.role != 'admin':
            raise AuthError(status_code=400, error='Admins cannot remove their own admin role')
        update_user_role(db, user, payload.role)

    if payload.password is not None:
        if not validate_password(payload.password):
            raise AuthError(status_code=422, error='Password does not meet complexity requirements')
        update_user_password(db, user, payload.password)

    return user


@router.delete(
    '/users/{user_id}',
    status_code=204,
    summary='Delete a user',
    description=(
        'Permanently deletes a user account and revokes their refresh tokens. '
        'Admins cannot delete their own account. Requires an admin access token.'
    ),
    responses={
        204: {'description': 'User deleted.'},
        400: {'description': 'Admins cannot delete their own account.'},
        401: {'description': 'Authentication required.'},
        403: {'description': 'Admin role required.'},
        404: {'description': 'User not found.'},
    },
)
def admin_delete_user(
    user_id: str,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    user = get_user_by_id(db, user_id)
    if user is None:
        raise AuthError(status_code=404, error='User not found')
    if user.id == admin.id:
        raise AuthError(status_code=400, error='Admins cannot delete their own account')
    delete_user(db, user)
