from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.dependencies import require_admin
from app.audit import (
    EVENT_ADMIN_USER_CREATE,
    EVENT_ADMIN_USER_DELETE,
    EVENT_ADMIN_USER_LIST,
    EVENT_ADMIN_USER_ROLE_CHANGE,
    EVENT_ADMIN_USER_UNLOCK,
    EVENT_CREDENTIAL_CHANGE,
    audit_event,
)
from app.database.base import get_db
from app.models.auth import User
from app.models.schemas import UserCreate, UserResponse, UserUpdate
from app.services.auth_service import (
    AuthError,
    create_user,
    delete_user,
    get_user_by_email,
    get_user_by_id,
    is_login_locked_out,
    list_users,
    normalize_email,
    reset_login_attempts,
    update_user_password,
    update_user_role,
    validate_email,
    validate_password,
    validate_role,
)

router = APIRouter(prefix='/api/admin', tags=['admin'])

USER_NOT_FOUND_ERROR = 'User not found'


def _build_user_response(user: User) -> UserResponse:
    response = UserResponse.model_validate(user)
    response.is_locked = is_login_locked_out(user.email)
    return response


@router.get(
    '/users',
    summary='List all users',
    description='Returns every registered user with their role. Requires an admin access token.',
    response_description='Array of user accounts ordered by creation time.',
    responses={401: {'description': 'Authentication required.'}, 403: {'description': 'Admin role required.'}},
)
def admin_list_users(
    request: Request,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> list[UserResponse]:
    users = list_users(db)
    audit_event(EVENT_ADMIN_USER_LIST, request=request, actor=_admin.email, outcome='success', count=len(users))
    return [_build_user_response(u) for u in users]


@router.post(
    '/users',
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
    request: Request,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> UserResponse:
    normalized_email = normalize_email(payload.email)
    if not validate_email(normalized_email):
        audit_event(EVENT_ADMIN_USER_CREATE, request=request, actor=_admin.email, target=normalized_email, outcome='failure', reason='invalid_email')
        raise AuthError(status_code=422, error='Invalid email address')
    if not validate_role(payload.role):
        audit_event(EVENT_ADMIN_USER_CREATE, request=request, actor=_admin.email, target=normalized_email, outcome='failure', reason='invalid_role')
        raise AuthError(status_code=422, error='Invalid role')
    if not validate_password(payload.password):
        audit_event(EVENT_ADMIN_USER_CREATE, request=request, actor=_admin.email, target=normalized_email, outcome='failure', reason='weak_password')
        raise AuthError(status_code=422, error='Password does not meet complexity requirements')
    if get_user_by_email(db, normalized_email) is not None:
        audit_event(EVENT_ADMIN_USER_CREATE, request=request, actor=_admin.email, target=normalized_email, outcome='failure', reason='duplicate_email')
        raise AuthError(status_code=409, error='Email already registered')
    user = create_user(db, normalized_email, payload.password, role=payload.role)
    audit_event(EVENT_ADMIN_USER_CREATE, request=request, actor=_admin.email, target=user.id, outcome='success', role=payload.role)
    return _build_user_response(user)


@router.patch(
    '/users/{user_id}',
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
    request: Request,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> UserResponse:
    user = get_user_by_id(db, user_id)
    if user is None:
        raise AuthError(status_code=404, error=USER_NOT_FOUND_ERROR)

    if payload.role is not None:
        if not validate_role(payload.role):
            audit_event(EVENT_ADMIN_USER_ROLE_CHANGE, request=request, actor=admin.email, target=user.id, outcome='failure', reason='invalid_role')
            raise AuthError(status_code=422, error='Invalid role')
        if user.id == admin.id and payload.role != 'admin':
            audit_event(EVENT_ADMIN_USER_ROLE_CHANGE, request=request, actor=admin.email, target=user.id, outcome='blocked', reason='self_demotion')
            raise AuthError(status_code=400, error='Admins cannot remove their own admin role')
        previous_role = user.role
        update_user_role(db, user, payload.role)
        audit_event(
            EVENT_ADMIN_USER_ROLE_CHANGE,
            request=request,
            actor=admin.email,
            target=user.id,
            outcome='success',
            previous_role=previous_role,
            new_role=payload.role,
        )

    if payload.password is not None:
        if not validate_password(payload.password):
            audit_event(EVENT_CREDENTIAL_CHANGE, request=request, actor=admin.email, target=user.id, outcome='failure', reason='weak_password')
            raise AuthError(status_code=422, error='Password does not meet complexity requirements')
        update_user_password(db, user, payload.password)
        audit_event(EVENT_CREDENTIAL_CHANGE, request=request, actor=admin.email, target=user.id, outcome='success', changed_by='admin')

    return _build_user_response(user)


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
    request: Request,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    user = get_user_by_id(db, user_id)
    if user is None:
        audit_event(EVENT_ADMIN_USER_DELETE, request=request, actor=admin.email, target=user_id, outcome='failure', reason='not_found')
        raise AuthError(status_code=404, error=USER_NOT_FOUND_ERROR)
    if user.id == admin.id:
        audit_event(EVENT_ADMIN_USER_DELETE, request=request, actor=admin.email, target=user.id, outcome='blocked', reason='self_delete')
        raise AuthError(status_code=400, error='Admins cannot delete their own account')
    target_email = user.email
    delete_user(db, user)
    audit_event(EVENT_ADMIN_USER_DELETE, request=request, actor=admin.email, target=user_id, outcome='success', target_email=target_email)


@router.post(
    '/users/{user_id}/unlock',
    summary="Clear a user's login lockout",
    description=(
        'Clears the temporary login lockout applied after repeated failed password attempts '
        '(see the credential-stuffing defense in `/auth/login`), letting the user try again '
        'immediately without waiting out the lockout window. Does not change the password or '
        'role, and has no effect if the account is not currently locked out. Requires an admin '
        'access token.'
    ),
    response_description='The user account, with `is_locked` now false.',
    responses={
        401: {'description': 'Authentication required.'},
        403: {'description': 'Admin role required.'},
        404: {'description': 'User not found.'},
    },
)
def admin_unlock_user(
    user_id: str,
    request: Request,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> UserResponse:
    user = get_user_by_id(db, user_id)
    if user is None:
        audit_event(EVENT_ADMIN_USER_UNLOCK, request=request, actor=admin.email, target=user_id, outcome='failure', reason='not_found')
        raise AuthError(status_code=404, error=USER_NOT_FOUND_ERROR)
    was_locked_out = is_login_locked_out(user.email)
    reset_login_attempts(user.email)
    audit_event(
        EVENT_ADMIN_USER_UNLOCK,
        request=request,
        actor=admin.email,
        target=user.id,
        outcome='success',
        target_email=user.email,
        was_locked_out=was_locked_out,
    )
    return _build_user_response(user)
