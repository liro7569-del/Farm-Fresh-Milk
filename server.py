import http.server
import socketserver
import os
import sys

PORT = 3000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Enable CORS
        self.send_header('Access-Control-Allow-Origin', '*')
        # Prevent browser caching of dynamic code assets during development
        if self.path.endswith('.html') or self.path.endswith('.js') or self.path.endswith('.css') or self.path == '/':
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        else:
            self.send_header('Cache-Control', 'public, max-age=3600')
        super().end_headers()

def run_server():
    port = PORT
    for attempt in range(5):
        try:
            with socketserver.ThreadingTCPServer(("", port), CustomHTTPRequestHandler) as httpd:
                print(f"FARM_FRESH_SERVER_RUNNING:http://localhost:{port}")
                sys.stdout.flush()
                httpd.serve_forever()
                break
        except OSError:
            print(f"Port {port} busy, trying {port + 1}...")
            port += 1

if __name__ == '__main__':
    run_server()
