import assert from "node:assert/strict";
import {
  analyzeRetrievalQuery,
  isRetrievalBoilerplate,
  lexicalCoverage,
} from "../retrieval/queryAnalysis";

const enemy = analyzeRetrievalQuery("What is Dancing Hand weak to on floor 22?");
assert.equal(enemy.category, "enemy");
assert.equal(enemy.floor, 22);
assert(enemy.phrases.includes("dancing hand"));
assert(lexicalCoverage("Dancing Hand appears in Thebel on floor 22.", enemy) > 0.5);

const fusion = analyzeRetrievalQuery("Is Satan worth fusing in Persona 3 Reload?");
assert.equal(fusion.category, "fusion");
assert(fusion.entityCandidates.includes("satan"));

const socialLink = analyzeRetrievalQuery("What is the best answer for Emperor Social Link rank 4?");
assert.equal(socialLink.category, "social_link");
assert(socialLink.phrases.some((phrase) => phrase.includes("emperor social link")));

const classroom = analyzeRetrievalQuery("What is the classroom answer on April 8?");
assert.equal(classroom.category, "schedule");
assert.equal(classroom.month, "april");
assert.equal(classroom.date, "April 8");
assert.equal(classroom.entityCandidates[0], "april 8 classroom question");

const numericDate = analyzeRetrievalQuery("What should I do on 4/23?");
assert.equal(numericDate.category, "schedule");
assert.equal(numericDate.date, "April 23");

const gatekeeper = analyzeRetrievalQuery("How do I beat Bloody Maria and what party should I bring?");
assert.equal(gatekeeper.category, "boss");
assert(gatekeeper.entityCandidates.includes("bloody maria"));

assert(isRetrievalBoilerplate("Advertisement. Find in guide. Top guide sections."));
assert(!isRetrievalBoilerplate("The Priestess uses Ice attacks and has no exploitable weakness."));

console.log("Retrieval heuristic checks passed.");
