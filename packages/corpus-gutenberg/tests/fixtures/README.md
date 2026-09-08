# Synthetic, and named so

`gutendex-search.synthetic.json` is **not a recorded response**. The build
environment has no egress to `gutendex.com`, so it is built from the field
names in `docs/ARCHITECTURE.md` §5.2, which are themselves from the API's public
documentation.

The filename carries `.synthetic.` so that no reader has to check. WP-X0
records a real `GET /books?search=…&languages=en`, replaces this file, and
writes `docs/spikes/gutendex-schema.md` as a field-by-field diff. Any correction
that changes the author-id shape is a decision file, because it changes the card
cache's identity.
