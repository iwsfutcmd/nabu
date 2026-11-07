/**
 * The three pages Google asks of an External OAuth app before it can be published (Google Auth
 * Platform → Branding: home page, privacy policy, terms), on the relay's own domain. They are
 * for Google and the owner, not part of the app: English only, no UI locale, no script.
 */

const REPOSITORY = "https://github.com/iwsfutcmd/nabu";

const page = (title: string, body: string): Response =>
  new Response(
    `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>body { font: 1rem/1.5 system-ui, sans-serif; max-inline-size: 40rem; margin-inline: auto; padding: 1rem; }</style>
</head>
<body>
<h1>${title}</h1>
${body}
<p><a href="/">Home</a> · <a href="/privacy">Privacy policy</a> · <a href="/terms">Terms</a> · <a href="${REPOSITORY}">Source</a></p>
</body>
</html>
`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } },
  );

const HOME = `<p>nabu references is a private relay. It lets its owner's course-authoring tools for
<a href="${REPOSITORY}">Nabu</a>, an open-source language-learning app, read and write one folder of
reference material (grammars, dictionaries and notes) in the owner's own Google Drive.</p>
<p>It has one user, its owner. Nobody else can sign in to it or use it.</p>`;

const PRIVACY = `<p>Last updated 2026-11-06.</p>
<h2>What it accesses</h2>
<p>With its owner's permission, given once when signing in with Google, the relay can use the
owner's Google Drive. Its code limits it to one folder the owner chose: it never searches the
Drive, never follows a shortcut out of the folder, and never deletes anything (removal goes to
Drive's trash).</p>
<h2>Who it serves</h2>
<p>Only its owner. Requests need a key that only the owner holds, and signing in is closed once the
owner has signed in.</p>
<h2>What it keeps</h2>
<p>Nothing from the files. They pass through to the owner's own tools when the owner asks for them,
and are not stored, logged, analysed or used for anything else. The only thing kept is the
sign-in's refresh token, as an encrypted secret in the owner's Cloudflare account.</p>
<h2>Sharing</h2>
<p>Nothing is shared with, sold to or shown to anyone else. There are no ads, no analytics and no
use of the data to train models.</p>
<p>nabu references' use and transfer of information received from Google APIs adheres to the
<a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User
Data Policy</a>, including the Limited Use requirements.</p>
<h2>Revoking access</h2>
<p>The owner can withdraw the relay's access at any time at
<a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.</p>
<h2>Contact</h2>
<p>Through the <a href="${REPOSITORY}/issues">project's issue tracker</a>.</p>`;

const TERMS = `<p>The relay is provided for its owner's personal use, as is and without warranty, under the
project's licenses (MIT or Apache-2.0, at your option). The owner is responsible for having the
right to keep and use the material in the folder.</p>`;

/** GET /, /privacy and /terms; anything else is not a page. */
export const pageFor = (pathname: string): Response | null => {
  switch (pathname) {
    case "/":
      return page("nabu references", HOME);
    case "/privacy":
      return page("nabu references: privacy policy", PRIVACY);
    case "/terms":
      return page("nabu references: terms of service", TERMS);
    default:
      return null;
  }
};
