/**
 * Source URLs indexed before the link pattern handled parentheses were cut at the first ")",
 * e.g. ".../Harabah_(Floors_199_-_226" for ".../Harabah_(Floors_199_-_226)_Tartarus_Walkthrough",
 * and 404. Replies map them to the live pages (checked against IGN's Tartarus hub).
 */
const IGN = "https://www.ign.com/wikis/persona-3-reload/";

const repairs: Record<string, string> = {
  "Harabah_(Floors_199_-_226": "Harabah_(Floors_199_-_226)_Tartarus_Walkthrough",
  "Harabah_(Floors_173_-_198": "Harabah_(Floors_173_-_198)_Tartarus_Walkthrough",
  "Yabbashah_(Floors_70_-_92": "Yabbashah_(Floors_70_-_92)_-_Tartarus_Walkthrough",
  "Yabbashah_(Floors_93_-_118": "Yabbashah_(Floors_93_-_118)_Tartarus_Walkthrough",
  "Arqa_(Floors_23_-_43": "Arqa_(Floors_23_-_43)_-_Tartarus_Walkthrough",
  "Arqa_(Floors_44_-_69": "Arqa_(Floors_44_-_69)_-_Tartarus_Walkthrough",
  "Arqa_(Part_2)_-_Tartarus_Walkthrough": "Arqa_(Floors_44_-_69)_-_Tartarus_Walkthrough",
  "Nyx_Boss_Guide_(Final_Boss": "Nyx_Boss_Guide_(Final_Boss)",
  "Final_Mission_(January_31": "Final_Mission:_The_Promised_Day_(January_31)",
};

export function repairSourceUrl(url: string): string {
  if (!url.startsWith(IGN)) return url;
  const page = url.slice(IGN.length);
  return repairs[page] ? `${IGN}${repairs[page]}` : url;
}

export function withRepairedSourceUrls<T extends { sources: Array<{ url: string }> }>(response: T): T {
  if (!response.sources?.some((source) => repairSourceUrl(source.url) !== source.url)) return response;
  return { ...response, sources: response.sources.map((source) => ({ ...source, url: repairSourceUrl(source.url) })) };
}
