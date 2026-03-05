import test from 'node:test';
import assert from 'node:assert/strict';
import { isChannelMessage, mimeToExt, splitTcpBuffer } from '../dist/protocol.js';

test('mimeToExt maps known and unknown MIME types', () => {
  assert.equal(mimeToExt('audio/ogg'), 'ogg');
  assert.equal(mimeToExt('application/pdf'), 'pdf');
  assert.equal(mimeToExt('application/x-custom'), 'x-custom');
});

test('splitTcpBuffer returns complete lines and remainder', () => {
  const { lines, remainder } = splitTcpBuffer('{"a":1}\n{"b":2}\n{"c"');
  assert.deepEqual(lines, ['{"a":1}', '{"b":2}']);
  assert.equal(remainder, '{"c"');
});

test('isChannelMessage validates typed envelope', () => {
  assert.equal(isChannelMessage({ type: 'send', to: 'x', text: 'y' }), true);
  assert.equal(isChannelMessage({ to: 'x' }), false);
  assert.equal(isChannelMessage('nope'), false);
});
