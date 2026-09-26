import { CLI_COMMANDS, DENIAL_CODES } from "../data/referenceData.js";

export const CodexIndex = {
  name: "CodexIndex",
  data() {
    return {
      searchFilter: "",
      activeTab: "commands",
      commands: CLI_COMMANDS,
      denials: DENIAL_CODES,
    };
  },
  computed: {
    filteredCommands() {
      const q = this.searchFilter.trim().toLowerCase();
      if (!q) return this.commands;
      return this.commands.filter(
        (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.summary.toLowerCase().includes(q)
      );
    },
    filteredDenials() {
      const q = this.searchFilter.trim().toLowerCase();
      if (!q) return this.denials;
      return this.denials.filter(
        (d) => d.code.toLowerCase().includes(q) || d.summary.toLowerCase().includes(q) || d.explanation.toLowerCase().includes(q)
      );
    },
  },
  template: `
    <div class="codex-index space-y-8">
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-mint-soft border border-mint/20 text-mint font-mono text-xs font-medium mb-3">
            <span>The Codex</span>
          </div>
          <h2 class="text-3xl sm:text-4xl font-serif text-ink tracking-tight font-normal mb-2">
            Reference Directory & Index
          </h2>
          <p class="text-base text-steel max-w-2xl leading-relaxed">
            Every CLI command and every refusal message, in one place. Rules, sessions, proof — no jargon.
          </p>
        </div>

        <!-- Filter Input -->
        <div class="w-full md:w-72">
          <div class="relative">
            <input
              type="text"
              v-model="searchFilter"
              placeholder="Filter (e.g. session, write, denied)..."
              class="w-full bg-surface border border-hairline rounded-xl px-4 py-2.5 text-xs text-ink placeholder-muted focus:outline-none focus:border-mint transition-colors"
            />
            <span v-if="searchFilter" @click="searchFilter = ''" class="absolute right-3 top-2.5 text-xs text-muted hover:text-ink cursor-pointer">✕</span>
          </div>
        </div>
      </div>

      <!-- Tab Buttons -->
      <div class="flex items-center gap-2 border-b border-hairline pb-4 overflow-x-auto">
        <button
          @click="activeTab = 'commands'"
          :class="[
            'px-4 py-2 rounded-full text-xs font-medium transition-all whitespace-nowrap',
            activeTab === 'commands' ? 'bg-ink text-canvas font-semibold shadow-sm' : 'text-steel hover:text-ink hover:bg-surface'
          ]"
        >
          CLI Commands ({{ filteredCommands.length }})
        </button>

        <button
          @click="activeTab = 'denials'"
          :class="[
            'px-4 py-2 rounded-full text-xs font-medium transition-all whitespace-nowrap',
            activeTab === 'denials' ? 'bg-ink text-canvas font-semibold shadow-sm' : 'text-steel hover:text-ink hover:bg-surface'
          ]"
        >
          Refusals ({{ filteredDenials.length }})
        </button>
      </div>

      <!-- Content Views -->
      <!-- Tab 1: Commands -->
      <div v-if="activeTab === 'commands'" class="space-y-6">
        <div
          v-for="cmd in filteredCommands"
          :key="cmd.name"
          class="p-6 rounded-2xl bg-surface border border-hairline hover:border-hairline-strong transition-all"
        >
          <div class="flex flex-wrap items-center justify-between gap-3 mb-2">
            <h3 class="font-mono text-base font-semibold text-mint">{{ cmd.name }}</h3>
            <span class="text-[11px] font-mono text-muted">{{ cmd.usage }}</span>
          </div>

          <p class="text-xs text-charcoal font-medium mb-3">{{ cmd.summary }}</p>
          <p class="text-xs text-steel leading-relaxed mb-4">{{ cmd.description }}</p>

          <div v-if="cmd.options && cmd.options.length" class="mb-4 pt-3 border-t border-hairline">
            <span class="text-[10px] font-mono text-muted uppercase tracking-wider block mb-2">Options:</span>
            <div class="grid gap-1.5">
              <div v-for="opt in cmd.options" :key="opt.flag" class="text-xs flex items-baseline gap-3">
                <code class="text-mint font-mono text-[11px] flex-shrink-0">{{ opt.flag }}</code>
                <span class="text-steel text-xs">{{ opt.desc }}</span>
              </div>
            </div>
          </div>

          <div class="p-3 rounded-xl bg-surface-code border border-hairline-dark text-xs font-mono text-zinc-300">
            <span class="text-zinc-500 mr-2">Example:</span>
            <span class="text-zinc-100">{{ cmd.example }}</span>
          </div>
        </div>
      </div>

      <!-- Tab 2: Denials -->
      <div v-if="activeTab === 'denials'" class="space-y-4">
        <div
          v-for="d in filteredDenials"
          :key="d.code"
          class="p-5 rounded-2xl bg-surface border border-hairline hover:border-hairline-strong transition-all"
        >
          <div class="flex flex-wrap items-center justify-between gap-3 mb-2">
            <div class="flex items-center gap-2">
              <span
                :class="[
                  'w-2 h-2 rounded-full',
                  d.severity === 'error' ? 'bg-rose-500' : 'bg-amber-400'
                ]"
              ></span>
              <h3 class="font-mono text-sm font-bold text-ink">{{ d.code }}</h3>
            </div>
            <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-elevated text-muted border border-hairline">
              {{ d.badge }}
            </span>
          </div>

          <p class="text-xs text-charcoal font-medium mb-2">{{ d.summary }}</p>
          <p class="text-xs text-steel leading-relaxed mb-3">{{ d.explanation }}</p>

          <div class="p-3 rounded-xl bg-canvas border border-hairline text-[11px] font-mono text-muted">
            <strong class="text-steel">Fix / Action:</strong> {{ d.detail }}
          </div>
        </div>
      </div>
    </div>
  `,
};
