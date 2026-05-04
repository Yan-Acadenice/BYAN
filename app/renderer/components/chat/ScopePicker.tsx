// ScopePicker — collapsible panel for hierarchical chat context scope.
//
// WHY: the backend uses scope_snapshot to inject project/knowledge/memory
// context into the CLI prompt. Without it, the CLI uses its global default
// (the BYAN platform project) regardless of which project you're chatting about.
//
// Three toggleable sections: project, knowledge, memory.
// Token budget controls the total context injected per message.

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ByanProject, ChatScope } from '../../../shared/ipc-contract';

const DEFAULT_SCOPE: ChatScope = {
  types: [],
  projectId: null,
  knowledgeTags: [],
  memoryTags: [],
  memoryLimit: 10,
  knowledgeLimit: 10,
  tokenBudget: 2000,
};

// ---------- TagInput ----------

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

function TagInput({ tags, onChange, placeholder }: TagInputProps) {
  const [input, setInput] = useState('');

  const addTag = (raw: string) => {
    const parts = raw.split(',').map((t) => t.trim()).filter(Boolean);
    const next = [...new Set([...tags, ...parts])];
    onChange(next);
    setInput('');
  };

  const removeTag = (tag: string) => onChange(tags.filter((t) => t !== tag));

  return (
    <div>
      <div className="flex flex-wrap gap-xs mb-xs">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-xs px-xs py-0.5 rounded-md bg-byan-900/30 text-byan-300 text-[11px] border border-byan-700/40"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="hover:text-red-400 transition-colors leading-none"
              aria-label={`Remove tag ${tag}`}
            >
              x
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
            e.preventDefault();
            addTag(input);
          }
        }}
        onBlur={() => { if (input.trim()) addTag(input); }}
        placeholder={placeholder ?? 'tag1, tag2...'}
        className="w-full bg-ink-800 border border-ink-700 rounded-lg px-xs py-xs text-xs text-ink-200 focus:outline-none focus:border-byan-500 placeholder-ink-600"
      />
    </div>
  );
}

// ---------- SectionHeader ----------

interface SectionHeaderProps {
  title: string;
  enabled: boolean;
  onToggle: (on: boolean) => void;
  expanded: boolean;
  onExpandToggle: () => void;
}

function SectionHeader({ title, enabled, onToggle, expanded, onExpandToggle }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-xs px-sm py-sm bg-ink-850 border-b border-ink-800">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onToggle(e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        className="w-3.5 h-3.5 accent-byan-500 cursor-pointer"
        aria-label={`Enable ${title}`}
      />
      <button
        type="button"
        onClick={onExpandToggle}
        className="flex-1 flex items-center justify-between text-left"
      >
        <span className={`text-xs font-semibold ${enabled ? 'text-ink-200' : 'text-ink-500'}`}>
          {title}
        </span>
        <ChevronDown
          size={13}
          className={`text-ink-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
    </div>
  );
}

// ---------- ScopePicker ----------

interface ScopePickerProps {
  scope: Partial<ChatScope>;
  onChange: (scope: ChatScope) => void;
  projects: ByanProject[];
}

export default function ScopePicker({ scope, onChange, projects }: ScopePickerProps) {
  const s: ChatScope = { ...DEFAULT_SCOPE, ...scope };
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    project: true,
    knowledge: true,
    memory: true,
  });

  const hasType = (t: string) => (s.types ?? []).includes(t);

  const toggleType = (t: string, on: boolean) => {
    const types = on
      ? [...new Set([...(s.types ?? []), t])]
      : (s.types ?? []).filter((x) => x !== t);
    onChange({ ...s, types: types as ChatScope['types'] });
  };

  const set = <K extends keyof ChatScope>(key: K, val: ChatScope[K]) =>
    onChange({ ...s, [key]: val });

  const toggleExpand = (section: string) =>
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));

  return (
    <div className="space-y-xs">
      {/* ---------- Project ---------- */}
      <div className="border border-ink-700 rounded-xl overflow-hidden">
        <SectionHeader
          title="Project context"
          enabled={hasType('project')}
          onToggle={(on) => toggleType('project', on)}
          expanded={expandedSections.project}
          onExpandToggle={() => toggleExpand('project')}
        />
        {expandedSections.project && hasType('project') && (
          <div className="px-sm py-sm space-y-xs">
            <label className="block text-[10px] text-ink-500 uppercase tracking-wide mb-xs">
              Project
            </label>
            <select
              value={s.projectId ?? ''}
              onChange={(e) => set('projectId', e.target.value || null)}
              className="w-full bg-ink-800 border border-ink-700 rounded-lg px-xs py-xs text-xs text-ink-200 focus:outline-none focus:border-byan-500"
            >
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ---------- Knowledge ---------- */}
      <div className="border border-ink-700 rounded-xl overflow-hidden">
        <SectionHeader
          title="Knowledge"
          enabled={hasType('knowledge')}
          onToggle={(on) => toggleType('knowledge', on)}
          expanded={expandedSections.knowledge}
          onExpandToggle={() => toggleExpand('knowledge')}
        />
        {expandedSections.knowledge && hasType('knowledge') && (
          <div className="px-sm py-sm space-y-xs">
            <label className="block text-[10px] text-ink-500 uppercase tracking-wide">
              Filter by tags (optional)
            </label>
            <TagInput
              tags={s.knowledgeTags ?? []}
              onChange={(tags) => set('knowledgeTags', tags)}
              placeholder="architecture, api..."
            />
            <div className="flex items-center gap-xs mt-xs">
              <label className="text-[10px] text-ink-500 uppercase tracking-wide shrink-0">Max entries</label>
              <input
                type="number"
                min={1}
                max={50}
                value={s.knowledgeLimit ?? 10}
                onChange={(e) => set('knowledgeLimit', Number(e.target.value))}
                className="w-16 bg-ink-800 border border-ink-700 rounded-lg px-xs py-0.5 text-xs text-ink-200 focus:outline-none focus:border-byan-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* ---------- Memory ---------- */}
      <div className="border border-ink-700 rounded-xl overflow-hidden">
        <SectionHeader
          title="Memory"
          enabled={hasType('memory')}
          onToggle={(on) => toggleType('memory', on)}
          expanded={expandedSections.memory}
          onExpandToggle={() => toggleExpand('memory')}
        />
        {expandedSections.memory && hasType('memory') && (
          <div className="px-sm py-sm space-y-xs">
            <label className="block text-[10px] text-ink-500 uppercase tracking-wide">
              Filter by tags (optional)
            </label>
            <TagInput
              tags={s.memoryTags ?? []}
              onChange={(tags) => set('memoryTags', tags)}
              placeholder="sprint, decision..."
            />
            <div className="flex items-center gap-xs mt-xs">
              <label className="text-[10px] text-ink-500 uppercase tracking-wide shrink-0">Max entries</label>
              <input
                type="number"
                min={1}
                max={50}
                value={s.memoryLimit ?? 10}
                onChange={(e) => set('memoryLimit', Number(e.target.value))}
                className="w-16 bg-ink-800 border border-ink-700 rounded-lg px-xs py-0.5 text-xs text-ink-200 focus:outline-none focus:border-byan-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* ---------- Token budget ---------- */}
      <div className="flex items-center gap-xs px-xs py-xs">
        <label className="text-[10px] text-ink-500 uppercase tracking-wide shrink-0">
          Token budget
        </label>
        <input
          type="number"
          min={500}
          max={32000}
          step={500}
          value={s.tokenBudget ?? 2000}
          onChange={(e) => set('tokenBudget', Number(e.target.value))}
          className="w-20 bg-ink-800 border border-ink-700 rounded-lg px-xs py-0.5 text-xs text-ink-200 focus:outline-none focus:border-byan-500"
        />
        <span className="text-[10px] text-ink-600">tokens</span>
      </div>
    </div>
  );
}

export { DEFAULT_SCOPE };
