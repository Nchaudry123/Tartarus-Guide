import type { CompanionIntent, ControllerAction } from "./types";

export function progressMessage(intent: CompanionIntent, action: ControllerAction): string {
  if (action === "search_guides") {
    return intent === "Boss Help"
      ? "Reviewing boss mechanics..."
      : intent === "Tartarus Navigation"
        ? "Mapping floors and encounters..."
        : "Reviewing strategy notes...";
  }

  switch (intent) {
    case "Enemy Weakness":
      return "Checking affinities...";
    case "Fusion Advice":
      return "Validating fusion details...";
    case "Social Links":
      return "Checking schedules and unlocks...";
    case "Quest Help":
      return "Checking requirements and rewards...";
    case "Daily Schedule Planning":
      return "Checking the calendar...";
    case "Tartarus Navigation":
      return "Mapping floors and encounters...";
    case "Boss Help":
      return "Cross-checking boss mechanics...";
    default:
      return "Checking the details...";
  }
}
