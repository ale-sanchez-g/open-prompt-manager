const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{10,}$/;

export const passwordRequirements =
  'Password must be at least 10 characters and include uppercase, lowercase, a number, and a special character.';

export function validateEmail(email) {
  return emailPattern.test(email.trim());
}

export function validatePassword(password) {
  return passwordPattern.test(password);
}
