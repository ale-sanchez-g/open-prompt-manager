"""
Symmetric encryption helpers for storing provider secrets (e.g. API keys).

Wraps Fernet (from the `cryptography` package) using a key read from the
OPM_ENCRYPTION_KEY env var. The key is read lazily — at the point encrypt()
or decrypt() is actually called — so deployments that never store a secret
(e.g. Ollama-only setups) don't need OPM_ENCRYPTION_KEY set and don't crash
at import time.
"""
import os

from cryptography.fernet import Fernet, InvalidToken


def _get_fernet() -> Fernet:
    key = os.getenv('OPM_ENCRYPTION_KEY')
    if not key:
        raise RuntimeError(
            'OPM_ENCRYPTION_KEY is not set. Set it to a valid Fernet key '
            '(generate one with `Fernet.generate_key()`) before storing or '
            'reading encrypted provider secrets.'
        )
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except (ValueError, TypeError) as exc:
        raise RuntimeError('OPM_ENCRYPTION_KEY is not a valid Fernet key.') from exc


def encrypt(plaintext: str) -> str:
    """
    Encrypt a plaintext string.

    Args:
        plaintext: Secret value to encrypt.

    Returns:
        Fernet token as a string, safe to store in the database.

    Raises:
        RuntimeError: If OPM_ENCRYPTION_KEY is unset or invalid.
    """
    fernet = _get_fernet()
    return fernet.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    """
    Decrypt a value previously produced by encrypt().

    Args:
        ciphertext: Fernet token as returned by encrypt().

    Returns:
        The original plaintext string.

    Raises:
        RuntimeError: If OPM_ENCRYPTION_KEY is unset, invalid, or the token
            cannot be decrypted with it.
    """
    fernet = _get_fernet()
    try:
        return fernet.decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise RuntimeError('Failed to decrypt value: invalid token or wrong encryption key.') from exc


def mask_key(plaintext: str) -> str:
    """
    Mask a secret for display in API responses (e.g. 'sk-abc123xyz' -> 'sk-***xyz').

    Args:
        plaintext: The unmasked secret.

    Returns:
        A masked string showing the first 3 and last 3 characters, with the
        middle replaced by '***'. Short values (<=6 chars) are fully masked.
    """
    if not plaintext:
        return ''
    if len(plaintext) <= 6:
        return '*' * len(plaintext)
    return f'{plaintext[:3]}***{plaintext[-3:]}'
