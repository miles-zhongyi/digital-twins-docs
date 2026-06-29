#!/usr/bin/env python3
"""Annotate markdown files with explicit glossary term spans."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

GLOSSARY_SPAN_RE = re.compile(
    r'<span class="glossary-term"[^>]*>(?P<text>.*?)</span>',
    re.DOTALL,
)
FENCE_RE = re.compile(r"^(\s*)(```+|~~~+)(.*)$")


def escape_attr(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace('"', "&quot;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def load_patterns(terms_path: Path) -> list[dict]:
    terms = json.loads(terms_path.read_text(encoding="utf-8"))
    patterns: list[dict] = []

    for entry in terms:
        for alias in entry["aliases"] + [entry["term"]]:
            alias = alias.strip()
            if not alias:
                continue
            if len(alias) <= 3 and alias.islower():
                # Skip ambiguous short lowercase aliases like "ue", "du", "cu".
                continue
            patterns.append(
                {
                    "alias": alias,
                    "id": entry["id"],
                    "term": entry["term"],
                    "definition": entry["definition"],
                    "regex": build_boundary_regex(alias),
                }
            )

    patterns.sort(key=lambda item: len(item["alias"]), reverse=True)
    return patterns


def build_boundary_regex(alias: str) -> re.Pattern[str]:
    escaped = re.escape(alias)
    if len(alias) <= 4 and any(char.isupper() for char in alias):
        flags = re.MULTILINE
    elif alias.isupper():
        flags = re.MULTILINE
    else:
        flags = re.IGNORECASE | re.MULTILINE
    return re.compile(rf"(?<![A-Za-z0-9_]){escaped}(?![A-Za-z0-9_])", flags)


def make_span(match_text: str, pattern: dict) -> str:
    return (
        f'<span class="glossary-term" data-glossary-id="{pattern["id"]}" '
        f'data-glossary-term="{escape_attr(pattern["term"])}" '
        f'data-glossary-definition="{escape_attr(pattern["definition"])}" '
        f'tabindex="0" role="button">{match_text}</span>'
    )


def strip_existing_spans(text: str) -> str:
    return GLOSSARY_SPAN_RE.sub(lambda match: match.group("text"), text)


def annotate_segment_once(segment: str, patterns: list[dict]) -> str:
    matches: list[dict] = []
    for pattern in patterns:
        for match in pattern["regex"].finditer(segment):
            matches.append(
                {
                    "start": match.start(),
                    "end": match.end(),
                    "text": match.group(0),
                    "pattern": pattern,
                }
            )

    if not matches:
        return segment

    matches.sort(key=lambda item: (item["start"], -(item["end"] - item["start"])))
    selected: list[dict] = []
    for candidate in matches:
        if any(
            not (
                candidate["end"] <= existing["start"]
                or candidate["start"] >= existing["end"]
            )
            for existing in selected
        ):
            continue
        selected.append(candidate)

    selected.sort(key=lambda item: item["start"], reverse=True)
    annotated = segment
    for match in selected:
        annotated = (
            annotated[: match["start"]]
            + make_span(match["text"], match["pattern"])
            + annotated[match["end"] :]
        )
    return annotated


def split_inline_markdown(line: str) -> list[tuple[str, bool]]:
    """Split a line into plain-text and protected regions."""
    parts: list[tuple[str, bool]] = []
    cursor = 0
    for match in re.finditer(r"(`+[^`]+`+|\[[^\]]+\]\([^\)]+\)|<[^>]+>)", line):
        if match.start() > cursor:
            parts.append((line[cursor : match.start()], False))
        parts.append((match.group(0), True))
        cursor = match.end()
    if cursor < len(line):
        parts.append((line[cursor:], False))
    return parts


def annotate_line(line: str, patterns: list[dict]) -> str:
    line = strip_existing_spans(line)
    pieces: list[str] = []
    for segment, protected in split_inline_markdown(line):
        pieces.append(segment if protected else annotate_segment_once(segment, patterns))
    return "".join(pieces)


def annotate_markdown(text: str, patterns: list[dict]) -> str:
    lines = text.splitlines(keepends=True)
    output: list[str] = []
    in_fence = False

    for line in lines:
        fence_match = FENCE_RE.match(line)
        if fence_match:
            in_fence = not in_fence
            output.append(line)
            continue
        if in_fence:
            output.append(strip_existing_spans(line))
            continue
        output.append(annotate_line(line, patterns))

    return "".join(output)


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    terms_path = root / "_static" / "glossary-terms.json"
    patterns = load_patterns(terms_path)

    md_files = sorted(
        path
        for path in root.rglob("*.md")
        if path.name != "glossary.md" and "_build" not in path.parts
    )

    for md_path in md_files:
        original = md_path.read_text(encoding="utf-8")
        updated = annotate_markdown(original, patterns)
        if updated != original:
            md_path.write_text(updated, encoding="utf-8")
            print(f"annotated: {md_path.relative_to(root)}")
        else:
            print(f"unchanged: {md_path.relative_to(root)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
