import pytest
from cryptography.fernet import Fernet

from app.services.encryption import encrypt, decrypt, mask_key


TEST_KEY = Fernet.generate_key().decode()


@pytest.fixture(autouse=True)
def encryption_key(monkeypatch):
    monkeypatch.setenv('OPM_ENCRYPTION_KEY', TEST_KEY)


def test_encrypt_decrypt_round_trip():
    plaintext = 'sk-super-secret-api-key-123456'
    ciphertext = encrypt(plaintext)

    assert ciphertext != plaintext
    assert decrypt(ciphertext) == plaintext


def test_encrypt_produces_different_ciphertext_each_time():
    plaintext = 'sk-super-secret-api-key-123456'
    first_ciphertext = encrypt(plaintext)
    second_ciphertext = encrypt(plaintext)

    assert first_ciphertext != second_ciphertext


def test_mask_key_shape():
    assert mask_key('sk-abcdefgh123') == 'sk-***123'


def test_mask_key_short_value_fully_masked():
    masked = mask_key('abcdef')
    assert masked == '*' * len('abcdef')
    assert '*' * 6 == masked


def test_mask_key_empty_string():
    assert mask_key('') == ''


def test_encrypt_without_key_raises(monkeypatch):
    monkeypatch.delenv('OPM_ENCRYPTION_KEY', raising=False)

    with pytest.raises(RuntimeError, match='OPM_ENCRYPTION_KEY'):
        encrypt('some-secret')


def test_decrypt_without_key_raises(monkeypatch):
    monkeypatch.delenv('OPM_ENCRYPTION_KEY', raising=False)

    with pytest.raises(RuntimeError, match='OPM_ENCRYPTION_KEY'):
        decrypt('irrelevant-ciphertext')


def test_decrypt_invalid_ciphertext_raises_clear_error():
    with pytest.raises(RuntimeError, match='decrypt'):
        decrypt('not-a-valid-fernet-token')
