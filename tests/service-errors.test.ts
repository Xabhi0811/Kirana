import { test } from "node:test";
import assert from "node:assert/strict";
import { authFailure, missingDatabaseObject } from "../src/lib/service-errors";
test("missing schema and RPC errors are distinguished from permission failures", () => {
  for (const code of ["PGRST205", "PGRST202", "42P01", "42883"])
    assert.equal(missingDatabaseObject(code), true);
  assert.equal(missingDatabaseObject("42501"), false);
});
test("authentication failures preserve meaningful HTTP statuses", () => {
  assert.equal(
    authFailure({ code: "invalid_credentials", status: 400 }, "login").status,
    401,
  );
  assert.equal(
    authFailure({ code: "email_not_confirmed", status: 400 }, "login").status,
    403,
  );
  assert.equal(
    authFailure({ code: "over_email_send_rate_limit", status: 429 }, "register")
      .status,
    429,
  );
  assert.equal(
    authFailure(
      { code: "email_address_not_authorized", status: 400 },
      "register",
    ).status,
    503,
  );
  assert.equal(
    authFailure({ code: "email_address_invalid", status: 400 }, "register")
      .status,
    400,
  );
  assert.equal(authFailure({ status: 500 }, "login").status, 503);
});
