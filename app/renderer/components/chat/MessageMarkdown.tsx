// MessageMarkdown — renders chat message content as Markdown with the dark
// theme. Plain `<span>{content}</span>` was OK while we were prototyping but
// the moment a CLI returns lists, code blocks, headers or tables the chat
// turned into a soup of asterisks. react-markdown + remark-gfm covers
// CommonMark + GFM (tables, strikethrough, task lists) which matches what
// claude-code, copilot and codex actually emit.
//
// Why not raw HTML: the content comes from a third-party CLI; trusting its
// output as HTML would be a stored-XSS risk even inside an Electron sandbox.
// react-markdown escapes by default and we never pass `rehypeRaw`.
//
// Why not syntax-highlight code: the highlight grammar bundles add ~200 KB
// gzipped. The chat reads fine without it for now; if the user asks, we
// add `rehype-highlight` with a single dark theme stylesheet.

import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MessageMarkdownProps {
  content: string;
}

// Hoisted to module scope: the components map and remark plugins do not
// depend on props, so reusing the same references avoids reconciler churn
// every time React diffs ReactMarkdown's children — relevant during SSE
// streaming where the latest message re-renders on every token.

const REMARK_PLUGINS = [remarkGfm];

const COMPONENTS: Components = {
  // Tailwind-tuned overrides keep prose-chat compact and dark-friendly
  // without pulling in @tailwindcss/typography.
  p: ({ children }) => (
    <p className="my-1 leading-relaxed break-words whitespace-pre-wrap">
      {children}
    </p>
  ),
  a: ({ href, children }) => (
    // Open links via the typed external IPC so the renderer never
    // touches shell.openExternal directly. Falls back to a styled
    // anchor when external IPC is unavailable (e.g. test env).
    <a
      href={href ?? '#'}
      className="text-byan-300 underline hover:text-byan-200"
      onClick={(e) => {
        e.preventDefault();
        if (href && window.byanApi?.app?.openExternal) {
          void window.byanApi.app.openExternal(href);
        }
      }}
    >
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const isBlock = (className ?? '').startsWith('language-');
    if (isBlock) {
      return (
        <pre className="my-2 px-3 py-2 rounded-lg bg-ink-950 border border-ink-700 overflow-x-auto">
          <code className="font-mono text-[12px] text-ink-100 whitespace-pre">
            {children}
          </code>
        </pre>
      );
    }
    return (
      <code className="font-mono text-[12px] px-1 py-0.5 rounded bg-ink-700/60 text-byan-200">
        {children}
      </code>
    );
  },
  ul: ({ children }) => (
    <ul className="list-disc pl-5 my-1 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 my-1 space-y-0.5">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => (
    <h1 className="text-base font-semibold mt-3 mb-1 text-white">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-sm font-semibold mt-2 mb-1 text-white">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold mt-2 mb-1 text-ink-100">{children}</h3>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-byan-500/40 pl-2 my-1 text-ink-300 italic">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="text-xs border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-ink-700 px-2 py-1 bg-ink-800 text-left font-medium">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-ink-700 px-2 py-1">{children}</td>
  ),
};

function MessageMarkdownImpl({ content }: MessageMarkdownProps) {
  return (
    <div className="prose-chat">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

// Re-renders only when the markdown content string changes — non-streaming
// messages are immutable so they pay nothing while a sibling streams.
export default memo(MessageMarkdownImpl);
