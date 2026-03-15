---
name: fluffychat
version: 0.1.0
description: Browser-based Matrix web client preconfigured for Bloom's private server
image: localhost/bloom-fluffychat:latest
---

# FluffyChat Service

FluffyChat is an optional web client for Bloom's built-in Matrix server.

What it provides:

- Browser access to Bloom chat from any NetBird-connected device
- Preconfigured default homeserver for this Bloom node
- A locally built FluffyChat web app served from an OCI container

Default URL:

- `http://<netbird-name>:8081`

Matrix target:

- `http://<netbird-name>:6167`

Notes:

- FluffyChat is optional. Bloom's Matrix server and Pi daemon are part of the base image.
- The web client defaults to this Bloom node, but users can still sign into other Matrix servers.
- Access assumes your device is reachable over NetBird.
