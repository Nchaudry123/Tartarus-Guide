import assert from "node:assert/strict";
import {
  analyzeRetrievalQuery,
  buildFocusedQueries,
  editSimilarity,
  entityCandidateScore,
  entityTypesForCategory,
  isClearlyWrongCategory,
  isRetrievalBoilerplate,
  lexicalCoverage,
  matchesPrimarySubject,
} from "../retrieval/queryAnalysis";

const enemy = analyzeRetrievalQuery("What is Dancing Hand weak to on floor 22?");
assert.equal(enemy.category, "enemy");
assert.equal(enemy.floor, 22);
assert.equal(enemy.primarySubject, "dancing hand");
assert(enemy.phrases.includes("dancing hand"));
assert(lexicalCoverage("Dancing Hand appears in Thebel on floor 22.", enemy) > 0.5);
assert(entityTypesForCategory(enemy.category).includes("enemy"));
assert(matchesPrimarySubject("Dancing Hand is weak to Fire.", enemy));
assert(!matchesPrimarySubject("The Priestess is a Full Moon boss.", enemy));
assert(isClearlyWrongCategory("Persona 3 Reload Ending Explained", enemy.category));
assert(!isClearlyWrongCategory("Dancing Hand Weaknesses", enemy.category));
assert(editSimilarity("dacing hand", "dancing hand") > 0.9);
assert(entityCandidateScore(analyzeRetrievalQuery("dacing hand weakness"), "Dancing Hand") > 0.7);

const fusion = analyzeRetrievalQuery("Is Satan worth fusing in Persona 3 Reload?");
assert.equal(fusion.category, "fusion");
assert.equal(fusion.primarySubject, "satan");
assert(fusion.entityCandidates.includes("satan"));
assert(entityTypesForCategory(fusion.category).includes("persona"));

const lowerCaseFusion = analyzeRetrievalQuery("would satan be good to get?");
assert.equal(lowerCaseFusion.primarySubject, "satan");

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
assert.equal(gatekeeper.primarySubject, "bloody maria");
assert(gatekeeper.entityCandidates.includes("bloody maria"));

const finalBoss = analyzeRetrievalQuery("Who is the final boss? Full spoilers are fine.");
assert.equal(finalBoss.category, "story");
assert.equal(finalBoss.primarySubject, undefined);
assert(buildFocusedQueries("who is the final boss? full spoilers are fine")[0].includes("Nyx Avatar"));

const lowerCaseBoss = analyzeRetrievalQuery("how do i beat priestess?");
assert.equal(lowerCaseBoss.primarySubject, "priestess");
assert(buildFocusedQueries("how do i beat priestess?").some((query) => query.includes("status effects")));

const numberedRequest = analyzeRetrievalQuery("what do i need for request 15?");
assert.equal(numberedRequest.primarySubject, "request 15");

const completionReward = analyzeRetrievalQuery(
  "do i get anything for maxxing out every social link?",
);
assert.equal(completionReward.category, "social_link");
assert.equal(completionReward.primarySubject, undefined);

assert(isRetrievalBoilerplate("Advertisement. Find in guide. Top guide sections."));
assert(!isRetrievalBoilerplate("The Priestess uses Ice attacks and has no exploitable weakness."));

console.log("Retrieval heuristic checks passed.");
