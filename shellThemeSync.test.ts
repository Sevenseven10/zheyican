import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setShellBackground } from './platform/shellBackground.web';

const theme = { content: '#F3F2ED', setAttribute: (name: string, value: string) => { if (name === 'content') theme.content = value; } };
const htmlStyle: Record<string, string> = {};
const bodyStyle: Record<string, string> = {};
const rootStyle: Record<string, string> = {};

(globalThis as Record<string, unknown>).document = {
  documentElement: { style: htmlStyle },
  body: { style: bodyStyle },
  getElementById: (id: string) => (id === 'root' ? { style: rootStyle } : null),
  querySelector: (selector: string) => (selector === 'meta[name="theme-color"]' ? theme : null),
};

setShellBackground('dark');
assert.equal(theme.content, '#262725', 'theme-color did not follow the dark shell background');
assert.equal(htmlStyle.backgroundColor, '#262725', 'html shell background did not sync with dark');
assert.equal(bodyStyle.backgroundColor, '#262725', 'body shell background did not sync with dark');
assert.equal(rootStyle.backgroundColor, '#262725', 'root shell background did not sync with dark');

setShellBackground('light');
assert.equal(theme.content, '#F3F2ED', 'theme-color was not restored by the light shell background');
assert.equal(htmlStyle.backgroundColor, '#F3F2ED', 'html shell background did not return to light');

setShellBackground('composer');
assert.equal(theme.content, '#171816', 'theme-color did not follow the composer background');

setShellBackground('camera');
assert.equal(theme.content, '#000000', 'theme-color did not follow the camera background');

const html = readFileSync('public/index.html', 'utf8');
assert.match(html, /<meta name="theme-color" content="#F3F2ED" \/>/, 'Initial theme-color must remain #F3F2ED');

console.log('shell background theme-color sync tests passed');
