import { marked } from 'marked';

export function MarkdownViewer({ source }: { source: string }) {
  const html = marked.parse(source, { async: false }) as string;
  return (
    <article
      className="markdown-body prose prose-sm max-w-none rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#d1d5db] bg-white px-6 py-5 text-[#1f2937]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
