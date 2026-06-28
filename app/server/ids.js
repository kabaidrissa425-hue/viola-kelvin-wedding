// Unambiguous alphabet (no 0/O/1/I) so codes are easy to read off a phone at the door.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomString(length) {
  let s = '';
  for (let i = 0; i < length; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return s;
}

// Public token: identifies a guest to the browser (in place of the raw
// integer id) so the guest list can't be enumerated by walking ids.
function generatePublicToken() {
  return randomString(12);
}

// Invitation code: short, printable, shown on the ticket and encoded in the QR.
function generateInviteCode() {
  return 'KV-' + randomString(6);
}

module.exports = { randomString, generatePublicToken, generateInviteCode };
