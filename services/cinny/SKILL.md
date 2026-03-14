---
name: cinny
version: 0.1.0
description: Browser-based Matrix web client preconfigured for Bloom's private server
image: ghcr.io/cinnyapp/cinny:v4.10.2
---

# Cinny Service

Cinny is an optional web client for Bloom's built-in Matrix server.

What it provides:

- Browser access to Bloom chat from any NetBird-connected device
- Preconfigured default homeserver list for this Bloom node
- Static web app served from an OCI container

Default URL:

- `http://<netbird-name>:8081`

Matrix target:

- `http://<netbird-name>:6167`

Notes:

- Cinny is optional. Bloom's Matrix server and Pi daemon are part of the base image.
- Cinny is preconfigured for this Bloom node, but users can still choose another Matrix client later.
- Access assumes your device is reachable over NetBird.
