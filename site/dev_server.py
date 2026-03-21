from __future__ import annotations

import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


SITE_ROOT = Path(__file__).resolve().parent
WEB_EXPORT_ROOT = SITE_ROOT.parent / "client" / "web_export"
PORT = 4173


def resolve_file_path(request_path: str) -> Path | None:
    parsed_path = urlparse(request_path).path or "/"
    clean_path = "/index.html" if parsed_path == "/" else unquote(parsed_path)
    relative_path = Path(clean_path.lstrip("/"))

    for root in (SITE_ROOT, WEB_EXPORT_ROOT):
        candidate = (root / relative_path).resolve()
        try:
            candidate.relative_to(root.resolve())
        except ValueError:
            continue

        if candidate.is_file():
            return candidate

    return None


class FanglawDevHandler(BaseHTTPRequestHandler):
    server_version = "FanglawDevServer/1.0"

    def do_GET(self) -> None:  # noqa: N802
        self._serve_file(include_body=True)

    def do_HEAD(self) -> None:  # noqa: N802
        self._serve_file(include_body=False)

    def log_message(self, format: str, *args) -> None:
        print("%s - - [%s] %s" % (self.client_address[0], self.log_date_time_string(), format % args))

    def _serve_file(self, include_body: bool) -> None:
        file_path = resolve_file_path(self.path)
        if file_path is None:
            self.send_error(404, "Not found")
            return

        content_type, _ = mimetypes.guess_type(str(file_path))
        payload = file_path.read_bytes()

        self.send_response(200)
        self.send_header("Content-Type", content_type or "application/octet-stream")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

        if include_body:
            self.wfile.write(payload)


if __name__ == "__main__":
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), FanglawDevHandler)
    print(f"Site dev server running at http://127.0.0.1:{PORT}")
    httpd.serve_forever()
