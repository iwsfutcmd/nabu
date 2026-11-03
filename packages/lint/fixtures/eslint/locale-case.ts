// Fixture: case mapping needs a locale (Turkish İ/ı, Lithuanian, Greek final sigma).
declare const answer: string;
declare const lang: string;
declare const custom: { toLowerCase(): string };

export const bad = [
  answer.toLowerCase(), // expect: nabu/locale-case
  answer.toUpperCase(), // expect: nabu/locale-case
  answer.toLocaleLowerCase(), // expect: nabu/locale-case
  answer.toLocaleUpperCase(undefined), // expect: nabu/locale-case
];

export const good = [answer.toLocaleLowerCase(lang), answer.toLocaleUpperCase("tr"), custom.toLowerCase()];
