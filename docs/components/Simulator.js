export const Simulator = {
  name: "Simulator",
  data() {
    return {
      currentStep: 1,
      totalSteps: 5,
      steps: [
        {
          num: 1,
          label: "1. Rule",
          badge: "Your Words",
          badgeColor: "text-mint bg-mint-soft border-mint/20",
          title: "The Rule: Your Words, Pinned",
          concept: "Rule pinning",
          desc: "You declare the rule in plain words. Kraddle pins it to your exact git commit and the dependency proof at that revision, storing it in .kraddle/.",
          codeTitle: "Human CLI",
          code: `$ kraddle rule add "domain must not import ui" \\
    --in src/domain --not-in src/ui

✓ rule CB-9a2f
✓ proof EV-d18e  (js-ts adapter, rough)`,
          note: "The rule is locked to repository state. No agent can weaken or alter it — there is no tool for that.",
        },
        {
          num: 2,
          label: "2. Session",
          badge: "Permission",
          badgeColor: "text-blue-500 bg-blue-500/10 border-blue-500/20",
          title: "The Session: A Bounded Hall Pass",
          concept: "Permission & scope",
          desc: "The agent works one session at a time. It gets a stated purpose, write permission bounded to src/domain/, and exactly three tools: read, write, finish.",
          codeTitle: "Session Start",
          code: `$ kraddle session start \\
    --intent "add billing service" --in src/domain

session EP-38d9f1 started (open).

plan:
  rules checked: 1
  can write to: src/domain/
  checks: js-ts adapter (rough)
  finish blocked by: rule violations, or changes
    made outside the write tool

→ MCP config printed, ready to paste into
  Cursor / Claude Code`,
          note: "The agent may only write inside src/domain/, and only through the write tool.",
        },
        {
          num: 3,
          label: "3. Blocked",
          badge: "Denied Before Disk",
          badgeColor: "text-rose-500 bg-rose-500/10 border-rose-500/20",
          title: "The Intercept: Denied With Your Rule Quoted",
          concept: "Check before write",
          desc: "The agent tries to write a file that imports from src/ui. Kraddle checks the imports in memory first, finds the violation, and denies the write. The file never exists.",
          codeTitle: "Tool Response (isError: true)",
          code: `[Agent calls kraddle_write_file with content:
 'import { Button } from "../ui/Button";']

✕ PREFLIGHT_VIOLATED — this write breaks your rule
  'domain must not import ui'. Nothing was written.

→ Filesystem: UNTOUCHED`,
          note: "The denial quotes your rule word-for-word, giving the agent exactly what it needs to self-correct.",
        },
        {
          num: 4,
          label: "4. Allowed",
          badge: "Allowed Change",
          badgeColor: "text-mint bg-mint-soft border-mint/20",
          title: "Clean Write: Checked and Recorded",
          concept: "Allowed changes",
          desc: "The agent reads the denial, fixes its implementation to use pure domain logic, and writes again. The check passes, the file lands, and the change is recorded in the session.",
          codeTitle: "Tool Response (isError: false)",
          code: `[Agent calls kraddle_write_file with pure domain code]

✓ wrote src/domain/billing.ts
  (checked: OK, change eff_8819a)`,
          note: "Only writes that passed the check count as allowed changes.",
        },
        {
          num: 5,
          label: "5. Finish",
          badge: "Customs Inspection",
          badgeColor: "text-purple-500 bg-purple-500/10 border-purple-500/20",
          title: "Finish: Nothing Changed Behind Kraddle's Back",
          concept: "Working-tree drift check",
          desc: "When the agent asks to finish, Kraddle compares the full working tree against the allowed changes. Anything edited outside the write tool — a terminal, a direct disk edit — refuses the finish, with the paths named.",
          codeTitle: "Finish Check",
          code: `[Agent calls kraddle_close_episode]

• allowed changes:   [ src/domain/billing.ts ]
• working tree:      [ src/domain/billing.ts ]
• unaccounted drift: NONE

✓ session EP-38d9f1 finished
  new state digest 4f21c9…`,
          note: "If package.json had been edited via a terminal, finish would refuse with UNCONTROLLED_EFFECT.",
        },
      ],
    };
  },
  methods: {
    setStep(num) {
      this.currentStep = num;
    },
    nextStep() {
      if (this.currentStep < this.totalSteps) {
        this.currentStep += 1;
      } else {
        this.currentStep = 1;
      }
    },
    prevStep() {
      if (this.currentStep > 1) {
        this.currentStep -= 1;
      }
    },
  },
  template: `
    <div class="simulator-card bg-surface border border-hairline rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
      <!-- Header -->
      <div class="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-hairline">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="inline-flex items-center justify-center w-6 h-6 rounded-md bg-mint/10 border border-mint/30 text-mint font-mono text-xs font-bold">K</span>
            <span class="text-xs font-mono font-medium tracking-wider text-muted uppercase">The Whole Loop</span>
          </div>
          <h3 class="text-2xl sm:text-3xl font-serif text-ink tracking-tight font-normal">The Life of a Session</h3>
        </div>

        <div class="flex items-center gap-2">
          <span class="flex h-2 w-2 relative">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-mint opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-mint"></span>
          </span>
          <span class="text-xs font-mono text-steel">Live Simulation Model</span>
        </div>
      </div>

      <!-- Step Navigation Tabs -->
      <div class="grid grid-cols-5 gap-2 my-6 p-1.5 bg-canvas border border-hairline rounded-xl">
        <button
          v-for="s in steps"
          :key="s.num"
          @click="setStep(s.num)"
          :class="[
            'py-2 px-1 text-xs font-medium rounded-lg transition-all text-center',
            currentStep === s.num
              ? 'bg-surface-elevated text-ink border border-hairline-strong shadow-sm font-semibold'
              : 'text-steel hover:text-ink hover:bg-surface'
          ]"
        >
          <span class="block sm:inline font-mono mr-1 text-[10px] text-muted">{{ s.num }}.</span>
          <span class="hidden sm:inline">{{ s.label.split('. ')[1] }}</span>
          <span class="sm:hidden">{{ s.label.split('. ')[1].slice(0, 3) }}</span>
        </button>
      </div>

      <!-- Main Stage -->
      <div class="grid lg:grid-cols-12 gap-6 items-stretch min-h-[360px]">
        <!-- Left Column: Story & Concept -->
        <div class="lg:col-span-5 flex flex-col justify-between py-2">
          <div>
            <div class="flex items-center gap-2 mb-3">
              <span :class="['text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full border', steps[currentStep - 1].badgeColor]">
                {{ steps[currentStep - 1].badge }}
              </span>
              <span class="text-xs text-muted font-mono">{{ steps[currentStep - 1].concept }}</span>
            </div>

            <h4 class="text-xl sm:text-2xl font-serif text-ink mb-3 leading-snug">
              {{ steps[currentStep - 1].title }}
            </h4>

            <p class="text-sm text-steel leading-relaxed mb-6 font-normal">
              {{ steps[currentStep - 1].desc }}
            </p>
          </div>

          <div class="p-3.5 rounded-xl bg-canvas border border-hairline text-xs text-steel shadow-sm">
            <div class="flex items-start gap-2">
              <span class="text-mint font-bold">💡</span>
              <span class="leading-relaxed">{{ steps[currentStep - 1].note }}</span>
            </div>
          </div>
        </div>

        <!-- Right Column: Interactive Terminal / Telemetry -->
        <div class="lg:col-span-7 flex flex-col">
          <div class="h-full bg-surface-code rounded-xl border border-hairline-dark overflow-hidden flex flex-col shadow-inner">
            <!-- Terminal Header -->
            <div class="flex items-center justify-between px-4 py-2.5 bg-black/40 border-b border-hairline-dark text-xs">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full bg-rose-500/80"></span>
                <span class="w-2.5 h-2.5 rounded-full bg-amber-500/80"></span>
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></span>
                <span class="ml-2 font-mono text-[11px] text-zinc-400">{{ steps[currentStep - 1].codeTitle }}</span>
              </div>
              <span class="text-[10px] font-mono text-zinc-500">Step {{ currentStep }} of {{ totalSteps }}</span>
            </div>

            <!-- Terminal Body -->
            <div class="p-4 sm:p-5 font-mono text-xs text-zinc-100 flex-1 overflow-x-auto leading-relaxed whitespace-pre selection:bg-mint/25 selection:text-white">
{{ steps[currentStep - 1].code }}
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom Controls -->
      <div class="flex items-center justify-between pt-6 mt-6 border-t border-hairline">
        <button
          @click="prevStep"
          :disabled="currentStep === 1"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-hairline text-xs font-medium text-steel hover:text-ink hover:border-hairline-strong disabled:opacity-30 disabled:pointer-events-none transition-all"
        >
          ← Previous Step
        </button>

        <!-- Progress Dots -->
        <div class="flex items-center gap-2">
          <button
            v-for="s in steps"
            :key="s.num"
            @click="setStep(s.num)"
            class="group p-1"
          >
            <span
              :class="[
                'block rounded-full transition-all duration-300',
                currentStep === s.num ? 'w-6 h-1.5 bg-mint' : 'w-1.5 h-1.5 bg-steel/30 group-hover:bg-steel/60'
              ]"
            ></span>
          </button>
        </div>

        <button
          @click="nextStep"
          class="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-mint text-white dark:text-black font-semibold text-xs hover:bg-mint-deep transition-all shadow-sm"
        >
          <span>{{ currentStep === totalSteps ? 'Restart ↺' : 'Next Step →' }}</span>
        </button>
      </div>
    </div>
  `,
};
