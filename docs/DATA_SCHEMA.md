# Data schema (schemaVersion 2)

Stored in IndexedDB database `careercanvas` (v1): object store `resumes` (keyPath `id`, index `updatedAt`) and `meta` (key/value, currently `lastResumeId`). If IndexedDB cannot be opened, an in-memory store with the same interface is used and the UI warns that nothing will survive closing the tab.

```
Resume {
  id, schemaVersion, title, createdAt, updatedAt (ISO strings),
  templateId (one of the 8 registry ids, default "summit"), pageSize ("A4"|"Letter"),
  designSettings { accent?, fontPair?, titleScale?, bodyScale?, lineHeight?, sectionGap?, margins?,
                   dividerStyle?, headerAlign?, simplified?, showPhoto?, photoShape? },   // OVERRIDES on template defaults
  photo null | { data: "data:image/jpeg;base64,…", width, height },                       // optional, ≤150k chars,
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

## Schema v2 (Phase 3)
- `designSettings` holds only overrides; `js/templates/design.js` merges them over each template's defaults and clamps every value (ranges in `LIMITS`). Unknown keys are dropped.
- `photo` is optional. It is created only by our canvas re-encode (centre-cropped 320px JPEG, EXIF discarded). Anything else (other MIME types, remote URLs, oversized data) is dropped by `normalizePhoto`. A photo is **rendered only when** `designSettings.showPhoto` is true **and** the rendered layout supports photos (Summit, Grid, Slate and the simplified layout never show it).
- Migration 1→2 only stamps the version; `normalizeResume` repairs `templateId` and `designSettings`. App versions that only know v1 refuse v2 records instead of silently dropping photos.
- Switching template (`applyTemplate`) keeps content, section order, `simplified`, `showPhoto` and `photoShape`, and clears visual overrides.

## Backup file (format 1)
```
{ app: "CareerCanvas", kind: "backup", format: 1, schemaVersion: 2, appVersion, exportedAt (ISO),
  includesPhotos: boolean, documents: [ Resume, ... ] }
```
- Photos are embedded only when the user ticks "Include photos" (`photo: null` otherwise).
- Import (`js/export/backup.js`) never executes anything: size cap (30 MB), `JSON.parse`, then **every** document goes through `migrateRecord` + `normalizeResume`. Unknown/newer-version/duplicate-id documents are rejected individually with a reason. A newer backup *format* is refused as a whole.
- A bare single resume or an array of resumes is also accepted.
- Existing ids: *keep both* (renamed copy, new id) is the default, *replace* overwrites, *skip* ignores.

## Crash-recovery shadow copy
`localStorage["cc.shadow.<id>"] = { savedAt, doc }` is written **synchronously** when the tab is hidden/closed while a save is still pending, and removed when the real save succeeds. On the next open, a shadow that validates and is newer than the stored record is *offered* (restore is undoable; keeping the saved version deletes it). Corrupt or foreign shadows are discarded.

## Cover letters (Phase 5, letter schema v1)
Letters are stored in the same `resumes` object store and are told apart by `kind: "cover-letter"` (resumes have no `kind`). `migrateRecord` routes by kind, so shadow copies, backups and the Saved list handle both. A letter has its **own** `schemaVersion` (currently 1); a record with a higher version is refused and left untouched, exactly like resumes.

```
{ id, kind: "cover-letter", schemaVersion: 1, title, createdAt, updatedAt,
  templateId, pageSize, designSettings,        // same meaning as on resumes
  contact, links, photo,                       // sender block, same shape and rules as resumes
  recipient: { name, title, company, address },
  role, date ("YYYY-MM-DD" or ""), greeting, opening,
  body: [{ id, text }]                         // 1 to 3 paragraphs
  closing, signature,
  metadata: { isSample, createdWith, copiedFromResume } }
```
Limits (see `LETTER_FIELD_MAX`): opening 1500, paragraph 3000, address 300, other fields 120-160 characters. All text is cleaned with `cleanText` and is only ever rendered with `textContent`.

**Copy from a resume** (`copyDetailsFromResume`) copies name, title, contact fields, links, signature name and the template look once. It never links to the resume, never changes it, and copies the photo only when the user ticks the box.

**Backup:** letters travel in the same `documents` array. The envelope `schemaVersion` still describes resumes; each letter carries its own. An older app version would list letters as invalid items and skip them.
