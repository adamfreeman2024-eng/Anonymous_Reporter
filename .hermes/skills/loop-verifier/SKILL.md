# Loop Verifier — Anonymous_Reporter

Trigger: After L2 loop proposes a fix.

## Verification Gates

1. **Scope Check:** Fix ONLY addresses reported failure. No unrelated changes.
2. **Test Check:** `npm run test` — all 20 must pass.
3. **TypeScript Check:** `npx tsc --noEmit` — no type errors.
4. **Security Check:** 
   - No plaintext in HCS code paths.
   - EXIF stripping intact.
   - No changes to SimpleX AGPLv3 code.
5. **LICENSE Check:** MIT unchanged.

## Output

- All pass: "✅ VERIFIED — ready for human review."
- Any fail: "❌ BLOCKED — [gate] failed. [details]."

## Rules

- Verifier CANNOT merge. Reports to human.
- Tests must pass before approval.
