# 0011. Content-addressed attachments and safe rendering

- Status: proposed
- Date: 2026-11-19

## Context

An XSS in this app can use the unlocked signing key of the user. It can write ops in the name of the user.

## Decision

1. Attachment blobs are `data/files/<sha256>`. The client checks the hash when it reads a blob.
2. Only raster images (`image/png`, `image/jpeg`, `image/gif`, `image/webp`) show inline, as a thumbnail from a `blob:` URL with an `<img>` element. The MIME type comes from the first bytes of the file (magic bytes), not from the name or the op.
3. The app never renders HTML, SVG, XML or PDF inline. All other files download through a `blob:` URL with the `download` attribute and the type `application/octet-stream`.
4. Markdown: a small renderer of our own. It makes Preact nodes. It supports paragraphs, line breaks, `**bold**`, `*italic*`, `` `code` ``, lists and links. Links are only `http:`, `https:` and `mailto:`. There is no raw HTML.
5. The UI and the replay block attachments that a browser can run as a page (`.html`, `.svg` and others, `docs/data-model.md` §11). The download name of other files gets `.txt` if its extension is not on a list of safe types (Q-22). Reason: a local HTML file runs in the same `file://` origin as the app (`docs/security-model.md` §4).
6. Links open in a new tab with `rel="noopener noreferrer"` and `target="_blank"`.
7. The CSP has `default-src 'none'`, `connect-src 'none'`, `img-src data: blob:`.

## Consequences

Users cannot preview PDF files in the app. They download them.
