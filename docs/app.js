import { createApp } from "./vendor/vue.esm-browser.js";
import { Simulator } from "./components/Simulator.js";
import { Quickstart } from "./components/Quickstart.js";
import { Scenarios } from "./components/Scenarios.js";
import { CodexIndex } from "./components/CodexIndex.js";
import { SearchModal } from "./components/SearchModal.js";

const App = {
  name: "KraddleDocsApp",
  components: {
    Simulator,
    Quickstart,
    Scenarios,
    CodexIndex,
    SearchModal,
  },
  data() {
    return {
      activePage: "journey", // "journey" | "scenarios" | "codex"
      isSearchOpen: false,
      mobileMenuOpen: false,
      isDark: document.documentElement.classList.contains("dark"),
    };
  },
  mounted() {
    // Keyboard shortcut for Ctrl+K / Cmd+K
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        this.isSearchOpen = true;
      }
    });

    // Hash change detection
    window.addEventListener("hashchange", this.handleHash);
    this.handleHash();
  },
  methods: {
    toggleTheme() {
      this.isDark = !this.isDark;
      if (this.isDark) {
        document.documentElement.classList.add("dark");
        localStorage.setItem("kraddle-theme", "dark");
      } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("kraddle-theme", "light");
      }
    },
    setPage(page, anchor = null) {
      this.activePage = page;
      this.mobileMenuOpen = false;
      if (anchor) {
        this.$nextTick(() => {
          const el = document.querySelector(anchor);
          if (el) el.scrollIntoView({ behavior: "smooth" });
        });
      } else {
        window.scrollTo({ top: 0, behavior: "instant" });
      }
    },
    handleHash() {
      const hash = window.location.hash;
      if (hash.startsWith("#scenarios")) {
        this.activePage = "scenarios";
      } else if (hash.startsWith("#codex")) {
        this.activePage = "codex";
      } else {
        this.activePage = "journey";
      }
    },
    handleSearchSelect(item) {
      this.setPage(item.section, item.anchor);
    },
  },
  template: `
    <div class="kraddle-app min-h-screen bg-canvas text-charcoal font-sans transition-colors duration-200">
      <!-- Search Modal Dialog -->
      <SearchModal
        :isOpen="isSearchOpen"
        @close="isSearchOpen = false"
        @select="handleSearchSelect"
      />

      <!-- Fixed Top Navigation -->
      <header class="topbar">
        <div class="flex items-center gap-6">
          <a href="#" @click.prevent="setPage('journey')" class="flex items-center gap-2.5 text-ink hover:opacity-90 transition-opacity">
            <span class="w-6 h-6 rounded-lg bg-mint/10 border border-mint/30 flex items-center justify-center text-mint font-mono font-bold text-xs">
              K
            </span>
            <span class="font-serif text-lg font-medium tracking-tight text-ink">kraddle</span>
            <span class="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border border-hairline text-muted bg-surface">
              Rules · Sessions · Checks
            </span>
          </a>

          <!-- Navigation Pills in Header -->
          <nav class="hidden md:flex items-center gap-1 text-xs">
            <button
              @click="setPage('journey')"
              :class="[
                'px-3.5 py-1.5 rounded-full transition-all',
                activePage === 'journey' ? 'bg-surface-elevated text-ink font-semibold border border-hairline shadow-sm' : 'text-steel hover:text-ink'
              ]"
            >
              The Loop
            </button>
            <button
              @click="setPage('scenarios')"
              :class="[
                'px-3.5 py-1.5 rounded-full transition-all',
                activePage === 'scenarios' ? 'bg-surface-elevated text-ink font-semibold border border-hairline shadow-sm' : 'text-steel hover:text-ink'
              ]"
            >
              Test-Drive
            </button>
            <button
              @click="setPage('codex')"
              :class="[
                'px-3.5 py-1.5 rounded-full transition-all',
                activePage === 'codex' ? 'bg-surface-elevated text-ink font-semibold border border-hairline shadow-sm' : 'text-steel hover:text-ink'
              ]"
            >
              The Codex
            </button>
          </nav>
        </div>

        <!-- Right Header Elements: Search, Theme Toggle, Badge -->
        <div class="flex items-center gap-3">
          <!-- Search Trigger Button -->
          <button
            @click="isSearchOpen = true"
            class="flex items-center gap-3 px-3.5 py-1.5 rounded-xl bg-surface border border-hairline hover:border-hairline-strong text-steel text-xs transition-colors w-40 sm:w-64 justify-between"
          >
            <div class="flex items-center gap-2">
              <svg class="w-3.5 h-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span class="hidden sm:inline">Search docs...</span>
              <span class="sm:hidden">Search...</span>
            </div>
            <kbd class="px-1.5 py-0.5 rounded bg-surface-elevated border border-hairline text-[10px] font-mono text-muted">Ctrl K</kbd>
          </button>

          <!-- Theme Switcher Button -->
          <button
            @click="toggleTheme"
            :title="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
            class="p-2 rounded-xl bg-surface border border-hairline hover:border-hairline-strong text-steel hover:text-ink transition-colors flex items-center justify-center"
            aria-label="Toggle Theme"
          >
            <!-- Sun Icon (shown when dark to switch to light) -->
            <svg v-if="isDark" class="w-4 h-4 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <!-- Moon Icon (shown when light to switch to dark) -->
            <svg v-else class="w-4 h-4 text-steel" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          </button>

          <a
            href="https://github.com/ogment-inc/kraddle"
            target="_blank"
            class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-hairline hover:border-hairline-strong text-steel hover:text-ink text-xs transition-colors"
          >
            <span>v0.5 Alpha</span>
          </a>

          <!-- Mobile hamburger -->
          <button
            @click="mobileMenuOpen = !mobileMenuOpen"
            class="md:hidden p-2 rounded-lg bg-surface border border-hairline text-steel hover:text-ink"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7" />
            </svg>
          </button>
        </div>
      </header>

      <!-- Mobile Dropdown Menu -->
      <div v-if="mobileMenuOpen" class="md:hidden fixed inset-x-0 top-16 bg-surface-elevated border-b border-hairline p-4 z-30 space-y-3">
        <button @click="setPage('journey')" class="w-full text-left p-2 rounded-lg text-sm text-ink hover:bg-surface">The Loop</button>
        <button @click="setPage('scenarios')" class="w-full text-left p-2 rounded-lg text-sm text-ink hover:bg-surface">Test-Drive</button>
        <button @click="setPage('codex')" class="w-full text-left p-2 rounded-lg text-sm text-ink hover:bg-surface">The Codex & Index</button>
        <div class="pt-2 border-t border-hairline flex items-center justify-between">
          <span class="text-xs text-steel">Theme Mode</span>
          <button
            @click="toggleTheme"
            class="px-3 py-1 rounded-lg bg-surface border border-hairline text-xs text-ink flex items-center gap-2"
          >
            <span>{{ isDark ? 'Dark Mode' : 'Light Mode' }}</span>
          </button>
        </div>
      </div>

      <!-- App 3-Column Shell -->
      <div class="app-shell">
        <!-- Left Sidebar Navigation -->
        <aside class="sidebar-rail text-xs">
          <nav class="space-y-6">
            <div>
              <span class="text-[10px] font-mono uppercase tracking-wider text-muted px-3 block mb-2 font-semibold">
                THE LOOP
              </span>
              <div class="space-y-0.5">
                <button
                  @click="setPage('journey', '#hero')"
                  :class="[
                    'w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between',
                    activePage === 'journey' ? 'text-ink bg-surface font-medium' : 'text-steel hover:text-ink'
                  ]"
                >
                  <span>Why Kraddle</span>
                  <span v-if="activePage === 'journey'" class="w-1.5 h-1.5 rounded-full bg-mint"></span>
                </button>
                <button
                  @click="setPage('journey', '#quickstart')"
                  class="w-full text-left px-3 py-2 rounded-lg text-steel hover:text-ink transition-colors"
                >
                  Quickstart
                </button>
                <button
                  @click="setPage('journey', '#simulator')"
                  class="w-full text-left px-3 py-2 rounded-lg text-steel hover:text-ink transition-colors"
                >
                  See It Work
                </button>
              </div>
            </div>

            <div>
              <span class="text-[10px] font-mono uppercase tracking-wider text-muted px-3 block mb-2 font-semibold">
                VERIFICATION
              </span>
              <div class="space-y-0.5">
                <button
                  @click="setPage('scenarios')"
                  :class="[
                    'w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between',
                    activePage === 'scenarios' ? 'text-ink bg-surface font-medium' : 'text-steel hover:text-ink'
                  ]"
                >
                  <span>The 6 Scenarios</span>
                  <span v-if="activePage === 'scenarios'" class="w-1.5 h-1.5 rounded-full bg-mint"></span>
                </button>
              </div>
            </div>

            <div>
              <span class="text-[10px] font-mono uppercase tracking-wider text-muted px-3 block mb-2 font-semibold">
                REFERENCE CODEX
              </span>
              <div class="space-y-0.5">
                <button
                  @click="setPage('codex')"
                  :class="[
                    'w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between',
                    activePage === 'codex' ? 'text-ink bg-surface font-medium' : 'text-steel hover:text-ink'
                  ]"
                >
                  <span>Commands & Refusals</span>
                  <span v-if="activePage === 'codex'" class="w-1.5 h-1.5 rounded-full bg-mint"></span>
                </button>
              </div>
            </div>
          </nav>
        </aside>

        <!-- Center Main Content -->
        <main class="main-content">
          <!-- PAGE 1: THE LOOP -->
          <div v-if="activePage === 'journey'" class="space-y-24">
            <!-- Hero Section -->
            <section id="hero" class="space-y-6 pt-4">
              <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface border border-hairline text-steel font-mono text-xs">
                <span class="w-2 h-2 rounded-full bg-mint"></span>
                <span>Rules your agent cannot quietly break</span>
              </div>

              <h1 class="text-4xl sm:text-6xl font-serif text-ink tracking-tight font-normal leading-[1.08] max-w-3xl">
                Declare a rule. Watch the agent respect it.
              </h1>

              <p class="text-lg sm:text-xl text-steel leading-relaxed max-w-2xl font-normal">
                Say what must stay true — "domain must not import ui" — in your own words.
                Every agent write is checked against it first, violations are denied with your rule quoted back,
                and changes made behind the tool's back refuse to pass the final check.
              </p>

              <div class="flex flex-wrap items-center gap-3 pt-2">
                <button
                  @click="setPage('journey', '#quickstart')"
                  class="px-6 py-2.5 rounded-full bg-mint text-white dark:text-black font-semibold text-xs hover:bg-mint-deep transition-all shadow-md"
                >
                  Start with kraddle try →
                </button>
                <button
                  @click="setPage('journey', '#simulator')"
                  class="px-6 py-2.5 rounded-full bg-surface border border-hairline hover:border-hairline-strong text-ink font-medium text-xs transition-colors"
                >
                  See the whole loop
                </button>
              </div>
            </section>

            <!-- Quickstart -->
            <section id="quickstart">
              <Quickstart />
            </section>

            <!-- Simulator Component ("The Box") -->
            <section id="simulator">
              <Simulator />
            </section>

            <!-- Bottom Callout to Codex -->
            <section class="p-8 rounded-2xl bg-surface border border-hairline flex flex-col sm:flex-row items-center justify-between gap-6">
              <div>
                <h3 class="text-2xl font-serif text-ink mb-1">Every command, every refusal message.</h3>
                <p class="text-xs text-steel">The full CLI surface and what Kraddle says when it stops an agent — plain words, no codes to decode.</p>
              </div>
              <button
                @click="setPage('codex')"
                class="px-6 py-2.5 rounded-full bg-ink text-canvas hover:opacity-90 font-semibold text-xs transition-all flex-shrink-0 shadow-sm"
              >
                Open The Codex & Index →
              </button>
            </section>
          </div>

          <!-- PAGE 2: THE 6 SCENARIOS -->
          <div v-else-if="activePage === 'scenarios'">
            <Scenarios />
          </div>

          <!-- PAGE 3: THE CODEX & DIRECTORY -->
          <div v-else-if="activePage === 'codex'">
            <CodexIndex />
          </div>
        </main>

        <!-- Right TOC Rail -->
        <aside class="toc-rail text-xs">
          <div v-if="activePage === 'journey'" class="space-y-3">
            <span class="text-[10px] font-mono uppercase tracking-wider text-muted block font-semibold">ON THIS PAGE</span>
            <div class="space-y-1">
              <a href="#hero" class="block py-1 text-steel hover:text-ink transition-colors">Why Kraddle</a>
              <a href="#quickstart" class="block py-1 text-steel hover:text-ink transition-colors">Quickstart</a>
              <a href="#simulator" class="block py-1 text-steel hover:text-ink transition-colors">See It Work</a>
            </div>
          </div>
          <div v-else-if="activePage === 'scenarios'" class="space-y-3">
            <span class="text-[10px] font-mono uppercase tracking-wider text-muted block font-semibold">TEST SCENARIOS</span>
            <div class="text-steel text-[11px] leading-relaxed">
              Verify each guarantee against your agent client.
            </div>
          </div>
          <div v-else-if="activePage === 'codex'" class="space-y-3">
            <span class="text-[10px] font-mono uppercase tracking-wider text-muted block font-semibold">SEARCH DIRECTORY</span>
            <div class="text-steel text-[11px] leading-relaxed">
              Use the filter bar or press Ctrl+K to find any command or refusal.
            </div>
          </div>
        </aside>
      </div>

      <!-- Footer -->
      <footer class="border-t border-hairline py-12 mt-24 text-center text-xs text-muted">
        <div class="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="flex items-center gap-2">
            <span class="font-serif text-sm text-ink">kraddle</span>
            <span>—</span>
            <span>Rules your agent cannot quietly break</span>
          </div>
          <div class="font-mono text-[11px]">
            Zero External Dependencies · Local-First
          </div>
        </div>
      </footer>
    </div>
  `,
};

createApp(App).mount("#app");
