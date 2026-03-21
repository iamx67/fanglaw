#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import sys


TARGET_PATH = Path("/etc/nginx/sites-available/fanglaw")
API_BLOCK = """\
    location /api/ {
        proxy_pass http://127.0.0.1:2567;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

"""


def find_matching_brace(text: str, open_brace_index: int) -> int:
    depth = 0
    for index in range(open_brace_index, len(text)):
        char = text[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index
    raise ValueError("Could not find matching brace in nginx config")


def insert_api_block(text: str) -> tuple[str, bool]:
    if "location /api/" in text:
        return text, False

    anchor = "location = /api-health {"
    anchor_index = text.find(anchor)
    if anchor_index == -1:
        raise ValueError("Could not find 'location = /api-health {' in nginx config")

    open_brace_index = text.find("{", anchor_index)
    if open_brace_index == -1:
        raise ValueError("Malformed nginx config near /api-health block")

    close_brace_index = find_matching_brace(text, open_brace_index)
    insert_at = close_brace_index + 2
    return text[:insert_at] + "\n" + API_BLOCK + text[insert_at:], True


def main() -> int:
    if not TARGET_PATH.exists():
        print(f"Config not found: {TARGET_PATH}")
        return 1

    original = TARGET_PATH.read_text(encoding="utf-8")
    updated = original
    changed = False

    if "index catlaw.html;" in updated:
        updated = updated.replace("index catlaw.html;", "index index.html;")
        changed = True

    if "try_files $uri $uri/ /catlaw.html;" in updated:
        updated = updated.replace(
            "try_files $uri $uri/ /catlaw.html;",
            "try_files $uri $uri/ /index.html;",
        )
        changed = True

    updated, api_added = insert_api_block(updated)
    changed = changed or api_added

    if not changed:
        print("Nothing to change. nginx config already looks updated.")
        return 0

    backup_path = TARGET_PATH.with_suffix(
        TARGET_PATH.suffix + f".bak.{datetime.now().strftime('%Y%m%d%H%M%S')}"
    )
    backup_path.write_text(original, encoding="utf-8")
    TARGET_PATH.write_text(updated, encoding="utf-8")

    print(f"Updated: {TARGET_PATH}")
    print(f"Backup:  {backup_path}")
    print("Next run:")
    print("  nginx -t")
    print("  systemctl reload nginx")
    return 0


if __name__ == "__main__":
    sys.exit(main())
