import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanRunOutput, splitPlots, createLiveOutputFilter, fenceFor, formatResult,
  isOutputFence, isOwnedImageLine, cellForCode, createRunFollower, finishedOutput,
} from '../src/rat-notebook.js';

test('cleanRunOutput drops rat chrome, keeps the program output', () => {
  const out = 'py@proj started on http://127.0.0.1:8717/mcp (PID 9)\nhello\n\n✓ 21ms | 1 var';
  assert.equal(cleanRunOutput(out), 'hello');
  assert.equal(cleanRunOutput('a ✓ b\n✓ 2.5s'), 'a ✓ b');
  assert.equal(cleanRunOutput(''), '');
});

test('splitPlots and finishedOutput pull plot markers out', () => {
  assert.deepEqual(splitPlots('a\n__RAT_PLOT__:/c/fig-1-0.png\nb\n__RAT_PLOT__:/c/fig-1-1.png\n'),
    { text: 'a\nb', plots: ['/c/fig-1-0.png', '/c/fig-1-1.png'] });
  assert.deepEqual(finishedOutput('__RAT_PLOT__:/c/f.png\n\n✓ 1s | 2 vars'), { text: '', plots: ['/c/f.png'] });
});

test('the live filter finds markers split across chunks without holding back a prompt', () => {
  const f0 = createLiveOutputFilter();
  const pick = r => ({ text: r.text, plots: r.plots });
  const f = { feed: c => pick(f0.feed(c)), flush: () => pick(f0.flush()) };
  assert.deepEqual(f.feed('Name: '), { text: 'Name: ', plots: [] }, 'a prompt passes at once');
  assert.deepEqual(f.feed('\nstep 1\n__RAT_'), { text: '\nstep 1\n', plots: [] });
  assert.deepEqual(f.feed('PLOT__:/c/f.png\nafter'), { text: 'after', plots: ['/c/f.png'] });
  assert.deepEqual(f.feed('__RAT_PLOT__:/c/g.png'), { text: '', plots: [] });
  assert.deepEqual(f.flush(), { text: '', plots: ['/c/g.png'] });
});

test('formatResult: output only, a fence longer than the content, owned images after', () => {
  assert.equal(fenceFor('no ticks'), '```');
  assert.equal(fenceFor('has ``` inside'), '````');
  assert.equal(formatResult('x ``` y', [{ src: '../_assets/generated/a.png' }]),
    '````output\nx ``` y\n````\n\n![plot](../_assets/generated/a.png)');
  assert.equal(formatResult('', [{ src: '_assets/generated/b.png' }]), '![plot](_assets/generated/b.png)');
  assert.equal(formatResult('  \n', []), '');
});

test('result fences and owned images, in every spelling', () => {
  for (const line of ['```output', '````output', '```output:exec-12', '```output | ✓ 1.5s | 1 var', '  ```output'])
    assert.equal(isOutputFence(line), true, line);
  for (const line of ['```python', '```outputs', '```', 'output'])
    assert.equal(isOutputFence(line), false, line);
  assert.equal(isOwnedImageLine('![plot](../_assets/generated/a.png)'), true);
  assert.equal(isOwnedImageLine('![plot-2](_assets/fig-1-0.png)'), true, 'VS Code\'s earlier location');
  assert.equal(isOwnedImageLine('![my chart](../_assets/a.png)'), false, 'a person\'s image');
  assert.equal(isOwnedImageLine('![plot](images/a.png)'), false, 'not a generated asset');
});

test('cellForCode matches only an unambiguous cell', () => {
  const cells = [{ code: 'x = 1\n' }, { code: 'print(x)' }, { code: 'print(x)' }];
  assert.equal(cellForCode(cells, 'x = 1'), cells[0]);
  assert.equal(cellForCode(cells, 'print(x)'), null, 'two identical cells');
  assert.equal(cellForCode(cells, 'y'), null);
});

test('the follower fills in what live chunks missed, and finds plots', () => {
  const f = createRunFollower();
  assert.equal(f.apply({ event: 'run_started', run_id: 'r', caller: "Lilly's agent", code: 'go()' }).run.caller, "Lilly's agent");
  const out0 = f.apply({ event: 'run_output', run_id: 'r', text: 'epoch 0\n' });
  assert.deepEqual([out0.kind, out0.run, out0.text, out0.plots, out0.displays], ['run_output', f.runs.get('r'), 'epoch 0\n', [], []]);
  assert.equal(f.apply({ event: 'run_waiting', run_id: 'r', prompt: 'Go? ' }).run.waiting.prompt, 'Go? ');
  const end = f.apply({ event: 'run_ended', run_id: 'r', ok: true, duration_ms: 1200, output: 'epoch 0\nepoch 1\n__RAT_PLOT__:/c/f.png' });
  assert.deepEqual([end.text, end.plots, end.run.ok, end.run.ms, end.run.waiting], ['epoch 1\n', ['/c/f.png'], true, 1200, null]);
  assert.equal(f.runs.size, 0);

  // A quick run: no chunks at all; the end carries everything.
  f.apply({ event: 'run_started', run_id: 'q', code: 'print(1)' });
  assert.equal(f.apply({ event: 'run_ended', run_id: 'q', ok: true, output: '1' }).text, '1\n');
  // A failure shows its error.
  f.apply({ event: 'run_started', run_id: 'e', code: '1/0' });
  const failed = f.apply({ event: 'run_ended', run_id: 'e', ok: false, output: '', error: 'ZeroDivisionError' });
  assert.deepEqual([failed.text, failed.run.ok], ['ZeroDivisionError\n', false]);
  // Events for a run we never saw start are ignored.
  assert.equal(f.apply({ event: 'run_output', run_id: 'ghost', text: 'x' }).run, null);
});

import { splitParts, finishedParts, formatParts, embedLine, isOwnedEmbedLine, isOwnedResultLine } from '../src/rat-notebook.js';

test('rich displays keep their place among the text', () => {
  const out = 'before\n__RAT_PLOT__:/c/a.png\nmiddle\n__RAT_DISPLAY__:/c/d.json\nafter\n\n✓ 1s';
  assert.deepEqual(finishedParts(out), [
    { kind: 'text', text: 'before' }, { kind: 'plot', path: '/c/a.png' },
    { kind: 'text', text: 'middle' }, { kind: 'display', path: '/c/d.json' }, { kind: 'text', text: 'after' },
  ]);
  assert.deepEqual(splitParts('__RAT_DISPLAY__:/x.json'), [{ kind: 'display', path: '/x.json' }]);
  assert.equal(splitPlots('a\n__RAT_DISPLAY__:/x.json\nb').text, 'a\nb', 'older hosts never show the marker');
  const live = createLiveOutputFilter();
  const one = live.feed('x\n__RAT_DISP');
  assert.deepEqual([one.text, one.displays], ['x\n', []], 'a partial marker is held back');
  const two = live.feed('LAY__:/y.json\nz');
  assert.deepEqual([two.displays, two.items.map(i => i.kind)], [['/y.json'], ['display', 'text']]);
});

test('formatParts writes an ordered result; embeds and images are owned', () => {
  const md = formatParts([
    { kind: 'text', text: 'a' }, { kind: 'text', text: 'b' }, { kind: 'image', src: '../_assets/generated/1.png', alt: 'plot' },
    { kind: 'text', text: 'c ```' }, { kind: 'embed', src: '../_assets/generated/2.html', height: 300 },
  ]);
  assert.equal(md, '```output\na\nb\n```\n\n![plot](../_assets/generated/1.png)\n\n````output\nc ```\n````\n\n'
    + '<iframe class="rat-output" src="../_assets/generated/2.html" sandbox="allow-scripts" loading="lazy" style="width:100%;height:300px;border:0"></iframe>');
  assert.equal(isOwnedEmbedLine(embedLine('../_assets/generated/2.html')), true);
  assert.equal(isOwnedEmbedLine('<iframe src="https://youtube.com/x"></iframe>'), false, 'a person\u2019s own embed is never replaced');
  assert.equal(isOwnedResultLine('![plot](_assets/generated/1.png)'), true);
  assert.equal(formatParts([{ kind: 'text', text: '  ' }]), '');
});
