#!/usr/bin/env python3
"""Annotate markdown with glossary spans using per-passage occurrence throttling."""

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


def should_define(term_id: str, term_state: dict[str, dict]) -> bool:
    """Define on 1st hit, skip 2, define, skip 4, define, skip 8, ..."""
    state = term_state.setdefault(term_id, {"skip_remaining": 0, "next_skip": 2})
    if state["skip_remaining"] > 0:
        state["skip_remaining"] -= 1
        return False
    state["skip_remaining"] = state["next_skip"]
    state["next_skip"] *= 2
    return True


def find_earliest_match(segment: str, cursor: int, patterns: list[dict]) -> dict | None:
    best = None
    for pattern in patterns:
        match = pattern["regex"].search(segment, cursor)
        if not match:
            continue
        candidate = {
            "start": match.start(),
            "end": match.end(),
            "text": match.group(0),
            "pattern": pattern,
        }
        if best is None or candidate["start"] < best["start"]:
            best = candidate
        elif candidate["start"] == best["start"] and (candidate["end"] - candidate["start"]) > (
            best["end"] - best["start"]
        ):
            best = candidate
    return best


def annotate_segment_with_state(
    segment: str, patterns: list[dict], term_state: dict[str, dict]
) -> str:
    if not segment:
        return segment

    parts: list[str] = []
    cursor = 0

    while cursor < len(segment):
        match = find_earliest_match(segment, cursor, patterns)
        if not match:
            parts.append(segment[cursor:])
            break

        parts.append(segment[cursor : match["start"]])
        term_id = match["pattern"]["id"]
        if should_define(term_id, term_state):
            parts.append(make_span(match["text"], match["pattern"]))
        else:
            parts.append(match["text"])
        cursor = match["end"]

    return "".join(parts)


def split_inline_markdown(line: str) -> list[tuple[str, bool]]:
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


def annotate_line(line: str, patterns: list[dict], term_state: dict[str, dict]) -> str:
    line = strip_existing_spans(line)
    pieces: list[str] = []
    for segment, protected in split_inline_markdown(line):
        if protected:
            pieces.append(segment)
        else:
            pieces.append(annotate_segment_with_state(segment, patterns, term_state))
    return "".join(pieces)


def annotate_passage_lines(lines: list[str], patterns: list[dict]) -> list[str]:
    term_state: dict[str, dict] = {}
    return [annotate_line(line, patterns, term_state) for line in lines]


def annotate_markdown(text: str, patterns: list[dict]) -> str:
    lines = text.splitlines(keepends=True)
    output: list[str] = []
    in_fence = False
    passage_lines: list[str] = []

    def flush_passage() -> None:
        nonlocal passage_lines
        if passage_lines:
            output.extend(annotate_passage_lines(passage_lines, patterns))
            passage_lines = []

    for line in lines:
        fence_match = FENCE_RE.match(line)
        if fence_match:
            flush_passage()
            in_fence = not in_fence
            output.append(line)
            continue

        if in_fence:
            output.append(strip_existing_spans(line))
            continue

        if line.strip() == "":
            flush_passage()
            output.append(line)
            continue

        passage_lines.append(line)

    flush_passage()
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
        cleaned = strip_existing_spans(original)
        updated = annotate_markdown(cleaned, patterns)
        if updated != original:
            md_path.write_text(updated, encoding="utf-8")
            print(f"annotated: {md_path.relative_to(root)}")
        else:
            print(f"unchanged: {md_path.relative_to(root)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
