"""GV Float: starts a local web server for the browser game in ./docs and opens it.

    python3 gv_float.py                 # http://127.0.0.1:8000/
    python3 gv_float.py --port 9000
    python3 gv_float.py --no-browser

The game itself is plain HTML, CSS and JavaScript in the docs/ folder. Progress
(coins, skins, upgrades) is kept in the browser's localStorage, which belongs to
the address, so keep using the same port to keep your progress.
"""

import argparse
import functools
import http.server
import threading
import webbrowser
from pathlib import Path

WEB_DIR = Path(__file__).with_name("docs")
HOST = "127.0.0.1"
DEFAULT_PORT = 8000


class GameHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
    }

    def end_headers(self):
        # No caching while developing: a reload always shows the latest files.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_request(self, code="-", size="-"):
        pass  # keep the terminal quiet; errors are still reported by log_error


def make_server(port):
    handler = functools.partial(GameHandler, directory=str(WEB_DIR))
    try:
        return http.server.ThreadingHTTPServer((HOST, port), handler)
    except OSError:
        print(f"Port {port} is busy, picking a free one. Progress is stored per address, so it starts fresh there.")
        return http.server.ThreadingHTTPServer((HOST, 0), handler)


def main():
    parser = argparse.ArgumentParser(description="Serve GV Float locally.")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"port to listen on (default {DEFAULT_PORT})")
    parser.add_argument("--no-browser", action="store_true", help="don't open the browser automatically")
    args = parser.parse_args()

    server = make_server(args.port)
    url = f"http://{HOST}:{server.server_port}/"
    print(f"GV Float is running at {url}  (Ctrl+C to stop)")
    if not args.no_browser:
        threading.Timer(0.4, webbrowser.open, args=(url,)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
