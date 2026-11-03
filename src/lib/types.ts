export type AuthType = 'email' | 'phone' | 'guest';

export interface UserProfile {
  id: string;
  authType: AuthType;
  identifier: string;
  createdAt?: string;
  lastActiveAt?: string;
}

export type GoalType =
  | 'Articulation'
  | 'Storytelling'
  | 'Presentations'
  | 'Stakeholder communication'
  | 'Leadership communication'
  | 'Persuasion'
  | string;

export type AttemptType = 'baseline' | 'practice_1' | 'practice_2';

// Layer A: Core Communication Skills (1-5 scale)
export interface Scores {
  clarity: number;
  structure: number;
  conciseness: number;
}

// Layer C: PM Decision Communication Intelligence (1-5 scale, context-aware)
export interface PMDecisionDimensionScore {
  applicable: boolean;
  score?: number; // 1-5 when applicable
  rationale: string;
  evidenceQuote?: string; // verbatim quote from user's response
  improvementSuggestion?: string; // focused actionable guidance
}

export interface PMDecisionScores {
  isDecisionScenario: boolean;
  decisionClarity: PMDecisionDimensionScore;
  supportingEvidence: PMDecisionDimensionScore;
  tradeoffArticulation: PMDecisionDimensionScore;
  businessImpact: PMDecisionDimensionScore;
  overallDecisionRating?: number; // 1-5 average across applicable dimensions
  overallRationale?: string;
}

// Layer B: Goal-Specific Effectiveness (1-5 scale)
export interface GoalCriteriaResult {
  criterion: string;
  status: 'met' | 'partially_met' | 'missed';
  note: string;
}

export interface GoalEffectiveness {
  goal: string;
  score: number; // 1-5
  rationale: string;
  criteriaResults?: GoalCriteriaResult[];
}

// Scenario Alignment (1-5 scale)
export interface RequiredScenarioElement {
  element: string;
  addressed: boolean;
  evidence?: string;
}

export interface ScenarioAlignment {
  score: number; // 1-5
  rationale: string;
  requiredElements?: RequiredScenarioElement[];
}

export interface Highlight {
  quote: string;
  issue: string;
  suggestion: string;
}

export interface Technique {
  name: string;
  steps: string[];
  example: string;
}

export interface PracticePlan {
  minutes: number;
  frequency: number;
}

// Evidence-Based 4-Part Coaching Structure
export interface EvidenceCoaching {
  whatWorked: {
    summary: string;
    quote: string;
    impact: string;
  };
  whatNeedsWork: {
    summary: string;
    quote: string;
    audienceImpact: string;
    missingElements?: string[];
    betterVersion?: string;
  };
  primaryImprovementArea: string;
  technique: Technique;
  nextChallenge: {
    title: string;
    exercise: string;
    sentenceStarter: string;
  };
}

// Structured AI Response conforming to Section 8
export interface StructuredAIResponse {
  attempt_id?: string;
  goal: string;
  scenario_alignment: {
    score: number;
    rationale: string;
    required_elements?: Array<{ element: string; addressed: boolean; evidence?: string }>;
  };
  scores: {
    clarity: number;
    structure: number;
    conciseness: number;
    goal_effectiveness?: number;
  };
  score_explanations: {
    clarity: string;
    structure: string;
    conciseness: string;
    scenario_alignment?: string;
    goal_effectiveness?: string;
  };
  strengths: Array<{
    quote: string;
    impact: string;
  }>;
  improvement_areas: Array<{
    quote: string;
    audience_impact: string;
    missing_elements?: string[];
  }>;
  focus_area: 'clarity' | 'structure' | 'conciseness';
  coaching_technique: string;
  coaching_steps: string[];
  contextual_example: string;
  next_exercise: {
    title: string;
    exercise: string;
    sentence_starter: string;
  };
  // Comparison fields (optional when evaluating single attempt)
  meaning_preserved?: boolean;
  dimension_changes?: Record<string, {
    original_score: number;
    revised_score: number;
    change: number;
    classification: 'improved' | 'similar' | 'declined';
    explanation: string;
  }>;
  overall_insight?: string;
}

export interface MentorAssessRequest {
  mode: 'assess';
  goal: GoalType;
  audience: string;
  scenario: string;
  transcript: string;
  scenarioMode?: 'vira' | 'mine';
  attemptType?: AttemptType;
}

export interface MentorAssessResponse {
  attemptId?: string;
  scores: Scores; // Layer A
  scoreExplanations?: {
    clarity: string;
    structure: string;
    conciseness: string;
    scenarioAlignment?: string;
    goalEffectiveness?: string;
    decisionClarity?: string;
    supportingEvidence?: string;
    tradeoffArticulation?: string;
    businessImpact?: string;
  };
  goalEffectiveness: GoalEffectiveness; // Layer B
  scenarioAlignment: ScenarioAlignment; // Prompt requirement fulfillment
  pmDecisionScores?: PMDecisionScores; // Layer C: Product Decision Communication Intelligence
  strongest: 'clarity' | 'structure' | 'conciseness';
  focus: 'clarity' | 'structure' | 'conciseness';
  focusExplanation: string;
  highlights: Highlight[];
  technique: Technique;
  exercise: string;
  evidenceCoaching: EvidenceCoaching;
  provider?: string;
  model?: string;
}

export interface DimensionComparison {
  dimension: 'clarity' | 'structure' | 'conciseness' | 'goalEffectiveness' | 'scenarioAlignment' | string;
  originalScore: number;
  revisedScore: number;
  change: number;
  classification: 'improved' | 'similar' | 'declined';
  explanation: string;
  baselineQuote?: string;
  retryQuote?: string;
  // Support for 3-attempt comparison (Baseline -> Practice 1 -> Practice 2)
  practice1Score?: number;
  practice2Score?: number;
  trend?: 'improved' | 'similar' | 'declined';
}

export interface MultiAttemptProgressRow {
  skill: string;
  baseline: number;
  practice1?: number;
  practice2?: number;
  trend: 'improved' | 'similar' | 'declined';
  change: number;
}

export interface MentorCompareRequest {
  mode: 'compare';
  goal: GoalType;
  audience: string;
  scenario: string;
  firstTranscript: string;
  secondTranscript: string;
  thirdTranscript?: string; // Optional Practice 2 attempt
  focus: 'clarity' | 'structure' | 'conciseness' | string;
  firstScores: Scores;
  firstGoalEffectiveness?: GoalEffectiveness;
  firstScenarioAlignment?: ScenarioAlignment;
  firstPmDecisionScores?: PMDecisionScores;
  practice1Scores?: Scores;
  practice1GoalEffectiveness?: GoalEffectiveness;
  practice1ScenarioAlignment?: ScenarioAlignment;
  assessment?: MentorAssessResponse;
  scenarioMode?: 'vira' | 'mine';
  practicePlan?: PracticePlan;
  attemptIndex?: 1 | 2; // 1 for Practice 1, 2 for Practice 2
}

export interface MentorCompareResponse {
  secondScores: Scores;
  firstScores?: Scores;
  practice1Scores?: Scores;
  practice2Scores?: Scores;
  firstGoalEffectiveness?: GoalEffectiveness;
  secondGoalEffectiveness?: GoalEffectiveness;
  firstScenarioAlignment?: ScenarioAlignment;
  secondScenarioAlignment?: ScenarioAlignment;
  firstPmDecisionScores?: PMDecisionScores;
  secondPmDecisionScores?: PMDecisionScores;
  dimensions?: {
    clarity: DimensionComparison;
    structure: DimensionComparison;
    conciseness: DimensionComparison;
    goalEffectiveness?: DimensionComparison;
    scenarioAlignment?: DimensionComparison;
    decisionClarity?: DimensionComparison;
    supportingEvidence?: DimensionComparison;
    tradeoffArticulation?: DimensionComparison;
    businessImpact?: DimensionComparison;
  };
  multiAttemptRows?: MultiAttemptProgressRow[];
  hasPractice2?: boolean;
  focusBefore: number;
  focusAfter: number;
  focusChange?: number;
  verdict: 'improved' | 'similar' | 'declined' | 'less clear';
  meaningPreserved: boolean;
  meaningNote: string;
  progressInsight?: string; // Vira's concise, prominent progress insight
  tradeOffAnalysis?: string; // Multi-dimensional trade-off explanation
  whatImproved: string;
  stillNeedsWork: string;
  nextStep: string;
  nextChallenge?: {
    title: string;
    exercise: string;
    sentenceStarter?: string;
  };
  savedSessionId?: string;
  userFeedback?: {
    rating: number;
    tags?: string[];
    comment?: string;
    submittedAt?: string;
  };
  provider?: string;
  model?: string;
}

export interface CoachNextPracticeRequest {
  mode: 'next_practice';
  goal: GoalType;
  audience: string;
  scenario: string;
  focus: string;
  weaknessSummary?: string;
  lastTranscript?: string;
}

export interface CoachNextPracticeResponse {
  title: string;
  exercise: string;
  sentenceStarter: string;
  technique: Technique;
}

export interface PracticeSessionRecord {
  id: string;
  userId: string;
  goal: string;
  audience: string;
  scenarioMode: 'vira' | 'mine';
  scenarioText: string;
  baselineTranscript: string;
  baselineScores: Scores;
  focusSkill: string;
  focusExplanation: string;
  highlights: Highlight[];
  technique: Technique;
  practicePlan?: PracticePlan;
  retryTranscript?: string;
  retryScores?: Scores;
  comparison?: MentorCompareResponse;
  createdAt: string;
  updatedAt: string;
}

export interface UserFeedbackRecord {
  id: string;
  userId: string;
  sessionId?: string | null;
  rating: number;
  tags: string[];
  comment: string;
  goal?: string;
  audience?: string;
  focus?: string;
  createdAt: string;
}
