const FIRST_NAMES = [
  'Amara', 'Liam', 'Sofia', 'Noah', 'Elena', 'Mateo', 'Ava', 'Lucas', 'Mia', 'Ethan',
  'Zara', 'Daniel', 'Layla', 'Gabriel', 'Nora', 'Samuel', 'Ines', 'Joseph', 'Camille', 'Victor',
  'Adaeze', 'Marcus', 'Priya', 'Andre', 'Yara', 'Felix', 'Chiara', 'Tariq', 'Naomi', 'Julien',
  'Bianca', 'Kwame', 'Rosalie', 'Hassan', 'Delphine', 'Omar', 'Florence', 'Theo', 'Imani', 'Xavier',
  'Selene', 'Dimitri', 'Aaliyah', 'Pierre', 'Wendy', 'Aurelio', 'Grace', 'Benedict', 'Thandiwe', 'Oscar',
];

const LAST_NAMES = [
  'Okafor', 'Brennan', 'Moreau', 'Whitfield', 'Adeyemi', 'Castillo', 'Lindqvist', 'Mensah', 'Dubois', 'Harrington',
  'Nakamura', 'Olawale', 'Ferreira', 'Kowalski', 'Asante', 'Beaumont', 'Osei', 'Marchetti', 'Abubakar', 'Sinclair',
  'Nwosu', 'Lefevre', 'Okonkwo', 'Caldwell', 'Boateng', 'Renaud', 'Adebayo', 'Holloway', 'Diallo', 'Pemberton',
  'Eze', 'Castellano', 'Mbeki', 'Whitaker', 'Sow', 'Bramwell', 'Anyanwu', 'Lachance', 'Opoku', 'Fontaine',
];

function randomFullName(used) {
  for (let attempts = 0; attempts < 50; attempts++) {
    const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    const name = `${first} ${last}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  // Pool exhausted (shouldn't happen at 250 of 2000 combos) — add a numeric suffix.
  const name = `${FIRST_NAMES[0]} ${LAST_NAMES[0]} ${used.size}`;
  used.add(name);
  return name;
}

module.exports = { randomFullName };
