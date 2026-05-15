import os

import jwt

from app.models.auth import User
from app.services.auth_service import ACCESS_TOKEN_TTL_SECONDS, create_access_token

STRONG_PASSWORD = 'Str0ng!Pass1'


def test_register_success(anon_client):
    response = anon_client.post('/auth/register', json={'email': 'user@opm.io', 'password': STRONG_PASSWORD})

    assert response.status_code == 201
    assert response.json()['id'].startswith('usr_')


def test_register_duplicate_email_rejected(anon_client):
    anon_client.post('/auth/register', json={'email': 'user@opm.io', 'password': STRONG_PASSWORD})
    response = anon_client.post('/auth/register', json={'email': 'USER@opm.io', 'password': STRONG_PASSWORD})

    assert response.status_code == 409
    assert response.json() == {'error': 'Email already registered'}


def test_register_weak_password_rejected(anon_client):
    response = anon_client.post('/auth/register', json={'email': 'user@opm.io', 'password': '12345'})

    assert response.status_code == 422
    assert response.json() == {'error': 'Password does not meet complexity requirements'}


def test_login_success_returns_access_token_and_refresh_cookie(anon_client):
    anon_client.post('/auth/register', json={'email': 'user@opm.io', 'password': STRONG_PASSWORD})

    response = anon_client.post('/auth/login', json={'email': 'user@opm.io', 'password': STRONG_PASSWORD})

    assert response.status_code == 200
    data = response.json()
    assert data['token_type'] == 'Bearer'
    assert data['expires_in'] == ACCESS_TOKEN_TTL_SECONDS
    assert 'access_token' in data
    payload = jwt.decode(data['access_token'], os.environ['JWT_SECRET'], algorithms=['HS256'])
    assert payload['sub'].startswith('usr_')
    assert payload['email'] == 'user@opm.io'
    assert payload['exp'] > payload['iat']
    set_cookie = response.headers['set-cookie'].lower()
    assert 'refresh_token=' in set_cookie
    assert 'httponly' in set_cookie
    assert 'secure' in set_cookie
    assert 'samesite=strict' in set_cookie


def test_login_invalid_credentials_rejected(anon_client):
    anon_client.post('/auth/register', json={'email': 'user@opm.io', 'password': STRONG_PASSWORD})
    response = anon_client.post('/auth/login', json={'email': 'user@opm.io', 'password': 'Wrong!Pass1'})

    assert response.status_code == 401
    assert response.json() == {'error': 'Invalid credentials'}


def test_missing_token_is_rejected(anon_client):
    response = anon_client.get('/api/prompts/')

    assert response.status_code == 401
    assert response.json() == {'error': 'missing_token'}


def test_expired_token_is_rejected(anon_client):
    expired_token = create_access_token(User(id='usr_expired', email='expired@opm.io', password_hash='hash'), expires_in=-1)

    response = anon_client.get('/api/prompts/', headers={'Authorization': f'Bearer {expired_token}'})

    assert response.status_code == 401
    assert response.json() == {'error': 'token_expired'}


def test_invalid_token_is_rejected(anon_client):
    response = anon_client.get('/api/prompts/', headers={'Authorization': 'Bearer not-a-jwt'})

    assert response.status_code == 401
    assert response.json() == {'error': 'invalid_token'}


def test_valid_token_attaches_identity_to_protected_route(anon_client):
    anon_client.post('/auth/register', json={'email': 'user@opm.io', 'password': STRONG_PASSWORD})
    login_response = anon_client.post('/auth/login', json={'email': 'user@opm.io', 'password': STRONG_PASSWORD})
    access_token = login_response.json()['access_token']

    response = anon_client.post(
        '/api/prompts/',
        headers={'Authorization': f'Bearer {access_token}'},
        json={
            'name': 'Authenticated Prompt',
            'description': 'Created via auth middleware',
            'content': 'Hello {{name}}',
            'version': '1.0.0',
            'variables': [{'name': 'name', 'type': 'string', 'required': True}],
            'tag_ids': [],
            'agent_ids': [],
        },
    )

    assert response.status_code == 201
    assert response.json()['created_by'] == 'user@opm.io'


def test_refresh_returns_new_access_token(anon_client):
    anon_client.post('/auth/register', json={'email': 'user@opm.io', 'password': STRONG_PASSWORD})
    login_response = anon_client.post('/auth/login', json={'email': 'user@opm.io', 'password': STRONG_PASSWORD})

    response = anon_client.post('/auth/refresh')

    assert response.status_code == 200
    assert response.json()['access_token'] != login_response.json()['access_token']
    assert response.json()['expires_in'] == ACCESS_TOKEN_TTL_SECONDS


def test_refresh_without_cookie_clears_session_and_requires_relogin(anon_client):
    response = anon_client.post('/auth/refresh')

    assert response.status_code == 401
    assert response.json() == {'error': 'token_expired'}
    assert 'refresh_token=""' in response.headers['set-cookie']


def test_logout_revokes_refresh_token_and_clears_cookie(client):
    response = client.post('/auth/logout')

    assert response.status_code == 204
    assert 'refresh_token=""' in response.headers['set-cookie']

    refresh_response = client.post('/auth/refresh')
    assert refresh_response.status_code == 401
    assert refresh_response.json() == {'error': 'token_expired'}
