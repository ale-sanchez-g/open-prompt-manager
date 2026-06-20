import jwt
import os

from app.services.auth_service import decode_token

STRONG_PASSWORD = 'Str0ng!Pass1'
OTHER_PASSWORD = 'An0ther!Pass2'


def _register(anon_client, email, password=STRONG_PASSWORD):
    response = anon_client.post('/auth/register', json={'email': email, 'password': password})
    assert response.status_code == 201
    return response.json()['id']


def _login(anon_client, email, password=STRONG_PASSWORD):
    response = anon_client.post('/auth/login', json={'email': email, 'password': password})
    assert response.status_code == 200
    return response.json()['access_token']


def _auth(token):
    return {'Authorization': f'Bearer {token}'}


def test_first_registered_user_becomes_admin(anon_client):
    _register(anon_client, 'first@opm.io')
    token = _login(anon_client, 'first@opm.io')

    payload = jwt.decode(token, os.environ['JWT_SECRET'], algorithms=['HS256'])
    assert payload['role'] == 'admin'

    me = anon_client.get('/auth/me', headers=_auth(token))
    assert me.status_code == 200
    assert me.json()['role'] == 'admin'


def test_second_registered_user_is_standard_user(anon_client):
    _register(anon_client, 'first@opm.io')
    _register(anon_client, 'second@opm.io')
    token = _login(anon_client, 'second@opm.io')

    me = anon_client.get('/auth/me', headers=_auth(token))
    assert me.status_code == 200
    assert me.json()['role'] == 'user'


def test_me_requires_authentication(anon_client):
    response = anon_client.get('/auth/me')
    assert response.status_code == 401
    assert response.json() == {'error': 'missing_token'}


def test_token_carries_role_claim(anon_client):
    _register(anon_client, 'first@opm.io')
    token = _login(anon_client, 'first@opm.io')
    payload = decode_token(token, expected_type='access')
    assert payload['role'] == 'admin'


def test_admin_can_list_users(anon_client):
    _register(anon_client, 'admin@opm.io')
    _register(anon_client, 'member@opm.io')
    token = _login(anon_client, 'admin@opm.io')

    response = anon_client.get('/api/admin/users', headers=_auth(token))
    assert response.status_code == 200
    users = response.json()
    assert len(users) == 2
    roles = {u['email']: u['role'] for u in users}
    assert roles['admin@opm.io'] == 'admin'
    assert roles['member@opm.io'] == 'user'


def test_non_admin_cannot_list_users(anon_client):
    _register(anon_client, 'admin@opm.io')
    _register(anon_client, 'member@opm.io')
    token = _login(anon_client, 'member@opm.io')

    response = anon_client.get('/api/admin/users', headers=_auth(token))
    assert response.status_code == 403
    assert response.json() == {'error': 'admin_required'}


def test_admin_endpoints_require_authentication(anon_client):
    response = anon_client.get('/api/admin/users')
    assert response.status_code == 401
    assert response.json() == {'error': 'missing_token'}


def test_admin_can_create_user_with_role(anon_client):
    _register(anon_client, 'admin@opm.io')
    token = _login(anon_client, 'admin@opm.io')

    response = anon_client.post(
        '/api/admin/users',
        headers=_auth(token),
        json={'email': 'new-admin@opm.io', 'password': OTHER_PASSWORD, 'role': 'admin'},
    )
    assert response.status_code == 201
    body = response.json()
    assert body['email'] == 'new-admin@opm.io'
    assert body['role'] == 'admin'
    assert body['id'].startswith('usr_')

    # The created admin can log in and reach admin endpoints.
    new_token = _login(anon_client, 'new-admin@opm.io', OTHER_PASSWORD)
    assert anon_client.get('/api/admin/users', headers=_auth(new_token)).status_code == 200


def test_admin_create_user_rejects_duplicate_email(anon_client):
    _register(anon_client, 'admin@opm.io')
    token = _login(anon_client, 'admin@opm.io')

    response = anon_client.post(
        '/api/admin/users',
        headers=_auth(token),
        json={'email': 'admin@opm.io', 'password': OTHER_PASSWORD, 'role': 'user'},
    )
    assert response.status_code == 409
    assert response.json() == {'error': 'Email already registered'}


def test_admin_create_user_rejects_invalid_role(anon_client):
    _register(anon_client, 'admin@opm.io')
    token = _login(anon_client, 'admin@opm.io')

    response = anon_client.post(
        '/api/admin/users',
        headers=_auth(token),
        json={'email': 'new@opm.io', 'password': OTHER_PASSWORD, 'role': 'superuser'},
    )
    assert response.status_code == 422
    assert response.json() == {'error': 'Invalid role'}


def test_admin_create_user_rejects_weak_password(anon_client):
    _register(anon_client, 'admin@opm.io')
    token = _login(anon_client, 'admin@opm.io')

    response = anon_client.post(
        '/api/admin/users',
        headers=_auth(token),
        json={'email': 'new@opm.io', 'password': 'weak', 'role': 'user'},
    )
    assert response.status_code == 422
    assert response.json() == {'error': 'Password does not meet complexity requirements'}


def test_admin_can_promote_user_to_admin(anon_client):
    _register(anon_client, 'admin@opm.io')
    member_id = _register(anon_client, 'member@opm.io')
    token = _login(anon_client, 'admin@opm.io')

    response = anon_client.patch(
        f'/api/admin/users/{member_id}',
        headers=_auth(token),
        json={'role': 'admin'},
    )
    assert response.status_code == 200
    assert response.json()['role'] == 'admin'

    member_token = _login(anon_client, 'member@opm.io')
    assert anon_client.get('/api/admin/users', headers=_auth(member_token)).status_code == 200


def test_admin_can_reset_user_password(anon_client):
    _register(anon_client, 'admin@opm.io')
    member_id = _register(anon_client, 'member@opm.io')
    token = _login(anon_client, 'admin@opm.io')

    response = anon_client.patch(
        f'/api/admin/users/{member_id}',
        headers=_auth(token),
        json={'password': OTHER_PASSWORD},
    )
    assert response.status_code == 200

    # Old password no longer works; new one does.
    assert anon_client.post('/auth/login', json={'email': 'member@opm.io', 'password': STRONG_PASSWORD}).status_code == 401
    assert anon_client.post('/auth/login', json={'email': 'member@opm.io', 'password': OTHER_PASSWORD}).status_code == 200


def test_admin_cannot_demote_self(anon_client):
    admin_id = _register(anon_client, 'admin@opm.io')
    token = _login(anon_client, 'admin@opm.io')

    response = anon_client.patch(
        f'/api/admin/users/{admin_id}',
        headers=_auth(token),
        json={'role': 'user'},
    )
    assert response.status_code == 400
    assert response.json() == {'error': 'Admins cannot remove their own admin role'}


def test_admin_update_missing_user_returns_404(anon_client):
    _register(anon_client, 'admin@opm.io')
    token = _login(anon_client, 'admin@opm.io')

    response = anon_client.patch(
        '/api/admin/users/usr_doesnotexist',
        headers=_auth(token),
        json={'role': 'user'},
    )
    assert response.status_code == 404
    assert response.json() == {'error': 'User not found'}


def test_admin_can_delete_user(anon_client):
    _register(anon_client, 'admin@opm.io')
    member_id = _register(anon_client, 'member@opm.io')
    token = _login(anon_client, 'admin@opm.io')

    response = anon_client.delete(f'/api/admin/users/{member_id}', headers=_auth(token))
    assert response.status_code == 204

    listing = anon_client.get('/api/admin/users', headers=_auth(token))
    assert all(u['id'] != member_id for u in listing.json())


def test_admin_cannot_delete_self(anon_client):
    admin_id = _register(anon_client, 'admin@opm.io')
    token = _login(anon_client, 'admin@opm.io')

    response = anon_client.delete(f'/api/admin/users/{admin_id}', headers=_auth(token))
    assert response.status_code == 400
    assert response.json() == {'error': 'Admins cannot delete their own account'}


def test_non_admin_cannot_create_user(anon_client):
    _register(anon_client, 'admin@opm.io')
    _register(anon_client, 'member@opm.io')
    token = _login(anon_client, 'member@opm.io')

    response = anon_client.post(
        '/api/admin/users',
        headers=_auth(token),
        json={'email': 'new@opm.io', 'password': OTHER_PASSWORD, 'role': 'user'},
    )
    assert response.status_code == 403
    assert response.json() == {'error': 'admin_required'}
