from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.database.base import get_db
from app.models.auth import User
from app.models.schemas import AuthRequest, MeResponse, RegisterResponse, TokenResponse
from app.services.auth_service import (
    ACCESS_TOKEN_TTL_SECONDS,
    AuthError,
    REFRESH_COOKIE_NAME,
    ROLE_ADMIN,
    ROLE_USER,
    TokenValidationError,
    authenticate_user,
    count_users,
    create_access_token,
    create_refresh_token,
    create_user,
    decode_token,
    ensure_refresh_token_is_active,
    get_cookie_secure,
    get_refresh_token_record,
    get_user_by_email,
    normalize_email,
    revoke_refresh_token_from_cookie,
    validate_email,
    validate_password,
)

router = APIRouter(prefix='/auth', tags=['auth'])


@router.post(
    '/register',
    response_model=RegisterResponse,
    status_code=201,
    summary='Register a user account',
    description=(
        'Creates a new user account with an email address and a bcrypt-hashed password. '
        'Passwords must be at least 10 characters long and contain uppercase, lowercase, numeric, '
        'and special characters. The very first account to register becomes an admin so the '
        'instance has an initial administrator; every subsequent account is a standard user. '
        'Registration does not issue JWTs.'
    ),
    response_description='The newly created user identifier.',
    responses={409: {'description': 'Email already registered.'}, 422: {'description': 'Password or email validation failed.'}},
)
def register(payload: AuthRequest, db: Session = Depends(get_db)) -> RegisterResponse:
    normalized_email = normalize_email(payload.email)
    if not validate_email(normalized_email):
        raise AuthError(status_code=422, error='Invalid email address')
    if not validate_password(payload.password):
        raise AuthError(status_code=422, error='Password does not meet complexity requirements')
    if get_user_by_email(db, normalized_email) is not None:
        raise AuthError(status_code=409, error='Email already registered')
    role = ROLE_ADMIN if count_users(db) == 0 else ROLE_USER
    user = create_user(db, normalized_email, payload.password, role=role)
    return RegisterResponse(id=user.id)


@router.post(
    '/login',
    response_model=TokenResponse,
    summary='Log in and issue JWTs',
    description=(
        'Authenticates a user by email and password. On success, returns a 15-minute bearer access token '
        'in the response body and sets the 7-day refresh token in an httpOnly SameSite=Strict cookie.'
    ),
    response_description='Bearer access token details. Refresh token is returned via cookie only.',
    responses={401: {'description': 'Invalid credentials.'}},
)
def login(payload: AuthRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> TokenResponse:
    user = authenticate_user(db, payload.email, payload.password)
    if user is None:
        raise AuthError(status_code=401, error='Invalid credentials')

    access_token = create_access_token(user)
    refresh_token = create_refresh_token(db, user)
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=get_cookie_secure(request),
        samesite='strict',
        max_age=7 * 24 * 60 * 60,
        path='/',
    )
    return TokenResponse(access_token=access_token, token_type='Bearer', expires_in=ACCESS_TOKEN_TTL_SECONDS)


@router.post(
    '/refresh',
    response_model=TokenResponse,
    summary='Refresh an access token',
    description='Reads the refresh token cookie, validates it, and returns a fresh 15-minute bearer access token.',
    response_description='Fresh bearer access token details.',
    responses={401: {'description': 'Refresh token is missing, expired, or invalid.'}},
)
def refresh(request: Request, db: Session = Depends(get_db)) -> TokenResponse | JSONResponse:
    refresh_cookie = request.cookies.get(REFRESH_COOKIE_NAME)
    if not refresh_cookie:
        error_response = JSONResponse(status_code=401, content={'error': 'token_expired'})
        error_response.delete_cookie(key=REFRESH_COOKIE_NAME, path='/', secure=get_cookie_secure(request), httponly=True, samesite='strict')
        return error_response

    try:
        payload = decode_token(refresh_cookie, expected_type='refresh')
        token_id = payload.get('jti')
        if not token_id:
            raise TokenValidationError('invalid_token')
        refresh_token = ensure_refresh_token_is_active(get_refresh_token_record(db, token_id))
    except TokenValidationError as exc:
        error_response = JSONResponse(status_code=401, content={'error': exc.error if exc.error != 'invalid_token' else 'token_expired'})
        error_response.delete_cookie(key=REFRESH_COOKIE_NAME, path='/', secure=get_cookie_secure(request), httponly=True, samesite='strict')
        return error_response

    user = refresh_token.user
    access_token = create_access_token(user)
    return TokenResponse(access_token=access_token, token_type='Bearer', expires_in=ACCESS_TOKEN_TTL_SECONDS)


@router.post(
    '/logout',
    status_code=204,
    summary='Log out the current user',
    description='Revokes the current refresh token if present, clears the cookie, and ends the authenticated browser session.',
    response_description='No content.',
)
def logout(request: Request, db: Session = Depends(get_db)) -> Response:
    refresh_cookie = request.cookies.get(REFRESH_COOKIE_NAME)
    revoke_refresh_token_from_cookie(db, refresh_cookie)
    response = Response(status_code=204)
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path='/', secure=get_cookie_secure(request), httponly=True, samesite='strict')
    return response


@router.get(
    '/me',
    response_model=MeResponse,
    summary='Get the current user',
    description=(
        'Returns the authenticated user identified by the bearer access token, including their role. '
        'Used by clients to decide which role-gated features and pages to show.'
    ),
    response_description='Identity and role of the authenticated user.',
    responses={401: {'description': 'Authentication required or token invalid.'}},
)
def me(current_user: User = Depends(get_current_user)) -> MeResponse:
    return MeResponse.model_validate(current_user)
