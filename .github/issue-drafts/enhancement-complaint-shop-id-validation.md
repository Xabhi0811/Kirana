# Accept MongoDB shop IDs when preselecting a complaint shop

Labels: `enhancement`, `help wanted`

The README documents that complaint shop preselection still validates UUIDs even though the active database uses MongoDB ObjectId strings. A customer following a shop link should be able to open a complaint with that shop selected.

## Scope

- Trace the complaint page query handling, form validation, and API validation.
- Accept a valid shop ObjectId and reject malformed input without a server error.
- Add a focused test for valid preselection and invalid input.

## Done when

- A valid shop link preselects the shop in the complaint form.
- Submitting the complaint uses the intended shop ID.
- Invalid IDs receive a clear validation result.
