// How Many Words: scoring, matched to the study the game compares against.
//
// Brysbaert, Stevens, Mandera & Keuleers (2016). "How Many Words Do We Know?"
// Frontiers in Psychology 7:1116. https://doi.org/10.3389/fpsyg.2016.01116
//
// Their test showed 67 real words and 33 made-up ones, and scored
//   share known = (share of real words claimed) - (share of fakes claimed)
// then multiplied by the 61,800 words on their list. We do the same, so a
// player's number means the same thing as the study's numbers.

const STUDY_LIST_SIZE = 61800;
const UNRELIABLE_FAKES = 5; // claiming this many fakes or more flags the score

// Table 4 of the study: words known by native speakers of American English.
// p5 = bottom 5%, p50 = median, p95 = top 5%.
const BENCHMARKS = {
  20: { p5: 27100, p50: 42000, p95: 51700 },
  60: { p5: 35100, p50: 48200, p95: 56400 },
};

function score(questions, answers) {
  let realTotal = 0, realKnown = 0, fakeTotal = 0, fakeClaimed = 0;
  questions.forEach((q, i) => {
    if (q.fake) { fakeTotal++; if (answers[i]) fakeClaimed++; }
    else { realTotal++; if (answers[i]) realKnown++; }
  });

  const realRate = realKnown / realTotal;
  const fakeRate = fakeClaimed / fakeTotal;
  const share = clamp01(realRate - fakeRate);

  // Likely range (95%): the test only samples 67 words, so the real share
  // could be a bit higher or lower. Wilson interval, same correction applied.
  const [low, high] = wilson(realKnown, realTotal).map((r) => clamp01(r - fakeRate));

  return {
    estimate: roundTo(share * STUDY_LIST_SIZE, 100),
    low: roundTo(low * STUDY_LIST_SIZE, 1000),
    high: Math.min(roundTo(high * STUDY_LIST_SIZE, 1000), STUDY_LIST_SIZE),
    percentOfList: Math.round(share * 100),
    realKnown, realTotal, fakeClaimed, fakeTotal,
    reliable: fakeClaimed < UNRELIABLE_FAKES,
  };
}

// The study only reports ages 20 and 60. For ages in between, we assume
// steady change and estimate between the two rows. Younger players are
// compared with 20-year-olds and older players with 60-year-olds.
function benchmarkFor(age) {
  const a = Math.min(60, Math.max(20, age));
  const t = (a - 20) / 40;
  const mix = (k) => roundTo(BENCHMARKS[20][k] + t * (BENCHMARKS[60][k] - BENCHMARKS[20][k]), 100);
  return { age: a, p5: mix("p5"), p50: mix("p50"), p95: mix("p95") };
}

// Estimated share of the age group that knows fewer words than `words`.
// The study gives only three points (bottom 5%, median, top 5%), so we fill
// in the curve with a bell shape that is wider on the low side, matching how
// those three points are spread. Returns a whole-number percent, 1 to 99.
function percentileFor(words, bench) {
  const Z95 = 1.645; // distance from the median to the 5% and 95% points
  const spread = words < bench.p50
    ? (bench.p50 - bench.p5) / Z95
    : (bench.p95 - bench.p50) / Z95;
  const p = normalCdf((words - bench.p50) / spread) * 100;
  return Math.min(99, Math.max(1, Math.round(p)));
}

function normalCdf(z) {
  // Abramowitz & Stegun 7.1.26 approximation of the error function.
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 +
    t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x);
  return 0.5 * (1 + (z < 0 ? -erf : erf));
}

function wilson(successes, n, z = 1.96) {
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const spread = (z / denom) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [center - spread, center + spread];
}

function clamp01(x) { return Math.min(1, Math.max(0, x)); }
function roundTo(n, step) { return Math.round(n / step) * step; }

// Lets the test script load this file outside the browser.
if (typeof module !== "undefined") {
  module.exports = { score, benchmarkFor, percentileFor, STUDY_LIST_SIZE };
}
