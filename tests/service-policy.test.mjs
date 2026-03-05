import test from 'node:test';
import assert from 'node:assert/strict';
import { hasTagOrDigest, validatePinnedImage, validateServiceName } from '../dist/lib/service-policy.js';

test('validateServiceName accepts kebab-case and rejects invalid names', () => {
  assert.equal(validateServiceName('demo-api'), null);
  assert.match(validateServiceName('DemoApi') ?? '', /kebab-case/);
});

test('validatePinnedImage enforces non-latest tags', () => {
  assert.equal(validatePinnedImage('docker.io/library/nginx:1.27.2'), null);
  assert.equal(validatePinnedImage('docker.io/library/nginx@sha256:' + 'a'.repeat(64)), null);
  assert.match(validatePinnedImage('docker.io/library/nginx:latest') ?? '', /pinned/);
});

test('hasTagOrDigest detects mutable refs correctly', () => {
  assert.equal(hasTagOrDigest('ghcr.io/pibloom/bloom-svc-whisper:0.1.0'), true);
  assert.equal(hasTagOrDigest('ghcr.io/pibloom/bloom-svc-whisper@sha256:' + 'b'.repeat(64)), true);
  assert.equal(hasTagOrDigest('ghcr.io/pibloom/bloom-svc-whisper'), false);
});
