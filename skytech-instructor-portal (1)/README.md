# SkyTech Academy — Instructor Portal

A private page for SkyTech instructors: office announcements, new forms, and the class schedule.
Hosted free on GitHub Pages. Everything you post is edited in the `data/` folder right on github.com — no coding needed.

**Live site:** https://sodikovaki.github.io/skytech-instructor-portal/
**Default passcode:** `SkyRope2026` (change it — see below)

---

## Post an announcement

1. Open `data/announcements.json` on GitHub and click the pencil (Edit).
2. Copy an existing block and paste it at the top, inside the `[` bracket:

```json
{
  "date": "2026-11-05",
  "title": "Truss inspection Friday",
  "from": "Aki",
  "pinned": false,
  "priority": "normal",
  "body": "First paragraph.\n\nSecond paragraph."
},
```

- `priority`: `"normal"` or `"safety"` (safety shows as an amber Safety critical card)
- `pinned`: `true` keeps it at the top
- Posts dated in the last 7 days show a **New** tag
- Separate paragraphs with `\n\n`
- Every block except the last needs a comma after its closing `}`

3. Click **Commit changes**. The site updates in about a minute.

## Add a new form

1. Open the `forms/` folder → **Add file → Upload files** → drop in the PDF → Commit.
2. Edit `data/forms.json` and add an entry:

```json
{
  "title": "Equipment inspection log",
  "id": "STA-FRM-002",
  "rev": "1",
  "category": "Equipment",
  "added": "2026-11-05",
  "file": "forms/STA-FRM-002_Equipment_Inspection.pdf",
  "note": ""
},
```

- Forms added in the last 14 days show a **New** tag
- Leave `"file": ""` for paper-only forms; it shows "Paper copy at the office"
- Forms are grouped on the page by `category`

## Search

The search bar at the top looks inside every PDF listed in `data/forms.json`, page by page, and links straight to the matching page.
The text it searches is in `data/search-index.json`. **You never edit that file:** whenever you upload a PDF or edit `forms.json`,
GitHub rebuilds it automatically (Actions tab → "Rebuild PDF search index", about a minute).

PowerPoint decks: upload the PDF version too (File → Save as PDF) and point `file` at the PDF. Add `"alt"` with the .pptx path
and `"altLabel": "PowerPoint"` to show a download link for the original.

## Update the class schedule

Edit `data/schedule.json` (current dates were copied from the booking calendar on skytechacademy.org on Oct 28, 2026; update both when classes change). Each class has `start`, `end` (YYYY-MM-DD), `course`, `hours`, and `instructors`. The band at the top of the portal always shows the next class automatically.

## Change the passcode

1. Open `https://sodikovaki.github.io/skytech-instructor-portal/tools/passcode.html`
2. Type the new passcode and copy the code it shows.
3. Edit `app.js`, replace the value of `PASSCODE_HASH`, commit, and share the new passcode with instructors.

## Privacy note

The passcode keeps casual visitors out, but this repository is public: anyone who finds it on GitHub can read the files in `data/` and `forms/`.
**Don't post** SPRAT numbers, student names, medical info, pay rates, or proprietary curriculum binders here. Keep those in a private location and post a note telling instructors where to find them.
