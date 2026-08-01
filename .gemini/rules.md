# Persistent Agent Rules & Preferences

## UI & Form Design Rules
- **Form Input Placeholders**: Do not include placeholder text (`placeholder="..."`) in forms for trip details or trip creation unless explicitly requested. Rely on clear field labels instead.

## Verification & Testing Rules
- **Post-Build Browser Testing**: Succeeding at `npm run build` is a preliminary check. Do not stop after the build succeeds; continue active testing against page routes and dev server logs until all browser runtime errors, cross-origin blockages, and rendering failures are completely fixed.
