/**
 * Бій із босом як чиста машина станів: (спроба, бос, дія) → нова спроба.
 *
 * Бос — продакшн-інцидент із кількох фаз. Ресурс гравця один — бюджет
 * помилок (як error budget у SLO): кожна хибна гіпотеза чи підказка
 * «спалює» хвилини доступності. Бюджет на нулі — інцидент ескалює, спробу
 * програно. Жодного таймера реального часу: бій покроковий і детермінований,
 * тому його можна зберегти посеред фази й продовжити після перезавантаження.
 *
 * Журнал спроби (`log`) — сировина для постмортему: саме з нього будується
 * таймлайн «що ми думали і що виявилось».
 */

export const MAX_LOG = 200;

export function startAttempt(boss) {
  return {
    bossId: boss.id,
    phase: 0,
    budget: boss.budget,
    maxBudget: boss.budget,
    log: [{ type: "start", phase: 0, text: boss.alert ?? boss.title }],
    usedTools: [],
    hints: {},
    status: "active",
  };
}

function push(attempt, entry) {
  return [...attempt.log, entry].slice(-MAX_LOG);
}

/** Скільки підказок фази ще можна взяти. Остання одиниця бюджету на підказку не йде. */
export function canTakeHint(attempt, boss) {
  const phase = boss.phases[attempt.phase];
  if (!phase || attempt.status !== "active") return false;
  const taken = attempt.hints[phase.id] ?? 0;
  return taken < (phase.hints?.length ?? 0) && attempt.budget > 1;
}

/** Чи можна застосувати інструмент у поточній фазі. */
export function canUseTool(attempt, boss, tool) {
  if (attempt.status !== "active" || attempt.usedTools.includes(tool.id)) return false;
  const phase = boss.phases[attempt.phase];
  if (!phase) return false;
  if (tool.effect === "reveal") return Boolean(phase.tools?.[tool.id]);
  if (tool.effect === "assist") return phase.kind !== "codeQuest" && phase.kind !== "sqlQuest";
  return true;
}

/**
 * @param action {type:"mistake", text} | {type:"hint"} | {type:"tool", tool} | {type:"clear", text}
 */
export function bossReduce(attempt, boss, action) {
  if (attempt.status !== "active") return attempt;
  const phaseIndex = attempt.phase;
  const phase = boss.phases[phaseIndex];

  switch (action.type) {
    case "mistake": {
      const budget = attempt.budget - 1;
      let log = push(attempt, { type: "mistake", phase: phaseIndex, text: action.text ?? "" });
      if (budget <= 0) {
        log = [...log, { type: "lost", phase: phaseIndex, text: phase?.title ?? "" }].slice(-MAX_LOG);
        return { ...attempt, budget: 0, log, status: "lost" };
      }
      return { ...attempt, budget, log };
    }
    case "hint": {
      if (!canTakeHint(attempt, boss)) return attempt;
      const taken = attempt.hints[phase.id] ?? 0;
      return {
        ...attempt,
        budget: attempt.budget - 1,
        hints: { ...attempt.hints, [phase.id]: taken + 1 },
        log: push(attempt, { type: "hint", phase: phaseIndex, text: phase.hints[taken] }),
      };
    }
    case "tool": {
      const tool = action.tool;
      if (!canUseTool(attempt, boss, tool)) return attempt;
      const budget = tool.effect === "budget" ? attempt.budget + 1 : attempt.budget;
      return {
        ...attempt,
        budget,
        usedTools: [...attempt.usedTools, tool.id],
        log: push(attempt, { type: "tool", phase: phaseIndex, text: tool.title }),
      };
    }
    case "clear": {
      const next = phaseIndex + 1;
      const log = push(attempt, { type: "clear", phase: phaseIndex, text: action.text ?? phase?.title ?? "" });
      if (next >= boss.phases.length) {
        return { ...attempt, phase: next, log: [...log, { type: "won", phase: phaseIndex, text: "" }].slice(-MAX_LOG), status: "won" };
      }
      return { ...attempt, phase: next, log };
    }
    default:
      return attempt;
  }
}

/** Здоров'я боса — фази, які ще треба пройти. */
export function bossHp(attempt, boss) {
  return Math.max(0, boss.phases.length - attempt.phase);
}

export function attemptSummary(attempt) {
  const count = (type) => attempt.log.filter((entry) => entry.type === type).length;
  return {
    spent: attempt.maxBudget - attempt.budget + (attempt.usedTools.includes("coffee") ? 1 : 0),
    mistakes: count("mistake"),
    hints: count("hint"),
    tools: attempt.usedTools.length,
    cleared: count("clear"),
  };
}
