import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maakWoordenboek, afstand, bedoelde, bedoeldeTerm, suggesties } from '../app/suggesties.js';
import { score } from '../app/zoeken.js';

const NAMEN = [
  'AH Currysaus 500 ml', 'Jumbo Currysaus', 'Currypasta rood', 'Currypasta groen', 'Kipfilet 500 g', 'Kipfilet blokjes',
  'AH Kipfilet', 'Pindakaas naturel', 'Calvé pindakaas', 'Brood volkoren', 'Wit brood', 'Brood tijger',
  'Geraspte kaas jong', 'Geraspte kaas belegen', 'Geraspte kokos', 'Halfvolle melk', 'Halfvolle melk 2 L',
  'Toiletpapier 8 rollen', 'Page toiletpapier', 'Griekse yoghurt', 'Yoghurt naturel', 'Yoghurt volle',
];
const boek = maakWoordenboek(NAMEN);
const woordjes = (invoer) => suggesties(boek, invoer).map((s) => s.woord);

test('afstand: letters erbij, eraf, anders of omgewisseld', () => {
  assert.equal(afstand('kipfilet', 'kipfilet'), 0);
  assert.equal(afstand('kipfilte', 'kipfilet'), 1); // omgewisseld
  assert.equal(afstand('brod', 'brood'), 1);
  assert.equal(afstand('jogurt', 'yoghurt'), 2);
  assert.equal(afstand('melk', 'kaasschaaf'), 3); // groter dan max: stopt vroeg
});

test('woordenboek: geen maten, getallen of winkelnamen', () => {
  assert.ok(boek.aantal.has('currysaus'));
  assert.equal(boek.aantal.get('kipfilet'), 3);
  for (const w of ['ah', 'jumbo', 'ml', '500', 'rollen']) assert.equal(boek.aantal.has(w), false, w);
});

test('suggesties tijdens het typen', () => {
  assert.deepEqual(woordjes('curry').slice(0, 2), ['currysaus', 'currypasta']);
  assert.deepEqual(woordjes('geraspte').slice(0, 3), ['geraspte', 'geraspte kaas', 'geraspte kokos']);
  assert.deepEqual(woordjes('halfvolle m'), ['halfvolle melk']);
  assert.deepEqual(woordjes('curry saus'), ['currysaus']); // los getypt, aan elkaar gevonden
  assert.deepEqual(woordjes('wc papier'), ['toiletpapier']);
  assert.deepEqual(woordjes('c'), []); // te kort
});

test('typefouten: bedoelde je…?', () => {
  assert.equal(bedoelde(boek, 'kipfilte'), 'kipfilet');
  assert.equal(bedoelde(boek, 'pindakaaas'), 'pindakaas');
  assert.equal(bedoelde(boek, 'jogurt'), 'yoghurt');
  assert.equal(bedoelde(boek, 'kipfilet'), null); // bestaat al
  assert.equal(bedoelde(boek, 'wcpapier'), null); // niet "papier": twee letters te weinig is geen typefout
  assert.equal(bedoeldeTerm(boek, 'griekse jogurt'), 'griekse yoghurt');
  assert.equal(suggesties(boek, 'brod')[0].woord, 'brood');
  assert.equal(suggesties(boek, 'brod')[0].soort, 'bedoeld');
});

test('zoeken: "wc-papier" vindt toiletpapier', () => {
  assert.ok(score('wc-papier', 'Page toiletpapier') >= 2);
  assert.ok(score('wc papier', 'AH Toiletpapier 8 rollen') >= 2);
});
