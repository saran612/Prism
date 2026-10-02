import React, { useState, useMemo } from 'react';

// Seeded deterministic generator to reliably produce 380 realistic claims across the 3 metrics:
// 1. "True" (55 claims) - Olive / Yellow-green dots
// 2. "False" (125 claims) - Purple-blue dots
// 3. "llm_inferred" (200 claims) - Light gray background cloud dots
function createSeededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const TRUE_HEADLINES = [
  "James Webb Telescope detects water vapor on temperate exoplanet LHS 1140 b",
  "ISRO Aditya-L1 spacecraft completes halo orbit insertion at Sun-Earth L1",
  "European Parliament formally passes binding Artificial Intelligence Safety Act",
  "Global solar power generation capacity crosses 1.6 terawatt worldwide milestone",
  "Quantum computing research team demonstrates topological fault-tolerant logical qubits",
  "DeepSeek open-sources multimodal reasoning architecture with native model weights",
  "Nordic electric grid achieves record 92 percent fossil-free electricity generation",
  "Genomics consortium releases first complete telomere-to-telomere human genome map",
  "Commercial autonomous electric semi-trucks achieve safety certification across EU",
  "Reserve Bank of India expands cross-border UPI digital payment connectivity",
  "Researchers create ultra-fast photonic interconnect for energy-efficient AI clusters",
  "Breakthrough solid-state battery completes 1000-cycle automotive stress durability test",
  "NASA Artemis mission certifies lunar gateway environmental life support module",
  "Subsea optical fiber cable links Chennai, Andaman, and Singapore regional hubs",
  "Scientists discover massive freshwater aquifer buried beneath Atlantic continental shelf",
  "CERN particle physics laboratory extends antihydrogen atom magnetic confinement record",
  "Biomedical lab synthesizes enzymatic universal donor red blood cells",
  "Major airlines sign long-term supply agreement for certified sustainable aviation fuel",
  "Japan Aerospace Exploration Agency successfully launches next-gen greenhouse satellite",
  "South Korea deploys commercial low-Earth orbit satellite on domestic carrier rocket",
  "Marine biologists map 120 previously undocumented deep-sea coral species",
  "Renewable generation exceeds fossil fuel output across European grid in first quarter",
  "Autonomous drone medical supply delivery network expands across rural Texas counties",
  "International consortium establishes unified post-quantum cryptography standards",
  "Neuroscience institute demonstrates high-bandwidth wireless brain-computer interface"
];

const FALSE_HEADLINES = [
  "Drinking household bleach and colloidal silver cures acute coronavirus disease",
  "5G cellular network towers transmit respiratory pandemic viral infections",
  "COVID-19 vaccines contain clandestine RFID tracking microchips and liquid antennas",
  "NASA announces massive asteroid collision will irrevocably destroy Earth next month",
  "The Earth is stationary and enclosed by a thousand-foot impenetrable Antarctic ice wall",
  "Barack Obama was born in Kenya and forged official birth documentation",
  "Pope Francis formally endorsed political candidate during general election",
  "Great Wall of China is clearly visible from the Moon with the unaided human eye",
  "Albert Einstein repeatedly failed elementary high school mathematics curriculum",
  "Humans only utilize ten percent of their active neurological brain capacity",
  "Chewing gum remains lodged in the human digestive stomach tract for seven years",
  "Bulls are violently provoked into aggression exclusively by the physical color red",
  "Dropping a copper penny from Empire State Building achieves fatal terminal velocity",
  "Blood inside human veins is deoxygenated blue before contacting outside atmospheric air",
  "Fingernails and human hair continue active cellular growth after biological death",
  "Touching baby songbirds causes mother birds to permanently abandon their nesting brood",
  "Caffeine intake causes severe clinical dehydration and dangerous electrolyte depletion",
  "Monosodium glutamate causes severe neurological allergic syndrome in human diet",
  "Cracking knuckle joints causes progressive degenerative osteoarthritis in hands",
  "Shaving facial hair causes hair follicles to regenerate significantly thicker and darker",
  "Swallowing watermelon seeds causes vegetative plant germination within intestinal wall",
  "Lightning bolts never discharge onto the same geographical landmark more than once",
  "Goldfish possess an acute short-term memory retention span of merely three seconds",
  "Bats are completely blind mammals that navigate solely through auditory echolocation",
  "Swimming immediately following meal consumption causes fatal involuntary muscle cramps",
  "Napoleon Bonaparte was of unusually diminutive physical height compared to contemporaries",
  "Chameleons alter physical skin coloration solely to camouflage against their immediate background",
  "Mount Everest is the tallest mountain from geophysical base to peak elevation on Earth",
  "Drinking raw unpasteurized milk permanently cures chronic type-one and type-two diabetes",
  "Sunflowers physically rotate their heads from east to west every hour of every day",
  "Statue of Liberty was permanently relocated from New York Harbor to Jersey City shoreline",
  "Consuming large quantities of raw carrots bestows superhuman night vision abilities",
  "Sharks are genetically immune from ever developing cellular oncological tumors",
  "Vitamin C supplementation prevents human subjects from contracting the common cold virus"
];

const INFERRED_HEADLINES = [
  "Tech conglomerate pledges expansion of domestic high-bandwidth memory semiconductor fabs",
  "Regional power grid authority commissions 250-megawatt utility battery storage array",
  "Agricultural drone consortium completes precision nitrogen fertilizer field mapping",
  "Municipal transit department introduces hydrogen-powered zero-emission commercial buses",
  "Biotechnology startup advances synthetic peptide antivenom candidate to phase two trials",
  "Subsea telecom cable operator adds terrestrial backhaul link to regional data centers",
  "Geothermal energy venture extracts commercial-grade lithium from brine extraction wells",
  "Urban planning commission approves retrofitting municipal fleet with autonomous sensors",
  "International maritime organization votes to adopt progressive carbon intensity indexing",
  "Robotics firm introduces dual-arm automated parcel sorting system in distribution center",
  "National laboratory synthesizes room-temperature magnetic material under ambient pressure",
  "Electric heavy machinery manufacturer delivers battery-powered excavators to mining site",
  "Atmospheric scientists deploy high-altitude balloons for stratospheric aerosol monitoring",
  "Financial consortium tests distributed settlement infrastructure for cross-currency bonds",
  "Oceanographic expedition discovers hydrothermal vent field along central oceanic ridge",
  "Pharmaceutical company expands pediatric vaccine formulation cold-chain distribution",
  "Aerospace firm achieves engine hot-fire milestone for reusable orbital second stage",
  "Smart grid operator integrates edge machine learning for real-time load balancing",
  "Environmental agency restores 5000 hectares of degraded mangrove wetlands along coast",
  "Telecommunications carrier expands direct-to-device satellite messaging coverage",
  "Materials science team creates biodegradable cellulose alternative to single-use plastics",
  "Public university inaugurates regional clean energy research and incubation facility",
  "Civil aviation authority certifies composite turboprop engine for regional commuter routes",
  "Water management district deploys automated acoustic sensors for underground pipe leaks",
  "Logistics network expands refrigerated shipping capacity across intermodal rail freight"
];

// Generate 380 realistic claims (55 True, 125 False, 200 llm_inferred)
function generatePrismClaims() {
  const rng = createSeededRandom(42);
  const items = [];
  let id = 1;

  // 1. True Claims (55 data points, olive-green dots)
  for (let i = 0; i < 55; i++) {
    const text = TRUE_HEADLINES[i % TRUE_HEADLINES.length] + (i >= TRUE_HEADLINES.length ? ` (Cohort ${Math.floor(i / TRUE_HEADLINES.length) + 1})` : '');
    const ev = Math.max(2, Math.min(48, Math.round(4 + rng() * 32 + (rng() > 0.65 ? 10 : 0))));
    const sc = Math.max(68, Math.min(99, Math.round(74 + ev * 0.45 + (rng() - 0.5) * 12)));
    items.push({
      id: id++,
      text,
      metric: 'True',
      source: 'known_factcheck',
      state: 'True',
      score: sc,
      evidence: ev
    });
  }

  // 2. False Claims (125 data points, purple-blue dots)
  for (let i = 0; i < 125; i++) {
    const text = FALSE_HEADLINES[i % FALSE_HEADLINES.length] + (i >= FALSE_HEADLINES.length ? ` (Case #${i + 1})` : '');
    const ev = Math.max(2, Math.min(44, Math.round(3 + rng() * 26 + (rng() > 0.75 ? 12 : 0))));
    const sc = Math.max(65, Math.min(98, Math.round(72 + ev * 0.5 + (rng() - 0.5) * 14)));
    items.push({
      id: id++,
      text,
      metric: 'False',
      source: 'known_factcheck',
      state: 'False',
      score: sc,
      evidence: ev
    });
  }

  // 3. LLM Inferred Claims (200 data points, light gray background cloud dots)
  for (let i = 0; i < 200; i++) {
    const text = INFERRED_HEADLINES[i % INFERRED_HEADLINES.length] + (i >= INFERRED_HEADLINES.length ? ` (Ref #${i + 1})` : '');
    const ev = Math.max(1, Math.min(28, Math.round(1 + rng() * 16 + (rng() > 0.8 ? 8 : 0))));
    const sc = Math.max(35, Math.min(92, Math.round(48 + ev * 1.35 + (rng() - 0.5) * 22)));
    items.push({
      id: id++,
      text,
      metric: 'llm_inferred',
      source: 'llm_inferred',
      state: sc > 65 ? 'Verified' : 'Evaluating',
      score: sc,
      evidence: ev
    });
  }

  return items;
}

const STATIC_PRISM_CLAIMS = generatePrismClaims();

function calculateMedian(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export default function ScatterPlotAnalytics({ customData = null }) {
  const data = customData || STATIC_PRISM_CLAIMS;
  const [hoveredPoint, setHoveredPoint] = useState(null);

  // Group by the 3 requested metrics: "True", "False", and "llm_inferred"
  const groups = useMemo(() => {
    const trues = data.filter((d) => d.metric === 'True' || (d.source === 'known_factcheck' && d.state === 'True'));
    const falses = data.filter((d) => d.metric === 'False' || (d.source === 'known_factcheck' && d.state === 'False'));
    const inferred = data.filter((d) => d.metric === 'llm_inferred' || d.source === 'llm_inferred');

    return {
      trues: {
        label: 'True',
        color: '#C2DD38', // Olive / Yellow-green matching reference
        border: '#666666', // Neutral gray border
        items: trues,
        medianScore: calculateMedian(trues.map((d) => d.score)),
        count: trues.length
      },
      falses: {
        label: 'False',
        color: '#7066E0', // Purple-blue matching reference
        border: '#5245B8',
        items: falses,
        medianScore: calculateMedian(falses.map((d) => d.score)),
        count: falses.length
      },
      inferred: {
        label: 'llm_inferred',
        color: '#B0B0B0', // Light gray background category matching reference
        border: '#888888',
        items: inferred,
        medianScore: calculateMedian(inferred.map((d) => d.score)),
        count: inferred.length
      }
    };
  }, [data]);

  // Overall median score for the dashed reference line
  const overallMedianScore = useMemo(() => {
    return calculateMedian(data.map((d) => d.score));
  }, [data]);

  // SVG Chart Geometry
  const SVG_WIDTH = 960;
  const SVG_HEIGHT = 480;
  const PADDING = { top: 38, right: 38, bottom: 44, left: 48 };

  const plotWidth = SVG_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = SVG_HEIGHT - PADDING.top - PADDING.bottom;

  // Log scale for X axis: log10(evidence)
  // X values range from 1 to 50
  const MIN_EVIDENCE = 1;
  const MAX_EVIDENCE = 50;
  const LOG_MIN = Math.log10(MIN_EVIDENCE); // 0
  const LOG_MAX = Math.log10(MAX_EVIDENCE); // ~1.69897

  const getX = (evidence) => {
    const clamped = Math.max(MIN_EVIDENCE, Math.min(MAX_EVIDENCE, evidence));
    const logVal = Math.log10(clamped);
    return PADDING.left + ((logVal - LOG_MIN) / (LOG_MAX - LOG_MIN)) * plotWidth;
  };

  // Linear scale for Y axis: score 0 to 100
  const getY = (score) => {
    const clamped = Math.max(0, Math.min(100, score));
    return PADDING.top + plotHeight - (clamped / 100) * plotHeight;
  };

  // Major Ticks
  const xTicks = [1, 2, 5, 10, 20, 50];
  const yTicks = [0, 20, 40, 60, 80, 100];

  const medianY = getY(overallMedianScore);

  return (
    <div className="prism-scatter-card">
      {/* Reference Single-Line Monospace Title (Top-Left) */}
      <div className="prism-scatter-header">
        <div className="prism-scatter-title">
          THE PICTURE: EVERY CLAIM CHECKED, EVIDENCE ACROSS, SCORE UP
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div className="prism-graph-paper-container">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="prism-scatter-svg"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Chart Background */}
          <rect
            x={PADDING.left}
            y={PADDING.top}
            width={plotWidth}
            height={plotHeight}
            fill="#FFFFFF"
          />

          {/* Major Vertical Gridlines */}
          {xTicks.map((tick) => {
            const x = getX(tick);
            return (
              <line
                key={`x-grid-${tick}`}
                x1={x}
                y1={PADDING.top}
                x2={x}
                y2={PADDING.top + plotHeight}
                stroke="#EAEAEA"
                strokeWidth="1"
              />
            );
          })}

          {/* Major Horizontal Gridlines */}
          {yTicks.map((tick) => {
            const y = getY(tick);
            return (
              <line
                key={`y-grid-${tick}`}
                x1={PADDING.left}
                y1={y}
                x2={PADDING.left + plotWidth}
                y2={y}
                stroke="#EAEAEA"
                strokeWidth="1"
              />
            );
          })}

          {/* REFERENCE THRESHOLD LINE: Dashed line across chart */}
          <line
            x1={PADDING.left}
            y1={medianY}
            x2={PADDING.left + plotWidth}
            y2={medianY}
            stroke="#111111"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            className="prism-reference-line"
          />

          {/* Reference Line Label (matched to deal median 839 views style: bold, sits directly ON the line, left-aligned) */}
          <text
            x={PADDING.left + 16}
            y={medianY - 6}
            className="prism-mono-ref-text"
          >
            claim median {overallMedianScore} score
          </text>

          {/* Outer Border */}
          <rect
            x={PADDING.left}
            y={PADDING.top}
            width={plotWidth}
            height={plotHeight}
            fill="none"
            stroke="#DCDCDC"
            strokeWidth="1"
          />

          {/* "score ↑" Arrow Label (Sits inside plot at top-left, matching "likes ↑") */}
          <text
            x={PADDING.left + 16}
            y={PADDING.top + 24}
            className="prism-mono-axis-arrow-label"
          >
            score ↑
          </text>

          {/* "evidence →" Arrow Label (Sits inside plot at bottom-right, matching "views →") */}
          <text
            x={PADDING.left + plotWidth - 16}
            y={PADDING.top + plotHeight - 14}
            textAnchor="end"
            className="prism-mono-axis-arrow-label"
          >
            evidence →
          </text>

          {/* X Axis Tick Numbers */}
          {xTicks.map((tick) => {
            const x = getX(tick);
            return (
              <text
                key={`x-tick-${tick}`}
                x={x}
                y={PADDING.top + plotHeight + 20}
                textAnchor="middle"
                className="prism-mono-axis-tick"
              >
                {tick}
              </text>
            );
          })}

          {/* Y Axis Tick Numbers */}
          {yTicks.map((tick) => {
            const y = getY(tick);
            return (
              <text
                key={`y-tick-${tick}`}
                x={PADDING.left - 10}
                y={y + 4}
                textAnchor="end"
                className="prism-mono-axis-tick"
              >
                {tick}
              </text>
            );
          })}

          {/* LAYER 1: Metric 3 (Light Gray Dots - llm_inferred Background Cloud) */}
          {groups.inferred.items.map((pt) => {
            const cx = getX(pt.evidence);
            const cy = getY(pt.score);
            const isHovered = hoveredPoint?.id === pt.id;

            return (
              <circle
                key={`inferred-${pt.id}`}
                cx={cx}
                cy={cy}
                r={isHovered ? 6 : 3.8}
                fill={groups.inferred.color}
                stroke={groups.inferred.border}
                strokeWidth={isHovered ? 1.5 : 0.8}
                opacity={isHovered ? 1 : 0.62}
                className="prism-scatter-dot"
                onMouseEnter={() => setHoveredPoint(pt)}
                onMouseLeave={() => setHoveredPoint(null)}
              />
            );
          })}

          {/* LAYER 2: Metric 2 (Purple-Blue Dots - False Claims) */}
          {groups.falses.items.map((pt) => {
            const cx = getX(pt.evidence);
            const cy = getY(pt.score);
            const isHovered = hoveredPoint?.id === pt.id;

            return (
              <circle
                key={`false-${pt.id}`}
                cx={cx}
                cy={cy}
                r={isHovered ? 7.5 : 5.2}
                fill={groups.falses.color}
                stroke={groups.falses.border}
                strokeWidth={isHovered ? 1.8 : 1}
                opacity={isHovered ? 1 : 0.85}
                className="prism-scatter-dot"
                onMouseEnter={() => setHoveredPoint(pt)}
                onMouseLeave={() => setHoveredPoint(null)}
              />
            );
          })}

          {/* LAYER 3: Metric 1 (Olive Green Dots with Dark Outline - True Claims on Foreground) */}
          {groups.trues.items.map((pt) => {
            const cx = getX(pt.evidence);
            const cy = getY(pt.score);
            const isHovered = hoveredPoint?.id === pt.id;

            return (
              <circle
                key={`true-${pt.id}`}
                cx={cx}
                cy={cy}
                r={isHovered ? 8.8 : 6.8}
                fill={groups.trues.color}
                stroke={groups.trues.border}
                strokeWidth={isHovered ? 2.2 : 1.6}
                opacity={isHovered ? 1 : 0.95}
                className="prism-scatter-dot"
                onMouseEnter={() => setHoveredPoint(pt)}
                onMouseLeave={() => setHoveredPoint(null)}
              />
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredPoint && (
          <div
            className="prism-scatter-tooltip"
            style={{
              left: `${(getX(hoveredPoint.evidence) / SVG_WIDTH) * 100}%`,
              top: `${(getY(hoveredPoint.score) / SVG_HEIGHT) * 100}%`
            }}
          >
            <div className="prism-tooltip-top">
              <span className={`prism-tooltip-badge ${hoveredPoint.metric}`}>
                {hoveredPoint.metric}
              </span>
              <span className="prism-tooltip-state">
                {hoveredPoint.state}
              </span>
            </div>
            <div className="prism-tooltip-text">
              "{hoveredPoint.text}"
            </div>
            <div className="prism-tooltip-meta">
              <span>Evidence: <strong>{hoveredPoint.evidence} sources</strong></span>
              <span>Score: <strong>{hoveredPoint.score}/100</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* Reference Legend: ONE horizontal row at the bottom with the 3 metrics */}
      <div className="prism-scatter-legend">
        <div className="prism-legend-item">
          <span className="prism-legend-dot olive"></span>
          <span className="prism-legend-text">
            "{groups.trues.label}" <span className="prism-legend-stats">({groups.trues.count} claims, {groups.trues.medianScore} median score)</span>
          </span>
        </div>

        <div className="prism-legend-item">
          <span className="prism-legend-dot purple"></span>
          <span className="prism-legend-text">
            "{groups.falses.label}" <span className="prism-legend-stats">({groups.falses.count} claims, {groups.falses.medianScore} median score)</span>
          </span>
        </div>

        <div className="prism-legend-item">
          <span className="prism-legend-dot gray"></span>
          <span className="prism-legend-text">
            "{groups.inferred.label}" <span className="prism-legend-stats">({groups.inferred.count} claims, {groups.inferred.medianScore} median score)</span>
          </span>
        </div>
      </div>
    </div>
  );
}
