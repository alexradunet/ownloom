"""
Send a protocol/v1 agent request to the gateway and collect the streamed reply.
Exits 0 if the reply contains expected content; exits 1 otherwise.

Usage: python3 ws-roundtrip-check.py <host> <port> <message> <expected_substr>
"""
import sys, socket, struct, base64, os, json, uuid


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
    assert b"101" in resp, f"websocket upgrade failed: {resp!r}"
    return s


def ws_send_text(s, msg: str) -> None:
    payload = msg.encode("utf-8")
    n = len(payload)
    mask = os.urandom(4)
    masked = bytes(payload[i] ^ mask[i % 4] for i in range(n))
    if n < 126:
        header = bytes([0x81, 0x80 | n])
    elif n < 65536:
        header = bytes([0x81, 0x80 | 126]) + struct.pack(">H", n)
    else:
        header = bytes([0x81, 0x80 | 127]) + struct.pack(">Q", n)
    s.sendall(header + mask + masked)


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
        payload_len = struct.unpack(">H", recv_exact(2))[0]
    elif payload_len == 127:
        payload_len = struct.unpack(">Q", recv_exact(8))[0]
    payload = recv_exact(payload_len)
    return payload.decode("utf-8")


def send_json(s, obj: dict) -> None:
    ws_send_text(s, json.dumps(obj))


def recv_json(s) -> dict:
    raw = ws_recv_text(s)
    if raw is None:
        raise EOFError("connection closed")
    return json.loads(raw)


def main():
    host = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8081
    message = sys.argv[3] if len(sys.argv) > 3 else "/help"
    expected = sys.argv[4] if len(sys.argv) > 4 else "help"

    s = ws_connect(host, port)
    s.settimeout(30)
    try:
        send_json(s, {
            "type": "connect",
            "protocol": 1,
            "role": "operator",
            "scopes": ["read", "write", "admin"],
            "auth": {},
            "client": {"id": "nixos-test", "platform": "python"},
        })
        hello = recv_json(s)
        if hello.get("type") != "res" or not hello.get("ok"):
            print(f"connect failed: {hello}", file=sys.stderr)
            sys.exit(1)

        req_id = str(uuid.uuid4())
        send_json(s, {"type": "req", "id": req_id, "method": "agent", "params": {"message": message}})

        parts: list[str] = []
        accepted = False
        while True:
            msg = recv_json(s)
            if msg.get("type") == "event" and msg.get("event") == "agent":
                payload = msg.get("payload", {})
                if payload.get("stream") in ("chunk", "result"):
                    parts.append(payload.get("text", ""))
            elif msg.get("type") == "res" and msg.get("id") == req_id:
                if not msg.get("ok"):
                    print(f"agent request failed: {msg}", file=sys.stderr)
                    sys.exit(1)
                accepted = True
                break

        full = "".join(parts)
        print(f"gateway reply: {full[:200]!r}")
        if not accepted:
            print("ERROR: no accepted response", file=sys.stderr)
            sys.exit(1)
        if expected.lower() not in full.lower():
            print(f"ERROR: expected {expected!r} in reply", file=sys.stderr)
            sys.exit(1)
        print("protocol/v1 round-trip: OK")
    except TimeoutError:
        print("timeout waiting for gateway response", file=sys.stderr)
        sys.exit(1)
    finally:
        s.close()


main()
