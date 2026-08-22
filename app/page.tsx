'use client';

import { DragEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';

type TaskStatus = 'pending' | 'in-progress' | 'completed';
type Priority = 'high' | 'medium' | 'low';
type AIProvider = 'openai' | 'gemini';
type ViewMode = 'board' | 'timeline';
type VisualCategory = 'product' | 'design' | 'engineering' | 'research' | 'growth' | 'operations' | 'learning' | 'wellness';

type MicroStep = {
  id: string;
  text: string;
  completed: boolean;
};

type StrategicTask = {
  id: string;
  title: string;
  description: string;
  effort: string;
  timeline: string;
  priority: Priority;
  milestone: string;
  status: TaskStatus;
  microSteps: MicroStep[];
  visualCategory: VisualCategory;
  visualContext: string;
};

type StrategicPlan = {
  planTitle: string;
  summary: string;
  tasks: StrategicTask[];
};

type AppState = {
  tasks: StrategicTask[];
  apiKey: string;
  completedCount: number;
  provider: AIProvider;
  goal: string;
  planTitle: string;
  summary: string;
  source: 'ai' | 'simulation';
};

const STORAGE_KEY = 'questforge-saas-state-v1';
const DEFAULT_GOAL = 'Build a full-stack SaaS MVP in 7 days';
const GOAL_PLACEHOLDER = 'What epic quest will you conquer today? (e.g., Build a SaaS MVP in 7 days, Master Cloud Architecture...)';

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    planTitle: { type: 'string', description: 'A concise professional title for the strategic roadmap.' },
    summary: { type: 'string', description: 'A two-sentence executive summary of the approach.' },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          effort: { type: 'string', description: 'Estimated focused effort, such as 2 hours or 1 day.' },
          timeline: { type: 'string', description: 'When the task should happen, such as Day 1 or Week 2.' },
          priority: { type: 'string', description: 'One of: high, medium, or low.' },
          milestone: { type: 'string', description: 'The milestone or workstream this task belongs to.' },
          visualCategory: { type: 'string', description: 'One of: product, design, engineering, research, growth, operations, learning, or wellness.' },
          visualContext: { type: 'string', description: 'A short visual cue of 2 to 5 words describing the task artifact or domain.' },
        },
        required: ['id', 'title', 'description', 'effort', 'timeline', 'priority', 'milestone', 'visualCategory', 'visualContext'],
      },
    },
  },
  required: ['planTitle', 'summary', 'tasks'],
} as const;

const MICRO_STEPS_SCHEMA = {
  type: 'object',
  description: 'Exactly three actionable micro-steps for one task.',
  properties: {
    steps: {
      type: 'array',
      description: 'Exactly three concise, sequential micro-steps.',
      items: {
        type: 'object',
        description: 'A single concrete action that can be checked off.',
        properties: {
          text: { type: 'string', description: 'A specific action beginning with a strong verb.' },
        },
        required: ['text'],
      },
    },
  },
  required: ['steps'],
} as const;

function stableHash(value: string) {
  return [...value].reduce((hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619), 2166136261) >>> 0;
}

const visualCategories: VisualCategory[] = ['product', 'design', 'engineering', 'research', 'growth', 'operations', 'learning', 'wellness'];

function inferVisualCategory(title: string, milestone: string, description: string): VisualCategory {
  const value = `${title} ${milestone} ${description}`.toLowerCase();
  if (/code|api|architecture|system|implement|software|stack|data|deploy|build/.test(value)) return 'engineering';
  if (/design|journey|interface|user flow|prototype|visual/.test(value)) return 'design';
  if (/research|test|validate|feedback|evidence|audit/.test(value)) return 'research';
  if (/launch|market|growth|acquisition|activation|campaign/.test(value)) return 'growth';
  if (/learn|study|practice|curriculum|skill|assessment|recall/.test(value)) return 'learning';
  if (/health|fitness|rest|exercise|wellness|habit/.test(value)) return 'wellness';
  if (/operation|process|rhythm|review|prioritize|plan|constraint/.test(value)) return 'operations';
  return 'product';
}

function inferVisualContext(category: VisualCategory, milestone: string) {
  const labels: Record<VisualCategory, string> = {
    product: 'Product outcome map',
    design: 'Interface flow preview',
    engineering: 'System logic schematic',
    research: 'Evidence signal board',
    growth: 'Growth signal chart',
    operations: 'Execution workflow',
    learning: 'Learning pathway',
    wellness: 'Progress activity guide',
  };
  return milestone.trim() ? `${labels[category]} · ${milestone}` : labels[category];
}

function smartFallbackGenerator(prompt: string): StrategicPlan {
  const cleanGoal = prompt.trim() || DEFAULT_GOAL;
  const seed = stableHash(cleanGoal.toLowerCase());
  const looksTechnical = /build|develop|code|software|app|saas|api|website|prototype|system/i.test(cleanGoal);
  const looksLearning = /learn|master|study|course|skill|understand|certif/i.test(cleanGoal);
  const durationMatch = cleanGoal.match(/(\d+)\s*(day|week|month)s?/i);
  const horizon = durationMatch ? `${durationMatch[1]} ${durationMatch[2].toLowerCase()}${Number(durationMatch[1]) === 1 ? '' : 's'}` : '4 weeks';

  const technicalTasks = [
    ['Define scope and success metrics', 'Translate the objective into one primary user outcome, measurable acceptance criteria, and a strict list of non-goals.', '2 hours', 'Day 1', 'high', 'Strategy'],
    ['Map the critical user journey', 'Document the shortest end-to-end flow that delivers value and identify every dependency required to make it work.', '3 hours', 'Day 1', 'high', 'Product design'],
    ['Establish the delivery architecture', 'Choose the smallest reliable stack, define system boundaries, and write down the data model and integration contracts.', '4 hours', 'Day 2', 'high', 'Foundation'],
    ['Build the functional core', 'Implement the central workflow end to end with real data paths before adding secondary features or visual polish.', '1 day', 'Days 2–3', 'high', 'Implementation'],
    ['Add essential product states', 'Cover loading, empty, success, error, and permission states so the workflow remains usable outside the happy path.', '4 hours', 'Day 4', 'medium', 'Reliability'],
    ['Run a focused quality pass', 'Test the main journey across representative screen sizes, fix blocking issues, and verify data persistence and recovery.', '4 hours', 'Day 5', 'high', 'Quality'],
    ['Validate with target users', 'Put the working product in front of three relevant users and capture observed friction, not only stated preferences.', '3 hours', 'Day 6', 'medium', 'Validation'],
    ['Prioritize the launch delta', 'Rank feedback by user impact and delivery cost, then implement only the changes required for a credible release.', '4 hours', 'Day 6', 'medium', 'Refinement'],
    ['Ship and instrument the release', 'Deploy the release, verify production behavior, and track activation, completion, and failure signals.', '3 hours', 'Day 7', 'high', 'Launch'],
  ];

  const learningTasks = [
    ['Define the target capability', 'Describe what you should be able to produce or explain at the end, including a concrete assessment standard.', '90 minutes', 'Day 1', 'high', 'Direction'],
    ['Map prerequisite knowledge', 'Identify foundational concepts, current gaps, and the shortest sequence that connects them to the target skill.', '2 hours', 'Day 1', 'high', 'Foundation'],
    ['Build a focused resource set', 'Select one primary curriculum and no more than two supporting references to prevent fragmented learning.', '1 hour', 'Day 2', 'medium', 'Curriculum'],
    ['Complete the first active practice', 'Apply the first concepts in a small exercise and write down mistakes, uncertainties, and corrections.', '3 hours', 'Days 2–3', 'high', 'Practice'],
    ['Create a recall system', 'Turn key ideas into retrieval prompts and schedule short review sessions using increasing intervals.', '90 minutes', 'Day 3', 'medium', 'Retention'],
    ['Produce a realistic project', 'Build an artifact that requires combining the core concepts under constraints similar to real use.', '1 week', 'Week 2', 'high', 'Application'],
    ['Request expert feedback', 'Share the artifact with a qualified reviewer and ask for specific critique against the target standard.', '2 hours', 'Week 3', 'medium', 'Feedback'],
    ['Close the highest-impact gaps', 'Revisit weak areas revealed by practice and feedback, then repeat the relevant exercises without references.', '4 hours', 'Week 3', 'high', 'Improvement'],
    ['Run a final capability test', 'Complete a fresh challenge under time constraints and document the next level of deliberate practice.', '3 hours', 'Week 4', 'medium', 'Assessment'],
  ];

  const generalTasks = [
    ['Clarify the desired outcome', 'Convert the broad goal into an observable result, a deadline, and three conditions that define success.', '90 minutes', 'Day 1', 'high', 'Direction'],
    ['Audit constraints and resources', 'List available time, budget, people, tools, dependencies, and the assumptions most likely to affect execution.', '2 hours', 'Day 1', 'high', 'Discovery'],
    ['Select the highest-leverage path', 'Compare viable approaches and commit to the option with the clearest impact, evidence, and reversibility.', '2 hours', 'Day 2', 'high', 'Strategy'],
    ['Create the first deliverable', 'Produce the smallest tangible output that advances the goal and can be reviewed by someone else.', '4 hours', 'Days 2–3', 'high', 'Execution'],
    ['Install a weekly operating rhythm', 'Set fixed planning, execution, and review blocks with explicit limits for work in progress.', '1 hour', 'Week 1', 'medium', 'Operations'],
    ['Test assumptions with evidence', 'Gather direct feedback or measurable results and record which assumptions were confirmed or rejected.', '3 hours', 'Week 2', 'high', 'Validation'],
    ['Remove the primary bottleneck', 'Identify the single constraint slowing progress most and make one focused intervention to reduce it.', '3 hours', 'Week 2', 'medium', 'Optimization'],
    ['Consolidate the final output', 'Integrate validated work into a coherent deliverable and complete a quality review against the success criteria.', '4 hours', 'Week 3', 'high', 'Delivery'],
    ['Review results and define next steps', 'Measure the outcome, capture lessons, and convert remaining gaps into a prioritized follow-up plan.', '2 hours', 'Week 4', 'low', 'Review'],
  ];

  const source = looksTechnical ? technicalTasks : looksLearning ? learningTasks : generalTasks;
  const tasks = source.map((task, index) => {
    const title = task[0] as string;
    const description = task[1] as string;
    const milestone = task[5] as string;
    const visualCategory = inferVisualCategory(title, milestone, description);
    return {
      id: `sim-${seed.toString(36)}-${index + 1}`,
      title,
      description,
      effort: task[2] as string,
      timeline: task[3] as string,
      priority: task[4] as Priority,
      milestone,
      status: 'pending' as TaskStatus,
      microSteps: [],
      visualCategory,
      visualContext: inferVisualContext(visualCategory, milestone),
    };
  });

  return {
    planTitle: cleanGoal.length > 64 ? `${cleanGoal.slice(0, 61)}…` : cleanGoal,
    summary: `A focused ${horizon} execution plan that moves from clear scope to validated delivery. The roadmap favors evidence, controlled work in progress, and measurable outcomes.`,
    tasks,
  };
}

function normalizePlan(value: unknown): StrategicPlan {
  if (!value || typeof value !== 'object') throw new Error('The model returned an invalid plan object.');
  const plan = value as Record<string, unknown>;
  if (typeof plan.planTitle !== 'string' || typeof plan.summary !== 'string' || !Array.isArray(plan.tasks) || plan.tasks.length === 0) {
    throw new Error('The model response did not match the strategic plan schema.');
  }
  const tasks = plan.tasks.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Task ${index + 1} is invalid.`);
    const task = item as Record<string, unknown>;
    const priority: Priority = task.priority === 'high' || task.priority === 'low' ? task.priority : 'medium';
    const required = ['title', 'description', 'effort', 'timeline', 'milestone'] as const;
    for (const key of required) if (typeof task[key] !== 'string' || !(task[key] as string).trim()) throw new Error(`Task ${index + 1} is missing ${key}.`);
    const rawCategory = typeof task.visualCategory === 'string' ? task.visualCategory : '';
    const visualCategory = visualCategories.includes(rawCategory as VisualCategory)
      ? rawCategory as VisualCategory
      : inferVisualCategory(task.title as string, task.milestone as string, task.description as string);
    return {
      id: typeof task.id === 'string' && task.id ? task.id : `ai-task-${index + 1}`,
      title: task.title as string,
      description: task.description as string,
      effort: task.effort as string,
      timeline: task.timeline as string,
      priority,
      milestone: task.milestone as string,
      status: 'pending' as TaskStatus,
      microSteps: [],
      visualCategory,
      visualContext: typeof task.visualContext === 'string' && task.visualContext.trim()
        ? task.visualContext.trim()
        : inferVisualContext(visualCategory, task.milestone as string),
    };
  });
  return { planTitle: plan.planTitle, summary: plan.summary, tasks };
}

function extractOpenAIText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === 'string') return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = Array.isArray((item as Record<string, unknown>).content) ? (item as Record<string, unknown>).content as unknown[] : [];
    for (const part of content) {
      if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') return (part as Record<string, unknown>).text as string;
    }
  }
  throw new Error('OpenAI returned no readable output.');
}

function extractGeminiText(payload: Record<string, unknown>) {
  const candidates = payload.candidates as Array<Record<string, unknown>> | undefined;
  const content = candidates?.[0]?.content as Record<string, unknown> | undefined;
  const parts = content?.parts as Array<Record<string, unknown>> | undefined;
  const text = parts?.map(part => typeof part.text === 'string' ? part.text : '').join('').trim();
  if (!text) throw new Error('Gemini returned no readable output.');
  return text;
}

async function generateGeminiMicroSteps(taskTitle: string, apiKey: string): Promise<MicroStep[]> {
  if (!apiKey.trim()) throw new Error('Connect a Gemini API key in Settings to use this action.');
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: `Break down this specific task: ${taskTitle} into 3 highly actionable, micro-step checklists.` }],
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: MICRO_STEPS_SCHEMA,
        },
      }),
    });
    const payload = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      const error = payload.error as Record<string, unknown> | undefined;
      throw new Error(typeof error?.message === 'string' ? error.message : `Gemini request failed with status ${response.status}.`);
    }
    const result = JSON.parse(extractGeminiText(payload)) as Record<string, unknown>;
    if (!Array.isArray(result.steps) || result.steps.length !== 3) throw new Error('Gemini did not return exactly three micro-steps.');
    return result.steps.map((item, index) => {
      const value = item as Record<string, unknown>;
      if (!value || typeof value.text !== 'string' || !value.text.trim()) throw new Error(`Micro-step ${index + 1} is invalid.`);
      return { id: `step-${stableHash(`${taskTitle}-${value.text}-${index}`)}`, text: value.text.trim(), completed: false };
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('The Gemini request timed out. Please try again.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function generateAIStrategicPlan(prompt: string, apiKey: string, provider: AIProvider = 'openai'): Promise<StrategicPlan> {
  if (!apiKey.trim()) return smartFallbackGenerator(prompt);
  const instructions = 'You are a senior product strategist. Break the user goal into a pragmatic strategic roadmap. Tasks must be specific, sequenced, independently actionable, and written in clear professional language. For each task, select the most relevant visualCategory from product, design, engineering, research, growth, operations, learning, or wellness, and provide a concise visualContext describing the artifact or domain. Return only data matching the supplied JSON schema.';
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45000);

  try {
    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'gpt-5.4-mini',
          instructions,
          input: `Create a strategic execution plan for this goal:\n\n${prompt}`,
          store: false,
          max_output_tokens: 5000,
          text: { format: { type: 'json_schema', name: 'strategic_plan', strict: false, schema: PLAN_SCHEMA } },
        }),
      });
      const payload = await response.json() as Record<string, unknown>;
      if (!response.ok) {
        const error = payload.error as Record<string, unknown> | undefined;
        throw new Error(typeof error?.message === 'string' ? error.message : `OpenAI request failed with status ${response.status}.`);
      }
      return normalizePlan(JSON.parse(extractOpenAIText(payload)));
    }

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${instructions}\n\nCreate a strategic execution plan for this goal:\n\n${prompt}` }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: PLAN_SCHEMA },
      }),
    });
    const payload = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      const error = payload.error as Record<string, unknown> | undefined;
      throw new Error(typeof error?.message === 'string' ? error.message : `Gemini request failed with status ${response.status}.`);
    }
    return normalizePlan(JSON.parse(extractGeminiText(payload)));
  } finally {
    window.clearTimeout(timeout);
  }
}

function initialState(): AppState {
  const plan = smartFallbackGenerator(DEFAULT_GOAL);
  return { tasks: plan.tasks, apiKey: '', completedCount: 0, provider: 'openai', goal: DEFAULT_GOAL, planTitle: plan.planTitle, summary: plan.summary, source: 'simulation' };
}

const statusOrder: TaskStatus[] = ['pending', 'in-progress', 'completed'];
const statusLabels: Record<TaskStatus, string> = { pending: 'To do', 'in-progress': 'In progress', completed: 'Completed' };

function singleLine(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function compileRoadmapMarkdown(state: AppState) {
  const progress = state.tasks.length ? Math.round(state.completedCount / state.tasks.length * 100) : 0;
  const lines = [
    `# ${singleLine(state.planTitle)}`,
    '',
    singleLine(state.summary),
    '',
    `**Goal:** ${singleLine(state.goal)}`,
    `**Progress:** ${state.completedCount}/${state.tasks.length} tasks completed (${progress}%)`,
    `**Source:** ${state.source === 'ai' ? 'AI-generated' : 'Simulation'}`,
    '',
    '## Roadmap',
    '',
  ];

  state.tasks.forEach((task, index) => {
    lines.push(`${index + 1}. ${task.status === 'completed' ? '[x]' : '[ ]'} **${singleLine(task.title)}**`);
    lines.push(`   - Status: ${statusLabels[task.status]}`);
    lines.push(`   - Priority: ${task.priority}`);
    lines.push(`   - Timeline: ${singleLine(task.timeline)} · Effort: ${singleLine(task.effort)}`);
    lines.push(`   - Milestone: ${singleLine(task.milestone)}`);
    lines.push(`   - Visual context: ${singleLine(task.visualContext)}`);
    lines.push(`   - ${singleLine(task.description)}`);
    if (task.microSteps.length) {
      lines.push('   - Micro-steps:');
      task.microSteps.forEach(step => lines.push(`     - ${step.completed ? '[x]' : '[ ]'} ${singleLine(step.text)}`));
    }
    lines.push('');
  });

  lines.push('---', 'Exported from QuestForge AI');
  return lines.join('\n');
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) throw new Error('Clipboard access was denied.');
}

export default function Home() {
  const [state, setState] = useState<AppState>(initialState);
  const [prompt, setPrompt] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const [view, setView] = useState<ViewMode>('board');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftKey, setDraftKey] = useState('');
  const [draftProvider, setDraftProvider] = useState<AIProvider>('openai');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('Simulation mode is active. Add an API key to generate with AI.');
  const [taskActions, setTaskActions] = useState<Record<string, { loading: boolean; expanded: boolean; error: string | null }>>({});
  const [dropTarget, setDropTarget] = useState<TaskStatus | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const draggedTaskRef = useRef<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const hydrationFrame = window.requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as AppState;
          if (Array.isArray(parsed.tasks) && parsed.tasks.length) {
            const tasks = parsed.tasks.map(task => {
              const visualCategory = visualCategories.includes(task.visualCategory as VisualCategory)
                ? task.visualCategory
                : inferVisualCategory(task.title, task.milestone, task.description);
              return {
                ...task,
                microSteps: Array.isArray(task.microSteps) ? task.microSteps : [],
                visualCategory,
                visualContext: task.visualContext || inferVisualContext(visualCategory, task.milestone),
              };
            });
            setState({ ...parsed, tasks, completedCount: tasks.filter(task => task.status === 'completed').length });
            setPrompt(parsed.goal || '');
          }
        }
      } catch {
        setNotice('Saved workspace data was invalid, so a clean roadmap was loaded.');
      } finally {
        setIsMounted(true);
      }
    });

    return () => window.cancelAnimationFrame(hydrationFrame);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [isMounted, state]);

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setSettingsOpen(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [settingsOpen]);

  const progress = state.tasks.length ? Math.round(state.completedCount / state.tasks.length * 100) : 0;
  const groupedTasks = useMemo(() => Object.fromEntries(statusOrder.map(status => [status, state.tasks.filter(task => task.status === status)])) as Record<TaskStatus, StrategicTask[]>, [state.tasks]);

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2800);
  }

  async function exportRoadmap() {
    try {
      await copyTextToClipboard(compileRoadmapMarkdown(state));
      showToast('Roadmap exported to clipboard!');
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Clipboard access failed.';
      showToast(`Export failed: ${reason}`);
    }
  }

  function openSettings() {
    setDraftKey(state.apiKey);
    setDraftProvider(state.provider);
    setShowKey(false);
    setSettingsOpen(true);
  }

  function saveSettings(event: FormEvent) {
    event.preventDefault();
    setState(current => ({ ...current, apiKey: draftKey.trim(), provider: draftProvider }));
    setNotice(draftKey.trim() ? `${draftProvider === 'openai' ? 'OpenAI' : 'Gemini'} connected. Your key is stored only in this browser.` : 'API key removed. Simulation mode is active.');
    setSettingsOpen(false);
  }

  async function handleGenerate(event: FormEvent) {
    event.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || loading) return;
    setLoading(true);
    setNotice(state.apiKey ? `Generating with ${state.provider === 'openai' ? 'OpenAI' : 'Gemini'}…` : 'Generating a resilient simulation plan…');
    try {
      const plan = await generateAIStrategicPlan(cleanPrompt, state.apiKey, state.provider);
      setState(current => ({ ...current, tasks: plan.tasks, completedCount: 0, goal: cleanPrompt, planTitle: plan.planTitle, summary: plan.summary, source: current.apiKey ? 'ai' : 'simulation' }));
      setTaskActions({});
      setNotice(state.apiKey ? 'AI roadmap generated successfully.' : 'Simulation roadmap generated. Add an API key anytime for a model-generated plan.');
      window.setTimeout(() => document.getElementById('roadmap')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (error) {
      const fallback = smartFallbackGenerator(cleanPrompt);
      setState(current => ({ ...current, tasks: fallback.tasks, completedCount: 0, goal: cleanPrompt, planTitle: fallback.planTitle, summary: fallback.summary, source: 'simulation' }));
      setTaskActions({});
      const reason = error instanceof Error ? error.message : 'Unknown API error';
      setNotice(`AI request unavailable (${reason}). A complete simulation plan was generated instead.`);
    } finally {
      setLoading(false);
    }
  }

  function cycleTaskStatus(id: string) {
    setState(current => {
      const tasks = current.tasks.map(task => {
        if (task.id !== id) return task;
        const nextIndex = (statusOrder.indexOf(task.status) + 1) % statusOrder.length;
        return { ...task, status: statusOrder[nextIndex] };
      });
      return { ...current, tasks, completedCount: tasks.filter(task => task.status === 'completed').length };
    });
  }

  function moveTask(id: string, status: TaskStatus) {
    setState(current => {
      const tasks = current.tasks.map(task => task.id === id ? { ...task, status } : task);
      return { ...current, tasks, completedCount: tasks.filter(task => task.status === 'completed').length };
    });
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>, id: string) {
    draggedTaskRef.current = id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    event.currentTarget.classList.add('dragging');
  }

  function handleDragEnd(event: DragEvent<HTMLDivElement>) {
    event.currentTarget.classList.remove('dragging');
    setDropTarget(null);
    window.setTimeout(() => { draggedTaskRef.current = null; }, 0);
  }

  function handleColumnDrop(event: DragEvent<HTMLElement>, status: TaskStatus) {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    if (id && state.tasks.some(task => task.id === id)) moveTask(id, status);
    setDropTarget(null);
  }

  async function breakDownTask(task: StrategicTask) {
    setTaskActions(current => ({ ...current, [task.id]: { loading: true, expanded: true, error: null } }));
    if (state.provider !== 'gemini') {
      setTaskActions(current => ({ ...current, [task.id]: { loading: false, expanded: true, error: 'Select Gemini and save a Gemini API key in Settings first.' } }));
      return;
    }
    try {
      const microSteps = await generateGeminiMicroSteps(task.title, state.apiKey);
      setState(current => ({ ...current, tasks: current.tasks.map(item => item.id === task.id ? { ...item, microSteps } : item) }));
      setTaskActions(current => ({ ...current, [task.id]: { loading: false, expanded: true, error: null } }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate micro-steps.';
      setTaskActions(current => ({ ...current, [task.id]: { loading: false, expanded: true, error: message } }));
    }
  }

  function toggleMicroStep(taskId: string, stepId: string) {
    setState(current => ({
      ...current,
      tasks: current.tasks.map(task => task.id !== taskId ? task : {
        ...task,
        microSteps: task.microSteps.map(step => step.id === stepId ? { ...step, completed: !step.completed } : step),
      }),
    }));
  }

  function handleCardKey(event: KeyboardEvent<HTMLDivElement>, id: string) {
    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      cycleTaskStatus(id);
    }
  }

  function taskActionPanel(task: StrategicTask, compact = false) {
    const action = taskActions[task.id];
    const expanded = action?.expanded ?? task.microSteps.length > 0;
    const completedSteps = task.microSteps.filter(step => step.completed).length;
    return (
      <div className={`task-action-area ${compact ? 'timeline-action-area' : ''}`} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
        <button className="breakdown-button" draggable={false} onClick={() => breakDownTask(task)} disabled={action?.loading}>
          {action?.loading ? <><span className="card-spinner" />Breaking it down…</> : <><ListIcon />{task.microSteps.length ? 'Regenerate steps' : 'Break It Down'}</>}
        </button>
        {expanded && (
          <div className="micro-steps" aria-live="polite">
            {action?.loading && <div className="micro-loading"><span /><span /><span /></div>}
            {action?.error && <div className="micro-error"><InfoIcon /><span>{action.error}</span>{state.provider !== 'gemini' && <button onClick={openSettings}>Open settings</button>}</div>}
            {!action?.loading && !action?.error && task.microSteps.length > 0 && <>
              <div className="micro-header"><span>Micro-steps</span><b>{completedSteps}/{task.microSteps.length}</b></div>
              <div className="micro-list">
                {task.microSteps.map(step => <label key={step.id} className={step.completed ? 'checked' : ''} draggable={false}><input type="checkbox" checked={step.completed} onChange={() => toggleMicroStep(task.id, step.id)} /><span><CheckIcon /></span><em>{step.text}</em></label>)}
              </div>
            </>}
          </div>
        )}
      </div>
    );
  }

  function taskCard(task: StrategicTask) {
    return (
      <div
        className="task-card"
        key={task.id}
        role="button"
        tabIndex={0}
        draggable
        onDragStart={event => handleDragStart(event, task.id)}
        onDragEnd={handleDragEnd}
        onClick={() => { if (draggedTaskRef.current !== task.id) cycleTaskStatus(task.id); }}
        onKeyDown={event => handleCardKey(event, task.id)}
        aria-label={`${task.title}. ${statusLabels[task.status]}. Activate to move to the next status, or drag to another column.`}
      >
        <div className="task-topline"><span className={`priority priority-${task.priority}`}>{task.priority}</span><span className="milestone">{task.milestone}</span></div>
        <TaskVisual task={task} />
        <h3>{task.title}</h3>
        <p>{task.description}</p>
        <div className="task-meta"><span><ClockIcon />{task.effort}</span><span><CalendarIcon />{task.timeline}</span></div>
        {taskActionPanel(task)}
        <div className="status-action"><span className={`status-dot ${task.status}`} />{statusLabels[task.status]}<span className="status-arrow">→</span></div>
      </div>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="QuestForge AI home"><span className="brand-mark"><SparkIcon /></span><span>QuestForge <b>AI</b></span></a>
        <div className="header-progress" aria-label={`${progress}% roadmap completion`}>
          <div className="progress-copy"><span>{state.completedCount} of {state.tasks.length} completed</span><strong>{progress}%</strong></div>
          <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
        </div>
        <nav className="header-actions" aria-label="Workspace controls">
          <button type="button" className="export-button" onClick={exportRoadmap} disabled={!isMounted}><ExportIcon />Export Roadmap</button>
          <button type="button" className={`connection-pill ${state.apiKey ? 'connected' : ''}`} onClick={openSettings} aria-label="Open API connection settings"><span />{state.apiKey ? state.provider === 'openai' ? 'OpenAI' : 'Gemini' : 'Simulation'}</button>
          <button type="button" className="icon-button" onClick={openSettings} aria-label="Open API settings"><SettingsIcon /></button>
          <div className="profile" aria-label="Signed in as Developer 01, Workspace owner">
            <span className="avatar" aria-hidden="true">D1</span>
            <span className="profile-copy"><strong>Developer 01</strong><small>Workspace owner</small></span>
          </div>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-badge"><span />AI strategy workspace</div>
        <h1>Turn ambitious goals into<br /><span>clear, executable plans.</span></h1>
        <p className="hero-copy">Describe your outcome. QuestForge analyzes the objective and creates a structured roadmap you can move through from strategy to delivery.</p>
        <form className="goal-composer" onSubmit={handleGenerate}>
          <div className="composer-label"><label htmlFor="goal">What are you building toward?</label><span>{prompt.length}/600</span></div>
          <textarea
            id="goal"
            value={prompt}
            onChange={event => setPrompt(event.target.value)}
            placeholder={GOAL_PLACEHOLDER}
            maxLength={600}
            rows={4}
            disabled={loading}
          />
          <div className="composer-footer">
            <div className="model-chip"><span className={state.apiKey ? 'live' : ''} /><div><strong>{state.apiKey ? state.provider === 'openai' ? 'GPT-5.4 mini' : 'Gemini 3.6 Flash' : 'Smart simulation'}</strong><small>{state.apiKey ? 'Structured JSON output' : 'No API key required'}</small></div></div>
            <button className="generate-button" type="submit" disabled={loading || !prompt.trim()}>{loading ? <><span className="spinner" />Building roadmap…</> : <><SparkIcon />Generate roadmap</>}</button>
          </div>
        </form>
        <div className="suggestions"><span>Try an example</span>{['Launch a B2B analytics product', 'Master cloud architecture', 'Build a design portfolio'].map(example => <button key={example} onClick={() => setPrompt(example)}>{example}</button>)}</div>
        <p className="notice" role="status" aria-live="polite"><InfoIcon />{notice}</p>
      </section>

      <section className="roadmap-section" id="roadmap">
        <div className="roadmap-heading">
          <div><div className="section-kicker"><span className={`source-indicator ${state.source}`} />{state.source === 'ai' ? 'AI-generated roadmap' : 'Simulation roadmap'}</div><h2>{state.planTitle}</h2><p>{state.summary}</p></div>
          <div className="view-switch" aria-label="Roadmap view"><button className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}><BoardIcon />Board</button><button className={view === 'timeline' ? 'active' : ''} onClick={() => setView('timeline')}><TimelineIcon />Timeline</button></div>
        </div>

        <div className="insight-row">
          <div><span>Tasks</span><strong>{state.tasks.length}</strong></div>
          <div><span>In progress</span><strong>{groupedTasks['in-progress'].length}</strong></div>
          <div><span>High priority</span><strong>{state.tasks.filter(task => task.priority === 'high' && task.status !== 'completed').length}</strong></div>
          <div className="completion-stat"><span>Overall progress</span><strong>{progress}%</strong><div><i style={{ width: `${progress}%` }} /></div></div>
        </div>

        {view === 'board' ? (
          <div className="kanban">
            {statusOrder.map(status => (
              <section
                className={`kanban-column ${dropTarget === status ? 'drop-target' : ''}`}
                key={status}
                onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(status); }}
                onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(null); }}
                onDrop={event => handleColumnDrop(event, status)}
              >
                <div className="column-title"><span className={`status-dot ${status}`} /><h3>{statusLabels[status]}</h3><b>{groupedTasks[status].length}</b></div>
                <div className="column-tasks">{groupedTasks[status].length ? groupedTasks[status].map(taskCard) : <div className="empty-column"><CheckIcon /><p>Drop tasks here</p><span>Drag a card into this column to update its status.</span></div>}</div>
              </section>
            ))}
          </div>
        ) : (
          <div className="timeline-list">
            {state.tasks.map((task, index) => (
              <div className="timeline-item" key={task.id}>
                <div className="timeline-rail"><span className={task.status}>{task.status === 'completed' ? <CheckIcon /> : index + 1}</span><i /></div>
                <div className="timeline-content">
                  <div className="timeline-heading"><div><span className="timeline-date">{task.timeline} · {task.milestone}</span><h3>{task.title}</h3></div><span className={`priority priority-${task.priority}`}>{task.priority}</span></div>
                  <TaskVisual task={task} compact />
                  <p>{task.description}</p>
                  <div className="timeline-footer"><span><ClockIcon />{task.effort}</span><button onClick={() => cycleTaskStatus(task.id)}><span className={`status-dot ${task.status}`} />{statusLabels[task.status]}<b>Move forward →</b></button></div>
                  {taskActionPanel(task, true)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer><div className="brand footer-brand"><span className="brand-mark"><SparkIcon /></span><span>QuestForge <b>AI</b></span></div><p>Strategic clarity for ambitious work.</p><span>Local-first workspace · Your data stays in this browser</span></footer>

      {toast && <div className="toast" role="status" aria-live="polite"><CheckIcon /><span>{toast}</span><button onClick={() => setToast(null)} aria-label="Dismiss notification">×</button></div>}
      {settingsOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSettingsOpen(false); }}><section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div className="modal-header"><div><span className="modal-icon"><KeyIcon /></span><div><h2 id="settings-title">AI provider settings</h2><p>Connect your own model account.</p></div></div><button className="close-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings">×</button></div><form onSubmit={saveSettings}><fieldset><legend>Provider</legend><div className="provider-options"><label className={draftProvider === 'openai' ? 'selected' : ''}><input type="radio" name="provider" value="openai" checked={draftProvider === 'openai'} onChange={() => setDraftProvider('openai')} /><span className="provider-logo">O</span><span><strong>OpenAI</strong><small>GPT-5.4 mini</small></span><i /></label><label className={draftProvider === 'gemini' ? 'selected' : ''}><input type="radio" name="provider" value="gemini" checked={draftProvider === 'gemini'} onChange={() => setDraftProvider('gemini')} /><span className="provider-logo gemini">G</span><span><strong>Google Gemini</strong><small>Gemini 3.6 Flash</small></span><i /></label></div></fieldset><label className="key-field"><span>API key</span><div><KeyIcon /><input autoFocus type={showKey ? 'text' : 'password'} value={draftKey} onChange={event => setDraftKey(event.target.value)} autoComplete="off" spellCheck={false} placeholder={draftProvider === 'openai' ? 'sk-…' : 'AIza…'} /><button type="button" onClick={() => setShowKey(value => !value)}>{showKey ? 'Hide' : 'Show'}</button></div></label><div className="security-note"><ShieldIcon /><p><strong>Stored locally on this device</strong><span>The key is saved in browser localStorage and sent directly to the selected provider. It is never sent to a QuestForge server.</span></p></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setDraftKey(''); setState(current => ({ ...current, apiKey: '' })); setNotice('API key removed. Simulation mode is active.'); setSettingsOpen(false); }}>Use simulation</button><button type="submit" className="primary-button">Save connection</button></div></form></section></div>}
    </main>
  );
}

function TaskVisual({ task, compact = false }: { task: StrategicTask; compact?: boolean }) {
  return (
    <div className={`task-visual visual-${task.visualCategory} ${compact ? 'compact' : ''}`} aria-label={`${task.visualCategory} visual: ${task.visualContext}`}>
      <div className="visual-orbit" aria-hidden="true"><i /><i /><i /></div>
      <span className="visual-icon"><CategoryIcon category={task.visualCategory} /></span>
      <div className="visual-copy"><strong>{task.visualCategory}</strong><span>{task.visualContext}</span></div>
      <div className="visual-bars" aria-hidden="true"><i /><i /><i /></div>
    </div>
  );
}

function CategoryIcon({ category }: { category: VisualCategory }) {
  if (category === 'engineering') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 7-4 5 4 5M16 7l4 5-4 5M14 4l-4 16" /></svg>;
  if (category === 'design') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M3.5 9h17M9 9v11M6.2 6.5h.01" /></svg>;
  if (category === 'research') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5M8 10.5h5M10.5 8v5" /></svg>;
  if (category === 'growth') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h16M7 15l4-4 3 2 5-6" /><path d="M16 7h3v3" /></svg>;
  if (category === 'operations') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /><path d="M10 7h4a3 3 0 0 1 3 3v4M14 17h-4a3 3 0 0 1-3-3v-4" /></svg>;
  if (category === 'learning') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 9 9-5 9 5-9 5-9-5Z" /><path d="M7 12v4.5c3 2 7 2 10 0V12M21 9v6" /></svg>;
  if (category === 'wellness') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13h4l2-6 4 11 2-5h6" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v13H4z" /><path d="M8 9h8M8 12h5M8 15h7" /></svg>;
}

function SparkIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.75 13.65 8.35 19.25 10l-5.6 1.65L12 17.25l-1.65-5.6L4.75 10l5.6-1.65L12 2.75Z" /><path d="m18.5 15 .75 2.25L21.5 18l-2.25.75L18.5 21l-.75-2.25L15.5 18l2.25-.75L18.5 15Z" /></svg>; }
function ExportIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M8 8l4-4 4 4M5 13v6h14v-6" /></svg>; }
function SettingsIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Z" /><path d="m19.4 15 .1.1a2 2 0 1 1-2.83 2.83l-.1-.1a1.8 1.8 0 0 0-3.07 1.27V19.25a2 2 0 1 1-4 0v-.15a1.8 1.8 0 0 0-3.07-1.27l-.1.1A2 2 0 1 1 3.5 15.1l.1-.1a1.8 1.8 0 0 0-1.27-3.07h-.15a2 2 0 1 1 0-4h.15A1.8 1.8 0 0 0 3.6 4.86l-.1-.1a2 2 0 1 1 2.83-2.83l.1.1A1.8 1.8 0 0 0 9.5.76V.6a2 2 0 1 1 4 0v.16a1.8 1.8 0 0 0 3.07 1.27l.1-.1a2 2 0 1 1 2.83 2.83l-.1.1a1.8 1.8 0 0 0 1.27 3.07h.15a2 2 0 1 1 0 4h-.15A1.8 1.8 0 0 0 19.4 15Z" /></svg>; }
function ClockIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>; }
function CalendarIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14" rx="2" /><path d="M8 3.5v4M16 3.5v4M4 9.5h16" /></svg>; }
function InfoIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 10.5v6M12 7.5h.01" /></svg>; }
function BoardIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="7" height="16" rx="1.5" /><rect x="13.5" y="4" width="7" height="10" rx="1.5" /></svg>; }
function TimelineIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h13M7 12h13M7 19h13" /><circle cx="4" cy="5" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="19" r="1" /></svg>; }
function CheckIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>; }
function ListIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3.5 6 .8.8L6 5M3.5 12l.8.8L6 11M3.5 18l.8.8L6 17" /></svg>; }
function KeyIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8.5" cy="11" r="4.5" /><path d="m12.5 9 7-3v4l-2 1v2l-2 1v2l-3 1" /></svg>; }
function ShieldIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.7 2.8 8 7 10 4.2-2 7-5.3 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>; }
