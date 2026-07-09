export type LeadStatus = "new" | "qualified" | "contacted" | "won";

export type Lead = {
  id: string;
  company: string;
  contact: string;
  title: string;
  source: "SEO" | "GEO" | "AI GEO" | "Outbound";
  intent: string;
  score: number;
  status: LeadStatus;
  location: string;
  lastSeen: string;
};

export type KeywordRow = {
  keyword: string;
  volume: number;
  position: number;
  change: number;
  difficulty: number;
  intent: "Informational" | "Commercial" | "Transactional";
  url: string;
};

export type GeoCitation = {
  engine: string;
  query: string;
  mentioned: boolean;
  sentiment: "positive" | "neutral" | "mixed";
  share: number;
  lastChecked: string;
};

export type Opportunity = {
  title: string;
  channel: "SEO" | "GEO" | "AI GEO" | "Leads";
  impact: "High" | "Medium";
  effort: "Low" | "Medium" | "High";
  detail: string;
};

export const overviewStats = [
  { label: "Organic sessions", value: "48.2k", delta: "+12.4%", tone: "up" as const },
  { label: "AI citations", value: "126", delta: "+31", tone: "up" as const },
  { label: "GEO visibility", value: "64%", delta: "+8 pts", tone: "up" as const },
  { label: "Qualified leads", value: "87", delta: "+19", tone: "up" as const },
];

export const keywords: KeywordRow[] = [
  {
    keyword: "generative engine optimization",
    volume: 4200,
    position: 3,
    change: 2,
    difficulty: 48,
    intent: "Commercial",
    url: "/blog/geo-playbook",
  },
  {
    keyword: "ai seo tools for agencies",
    volume: 2900,
    position: 7,
    change: 4,
    difficulty: 52,
    intent: "Commercial",
    url: "/solutions/agencies",
  },
  {
    keyword: "local service lead generation",
    volume: 8100,
    position: 11,
    change: -1,
    difficulty: 61,
    intent: "Transactional",
    url: "/features/leads",
  },
  {
    keyword: "chatgpt brand mentions tracking",
    volume: 1600,
    position: 5,
    change: 3,
    difficulty: 39,
    intent: "Informational",
    url: "/features/ai-geo",
  },
  {
    keyword: "b2b demand capture software",
    volume: 2400,
    position: 9,
    change: 1,
    difficulty: 57,
    intent: "Commercial",
    url: "/pricing",
  },
  {
    keyword: "answer engine optimization checklist",
    volume: 1300,
    position: 4,
    change: 6,
    difficulty: 33,
    intent: "Informational",
    url: "/resources/aeo-checklist",
  },
];

export const geoCitations: GeoCitation[] = [
  {
    engine: "ChatGPT",
    query: "best platforms for AI GEO",
    mentioned: true,
    sentiment: "positive",
    share: 28,
    lastChecked: "2h ago",
  },
  {
    engine: "Perplexity",
    query: "tools that track brand citations in AI answers",
    mentioned: true,
    sentiment: "positive",
    share: 34,
    lastChecked: "3h ago",
  },
  {
    engine: "Gemini",
    query: "SEO and lead generation software for startups",
    mentioned: true,
    sentiment: "neutral",
    share: 19,
    lastChecked: "5h ago",
  },
  {
    engine: "Copilot",
    query: "how to optimize content for generative engines",
    mentioned: false,
    sentiment: "mixed",
    share: 0,
    lastChecked: "6h ago",
  },
  {
    engine: "Google AI Overviews",
    query: "generative engine optimization strategy",
    mentioned: true,
    sentiment: "positive",
    share: 22,
    lastChecked: "1h ago",
  },
  {
    engine: "Claude",
    query: "stack for SEO GEO and outbound leads",
    mentioned: true,
    sentiment: "positive",
    share: 17,
    lastChecked: "4h ago",
  },
];

export const leads: Lead[] = [
  {
    id: "L-1042",
    company: "Northline Analytics",
    contact: "Maya Chen",
    title: "Head of Growth",
    source: "AI GEO",
    intent: "Comparing GEO platforms after ChatGPT citation",
    score: 92,
    status: "qualified",
    location: "Austin, TX",
    lastSeen: "18m ago",
  },
  {
    id: "L-1038",
    company: "Harbor Dental Group",
    contact: "Luis Ortega",
    title: "Marketing Director",
    source: "GEO",
    intent: "Local pack + AI overview visibility for clinics",
    score: 88,
    status: "new",
    location: "Miami, FL",
    lastSeen: "41m ago",
  },
  {
    id: "L-1031",
    company: "Quilt Commerce",
    contact: "Priya Nair",
    title: "VP Marketing",
    source: "SEO",
    intent: "Scaling content clusters for mid-market SaaS",
    score: 81,
    status: "contacted",
    location: "Toronto, CA",
    lastSeen: "2h ago",
  },
  {
    id: "L-1026",
    company: "Brightpath Legal",
    contact: "Owen Blake",
    title: "Partner",
    source: "Outbound",
    intent: "Need qualified consult bookings from search",
    score: 76,
    status: "qualified",
    location: "Chicago, IL",
    lastSeen: "3h ago",
  },
  {
    id: "L-1020",
    company: "Cedar Robotics",
    contact: "Hana Kim",
    title: "Demand Gen Lead",
    source: "AI GEO",
    intent: "Track competitor mentions across answer engines",
    score: 94,
    status: "won",
    location: "Seoul, KR",
    lastSeen: "Yesterday",
  },
  {
    id: "L-1014",
    company: "Fieldnote CRM",
    contact: "Jonas Meyer",
    title: "Founder",
    source: "SEO",
    intent: "Capture high-intent demo traffic from blogs",
    score: 73,
    status: "new",
    location: "Berlin, DE",
    lastSeen: "Yesterday",
  },
];

export const opportunities: Opportunity[] = [
  {
    title: "Win the Copilot gap on GEO explainers",
    channel: "AI GEO",
    impact: "High",
    effort: "Medium",
    detail:
      "Competitors are cited for 'how to optimize for generative engines' while you are absent. Ship a source-backed explainer with schema.",
  },
  {
    title: "Expand local service pages for Miami clinics",
    channel: "GEO",
    impact: "High",
    effort: "Low",
    detail:
      "Harbor Dental-style queries show rising map + AI overview demand. Add 4 location pages with review entities.",
  },
  {
    title: "Convert top 10 commercial keywords into lead magnets",
    channel: "Leads",
    impact: "High",
    effort: "Medium",
    detail:
      "Attach gated audits to pages ranking 4–12 to lift demo requests without paid spend.",
  },
  {
    title: "Refresh underperforming transactional cluster",
    channel: "SEO",
    impact: "Medium",
    effort: "Low",
    detail:
      "Three pages lost positions after SERP feature shifts. Update FAQs and internal links this sprint.",
  },
];

export const funnel = [
  { stage: "Discovery", value: 1240 },
  { stage: "Engaged", value: 486 },
  { stage: "Qualified", value: 187 },
  { stage: "Pipeline", value: 87 },
  { stage: "Won", value: 21 },
];

export const pricingPlans = [
  {
    name: "Signal",
    price: 79,
    blurb: "For founders validating SEO + AI visibility.",
    features: [
      "1 brand workspace",
      "Keyword & SERP tracking",
      "AI citation monitoring (3 engines)",
      "Lead inbox with scoring",
      "Weekly opportunity digest",
    ],
    cta: "Start Signal",
    highlighted: false,
  },
  {
    name: "Orbit",
    price: 199,
    blurb: "For growth teams running SEO, GEO, and pipeline together.",
    features: [
      "5 brand workspaces",
      "Full SEO + local GEO suite",
      "AI GEO across 6 answer engines",
      "Intent-based lead routing",
      "Playbooks & content briefs",
      "Slack + CRM sync",
    ],
    cta: "Start Orbit",
    highlighted: true,
  },
  {
    name: "Horizon",
    price: 499,
    blurb: "For agencies and multi-brand operators.",
    features: [
      "Unlimited workspaces",
      "White-label client portals",
      "Custom AI prompt panels",
      "Advanced attribution",
      "Priority onboarding",
      "Dedicated success partner",
    ],
    cta: "Talk to sales",
    highlighted: false,
  },
];
