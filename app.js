// How Many Words: the test flow.
// Scoring and ranking come in later steps; for now this records each answer.

const TOTAL = 100;   // words per test
const FAKES = 33;    // same mix as the study: 67 real, 33 made up
const MARK_DELAY = 180; // ms to show the highlighter swipe before moving on

let realWords = [];
let fakeWords = [];
let questions = [];  // [{ word, fake }]
let answers = [];    // true = "I know it", false = "Not sure"
let pending = null;  // timer for the highlight animation before the next word

const $ = (id) => document.getElementById(id);
const screens = { intro: $("intro"), test: $("test"), done: $("done") };

function show(name) {
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
}

async function loadWords() {
  try {
    const [real, fake] = await Promise.all([
      fetch("data/words.txt").then(checkOk),
      fetch("data/fake-words.txt").then(checkOk),
    ]);
    realWords = real.split("\n").filter(Boolean);
    fakeWords = fake.split("\n").filter(Boolean);
    $("start").disabled = false;
    $("start").textContent = "Start the test";
  } catch (err) {
    $("start").textContent = "Couldn't load words";
    $("load-error").hidden = false;
    $("load-error").textContent =
      "The word list didn't load. Check your connection and reload the page.";
    console.error(err);
  }
}

function checkOk(res) {
  if (!res.ok) throw new Error(`${res.url} returned ${res.status}`);
  return res.text();
}

// Pick `n` different items at random.
function pick(list, n) {
  const chosen = new Set();
  while (chosen.size < n) chosen.add(list[Math.floor(Math.random() * list.length)]);
  return [...chosen];
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function startTest() {
  questions = shuffle([
    ...pick(realWords, TOTAL - FAKES).map((word) => ({ word, fake: false })),
    ...pick(fakeWords, FAKES).map((word) => ({ word, fake: true })),
  ]);
  answers = [];
  buildTicks();
  show("test");
  render();
}

function buildTicks() {
  const ticks = $("ticks");
  ticks.innerHTML = "";
  for (let i = 0; i < TOTAL; i++) {
    const t = document.createElement("span");
    t.className = "tick";
    ticks.appendChild(t);
  }
}

function render() {
  const i = answers.length;
  const wordEl = $("word");
  wordEl.classList.remove("marked");
  wordEl.textContent = questions[i].word;
  wordEl.style.setProperty("--len", questions[i].word.length);
  $("counter").textContent = `Word ${i + 1} of ${TOTAL}`;
  $("undo").disabled = i === 0;

  [...$("ticks").children].forEach((t, n) => {
    t.className = "tick";
    if (n < i) t.classList.add(answers[n] ? "known" : "answered");
    if (n === i) t.classList.add("current");
  });
}

// If a highlight animation is still playing, end it now so no press is lost.
function finishPending() {
  if (!pending) return;
  clearTimeout(pending);
  pending = null;
  advance();
}

function advance() {
  if (answers.length === TOTAL) finish();
  else render();
}

function answer(known) {
  if (screens.test.hidden) return;
  finishPending();
  if (screens.test.hidden) return; // that press finished the test
  answers.push(known);

  if (known && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    $("word").classList.add("marked");
    pending = setTimeout(() => { pending = null; advance(); }, MARK_DELAY);
  } else {
    advance();
  }
}

function undo() {
  finishPending();
  if (screens.test.hidden || answers.length === 0) return;
  answers.pop();
  render();
}

// Age ranges on the results screen. Each compares with the middle age of
// the range; the study measured only 20- and 60-year-olds (see scoring.js).
const AGE_RANGES = [
  { label: "Under 25", age: 20, group: "people under 25",
    note: "The study's youngest group is 20-year-olds, so you're compared with them." },
  { label: "25–34", age: 30, group: "people aged 25–34",
    note: "The study measured 20- and 60-year-olds, so this compares you with an estimate for 30-year-olds." },
  { label: "35–44", age: 40, group: "people aged 35–44",
    note: "The study measured 20- and 60-year-olds, so this compares you with an estimate for 40-year-olds." },
  { label: "45–54", age: 50, group: "people aged 45–54",
    note: "The study measured 20- and 60-year-olds, so this compares you with an estimate for 50-year-olds." },
  { label: "55+", age: 60, group: "people 55 and over",
    note: "The study's oldest group is 60-year-olds, so you're compared with them." },
];

let lastScore = null;    // kept so the comparison can redraw when age changes
let chosenRange = null;  // remembered across tests in this visit

function buildAgeOptions() {
  const box = $("age-options");
  AGE_RANGES.forEach((r, i) => {
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "age-range";
    input.id = `age-${i}`;
    input.value = i;
    const label = document.createElement("label");
    label.htmlFor = input.id;
    label.textContent = r.label;
    input.addEventListener("change", () => {
      chosenRange = AGE_RANGES[i];
      if (lastScore) showComparison(lastScore, chosenRange);
    });
    box.append(input, label);
  });
}

function showComparison(s, range) {
  const fmt = (n) => n.toLocaleString("en-US");
  const bench = benchmarkFor(range ? range.age : 20);
  const group = range ? range.group : "20-year-olds";
  const pct = percentileFor(s.estimate, bench);

  $("compare-headline").textContent = `You know more words than about ${pct}% of ${group}.`;

  // Where the player sits on a bar from 0 to the full list.
  const max = STUDY_LIST_SIZE;
  const at = (n) => `${(Math.min(n, max) / max) * 100}%`;
  $("scale-band").style.left = at(bench.p5);
  $("scale-band").style.width = `calc(${at(bench.p95)} - ${at(bench.p5)})`;
  $("scale-median").style.left = at(bench.p50);
  $("scale-you").style.left = at(s.estimate);
  $("scale-p5").textContent = fmt(bench.p5);
  $("scale-p50").textContent = fmt(bench.p50);
  $("scale-p95").textContent = fmt(bench.p95);
  $("scale-p5").style.left = at(bench.p5);
  $("scale-p50").style.left = at(bench.p50);
  $("scale-p95").style.left = at(bench.p95);

  $("compare-text").textContent =
    `A typical person in this group knows about ${fmt(bench.p50)} words. ` +
    `The shaded band runs from ${fmt(bench.p5)} (bottom 5%) to ${fmt(bench.p95)} (top 5%). ` +
    (range ? range.note : "Pick your age range to compare with your own age group.");
}

function finish() {
  const s = score(questions, answers);
  const fmt = (n) => n.toLocaleString("en-US");

  $("done-count").textContent = fmt(s.estimate);
  $("done-text").textContent =
    `words you know, out of the ${fmt(STUDY_LIST_SIZE)} in the study's list (${s.percentOfList}%).`;
  lastScore = s;
  showComparison(s, chosenRange);

  $("done-range").hidden = s.high === 0;
  $("done-range").textContent =
    `Likely between ${fmt(s.low)} and ${fmt(s.high)}. ` +
    `A ${TOTAL - FAKES}-word sample can't pin it down more closely.`;

  $("done-warning").hidden = s.reliable;
  $("done-warning").textContent =
    `You claimed ${s.fakeClaimed} of the ${s.fakeTotal} made-up words, so this score ` +
    `isn't reliable. Try again and mark only words you could explain.`;

  // Show the made-up words, marking the ones the player claimed.
  $("fakes-title").textContent = s.fakeClaimed === 0
    ? `${s.fakeTotal} words were made up. You didn't claim any.`
    : `${s.fakeTotal} words were made up. You claimed ${s.fakeClaimed}, which lowered your score.`;
  const list = $("fake-list");
  list.innerHTML = "";
  questions.forEach((q, n) => {
    if (!q.fake) return;
    const li = document.createElement("li");
    li.textContent = q.word;
    if (answers[n]) {
      li.className = "claimed";
      li.setAttribute("aria-label", `${q.word}, you claimed this one`);
    }
    list.appendChild(li);
  });

  show("done");
  window.scrollTo(0, 0);
}

$("start").addEventListener("click", startTest);
$("again").addEventListener("click", startTest);
$("know").addEventListener("click", () => answer(true));
$("unsure").addEventListener("click", () => answer(false));
$("undo").addEventListener("click", undo);

document.addEventListener("keydown", (e) => {
  if (screens.test.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "ArrowRight") { e.preventDefault(); answer(true); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); answer(false); }
  else if (e.key === "Backspace") { e.preventDefault(); undo(); }
});

buildAgeOptions();
loadWords();
