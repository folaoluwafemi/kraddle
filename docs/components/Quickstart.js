export const Quickstart = {
  name: "Quickstart",
  data() {
    return {
      copiedIndex: null,
      steps: [
        {
          num: 1,
          title: "Build Kraddle",
          desc: "One-time build. Rust stable + git on PATH. No runtime dependencies after that.",
          code: `git clone https://github.com/ogment-inc/kraddle.git
cd kraddle/rust
cargo build --release`,
        },
        {
          num: 2,
          title: "See It Work in 60 Seconds",
          desc: "kraddle try makes a throwaway repo, declares one rule, starts a session, and prints a pasteable MCP config. No setup.",
          code: `kraddle try "add checkout behavior"`,
        },
        {
          num: 3,
          title: "Declare a Rule in Your Own Repo",
          desc: "Your words become a checked rule, pinned to your current commit.",
          code: `cd /path/to/your/repo
kraddle init
kraddle rule add "domain must not import ui" --in src/domain --not-in src/ui`,
        },
        {
          num: 4,
          title: "Start a Session",
          desc: "Prints a short plan and a ready-to-paste MCP JSON block — no env vars to assemble by hand.",
          code: `kraddle session start \\
  --intent "add a small domain service" \\
  --in src/domain`,
        },
        {
          num: 5,
          title: "Connect Any MCP Agent",
          desc: "Paste the printed block into Cursor, Claude Code, or any MCP client. The agent gets exactly three tools: read, write (checked first), and finish.",
          code: `{
  "mcpServers": {
    "kraddle": {
      "command": "kraddle-mcp-server",
      "env": {
        "KRADDLE_REPO": "/path/to/your/repo",
        "KRADDLE_WORKSPACE_DIR": "/path/to/your/repo",
        "KRADDLE_EPISODE_ID": "<printed session id>",
        "KRADDLE_BASE_EVIDENCE_ID": "<printed proof id>"
      }
    }
  }
}`,
        },
      ],
    };
  },
  methods: {
    async copyCode(text, index) {
      await navigator.clipboard.writeText(text);
      this.copiedIndex = index;
      setTimeout(() => {
        this.copiedIndex = null;
      }, 1500);
    },
  },
  template: `
    <div class="quickstart-section space-y-8">
      <div>
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-mint-soft border border-mint/20 text-mint font-mono text-xs font-medium mb-3">
          <span>Get Started</span>
        </div>
        <h2 class="text-3xl sm:text-4xl font-serif text-ink tracking-tight font-normal mb-4">
          Quickstart: Rules → Sessions → Checks
        </h2>
        <p class="text-base text-steel max-w-3xl leading-relaxed">
          Declare a rule in your own words, start a bounded session, and watch a violating write get denied with your rule quoted back.
        </p>
      </div>

      <!-- Steps Stack -->
      <div class="space-y-6">
        <div
          v-for="(step, idx) in steps"
          :key="step.num"
          class="p-6 sm:p-7 rounded-2xl bg-surface border border-hairline relative"
        >
          <div class="flex items-start gap-4 mb-3">
            <span class="flex-shrink-0 w-7 h-7 rounded-full bg-mint/10 border border-mint/30 text-mint font-mono font-bold text-xs flex items-center justify-center">
              {{ step.num }}
            </span>
            <div class="flex-1">
              <h3 class="text-lg font-serif text-ink mb-1">{{ step.title }}</h3>
              <p class="text-xs text-steel leading-relaxed">{{ step.desc }}</p>
            </div>
          </div>

          <div class="mt-4 relative rounded-xl bg-surface-code border border-hairline-dark overflow-hidden">
            <div class="flex items-center justify-between px-4 py-2 bg-black/40 border-b border-hairline-dark text-[11px] font-mono text-muted">
              <span>Terminal / Configuration</span>
              <button
                @click="copyCode(step.code, idx)"
                class="px-2.5 py-1 rounded bg-white/5 border border-hairline hover:bg-white/10 text-steel hover:text-ink text-[10px] font-mono transition-colors"
              >
                {{ copiedIndex === idx ? '✓ Copied' : 'Copy' }}
              </button>
            </div>
            <pre class="p-4 font-mono text-xs text-charcoal overflow-x-auto whitespace-pre leading-relaxed"><code>{{ step.code }}</code></pre>
          </div>
        </div>
      </div>
    </div>
  `,
};
