"""
Send a WebSocket message to the gateway and collect the full reply.
Exits 0 if the reply contains expected content; exits 1 otherwise.

Usage: python3 ws-roundtrip-check.py <host> <port> <message> <expected_substr>
"""
import sys, socket, struct, base64, os, json


def ws_connect(host: str, port: int):
    s = socket.socket()
    s.connect((host, port))
    key = base64.b64encode(os.urandom(16)).decode()
    s.sendall(
        (
            f"GET / HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n"
            "\r\n"
        ).encode()
    )
    resp = b""
    while b"\r\n\r\n" not in resp:
        resp += s.recv(4096)
    assert b"101" in resp, f"WebSocket upgrade failed: {resp!r}"
    return s


def ws_send_text(s, msg: str) -> None:
    payload = msg.encode("utf-8")
    n = len(payload)
    mask = os.urandom(4)
    masked = bytes(payload[i] ^ mask[i % 4] for i in range(n))
    # FIN=1, opcode=1(text), MASK=1, length (7-bit for n<126)
    assert n < 126, "message too long for this simple client"
    s.sendall(bytes([0x81, 0x80 | n]) + mask + masked)


def ws_recv_text(s) -> str | None:
    def recv_exact(n: int) -> bytes:
        buf = b""
        while len(buf) < n:
            chunk = s.recv(n - len(buf))
            if not chunk:
                raise EOFError("connection closed")
            buf += chunk
        return buf

    header = recv_exact(2)
    opcode = header[0] & 0x0F
    if opcode == 8:  # close frame
        return None
    mask_len = header[1]
    payload_len = mask_len & 0x7F
    if payload_len == 126:
        ext = recv_exact(2)
        payload_len = struct.unpack(">H", ext)[0]
    elif payload_len == 127:
        ext = recv_exact(8)
        payload_len = struct.unpack(">Q", ext)[0]
    payload = recv_exact(payload_len)
    return payload.decode("utf-8")


def main():
    host = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8081
    message = sys.argv[3] if len(sys.argv) > 3 else "/help"
    expected = sys.argv[4] if len(sys.argv) > 4 else "help"

    s = ws_connect(host, port)
    ws_send_text(s, json.dumps({"type": "message", "text": message}))

    parts: list[str] = []
    s.settimeout(30)
    try:
        while True:
            raw = ws_recv_text(s)
            if raw is None:
                break
            msg = json.loads(raw)
            t = msg.get("type")
            if t in ("reply", "chunk"):
                parts.append(msg.get("text", ""))
            elif t == "done":
                break
            elif t == "error":
                print(f"gateway returned error: {msg}", file=sys.stderr)
                sys.exit(1)
    except TimeoutError:
        print("timeout waiting for gateway response", file=sys.stderr)
        sys.exit(1)
    finally:
        s.close()

    full = "".join(parts)
    print(f"gateway reply: {full[:200]!r}")
    if expected.lower() not in full.lower():
        print(f"ERROR: expected {expected!r} in reply", file=sys.stderr)
        sys.exit(1)
    print("WebSocket round-trip: OK")


main()
