import type { CompanionIntent, ControllerAction } from "./types";

export function progressMessage(intent: CompanionIntent, action: ControllerAction): string {
  if (action === "search_guides") {
    return intent === "Boss Help"
      ? "Pulling boss notes..."
      : intent === "Tartarus Navigation"
        ? "Mapping the climb..."
        : "Scanning strategy notes...";
  }

  if (action === "search_structured_facts") {
    switch (intent) {
      case "Enemy Weakness":
        return "Checking exact affinities...";
      case "Fusion Advice":
        return "Looking up fusion facts...";
      case "Social Links":
        return "Checking link details...";
      case "Quest Help":
        return "Checking request facts...";
      default:
        return "Pulling exact facts...";
    }
  }

  switch (intent) {
    case "Enemy Weakness":
      return "Checking affinities...";
    case "Fusion Advice":
      return "Working the fusion chart...";
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
    case "Team Building":
      return "Thinking through party options...";
    default:
      return "One moment...";
  }
}
