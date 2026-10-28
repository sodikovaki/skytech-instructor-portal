#!/usr/bin/env python3
"""Build data/search-index.json: the text of every page of every PDF listed in data/forms.json.

Runs automatically on GitHub (see .github/workflows/search-index.yml) whenever a PDF or
forms.json changes. To run it by hand: python3 tools/build_index.py  (needs poppler-utils).
"""
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FORMS = ROOT / "data" / "forms.json"
OUT = ROOT / "data" / "search-index.json"


def page_count(pdf: Path) -> int:
    info = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout
    m = re.search(r"^Pages:\s+(\d+)", info, re.M)
    return int(m.group(1)) if m else 0


def page_text(pdf: Path, n: int) -> str:
    txt = subprocess.run(
        ["pdftotext", "-f", str(n), "-l", str(n), "-layout", str(pdf), "-"],
        capture_output=True, text=True,
    ).stdout
    txt = txt.replace("\f", " ")
    txt = re.sub(r"[ \t]+", " ", txt)          # collapse runs of spaces
    txt = re.sub(r"\s*\n\s*", "\n", txt)        # tidy line breaks
    return txt.strip()


def main():
    forms = json.loads(FORMS.read_text(encoding="utf-8"))
    docs = []
    for f in forms:
        rel = f.get("file") or ""
        pdf = ROOT / rel
        if not rel.lower().endswith(".pdf") or not pdf.exists():
            continue
        pages = []
        for n in range(1, page_count(pdf) + 1):
            t = page_text(pdf, n)
            if t:
                pages.append([n, t])
        docs.append({"file": rel, "title": f.get("title", rel), "category": f.get("category", ""), "pages": pages})
        print(f"{rel}: {len(pages)} pages with text")
    OUT.write_text(json.dumps(docs, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
