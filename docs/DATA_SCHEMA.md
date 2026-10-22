# Data schema (schemaVersion 1)

Stored in IndexedDB database `careercanvas` (v1): object store `resumes` (keyPath `id`, index `updatedAt`) and `meta` (key/value, currently `lastResumeId`). If IndexedDB cannot be opened, an in-memory store with the same interface is used and the UI warns that nothing will survive closing the tab.

```
Resume {
  id, schemaVersion, title, createdAt, updatedAt (ISO strings),
  templateId ("summit" placeholder until Phase 3), pageSize ("A4"|"Letter"),
  designSettings {}, photo null (Phase 3),
  contact { fullName, title, email, phone, location, website, linkedin },
  links [{ id, label, url }],                      // max 10
  sectionOrder [sectionId],                        // Personal Info is fixed first, not part of this list
  sections {
    summary:        { id, type, visible, text },
    experience:     { id, type, visible, items: [{ id, title, organization, location, startDate, endDate, current, bullets:[{id,text}] }] },
    education:      { ... items: [{ id, program, school, location, startDate, endDate, details }] },
    skills:         { ... items: [{ id, label, items: string[] }] },
    projects:       { ... items: [{ id, name, role, startDate, endDate, url, bullets }] },
    certifications: { ... items: [{ id, title, issuer, date, url }] },
    languages:      { ... items: [{ id, language, proficiency }] },
    <customId>:     { id, type:"custom", visible, title, mode:"text"|"bullets", text, bullets }   // max 20
  },
  metadata { isSample, createdWith }
}
```
Dates are `YYYY-MM` strings. Limits: 50 entries per section, 30 bullets per list, 60 skills per group.

## Rules
- `models/section-defs.js` is the single source for fields, limits and labels; forms, normalisation, preview and checklist all read it.
- Every load goes through `storage/migrations.js` then `normalizeResume()`, which repairs types, caps lengths, strips control/bidi characters and drops unknown section ids.
- A record with `schemaVersion` greater than the app's is **never opened, repaired or overwritten**. It is listed as unreadable and left untouched.
- Bumping the schema: add `MIGRATIONS[n]` (n → n+1) in `storage/migrations.js`, bump `SCHEMA_VERSION`, add a fixture test. Never edit old steps.
- No fabricated data: the blank resume is empty; the sample is flagged `metadata.isSample`, uses `@example.com`, contains no metrics, and is warned about in the editor, Saved list and checklist.
