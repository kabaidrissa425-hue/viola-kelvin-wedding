// Wipes and reseeds the guest list with 250 random placeholder names.
// Run with: npm run seed
const db = require('./db');
const { randomFullName } = require('./names');
const { generatePublicToken } = require('./ids');

const GUEST_COUNT = 250;

function seedGuests() {
  db.exec('DELETE FROM guests');

  const insert = db.prepare(`
    INSERT INTO guests (public_token, name, search_name)
    VALUES (?, ?, ?)
  `);

  const usedNames = new Set();
  const usedTokens = new Set();

  db.exec('BEGIN');
  try {
    for (let i = 0; i < GUEST_COUNT; i++) {
      const name = randomFullName(usedNames);
      let token = generatePublicToken();
      while (usedTokens.has(token)) token = generatePublicToken();
      usedTokens.add(token);
      insert.run(token, name, name.toLowerCase());
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  console.log(`Seeded ${GUEST_COUNT} placeholder guests into data/wedding.db`);
}

module.exports = { seedGuests };

if (require.main === module) {
  seedGuests();
}
