const controlCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const invisibleDirectionCharacters = /[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;
const modelTokenMarkers = /<\|[^>]{0,80}\|>|\[(?:INST|\/INST|SYSTEM|ASSISTANT|USER)\]/gi;
const instructionLikeLine =
  /\b(ignore (?:all |any )?(?:previous|prior|above) instructions?|system prompt|developer message|reveal (?:the )?(?:prompt|secret|api key)|you are (?:chatgpt|an ai|the assistant)|act as|jailbreak|do not follow|override (?:the )?(?:system|developer)|assistant\s*:|system\s*:)\b/i;

export function sanitizeUntrustedText(value: string, maxLength = 12_000): string {
  const cleanedLines = value
    .replace(controlCharacters, " ")
    .replace(invisibleDirectionCharacters, "")
    .replace(modelTokenMarkers, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && !instructionLikeLine.test(line));

  return cleanedLines.join("\n").slice(0, maxLength).trim();
}

export function wrapUntrustedContext(label: string, value: string): string {
  return `<untrusted_${label}>\n${sanitizeUntrustedText(value)}\n</untrusted_${label}>`;
}
