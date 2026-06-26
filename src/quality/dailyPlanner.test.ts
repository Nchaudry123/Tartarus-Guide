import assert from "node:assert/strict";
import test from "node:test";
import type { FactMatch } from "../types/schema";
import {
  asksForDailyDashboard,
  buildDailyDashboard,
  parseGameDate,
} from "./dailyPlanner";

const requestFact: FactMatch = {
  id: "request-12-deadline",
  fact_type: "deadline",
  value: "June 6",
  confidence: 0.96,
  notes: null,
  entity: {
    id: "request-12",
    name: "Elizabeth Request 12",
    type: "request",
    aliases: ["Request 12", "pine resin"],
    normalized_name: "elizabeth request 12",
  },
  source: {
    id: "game8-request-12",
    title: "Elizabeth Request 12",
    url: "https://game8.co/games/Persona-3-Reload/archives/requests",
    domain: "game8.co",
    credibility_rank: 2,
  },
};

test("parses Persona 3 Reload dates with their actual game weekday", () => {
  assert.deepEqual(parseGameDate("June 5"), {
    month: "June",
    day: 5,
    year: 2009,
    weekday: "Friday",
    ordinal: 85,
    timestamp: Date.UTC(2009, 5, 5),
  });
  assert.equal(parseGameDate("1/28")?.weekday, "Thursday");
  assert.equal(parseGameDate("February 1"), null);
});

test("recognizes direct daily-planning requests", () => {
  assert.equal(asksForDailyDashboard("What should I do today?"), true);
  assert.equal(asksForDailyDashboard("Show my game day dashboard"), true);
  assert.equal(asksForDailyDashboard("How do I fuse Loki?"), false);
});

test("prioritizes expiring requests, available tracked links, and the next operation", () => {
  const dashboard = buildDailyDashboard(
    {
      currentDate: "June 5",
      currentSocialLinks: ["Emperor", "Hierophant"],
      activeRequests: ["12"],
      tartarusBlock: "Arqa",
      tartarusFloor: "42F",
    },
    [requestFact],
  );
  assert(dashboard);
  assert.equal(dashboard.weekday, "Friday");
  assert.equal(dashboard.items[0].priority, "urgent");
  assert.match(dashboard.items[0].title, /Request 12/i);
  assert.match(dashboard.items[0].timing ?? "", /1 day left/i);
  assert.match(dashboard.items[1].title, /Emperor and Empress/i);
  assert(dashboard.items.some((item) => /Hidetoshi/.test(item.title)));
  assert(dashboard.items.some((item) => /Bunkichi/.test(item.title)));
  assert.equal(dashboard.items.at(-1)?.category, "Activity");
});

test("does not invent active links or requests when Player Memory does not track them", () => {
  const dashboard = buildDailyDashboard({ currentDate: "July 1" });
  assert(dashboard);
  assert(dashboard.items.some((item) => item.title === "Track your active Social Links"));
  assert(dashboard.items.some((item) => item.title === "Track active Elizabeth requests"));
  assert.equal(
    dashboard.items.some((item) => item.category === "Social Link" && item.title.includes("Yukari")),
    false,
  );
});

test("marks the January 31 mission urgent during the final days", () => {
  const dashboard = buildDailyDashboard({
    currentDate: "January 29",
    currentSocialLinks: ["Aeon"],
  });
  assert(dashboard);
  const mission = dashboard.items.find((item) => /Final Tartarus mission/.test(item.title));
  assert.equal(mission?.priority, "urgent");
  assert.match(mission?.timing ?? "", /2 days away/i);
  assert(dashboard.items.some((item) => /Aigis/.test(item.title)));
});
