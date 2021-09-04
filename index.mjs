#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import pronouncing from "pronouncing";
import marked from "marked";
import jsdom from "jsdom";

// 100.00–90.00 	5th grade 	Very easy to read. Easily understood by an average 11-year-old student.
// 90.0–80.0 	6th grade 	Easy to read. Conversational English for consumers.
// 80.0–70.0 	7th grade 	Fairly easy to read.
// 70.0–60.0 	8th & 9th grade 	Plain English. Easily understood by 13- to 15-year-old students.
// 60.0–50.0 	10th to 12th grade 	Fairly difficult to read.
// 50.0–30.0 	College 	Difficult to read.
// 30.0–10.0 	College graduate 	Very difficult to read. Best understood by university graduates.
// 10.0–0.0 	Professional 	Extremely difficult to read. Best understood by university graduates.
// https://en.wikipedia.org/wiki/Flesch%E2%80%93Kincaid_readability_tests
const fleschKincaidReadingEase = (text) => {
  const sentences = sentenceCount(text);
  const words = wordCount(text);
  const syllables = getWords(text)
    .map(syllableCount)
    .filter(Boolean)
    .reduce((acc, count) => acc + count, 0);

  return 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
};

// These equate the readability of the text to the US schools grade level system.
const fleschKincaidGradeLevel = (text) => {
  const sentences = sentenceCount(text);
  const words = wordCount(text);
  const syllables = getWords(text)
    .map((word) => syllableCount(word))
    .filter(Boolean)
    .reduce((acc, count) => acc + count, 0);

  return 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
};

/**
    Select a passage (such as one or more full paragraphs) of around 100 words. Do not omit any sentences;
    Determine the average sentence length. (Divide the number of words by the number of sentences.);
    Count the "complex" words consisting of three or more syllables. Do not include proper nouns, familiar jargon, or compound words. Do not include common suffixes (such as -es, -ed, or -ing) as a syllable;
    Add the average sentence length and the percentage of complex words; and
    Multiply the result by 0.4.
		*/

const gunningFogScore = (text) => {
  const complexWords = complexWordsCount(text);
  const sentences = sentenceCount(text);
  const words = wordCount(text);
  return 0.4 * (words / sentences + 100 * (complexWords / words));
};

// Count a number of sentences (at least 30)
// In those sentences, count the polysyllables (words of 3 or more syllables).
//Furthermore, tables for texts of fewer than 30 sentences are statistically invalid, because the formula was normed on 30-sentence samples.
const SMOGIndex = (text) => {
  const complexWords = complexWordsCount(text);
  const sentences = sentenceCount(text);

  return 1.043 * Math.sqrt(30 * (complexWords / sentences)) + 3.1291;
};

// L is the average number of letters per 100 words and S is the average number of sentences per 100 words.
//its output approximates the U.S. grade level thought necessary to comprehend the text.
const colemanLiauIndex = (text) => {
  const characters = characterCount(text);
  const words = wordCount(text);
  const sentences = sentenceCount(text);
  return 5.89 * (characters / words) - 0.3 * (sentences / words) - 15.8;
};

// 1 	5-6 	Kindergarten
// 2 	6-7 	First/Second Grade
// 3 	7-9 	Third Grade
// 4 	9-10 	Fourth Grade
// 5 	10-11 	Fifth Grade
// 6 	11-12 	Sixth Grade
// 7 	12-13 	Seventh Grade
// 8 	13-14 	Eighth Grade
// 9 	14-15 	Ninth Grade
// 10 	15-16 	Tenth Grade
// 11 	16-17 	Eleventh Grade
// 12 	17-18 	Twelfth grade
// 13 	18-24 	College student
// 14 	24+ 	Professor
const automatedReadabilityIndex = (text) => {
  const characters = characterCount(text);
  const words = wordCount(text);
  const sentences = sentenceCount(text);

  return 4.71 * (characters / words) + 0.5 * (words / sentences) - 21.43;
};

/**
 * @param word string
 */
const syllableCount = (word) => {
  const phones = pronouncing.phonesForWord(word);
  return pronouncing.syllableCount(phones) ?? 1;
};

const log = (t) => {
  console.log(t);

  return t;
};

const getWords = (text) => {
  return text.split(" ").map((t) => {
    return t.replace(/[.,)(]/, "");
  });
};

const characterCount = (text) => {
  const spacelessText = text.slice().replace(" ", "");

  return spacelessText.length;
};

const wordCount = (text) => {
  return getWords(text).length;
};

const getSentences = (text) => {
  return text.split(/[.!]\s/).map((t) => t.trim());
};
const sentenceCount = (text) => {
  return getSentences(text).length;
};

const complexWordsCount = (text) => {
  return getWords(text)
    .map(syllableCount)
    .filter((count) => count >= 3).length;
};

const extractContentFromHtml = (html) => {
  // if is node
  //
  const document = new jsdom.JSDOM().window.document;

  const div = document.createElement("div");

  div.innerHTML = html;

  // document.appendChild(div);

  return (
    div.textContent
      .split("\n")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      // Remove go template keys
      .filter((t) => t.substring(0, 2) !== "{{")
      .join(" ")
  );

  return new DOMParser().parseFromString(html, "text/html").documentElement
    .textContent;
};

/**
 * @param markdown string
 */
const extractTextFromMarkdown = (markdown) => {
  // remove front matter
  // console.log(markdown);

  // Remove frontmatter
  let text = markdown;
  if (markdown.substring(0, 3) === "---") {
    const lines = markdown.split("\n");

    let finishLines = [];
    let open = false;

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i];
      if (line === "---") {
        if (!open) {
          open = true;
          continue;
        } else {
          open = false;
          continue;
        }
      }

      if (open) {
        continue;
      }

      finishLines.push(line);
    }

    text = finishLines.join("\n");
  }

  const tokens = marked.lexer(text);

  return tokens
    .map(({ type, text }) => {
      if ((type !== "paragraph" && type !== "header") || !text) {
        return undefined;
      }

      const invalid = [
        text.includes("{{< rawhtml >}}"),
        text.trim().slice(0, 1) === "|",
      ].filter(Boolean);

      return invalid.length === 0 ? text : undefined;
    })
    .filter(Boolean)
    .join(" ");
};

const file = process.argv[3] ?? process.argv[2] ?? "testfile.md";

fs.readFile(file).then((data) => {
  //
  //
  const ext = path.extname(file);
  let text;
  if (ext === ".md") {
    text = extractTextFromMarkdown(data.toString("utf8").toLowerCase());
  } else {
    text = extractContentFromHtml(data.toString("utf8").toLowerCase());
  }
  // console.log(text);

  const sentences = getSentences(text);

  sentences.map((t) => console.log(t));

  const words = getWords(text);

  const sentencesCount = sentences.length;
  const wordsCount = words.length;
  const complexWords = complexWordsCount(text);
  console.log("sentences", sentencesCount);
  console.log("words", wordsCount);
  console.log("complex words", complexWords);
  console.log(
    "percent of complex words",
    `${((complexWords / wordsCount) * 100).toFixed(2)}%`
  );
  console.log(
    "average words per sentence",
    (wordsCount / sentencesCount).toFixed(2)
  );
  console.log(
    "syllables per word",
    (
      words
        .map(syllableCount)
        .filter(Boolean)
        .reduce((acc, num) => acc + num, 0) / wordsCount
    ).toFixed(2)
  );

  console.log(
    "ARI Automated Readability index",
    automatedReadabilityIndex(text).toFixed(2),
    "grade"
  );

  console.log("Coleman Liau Index", colemanLiauIndex(text).toFixed(2), "grade");

  console.log("SMOG index", SMOGIndex(text).toFixed(2), "grade");
  console.log("Gunning Fog Score", gunningFogScore(text).toFixed(2), "grade");
  console.log(
    "Flesch-Kincaid readability ease",
    fleschKincaidReadingEase(text).toFixed(2)
  );
  console.log(
    "Flesch-Kincaid grade level",
    fleschKincaidGradeLevel(text).toFixed(2),
    "grade"
  );
});
