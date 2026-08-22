'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type QuestStatus = 'locked' | 'active' | 'completed' | 'recovery';
type Difficulty = 'Easy' | 'Moderate' | 'Critical';
type Quest = {
  id: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  expReward: number;
  status: QuestStatus;
  dependencies: string[];
};

type GameState = {
  xp: number;
  level: number;
  stamina: number;
  activeQuests: Quest[];
  goal: string;
  shieldActive: boolean;
};

const DEFAULT_GOAL = 'Build a software prototype';
const STORAGE_KEY = 'questforge-player-v1';

function hashGoal(value: string) {
  return [...value.toLowerCase()].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 7);
}

function goalLabel(goal: string) {
  const words = goal.trim().replace(/[^a-zA-Z0-9\s-]/g, '').split(/\s+/).filter(Boolean);
  return (words.slice(0, 3).join(' ') || 'Untitled mission').toUpperCase();
}

function generateQuests(goal: string): Quest[] {
  const seed = Math.abs(hashGoal(goal));
  const subject = goal.trim().replace(/[.!?]+$/, '') || DEFAULT_GOAL;
  const variants = [
    ['MAP THE TERRAIN', 'Gather the constraints, resources, and unknowns surrounding your objective.'],
    ['DEFINE THE WIN', `Write one observable outcome that proves “${subject}” is real.`],
    ['FORGE THE FIRST MOVE', 'Create a 20-minute action that produces visible evidence of progress.'],
    ['TEST THE WEAK POINT', 'Challenge your approach early and record what bends or breaks.'],
    ['BUILD THE CORE LOOP', 'Repeat the highest-signal action and remove one source of friction.'],
    ['FACE THE REAL WORLD', 'Put the work in front of one real person or realistic constraint.'],
    ['CLAIM THE MILESTONE', 'Consolidate the result, document the next move, and bank the win.'],
  ];
  const shift = seed % variants.length;
  const ordered = variants.map((_, index) => variants[(index + shift) % variants.length]);
  const dependencies = [[], [], ['q1'], ['q1'], ['q2', 'q3'], ['q3', 'q4'], ['q5', 'q6']];
  const difficulties: Difficulty[] = ['Easy', 'Easy', 'Moderate', 'Moderate', 'Critical', 'Moderate', 'Critical'];
  const rewards = [100, 110, 180, 200, 320, 240, 400];

  return ordered.map(([title, description], index) => ({
    id: `q${index + 1}`,
    title,
    description,
    difficulty: difficulties[index],
    expReward: rewards[index] + (seed % 3) * 10,
    status: index < 2 ? 'active' : 'locked',
    dependencies: dependencies[index],
  }));
}

function getInitialState(): GameState {
  return { xp: 780, level: 3, stamina: 76, activeQuests: generateQuests(DEFAULT_GOAL), goal: DEFAULT_GOAL, shieldActive: false };
}

export default function Home() {
  const [state, setState] = useState<GameState>(getInitialState);
  const [input, setInput] = useState(DEFAULT_GOAL);
  const [hydrated, setHydrated] = useState(false);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [message, setMessage] = useState('AI CORE READY · DETERMINISTIC SEED ACTIVE');
  const xpMax = state.level * 500;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as GameState;
        if (parsed.activeQuests?.length) {
          setState(parsed);
          setInput(parsed.goal);
        }
      }
    } catch { /* corrupted local progress falls back safely */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  const completedCount = useMemo(() => state.activeQuests.filter(q => q.status === 'completed').length, [state.activeQuests]);

  function forgeQuests(event: FormEvent) {
    event.preventDefault();
    const goal = input.trim() || DEFAULT_GOAL;
    setState(current => ({ ...current, goal, activeQuests: generateQuests(goal), shieldActive: false }));
    setMessage(`QUEST LINE FORGED · SEED ${Math.abs(hashGoal(goal)) % 9999}`);
    document.getElementById('quest-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function completeQuest(id: string) {
    const target = state.activeQuests.find(quest => quest.id === id);
    if (!target || target.status === 'locked' || target.status === 'completed') return;

    let gainedLevel: number | null = null;
    setState(current => {
      let nextXp = current.xp + target.expReward;
      let nextLevel = current.level;
      let threshold = nextLevel * 500;
      while (nextXp >= threshold) {
        nextXp -= threshold;
        nextLevel += 1;
        gainedLevel = nextLevel;
        threshold = nextLevel * 500;
      }

      const completed = current.activeQuests.map(quest => quest.id === id ? { ...quest, status: 'completed' as QuestStatus } : quest);
      const nextQuests = completed.map(quest => {
        if (quest.status !== 'locked') return quest;
        const unlocked = quest.dependencies.every(dep => completed.some(candidate => candidate.id === dep && candidate.status === 'completed'));
        return unlocked ? { ...quest, status: 'active' as QuestStatus } : quest;
      });

      return {
        ...current,
        xp: nextXp,
        level: nextLevel,
        stamina: Math.max(10, Math.min(100, current.stamina + (target.status === 'recovery' ? 14 : -8))),
        activeQuests: nextQuests,
      };
    });
    setFlash(id);
    setMessage(`QUEST CLEARED · +${target.expReward} XP`);
    window.setTimeout(() => setFlash(null), 650);
    window.setTimeout(() => { if (gainedLevel) setLevelUp(gainedLevel); }, 100);
  }

  function activateShield() {
    setState(current => {
      if (current.shieldActive) return current;
      const restorative = [
        'Pause for three slow breaths, then write only the next physical action.',
        'Clear one tiny obstacle and stop. Momentum counts more than volume today.',
        'Spend five gentle minutes reconnecting with the reason this quest matters.',
        'Create a deliberately rough two-minute version. No polish is permitted.',
      ];
      return {
        ...current,
        shieldActive: true,
        stamina: Math.min(100, current.stamina + 18),
        activeQuests: current.activeQuests.map((quest, index) => quest.status === 'completed' ? quest : ({
          ...quest,
          title: `RECOVERY: ${quest.title.replace('RECOVERY: ', '')}`,
          description: restorative[(index + Math.abs(hashGoal(current.goal))) % restorative.length],
          difficulty: 'Easy' as Difficulty,
          expReward: 60 + (index % 3) * 10,
          status: 'recovery' as QuestStatus,
          dependencies: quest.dependencies.filter(dep => current.activeQuests.some(item => item.id === dep && item.status === 'completed')),
        })),
      };
    });
    setMessage('BURNOUT SHIELD ONLINE · PROGRESS PROTECTED');
  }

  return (
    <main className={`app-shell ${state.shieldActive ? 'recovery-mode' : ''}`}>
      <header className="player-hud" aria-label="Player status">
        <div className="identity">
          <div className="avatar" aria-hidden="true"><span /></div>
          <div><small>ONLINE</small><strong>PLAYER 01</strong></div>
        </div>
        <div className="hud-stat">
          <span>LEVEL {String(state.level).padStart(2, '0')}</span>
          <div className="block-bar" role="progressbar" aria-label="Experience" aria-valuenow={state.xp} aria-valuemax={xpMax}><i style={{ width: `${Math.min(100, state.xp / xpMax * 100)}%` }} /></div>
          <small>{state.xp.toLocaleString()} / {xpMax.toLocaleString()} XP</small>
        </div>
        <div className="hud-stat stamina">
          <span>STAMINA</span>
          <div className="block-bar" role="progressbar" aria-label="Stamina" aria-valuenow={state.stamina} aria-valuemax={100}><i style={{ width: `${state.stamina}%` }} /></div>
          <small>FOCUS: {state.stamina > 65 ? 'STABLE' : state.stamina > 35 ? 'STRAINED' : 'CRITICAL'}</small>
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow">// OBJECTIVE SYNTHESIS TERMINAL</p>
        <h1>TURN GOALS INTO<br /><em>EPIC QUESTS.</em></h1>
        <p className="intro">An adaptive RPG engine for real-world progress. Enter your macro objective and forge a path that bends—not breaks—under pressure.</p>
        <form className="terminal" onSubmit={forgeQuests}>
          <label htmlFor="goal">WHAT WILL YOU CONQUER?</label>
          <div className="terminal-row"><span aria-hidden="true">&gt;</span><input id="goal" value={input} onChange={event => setInput(event.target.value)} maxLength={100} placeholder="e.g. Master system architecture" /><button type="submit">FORGE QUESTS <b aria-hidden="true">→</b></button></div>
          <small role="status" aria-live="polite">{message}</small>
        </form>
        <div className="quick-goals" aria-label="Example objectives">
          {['Master system architecture', 'Overcome daily procrastination', 'Launch my portfolio'].map(goal => <button key={goal} onClick={() => setInput(goal)}>{goal}</button>)}
        </div>
      </section>

      <section className="quest-panel" id="quest-map">
        <div className="panel-head">
          <div><p className="eyebrow">CURRENT CAMPAIGN · {completedCount}/{state.activeQuests.length} CLEARED</p><h2>{goalLabel(state.goal)} // ASCENSION</h2></div>
          <button className="shield" onClick={activateShield} disabled={state.shieldActive}>{state.shieldActive ? '♥ SHIELD ACTIVE · RECOVERY PATH' : '♡ ACTIVATE BURNOUT SHIELD'}</button>
        </div>
        <p className="map-instruction">SELECT AN AVAILABLE NODE TO COMPLETE IT. BRANCHES UNLOCK WHEN THEIR PREREQUISITES ARE CLEARED.</p>
        <div className="quest-map">
          <div className="path path-1" /><div className="path path-2" /><div className="path path-3" /><div className="path path-4" /><div className="path path-5" /><div className="path path-6" />
          {state.activeQuests.map((quest, index) => (
            <button
              key={quest.id}
              className={`quest-node node-${index + 1} ${quest.status} ${flash === quest.id ? 'quest-flash' : ''}`}
              onClick={() => completeQuest(quest.id)}
              disabled={quest.status === 'locked' || quest.status === 'completed'}
              aria-label={`${quest.title}. ${quest.status}. Reward ${quest.expReward} experience.`}
            >
              <span className="node-icon" aria-hidden="true">{quest.status === 'completed' ? '✓' : quest.status === 'locked' ? '×' : quest.status === 'recovery' ? '♥' : '!'}</span>
              <span className="node-kicker">{quest.status === 'locked' ? 'LOCKED' : quest.difficulty.toUpperCase()} · +{quest.expReward} XP</span>
              <strong>{quest.title}</strong>
              <span className="node-copy">{quest.description}</span>
              <span className="node-deps">{quest.dependencies.length ? `REQ: ${quest.dependencies.join(' + ').toUpperCase()}` : 'ENTRY NODE'}</span>
            </button>
          ))}
        </div>
      </section>

      <footer><span>QUESTFORGE AI v1.0</span><span>PIXEL FORGE AI HACKATHON</span><span>PROGRESS SAVED LOCALLY</span></footer>

      {levelUp && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="level-title">
          <div className="level-modal"><p className="eyebrow">SYSTEM MILESTONE</p><h2 id="level-title">LEVEL UP!</h2><div className="level-number">{String(levelUp).padStart(2, '0')}</div><p>Your capacity expands. The next threshold is now active.</p><button autoFocus onClick={() => setLevelUp(null)}>CONTINUE QUESTING →</button></div>
        </div>
      )}
    </main>
  );
}
