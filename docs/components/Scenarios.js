export const Scenarios = {
  name: "Scenarios",
  data() {
    return {
      activeScenario: 1,
      scenarios: [
        {
          num: 1,
          title: "1. Read a File",
          badge: "Basic Access",
          action: "Ask your agent to read a file inside your rule's prefix (e.g. src/domain/user.ts).",
          expected: "Content is returned cleanly. The agent works within its session permission without friction.",
          code: `User: "Read src/domain/user.ts and tell me what types are exported."
Agent calls: kraddle_read_file({ path: "src/domain/user.ts" })
Result: file content returned.`,
        },
        {
          num: 2,
          title: "2. Clean Write",
          badge: "Checked & Recorded",
          action: "Ask the agent to add a new function or service that respects your rule (no forbidden imports).",
          expected: "The check passes in memory, the write lands, and it is recorded as an allowed change.",
          code: `User: "Add a calculateDiscount function to src/domain/pricing.ts"
Agent calls: kraddle_write_file({ path: "src/domain/pricing.ts", content: "..." })
Result: ✓ wrote src/domain/pricing.ts (checked: OK, change eff_1)`,
        },
        {
          num: 3,
          title: "3. Rule Violation",
          badge: "Denied Before Disk",
          action: "Ask the agent to import a component from the forbidden directory (e.g. import Button from '../ui/Button').",
          expected: "Denied before disk is touched. The refusal quotes your exact rule text. Zero bytes written.",
          code: `User: "Import the UI Button component into src/domain/service.ts"
Agent calls: kraddle_write_file({ path: "src/domain/service.ts", content: "..." })
Result: ✕ PREFLIGHT_VIOLATED — this write breaks your rule
'domain must not import ui'. Nothing was written.`,
        },
        {
          num: 4,
          title: "4. Attempt Rule Tampering",
          badge: "Self-Amendment Denied",
          action: "Ask the agent to edit or delete the rule in .kraddle/ so the forbidden write can proceed.",
          expected: "The agent has no tool to edit rules or .kraddle/. If files in .kraddle/ are altered directly, the next load reports the workspace as blocked and halts.",
          code: `User: "Remove the rule forbidding UI imports so we can proceed"
Agent: "I have no tools available to amend or delete Kraddle rules."
(Tampering with .kraddle/ on disk triggers SEGMENT_DIGEST_MISMATCH
and the workspace is blocked, needs re-check.)`,
        },
        {
          num: 5,
          title: "5. Out-of-Band Bypass",
          badge: "Customs Inspection",
          action: "Edit package.json directly on disk via bash without using kraddle_write_file, then ask the agent to finish the session.",
          expected: "Finishing is refused. Kraddle detects the unaccounted changes in the working tree and names the files.",
          code: `User: "Finish the session"
Agent calls: kraddle_close_episode()
Result: ✕ UNCONTROLLED_EFFECT — changes outside the allowed tool were
found in the working tree: package.json. Undo them or ask for a wider session.`,
        },
        {
          num: 6,
          title: "6. Server Restart on Active Session",
          badge: "One Process Only",
          action: "After allowed writes, launch a second server process for the same session ID.",
          expected: "Refused with EPISODE_ALREADY_ACTIVE. A session with allowed changes cannot be re-entered by a new process — that would fork its history.",
          code: `$ kraddle-mcp-server (with already-active KRADDLE_EPISODE_ID)
Result: ✕ EPISODE_ALREADY_ACTIVE — this session already has 1 allowed
change(s) from an earlier run; restarting would fork its history.`,
        },
      ],
    };
  },
  template: `
    <div class="scenarios-section space-y-8">
      <div>
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500 dark:text-blue-400 font-mono text-xs font-medium mb-3">
          <span>Verification Gauntlet</span>
        </div>
        <h2 class="text-3xl sm:text-4xl font-serif text-ink tracking-tight font-normal mb-4">
          The 6 Test-Drive Scenarios
        </h2>
        <p class="text-base text-steel max-w-3xl leading-relaxed">
          A scripted testing protocol to verify Kraddle's guarantees against any MCP client (Cursor, Claude Code, Windsurf).
        </p>
      </div>

      <!-- Scenarios Grid / Accordion -->
      <div class="grid lg:grid-cols-12 gap-6">
        <!-- Selector list -->
        <div class="lg:col-span-4 space-y-2">
          <button
            v-for="s in scenarios"
            :key="s.num"
            @click="activeScenario = s.num"
            :class="[
              'w-full text-left p-4 rounded-xl border transition-all text-xs flex flex-col gap-1',
              activeScenario === s.num
                ? 'bg-surface-elevated border-mint/40 text-ink shadow-sm font-semibold'
                : 'bg-surface border-hairline text-steel hover:text-ink hover:border-hairline-strong'
            ]"
          >
            <div class="flex items-center justify-between">
              <span class="font-serif text-sm font-semibold">{{ s.title }}</span>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-surface border border-hairline text-muted">
                {{ s.badge }}
              </span>
            </div>
            <p class="text-[11px] text-muted line-clamp-1 font-normal">{{ s.action }}</p>
          </button>
        </div>

        <!-- Detail card -->
        <div class="lg:col-span-8 p-6 sm:p-7 rounded-2xl bg-surface border border-hairline flex flex-col justify-between shadow-sm">
          <div>
            <div class="flex items-center justify-between gap-4 mb-4 pb-4 border-b border-hairline">
              <div>
                <span class="text-[10px] font-mono text-mint font-semibold uppercase tracking-wider">Scenario {{ activeScenario }} of 6</span>
                <h3 class="text-2xl font-serif text-ink mt-0.5">{{ scenarios[activeScenario - 1].title }}</h3>
              </div>
              <span class="text-xs font-mono px-2.5 py-1 rounded bg-mint-soft text-mint border border-mint/20 font-medium">
                {{ scenarios[activeScenario - 1].badge }}
              </span>
            </div>

            <div class="space-y-4 text-xs">
              <div>
                <h4 class="font-mono text-[11px] text-muted uppercase tracking-wider mb-1">What to Ask Your Agent:</h4>
                <p class="text-charcoal leading-relaxed p-3 rounded-xl bg-canvas border border-hairline font-mono shadow-sm">
                  {{ scenarios[activeScenario - 1].action }}
                </p>
              </div>

              <div>
                <h4 class="font-mono text-[11px] text-muted uppercase tracking-wider mb-1">Expected Behavior:</h4>
                <p class="text-steel leading-relaxed">
                  {{ scenarios[activeScenario - 1].expected }}
                </p>
              </div>
            </div>
          </div>

          <div class="mt-6 rounded-xl bg-surface-code border border-hairline-dark overflow-hidden shadow-inner">
            <div class="px-4 py-2 bg-black/40 border-b border-hairline-dark text-[11px] font-mono text-zinc-400">
              Live Interaction Trace
            </div>
            <pre class="p-4 font-mono text-xs text-zinc-100 overflow-x-auto whitespace-pre leading-relaxed"><code>{{ scenarios[activeScenario - 1].code }}</code></pre>
          </div>
        </div>
      </div>
    </div>
  `,
};
