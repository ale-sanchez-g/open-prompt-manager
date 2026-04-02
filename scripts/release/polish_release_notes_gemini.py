#!/usr/bin/env python3
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: polish_release_notes_gemini.py <input_file> <output_file>", file=sys.stderr)
        return 1

    input_file = pathlib.Path(sys.argv[1])
    output_file = pathlib.Path(sys.argv[2])

    if not input_file.exists():
        print(f"Input file not found: {input_file}", file=sys.stderr)
        return 1

    base_url = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai").rstrip("/")
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    api_key = os.getenv("GEMINI_API_KEY", "")

    draft = input_file.read_text(encoding="utf-8")

    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You are a release engineering assistant. Rewrite release notes to be concise, factual, and grouped by impact. Keep markdown headings and bullets. Do not invent changes.",
            },
            {
                "role": "user",
                "content": draft,
            },
        ],
        "temperature": 0.2,
    }

    try:
        req = urllib.request.Request(
            f"{base_url}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=60) as response:
            body = json.loads(response.read().decode("utf-8"))

        content = body["choices"][0]["message"]["content"].strip()
        if not content:
            output_file.write_text(draft, encoding="utf-8")
            return 0

        output_file.write_text(content + "\n", encoding="utf-8")
        return 0
    except (urllib.error.URLError, KeyError, IndexError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"Warning: Failed to polish release notes via Gemini: {exc!r}", file=sys.stderr)
        output_file.write_text(draft, encoding="utf-8")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
