import assert from "node:assert/strict";
import { test } from "node:test";

import { parsePatchNotes } from "./patch-notes";

test("an announcement: the blurb is not repeated in the notes", () => {
  const notes = parsePatchNotes(
    '<a href="x"><img src="y"></a><br><br>The Cursed Apple is ever changing, and these streets are nothing like you remember.<br><br>Thanks &amp; enjoy!',
  );
  assert.equal(notes.blurb, "The Cursed Apple is ever changing, and these streets are nothing like you remember.");
  assert.deepEqual(notes.blocks, [{ kind: "paragraph", text: "Thanks & enjoy!" }]);
});

test("a changelog: bold lines are headings, dashes are list items", () => {
  const notes = parsePatchNotes(
    '<p class="bb_paragraph"><b>\\[ General ]</b></p><p class="bb_paragraph"></p><p class="bb_paragraph">- Guardian bounty increased by 10%</p><p class="bb_paragraph">- Slows now affect drag (convar</p><p class="bb_paragraph">to toggle)</p>',
  );
  assert.equal(notes.blurb, undefined);
  assert.deepEqual(notes.blocks, [
    { kind: "heading", text: "[ General ]" },
    { kind: "list", items: ["Guardian bounty increased by 10%", "Slows now affect drag (convar to toggle)"] },
  ]);
});

test("markup never gets through", () => {
  const notes = parsePatchNotes('<p>- <img src=x onerror="alert(1)">fine &lt;script&gt;</p>');
  assert.ok(!JSON.stringify(notes).includes("onerror"));
  assert.deepEqual(notes.blocks, [{ kind: "list", items: ["fine <script>"] }]);
});

test("a long blurb is cut at a word", () => {
  const notes = parsePatchNotes(`${"word ".repeat(100)}end`);
  assert.ok(notes.blurb?.endsWith("…"));
  assert.ok((notes.blurb?.length ?? 0) <= 321);
});
