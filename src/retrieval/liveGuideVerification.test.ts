import assert from "node:assert/strict";
import test from "node:test";
import { parseGuideSearchResults } from "./liveGuideVerification";

test("parses only allowlisted Persona 3 Reload IGN and Game8 search results", () => {
  const markdown = `
### [All Social Links and How to Unlock | Persona 3 Reload ![Image](blob:http://localhost/result) Game8](https://game8.co/games/Persona-3-Reload/archives/435602)
Completing every Social Link grants a completion reward.

### [Social Links Guide](https://www.ign.com/wikis/persona-3-reload/Social_Links_Guide)
IGN's Persona 3 Reload Social Link guide.

### [Unrelated Persona Guide](https://game8.co/games/Persona-5/archives/123)
Wrong game.

### [Search Redirect](https://www.google.com/url?q=https://game8.co/games/Persona-3-Reload/archives/435602)
Not a direct source.
`;

  const results = parseGuideSearchResults(markdown);
  assert.deepEqual(
    results.map((source) => source.url),
    [
      "https://game8.co/games/Persona-3-Reload/archives/435602",
      "https://www.ign.com/wikis/persona-3-reload/Social_Links_Guide",
    ],
  );
});
