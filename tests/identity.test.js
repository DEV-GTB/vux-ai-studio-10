import test from 'node:test';
import assert from 'node:assert/strict';
import { getIdentityResponse } from '../lib/identity.js';

function ask(content) {
  return getIdentityResponse([{ role: 'user', content }]);
}

test('person questions return at least five sentences with listed roles', () => {
  const answer = ask('Who is Muhammed Thariq P.S?');

  assert.match(answer, /Founder, Owner, AI Engineer, and Cybersecurity Lead/);
  assert.ok(answer.split(/[.!?]+/).filter(Boolean).length >= 5);
});

test('Gokul is identified only with the listed tester and thanks roles', () => {
  const answer = ask('Who is Gokul?');

  assert.match(answer, /Performance Tester/);
  assert.doesNotMatch(answer, /Founder|Owner|AI Engineer/);
});

test('general Vux description does not list team members', () => {
  const answer = ask('What is Vux AI Studio?');

  assert.match(answer, /development workspace/);
  assert.match(answer, /Image Generator creates images/);
  assert.match(answer, /Help contains guidance/);
  assert.doesNotMatch(answer, /Muhammed|Gokul|Sreehari|NORTH/);
});

test('contribution questions about a person return their profile', () => {
  const answer = ask('What contribution did Pranav Prasad make?');

  assert.match(answer, /UI\/UX Designer and Design Lead/);
  assert.match(answer, /visual direction and design consistency/);
});

test('Hussain and Tuttu resolve to the architecture profile', () => {
  for (const name of ['Hussain', 'Tuttu']) {
    const answer = ask(`Who is ${name}?`);
    assert.match(answer, /Main Engineer of Architecture/);
    assert.ok(answer.split(/[.!?]+/).filter(Boolean).length >= 5);
  }
});

test('Aisha and Aachu resolve to the prompt engineering and design profile', () => {
  for (const name of ['Aisha', 'Aachu']) {
    const answer = ask(`Who is ${name}?`);
    assert.match(answer, /Prompt Engineer and Designer/);
    assert.ok(answer.split(/[.!?]+/).filter(Boolean).length >= 5);
  }
});

test('Jubi and Safna resolve to the six-sentence electrical and prompt engineering profile', () => {
  for (const name of ['Jubi', 'Safna']) {
    const answer = ask(`Who is ${name}?`);
    assert.match(answer, /Electrical Engineer and Prompt Engineer/);
    assert.equal(answer.split(/[.!?]+/).filter(Boolean).length, 6);
  }
});