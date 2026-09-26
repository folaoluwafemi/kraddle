import { SEARCH_INDEX } from "../data/searchIndex.js";

export const SearchModal = {
  name: "SearchModal",
  props: {
    isOpen: Boolean,
  },
  emits: ["close", "select"],
  data() {
    return {
      query: "",
      items: SEARCH_INDEX,
    };
  },
  computed: {
    results() {
      const q = this.query.trim().toLowerCase();
      if (!q) return this.items.slice(0, 8);
      return this.items.filter((item) => {
        return (
          item.title.toLowerCase().includes(q) ||
          item.excerpt.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          (item.keywords && item.keywords.toLowerCase().includes(q))
        );
      });
    },
  },
  watch: {
    isOpen(val) {
      if (val) {
        this.query = "";
        this.$nextTick(() => {
          this.$refs.searchInput?.focus();
        });
      }
    },
  },
  methods: {
    select(item) {
      this.$emit("select", item);
      this.$emit("close");
    },
  },
  template: `
    <div v-if="isOpen" class="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
      <!-- Backdrop -->
      <div @click="$emit('close')" class="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"></div>

      <!-- Modal Dialog -->
      <div class="relative w-full max-w-xl bg-surface-elevated border border-hairline-strong rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh]">
        <!-- Search Input Bar -->
        <div class="flex items-center px-4 py-3.5 border-b border-hairline gap-3">
          <svg class="w-4 h-4 text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref="searchInput"
            type="text"
            v-model="query"
            placeholder="Search documentation, commands, denial codes, concepts..."
            class="w-full bg-transparent text-sm text-ink placeholder-muted focus:outline-none"
            @keydown.esc="$emit('close')"
          />
          <kbd class="px-2 py-0.5 rounded bg-surface border border-hairline text-[10px] font-mono text-muted">ESC</kbd>
        </div>

        <!-- Results List -->
        <div class="p-2 overflow-y-auto flex-1 space-y-1">
          <div v-if="results.length === 0" class="p-8 text-center text-xs text-muted">
            No documentation matching "<span class="text-ink font-semibold">{{ query }}</span>"
          </div>

          <button
            v-for="res in results"
            :key="res.id"
            @click="select(res)"
            class="w-full text-left p-3 rounded-xl hover:bg-surface transition-colors flex items-start justify-between gap-4 group"
          >
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-mint-soft text-mint border border-mint/20">
                  {{ res.category }}
                </span>
                <span class="text-xs font-serif font-semibold text-ink group-hover:text-mint transition-colors">
                  {{ res.title }}
                </span>
              </div>
              <p class="text-[11px] text-steel line-clamp-1">{{ res.excerpt }}</p>
            </div>
            <span class="text-xs text-muted group-hover:text-ink">→</span>
          </button>
        </div>

        <!-- Footer -->
        <div class="px-4 py-2.5 bg-surface border-t border-hairline flex items-center justify-between text-[11px] font-mono text-muted">
          <span>Navigate with click or Enter</span>
          <span>Kraddle Search</span>
        </div>
      </div>
    </div>
  `,
};
